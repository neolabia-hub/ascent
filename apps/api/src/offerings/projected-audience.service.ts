import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type ProjectedSource = 'RULES' | 'ACTIVITY_JOB_TITLES' | 'NONE';

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
 *   1. los requisitos activos que exigen esa actividad (su audiencia es la respuesta exacta),
 *   2. si no hay requisitos, los cargos a los que la actividad esta dirigida,
 *   3. si tampoco, cero — y la pantalla pide ajustarlo a mano CON justificacion.
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

    const jobTitles = await this.prisma.scoped.activityJobTitle.findMany({
      where: { activityId },
      select: { jobTitleId: true },
    });
    if (jobTitles.length > 0) {
      const userIds = await this.findUserIds({ ...eligible, jobTitleId: { in: jobTitles.map((j) => j.jobTitleId) } });
      return {
        userIds,
        count: userIds.length,
        source: 'ACTIVITY_JOB_TITLES',
        detail: `Personas en los cargos a los que va dirigida la actividad${scope}.`,
      };
    }

    return {
      userIds: [],
      count: 0,
      source: 'NONE',
      detail: 'La actividad no tiene requisitos ni cargos destino: ajusta los proyectados con justificacion.',
    };
  }

  private async findUserIds(where: Prisma.UserWhereInput): Promise<string[]> {
    const users = await this.prisma.scoped.user.findMany({ where, select: { id: true } });
    return users.map((user) => user.id);
  }
}
