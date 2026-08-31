import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type ProjectedSource = 'OBLIGATIONS' | 'RULES' | 'NONE';

export interface ProjectedAudience {
  count: number;
  source: ProjectedSource;
  /** Frase corta para la pantalla: de donde salio el numero. */
  detail: string;
}

export interface ProjectedPeople extends ProjectedAudience {
  /** Las personas concretas: el plan las necesita para crear sus obligaciones. */
  userIds: string[];
}

/**
 * LA TAJADA de una jornada: a que parte de los obligados atiende.
 *
 *   audienceId  el grupo que declara la convocatoria (cargo, area, regional, servicio). Es la
 *               respuesta explicita, y cuando esta, manda.
 *   regionalId  la SEDE. Solo acota cuando no hay tajada declarada, que es el caso simple de
 *               siempre: "esta jornada es en Neiva, atiende a los de Neiva".
 */
export interface OfferingScope {
  audienceId: string | null;
  regionalId: string | null;
}

/**
 * PROYECTADOS de una convocatoria (Decision #5): cuantas personas DEBERIAN capacitarse.
 *
 * El numero se DERIVA de a quien obliga la formacion, no se teclea: es el denominador de la
 * cobertura, y un denominador escrito a mano convierte el indicador en opinion.
 *
 * Orden de derivacion:
 *   1. quienes YA estan obligados a esa actividad —vengan de un requisito o de una asignacion
 *      hecha a mano en la pestana Quienes—: es la respuesta exacta, porque proyectado y obligado
 *      son la misma gente;
 *   2. si todavia no hay ninguna obligacion, a quienes alcanzarian los requisitos activos (sirve
 *      antes de que el motor las materialice);
 *   3. si tampoco, cero — y la pantalla pide ajustarlo a mano CON justificacion.
 *
 * Antes habia un paso intermedio que miraba los CARGOS de la ficha de la actividad, y se quito
 * (Decision #59): obligaba a elegir los cargos dos veces —en la ficha para el numero y en Quienes
 * para la obligacion— y las dos listas se separaban en cuanto alguien cambiaba una sola. El
 * denominador ahora sale del mismo sitio que la obligacion, asi que no pueden discrepar.
 *
 * LA TAJADA (Decision #68) se aplica en los tres escalones. Sin ella, dos jornadas de la misma
 * formacion proyectan a los mismos obligados y el plan los SUMA: 40 obligados repartidos en dos
 * jornadas salian como 80 proyectados, y la cobertura no podia pasar del 50% aunque se capacitara
 * a todo el mundo. Acotar solo por regional no bastaba: una jornada puede ser "Gestion Humana de
 * Antioquia", o incluso un cargo concreto de esa area.
 */
@Injectable()
export class ProjectedAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo el numero (lo que necesita la pantalla y el congelado al publicar). */
  async derive(activityId: string, scope: OfferingScope): Promise<ProjectedAudience> {
    const { userIds: _userIds, ...summary } = await this.resolve(activityId, scope);
    return summary;
  }

  /** Las personas proyectadas, no solo cuantas (lo que necesita el plan para obligar). */
  async resolve(activityId: string, scope: OfferingScope): Promise<ProjectedPeople> {
    const tajada = await this.tajadaWhere(scope);

    const eligible: Prisma.UserWhereInput = {
      active: true,
      deletedAt: null,
      terminatedAt: null,
      ...tajada.where,
    };

    // 1. Los ya obligados, acotados a la tajada de la jornada.
    const obliged = await this.findUserIds({
      ...eligible,
      assignments: {
        some: {
          targetType: 'ACTIVITY',
          targetId: activityId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED'] },
        },
      },
    });
    if (obliged.length > 0) {
      return {
        userIds: obliged,
        count: obliged.length,
        source: 'OBLIGATIONS',
        detail: `Personas ya obligadas a esta formacion${tajada.detail}.`,
      };
    }

    const rules = await this.prisma.scoped.assignmentRule.findMany({
      where: { active: true, targetType: 'ACTIVITY', targetId: activityId, audience: { active: true } },
      select: { audienceId: true },
    });

    if (rules.length > 0) {
      const audienceIds = [...new Set(rules.map((r) => r.audienceId))];
      const userIds = await this.findUserIds({
        ...eligible,
        audienceMembers: { some: { audienceId: { in: audienceIds }, leftAt: null } },
      });
      return {
        userIds,
        count: userIds.length,
        source: 'RULES',
        detail: `Personas alcanzadas por ${rules.length === 1 ? 'el requisito' : `los ${rules.length} requisitos`} de esta actividad${tajada.detail}.`,
      };
    }

    return {
      userIds: [],
      count: 0,
      source: 'NONE',
      detail:
        'Nadie esta obligado a esta formacion todavia: asignala en Quienes, o ajusta los proyectados con justificacion.',
    };
  }

  /**
   * El filtro de la tajada, y como se dice en pantalla.
   *
   * La audiencia declarada MANDA sobre la regional: si alguien acota la jornada a "los
   * conductores", que se dicte en Neiva no puede recortar en silencio a quien atiende —una
   * jornada nacional puede darse en una sede—. La regional sigue acotando en el caso simple, que
   * es el de siempre: jornada sin tajada declarada.
   */
  private async tajadaWhere(scope: OfferingScope): Promise<{ where: Prisma.UserWhereInput; detail: string }> {
    if (scope.audienceId) {
      const audience = await this.prisma.scoped.audience.findUnique({
        where: { id: scope.audienceId },
        select: { name: true },
      });
      return {
        where: { audienceMembers: { some: { audienceId: scope.audienceId, leftAt: null } } },
        detail: audience ? ` de "${audience.name}"` : ' en el alcance de la convocatoria',
      };
    }
    if (scope.regionalId) {
      return { where: { regionalId: scope.regionalId }, detail: ' en la regional de la convocatoria' };
    }
    return { where: {}, detail: '' };
  }

  private async findUserIds(where: Prisma.UserWhereInput): Promise<string[]> {
    const users = await this.prisma.scoped.user.findMany({ where, select: { id: true } });
    return users.map((user) => user.id);
  }
}
