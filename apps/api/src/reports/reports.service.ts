import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ESTADOS_RETIRADOS,
  inscripcionDeCadaRonda,
  resolverEstadoEjecucion,
  resumirEjecucion,
  type EstadoEjecucion,
} from './execution-state.js';
import { DIMENSIONES, agrupar, type Dimension, type HechoAnalitica } from './analytics.js';
import {
  calendario as calendarioDeVencimientos,
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
      hecha el 2 de enero de cada ano.

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

    return { items, resumen: resumirEjecucion(items.map((item) => item.estado)) };
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
   * es la primera que se abre cada manana; si tarda cuatro segundos, deja de abrirse.
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
      un estado. Con este tamano la diferencia no se nota, y lo que se gana es que la regla de
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
            area: { select: { id: true, name: true } },
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
        area: asignacion.user.area ?? null,
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
   * La pantalla las ensena juntas —quien decide compara "el area X va mal" con "la regional Y va
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
   * QUE SE VENCE EN LOS PROXIMOS N MESES, persona por persona (Decision #126).
   *
   * Dos fuentes que no se mezclan (ver `expirations.ts`): certificaciones que caducan y
   * obligaciones abiertas con fecha limite. Se devuelve la lista nominal ademas del calendario
   * porque la pregunta siguiente siempre es "¿quienes?", y sin nombres no se puede convocar a
   * nadie.
   */
  async vencimientos(meses: number, hoy = new Date()) {
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

    const [certificaciones, obligaciones] = await Promise.all([
      /*
        `certification_grants` guarda `user_id` pero NO expone la relacion hacia `users`, asi que la
        persona no se puede traer en el mismo select ni filtrar por "activa" desde aqui. Se piden
        los otorgamientos y despues las personas, y quien ya no trabaja se descarta al cruzar: es
        una consulta mas y ninguna suposicion sobre el esquema.
      */
      this.prisma.scoped.certificationGrant.findMany({
        where: { status: 'ACTIVE', validUntil: { not: null, lt: hasta } },
        select: { validUntil: true, userId: true, certification: { select: { name: true } } },
      }),
      /*
        SOLO LAS OBLIGACIONES ABIERTAS.

        Una que ya se cumplio no vence: se volvera a exigir cuando toque la ronda siguiente, y esa
        obligacion todavia no existe. Incluir las cerradas llenaria el calendario de trabajo que ya
        esta hecho, que es la forma mas rapida de que nadie vuelva a mirarlo.
      */
      this.prisma.scoped.assignment.findMany({
        where: {
          targetType: 'ACTIVITY',
          status: { in: ['PENDING', 'OVERDUE'] },
          dueAt: { not: null, lt: hasta },
          user: { active: true, deletedAt: null },
        },
        select: { dueAt: true, targetId: true, user: persona },
      }),
    ]);

    const [actividades, personasDeCertificacion] = await Promise.all([
      this.prisma.scoped.activity.findMany({
        where: { id: { in: [...new Set(obligaciones.map((fila) => fila.targetId))] } },
        select: { id: true, name: true },
      }),
      this.prisma.scoped.user.findMany({
        where: {
          id: { in: [...new Set(certificaciones.map((fila) => fila.userId))] },
          active: true,
          deletedAt: null,
        },
        ...persona,
      }),
    ]);
    const nombreDeActividad = new Map(actividades.map((fila) => [fila.id, fila.name]));
    const porPersona = new Map(personasDeCertificacion.map((fila) => [fila.id, fila]));

    const hechos: HechoVencimiento[] = [
      ...certificaciones.flatMap((fila) => {
        const quien = porPersona.get(fila.userId);
        // Sin persona viva no hay vencimiento que atender: se retiro de la empresa.
        if (!quien) return [];
        return [
          {
            clase: 'CERTIFICACION' as const,
            fecha: fila.validUntil as Date,
            personaId: quien.id,
            personaNombre: quien.fullName,
            documento: quien.documentNumber,
            area: quien.area?.name ?? null,
            cargo: quien.jobTitle?.name ?? null,
            regional: quien.regional?.name ?? null,
            formacion: fila.certification.name,
            actividadId: null,
          },
        ];
      }),
      ...obligaciones.map((fila) => ({
        clase: 'OBLIGACION' as const,
        fecha: fila.dueAt as Date,
        personaId: fila.user.id,
        personaNombre: fila.user.fullName,
        documento: fila.user.documentNumber,
        area: fila.user.area?.name ?? null,
        cargo: fila.user.jobTitle?.name ?? null,
        regional: fila.user.regional?.name ?? null,
        formacion: nombreDeActividad.get(fila.targetId) ?? 'Formacion',
        actividadId: fila.targetId,
      })),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

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
    return tenant?.name ?? 'NEO PULSE';
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
