import { recurrenceSchema } from '@neo-pulse/shared';
import {
  addMonths,
  computeFirstDueAt,
  computeNextCycleDueAt,
  cycleOpensAt,
  formatCalendarDate,
  nextFixedDate,
  toBogotaDate,
} from './due-date.js';

/** Fecha civil (hora de Colombia) del instante, para leer los asserts como los lee una persona. */
const civil = (date: Date) => formatCalendarDate(toBogotaDate(date));

const anual = recurrenceSchema.parse({ everyMonths: 12, windowDays: 60 });
const enFecha = recurrenceSchema.parse({ fixedDate: '01-31', windowDays: 30 });

describe('vencimiento de la primera ronda', () => {
  const joinedAt = new Date('2026-08-20T15:00:00-05:00');
  // `users.hired_at` es una columna de SOLO FECHA: el driver la entrega como medianoche UTC.
  const ingreso1Dic = new Date('2026-12-01T00:00:00.000Z');

  it('ON_HIRE con dias negativos vence ANTES del ingreso (D1072 art. 2.2.4.6.11)', () => {
    const dueAt = computeFirstDueAt('ON_HIRE', -1, { hiredAt: ingreso1Dic, joinedAt, recurrence: null });
    expect(civil(dueAt)).toBe('2026-11-30');
    expect(dueAt.getTime()).toBeLessThan(new Date('2026-12-01T00:00:00-05:00').getTime());
  });

  it('la fecha de ingreso NO se corre un dia por leerla como instante', () => {
    // Sin este caso, "vence el mismo dia del ingreso" caia en la vispera y toda la matriz de
    // cumplimiento quedaba un dia adelantada.
    const dueAt = computeFirstDueAt('ON_HIRE', 0, { hiredAt: ingreso1Dic, joinedAt, recurrence: null });
    expect(civil(dueAt)).toBe('2026-12-01');
  });

  it('ON_HIRE sin fecha de ingreso se comporta como ON_JOIN', () => {
    const sinIngreso = computeFirstDueAt('ON_HIRE', 5, { hiredAt: null, joinedAt, recurrence: null });
    const porEntrada = computeFirstDueAt('ON_JOIN', 5, { hiredAt: null, joinedAt, recurrence: null });
    expect(civil(sinIngreso)).toBe(civil(porEntrada));
    expect(civil(sinIngreso)).toBe('2026-08-25');
  });

  it('el vencimiento es al CIERRE del dia en Colombia', () => {
    const dueAt = computeFirstDueAt('ON_JOIN', 0, { hiredAt: null, joinedAt, recurrence: null });
    // 23:59:59 en Bogota (-05:00) son las 04:59:59 UTC del dia siguiente.
    expect(dueAt.toISOString()).toBe('2026-08-21T04:59:59.000Z');
  });

  it('SCHEDULED con fecha fija anual vence en la proxima ocurrencia', () => {
    const dueAt = computeFirstDueAt('SCHEDULED', 0, { hiredAt: null, joinedAt, recurrence: enFecha });
    expect(civil(dueAt)).toBe('2027-01-31');
  });
});

describe('rondas siguientes', () => {
  it('cada N meses cuenta desde que la persona la completo', () => {
    const dueAt = computeNextCycleDueAt(anual, new Date('2026-03-15T10:00:00-05:00'));
    expect(civil(dueAt)).toBe('2027-03-15');
  });

  it('la fecha fija anual salta al ano siguiente, nunca al mismo dia', () => {
    const dueAt = computeNextCycleDueAt(enFecha, new Date('2026-01-31T10:00:00-05:00'));
    expect(civil(dueAt)).toBe('2027-01-31');
  });

  it('sumar meses cae en el ultimo dia cuando el mes destino es mas corto', () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addMonths({ year: 2027, month: 12, day: 31 }, 2)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('la ronda se abre con la antelacion configurada, no el dia del vencimiento', () => {
    const dueAt = new Date('2027-03-15T23:59:59-05:00');
    const opensAt = cycleOpensAt(dueAt, anual);
    expect(civil(opensAt)).toBe('2027-01-14');
    expect(opensAt.getTime()).toBeLessThan(dueAt.getTime());
  });

  it('la proxima fecha fija respeta el ano en curso si aun no ha pasado', () => {
    expect(nextFixedDate('01-31', { year: 2026, month: 1, day: 5 })).toEqual({ year: 2026, month: 1, day: 31 });
    expect(nextFixedDate('01-31', { year: 2026, month: 2, day: 5 })).toEqual({ year: 2027, month: 1, day: 31 });
  });
});

describe('la gracia de quien ya estaba', () => {
  // Quien entro en 2019 y hoy entra a la audiencia porque se acaba de crear el requisito.
  const entraHoy = new Date('2026-08-20T15:00:00-05:00');
  const ingreso2019 = new Date('2019-03-15T00:00:00.000Z');

  it('un requisito nuevo NO nace vencido para la plantilla actual', () => {
    const dueAt = computeFirstDueAt('ON_HIRE', -1, { hiredAt: ingreso2019, joinedAt: entraHoy, recurrence: null });
    // 2019 + (-1 dia) cae SIETE ANOS antes de que la obligacion exista. Se sustituye por la
    // gracia: 30 dias desde que entro a la audiencia.
    expect(civil(dueAt)).toBe('2026-09-19');
    expect(dueAt.getTime()).toBeGreaterThan(entraHoy.getTime());
  });

  it('a quien entra manana NO le afecta: su fecha de D1072 se respeta intacta', () => {
    // El alta se registra el 20 de agosto y la persona ingresa el 1 de diciembre: la fecha
    // calculada (30 de noviembre) es POSTERIOR a su entrada a la audiencia, asi que manda ella.
    const ingreso1Dic = new Date('2026-12-01T00:00:00.000Z');
    const dueAt = computeFirstDueAt('ON_HIRE', -1, { hiredAt: ingreso1Dic, joinedAt: entraHoy, recurrence: null });
    expect(civil(dueAt)).toBe('2026-11-30');
  });

  it('con "desde ahora" la gracia no cambia nada: ya cuenta desde la entrada', () => {
    const dueAt = computeFirstDueAt('ON_JOIN', 30, { hiredAt: ingreso2019, joinedAt: entraHoy, recurrence: null });
    expect(civil(dueAt)).toBe('2026-09-19');
  });

  it('vencer el MISMO dia en que nace sigue siendo valido: no dispara la gracia', () => {
    const dueAt = computeFirstDueAt('ON_JOIN', 0, { hiredAt: null, joinedAt: entraHoy, recurrence: null });
    expect(civil(dueAt)).toBe('2026-08-20');
  });
});
