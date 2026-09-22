import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Contratos locales de Roles. No viven en `@neo-pulse/shared` porque no los consume ningun
 * formulario dinamico fuera de la pantalla de Roles (a diferencia de los catalogos, que alimentan
 * selects en todo el resto de la app) — se validan aqui mismo, junto al handler.
 */
const roleCodeSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[A-Z0-9_]+$/, 'Solo mayusculas, numeros y guion bajo');

const createRoleSchema = z.object({
  code: roleCodeSchema,
  name: z.string().min(2).max(120),
  permissionCodes: z.array(z.string().min(3).max(80)).max(200).default([]),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  active: z.boolean().optional(),
  permissionCodes: z.array(z.string().min(3).max(80)).max(200).optional(),
});

interface RoleView {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  permissionCodes: string[];
  /** Tipos de formacion que puede tocar. **Vacio = sin acotar**, puede con todos (2026-09-22). */
  activityTypeIds: string[];
  userCount: number;
}

/**
 * Roles + permisos del tenant (CLAUDE.md 3.4/seccion 7). Los roles semilla (ADMIN, ANALISTA,
 * USUARIO) son `isSystem=true`: el admin puede reajustar QUE permisos traen por defecto
 * (`permissionCodes`), pero no renombrarlos, desactivarlos ni borrarlos — son la base del RBAC
 * y varias rutas del producto asumen que existen.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.scoped.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { select: { permission: { select: { code: true } } } },
        // Los tipos que puede tocar viajan en la MISMA llamada (2026-09-22): la pantalla de
        // Permisos los pinta como unas filas mas de la matriz, y pedirlos rol por rol seria una
        // peticion por columna para dibujar una tabla que ya se esta dibujando.
        activityTypeScopes: { select: { activityTypeId: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      active: role.active,
      permissionCodes: role.permissions.map((rp) => rp.permission.code),
      /** Vacio = **sin acotar**: ese rol puede con todos los tipos. */
      activityTypeIds: role.activityTypeScopes.map((scope) => scope.activityTypeId),
      userCount: role._count.users,
    }));
  }

  /** Catalogo GLOBAL de permisos (sin tenant_id, sin RLS): base para armar la pantalla de roles. */
  async listPermissions(): Promise<Array<{ code: string; category: string; description: string }>> {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      select: { code: true, category: true, description: true },
    });
  }

  async create(body: unknown, user: AuthUser): Promise<RoleView> {
    const input = createRoleSchema.parse(body);
    const tenantId = this.prisma.currentTenantId;
    const permissions = await this.resolvePermissions(input.permissionCodes);

    try {
      const role = await this.prisma.tx(async (tx) => {
        const created = await tx.role.create({
          data: { tenantId, code: input.code, name: input.name, isSystem: false, active: true },
        });
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({ roleId: created.id, permissionId: permission.id, tenantId })),
          });
        }
        return created;
      });

      await this.audit.record({
        tenantId,
        userId: user.id,
        action: 'ROLE_CREATED',
        resourceType: 'roles',
        resourceId: role.id,
        newValues: { code: role.code, name: role.name, permissionCodes: input.permissionCodes },
      });

      return {
        id: role.id,
        code: role.code,
        name: role.name,
        isSystem: role.isSystem,
        active: role.active,
        permissionCodes: permissions.map((permission) => permission.code),
        // Un rol nace SIN ACOTAR: puede con todos los tipos hasta que alguien lo limite.
        activityTypeIds: [],
        userCount: 0,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw new ConflictException({ code: 'DUPLICATE_CODE' });
      throw error;
    }
  }

  async update(id: string, body: unknown, user: AuthUser): Promise<RoleView> {
    const input = updateRoleSchema.parse(body);
    const tenantId = this.prisma.currentTenantId;

    const existing = await this.prisma.scoped.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: { select: { code: true } } } },
        // Se traen para devolverlos tal cual: renombrar o cambiar permisos NO toca el alcance por
        // tipo, que se fija en su propia ruta. Sin esto, la respuesta diria «sin acotar» y la
        // pantalla borraria las casillas al refrescar.
        activityTypeScopes: { select: { activityTypeId: true } },
        _count: { select: { users: true } },
      },
    });
    if (!existing) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });

    // Roles semilla: solo se ajustan sus permisos por defecto, nunca nombre/estado (Decision RBAC).
    if (existing.isSystem && (input.name !== undefined || input.active !== undefined)) {
      throw new ForbiddenException({ code: 'SYSTEM_ROLE' });
    }

    const oldValues = {
      name: existing.name,
      active: existing.active,
      permissionCodes: existing.permissions.map((rp) => rp.permission.code),
    };

    const newPermissions =
      input.permissionCodes !== undefined ? await this.resolvePermissions(input.permissionCodes) : null;

    const updated = await this.prisma.tx(async (tx) => {
      const role = await tx.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.active !== undefined && { active: input.active }),
        },
      });
      if (newPermissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (newPermissions.length > 0) {
          await tx.rolePermission.createMany({
            data: newPermissions.map((permission) => ({ roleId: id, permissionId: permission.id, tenantId })),
          });
        }
      }
      return role;
    });

    const newValues = {
      name: updated.name,
      active: updated.active,
      permissionCodes: newPermissions ? newPermissions.map((permission) => permission.code) : oldValues.permissionCodes,
    };

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'ROLE_UPDATED',
      resourceType: 'roles',
      resourceId: id,
      oldValues,
      newValues,
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      isSystem: updated.isSystem,
      active: updated.active,
      permissionCodes: newValues.permissionCodes,
      // Renombrar o cambiar permisos NO toca el alcance por tipo: se fija en su propia ruta.
      activityTypeIds: existing.activityTypeScopes.map((scope) => scope.activityTypeId),
      userCount: existing._count.users,
    };
  }

  async remove(id: string, user: AuthUser): Promise<{ ok: true }> {
    const tenantId = this.prisma.currentTenantId;
    const existing = await this.prisma.scoped.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    if (existing.isSystem) throw new ForbiddenException({ code: 'SYSTEM_ROLE' });
    if (existing._count.users > 0) throw new ConflictException({ code: 'ROLE_IN_USE' });

    await this.prisma.scoped.role.delete({ where: { id } });
    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'ROLE_DELETED',
      resourceType: 'roles',
      resourceId: id,
      oldValues: { code: existing.code, name: existing.name },
    });
    return { ok: true };
  }

  /** QUE TIPOS DE FORMACION PUEDE TOCAR ESTE ROL (2026-09-22). Lista vacia = sin acotar. */
  async tiposDelRol(roleId: string) {
    const filas = await this.prisma.scoped.roleActivityTypeScope.findMany({
      where: { roleId },
      select: { activityType: { select: { id: true, code: true, name: true } } },
    });
    return {
      activityTypeIds: filas.map((fila) => fila.activityType.id),
      tipos: filas.map((fila) => fila.activityType),
    };
  }

  /**
   * Fija el conjunto ENTERO. Se borra y se reescribe dentro de una transaccion: con altas y bajas
   * sueltas, dos pestañas abiertas dejan un estado que no eligio nadie.
   *
   * **Guardar la lista vacia DESACOTA el rol**, y tiene que ser asi: es la unica forma de devolverle
   * el acceso a todo a un rol que se acoto por error. Si «vacio» significara «ninguno», no habria
   * manera de deshacerlo desde la pantalla.
   */
  async fijarTiposDelRol(roleId: string, activityTypeIds: string[], actor: AuthUser) {
    const tenantId = this.prisma.currentTenantId;
    const role = await this.prisma.scoped.role.findUnique({ where: { id: roleId }, select: { id: true, code: true } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });

    const unicos = [...new Set(activityTypeIds)];
    if (unicos.length > 0) {
      // Que existan y sean de este tenant: el id viaja desde la pantalla y no se da por bueno.
      const existentes = await this.prisma.scoped.activityType.findMany({
        where: { id: { in: unicos } },
        select: { id: true },
      });
      if (existentes.length !== unicos.length) {
        throw new BadRequestException({ code: 'INVALID_ACTIVITY_TYPE_IDS' });
      }
    }

    await this.prisma.tx(async (tx) => {
      await tx.roleActivityTypeScope.deleteMany({ where: { roleId } });
      if (unicos.length > 0) {
        await tx.roleActivityTypeScope.createMany({
          data: unicos.map((activityTypeId) => ({ tenantId, roleId, activityTypeId, setBy: actor.id })),
        });
      }
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ROLE_ACTIVITY_TYPES_SET',
      resourceType: 'roles',
      resourceId: roleId,
      newValues: { roleCode: role.code, activityTypeIds: unicos, acotado: unicos.length > 0 },
    });

    return { activityTypeIds: unicos };
  }

  /** Resuelve codigos de permiso contra el catalogo global; rechaza codigos inexistentes. */
  private async resolvePermissions(codes: string[]): Promise<Array<{ id: string; code: string }>> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return [];
    const found = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
      select: { id: true, code: true },
    });
    if (found.length !== unique.length) {
      const foundCodes = new Set(found.map((permission) => permission.code));
      const invalid = unique.filter((code) => !foundCodes.has(code));
      throw new BadRequestException({ code: 'INVALID_PERMISSION_CODES', invalid });
    }
    return found;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
