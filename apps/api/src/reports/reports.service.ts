import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolverEstadoEjecucion, resumirEjecucion, type EstadoEjecucion } from './execution-state.js';

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
      where: { targetType: 'ACTIVITY', targetId: activityId },
      orderBy: [{ dueAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        dueAt: true,
        status: true,
        cycleNumber: true,
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

    // La inscripcion MAS RECIENTE de cada persona: una formacion recurrente tiene una por ronda, y
    // la que describe el estado de hoy es la ultima.
    const inscripcionPorUsuario = new Map<string, (typeof inscripciones)[number]>();
    for (const fila of inscripciones) if (!inscripcionPorUsuario.has(fila.userId)) inscripcionPorUsuario.set(fila.userId, fila);

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
      const inscripcion = inscripcionPorUsuario.get(fila.userId) ?? null;
      const estado: EstadoEjecucion = resolverEstadoEjecucion({
        overdue: fila.status === 'OVERDUE',
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
      },
      select: { userId: true, targetId: true, status: true },
    });
    if (asignaciones.length === 0) return null;

    const ids = [...new Set(asignaciones.map((fila) => fila.targetId))];

    const [inscripciones, convocatorias] = await Promise.all([
      this.prisma.scoped.enrollment.findMany({
        where: { activityVersion: { activityId: { in: ids } } },
        orderBy: { enrolledAt: 'desc' },
        select: { userId: true, status: true, activityVersion: { select: { activityId: true } } },
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

    // La MAS RECIENTE por persona y formacion: una recurrente tiene una inscripcion por ronda, y la
    // que describe el estado de hoy es la ultima.
    const ultima = new Map<string, (typeof inscripciones)[number]>();
    for (const fila of inscripciones) {
      const clave = `${fila.userId}|${fila.activityVersion.activityId}`;
      if (!ultima.has(clave)) ultima.set(clave, fila);
    }

    const conPuerta = new Set(convocatorias.map((fila) => fila.activityVersion.activityId));
    const porActividad = new Map<string, EstadoEjecucion[]>();
    const todos: EstadoEjecucion[] = [];

    for (const asignacion of asignaciones) {
      const estado = resolverEstadoEjecucion({
        overdue: asignacion.status === 'OVERDUE',
        enrollmentStatus: ultima.get(`${asignacion.userId}|${asignacion.targetId}`)?.status ?? null,
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
}
