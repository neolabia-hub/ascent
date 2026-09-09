import { fromDateOnly, toBogotaDate, type CalendarDate } from '../assignments/due-date.js';

/**
 * CADENCIA DE PILDORAS (CLAUDE.md 3.5 y 3.12). Decide si HOY, a esta hora, a esta persona le
 * corresponde un aviso de microlearning.
 *
 * Es una funcion pura y esta separada del worker a proposito: es una regla de negocio con
 * consecuencias reales —el limite entre recordar y hostigar— y tiene que poder probarse sin base
 * de datos ni reloj de sistema.
 *
 * LO QUE ESTA REGLA PROTEGE:
 *  - Nadie recibe un aviso de algo que no tiene pendiente.
 *  - Nadie recibe un aviso el dia que ya estudio: el aviso es para quien no volvio, no para
 *    felicitar a quien si.
 *  - El tope semanal del tenant manda SIEMPRE, incluso sobre la primera semana de onboarding.
 *    Un tope que admite excepciones no es un tope.
 *  - El envio va en la franja horaria en la que esa persona suele estudiar, no cuando le
 *    convenga al servidor.
 */

export type NudgeReason =
  | 'NO_PILLS'
  | 'ACTIVE_TODAY'
  | 'WRONG_HOUR'
  | 'WEEKLY_CAP'
  | 'TOO_SOON'
  | 'ONBOARDING'
  | 'CADENCE';

export interface NudgeDecision {
  send: boolean;
  reason: NudgeReason;
}

export interface NudgeInput {
  /** Instante actual (el worker lo pasa; los tests lo fijan). */
  now: Date;
  /** Hora civil de Bogota en la que esta persona suele estudiar (0-23). */
  preferredHour: number;
  /** Ultimo dia con actividad, de la columna de SOLO FECHA de la racha. */
  lastActivityDate: Date | null;
  /** Ultimo aviso de pildora enviado a esta persona. */
  lastNudgeAt: Date | null;
  /** Avisos de pildora ya enviados en la semana en curso (lunes a domingo, Bogota). */
  nudgesThisWeek: number;
  /** Pildoras pendientes ahora mismo. Sin esto no hay nada que recordar. */
  pendingPills: number;
  /** Fecha de ingreso (columna de solo fecha), para la primera semana de onboarding. */
  hiredAt: Date | null;
  cadencePerWeek: number;
  weeklyCap: number;
}

/** Onboarding: los primeros siete dias admiten ritmo diario (CLAUDE.md 3.5). */
const ONBOARDING_DAYS = 7;
const ONBOARDING_CADENCE = 7;

export function decideNudge(input: NudgeInput): NudgeDecision {
  if (input.pendingPills <= 0) return { send: false, reason: 'NO_PILLS' };

  const today = toBogotaDate(input.now);

  if (input.lastActivityDate && sameDay(fromDateOnly(input.lastActivityDate), today)) {
    return { send: false, reason: 'ACTIVE_TODAY' };
  }

  const currentHour = bogotaHour(input.now);
  if (currentHour !== clampHour(input.preferredHour)) return { send: false, reason: 'WRONG_HOUR' };

  const onboarding =
    input.hiredAt !== null && daysBetween(fromDateOnly(input.hiredAt), today) < ONBOARDING_DAYS;
  const cadence = onboarding ? ONBOARDING_CADENCE : input.cadencePerWeek;

  // El tope del tenant gana siempre: es un limite de RUIDO, no una meta de envios.
  const quota = Math.min(cadence, input.weeklyCap);
  if (input.nudgesThisWeek >= quota) return { send: false, reason: 'WEEKLY_CAP' };

  const minGapDays = onboarding ? 1 : Math.max(1, Math.floor(7 / Math.max(1, cadence)));
  if (input.lastNudgeAt && daysBetween(toBogotaDate(input.lastNudgeAt), today) < minGapDays) {
    return { send: false, reason: 'TOO_SOON' };
  }

  return { send: true, reason: onboarding ? 'ONBOARDING' : 'CADENCE' };
}

/**
 * Franja horaria de estudio de la persona: la hora en la que MAS veces ha aprendido algo.
 * Sin historia se usa la de la mañana, que es cuando arranca el turno en una bodega.
 */
export const DEFAULT_NUDGE_HOUR = 8;

export function preferredHourFrom(hours: number[]): number {
  if (hours.length === 0) return DEFAULT_NUDGE_HOUR;
  const tally = new Map<number, number>();
  for (const hour of hours) {
    const value = clampHour(hour);
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  let best = DEFAULT_NUDGE_HOUR;
  let bestCount = -1;
  for (const [hour, count] of tally) {
    // Empate: gana la hora mas temprana, para no arrastrar los avisos a la noche.
    if (count > bestCount || (count === bestCount && hour < best)) {
      best = hour;
      bestCount = count;
    }
  }
  return best;
}

/** Lunes 00:00 de Bogota de la semana del instante dado: la ventana del tope semanal. */
export function startOfWeek(instant: Date): Date {
  const date = toBogotaDate(instant);
  const utcMidnight = Date.UTC(date.year, date.month - 1, date.day);
  const weekday = new Date(utcMidnight).getUTCDay(); // 0 = domingo
  const sinceMonday = (weekday + 6) % 7;
  return new Date(utcMidnight - sinceMonday * 24 * 60 * 60 * 1000 + BOGOTA_OFFSET_MS);
}

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5, sin horario de verano

function bogotaHour(instant: Date): number {
  return new Date(instant.getTime() - BOGOTA_OFFSET_MS).getUTCHours();
}

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_NUDGE_HOUR;
  return Math.max(0, Math.min(23, Math.trunc(hour)));
}

function sameDay(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
