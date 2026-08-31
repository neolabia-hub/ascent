import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { audienceRuleSchema, type AudienceRule, type CreateAudienceInput, type UpdateAudienceInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import {
  buildAudienceWhere,
  personMatchesRule,
  ruleReachesEveryone,
  sameAudienceRule,
  singleJobTitleOf,
  type PersonProfile,
} from './audience-rule.js';

export interface AudienceSyncResult {
  joined: number;
  left: number;
}

/** Persona con lo que la regla necesita mirar (incluye el tipo de cargo, que cuelga del cargo). */
const PERSON_SELECT = {
  id: true,
  jobTitleId: true,
  areaId: true,
  regionalId: true,
  serviceId: true,
  employmentType: true,
  roadActor: true,
  jobTitle: { select: { jobTitleTypeId: true } },
} satisfies Prisma.UserSelect;

/**
 * Audiencias: "a quienes aplica". Se materializan en `audience_members` CON HISTORIA
 * (Decision #11): quien sale queda con `left_at`, nunca se borra la fila, porque un auditor
 * puede preguntar quien pertenecia a la audiencia el 12 de mayo.
 */
@Injectable()
export class AudiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const audiences = await this.prisma.scoped.audience.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: { where: { leftAt: null } }, rules: { where: { active: true } } } },
      },
    });
    return audiences.map((audience) => ({
      id: audience.id,
      name: audience.name,
      rule: audience.rule,
      isDynamic: audience.isDynamic,
      active: audience.active,
      memberCount: audience._count.members,
      ruleCount: audience._count.rules,
      updatedAt: audience.updatedAt,
    }));
  }

  async getById(id: string) {
    const audience = await this.prisma.scoped.audience.findUnique({ where: { id } });
    if (!audience) throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND' });
    const members = await this.prisma.scoped.audienceMember.findMany({
      where: { audienceId: id, leftAt: null },
      take: 200,
      orderBy: { joinedAt: 'desc' },
      select: {
        joinedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            documentNumber: true,
            jobTitle: { select: { name: true } },
            area: { select: { name: true } },
            regional: { select: { name: true } },
          },
        },
      },
    });
    const memberCount = await this.prisma.scoped.audienceMember.count({ where: { audienceId: id, leftAt: null } });
    return { ...audience, memberCount, members, reachesEveryone: ruleReachesEveryone(this.parseRule(audience.rule)) };
  }

  /** Cuenta y muestra a quien alcanzaria la regla ANTES de guardarla. */
  async preview(rule: AudienceRule) {
    const where = buildAudienceWhere(rule);
    const [count, sample] = await Promise.all([
      this.prisma.scoped.user.count({ where }),
      this.prisma.scoped.user.findMany({
        where,
        take: 10,
        orderBy: { fullName: 'asc' },
        select: { id: true, fullName: true, jobTitle: { select: { name: true } }, area: { select: { name: true } } },
      }),
    ]);
    return { count, sample, reachesEveryone: ruleReachesEveryone(rule) };
  }

  /**
   * La audiencia que corresponde a un alcance: la que ya existe con esa FORMA, o una nueva con un
   * nombre que se lee solo ("Toda la empresa", "Cargo: Conductor", "2 cargos · Neiva").
   *
   * Vive aqui y no en quien la usa porque la piden dos sitios que no se conocen entre si: la
   * pestana **Quienes** (a quien se le exige la formacion) y la **convocatoria** (a que tajada de
   * los obligados atiende esa jornada). Si cada uno la creara por su cuenta, "los conductores"
   * serian dos audiencias gemelas y nadie sabria cual mirar.
   *
   * Se reconoce por la FORMA y no por el nombre (`sameAudienceRule`): asi, renombrarla no la
   * desconecta, y la casilla de la matriz por cargo produce exactamente la misma fila.
   */
  async findOrCreate(tenantId: string, scope: AudienceRule) {
    const audiences = await this.prisma.scoped.audience.findMany({ where: { active: true } });
    const found = audiences.find((audience) => sameAudienceRule(this.parseRule(audience.rule), scope));
    if (found) return found;

    const created = await this.prisma.scoped.audience.create({
      data: {
        tenantId,
        name: await this.nameForScope(scope),
        rule: scope as unknown as Prisma.InputJsonValue,
        isDynamic: true,
      },
    });
    await this.reevaluate(this.prisma.scoped, tenantId, created.id);
    return created;
  }

  /** Nombre legible del alcance. Es lo que se vera despues en la lista de audiencias. */
  private async nameForScope(scope: AudienceRule): Promise<string> {
    if (ruleReachesEveryone(scope)) return 'Toda la empresa';

    const [jobTitles, areas, regionals, services] = await Promise.all([
      scope.jobTitleIds.length > 0
        ? this.prisma.scoped.jobTitle.findMany({ where: { id: { in: scope.jobTitleIds } }, select: { name: true } })
        : [],
      scope.areaIds.length > 0
        ? this.prisma.scoped.area.findMany({ where: { id: { in: scope.areaIds } }, select: { name: true } })
        : [],
      scope.regionalIds.length > 0
        ? this.prisma.scoped.regional.findMany({ where: { id: { in: scope.regionalIds } }, select: { name: true } })
        : [],
      scope.serviceIds.length > 0
        ? this.prisma.scoped.service.findMany({ where: { id: { in: scope.serviceIds } }, select: { name: true } })
        : [],
    ]);

    // Un solo cargo se nombra como lo nombra la matriz, para que las dos vias produzcan
    // exactamente la misma audiencia tambien en el nombre.
    if (singleJobTitleOf(scope) && jobTitles[0]) return `Cargo: ${jobTitles[0].name}`;

    const partes = [
      ...this.namePart('cargos', jobTitles.map((row) => row.name)),
      ...this.namePart('areas', areas.map((row) => row.name)),
      ...this.namePart('regionales', regionals.map((row) => row.name)),
      ...this.namePart('servicios', services.map((row) => row.name)),
    ];
    const nombre = partes.join(' · ');
    return nombre.length > 0 ? nombre.slice(0, 160) : 'Alcance a medida';
  }

  /** Hasta dos nombres; a partir de ahi se cuenta, que un titulo de 300 caracteres no se lee. */
  private namePart(etiqueta: string, nombres: string[]): string[] {
    if (nombres.length === 0) return [];
    if (nombres.length <= 2) return [nombres.join(' y ')];
    return [`${nombres.length} ${etiqueta}`];
  }

  async create(actor: AuthUser, input: CreateAudienceInput) {
    const tenantId = this.prisma.currentTenantId;
    const audience = await this.prisma.scoped.audience.create({
      data: { tenantId, name: input.name, rule: input.rule as object, isDynamic: input.isDynamic },
    });
    await this.reevaluate(this.prisma.scoped, tenantId, audience.id);
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'AUDIENCE_CREATED',
      resourceType: 'audiences',
      resourceId: audience.id,
      newValues: { name: input.name, rule: input.rule },
    });
    return this.getById(audience.id);
  }

  async update(actor: AuthUser, id: string, input: UpdateAudienceInput) {
    const tenantId = this.prisma.currentTenantId;
    const before = await this.prisma.scoped.audience.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND' });

    await this.prisma.scoped.audience.update({
      where: { id },
      data: {
        name: input.name,
        rule: input.rule as object | undefined,
        isDynamic: input.isDynamic,
        active: input.active,
      },
    });
    // Cambiar la regla cambia la membresia: se recalcula al instante, no en el proximo cron.
    await this.reevaluate(this.prisma.scoped, tenantId, id);
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'AUDIENCE_UPDATED',
      resourceType: 'audiences',
      resourceId: id,
      oldValues: { name: before.name, rule: before.rule, active: before.active },
      newValues: input,
    });
    return this.getById(id);
  }

  /** Baja logica. Con requisitos activos colgando NO se desactiva: primero se retiran ellos. */
  async deactivate(actor: AuthUser, id: string) {
    const audience = await this.prisma.scoped.audience.findUnique({ where: { id } });
    if (!audience) throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND' });
    const activeRules = await this.prisma.scoped.assignmentRule.count({ where: { audienceId: id, active: true } });
    if (activeRules > 0) {
      throw new ConflictException({
        code: 'AUDIENCE_IN_USE',
        message: 'La audiencia tiene requisitos activos. Retiralos antes de desactivarla.',
      });
    }
    await this.prisma.scoped.audience.update({ where: { id }, data: { active: false } });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'AUDIENCE_DEACTIVATED',
      resourceType: 'audiences',
      resourceId: id,
      oldValues: { name: audience.name },
    });
    return { ok: true as const };
  }

  // ─────────────────────────── Materializacion ───────────────────────────

  /**
   * Recalcula la membresia de una audiencia: da de alta a los que ahora cumplen y marca la
   * salida de los que dejaron de cumplir. Nunca borra filas.
   */
  async reevaluate(db: TenantPrisma, tenantId: string, audienceId: string): Promise<AudienceSyncResult> {
    const audience = await db.audience.findUnique({ where: { id: audienceId } });
    if (!audience || !audience.active) return { joined: 0, left: 0 };

    const rule = this.parseRule(audience.rule);
    const [matching, open] = await Promise.all([
      db.user.findMany({ where: buildAudienceWhere(rule), select: { id: true } }),
      db.audienceMember.findMany({ where: { audienceId, leftAt: null }, select: { id: true, userId: true } }),
    ]);

    const matchingIds = new Set(matching.map((u) => u.id));
    const openByUser = new Map(open.map((m) => [m.userId, m.id]));

    const toJoin = [...matchingIds].filter((userId) => !openByUser.has(userId));
    const toLeave = open.filter((m) => !matchingIds.has(m.userId));

    if (toJoin.length > 0) {
      await db.audienceMember.createMany({
        data: toJoin.map((userId) => ({ tenantId, audienceId, userId })),
      });
    }
    if (toLeave.length > 0) {
      await db.audienceMember.updateMany({
        where: { id: { in: toLeave.map((m) => m.id) } },
        data: { leftAt: new Date() },
      });
    }
    return { joined: toJoin.length, left: toLeave.length };
  }

  /** Recalcula TODAS las audiencias dinamicas activas del tenant (cron nocturno). */
  async reevaluateAll(db: TenantPrisma, tenantId: string): Promise<AudienceSyncResult> {
    const audiences = await db.audience.findMany({ where: { active: true, isDynamic: true }, select: { id: true } });
    const totals: AudienceSyncResult = { joined: 0, left: 0 };
    for (const audience of audiences) {
      const result = await this.reevaluate(db, tenantId, audience.id);
      totals.joined += result.joined;
      totals.left += result.left;
    }
    return totals;
  }

  /**
   * Recalcula la membresia de UNA persona en todas las audiencias dinamicas. Es el camino
   * caliente: se ejecuta al crear a alguien o al cambiarle cargo, area o regional, para que sus
   * obligaciones existan en el acto y no en el proximo cron.
   */
  async syncPerson(db: TenantPrisma, tenantId: string, userId: string): Promise<AudienceSyncResult> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { ...PERSON_SELECT, active: true, deletedAt: true, terminatedAt: true } });
    if (!user) return { joined: 0, left: 0 };
    const eligible = user.active && user.deletedAt === null && user.terminatedAt === null;
    const profile: PersonProfile = {
      jobTitleId: user.jobTitleId,
      jobTitleTypeId: user.jobTitle.jobTitleTypeId,
      areaId: user.areaId,
      regionalId: user.regionalId,
      serviceId: user.serviceId,
      employmentType: user.employmentType,
      roadActor: user.roadActor,
    };

    const audiences = await db.audience.findMany({ where: { active: true, isDynamic: true } });
    const open = await db.audienceMember.findMany({
      where: { userId, leftAt: null },
      select: { id: true, audienceId: true },
    });
    const openByAudience = new Map(open.map((m) => [m.audienceId, m.id]));

    const totals: AudienceSyncResult = { joined: 0, left: 0 };
    for (const audience of audiences) {
      const belongs = eligible && personMatchesRule(profile, this.parseRule(audience.rule));
      const memberId = openByAudience.get(audience.id);
      if (belongs && !memberId) {
        await db.audienceMember.create({ data: { tenantId, audienceId: audience.id, userId } });
        totals.joined += 1;
      } else if (!belongs && memberId) {
        await db.audienceMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
        totals.left += 1;
      }
    }
    return totals;
  }

  /** La regla vive como JSON: se valida al leer para que un dato viejo no rompa el motor. */
  parseRule(raw: unknown): AudienceRule {
    const parsed = audienceRuleSchema.safeParse(raw);
    return parsed.success ? parsed.data : audienceRuleSchema.parse({});
  }
}
