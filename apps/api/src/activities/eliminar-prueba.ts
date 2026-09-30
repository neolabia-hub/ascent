import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * ELIMINAR UNA FORMACION DE PRUEBA QUE YA SE USO (2026-09-30). Como lo resuelven los LMS: se manda
 * a la PAPELERA, no se borra.
 *
 * El borrado normal se niega en cuanto hay una convocatoria —lo dictado es evidencia del SG-SST y
 * se guarda 20 años—. Moodle y los LMS corporativos distinguen lo mismo: el administrador del SITIO
 * (no el de un curso) puede quitar un curso de prueba, y el sistema lo oculta de todas partes
 * conservando el rastro. Aqui, en orden y en UNA transaccion:
 *
 *   1. las reglas que la exigen se APAGAN (nadie mas queda obligado);
 *   2. lo PENDIENTE se exime con el motivo (deja de reclamarse y de contar);
 *   3. sus convocatorias se CANCELAN (nadie mas puede inscribirse) y lo empezado se RETIRA;
 *   4. sus constancias se ANULAN con el motivo (el codigo de verificacion dira «anulada»);
 *   5. los avisos que la nombran se dan por leidos;
 *   6. y la formacion va a la papelera (`deletedAt`), como el borrado normal.
 *
 * NADA SE BORRA de la base: si mañana alguien pregunta por esa constancia, la fila esta, anulada,
 * con quien lo hizo y por que.
 *
 * Vive fuera del servicio para que la use tambien el script de un solo uso con el que se limpio
 * «videos3» en produccion antes de que existiera el boton: una sola logica, no dos.
 */
export interface ResultadoEliminarPrueba {
  reglasApagadas: number;
  obligacionesEximidas: number;
  convocatoriasCanceladas: number;
  inscripcionesRetiradas: number;
  constanciasAnuladas: number;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function eliminarFormacionDePrueba(
  db: Db,
  datos: { tenantId: string; activityId: string; actorId: string | null; motivo: string },
): Promise<ResultadoEliminarPrueba> {
  const { tenantId, activityId, actorId, motivo } = datos;
  const ahora = new Date();

  const reglas = await db.assignmentRule.updateMany({
    where: { tenantId, targetType: 'ACTIVITY', targetId: activityId, active: true },
    data: { active: false },
  });

  const eximidas = await db.assignment.updateMany({
    where: {
      tenantId,
      targetType: 'ACTIVITY',
      targetId: activityId,
      status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
    },
    data: { status: 'WAIVED', waivedReason: motivo, waivedBy: actorId },
  });

  const convocatorias = await db.offering.updateMany({
    where: { tenantId, activityVersion: { activityId }, status: { not: 'CANCELLED' } },
    data: { status: 'CANCELLED' },
  });

  // Lo que alguien tenia EMPEZADO tambien sale de su pantalla: la seccion «en curso» del aprendiz
  // lista las inscripciones abiertas, y ahi seguiria una formacion que ya no existe.
  const retiradas = await db.enrollment.updateMany({
    where: { tenantId, offering: { activityVersion: { activityId } }, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
    data: { status: 'WITHDRAWN' },
  });

  // Las constancias cuelgan de la INSCRIPCION, y la inscripcion de la convocatoria de una version.
  const inscripciones = await db.enrollment.findMany({
    where: { tenantId, offering: { activityVersion: { activityId } } },
    select: { id: true },
  });
  const constancias = inscripciones.length
    ? await db.certificate.updateMany({
        where: { tenantId, enrollmentId: { in: inscripciones.map((fila) => fila.id) }, revokedAt: null },
        data: { revokedAt: ahora, revokedBy: actorId, revokedReason: motivo },
      })
    : { count: 0 };

  await db.notification.updateMany({
    where: { tenantId, referenceId: activityId, readAt: null },
    data: { readAt: ahora },
  });

  await db.activity.update({
    where: { id: activityId },
    data: { deletedAt: ahora, active: false, ...(actorId ? { updatedBy: actorId } : {}) },
  });

  return {
    reglasApagadas: reglas.count,
    obligacionesEximidas: eximidas.count,
    convocatoriasCanceladas: convocatorias.count,
    inscripcionesRetiradas: retiradas.count,
    constanciasAnuladas: constancias.count,
  };
}
