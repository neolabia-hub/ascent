import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * MANDAR UNA FORMACION A LA PAPELERA, Y SACARLA (2026-09-30). Como la papelera de reciclaje de
 * Moodle: no se borra nada, se oculta de todas partes, y quien tiene el permiso la puede devolver
 * tal como estaba.
 *
 * Al mandarla, en orden y en UNA transaccion:
 *
 *   1. las reglas que la exigen se APAGAN (nadie mas queda obligado);
 *   2. lo PENDIENTE se exime con el motivo (deja de reclamarse y de contar);
 *   3. sus convocatorias se CANCELAN y lo empezado se RETIRA;
 *   4. sus constancias se ANULAN con el motivo (el codigo de verificacion dira «anulada»);
 *   5. los avisos que la nombran se dan por leidos;
 *   6. y la formacion va a la papelera (`deletedAt`).
 *
 * ─── POR QUE SE ANOTA CADA FILA (`Deshacer`) ───
 *
 * Restaurar no puede ADIVINAR. «Reactivar las reglas de la formacion» encenderia tambien una que
 * alguien apago a proposito meses antes; «quitar la anulacion de sus constancias» devolveria la
 * validez a una que se anulo por fraude. Asi que antes de tocar nada se anota que filas cambian y
 * en que estado estaban, eso va a la auditoria, y restaurar deshace EXACTAMENTE eso y nada mas.
 *
 * La usan el borrado normal, el de formaciones de prueba y el script de mantenimiento: una logica.
 */
export interface Deshacer {
  reglas: string[];
  obligaciones: Array<{ id: string; status: string }>;
  convocatorias: Array<{ id: string; status: string }>;
  inscripciones: Array<{ id: string; status: string }>;
  constancias: string[];
}

export interface ResultadoEliminarPrueba {
  reglasApagadas: number;
  obligacionesEximidas: number;
  convocatoriasCanceladas: number;
  inscripcionesRetiradas: number;
  constanciasAnuladas: number;
  deshacer: Deshacer;
}

type Db = PrismaClient | Prisma.TransactionClient;
const ABIERTAS = ['PENDING', 'IN_PROGRESS', 'OVERDUE'] as const;

