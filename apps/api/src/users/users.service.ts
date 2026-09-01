import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type {
  CreateUserInput,
  ListUsersQuery,
  SetAnalystScopesInput,
  SetOverridesInput,
  UpdateUserInput,
} from '@neo-pulse/shared';
import { RequirementEngineService } from '../assignments/requirement-engine.service.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateInitialPassword } from './password.util.js';

/** Proyeccion estandar de usuario hacia la UI (nunca expone hashes ni tokens). */
const USER_SELECT = {
  id: true,
  documentType: true,
  documentNumber: true,
  fullName: true,
  phone: true,
  email: true,
  emailKind: true,
  mustChangePassword: true,
  hiredAt: true,
  birthDate: true,
  employmentType: true,
  roadActor: true,
  active: true,
  lastLogin: true,
  createdAt: true,
  jobTitle: { select: { id: true, code: true, name: true } },
  area: { select: { id: true, code: true, name: true } },
  regional: { select: { id: true, code: true, name: true } },
  service: { select: { id: true, code: true, name: true } },
  role: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requirements: RequirementEngineService,
  ) {}

  /** Lo minimo para poder elegir a una persona en un selector. Ver el controlador. */
  async pickable() {
    return this.prisma.scoped.user.findMany({
      where: { deletedAt: null, active: true },
      select: {
        id: true,
        fullName: true,
        jobTitle: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
        regional: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async list(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.active ? { active: query.active === 'true' } : {}),
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.roleCode ? { role: { code: query.roleCode } } : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { documentNumber: { contains: query.q } },
              { email: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.scoped.user.count({ where }),
      this.prisma.scoped.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async getById(id: string) {
    const user = await this.prisma.scoped.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_SELECT,
        habeasDataConsentAt: true,
        esignAgreementAt: true,
        overrides: { select: { granted: true, permission: { select: { code: true } } } },
        analystScopes: {
          select: {
            id: true,
            process: { select: { id: true, code: true, name: true } },
            area: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return user;
  }

  /**
   * Crea un usuario. Si no llega contrasena, GENERA una segura (patron cedula + caracteres,
   * Decision de negocio 3.3) y la devuelve UNA sola vez. Siempre mustChangePassword=true.
   */
  async create(actor: AuthUser, input: CreateUserInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertUnique(input.documentNumber, input.email);

    const role = await this.prisma.scoped.role.findFirst({ where: { code: input.roleCode } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });

    const generatedPassword = input.password ? null : generateInitialPassword(input.documentNumber);
    const passwordHash = await argon2.hash(input.password ?? (generatedPassword as string));

    const user = await this.prisma.scoped.user.create({
      data: {
        tenantId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email,
        emailKind: input.emailKind,
        passwordHash,
        mustChangePassword: true,
        jobTitleId: input.jobTitleId,
        areaId: input.areaId,
        regionalId: input.regionalId ?? null,
        serviceId: input.serviceId ?? null,
        roleId: role.id,
        hiredAt: input.hiredAt ? new Date(`${input.hiredAt}T00:00:00-05:00`) : null,
        birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00-05:00`) : null,
        employmentType: input.employmentType,
        roadActor: input.roadActor ?? null,
        createdBy: actor.id,
      },
      select: USER_SELECT,
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'USER_CREATED',
      resourceType: 'users',
      resourceId: user.id,
      newValues: { documentNumber: input.documentNumber, email: input.email, roleCode: input.roleCode },
    });

    // Al entrar alguien, sus obligaciones formativas nacen SOLAS: la induccion general con
    // vencimiento antes de su fecha de ingreso (D1072) y las especificas de su cargo. Si el
    // motor fallara, el alta no se pierde: el cron de requisitos lo recupera en la proxima hora.
    await this.requirements.syncPersonSafely(tenantId, user.id);

    // La contrasena generada viaja UNA vez; solo persiste el hash.
    return { user, generatedPassword };
  }

  async update(actor: AuthUser, id: string, input: UpdateUserInput) {
    const before = await this.prisma.scoped.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!before) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    if (input.email && input.email !== before.email) {
      await this.assertUnique(null, input.email);
    }

    let roleId: string | undefined;
    if (input.roleCode) {
      const role = await this.prisma.scoped.role.findFirst({ where: { code: input.roleCode } });
      if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
      roleId = role.id;
    }

    const user = await this.prisma.scoped.user.update({
      where: { id },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        // Cambio de correo (personal -> corporativo): NO rompe cuenta ni historico (Decision #10).
        email: input.email,
        emailKind: input.emailKind,
        jobTitleId: input.jobTitleId,
        areaId: input.areaId,
        regionalId: input.regionalId,
        serviceId: input.serviceId,
        roleId,
        hiredAt: input.hiredAt === undefined ? undefined : input.hiredAt ? new Date(`${input.hiredAt}T00:00:00-05:00`) : null,
        birthDate:
          input.birthDate === undefined ? undefined : input.birthDate ? new Date(`${input.birthDate}T00:00:00-05:00`) : null,
        employmentType: input.employmentType,
        roadActor: input.roadActor,
        active: input.active,
      },
      select: USER_SELECT,
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'USER_UPDATED',
      resourceType: 'users',
      resourceId: id,
      oldValues: before,
      newValues: input,
    });

    // Cambiar de cargo, area, regional, vinculacion o fecha de ingreso cambia a que audiencias
    // pertenece la persona, y con ello lo que se le exige (Decision #33). Se recalcula al
    // instante para que la matriz de competencia no quede mintiendo hasta el proximo cron.
    const affectsAudiences =
      input.jobTitleId !== undefined ||
      input.areaId !== undefined ||
      input.regionalId !== undefined ||
      input.employmentType !== undefined ||
      input.roadActor !== undefined ||
      input.hiredAt !== undefined ||
      input.active !== undefined;
    if (affectsAudiences) {
      await this.requirements.syncPersonSafely(this.prisma.currentTenantId, id);
    }
    return user;
  }

  /**
   * Regenera la contrasena (a peticion del usuario, la ejecuta el admin — negocio 3.3).
   * Devuelve la nueva UNA sola vez y fuerza el cambio en el proximo ingreso.
   */
  async resetPassword(actor: AuthUser, id: string) {
    const user = await this.prisma.scoped.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, documentNumber: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    /*
      NADIE SE RESTABLECE LA CONTRASENA A SI MISMO (Decision #95).

      Esto no es teorico: paso cinco veces en una tarde. Alguien que no puede entrar va a Usuarios,
      se busca, pulsa "Restablecer contrasena" —que genera una ALEATORIA, la ensena UNA vez y
      obliga a cambiarla— y si no la copia se queda fuera otra vez. Y al reintentar, cada pulsacion
      invalida la anterior: se hunde mas.

      Es la unica accion de esa pantalla que puede dejar fuera a quien la pulsa, y para uno mismo
      NUNCA es la correcta: para eso esta "Cambiar contrasena", que pide la actual, no genera nada
      aleatorio y no cierra tu propia sesion.
    */
    if (id === actor.id) {
      throw new ConflictException({
        code: 'CANNOT_RESET_OWN_PASSWORD',
        message:
          'No puedes restablecer tu propia contrasena aqui: te dejaria fuera con una generada al azar. Usa "Cambiar contrasena" desde tu perfil.',
      });
    }

    const generatedPassword = generateInitialPassword(user.documentNumber);
    await this.prisma.scoped.user.update({
      where: { id },
      data: {
        passwordHash: await argon2.hash(generatedPassword),
        mustChangePassword: true,
        refreshTokenHash: null, // cierra sesiones vivas
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'USER_PASSWORD_RESET',
      resourceType: 'users',
      resourceId: id,
    });
    return { generatedPassword };
  }

  /** Overrides individuales: reemplaza el set completo (patron RBAC + overrides). */
  async setOverrides(actor: AuthUser, id: string, input: SetOverridesInput) {
    const tenantId = this.prisma.currentTenantId;
    const user = await this.prisma.scoped.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    const codes = input.overrides.map((o) => o.permissionCode);
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(permissions.map((p) => [p.code, p.id]));
    const missing = codes.filter((c) => !byCode.has(c));
    if (missing.length > 0) throw new NotFoundException({ code: 'PERMISSION_NOT_FOUND', missing });

    await this.prisma.tx(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
      if (input.overrides.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: input.overrides.map((o) => ({
            userId: id,
            permissionId: byCode.get(o.permissionCode) as string,
            tenantId,
            granted: o.granted,
            setBy: actor.id,
          })),
        });
      }
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'USER_OVERRIDES_SET',
      resourceType: 'users',
      resourceId: id,
      newValues: input.overrides,
    });
    return { ok: true as const };
  }

  /** Ambitos del Analista (que procesos/areas gestiona): reemplaza el set completo. */
  async setAnalystScopes(actor: AuthUser, id: string, input: SetAnalystScopesInput) {
    const tenantId = this.prisma.currentTenantId;
    const user = await this.prisma.scoped.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    await this.prisma.tx(async (tx) => {
      await tx.analystScope.deleteMany({ where: { userId: id } });
      if (input.scopes.length > 0) {
        await tx.analystScope.createMany({
          data: input.scopes.map((s) => ({
            tenantId,
            userId: id,
            processId: s.processId ?? null,
            areaId: s.areaId ?? null,
          })),
        });
      }
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ANALYST_SCOPES_SET',
      resourceType: 'users',
      resourceId: id,
      newValues: input.scopes,
    });
    return { ok: true as const };
  }

  private async assertUnique(documentNumber: string | null, email: string | null): Promise<void> {
    const clashes: Prisma.UserWhereInput[] = [];
    if (documentNumber) clashes.push({ documentNumber });
    if (email) clashes.push({ email });
    if (clashes.length === 0) return;
    const existing = await this.prisma.scoped.user.findFirst({ where: { OR: clashes }, select: { id: true, documentNumber: true, email: true } });
    if (existing) {
      throw new ConflictException({
        code: existing.documentNumber === documentNumber ? 'DUPLICATE_DOCUMENT' : 'DUPLICATE_EMAIL',
      });
    }
  }
}
