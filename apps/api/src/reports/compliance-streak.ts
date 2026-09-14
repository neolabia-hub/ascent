import { fromDateOnly, toBogotaDate, type CalendarDate } from '../assignments/due-date.js';

/**
 * LA RACHA DE CUMPLIMIENTO DE LA EMPRESA (`PENDIENTES` 8.3).
 *
 * El titular de Inicio dice hoy "lo primero que hay un problema" —vencidas, atrasadas, por
 * aprobar— y si no hay ninguna, un neutro "Todo al día". La idea que se le ofreció al cliente el
 * 2026-09-09 era reconocer el logro cuando lo hay: "Nadie tiene nada vencido: 41 días seguidos" en
 * vez de un "todo bien" que no dice nada.
 *
 * Es EL MISMO mecanismo que `streak.ts` (Decision #23), un nivel mas arriba: de la persona pasa a
 * la empresa entera, y de "complete algo hoy" pasa a "nadie tenga nada vencido hoy". La diferencia
 * deliberada es que AQUI NO HAY PROTECTORES: para una persona faltar un dia se perdona —el
 * conductor sin señal en carretera—, pero la evidencia de cumplimiento de TODA la empresa no tiene
 * nada que perdonar. O esta al dia, o no lo esta, y eso es justamente lo que un auditor pregunta.
 *
 * Es un SERVICIO, no un dato: se recalcula UNA vez al dia por un worker, no en cada carga de
 * Inicio — "cuantos dias seguidos" no se puede derivar de una foto de hoy, necesita el historial
 * de las comprobaciones anteriores, y ese historial es justamente lo que esto guarda.
 */

export interface RachaCumplimiento {
  currentDays: number;
  longestDays: number;
  /** Ultimo dia CIVIL (Colombia) en que se comprobo. `null` = nunca se ha comprobado. */
  lastCheckedAt: Date | null;
}

export interface RachaCumplimientoUpdate extends RachaCumplimiento {
  outcome: 'FIRST_ZERO' | 'CONTINUED' | 'SAME_DAY' | 'HAD_OVERDUE' | 'GAP_RESTARTED';
}

function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function asDateOnly(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

/**
 * Avanza la racha con la comprobacion de hoy: `hayVencidos` es lo unico que decide.
 *
 * `now` se traduce a fecha civil de Colombia, igual que en `streak.ts` — un vencimiento que se
 * comprueba a las 11 de la noche no puede contar para el dia siguiente.
 */
export function avanzarRachaCumplimiento(state: RachaCumplimiento, now: Date, hayVencidos: boolean): RachaCumplimientoUpdate {
  const hoy = toBogotaDate(now);

  // Un vencido reinicia la racha SIEMPRE, sin importar cuando se comprobo por ultima vez: no hay
  // proteccion posible para "hoy hay algo vencido". Idempotente sin caso aparte: si ya estaba en
  // cero y ya se habia comprobado hoy, volver a poner cero con la fecha de hoy no cambia nada.
  if (hayVencidos) {
    return { currentDays: 0, longestDays: state.longestDays, lastCheckedAt: asDateOnly(hoy), outcome: 'HAD_OVERDUE' };
  }

  if (!state.lastCheckedAt) {
    return { currentDays: 1, longestDays: Math.max(1, state.longestDays), lastCheckedAt: asDateOnly(hoy), outcome: 'FIRST_ZERO' };
  }

  const gap = daysBetween(fromDateOnly(state.lastCheckedAt), hoy);

  // Ya se comprobo hoy: no se cuenta dos veces el mismo dia (un reintento del worker, por ejemplo).
  if (gap <= 0) return { ...state, outcome: 'SAME_DAY' };

  if (gap === 1) {
    const currentDays = state.currentDays + 1;
    return { currentDays, longestDays: Math.max(currentDays, state.longestDays), lastCheckedAt: asDateOnly(hoy), outcome: 'CONTINUED' };
  }

  /*
    SE SALTO MAS DE UN DIA SIN COMPROBAR (el servidor estuvo caido, o es la primera vez que corre
    esto tras instalarlo). No se puede AFIRMAR que esos dias intermedios estuvieron en cero —seria
    inventar evidencia—, pero tampoco tiene sentido castigar con un cero brusco algo que hoy SI esta
    en cero: se reinicia el conteo con lo unico que se sabe de verdad, que es hoy.
  */
  return { currentDays: 1, longestDays: state.longestDays, lastCheckedAt: asDateOnly(hoy), outcome: 'GAP_RESTARTED' };
}

/**
 * El titular, o `null` cuando no vale la pena decir nada distinto de lo de siempre.
 *
 * Se pide un MINIMO de dias (2) antes de nombrar la racha: "1 día seguido" no es un logro, es
 * simplemente que hoy no hay nada vencido — que ya lo dice el "Todo al día" de siempre.
 */
export function titularDeRacha(currentDays: number): string | null {
  if (currentDays < 2) return null;
  return `Nadie tiene nada vencido: ${currentDays} días seguidos`;
}
