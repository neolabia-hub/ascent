import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditService } from '../common/audit.service.js';
import type { JwtPayload } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuthUserView {
  id: string;
  fullName: string;
  /** `null` = sin correo: esa persona entra con su cedula. */
  email: string | null;
  mustChangePassword: boolean;
  activated: boolean;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  refreshToken: string; // el controller lo pone en cookie httpOnly (sessionId.tenantId.token)
  /** Cual de las sesiones de esta persona es (Decision #91). Viaja en la cookie. */
  sessionId: string;
  user: AuthUserView;
}

/** Contexto de la peticion (IP/UA) para el rastro de auditoria. */
export interface AuthContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Anti-fuerza-bruta: bloqueo por CUENTA (ademas del rate limit por IP del edge).
const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5);
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES ?? 15);

/** Lo que dura una sesion sin usarse. Coincide con la cookie del controlador. */
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Ventana en la que el token ANTERIOR sigue valiendo tras rotar. Ver `rotarSesion`. */
const GRACE_MS = 30_000;

/** Una sola solicitud de ayuda por cuenta cada seis horas. Ver solicitarAyudaDeIngreso. */
const SOLICITUD_AYUDA_MS = 6 * 60 * 60 * 1000;

// Versiones vigentes de las politicas aceptadas en la activacion (quedan registradas por usuario).
const HABEAS_DATA_POLICY_VERSION = process.env.HABEAS_DATA_POLICY_VERSION ?? '1.0';
const ESIGN_AGREEMENT_VERSION = process.env.ESIGN_AGREEMENT_VERSION ?? '1.0';

