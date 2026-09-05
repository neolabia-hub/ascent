import { recurrenceSchema } from '@neo-pulse/shared';
import {
  addMonths,
  computeFirstDueAt,
  computeNextCycleDueAt,
  cycleAnchor,
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

/**
 * UNA CAMPANA SE SATISFACE POR PERIODO, UN ANIVERSARIO POR FECHA DE CUMPLIMIENTO.
 *
 * El ancla era `completedAt` para las dos. Quien hacia la campana ANTES de su fecha —o sea,
 * cualquiera que cumpliera— recibia al dia siguiente la ronda 2 con el mismo vencimiento que
 * acababa de satisfacer, y diez meses despues esa ronda se cerraba como NO REALIZADA. El
 * indicador acusaba de incumplir exactamente a quien habia cumplido.
 */
describe('el ancla de la ronda siguiente', () => {
  const campana = recurrenceSchema.parse({ fixedDate: '03-31', windowDays: 60 });

  it('en una campana ancla en el VENCIMIENTO, aunque la haya hecho once dias antes', () => {
    const ronda = {
      completedAt: new Date('2026-03-20T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    const ancla = cycleAnchor(campana, ronda, new Date('2026-03-21T10:00:00-05:00'));
    expect(civil(ancla)).toBe('2026-03-31');
    // Y por eso la siguiente es la de 2027, no la que acaba de cumplir.
    expect(civil(computeNextCycleDueAt(campana, ancla))).toBe('2027-03-31');
  });

  it('adelantarse a la campana no la adelanta: el periodo es el que es', () => {
    const enero = {
      completedAt: new Date('2026-01-15T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    expect(civil(computeNextCycleDueAt(campana, cycleAnchor(campana, enero, new Date())))).toBe('2027-03-31');
  });

  it('hacerla TARDE tampoco corre la campana: sigue siendo la del ano siguiente', () => {
    const tarde = {
      completedAt: new Date('2026-05-10T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    expect(civil(computeNextCycleDueAt(campana, cycleAnchor(campana, tarde, new Date())))).toBe('2027-03-31');
  });

  it('en un aniversario ancla en CUANDO la completo: el certificado es de la persona', () => {
    const ronda = {
      completedAt: new Date('2026-03-20T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    expect(civil(cycleAnchor(anual, ronda, new Date()))).toBe('2026-03-20');
    expect(civil(computeNextCycleDueAt(anual, cycleAnchor(anual, ronda, new Date())))).toBe('2027-03-20');
  });

  it('sin fecha de cumplimiento cae en el vencimiento, y sin ninguna de las dos en el respaldo', () => {
    const ahora = new Date('2026-07-01T10:00:00-05:00');
    expect(civil(cycleAnchor(anual, { completedAt: null, dueAt: new Date('2026-02-01T23:59:59-05:00') }, ahora))).toBe(
      '2026-02-01',
    );
    expect(civil(cycleAnchor(anual, { completedAt: null, dueAt: null }, ahora))).toBe('2026-07-01');
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

/**
 * LA AUDIENCIA ES MAS VIEJA QUE EL REQUISITO, que es el caso normal y no el raro: los grupos se
 * reutilizan entre formaciones, asi que cuando se estrena una reinduccion la gente lleva meses
 * dentro de "toda la empresa". Sin `ruleCreatedAt`, su plazo se contaba desde entonces y las
 * obligaciones nacian vencidas. Medido el 2026-09-03: 7 de 7, con fecha de hacia un mes.
 */
describe('computeFirstDueAt · el plazo cuenta desde que existe la REGLA', () => {
  const entroHaceDosMeses = new Date('2026-06-20T15:00:00-05:00');
  const reglaDeHoy = new Date('2026-08-20T15:00:00-05:00');
  const ingreso2019 = new Date('2019-03-15T00:00:00.000Z');

  it('una reinduccion nueva NO nace vencida para quien ya estaba en la audiencia', () => {
    const dueAt = computeFirstDueAt('ON_JOIN', 30, {
      hiredAt: ingreso2019,
      joinedAt: entroHaceDosMeses,
      ruleCreatedAt: reglaDeHoy,
      recurrence: null,
    });
    // 30 dias desde que se creo la REGLA (20 de agosto), no desde que entro al grupo (20 de junio,
    // que daria el 20 de julio: un mes antes de que la obligacion existiera).
    expect(civil(dueAt)).toBe('2026-09-19');
    expect(dueAt.getTime()).toBeGreaterThan(reglaDeHoy.getTime());
  });

  it('tampoco con la induccion anclada al ingreso: la gracia cuenta desde la regla', () => {
    const dueAt = computeFirstDueAt('ON_HIRE', -1, {
      hiredAt: ingreso2019,
      joinedAt: entroHaceDosMeses,
      ruleCreatedAt: reglaDeHoy,
      recurrence: null,
    });
    expect(civil(dueAt)).toBe('2026-09-19');
  });

  it('quien entra DESPUES de la regla cuenta desde su entrada, no desde la regla', () => {
    const entraDespues = new Date('2026-10-05T15:00:00-05:00');
    const dueAt = computeFirstDueAt('ON_JOIN', 30, {
      hiredAt: null,
      joinedAt: entraDespues,
      ruleCreatedAt: reglaDeHoy,
      recurrence: null,
    });
    expect(civil(dueAt)).toBe('2026-11-04');
  });

  it('sin `ruleCreatedAt` se comporta como siempre (obligaciones sueltas)', () => {
    const dueAt = computeFirstDueAt('ON_JOIN', 30, {
      hiredAt: null,
      joinedAt: entroHaceDosMeses,
      recurrence: null,
    });
    expect(civil(dueAt)).toBe('2026-07-20');
  });
});

describe('nextFixedDate: el dia se acota al mes', () => {
  /*
    El patron que valida la campana acepta `3[01]` en cualquier mes, asi que en la base puede haber
    —y habia— fechas que no existen. Con el dia desbordado, `Date.UTC` se lo lleva al mes siguiente
    en SILENCIO: "cada 30 de septiembre" escrito `09-31` vencia el 1 de octubre mientras la pantalla
    seguia diciendo 09-31. Encontrado el 2026-09-04 leyendo la configuracion real del tenant.
  */
  const hoy = { year: 2026, month: 1, day: 15 };

  it('el 31 de un mes de 30 dias cae en el 30, no en el 1 del siguiente', () => {
    expect(nextFixedDate('09-31', hoy)).toEqual({ year: 2026, month: 9, day: 30 });
    expect(nextFixedDate('04-31', hoy)).toEqual({ year: 2026, month: 4, day: 30 });
    expect(nextFixedDate('11-31', hoy)).toEqual({ year: 2026, month: 11, day: 30 });
  });

  it('febrero se acota a su ultimo dia, y el 29 vale en los bisiestos', () => {
    expect(nextFixedDate('02-30', hoy)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextFixedDate('02-29', hoy)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(nextFixedDate('02-29', { year: 2028, month: 1, day: 15 })).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('una fecha que existe no se toca', () => {
    expect(nextFixedDate('03-31', hoy)).toEqual({ year: 2026, month: 3, day: 31 });
    expect(nextFixedDate('12-31', hoy)).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it('y si ya paso, se acota tambien en el ano siguiente', () => {
    expect(nextFixedDate('09-31', { year: 2026, month: 11, day: 1 })).toEqual({ year: 2027, month: 9, day: 30 });
  });
});
