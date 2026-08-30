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
 * Si la convocatoria es de una regional, el alcance se acota a esa regional: una jornada en Neiva
 * no le promete nada a Barranquilla.
 */
@Injectable()
export class ProjectedAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solo el numero (lo que necesita la pantalla y el congelado al publicar). */
  async derive(activityId: string, regionalId: string | null): Promise<ProjectedAudience> {
    const { userIds: _userIds, ...summary } = await this.resolve(activityId, regionalId);
    return summary;
  }

  /** Las personas proyectadas, no solo cuantas (lo que necesita el plan para obligar). */
  async resolve(activityId: string, regionalId: string | null): Promise<ProjectedPeople> {
    const eligible: Prisma.UserWhereInput = {
      active: true,
      deletedAt: null,
      terminatedAt: null,
      ...(regionalId ? { regionalId } : {}),
    };
    const scope = regionalId ? ' en la regional de la convocatoria' : '';

    // 1. Los ya obligados. Se acota a la regional de la convocatoria como todo lo demas.
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
        detail: `Personas ya obligadas a esta formacion${scope}.`,
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
        detail: `Personas alcanzadas por ${rules.length === 1 ? 'el requisito' : `los ${rules.length} requisitos`} de esta actividad${scope}.`,
      };
    }

    return {
      userIds: [],
      count: 0,
      source: 'NONE',
      detail: 'Nadie esta obligado a esta formacion todavia: asignala en Quienes, o ajusta los proyectados con justificacion.',
    };
  }

  private async findUserIds(where: Prisma.UserWhereInput): Promise<string[]> {
    const users = await this.prisma.scoped.user.findMany({ where, select: { id: true } });
    return users.map((user) => user.id);
  }
}
