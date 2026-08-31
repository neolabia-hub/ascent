import type { Recurrence } from '@neo-pulse/shared';

/**
 * Vencimientos de las obligaciones, en el calendario de Colombia.
 *
 * Colombia no tiene horario de verano: el desfase es SIEMPRE -05:00, asi que la fecha civil se
 * calcula con aritmetica exacta y sin libreria de zonas horarias.
 *
 * Un vencimiento es un DIA, no un instante: "vence el 31 de enero" significa que a las 11 de la
 * noche del 31 todavia se cumple. Por eso todo vencimiento se ancla al FIN del dia en Bogota.
 */

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/** Fecha civil en Bogota de un INSTANTE (marca de tiempo real: creado, ingreso a la audiencia). */
export function toBogotaDate(instant: Date): CalendarDate {
  const shifted = new Date(instant.getTime() - BOGOTA_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/**
 * Fecha civil de una columna de SOLO FECHA (`@db.Date`, como `users.hired_at`).
 *
 * OJO: no es lo mismo que un instante. La base guarda "1 de diciembre" sin hora y el driver lo
 * entrega como medianoche UTC; si se le aplicara el desfase de Bogota, "1 de diciembre" se leeria
 * como 30 de noviembre y TODOS los vencimientos anclados al ingreso quedarian un dia antes.
 * Una fecha de calendario se lee tal cual, sin zona horaria.
 */
export function fromDateOnly(value: Date): CalendarDate {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

/** AAAA-MM-DD de la fecha civil (formato de intercambio con la UI). */
export function formatCalendarDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** Instante de cierre (23:59:59 en Bogota) de una fecha civil. */
export function endOfDay(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59) + BOGOTA_OFFSET_MS);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * 24 * 60 * 60 * 1000);
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Suma meses conservando el dia; si el mes destino es mas corto, cae en su ultimo dia. */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const totalMonths = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(date.day, lastDay) };
}

/** Proxima ocurrencia de una fecha fija anual (MM-DD) en o despues de `from`. */
export function nextFixedDate(fixedDate: string, from: CalendarDate): CalendarDate {
  const [month, day] = fixedDate.split('-').map(Number) as [number, number];
  const thisYear: CalendarDate = { year: from.year, month, day };
  const isAfterOrSame =
    thisYear.month > from.month || (thisYear.month === from.month && thisYear.day >= from.day);
  return isAfterOrSame ? thisYear : { ...thisYear, year: from.year + 1 };
}

export type Trigger = 'ON_JOIN' | 'ON_HIRE' | 'SCHEDULED';

export interface FirstDueContext {
  /** Fecha de ingreso (columna de SOLO FECHA; ancla de la induccion previa, D1072). */
  hiredAt: Date | null;
  /** INSTANTE en que la persona entro a la audiencia. */
  joinedAt: Date;
  recurrence: Recurrence | null;
}

/**
 * Dias de gracia para quien YA estaba cuando el requisito aparecio.
 *
 * Sin esto, exigir una induccion anclada al ingreso condena de entrada a la plantilla actual: a
 * quien entro en 2019, su obligacion le nace **vencida desde 2019**, y estrenar el requisito
 * produce 116 vencidas el primer dia. Y no es cierto: la empresa no estaba incumpliendo, es que
 * el sistema no existia. Decir lo contrario es inventar un incumplimiento.
 *
 * Treinta dias es el plazo razonable para ponerse al dia. Cuando haga falta afinarlo por empresa,
 * este es el numero que se saca a la configuracion del tenant.
 */
export const DIAS_DE_GRACIA = 30;

/**
 * Vencimiento de la PRIMERA ronda de una obligacion.
 *
 *   ON_HIRE   ancla en la fecha de ingreso. `dueDays` negativo = antes de empezar a trabajar,
 *             que es lo que exige D1072 art. 2.2.4.6.11. Si la persona no tiene fecha de ingreso
 *             registrada, se comporta como ON_JOIN: es mejor una obligacion con fecha razonable
 *             que ninguna obligacion.
 *   ON_JOIN   ancla en la entrada a la audiencia (alta, cambio de cargo, de area).
 *   SCHEDULED con fecha fija anual, vence en la proxima ocurrencia; con "cada N meses", cuenta
 *             desde la entrada a la audiencia.
 *
 * LA GRACIA. Si la fecha calculada cae ANTES del momento en que la obligacion nace —el caso de
 * quien lleva anos en la empresa cuando se estrena el requisito—, se sustituye por "desde hoy,
 * con `DIAS_DE_GRACIA` de plazo". A quien entra manana no le afecta: su ancla de ingreso es
 * posterior a su entrada a la audiencia, asi que la fecha de D1072 se respeta intacta.
 */
export function computeFirstDueAt(trigger: Trigger, dueDays: number, ctx: FirstDueContext): Date {
  const joined = toBogotaDate(ctx.joinedAt);
  if (trigger === 'SCHEDULED' && ctx.recurrence?.fixedDate) {
    return endOfDay(nextFixedDate(ctx.recurrence.fixedDate, joined));
  }
  const anchor = trigger === 'ON_HIRE' && ctx.hiredAt ? fromDateOnly(ctx.hiredAt) : joined;
  const calculada = addDays(anchor, dueDays);
  const nace = endOfDay(calculada) < endOfDay(joined) ? addDays(joined, DIAS_DE_GRACIA) : calculada;
  return endOfDay(nace);
}

/**
 * Vencimiento de la ronda SIGUIENTE (Decision #12: la obligacion es viva en el tiempo).
 * El ancla es cuando la persona completo la ronda anterior; si no consta, su vencimiento.
 */
export function computeNextCycleDueAt(recurrence: Recurrence, anchorInstant: Date): Date {
  const anchor = toBogotaDate(anchorInstant);
  if (recurrence.everyMonths !== undefined) {
    return endOfDay(addMonths(anchor, recurrence.everyMonths));
  }
  // Fecha fija anual: la siguiente ocurrencia DESPUES del ancla (nunca el mismo dia).
  return endOfDay(nextFixedDate(recurrence.fixedDate as string, addDays(anchor, 1)));
}

/**
 * Cuando aparece la ronda siguiente en los pendientes de la persona: `windowDays` antes de
 * vencer. Sin ventana, la reinduccion anual aparecerria el mismo dia en que ya esta vencida.
 */
export function cycleOpensAt(dueAt: Date, recurrence: Recurrence): Date {
  return new Date(dueAt.getTime() - recurrence.windowDays * 24 * 60 * 60 * 1000);
}
