import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AudienceRule } from '@neo-pulse/shared';
import { buildAudienceWhere, ruleReachesEveryone } from '../assignments/audience-rule.js';
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

/** Una faceta que EXISTE entre los obligados, con cuantos hay. */
export interface FacetCount {
  id: string;
  count: number;
}

/**
 * Lo que necesita el formulario de la convocatoria para cortar con conocimiento de causa:
 * cuantos caen dentro, sobre cuantos, y que facetas hay de verdad entre los obligados.
 */
export interface ProjectedPreview extends ProjectedAudience {
  /** Todos los obligados de la formacion, sin tajada: el denominador de "N de M". */
  total: number;
  facets: {
    jobTitles: FacetCount[];
    areas: FacetCount[];
    regionals: FacetCount[];
    services: FacetCount[];
  };
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
  /**
   * La tajada ANTES de existir como audiencia: lo que se esta marcando en el formulario. Solo la
   * usa la previsualizacion — al guardar, la convocatoria la convierte en audiencia y se cae al
   * caso de arriba. Se acepta aqui, y no en una funcion aparte, para que previsualizar y congelar
   * pasen por el mismo sitio: dos caminos parecidos vuelven a separarse siempre.
   */
  rule?: AudienceRule | null;
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

    /*
      LAS DOS CONDICIONES VAN EN `AND`, NUNCA ESPARCIDAS (2026-09-04).

      `eligible` YA trae la tajada, y la tajada puede ser `audienceMembers` (cuando la jornada se
      acota con una audiencia) o incluso un `AND` entero (cuando llega como regla sin guardar, ver
      `buildAudienceWhere`). Anadir aqui otra clave con el MISMO nombre no las suma: la segunda pisa
      a la primera en el objeto, en silencio.

      Eso es justo lo que pasaba abajo, en el escalon de los requisitos, y el fallo era exactamente
      el que la tajada existe para impedir —el que esta descrito en la cabecera de este archivo—:
      dos jornadas de la misma formacion proyectando cada una a TODOS los obligados. MEDIDO el
      2026-09-04 con las cinco facetas que tienen datos: area 405 y 405 donde son 198 y 207; cargo
      345 y 345 donde son 288 y 57; tipo de cargo 904 y 904 donde son 345 y 559. Y una tajada sobre
      un grupo SIN obligados proyectaba el total entero en vez de cero.

      No se veia porque el escalon de arriba —los ya obligados— usa la clave `assignments`, que no
      choca con ninguna tajada: el reparto funcionaba DESPUES de aprobar el plan y fallaba ANTES,
      que es justo cuando se decide como partir las jornadas. Y el `detail` si nombraba la tajada
      ("...de \\"SGI\\""), asi que el texto decia que estaba acotado y el numero no lo estaba.

      Envolver en `AND` quita la clase de error entera: da igual que forma tenga la tajada.
    */
    const obliged = await this.findUserIds({
      AND: [
        eligible,
        {
          assignments: {
            some: {
              targetType: 'ACTIVITY',
              targetId: activityId,
              status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED'] },
            },
          },
        },
      ],
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
      // Aqui estaba el pisotón: `eligible` puede traer su propio `audienceMembers` (la tajada) y
      // esta clave lo sustituia. Ver la nota de arriba.
      const userIds = await this.findUserIds({
        AND: [eligible, { audienceMembers: { some: { audienceId: { in: audienceIds }, leftAt: null } } }],
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
   * LO QUE VE QUIEN ESTA CORTANDO, antes de que la convocatoria exista.
   *
   * Devuelve las tres cosas que la tarjeta de la tajada necesita y no tenia:
   *
   *   count    cuantos obligados caen DENTRO del corte — el numero que se va a congelar;
   *   total    cuantos obligados hay en total, para poder decir "N de M" en vez de un numero
   *            suelto que no se sabe contra que se lee;
   *   facets   que cargos, areas, regionales y servicios existen ENTRE LOS OBLIGADOS, con
   *            cuantos hay de cada uno. Ofrecer los cuarenta cargos del catalogo invita a cortar
   *            por uno que da cero, y ese error solo se descubre despues de publicar.
   *
   * Las facetas salen de los obligados de verdad y no de los requisitos: una persona puede estar
   * obligada por una asignacion suelta hecha en "Quienes", y filtrar por las reglas la borraria
   * de la lista.
   */
  async preview(activityId: string, scope: OfferingScope): Promise<ProjectedPreview> {
    const universo = await this.resolve(activityId, { audienceId: null, regionalId: null });
    const conTajada = await this.resolve(activityId, scope);
    return {
      count: conTajada.count,
      total: universo.count,
      source: universo.source,
      detail: conTajada.detail,
      facets: await this.facetsOf(universo.userIds),
    };
  }

  /** Las facetas presentes entre un grupo de personas, con cuantas hay de cada una. */
  private async facetsOf(userIds: string[]): Promise<ProjectedPreview['facets']> {
    const vacio = { jobTitles: [], areas: [], regionals: [], services: [] };
    if (userIds.length === 0) return vacio;
    const where: Prisma.UserWhereInput = { id: { in: userIds } };
    const [jobTitles, areas, regionals, services] = await Promise.all([
      this.prisma.scoped.user.groupBy({ by: ['jobTitleId'], where, _count: { _all: true } }),
      this.prisma.scoped.user.groupBy({ by: ['areaId'], where, _count: { _all: true } }),
      this.prisma.scoped.user.groupBy({ by: ['regionalId'], where, _count: { _all: true } }),
      this.prisma.scoped.user.groupBy({ by: ['serviceId'], where, _count: { _all: true } }),
    ]);
    // Quien no tiene regional o servicio puesto no aporta ninguna faceta: no se adivina, igual
    // que en `audience-rule.ts`.
    const contar = (id: string | null, count: number): FacetCount[] => (id ? [{ id, count }] : []);
    return {
      jobTitles: jobTitles.flatMap((fila) => contar(fila.jobTitleId, fila._count._all)),
      areas: areas.flatMap((fila) => contar(fila.areaId, fila._count._all)),
      regionals: regionals.flatMap((fila) => contar(fila.regionalId, fila._count._all)),
      services: services.flatMap((fila) => contar(fila.serviceId, fila._count._all)),
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
    // La tajada que se esta marcando manda sobre todo lo demas: es lo que el usuario tiene
    // delante. Vacia no acota nada, igual que no marcar nada al guardar.
    if (scope.rule && !ruleReachesEveryone(scope.rule)) {
      return { where: buildAudienceWhere(scope.rule), detail: ' en el alcance marcado' };
    }
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
