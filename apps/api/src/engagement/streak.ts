import { formatCalendarDate, fromDateOnly, toBogotaDate, type CalendarDate } from '../assignments/due-date.js';

/**
 * RACHA (Decision #23). Es PRIVADA: solo la ve su dueno. No hay ranking publico, ni insignias por
 * entrar, ni moneda virtual — la evidencia dice que comparar en publico expulsa a los de abajo,
 * que en una empresa son justo las personas que mas necesitan la formacion.
 *
 * La unidad es la LECCION COMPLETADA, no el ingreso: la racha premia haber aprendido algo, no
 * haber abierto la aplicacion.
 *
 * Los "protectores" (2 por defecto) cubren un dia perdido. Existen porque un conductor en
 * carretera puede no tener senal un dia, y perder 60 dias de racha por eso hace que no vuelva.
 */

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** Ultimo dia con actividad, en fecha civil de Colombia. Null = nunca. */
  lastActivityDate: Date | null;
  freezesAvailable: number;
}

export interface StreakUpdate extends StreakState {
  /** Que paso, para que la interfaz lo cuente sin recalcularlo. */
  outcome: 'FIRST' | 'CONTINUED' | 'SAME_DAY' | 'FROZEN' | 'RESET';
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * `last_activity_date` es una columna de SOLO FECHA: se guarda la fecha CIVIL de Colombia a
 * medianoche UTC. Guardar el instante crudo haria que una leccion completada a las 11 de la
 * noche contara como del dia siguiente y regalara un dia de racha (misma trampa que en
 * `due-date.ts`).
 */
function asDateOnly(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

/**
 * Avanza la racha por una leccion completada hoy.
 *
 * `lastActivityDate` viene de una columna de SOLO FECHA, asi que se lee tal cual; `now` es un
 * instante y se traduce a la fecha civil de Colombia (ver `due-date.ts`).
 */
export function advanceStreak(state: StreakState, now: Date): StreakUpdate {
  const today = toBogotaDate(now);

  if (!state.lastActivityDate) {
    return {
      ...state,
      currentStreak: 1,
      longestStreak: Math.max(1, state.longestStreak),
      lastActivityDate: asDateOnly(today),
      outcome: 'FIRST',
    };
  }

  const gap = daysBetween(fromDateOnly(state.lastActivityDate), today);

  // Varias lecciones el mismo dia no inflan la racha: la unidad es el dia, no la actividad.
  if (gap <= 0) return { ...state, outcome: 'SAME_DAY' };

  if (gap === 1) {
    const currentStreak = state.currentStreak + 1;
    return {
      ...state,
      currentStreak,
      longestStreak: Math.max(currentStreak, state.longestStreak),
      lastActivityDate: asDateOnly(today),
      outcome: 'CONTINUED',
    };
  }

  // Falto exactamente un dia y hay protector: se gasta uno y la racha sobrevive.
  if (gap === 2 && state.freezesAvailable > 0) {
    const currentStreak = state.currentStreak + 1;
    return {
      currentStreak,
      longestStreak: Math.max(currentStreak, state.longestStreak),
      lastActivityDate: asDateOnly(today),
      freezesAvailable: state.freezesAvailable - 1,
      outcome: 'FROZEN',
    };
  }

  return { ...state, currentStreak: 1, lastActivityDate: asDateOnly(today), outcome: 'RESET' };
}

/** Fecha civil de la ultima actividad (columna de solo fecha: se lee tal cual, sin zona). */
export function lastActivityLabel(state: StreakState): string | null {
  return state.lastActivityDate ? formatCalendarDate(fromDateOnly(state.lastActivityDate)) : null;
}

/** Puntos por logro REAL (nunca por entrar ni por pulsar). */
export const POINTS = {
  LESSON_COMPLETED: 10,
  ACTIVITY_COMPLETED: 50,
  ASSESSMENT_PASSED: 30,
  REVIEW_SESSION: 5,
} as const;