type ThrottledUser = {
  id: string;
  tenantId: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Login multi-tenant (Decision #32): el tenant llega RESUELTO (slug del subdominio), asi que
   * el usuario se busca con clave compuesta (tenant + cedula | tenant + email) BAJO RLS via
   * forTenant — sin cliente owner ni ambiguedad de cedulas repetidas entre tenants.
   * El identificador es cedula o correo, indistinto (Decision #10).
   */
  async login(tenantSlug: string, identifier: string, password: string, ctx: AuthContext = {}): Promise<LoginResult> {
    // `tenants` no esta bajo RLS (no tiene tenant_id): el rol de app puede resolver el slug.
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.active) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });

    const scoped = this.prisma.forTenant(tenant.id);
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await scoped.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: identifier.toLowerCase() } },
        })
      : await scoped.user.findUnique({
          where: { tenantId_documentNumber: { tenantId: tenant.id, documentNumber: identifier } },
        });
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    // Cuenta bloqueada: rechazar sin verificar contrasena.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      await this.audit.record({
        tenantId: tenant.id,
        userId: user.id,
        action: 'ACCOUNT_LOCKED',
        resourceType: 'auth',
        resourceId: user.id,
        newValues: { identifier, retryAfter },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', message: 'Cuenta bloqueada temporalmente por intentos fallidos.', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.registerFailedAttempt(user, identifier, ctx);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma
        .forTenant(tenant.id)
        .user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }
    await this.audit.record({
      tenantId: tenant.id,
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resourceType: 'auth',
      resourceId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return this.abrirSesion(user.id, tenant.id, ctx);
  }

  /**
   * ROTA EL TOKEN DE **ESA** SESION, no el unico del usuario (Decision #91).
   *
   * Y acepta el token ANTERIOR durante unos segundos. Sin esa gracia, dos pestanas que refrescan a
   * la vez se tumban entre si: la primera rota, la segunda presenta el viejo y se queda fuera. Es
   * el fallo que se veia como "se cerro la sesion sola" en mitad del trabajo.
   */
  async refresh(sessionId: string, tenantId: string, presentedToken: string): Promise<LoginResult> {
    const scoped = this.prisma.forTenant(tenantId);
    const session = await scoped.userSession
      .findUnique({ where: { id: sessionId }, include: { user: true } })
      .catch(() => null);
    if (!session || !session.user.active || session.user.deletedAt) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await scoped.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
      throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    }

    const presentado = this.hashRefresh(presentedToken);
    const coincide = (esperado: string | null) => {
      if (!esperado) return false;
      const a = Buffer.from(esperado, 'hex');
      const b = Buffer.from(presentado, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    };
    const enGracia =
      session.previousValidUntil !== null &&
      session.previousValidUntil.getTime() > Date.now() &&
      coincide(session.previousHash);

    if (!coincide(session.tokenHash) && !enGracia) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    }

    return this.rotarSesion(session.id, session.userId, tenantId);
  }

  /** Cierra SOLO la sesion desde la que se pulsa: las de los otros aparatos siguen vivas. */
  async logout(sessionId: string | null, tenantId: string): Promise<void> {
    if (!sessionId) return;
    await this.prisma
      .forTenant(tenantId)
      .userSession.delete({ where: { id: sessionId } })
      .catch(() => undefined);
  }

  /**
   * Auto-servicio: cambia la contrasena verificando la actual y limpia el flag de cambio forzado.
   *
   * Y CIERRA LAS DEMAS SESIONES (Decision #93). Cambiar la contrasena es, casi siempre, el gesto
   * de "creo que alguien entro en mi cuenta": si las sesiones abiertas en otros aparatos
   * sobreviven, el cambio no sirve de nada —quien estuviera dentro sigue dentro, con su token de
   * refresco intacto durante siete dias—. La de quien lo pide se respeta, porque echarse a uno
   * mismo al cambiar la contrasena es un final absurdo.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    sessionId: string | null = null,
  ): Promise<{ ok: true; sesionesCerradas: number }> {
    const user = await this.prisma.scoped.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw new UnauthorizedException({ code: 'USER_NOT_FOUND' });
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new BadRequestException({ code: 'INVALID_CURRENT_PASSWORD' });

    // La misma no se admite: dejaria el flag de cambio forzado limpio sin haber cambiado nada.
    if (await argon2.verify(user.passwordHash, newPassword).catch(() => false)) {
      throw new BadRequestException({
        code: 'SAME_PASSWORD',
        message: 'La contraseña nueva no puede ser la misma que la actual.',
      });
    }

    await this.prisma.scoped.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword), mustChangePassword: false },
    });
    const { count } = await this.prisma.scoped.userSession.deleteMany({
      where: { userId, ...(sessionId ? { id: { not: sessionId } } : {}) },
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId,
      action: 'PASSWORD_CHANGED',
      resourceType: 'auth',
      resourceId: userId,
      newValues: { sesionesCerradas: count },
    });
    return { ok: true, sesionesCerradas: count };
  }

  /**
   * Activacion de cuenta: registra Habeas Data (Ley 1581/2012) y el acuerdo de firma electronica
   * (D2364/2012 art. 5) con version y timestamp. Este acuerdo es lo que da valor probatorio a las
   * asistencias y evaluaciones digitales (Decision #15).
   */
  async activate(userId: string, tenantId: string, ctx: AuthContext = {}): Promise<{ ok: true }> {
    const now = new Date();
    await this.prisma.forTenant(tenantId).user.update({
      where: { id: userId },
      data: {
        habeasDataConsentAt: now,
        habeasDataVersion: HABEAS_DATA_POLICY_VERSION,
        esignAgreementAt: now,
        esignAgreementVersion: ESIGN_AGREEMENT_VERSION,
      },
    });
    await this.audit.record({
      tenantId,
      userId,
      action: 'ACCOUNT_ACTIVATED',
      resourceType: 'auth',
      resourceId: userId,
      newValues: { habeasDataVersion: HABEAS_DATA_POLICY_VERSION, esignVersion: ESIGN_AGREEMENT_VERSION },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { ok: true };
  }

  async me(
    userId: string,
    tenantId: string,
  ): Promise<AuthUserView & { permissions: string[]; jobTitle: string | null; avatarKey: string | null }> {
    const user = await this.prisma.forTenant(tenantId).user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        // EL CARGO, para la barra superior (Decision #92). El nombre a secas no dice quien es
        // alguien dentro de la empresa; "Auxiliar de Bodega" si, y ademas es lo que explica por
        // que le tocan justo esas formaciones.
        jobTitle: { select: { name: true } },
      },
    });
    return {
      ...this.toView(user),
      permissions: user.role.permissions.map((rp) => rp.permission.code),
      jobTitle: user.jobTitle?.name ?? null,
      // La clave, no la URL firmada: la firma caduca y este perfil se cachea en el cliente.
      avatarKey: user.avatarKey,
    };
  }

  /**
   * Guarda (o quita) la foto de perfil de la propia persona.
   *
   * No borra el fichero anterior del almacen: los medios se limpian por barrido, y borrar aqui
   * significaria que un fallo al escribir la fila deja una foto huerfana referenciada por nadie —o
   * peor, una fila apuntando a un fichero que ya no existe—.
   */
  async setAvatar(userId: string, tenantId: string, avatarKey: string | null): Promise<{ avatarKey: string | null }> {
    const user = await this.prisma
      .forTenant(tenantId)
      .user.update({ where: { id: userId }, data: { avatarKey }, select: { avatarKey: true } });
    return { avatarKey: user.avatarKey };
  }

  private async registerFailedAttempt(user: ThrottledUser, identifier: string, ctx: AuthContext): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    // Al bloquear, reinicia el contador y fija lockedUntil; al expirar el bloqueo cuenta desde cero.
    await this.prisma.forTenant(user.tenantId).user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      resourceType: 'auth',
      resourceId: user.id,
      newValues: { identifier, attempts, locked: lock },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /** Abre una sesion NUEVA. Las que ya tuviera esta persona siguen vivas (Decision #91). */
  private async abrirSesion(userId: string, tenantId: string, ctx: AuthContext = {}): Promise<LoginResult> {
    const scoped = this.prisma.forTenant(tenantId);
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await scoped.userSession.create({
      data: {
        tenantId,
        userId,
        tokenHash: this.hashRefresh(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    // Higiene: se retiran las caducadas de esta persona. Sin esto la tabla solo crece.
    await scoped.userSession
      .deleteMany({ where: { userId, expiresAt: { lte: new Date() } } })
      .catch(() => undefined);
    return this.armarResultado(session.id, userId, tenantId, refreshToken);
  }

  /**
   * Rota el token de una sesion existente, dejando el anterior valido unos segundos.
   *
   * Esa gracia es lo que permite que dos peticiones que caducan a la vez refresquen sin tumbarse:
   * la segunda llega con el token que la primera acaba de rotar y aun asi entra.
   */
  private async rotarSesion(sessionId: string, userId: string, tenantId: string): Promise<LoginResult> {
    const scoped = this.prisma.forTenant(tenantId);
    const refreshToken = randomBytes(48).toString('base64url');
    const anterior = await scoped.userSession.findUnique({ where: { id: sessionId }, select: { tokenHash: true } });
    await scoped.userSession.update({
      where: { id: sessionId },
      data: {
        tokenHash: this.hashRefresh(refreshToken),
        previousHash: anterior?.tokenHash ?? null,
        previousValidUntil: new Date(Date.now() + GRACE_MS),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return this.armarResultado(sessionId, userId, tenantId, refreshToken);
  }

  private async armarResultado(
    sessionId: string,
    userId: string,
    tenantId: string,
    refreshToken: string,
  ): Promise<LoginResult> {
    const scoped = this.prisma.forTenant(tenantId);
    const user = await scoped.user.findUniqueOrThrow({ where: { id: userId } });
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      email: user.email,
      sessionId,
    };
    const accessToken = await this.jwt.signAsync(payload);
    await scoped.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    return {
      accessToken,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshToken,
      sessionId,
      user: this.toView(user),
    };
  }

  private toView(user: {
    id: string;
    fullName: string;
    /** `null` = sin correo. Esa persona entra con su cedula (Decision #10). */
    email: string | null;
    mustChangePassword: boolean;
    habeasDataConsentAt: Date | null;
    esignAgreementAt: Date | null;
  }): AuthUserView {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      activated: Boolean(user.habeasDataConsentAt && user.esignAgreementAt),
    };
  }

  private pepper(token: string): string {
    return `${token}.${process.env.REFRESH_TOKEN_PEPPER ?? ''}`;
  }

  /**
   * SHA-256 (+pepper) para el refresh token: es un secreto ALEATORIO de 384 bits, no necesita un
   * KDF lento como argon2 (que solo aporta contra contrasenas de baja entropia). Microsegundos
   * por refresh en vez de cientos de ms — critico en 1 vCPU (leccion de SAC-NEO en produccion).
   */
  private hashRefresh(token: string): string {
    return createHash('sha256').update(this.pepper(token)).digest('hex');
  }

  /**
   * "NO PUEDO ENTRAR": avisar a quien administra, sin contar nada a quien pregunta (Decision #97).
   *
   * Es la mitad activa de la pantalla de olvido. La otra mitad —el telefono y el correo de quien
   * administra— sirve para la persona que tiene a mano a esa persona; esta sirve para la que no:
   * el conductor a las cinco de la mañana, que no va a llamar a nadie y lo unico que quiere es
   * dejar constancia de que necesita una contrasena nueva.
   *
   * NO ES una recuperacion automatica y no manda ninguna contrasena. Deja una notificacion en la
   * bandeja de quien puede restablecerla, con la cedula tal cual se escribio, y ahi para: la
   * decision de restablecer sigue siendo de una persona, que es lo unico defendible mientras no
   * haya un correo verificado con el que comprobar quien pide.
   *
   * TRES REGLAS, y las tres importan:
   *
   * 1. RESPONDE SIEMPRE LO MISMO, exista la cedula o no. Si dijera "esa cedula no existe", esta
   *    pantalla —abierta, sin sesion— seria un comprobador de quien trabaja en la empresa: se le
   *    tiran las seiscientas cedulas y se obtiene la nomina.
   * 2. SOLO AVISA SI LA CUENTA EXISTE. Con cedulas inventadas no se crea nada, asi que no se puede
   *    llenar la bandeja de quien administra con ruido desde fuera.
   * 3. UNA CADA SEIS HORAS por cuenta. Sin esto, quien conozca una cedula de verdad —y dentro de
   *    la empresa se conocen— puede repetir el envio hasta enterrar la bandeja. Y no hace falta
   *    mas: la respuesta a esto es una llamada, no un segundo aviso.
   */
  async solicitarAyudaDeIngreso(tenantSlug: string, identifier: string, ctx: AuthContext = {}): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant || !tenant.active) return;

    const scoped = this.prisma.forTenant(tenant.id);
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await scoped.user.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: identifier.toLowerCase() } },
        })
      : await scoped.user.findUnique({
          where: { tenantId_documentNumber: { tenantId: tenant.id, documentNumber: identifier } },
        });
    if (!user || !user.active || user.deletedAt) return;

    const desde = new Date(Date.now() - SOLICITUD_AYUDA_MS);
    const yaHay = await scoped.notification.findFirst({
      where: {
        eventType: 'PASSWORD_HELP_REQUESTED',
        referenceType: 'user',
        referenceId: user.id,
        createdAt: { gte: desde },
      },
      select: { id: true },
    });
    if (yaHay) return;

    const quien = user.fullName.trim() || user.documentNumber;
    await this.notifications.notifyByPermission(tenant.id, 'users:manage', {
      eventType: 'PASSWORD_HELP_REQUESTED',
      channels: ['IN_APP'],
      subject: 'Alguien no puede entrar',
      // Dice QUIEN y DESDE DONDE, porque es lo que permite reconocer un aviso raro: una solicitud
      // a nombre de alguien del turno de la mañana llegando de madrugada desde otra IP.
      body: `${quien} (${user.documentNumber}) pidio ayuda para entrar. Si lo reconoces, restablece su contrasena desde Usuarios. Origen: ${ctx.ipAddress ?? 'IP desconocida'}.`,
      referenceType: 'user',
      referenceId: user.id,
    });

    await this.audit.record({
      tenantId: tenant.id,
      userId: user.id,
      action: 'PASSWORD_HELP_REQUESTED',
      resourceType: 'auth',
      resourceId: user.id,
      newValues: { identifier },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

}
