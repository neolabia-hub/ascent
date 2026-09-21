import { Injectable } from '@nestjs/common';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import {
  ESTADOS_RETIRADOS,
  consolidarPorPersona,
  inscripcionDeCadaRonda,
  resolverEstadoEjecucion,
  resumirEjecucion,
  type EstadoEjecucion,
} from './execution-state.js';
import { DIMENSIONES, agrupar, type Dimension, type HechoAnalitica } from './analytics.js';
import {
  calendario as calendarioDeVencimientos,
  consolidar as consolidarVencimientos,
  resumir as resumirVencimientos,
  type HechoVencimiento,
} from './expirations.js';
import { libroDeEjecucionDeActividad, libroDeEjecucionGeneral } from './execution-xlsx.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * COMO VA LA EJECUCION DE UNA FORMACION, persona por persona (Decision #117).
   *
   * ─── EL HUECO QUE CIERRA ───
   *
   * Habia porcentajes —cumplimiento y cobertura del plan— y no habia forma de abrirlos. Quien
   * administra veia "62%" y no podia contestar la unica pregunta que sigue: **¿el 38% quienes
   * son?** Sin eso el indicador no sirve para actuar: no se sabe a quien llamar, ni si el problema
   * es que la gente no entra o que nadie los convoco.
   *
   * ─── SE INCLUYE LO TERMINADO, no solo lo pendiente ───
   *
   * El listado del aprendiz solo trae lo que le falta, porque esa es su pregunta. Aqui hace falta
   * lo contrario: una formacion desaparecida del listado porque ya se hizo es exactamente la que
   * demuestra el cumplimiento. Por eso se parte de las ASIGNACIONES —vivas y cerradas— y no de las
   * inscripciones.
   */
  async ejecucionDeActividad(activityId: string) {
    const asignaciones = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        targetId: activityId,
        // Lo RETIRADO no se le pide ya a nadie: no es un incumplimiento, es que dejo de exigirse.
        // Ver `ESTADOS_RETIRADOS`, con la medicion de lo que costaba no filtrarlo.
        status: { notIn: [...ESTADOS_RETIRADOS] },
      },
      orderBy: [{ dueAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        dueAt: true,
        status: true,
        cycleNumber: true,
        // EL ENLACE A LA EJECUCION QUE LA SATISFIZO (Decision #2: se enlazan, no se fusionan).
        // Sin esto el informe tenia que adivinar que inscripcion describe a que ronda, y adivinaba
        // mal — ver la nota de `inscripcionDeCadaRonda`.
        completedEnrollmentId: true,
        user: {
          select: {
            id: true,
            fullName: true,
            documentNumber: true,
            active: true,
            area: { select: { name: true } },
            jobTitle: { select: { name: true } },
          },
        },
      },
    });

    // Quien ya no trabaja en la empresa no cuenta como incumplimiento: su obligacion murio con su
    // salida, y dejarlo en la lista infla el denominador con gente que no va a formarse.
    const vivas = asignaciones.filter((fila) => fila.user.active);
    if (vivas.length === 0) {
      return { items: [], resumen: resumirEjecucion([]) };
    }

    const userIds = vivas.map((fila) => fila.userId);

    /*
      LAS INSCRIPCIONES SE PIDEN PRIMERO Y APARTE.

      `surveyResponse` y `certificate` guardan `enrollmentId` pero no exponen la relacion inversa
      hacia `activityVersion`, asi que no se pueden filtrar por actividad en una sola consulta. Con
      los ids en la mano el filtro es directo y ademas mas barato: un `IN` sobre una lista corta
      frente a un join anidado de tres tablas.
    */
    const inscripciones = await this.prisma.scoped.enrollment.findMany({
      where: { userId: { in: userIds }, activityVersion: { activityId } },
      orderBy: { enrolledAt: 'desc' },
      select: {
        id: true,
        userId: true,
        status: true,
        completedAt: true,
        // A QUE OBLIGACION pertenece. Nace enlazada al inscribir (Decision #2), tanto si la
        // inscribe quien convoca como si la persona entra sola.
        assignmentId: true,
        activityVersion: { select: { versionNumber: true } },
      },
    });
    const enrollmentIds = inscripciones.map((fila) => fila.id);

    const [intentos, encuestas, certificados, autoservicio] = await Promise.all([
      this.prisma.scoped.attempt.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { userId: true, score: true, status: true },
      }),
      this.prisma.scoped.surveyResponse.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { respondentUserId: true, result: true },
      }),
      this.prisma.scoped.certificate.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { id: true, userId: true, revokedAt: true },
      }),
      /*
        ¿HAY PUERTA ABIERTA? Es lo que separa "no la ha hecho" de "no ha podido hacerla", y esa
        distincion es la mitad del valor de esta pantalla: sin ella, un renglon del plan que nadie
        convoco se lee como gente incumplida, cuando lo que hay que hacer es programar la jornada.
      */
      this.prisma.scoped.offering.findFirst({
        where: {
          status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
          kind: { in: ['PERMANENT', 'HYBRID'] },
          activityVersion: { activityId },
        },
        select: { id: true },
      }),
    ]);

    /*
      LA INSCRIPCION SE PEGA A SU RONDA, NO A LA PERSONA (2026-09-05).

      Aqui se cogia la inscripcion MAS RECIENTE de cada persona y se aplicaba a TODAS sus filas.
      Con una formacion que no se repite da igual —hay una ronda y una inscripcion— y en cuanto se
      repite es falso: `resolverEstadoEjecucion` pregunta primero por el resultado, asi que **quien
      completo la ronda 1 salia con la ronda 2 tambien como TERMINADA**.

      MEDIDO el 2026-09-05 con el recorrido de asistencia: 5 obligaciones, 3 pendientes de verdad,
      y el informe decia 4 terminadas. En produccion es la reinduccion de 796 personas figurando
      hecha el 2 de enero de cada año.

      Es el hermano del fallo del 2026-09-04 —el informe contando lo retirado como "sin empezar"—
      pero al reves: aquel inflaba el incumplimiento y este infla el CUMPLIMIENTO, que es el que no
      se descubre solo porque nadie reclama un numero que le favorece.

      No hacia falta inventar nada: el enlace existe en las dos direcciones desde el Sprint 3
      (`assignments.completed_enrollment_id` y `enrollments.assignment_id`, Decision #2). Se usa el
      enlace y NO se adivina: una inscripcion sin obligacion no colorea ninguna fila, que es lo
      correcto — es una ejecucion que no responde por ese requisito.
    */
    const inscripcionPorObligacion = inscripcionDeCadaRonda(vivas, inscripciones);

    const mejorNota = new Map<string, number>();
    const cuantosIntentos = new Map<string, number>();
    for (const intento of intentos) {
      cuantosIntentos.set(intento.userId, (cuantosIntentos.get(intento.userId) ?? 0) + 1);
      if (intento.score === null) continue;
      const valor = Number(intento.score);
      // La MEJOR y no la ultima: quien aprobo con 95 y repaso el examen sacando 80 por curiosidad
      // acredito 95.
      if (!mejorNota.has(intento.userId) || valor > (mejorNota.get(intento.userId) as number)) {
        mejorNota.set(intento.userId, valor);
      }
    }

    const encuestaPorUsuario = new Map(encuestas.map((fila) => [fila.respondentUserId, fila.result]));
    const certificadoPorUsuario = new Map(certificados.map((fila) => [fila.userId, fila]));

    const items = vivas.map((fila) => {
      const inscripcion = inscripcionPorObligacion.get(fila.id) ?? null;
      const estado: EstadoEjecucion = resolverEstadoEjecucion({
        overdue: fila.status === 'OVERDUE',
        assignmentStatus: fila.status,
        enrollmentStatus: inscripcion?.status ?? null,
        puedeAutoinscribirse: autoservicio !== null,
      });
      const certificado = certificadoPorUsuario.get(fila.userId) ?? null;

      return {
        assignmentId: fila.id,
        userId: fila.userId,
        fullName: fila.user.fullName,
        documentNumber: fila.user.documentNumber,
        area: fila.user.area?.name ?? null,
        jobTitle: fila.user.jobTitle?.name ?? null,
        estado,
        dueAt: fila.dueAt,
        cycleNumber: fila.cycleNumber,
        enrollmentId: inscripcion?.id ?? null,
        versionNumber: inscripcion?.activityVersion.versionNumber ?? null,
        completedAt: inscripcion?.completedAt ?? null,
        intentos: cuantosIntentos.get(fila.userId) ?? 0,
        mejorNota: mejorNota.get(fila.userId) ?? null,
        // `undefined` = no la ha respondido; un valor = que dijo. Son cosas distintas y la pantalla
        // las pinta distinto.
        encuesta: encuestaPorUsuario.get(fila.userId) ?? null,
        respondioEncuesta: encuestaPorUsuario.has(fila.userId),
        certificadoId: certificado && certificado.revokedAt === null ? certificado.id : null,
      };
    });

    /*
      UNA FILA POR PERSONA, NO POR RONDA (PENDIENTES 5.2, 2026-09-14).

      Hasta aqui `items` tiene una fila por OBLIGACION (`assignmentId`): una reinduccion con tres
      ciclos cerrados le daba tres filas a la misma persona. `consolidarPorPersona` se queda con la
      que de verdad responde "¿como esta esta persona con esta formacion hoy?" — ver el porque
      completo en `execution-state.ts`. El resumen se calcula DESPUES de consolidar, no antes: son
      personas, no rondas, las que se cuentan como cumplidas o atrasadas en este detalle.
    */
    const porPersona = consolidarPorPersona(items);

    return { items: porPersona, resumen: resumirEjecucion(porPersona.map((item) => item.estado)) };
  }


  /**
   * LOS ESTADOS DE MUCHAS FORMACIONES A LA VEZ, en tres consultas fijas (Decision #123).
   *
   * ─── POR QUE EXISTE ───
   *
   * `ejecucionDeActividad` resuelve UNA formacion con cinco consultas, y esta bien para el detalle
   * de una. Pero llamarla en bucle —la vista general con doscientas formaciones, el plan con
   * treinta renglones— multiplica: doscientas por cinco son **mil consultas para pintar una
   * pantalla**, y son las dos pantallas que mas se abren.
   *
   * Aqui se traen los datos UNA vez, con `IN`, y se agrupan en memoria. Tres consultas, sea para
   * una formacion o para trescientas.
   *
   * ─── LO QUE NO SE DUPLICA ───
   *
   * La regla de estados. Se sigue llamando a `resolverEstadoEjecucion`, que es lo unico que no
   * puede tener dos versiones: si el criterio viviera tambien en SQL, el dia que cambie habria que
   * acordarse de los dos sitios, y el que se olvide hara que la misma persona salga "atrasada" en
   * una pantalla y "esperando" en otra. Optimizar la consulta esta bien; reimplementar el criterio,
   * no.
   *
   * Devuelve `null` cuando no hay ninguna obligacion viva: es distinto de "todas al 0%".
   */
  private async estadosPorActividad(
    activityIds: string[] | null,
  ): Promise<{ porActividad: Map<string, EstadoEjecucion[]>; todos: EstadoEjecucion[] } | null> {
    const asignaciones = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        ...(activityIds ? { targetId: { in: activityIds } } : {}),
        // Quien ya no trabaja aqui no cuenta como incumplimiento: su obligacion murio con su
        // salida, y dejarlo infla el denominador con gente que no se va a formar.
        user: { active: true, deletedAt: null },
        // Y lo mismo con la obligacion RETIRADA, por el mismo motivo (ver `ESTADOS_RETIRADOS`).
        status: { notIn: [...ESTADOS_RETIRADOS] },
      },
      // `id` y `completedEnrollmentId`: la ejecucion se pega a la RONDA, no a la persona
      // (`inscripcionDeCadaRonda`). Sin ellos, quien completo la ronda 1 salia con la 2 terminada.
      select: { id: true, userId: true, targetId: true, status: true, completedEnrollmentId: true },
    });
    if (asignaciones.length === 0) return null;

    const ids = [...new Set(asignaciones.map((fila) => fila.targetId))];

    const [inscripciones, convocatorias] = await Promise.all([
      this.prisma.scoped.enrollment.findMany({
        where: { activityVersion: { activityId: { in: ids } } },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          userId: true,
          status: true,
          assignmentId: true,
          activityVersion: { select: { activityId: true } },
        },
      }),
      this.prisma.scoped.offering.findMany({
        where: {
          status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
          kind: { in: ['PERMANENT', 'HYBRID'] },
          activityVersion: { activityId: { in: ids } },
        },
        select: { activityVersion: { select: { activityId: true } } },
      }),
    ]);

    // POR RONDA y no por persona: ver `inscripcionDeCadaRonda`. Coger la mas reciente de cada uno
    // hacia que quien completo la ronda 1 saliera con la ronda 2 tambien como TERMINADA.
    const porRonda = inscripcionDeCadaRonda(asignaciones, inscripciones);

    const conPuerta = new Set(convocatorias.map((fila) => fila.activityVersion.activityId));
    const porActividad = new Map<string, EstadoEjecucion[]>();
    const todos: EstadoEjecucion[] = [];

    for (const asignacion of asignaciones) {
      const estado = resolverEstadoEjecucion({
        overdue: asignacion.status === 'OVERDUE',
        assignmentStatus: asignacion.status,
        enrollmentStatus: porRonda.get(asignacion.id)?.status ?? null,
        puedeAutoinscribirse: conPuerta.has(asignacion.targetId),
      });
      const previos = porActividad.get(asignacion.targetId);
      if (previos) previos.push(estado);
      else porActividad.set(asignacion.targetId, [estado]);
      todos.push(estado);
    }

    return { porActividad, todos };
  }

  /**
   * COMO VA TODO, de un vistazo (Decision #122).
   *
   * ─── ESTE NO REUSA `ejecucionDeActividad`, y es la unica excepcion ───
   *
   * Aquella resuelve UNA formacion con cinco consultas cortas, y para un plan de treinta renglones
   * eso son ciento cincuenta: se nota poco y la regla vive en un sitio. Aqui hay entre cien y
   * doscientas formaciones con obligaciones vivas, y ciento cincuenta pasa a ser mil. Esta pantalla
   * es la primera que se abre cada mañana; si tarda cuatro segundos, deja de abrirse.
   *
   * Asi que se traen los datos UNA vez y se agrupan en memoria. Lo que NO se duplica es la regla de
   * estados: se sigue llamando a `resolverEstadoEjecucion`, que es lo unico que no puede tener dos
   * versiones. Optimizar la consulta esta bien; reimplementar el criterio, no.
   */
  async ejecucionGeneral() {
    const lote = await this.estadosPorActividad(null);
    if (lote === null) return { items: [], resumen: resumirEjecucion([]) };
    const { porActividad, todos } = lote;

    const actividades = await this.prisma.scoped.activity.findMany({
      where: { id: { in: [...porActividad.keys()] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        activityType: { select: { name: true, colorHex: true } },
        process: { select: { name: true } },
      },
    });

    const items = actividades
      .map((actividad) => ({
        activityId: actividad.id,
        activityName: actividad.name,
        typeName: actividad.activityType?.name ?? null,
        typeColor: actividad.activityType?.colorHex ?? null,
        processName: actividad.process?.name ?? null,
        resumen: resumirEjecucion(porActividad.get(actividad.id) ?? []),
      }))
      /*
        SE ORDENA POR LO QUE HAY QUE MIRAR, no alfabeticamente: primero lo atrasado, despues lo que
        espera convocatoria, y al final lo que va bien. Una lista alfabetica obliga a recorrerla
        entera para encontrar el problema, y con doscientas formaciones nadie la recorre.
      */
      .sort((a, b) => {
        if (b.resumen.atrasadas !== a.resumen.atrasadas) return b.resumen.atrasadas - a.resumen.atrasadas;
        if (b.resumen.esperando !== a.resumen.esperando) return b.resumen.esperando - a.resumen.esperando;
        return a.resumen.avancePct - b.resumen.avancePct;
      });

    return { items, resumen: resumirEjecucion(todos) };
  }

  /**
   * COMO VA CADA RENGLON DEL PLAN, con su avance real.
   *
   * Es la vista general que da entrada al detalle: el plan tiene un porcentaje arriba y hasta ahora
   * no habia forma de saber que renglon lo esta hundiendo.
   */
  async ejecucionDelPlan(planId: string) {
    /*
      UN RENGLON DEL PLAN APUNTA A UNA CONVOCATORIA, no a una formacion.

      Es la clave del modelo y conviene tenerla presente al leer esto: el plan programa JORNADAS
      —"alturas, en marzo"— y la formacion se alcanza a traves de la version que dicta esa jornada.
      Por eso hay dos saltos hasta el nombre.
    */
    const renglones = await this.prisma.scoped.planItem.findMany({
      where: { planId, status: { not: 'CANCELLED' } },
      orderBy: [{ plannedMonth: 'asc' }],
      select: {
        id: true,
        plannedMonth: true,
        status: true,
        projectedSnapshot: true,
        offering: {
          select: {
            activityVersion: {
              select: {
                activity: { select: { id: true, name: true, activityType: { select: { name: true, colorHex: true } } } },
              },
            },
          },
        },
      },
    });

    /*
      SE RESUELVE UNO A UNO Y NO EN UNA SOLA CONSULTA.

      Un plan tiene entre diez y treinta renglones, asi que son treinta consultas cortas contra una
      gigante con cuatro `LEFT JOIN` y un `GROUP BY` que habria que reescribir cada vez que cambie
      un estado. Con este tamaño la diferencia no se nota, y lo que se gana es que la regla de
      estados viva en UN sitio (`execution-state.ts`) y no repartida entre SQL y TypeScript.

      El dia que un plan tenga trescientos renglones esto se materializa; hoy seria optimizar algo
      que nadie ha medido.
    */
    /*
      UN SOLO LOTE PARA TODOS LOS RENGLONES (Decision #123).

      Antes esto llamaba a `ejecucionDeActividad` dentro de un `map`: cinco consultas por renglon,
      y un plan anual tiene facilmente treinta. Ciento cincuenta consultas para pintar una pestana,
      y creciendo con el plan — justo al reves de lo que debe pasar.
    */
    const lote = await this.estadosPorActividad(renglones.map((renglon) => renglon.offering.activityVersion.activity.id));

    const conAvance = renglones.map((renglon) => {
      const actividad = renglon.offering.activityVersion.activity;
      const resumen = resumirEjecucion(lote?.porActividad.get(actividad.id) ?? []);
      return {
          planItemId: renglon.id,
          activityId: actividad.id,
          activityName: actividad.name,
          typeName: actividad.activityType?.name ?? null,
          typeColor: actividad.activityType?.colorHex ?? null,
          plannedMonth: renglon.plannedMonth,
          status: renglon.status,
          /** Los participantes CONGELADOS al aprobar el plan: es el denominador que pacto el plan. */
        projected: renglon.projectedSnapshot,
        resumen,
      };
    });

    return { items: conAvance };
  }

  /*
    ─────────────────────────────  ANALITICA (Decision #125)  ─────────────────────────────

    Quien administra no entra a preguntar "¿como va la induccion de alturas?": entra a preguntar
    "¿como vamos?" y, acto seguido, "¿donde esta el problema?". Eso son cortes —por area, por
    regional, por norma— sobre el MISMO dato que ya alimenta el seguimiento.

    Se construyen los HECHOS una vez (una obligacion por persona, con su estado y sus dimensiones) y
    se agrupa en memoria por donde se pida. Cuatro consultas fijas, sea una dimension o siete.
  */

  /**
   * Los hechos: una fila por obligacion viva, con el estado resuelto y sus dimensiones.
   *
   * `planId` acota a lo que NACIO DEL PLAN (regla de oro 2, Decision #4): quien ingreso en agosto
   * no hace la jornada de marzo y no puede contar como incumplimiento del plan. Sin `planId` se
   * mira todo lo vivo, que es la otra pregunta legitima.
   */
  private async hechosDeAnalitica(planId: string | null): Promise<HechoAnalitica[]> {
    const asignaciones = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        user: { active: true, deletedAt: null },
        // Lo retirado no cuenta, igual que quien ya no trabaja aqui (ver `ESTADOS_RETIRADOS`).
        status: { notIn: [...ESTADOS_RETIRADOS] },
        ...(planId ? { source: 'PLAN', planItem: { planId } } : {}),
      },
      select: {
        // `id` y `completedEnrollmentId`: la ejecucion se pega a la RONDA, no a la persona
        // (`inscripcionDeCadaRonda`). Sin ellos, quien completo la ronda 1 salia con la 2 terminada.
        id: true,
        userId: true,
        targetId: true,
        status: true,
        completedEnrollmentId: true,
        user: {
          select: {
            // El area de la persona y, si es una SUB-AREA, la madre de la que cuelga: el informe
            // agrupa 'area' por la grande y ofrece 'subarea' como corte fino. Ver `analytics.ts`.
            area: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
            jobTitle: { select: { id: true, name: true } },
            regional: { select: { id: true, name: true } },
            service: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (asignaciones.length === 0) return [];

    const ids = [...new Set(asignaciones.map((fila) => fila.targetId))];

    const [inscripciones, convocatorias, actividades] = await Promise.all([
      this.prisma.scoped.enrollment.findMany({
        where: { activityVersion: { activityId: { in: ids } } },
        orderBy: { enrolledAt: 'desc' },
        select: {
          id: true,
          userId: true,
          status: true,
          assignmentId: true,
          activityVersion: { select: { activityId: true } },
        },
      }),
      this.prisma.scoped.offering.findMany({
        where: {
          status: { in: ['PUBLISHED', 'IN_PROGRESS'] },
          kind: { in: ['PERMANENT', 'HYBRID'] },
          activityVersion: { activityId: { in: ids } },
        },
        select: { activityVersion: { select: { activityId: true } } },
      }),
      this.prisma.scoped.activity.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          process: { select: { id: true, name: true } },
          activityType: { select: { id: true, name: true } },
          norms: { select: { norm: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    // POR RONDA y no por persona: ver `inscripcionDeCadaRonda`. Coger la mas reciente de cada uno
    // hacia que quien completo la ronda 1 saliera con la ronda 2 tambien como TERMINADA.
    const porRonda = inscripcionDeCadaRonda(asignaciones, inscripciones);
    const conPuerta = new Set(convocatorias.map((fila) => fila.activityVersion.activityId));
    const porActividad = new Map(actividades.map((fila) => [fila.id, fila]));

    return asignaciones.map((asignacion) => {
      const actividad = porActividad.get(asignacion.targetId);
      return {
        // El criterio de estado sigue viviendo en UN solo sitio. Aqui solo se agrupa.
        estado: resolverEstadoEjecucion({
          overdue: asignacion.status === 'OVERDUE',
          assignmentStatus: asignacion.status,
          enrollmentStatus: porRonda.get(asignacion.id)?.status ?? null,
          puedeAutoinscribirse: conPuerta.has(asignacion.targetId),
        }),
        area: asignacion.user.area?.parent ?? asignacion.user.area ?? null,
        subarea: asignacion.user.area?.parent ? asignacion.user.area : null,
        cargo: asignacion.user.jobTitle ?? null,
        regional: asignacion.user.regional ?? null,
        servicio: asignacion.user.service ?? null,
        proceso: actividad?.process ?? null,
        tipo: actividad?.activityType ?? null,
        normas: actividad?.norms.map((fila) => fila.norm) ?? [],
      };
    });
  }

  /** La ejecucion agrupada por una dimension. Con `planId`, solo lo que nacio del plan. */
  async analitica(dimension: Dimension, planId: string | null) {
    return agrupar(await this.hechosDeAnalitica(planId), dimension);
  }

  /**
   * TODAS las dimensiones de una pasada.
   *
   * La pantalla las enseña juntas —quien decide compara "el area X va mal" con "la regional Y va
   * mal" en el mismo golpe de vista— y pedirlas una a una serian siete viajes que traen exactamente
   * los mismos hechos. Se calculan una vez y se agrupan siete veces, que es gratis al lado de la
   * consulta.
   */
  async analiticaCompleta(planId: string | null) {
    const hechos = await this.hechosDeAnalitica(planId);
    const dimensiones = Object.keys(DIMENSIONES) as Dimension[];
    return {
      resumen: resumirEjecucion(hechos.map((hecho) => hecho.estado)),
      dimensiones: dimensiones.map((dimension) => agrupar(hechos, dimension)),
    };
  }

  /**
   * LA EVOLUCION EN EL TIEMPO (2026-09-09).
   *
   * ─── LA PREGUNTA QUE NINGUN INFORME CONTESTABA ───
   *
   * Todo lo que hay —seguimiento, analitica, vencimientos— es una FOTO DE HOY. Sirve para «¿como
   * vamos?» y no sirve para «¿vamos mejor que en enero?», que es la que se hace en el comite
   * mensual y la que decide si lo que se hizo funciono.
   *
   * ─── QUE SE MIDE, EXACTAMENTE, Y QUE NO ───
   *
   * Cada mes cuenta **las obligaciones que VENCIAN en ese mes** y cuantas de ellas se cumplieron.
   * No es un historico del indicador: nadie guardo cual era el porcentaje el 1 de marzo, y
   * reconstruirlo seria inventarlo. Es la pregunta de al lado, y es la util: «de lo que habia que
   * hacer en marzo, ¿cuanto se hizo?».
   *
   * **Y se separa lo cumplido A TIEMPO de lo cumplido tarde.** Las dos cosas son cumplimiento, pero
   * solo la primera es cumplimiento del PLAZO — y en una auditoria esa distincion es justo la que
   * preguntan. Juntarlas deja un numero mas bonito y menos cierto.
   *
   * Un mes SIN obligaciones que venzan sale con `pct: null` y no con cero: no haber tenido nada que
   * hacer no es haberlo hecho mal, y pintarlo como cero dibuja un valle que no existio.
   */
  async evolucion(year: number) {
    const desde = new Date(Date.UTC(year, 0, 1));
    const hasta = new Date(Date.UTC(year + 1, 0, 1));

    const asignaciones = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        user: { active: true, deletedAt: null },
        status: { notIn: [...ESTADOS_RETIRADOS] },
        dueAt: { gte: desde, lt: hasta },
      },
      select: { dueAt: true, completedAt: true, status: true },
    });

    const meses = Array.from({ length: 12 }, (_, indice) => {
      const delMes = asignaciones.filter((fila) => fila.dueAt && fila.dueAt.getUTCMonth() === indice);
      const cumplidas = delMes.filter((fila) => fila.completedAt !== null);
      const aTiempo = cumplidas.filter((fila) => fila.dueAt && fila.completedAt! <= fila.dueAt);
      return {
        mes: indice + 1,
        vencian: delMes.length,
        cumplidas: cumplidas.length,
        aTiempo: aTiempo.length,
        /** Porcentaje de lo que vencia ese mes que se cumplio. `null` = ese mes no vencia nada. */
        pct: delMes.length === 0 ? null : Math.round((cumplidas.length / delMes.length) * 100),
      };
    });

    const vencian = asignaciones.length;
    const cumplidas = asignaciones.filter((fila) => fila.completedAt !== null).length;
    return {
      year,
      meses,
      resumen: {
        vencian,
        cumplidas,
        aTiempo: asignaciones.filter((fila) => fila.completedAt !== null && fila.dueAt && fila.completedAt <= fila.dueAt)
          .length,
        pct: vencian === 0 ? null : Math.round((cumplidas / vencian) * 100),
      },
    };
  }

  /**
   * EN QUE FALLA LA GENTE (2026-09-09).
   *
   * ─── LA PREGUNTA QUE FALTABA ───
   *
   * Los informes dicen cuantos aprobaron. Ninguno dice **que fallaron**, que es lo unico de todo
   * esto que se convierte directamente en una formacion: «el 68 % falla lo de alturas» es un
   * renglon del plan; «el 91 % aprobo» no es nada que hacer.
   *
   * ─── COMO SE CUENTA, Y QUE SE DEJA FUERA ───
   *
   * Por PUNTOS y no por preguntas acertadas: una pregunta de cinco puntos y una de uno no pesan
   * igual en el examen, y contarlas iguales aqui diria algo distinto de lo que dijo la nota.
   *
   * - **Lo anulado no cuenta.** Una pregunta anulada y recalificada no mide conocimiento, mide que
   *   la pregunta estaba mal.
   * - **Lo no calificado tampoco.** Una abierta esperando a que alguien la lea no es un cero: es
   *   una respuesta que todavia no se ha mirado.
   * - **Las preguntas sin tema salen aparte, no se reparten.** Son la mayoria al principio —el tema
   *   es opcional (#84)— y esconderlas daria un cuadro falso de cobertura.
   *
   * ─── EL COSTE ───
   *
   * Se agrupa en la BASE (`groupBy` por version de pregunta) y no en memoria: con 900 personas y
   * diez preguntas por examen, traerse las respuestas una a una serian decenas de miles de filas
   * para calcular veinte promedios.
   */
  async conocimiento() {
    const porVersion = await this.prisma.scoped.attemptQuestion.groupBy({
      by: ['questionVersionId'],
      where: { invalidated: false, pointsAwarded: { not: null } },
      _sum: { pointsPossible: true, pointsAwarded: true },
      _count: { _all: true },
    });
    if (porVersion.length === 0) return { porTema: [], peoresPreguntas: [] };

    const versiones = await this.prisma.scoped.questionVersion.findMany({
      where: { id: { in: porVersion.map((fila) => fila.questionVersionId) } },
      select: {
        id: true,
        stem: true,
        question: { select: { category: { select: { id: true, name: true } } } },
      },
    });
    const datosDe = new Map(versiones.map((version) => [version.id, version]));

    const filas = porVersion.map((fila) => {
      const version = datosDe.get(fila.questionVersionId);
      const posibles = Number(fila._sum.pointsPossible ?? 0);
      const obtenidos = Number(fila._sum.pointsAwarded ?? 0);
      return {
        questionVersionId: fila.questionVersionId,
        stem: version?.stem ?? '',
        categoryId: version?.question.category?.id ?? null,
        categoryName: version?.question.category?.name ?? null,
        respuestas: fila._count._all,
        posibles,
        obtenidos,
        aciertoPct: posibles === 0 ? null : Math.round((obtenidos / posibles) * 100),
      };
    });

    const temas = [...new Set(filas.map((fila) => fila.categoryId))].map((categoryId) => {
      const suyas = filas.filter((fila) => fila.categoryId === categoryId);
      const posibles = suyas.reduce((suma, fila) => suma + fila.posibles, 0);
      const obtenidos = suyas.reduce((suma, fila) => suma + fila.obtenidos, 0);
      return {
        categoryId,
        name: suyas[0]?.categoryName ?? 'Sin tema',
        preguntas: suyas.length,
        respuestas: suyas.reduce((suma, fila) => suma + fila.respuestas, 0),
        aciertoPct: posibles === 0 ? null : Math.round((obtenidos / posibles) * 100),
      };
    });

    /*
      LAS PREGUNTAS MAS FALLADAS, con un SUELO de cinco respuestas.
      Sin ese suelo, la peor pregunta del informe seria siempre una que contesto una sola persona
      —un 0 % sobre una respuesta— y el informe mandaria a formar a toda la empresa por eso.

      Y la lectura de esta lista es doble, por eso va con su numero de respuestas al lado: una
      pregunta que falla casi todo el mundo o no se enseño, o esta mal redactada. Las dos cosas hay
      que arreglarlas, en sitios distintos.
    */
    const peoresPreguntas = filas
      .filter((fila) => fila.respuestas >= 5 && fila.aciertoPct !== null)
      .sort((a, b) => (a.aciertoPct ?? 100) - (b.aciertoPct ?? 100))
      .slice(0, 8)
      .map((fila) => ({
        questionVersionId: fila.questionVersionId,
        stem: fila.stem,
        categoryName: fila.categoryName,
        respuestas: fila.respuestas,
        aciertoPct: fila.aciertoPct,
      }));

    return {
      porTema: temas.sort((a, b) => (a.aciertoPct ?? 100) - (b.aciertoPct ?? 100)),
      peoresPreguntas,
    };
  }

  /**
   * QUE SE VENCE EN LOS PROXIMOS N MESES, persona por persona (Decision #126; eje y fuentes
   * corregidos el 2026-09-08, `PENDIENTES` 3.1 y 3.2).
   *
   * El porque del eje —REPROGRAMAR frente a PERSEGUIR, y no «de que tabla salio»— esta escrito en
   * `expirations.ts`. Aqui esta lo que cuesta: **tres consultas de fechas y una cuarta de historia**,
   * porque la clase de una obligacion abierta no se puede saber mirandola a ella sola.
   *
   * Se devuelve la lista nominal ademas del calendario porque la pregunta siguiente siempre es
   * "¿quienes?", y sin nombres no se puede convocar a nadie.
   *
   * `db` existe para el AVISO SEMANAL (`expiration-digest.worker.ts`), que corre sin peticion y por
   * tanto sin contexto de tenant: le pasa su cliente atado. Es la misma consulta que pinta la
   * pantalla a proposito — un calculo paralelo "para el aviso" acabaria diciendo un numero distinto
   * del que se ve al entrar, y entonces no se creeria ninguno de los dos.
   */
  /**
   * COMO VA CADA PROGRAMA, Y QUE LO ESTA FRENANDO (2026-09-16).
   *
   * ─── EL HUECO QUE TAPA ───
   *
   * Ningun informe sabia que existen los programas. Un programa de 8 modulos exigido a 660 personas
   * salia en Seguimiento como **5.280 renglones sueltos**, y la pregunta que el cliente hace de
   * verdad —*"¿cuanta gente tiene la Induccion General completa?"*— no se podia contestar sin
   * sumarlos a mano. El producto certifica el CONJUNTO y los informes solo hablaban de las partes.
   *
   * ─── Y LO QUE LO HACE UTIL, QUE NO ES EL PORCENTAJE ───
   *
   * El % de completos dice COMO VA; no dice QUE HACER. Lo accionable es el **cuello de botella**:
   * de los que no han terminado, ¿que modulo es el que mas gente tiene sin aprobar? Con eso, una
   * sola convocatoria de esa formacion cierra el programa de decenas de personas a la vez. Sin eso,
   * el informe obliga a abrir persona por persona para descubrir que a casi todas les falta lo
   * mismo.
   *
   * ─── EL DENOMINADOR ES A QUIEN SE LE EXIGE, no quien tiene inscripcion ───
   *
   * `PathEnrollment` solo nace cuando alguien cierra su primer modulo, asi que contar por ahi
   * dejaria fuera justo a quien no ha empezado — que es la gente a la que hay que perseguir. Se
   * cuenta por OBLIGACION: quien tiene una `Assignment` de cualquier modulo esta dentro del
   * programa, haya hecho algo o no.
   */
  async programas() {
    const programas = await this.prisma.scoped.learningPath.findMany({
      where: { status: 'PUBLISHED', active: true },
      include: { items: true },
      orderBy: { name: 'asc' },
    });
    if (programas.length === 0) return [];

    const idsDeActividad = [
      ...new Set(programas.flatMap((p) => p.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId))),
    ];
    const [actividades, asignaciones, inscripciones, cursadas] = await Promise.all([
      idsDeActividad.length
        ? this.prisma.scoped.activity.findMany({ where: { id: { in: idsDeActividad } }, select: { id: true, name: true } })
        : [],
      idsDeActividad.length
        ? this.prisma.scoped.assignment.findMany({
            where: { targetType: 'ACTIVITY', targetId: { in: idsDeActividad } },
            orderBy: { cycleNumber: 'desc' },
            select: { userId: true, targetId: true, status: true },
          })
        : [],
      this.prisma.scoped.pathEnrollment.findMany({
        where: { pathId: { in: programas.map((p) => p.id) } },
        orderBy: { cycleNumber: 'desc' },
        select: { pathId: true, userId: true, status: true },
      }),
      // Quien INTENTO un modulo, aprobado o no: es lo que separa "no lo ha hecho" de "lo reprobo".
      idsDeActividad.length
        ? this.prisma.scoped.enrollment.findMany({
            where: { activityVersion: { activityId: { in: idsDeActividad } } },
            select: { userId: true, activityVersion: { select: { activityId: true } } },
          })
        : [],
    ]);
    const nombrePorActividad = new Map(actividades.map((a) => [a.id, a.name]));
    const intentos = new Set(cursadas.map((e) => `${e.userId}:${e.activityVersion.activityId}`));

    // Ordenadas por ciclo desc: la primera que se ve de cada par ES la vigente.
    const vigente = new Map<string, string>();
    for (const a of asignaciones) {
      const clave = `${a.userId}:${a.targetId}`;
      if (!vigente.has(clave)) vigente.set(clave, a.status);
    }
    const inscripcionVigente = new Map<string, string>();
    for (const i of inscripciones) {
      const clave = `${i.userId}:${i.pathId}`;
      if (!inscripcionVigente.has(clave)) inscripcionVigente.set(clave, i.status);
    }

    return programas.map((programa) => {
      const modulos = new Set(programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId));
      /*
        LAS RETIRADAS NO CUENTAN, NI ARRIBA NI ABAJO (2026-09-16).

        `WITHDRAWN_LEFT_AUDIENCE` es quien salio de la audiencia: el programa **ya no le aplica**.
        Contarlas inflaba las dos cifras que mas importan — en el tenant de dev, 170 de las 172
        "alcanzadas" eran retiradas, y el cuello de botella decia "166 sin hacer" sobre gente a la
        que nadie le exige nada. Un informe que cuenta obligaciones muertas manda a perseguir a
        quien no debe nada.
      */
      const vigenteParaElPrograma = (userId: string, activityId: string) => {
        const estado = vigente.get(`${userId}:${activityId}`);
        return estado && !estado.startsWith('WITHDRAWN') ? estado : null;
      };

      const alcanzados = new Set<string>();
      for (const a of asignaciones) {
        if (modulos.has(a.targetId) && vigenteParaElPrograma(a.userId, a.targetId)) alcanzados.add(a.userId);
      }

      let completos = 0;
      let aFaltaDeUno = 0;
      let sinEmpezar = 0;
      /*
        EL CUELLO DE BOTELLA SE PARTE EN DOS, porque son dos problemas opuestos (2026-09-16).

        Un modulo que mucha gente tiene atascado puede serlo por dos razones que piden acciones
        contrarias: **no lo han hecho** (falta programar una convocatoria) o **lo intentaron y lo
        reprobaron** (hay algo que revisar en el contenido o en la dificultad). Contados juntos, el
        numero manda a hacer lo que no era la mitad de las veces.

        Se distingue por el `Enrollment`: si existe uno de esa persona para ese modulo, lo intento.
      */
      const frenanPorModulo = new Map<string, { sinHacer: number; reprobados: number }>();
      for (const userId of alcanzados) {
        if (inscripcionVigente.get(`${userId}:${programa.id}`) === 'COMPLETED') {
          completos += 1;
          continue;
        }
        let leFaltan = 0;
        let aprobadosDeLaPersona = 0;
        let tocoAlgo = false;
        // De los que NO han terminado: que modulos tienen sin aprobar. Un modulo que esa persona no
        // tiene asignado no la frena — no se le debe.
        for (const activityId of modulos) {
          const estado = vigenteParaElPrograma(userId, activityId);
          if (!estado) continue;
          if (estado === 'COMPLETED') {
            aprobadosDeLaPersona += 1;
            tocoAlgo = true;
            continue;
          }
          // EXIMIDA esta resuelta: el cupo la absorbe y no frena a nadie.
          if (estado === 'WAIVED') continue;
          leFaltan += 1;
          const intentado = intentos.has(`${userId}:${activityId}`);
          if (intentado) tocoAlgo = true;
          const actual = frenanPorModulo.get(activityId) ?? { sinHacer: 0, reprobados: 0 };
          if (intentado) actual.reprobados += 1;
          else actual.sinHacer += 1;
          frenanPorModulo.set(activityId, actual);
        }
        /*
          "A FALTA DE UNO" EXIGE HABER APROBADO ALGO (2026-09-16).

          Sin esa condicion, quien solo tiene UN modulo exigido y no lo ha hecho contaba a la vez
          como "a falta de 1" y como "sin empezar" — las dos columnas se solapaban y sumaban mas que
          el total. Y sobre todo decia lo contrario de lo que significa: la cifra existe para
          senalar a quien esta A PUNTO, no a quien no ha empezado.
        */
        if (leFaltan === 1 && aprobadosDeLaPersona > 0) aFaltaDeUno += 1;
        if (!tocoAlgo) sinEmpezar += 1;
      }

      const peor = [...frenanPorModulo.entries()].sort((a, b) => b[1].sinHacer + b[1].reprobados - (a[1].sinHacer + a[1].reprobados))[0];
      return {
        id: programa.id,
        code: programa.code,
        name: programa.name,
        modulos: modulos.size,
        alcanzados: alcanzados.size,
        completos,
        enCurso: alcanzados.size - completos,
        cumplimientoPct: alcanzados.size === 0 ? 0 : Math.round((completos / alcanzados.size) * 100),
        /** Les falta UN solo modulo. Es a quien mas rinde perseguir: una jornada y cierran. */
        aFaltaDeUno,
        /** No han tocado NADA del programa. Es un problema distinto: no han entrado. */
        sinEmpezar,
        cuelloDeBotella: peor
          ? {
              activityId: peor[0],
              name: nombrePorActividad.get(peor[0]) ?? '',
              personas: peor[1].sinHacer + peor[1].reprobados,
              sinHacer: peor[1].sinHacer,
              reprobados: peor[1].reprobados,
            }
          : null,
      };
    });
  }

  /**
   * ABRIR UN PROGRAMA: ¿QUIENES SON LOS QUE FALTAN? (2026-09-16)
   *
   * Es el mismo hueco que este modulo existe para tapar, un nivel mas arriba: habia un porcentaje y
   * ninguna forma de abrirlo. "0% de 172" no dice a quien llamar.
   *
   * **Ordenado por lo que les FALTA, de menos a mas**, y esa es la decision que hace util la lista:
   * quien va a falta de un modulo se cierra con una convocatoria, y quien no ha empezado necesita
   * otra conversacion. Puestos por nombre, los dos grupos quedan mezclados y hay que leerse los 172.
   */
  async programaDetalle(pathId: string) {
    const programa = await this.prisma.scoped.learningPath.findUnique({ where: { id: pathId }, include: { items: true } });
    if (!programa) return null;

    const idsDeActividad = programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId);
    if (idsDeActividad.length === 0) return { programa: { id: programa.id, name: programa.name }, personas: [] };

    const [actividades, asignaciones, inscripciones, cursadas] = await Promise.all([
      this.prisma.scoped.activity.findMany({ where: { id: { in: idsDeActividad } }, select: { id: true, name: true } }),
      this.prisma.scoped.assignment.findMany({
        where: { targetType: 'ACTIVITY', targetId: { in: idsDeActividad } },
        orderBy: { cycleNumber: 'desc' },
        select: {
          userId: true,
          targetId: true,
          status: true,
          dueAt: true,
          user: { select: { id: true, fullName: true, documentNumber: true, jobTitle: { select: { name: true } } } },
        },
      }),
      this.prisma.scoped.pathEnrollment.findMany({
        where: { pathId },
        orderBy: { cycleNumber: 'desc' },
        select: { userId: true, status: true },
      }),
      this.prisma.scoped.enrollment.findMany({
        where: { activityVersion: { activityId: { in: idsDeActividad } } },
        select: { userId: true, activityVersion: { select: { activityId: true } } },
      }),
    ]);
    const nombrePorActividad = new Map(actividades.map((a) => [a.id, a.name]));
    const intentos = new Set(cursadas.map((e) => `${e.userId}:${e.activityVersion.activityId}`));

    const completado = new Set(inscripciones.filter((i) => i.status === 'COMPLETED').map((i) => i.userId));

    // Ordenadas por ciclo desc: la primera de cada par es la vigente.
    const porPersona = new Map<
      string,
      {
        user: { id: string; fullName: string; documentNumber: string; jobTitle: { name: string } | null };
        modulos: Map<string, { status: string; dueAt: Date | null }>;
      }
    >();
    for (const a of asignaciones) {
      const entrada = porPersona.get(a.userId) ?? { user: a.user, modulos: new Map() };
      if (!entrada.modulos.has(a.targetId)) entrada.modulos.set(a.targetId, { status: a.status, dueAt: a.dueAt });
      porPersona.set(a.userId, entrada);
    }

    const personas = [...porPersona.entries()].map(([userId, entrada]) => {
      const faltan: Array<{ activityId: string; name: string; intentado: boolean }> = [];
      let aprobados = 0;
      let exigidos = 0;
      for (const [activityId, estado] of entrada.modulos) {
        // RETIRADA: salio de la audiencia, el modulo ya no le aplica. No cuenta ni como exigido.
        if (estado.status.startsWith('WITHDRAWN')) continue;
        exigidos += 1;
        if (estado.status === 'COMPLETED') {
          aprobados += 1;
          continue;
        }
        // EXIMIDA esta resuelta: sigue exigida pero no falta, y el cupo la absorbe.
        if (estado.status === 'WAIVED') continue;
        faltan.push({
          activityId,
          name: nombrePorActividad.get(activityId) ?? '',
          intentado: intentos.has(`${userId}:${activityId}`),
        });
      }
      const vence = [...entrada.modulos.values()]
        .filter((m) => m.status !== 'COMPLETED' && m.dueAt)
        .map((m) => m.dueAt as Date)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return {
        userId,
        fullName: entrada.user.fullName,
        documentNumber: entrada.user.documentNumber,
        jobTitle: entrada.user.jobTitle?.name ?? null,
        exigidos,
        aprobados,
        completo: completado.has(userId),
        faltan,
        venceEl: vence ? vence.toISOString() : null,
      };
    });

    // Quien tiene TODAS sus obligaciones retiradas ya no esta en el programa: no sale.
    const activas = personas.filter((p) => p.exigidos > 0);

    // Los completos al final: la lista existe para perseguir, no para felicitar. Y entre los que
    // faltan, primero los que estan mas cerca — una convocatoria los cierra.
    activas.sort((a, b) => {
      if (a.completo !== b.completo) return a.completo ? 1 : -1;
      if (a.faltan.length !== b.faltan.length) return a.faltan.length - b.faltan.length;
      return a.fullName.localeCompare(b.fullName, 'es');
    });

    return { programa: { id: programa.id, name: programa.name }, personas: activas };
  }

  async vencimientos(meses: number, hoy = new Date(), db?: TenantPrisma) {
    const cliente = db ?? this.prisma.scoped;
    const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const hasta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + meses, 1));

    const persona = {
      select: {
        id: true,
        fullName: true,
        documentNumber: true,
        area: { select: { name: true } },
        jobTitle: { select: { name: true } },
        regional: { select: { name: true } },
      },
    } as const;

    const [porPapel, porConstancia, abiertas] = await Promise.all([
      /*
        1. LO QUE DICE EL PAPEL DE UN TERCERO (#157).

        Vive en la OBLIGACION y no en la inscripcion —una convalidada no tiene jornada— y manda sobre
        la vigencia que calcularia la recurrencia. Solo de obligaciones ya cerradas: en una abierta
        el papel todavia no acredita nada.
      */
      cliente.assignment.findMany({
        where: {
          targetType: 'ACTIVITY',
          status: 'COMPLETED',
          validUntilOverride: { not: null, lt: hasta },
          user: { active: true, deletedAt: null },
        },
        select: { validUntilOverride: true, targetId: true, user: persona },
      }),
      /*
        2. LA CONSTANCIA PROPIA (#111), que caduca cuando toca repetir la formacion.

        La formacion se saca por la inscripcion, que es donde vive la version cursada. Una constancia
        REVOCADA no vence: ya no acredita nada, y sacarla aqui pondria a alguien a reprogramar algo
        que hay que volver a hacer por otro motivo.
      */
      /*
        `certificates` guarda `enrollment_id` pero NO declara la relacion hacia `enrollments` —igual
        que `certification_grants` con `users`—, asi que la formacion y la persona no se pueden
        traer en el mismo select. Se piden las constancias y despues sus inscripciones: una consulta
        mas y ninguna suposicion sobre el esquema.
      */
      cliente.certificate.findMany({
        where: { validUntil: { not: null, lt: hasta }, revokedAt: null, enrollmentId: { not: null } },
        select: { validUntil: true, enrollmentId: true },
      }),
      /*
        3. LAS OBLIGACIONES ABIERTAS, con su fecha limite.

        Una ya cumplida no vence por aqui: lo que vence es su PAPEL, y de eso se encargan las dos
        consultas de arriba. Incluir las cerradas llenaria el calendario de trabajo ya hecho, que es
        la forma mas rapida de que nadie vuelva a mirarlo.
      */
      cliente.assignment.findMany({
        where: {
          targetType: 'ACTIVITY',
          status: { in: ['PENDING', 'OVERDUE'] },
          dueAt: { not: null, lt: hasta },
          user: { active: true, deletedAt: null },
        },
        select: { dueAt: true, targetId: true, userId: true, user: persona },
      }),
    ]);

    const actividadesPedidas = [
      ...new Set([...porPapel.map((fila) => fila.targetId), ...abiertas.map((fila) => fila.targetId)]),
    ];

    const [actividades, cumplidasAntes, inscripcionesDeConstancia] = await Promise.all([
      cliente.activity.findMany({
        where: { id: { in: actividadesPedidas } },
        select: { id: true, name: true },
      }),
      /*
        LA CUARTA CONSULTA: ¿YA LA TUVO ALGUNA VEZ?

        Es la que decide si una obligacion abierta se PERSIGUE o se REPROGRAMA, y no se puede
        contestar mirando la obligacion: la de este año no sabe nada de la del anterior. Se pregunta
        por lo CUMPLIDO de esas mismas personas y formaciones.

        `WAIVED` no cuenta y la diferencia importa: eximir es dejarla pasar, no haberla hecho. Quien
        fue eximido el año pasado y hoy la debe otra vez es alguien a quien PERSEGUIR — nunca la tuvo.
        Convalidar, en cambio, deja `COMPLETED` (via C) y cuenta: la hizo, en otro empleo.
      */
      cliente.assignment.findMany({
        where: {
          targetType: 'ACTIVITY',
          status: 'COMPLETED',
          userId: { in: [...new Set(abiertas.map((fila) => fila.userId))] },
          targetId: { in: [...new Set(abiertas.map((fila) => fila.targetId))] },
        },
        select: { userId: true, targetId: true },
      }),
      // Las inscripciones de esas constancias: de ahi salen la persona y la formacion que se cursó.
      // Quien ya no trabaja se descarta al cruzar, igual que en las otras dos fuentes.
      cliente.enrollment.findMany({
        where: {
          id: { in: [...new Set(porConstancia.map((fila) => fila.enrollmentId as string))] },
          user: { active: true, deletedAt: null },
        },
        select: {
          id: true,
          user: persona,
          activityVersion: { select: { activity: { select: { id: true, name: true } } } },
        },
      }),
    ]);
    const nombreDeActividad = new Map(actividades.map((fila) => [fila.id, fila.name]));
    const inscripcionDeConstancia = new Map(inscripcionesDeConstancia.map((fila) => [fila.id, fila]));
    const yaLaTuvo = new Set(cumplidasAntes.map((fila) => `${fila.userId}|${fila.targetId}`));

    const dimensionesDe = (quien: {
      id: string;
      fullName: string;
      documentNumber: string;
      area: { name: string } | null;
      jobTitle: { name: string } | null;
      regional: { name: string } | null;
    }) => ({
      personaId: quien.id,
      personaNombre: quien.fullName,
      documento: quien.documentNumber,
      area: quien.area?.name ?? null,
      cargo: quien.jobTitle?.name ?? null,
      regional: quien.regional?.name ?? null,
    });

    const candidatos: HechoVencimiento[] = [
      ...porPapel.map((fila) => ({
        clase: 'REPROGRAMAR' as const,
        fuente: 'PAPEL_DE_TERCERO' as const,
        fecha: fila.validUntilOverride as Date,
        ...dimensionesDe(fila.user),
        formacion: nombreDeActividad.get(fila.targetId) ?? 'Formacion',
        actividadId: fila.targetId,
      })),
      ...porConstancia.flatMap((fila) => {
        // Sin inscripcion viva no hay nada que reprogramar: o la persona se retiro, o es una
        // constancia nacida de una certificacion otorgada —que hoy no las escribe nadie— y no habria
        // ni formacion que nombrar.
        const inscripcion = inscripcionDeConstancia.get(fila.enrollmentId as string);
        if (!inscripcion) return [];
        return [
          {
            clase: 'REPROGRAMAR' as const,
            fuente: 'CONSTANCIA' as const,
            fecha: fila.validUntil as Date,
            ...dimensionesDe(inscripcion.user),
            formacion: inscripcion.activityVersion.activity.name,
            actividadId: inscripcion.activityVersion.activity.id,
          },
        ];
      }),
      ...abiertas.map((fila) => ({
        clase: yaLaTuvo.has(`${fila.userId}|${fila.targetId}`)
          ? ('REPROGRAMAR' as const)
          : ('PERSEGUIR' as const),
        fuente: 'OBLIGACION_ABIERTA' as const,
        fecha: fila.dueAt as Date,
        ...dimensionesDe(fila.user),
        formacion: nombreDeActividad.get(fila.targetId) ?? 'Formacion',
        actividadId: fila.targetId,
      })),
    ];

    // Y una sola fila por persona y formacion: la ventana de 60 dias las hacia salir dos veces.
    const hechos = consolidarVencimientos(candidatos);

    return {
      resumen: resumirVencimientos(hechos, hoy),
      calendario: calendarioDeVencimientos(hechos, desde, meses),
      items: hechos,
    };
  }

  /*
    ─────────────────────────  LO QUE SE LLEVA EL AUDITOR  ─────────────────────────

    Las dos exportaciones llaman a los MISMOS metodos que pinta la pantalla y solo dan formato. Es
    deliberado: una consulta paralela "para el informe" acaba divergiendo —un filtro que se cambia
    en un sitio y no en el otro— y entonces el archivo y la pantalla dicen cosas distintas del
    mismo dia. Cuando eso pasa no se sabe cual de los dos creer, asi que dejan de servir los dos.

    El filtro por estado se aplica DESPUES, sobre las mismas filas, por lo mismo.
  */

  /** El nombre de la empresa encabeza el archivo: sin el, un xlsx suelto no es evidencia de nadie. */
  private async nombreDelTenant(): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: this.prisma.currentTenantId },
      select: { name: true },
    });
    return tenant?.name ?? 'Ascent';
  }

  async ejecucionGeneralXlsx(estado: EstadoEjecucion | null): Promise<Buffer> {
    const [{ items }, tenantName] = await Promise.all([this.ejecucionGeneral(), this.nombreDelTenant()]);

    /*
      CON UN FILTRO PUESTO SE EXPORTAN LAS FORMACIONES QUE LO TIENEN, y no las filas del estado.

      Es lo mismo que hace la pantalla al pulsar un chip: "atrasadas" deja las formaciones con al
      menos una atrasada, con su desglose completo al lado. Recortar tambien las columnas dejaria un
      archivo donde no se ve sobre cuanto es ese numero, que es la pregunta siguiente.
    */
    const filtradas = estado === null ? items : items.filter((item) => contarEstado(item.resumen, estado) > 0);

    return libroDeEjecucionGeneral(filtradas, { tenantName, generadoEn: new Date(), estado });
  }

  async ejecucionDeActividadXlsx(activityId: string, estado: EstadoEjecucion | null): Promise<Buffer> {
    const [{ items }, tenantName, actividad] = await Promise.all([
      this.ejecucionDeActividad(activityId),
      this.nombreDelTenant(),
      this.prisma.scoped.activity.findUnique({ where: { id: activityId }, select: { name: true } }),
    ]);

    const filtradas = estado === null ? items : items.filter((item) => item.estado === estado);

    return libroDeEjecucionDeActividad(filtradas, {
      tenantName,
      generadoEn: new Date(),
      formacion: actividad?.name ?? null,
      estado,
    });
  }
}

/** Cuantas hay de un estado en un resumen ya calculado. */
function contarEstado(resumen: ReturnType<typeof resumirEjecucion>, estado: EstadoEjecucion): number {
  switch (estado) {
    case 'TERMINADA':
      return resumen.terminadas;
    case 'EN_CURSO':
      return resumen.enCurso;
    case 'SIN_EMPEZAR':
      return resumen.sinEmpezar;
    case 'ATRASADA':
      return resumen.atrasadas;
    case 'REPROBADA':
      return resumen.reprobadas;
    case 'ESPERANDO':
      return resumen.esperando;
    case 'NO_REALIZADA':
      return resumen.noRealizadas;
    case 'EXIMIDA':
      return resumen.eximidas;
  }
}
