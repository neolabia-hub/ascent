import type { TenantPrisma } from '../prisma/prisma.service.js';
import { ingresoCivil, type CalendarDate } from './due-date.js';

/**
 * DE DONDE SE CUENTA LA REINDUCCION AUTOMATICA DE UNA PERSONA (2026-10-06).
 *
 * El orden lo pidio el cliente: su fecha de ingreso; si no la tiene, cuando termino su induccion de
 * ingreso; y si tampoco, cuando entro al grupo. Vive aparte del motor porque lo necesitan dos sitios
 * que no se conocen: el motor, para saber cuando le toca, y la constancia, para saber hasta cuando
 * vale. Dos calculos distintos del mismo ancla acabarian diciendo fechas distintas.
 */

/**
 * CUANDO TERMINO SU INDUCCION DE INGRESO cada persona de la lista.
 *
 * «Induccion de ingreso» es cualquier formacion de un tipo que se exige al ingresar
 * (`requiresBeforeHire`), y se toma la PRIMERA que completo: es la que no se mueve si despues
 * termina otra, y un ancla que se mueve cambia los aniversarios.
 */
export async function terminoDeLaInduccion(db: TenantPrisma, userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const inducciones = await db.activity.findMany({
    where: { activityType: { config: { path: ['requiresBeforeHire'], equals: true } } },
    select: { id: true },
  });
  if (inducciones.length === 0) return new Map();
  const filas = await db.assignment.findMany({
    where: {
      userId: { in: userIds },
      targetType: 'ACTIVITY',
      targetId: { in: inducciones.map((fila) => fila.id) },
      status: 'COMPLETED',
      completedAt: { not: null },
    },
    select: { userId: true, completedAt: true },
    orderBy: { completedAt: 'asc' },
  });
  const primera = new Map<string, Date>();
  for (const fila of filas) {
    if (fila.completedAt && !primera.has(fila.userId)) primera.set(fila.userId, fila.completedAt);
  }
  return primera;
}

/** El ancla de UNA persona dentro de un grupo, con el mismo orden que usa el motor. */
export async function ingresoDeLaPersona(
  db: TenantPrisma,
  userId: string,
  audienceId: string,
  primeroLaInduccion = false,
): Promise<CalendarDate> {
  const [persona, miembro] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { hiredAt: true } }),
    db.audienceMember.findFirst({
      where: { userId, audienceId },
      orderBy: { joinedAt: 'desc' },
      select: { joinedAt: true },
    }),
  ]);
  const termino =
    persona?.hiredAt && !primeroLaInduccion ? undefined : (await terminoDeLaInduccion(db, [userId])).get(userId);
  return ingresoCivil(persona?.hiredAt ?? null, miembro?.joinedAt ?? new Date(), termino, primeroLaInduccion);
}
