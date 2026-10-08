import { recurrenceSchema } from '@neo-pulse/shared';
import {
  addMonths,
  aniversarioDeIngreso,
  ingresoCivil,
  primeraRondaPorIngreso,
  proximoVencimiento,
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

  it('la fecha fija anual salta al año siguiente, nunca al mismo dia', () => {
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

  it('la proxima fecha fija respeta el año en curso si aun no ha pasado', () => {
    expect(nextFixedDate('01-31', { year: 2026, month: 1, day: 5 })).toEqual({ year: 2026, month: 1, day: 31 });
    expect(nextFixedDate('01-31', { year: 2026, month: 2, day: 5 })).toEqual({ year: 2027, month: 1, day: 31 });
  });
});

/**
 * UNA CAMPANA SE SATISFACE POR PERIODO, UN ANIVERSARIO POR FECHA DE CUMPLIMIENTO.
 *
 * El ancla era `completedAt` para las dos. Quien hacia la campaña ANTES de su fecha —o sea,
 * cualquiera que cumpliera— recibia al dia siguiente la ronda 2 con el mismo vencimiento que
 * acababa de satisfacer, y diez meses despues esa ronda se cerraba como NO REALIZADA. El
 * indicador acusaba de incumplir exactamente a quien habia cumplido.
 */
describe('el ancla de la ronda siguiente', () => {
  const campana = recurrenceSchema.parse({ fixedDate: '03-31', windowDays: 60 });

  it('en una campaña ancla en el VENCIMIENTO, aunque la haya hecho once dias antes', () => {
    const ronda = {
      completedAt: new Date('2026-03-20T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    const ancla = cycleAnchor(campana, ronda, new Date('2026-03-21T10:00:00-05:00'));
    expect(civil(ancla)).toBe('2026-03-31');
    // Y por eso la siguiente es la de 2027, no la que acaba de cumplir.
    expect(civil(computeNextCycleDueAt(campana, ancla))).toBe('2027-03-31');
  });

  it('adelantarse a la campaña no la adelanta: el periodo es el que es', () => {
    const enero = {
      completedAt: new Date('2026-01-15T10:00:00-05:00'),
      dueAt: new Date('2026-03-31T23:59:59-05:00'),
    };
    expect(civil(computeNextCycleDueAt(campana, cycleAnchor(campana, enero, new Date())))).toBe('2027-03-31');
  });

  it('hacerla TARDE tampoco corre la campaña: sigue siendo la del año siguiente', () => {
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

  it('a quien entra mañana NO le afecta: su fecha de D1072 se respeta intacta', () => {
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

  it('y si ya paso, se acota tambien en el año siguiente', () => {
    expect(nextFixedDate('09-31', { year: 2026, month: 11, day: 1 })).toEqual({ year: 2027, month: 9, day: 30 });
  });
});

describe('reinduccion automatica: cada N meses desde el INGRESO', () => {
  const desdeIngreso = recurrenceSchema.parse({ everyMonths: 12, windowDays: 60, anchor: 'HIRE' });
  const ingreso = { year: 2024, month: 3, day: 15 };
  const a = (texto: string) => new Date(`${texto}T10:00:00-05:00`);

  it('el aniversario es ingreso + N, + 2N...: el primero en o despues de la fecha', () => {
    expect(aniversarioDeIngreso(ingreso, 12, { year: 2026, month: 3, day: 15 })).toEqual({ year: 2026, month: 3, day: 15 });
    expect(aniversarioDeIngreso(ingreso, 12, { year: 2026, month: 3, day: 16 })).toEqual({ year: 2027, month: 3, day: 15 });
    expect(aniversarioDeIngreso(ingreso, 6, { year: 2024, month: 3, day: 16 })).toEqual({ year: 2024, month: 9, day: 15 });
  });

  it('un ingreso del 29 de febrero cae en 28 los años cortos y vuelve al 29 en el bisiesto', () => {
    const bisiesto = { year: 2024, month: 2, day: 29 };
    expect(aniversarioDeIngreso(bisiesto, 12, { year: 2025, month: 1, day: 1 })).toEqual({ year: 2025, month: 2, day: 28 });
    expect(aniversarioDeIngreso(bisiesto, 12, { year: 2028, month: 1, day: 1 })).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('el ancla: la fecha de ingreso; sin ella, cuando termino su induccion; y si no, cuando entro al grupo', () => {
    const entro = a('2026-09-23');
    const termino = a('2026-02-10');
    expect(ingresoCivil(new Date('2024-03-15T00:00:00.000Z'), entro, termino)).toEqual(ingreso);
    expect(ingresoCivil(null, entro, termino)).toEqual({ year: 2026, month: 2, day: 10 });
    expect(ingresoCivil(null, entro, null)).toEqual({ year: 2026, month: 9, day: 23 });
  });

  it('quien todavia no cumple sus meses no la recibe: ni el recien ingresado ni el que esta fuera de la antelacion', () => {
    expect(primeraRondaPorIngreso(desdeIngreso, { year: 2026, month: 9, day: 6 }, a('2026-10-06'))).toBeNull();
    // Cumple sus 12 meses en 70 dias: fuera de los 60 de antelacion.
    expect(primeraRondaPorIngreso(desdeIngreso, { year: 2025, month: 12, day: 15 }, a('2026-10-06'))).toBeNull();
  });

  it('quien YA cumplio sus meses la recibe al publicar, con los dias de gracia (no espera a su proximo aniversario)', () => {
    // Ingreso en marzo de 2024: lleva dos años y medio, y su proximo aniversario es en cinco meses.
    const vence = primeraRondaPorIngreso(desdeIngreso, ingreso, a('2026-10-06'));
    expect(vence && civil(vence)).toBe('2026-11-05');
  });

  it('los dias de gracia son los de la regla, no siempre 30', () => {
    const con15 = recurrenceSchema.parse({ everyMonths: 12, windowDays: 60, anchor: 'HIRE', graceDays: 15 });
    const vence = primeraRondaPorIngreso(con15, ingreso, a('2026-10-06'));
    expect(vence && civil(vence)).toBe('2026-10-21');
  });

  it('tras ponerse al dia no vuelve a deberla enseguida: le toca el aniversario a mas de medio periodo', () => {
    // Se puso al dia con vencimiento el 5-nov-2026; su aniversario de marzo de 2027 queda a 4 meses.
    const alDia = { dueAt: new Date('2026-11-05T23:59:59-05:00'), completedAt: a('2026-10-20') };
    expect(civil(proximoVencimiento(desdeIngreso, alDia, a('2026-10-20'), ingreso))).toBe('2028-03-15');
    // Si el aniversario queda a mas de seis meses, ese es el siguiente.
    const lejos = { dueAt: new Date('2026-08-01T23:59:59-05:00'), completedAt: a('2026-07-20') };
    expect(civil(proximoVencimiento(desdeIngreso, lejos, a('2026-07-20'), ingreso))).toBe('2027-03-15');
  });

  it('contando desde la INDUCCION manda la induccion aunque tenga fecha de ingreso', () => {
    const entro = a('2026-09-23');
    const termino = a('2026-02-10');
    const hired = new Date('2024-03-15T00:00:00.000Z');
    expect(ingresoCivil(hired, entro, termino, true)).toEqual({ year: 2026, month: 2, day: 10 });
    // Sin induccion registrada, lo que queda es el ingreso.
    expect(ingresoCivil(hired, entro, null, true)).toEqual(ingreso);
  });

  it('dentro de la ventana nace y vence en SU aniversario', () => {
    const vence = primeraRondaPorIngreso(desdeIngreso, ingreso, a('2027-01-20'));
    expect(vence && civil(vence)).toBe('2027-03-15');
  });

  it('si el aniversario cae encima al estrenar la regla, se dan los dias de gracia', () => {
    const vence = primeraRondaPorIngreso(desdeIngreso, ingreso, a('2027-03-10'));
    expect(vence && civil(vence)).toBe('2027-04-09');
  });

  it('la ronda siguiente es el aniversario POSTERIOR al periodo cumplido, la haga cuando la haga', () => {
    const ronda = { dueAt: new Date('2027-03-15T23:59:59-05:00'), completedAt: a('2027-02-01') };
    expect(civil(proximoVencimiento(desdeIngreso, ronda, a('2027-02-01'), ingreso))).toBe('2028-03-15');
    // Tambien si la hizo tarde, o si su primera ronda vencio con gracia unos dias despues.
    const conGracia = { dueAt: new Date('2027-04-09T23:59:59-05:00'), completedAt: a('2027-05-20') };
    expect(civil(proximoVencimiento(desdeIngreso, conGracia, a('2027-05-20'), ingreso))).toBe('2028-03-15');
  });

  it('sin ancla la recurrencia de siempre no cambia: cuenta desde que la completo', () => {
    const ronda = { dueAt: new Date('2027-03-15T23:59:59-05:00'), completedAt: a('2027-02-01') };
    expect(civil(proximoVencimiento(anual, ronda, a('2027-02-01'), ingreso))).toBe('2028-02-01');
  });
});
