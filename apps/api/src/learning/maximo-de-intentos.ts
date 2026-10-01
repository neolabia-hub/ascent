import type { TenantPrisma } from '../prisma/prisma.service.js';

/**
 * CUANTOS INTENTOS TIENE UNA PERSONA EN UN EXAMEN (2026-10-01).
 *
 * Tres capas, de la mas particular del examen a la persona:
 *
 *   1. EL EXAMEN, si fija su propio maximo (en Evaluaciones, «Cómo se califica»). Manda sobre la
 *      formacion. Lo que se presenta es una COPIA CONGELADA al publicar; aqui vale el MAYOR entre la
 *      copia y su origen editable, para que subirlo en Evaluaciones llegue tambien a quien ya esta
 *      cursando. Solo el maximo de intentos: la nota minima, el tiempo y la forma de calificar si
 *      siguen congelados, porque son evidencia de como se califico a cada quien.
 *   2. Si el examen no lo fija, LA FORMACION. Vale el MAYOR entre la version que cursa y la version
 *      publicada hoy. Pedido del cliente: subir el maximo de 3 a 4 tiene que alcanzar a quien ya
 *      gasto los 3, como en Moodle. Antes su inscripcion seguia anclada a la version vieja.
 *   3. Encima, los intentos de mas que se le dieron a ESA persona («Dar un intento mas»).
 *
 * En las dos primeras solo se SUBE: bajar un maximo no le quita a nadie un intento que ya tenia.
 */
export async function maximoDeIntentos(
  db: TenantPrisma,
  entrada: { activityId: string; assessmentId: string; maximoDeSuVersion: number; extra: number },
): Promise<number> {
  const examen = await db.assessment.findUnique({
    where: { id: entrada.assessmentId },
    select: { maxAttempts: true, source: { select: { maxAttempts: true } } },
  });
  const delExamen = [examen?.maxAttempts, examen?.source?.maxAttempts].filter(
    (valor): valor is number => typeof valor === 'number',
  );
  if (delExamen.length > 0) return Math.max(...delExamen) + entrada.extra;

  const vigente = await db.activityVersion.findFirst({
    where: { activityId: entrada.activityId, status: 'PUBLISHED' },
    orderBy: { versionNumber: 'desc' },
    select: { maxAttempts: true },
  });
  return Math.max(entrada.maximoDeSuVersion, vigente?.maxAttempts ?? 0) + entrada.extra;
}

/**
 * LEVANTA LOS BLOQUEOS QUE YA NO CORRESPONDEN (2026-10-01).
 *
 * Una inscripcion bloqueada por intentos agotados deja de estarlo si hoy tiene intentos: porque se
 * subio el maximo de la formacion, el del examen, o se le dio uno de mas. Se llama desde los tres
 * sitios donde eso puede cambiar o notarse —publicar la formacion, guardar la evaluacion y abrir el
 * reproductor—, y las cuentas son las de `maximoDeIntentos`: no pueden discrepar del examen.
 *
 * Devuelve las inscripciones desbloqueadas (con su persona), para avisar y auditar.
 */
export async function levantarBloqueosVencidos(
  db: TenantPrisma,
  donde: { activityId?: string; enrollmentId?: string; copiasDe?: string },
): Promise<Array<{ enrollmentId: string; userId: string; activityId: string; activityName: string; usados: number; maximo: number }>> {
  const bloqueadas = await db.enrollment.findMany({
    where: {
      blockedAt: { not: null },
      ...(donde.enrollmentId ? { id: donde.enrollmentId } : {}),
      ...(donde.activityId ? { activityVersion: { activityId: donde.activityId } } : {}),
      ...(donde.copiasDe ? { attempts: { some: { assessment: { sourceId: donde.copiasDe } } } } : {}),
    },
    select: {
      id: true,
      userId: true,
      extraAttempts: true,
      activityVersion: { select: { activityId: true, maxAttempts: true, activity: { select: { name: true } } } },
      attempts: { orderBy: { attemptNumber: 'desc' }, select: { assessmentId: true } },
    },
  });
  const levantadas = [];
  for (const fila of bloqueadas) {
    const ultimo = fila.attempts[0];
    if (!ultimo) continue;
    const usados = fila.attempts.filter((a) => a.assessmentId === ultimo.assessmentId).length;
    const maximo = await maximoDeIntentos(db, {
      activityId: fila.activityVersion.activityId,
      assessmentId: ultimo.assessmentId,
      maximoDeSuVersion: fila.activityVersion.maxAttempts,
      extra: fila.extraAttempts,
    });
    if (usados >= maximo) continue;
    await db.enrollment.update({
      where: { id: fila.id },
      data: { blockedAt: null, blockedReason: null, status: 'IN_PROGRESS' },
    });
    levantadas.push({
      enrollmentId: fila.id,
      userId: fila.userId,
      activityId: fila.activityVersion.activityId,
      activityName: fila.activityVersion.activity.name,
      usados,
      maximo,
    });
  }
  return levantadas;
}