export async function eliminarFormacionDePrueba(
  db: Db,
  datos: { tenantId: string; activityId: string; actorId: string | null; motivo: string },
): Promise<ResultadoEliminarPrueba> {
  const { tenantId, activityId, actorId, motivo } = datos;
  const ahora = new Date();
  const deLaFormacion = { tenantId, activityVersion: { activityId } };

  // ── Primero se ANOTA, despues se cambia. ──
  const [reglas, obligaciones, convocatorias, inscripciones, todas] = await Promise.all([
    db.assignmentRule.findMany({
      where: { tenantId, targetType: 'ACTIVITY', targetId: activityId, active: true },
      select: { id: true },
    }),
    db.assignment.findMany({
      where: { tenantId, targetType: 'ACTIVITY', targetId: activityId, status: { in: [...ABIERTAS] } },
      select: { id: true, status: true },
    }),
    db.offering.findMany({ where: { ...deLaFormacion, status: { not: 'CANCELLED' } }, select: { id: true, status: true } }),
    db.enrollment.findMany({
      where: { tenantId, offering: { activityVersion: { activityId } }, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
      select: { id: true, status: true },
    }),
    db.enrollment.findMany({ where: { tenantId, offering: { activityVersion: { activityId } } }, select: { id: true } }),
  ]);
  const constancias = todas.length
    ? await db.certificate.findMany({
        where: { tenantId, enrollmentId: { in: todas.map((fila) => fila.id) }, revokedAt: null },
        select: { id: true },
      })
    : [];

  const deshacer: Deshacer = {
    reglas: reglas.map((fila) => fila.id),
    obligaciones: obligaciones.map((fila) => ({ id: fila.id, status: fila.status })),
    convocatorias: convocatorias.map((fila) => ({ id: fila.id, status: fila.status })),
    inscripciones: inscripciones.map((fila) => ({ id: fila.id, status: fila.status })),
    constancias: constancias.map((fila) => fila.id),
  };

  // ── Y ahora se cambia, solo lo anotado. ──
  if (deshacer.reglas.length) {
    await db.assignmentRule.updateMany({ where: { id: { in: deshacer.reglas } }, data: { active: false } });
  }
  if (deshacer.obligaciones.length) {
    await db.assignment.updateMany({
      where: { id: { in: deshacer.obligaciones.map((fila) => fila.id) } },
      data: { status: 'WAIVED', waivedReason: motivo, waivedBy: actorId },
    });
  }
  if (deshacer.convocatorias.length) {
    await db.offering.updateMany({ where: { id: { in: deshacer.convocatorias.map((fila) => fila.id) } }, data: { status: 'CANCELLED' } });
  }
  // Lo EMPEZADO sale de su pantalla: «en curso» del aprendiz lista las inscripciones abiertas.
  if (deshacer.inscripciones.length) {
    await db.enrollment.updateMany({ where: { id: { in: deshacer.inscripciones.map((fila) => fila.id) } }, data: { status: 'WITHDRAWN' } });
  }
  if (deshacer.constancias.length) {
    await db.certificate.updateMany({
      where: { id: { in: deshacer.constancias } },
      data: { revokedAt: ahora, revokedBy: actorId, revokedReason: motivo },
    });
  }
  await db.notification.updateMany({ where: { tenantId, referenceId: activityId, readAt: null }, data: { readAt: ahora } });
  await db.activity.update({
    where: { id: activityId },
    data: { deletedAt: ahora, active: false, ...(actorId ? { updatedBy: actorId } : {}) },
  });

  return {
    reglasApagadas: deshacer.reglas.length,
    obligacionesEximidas: deshacer.obligaciones.length,
    convocatoriasCanceladas: deshacer.convocatorias.length,
    inscripcionesRetiradas: deshacer.inscripciones.length,
    constanciasAnuladas: deshacer.constancias.length,
    deshacer,
  };
}

/**
 * SACARLA DE LA PAPELERA: deshace EXACTAMENTE lo anotado al mandarla.
 *
 * Cada fila vuelve a su estado anterior SOLO si sigue como la dejo la papelera: si mientras tanto
 * alguien la toco a mano —una constancia que otra persona anulo por su cuenta—, esa decision manda y
 * no se pisa.
 *
 * `deshacer` es null para lo que se elimino antes de que existiera el registro (el 2026-09-30, con
 * «videos3»): ahi se devuelve la formacion y las constancias anuladas con ESE motivo, que es lo
 * unico que se puede saber con certeza.
 */
export async function restaurarDeLaPapelera(
  db: Db,
  datos: { tenantId: string; activityId: string; deshacer: Deshacer | null; motivoDelBorrado: string | null },
): Promise<{ reglas: number; obligaciones: number; convocatorias: number; inscripciones: number; constancias: number }> {
  const { tenantId, activityId, deshacer, motivoDelBorrado } = datos;
  const cuenta = { reglas: 0, obligaciones: 0, convocatorias: 0, inscripciones: 0, constancias: 0 };

  if (deshacer) {
    if (deshacer.reglas.length) {
      cuenta.reglas = (await db.assignmentRule.updateMany({ where: { id: { in: deshacer.reglas }, active: false }, data: { active: true } })).count;
    }
    // Cada una a SU estado anterior, y solo si sigue eximida por la papelera.
    for (const fila of deshacer.obligaciones) {
      const r = await db.assignment.updateMany({
        where: { id: fila.id, status: 'WAIVED', waivedReason: motivoDelBorrado ?? undefined },
        data: { status: fila.status as never, waivedReason: null, waivedBy: null },
      });
      cuenta.obligaciones += r.count;
    }
    for (const fila of deshacer.convocatorias) {
      const r = await db.offering.updateMany({ where: { id: fila.id, status: 'CANCELLED' }, data: { status: fila.status as never } });
      cuenta.convocatorias += r.count;
    }
    for (const fila of deshacer.inscripciones) {
      const r = await db.enrollment.updateMany({ where: { id: fila.id, status: 'WITHDRAWN' }, data: { status: fila.status as never } });
      cuenta.inscripciones += r.count;
    }
    if (deshacer.constancias.length) {
      cuenta.constancias = (
        await db.certificate.updateMany({
          where: { id: { in: deshacer.constancias }, revokedReason: motivoDelBorrado ?? undefined },
          data: { revokedAt: null, revokedBy: null, revokedReason: null },
        })
      ).count;
    }
  } else if (motivoDelBorrado) {
    const inscripciones = await db.enrollment.findMany({ where: { tenantId, offering: { activityVersion: { activityId } } }, select: { id: true } });
    if (inscripciones.length) {
      cuenta.constancias = (
        await db.certificate.updateMany({
          where: { tenantId, enrollmentId: { in: inscripciones.map((fila) => fila.id) }, revokedReason: motivoDelBorrado },
          data: { revokedAt: null, revokedBy: null, revokedReason: null },
        })
      ).count;
    }
  }

  await db.activity.update({ where: { id: activityId }, data: { deletedAt: null, active: true } });
  return cuenta;
}
