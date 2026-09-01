import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_MS = 30_000;
const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5);
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES ?? 15);

export interface PlatformLoginResult {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: { id: string; email: string; fullName: string };
}

export interface PlatformContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Ingreso de la capa de plataforma (Decision #100).
 *
 * Repite la mecanica del ingreso de tenant —argon2, bloqueo por cuenta, refresco opaco rotado con
 * ventana de gracia— sobre sus propias tablas. Se valoro extraer una pieza comun y no compensa: lo
 * unico que de verdad se comparte son cuatro constantes, y el ingreso de tenant tiene encima toda
 * la resolucion de empresa, el cambio forzado de contrasena y las aceptaciones de primer ingreso,
 * que aqui no existen. Una abstraccion que hay que parametrizar en cinco sitios para cubrir dos
 * casos deja los dos peor de lo que estaban.
 *
 * NO HAY LIMITE POR IP AQUI y es deliberado: no se anuncia en ningun sitio, lo usan dos personas y
 * el bloqueo por cuenta (5 fallos, 15 minutos) es la defensa que aplica. El limite global del
 * servidor sigue puesto por encima.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, ctx: PlatformContext = {}): Promise<PlatformLoginResult> {
    const user = await this.prisma.platformUser.findUnique({ where: { email: email.toLowerCase() } });
    // Mismo error para "no existe" y para "contrasena mala": lo contrario dice si una direccion
    // tiene cuenta de proveedor, que es informacion util para quien quiera atacarla.
    if (!user || !user.active) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED' });
    }

    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      await this.prisma.platformUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.prisma.platformSession.create({
      data: {
        platformUserId: user.id,
        tokenHash: this.hash(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    // Higiene: sin esto la tabla solo crece.
    await this.prisma.platformSession
      .deleteMany({ where: { platformUserId: user.id, expiresAt: { lte: new Date() } } })
      .catch(() => undefined);

    return this.resultado(session.id, user, refreshToken);
  }

  async refresh(sessionId: string, token: string): Promise<PlatformLoginResult> {
    const session = await this.prisma.platformSession.findUnique({
      where: { id: sessionId },
      include: { platformUser: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    }
    if (!session.platformUser.active) throw new UnauthorizedException({ code: 'INVALID_REFRESH' });

    const presentado = this.hash(token);
    const vigente = this.igual(presentado, session.tokenHash);
    // La ventana de gracia: dos pestanas que refrescan a la vez no se tumban entre si.
    const enGracia =
      !!session.previousHash &&
      !!session.previousValidUntil &&
      session.previousValidUntil.getTime() > Date.now() &&
      this.igual(presentado, session.previousHash);
    if (!vigente && !enGracia) throw new UnauthorizedException({ code: 'INVALID_REFRESH' });

    const nuevo = randomBytes(48).toString('base64url');
    await this.prisma.platformSession.update({
      where: { id: sessionId },
      data: {
        tokenHash: this.hash(nuevo),
        previousHash: session.tokenHash,
        previousValidUntil: new Date(Date.now() + GRACE_MS),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return this.resultado(sessionId, session.platformUser, nuevo);
  }

  /** Cierra SOLO esa sesion: las de los otros aparatos siguen vivas. */
  async logout(sessionId: string): Promise<void> {
    await this.prisma.platformSession.deleteMany({ where: { id: sessionId } });
  }

  private resultado(
    sessionId: string,
    user: { id: string; email: string; fullName: string },
    refreshToken: string,
  ): PlatformLoginResult {
    /*
      `scope: 'platform'` y SIN `tenantId`, que es lo que separa las dos clases de token.

      Sin el scope, un token de tenant serviria aqui. Sin la ausencia de tenantId, este serviria
      alla —y ahi RLS no sabria a que empresa acotar—. Las dos mitades son necesarias.
    */
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.fullName,
      scope: 'platform',
      sessionId,
    });
    return {
      accessToken,
      refreshToken,
      sessionId,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    };
  }

  /**
   * SHA-256 y no argon2, igual que en los tenants: es un secreto ALEATORIO de 384 bits, donde
   * argon2 no aporta nada y cuesta cientos de milisegundos. Para las contrasenas si es argon2.
   */
  private hash(token: string): string {
    // Mismo formato con punto que en los tenants: no se comparten filas, pero si se comparte el
    // pepper, y dos formas distintas de mezclarlo con el mismo secreto es de lo que despues nadie
    // se acuerda al rotarlo.
    return createHash('sha256')
      .update(`${token}.${process.env.REFRESH_TOKEN_PEPPER ?? ''}`)
      .digest('hex');
  }

  /** Comparacion en tiempo constante: comparar hashes con `===` filtra por cuanto tarda. */
  private igual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
