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

/**
 * Proxima ocurrencia de una fecha fija anual (MM-DD) en o despues de `from`.
 *
 * ─── EL DIA SE ACOTA AL MES, NO SE DESBORDA (2026-09-04) ───
 *
 * La campana se guarda como texto "MM-DD" y el patron que la valida acepta `3[01]` en CUALQUIER
 * mes: `09-31`, `04-31`, `02-30` pasan el filtro. Con el dia desbordado, `Date.UTC` no falla — se
 * lo lleva al mes siguiente en silencio—, asi que una reinduccion configurada "cada 30 de
 * septiembre" mal escrita como `09-31` vencia **el 1 de octubre**, y nadie tenia forma de notarlo:
 * la pantalla seguia diciendo 09-31.
 *
 * MEDIDO el 2026-09-04, con la reinduccion del tenant puesta en `09-31`: vencimiento el 1 de
 * octubre. Los otros: `02-30` -> 2 de marzo, `04-31` -> 1 de mayo.
 *
 * Se ACOTA al ultimo dia del mes, que es lo mismo que ya hacia `addMonths` para el caso hermano
 * ("si el mes destino es mas corto, cae en su ultimo dia"): dos funciones de fecha en el mismo
 * archivo no pueden resolver distinto el mismo problema. Febrero 29 sigue valiendo y cae en 28 los
 * anos que no son bisiestos, que es lo que espera cualquiera que escriba esa fecha.
 *
 * El patron tambien se apreto (`fixedDateSchema`), para que no se pueda GUARDAR una fecha que no
 * existe. Esto de aqui es la red de abajo: la base ya tiene fechas escritas con el patron viejo.
 */
export function nextFixedDate(fixedDate: string, from: CalendarDate): CalendarDate {
  const [month, day] = fixedDate.split('-').map(Number) as [number, number];
  const enElAno = (year: number): CalendarDate => {
    const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { year, month, day: Math.min(day, ultimoDia) };
  };
  const thisYear = enElAno(from.year);
  const isAfterOrSame =
    thisYear.month > from.month || (thisYear.month === from.month && thisYear.day >= from.day);
  return isAfterOrSame ? thisYear : enElAno(from.year + 1);
}

export type Trigger = 'ON_JOIN' | 'ON_HIRE' | 'SCHEDULED';

export interface FirstDueContext {
  /** Fecha de ingreso (columna de SOLO FECHA; ancla de la induccion previa, D1072). */
  hiredAt: Date | null;
  /** INSTANTE en que la persona entro a la audiencia. */
  joinedAt: Date;
  /**
   * INSTANTE en que empezo a existir la regla que crea esta obligacion. Ver la nota de
   * `computeFirstDueAt`: sin esto, una audiencia reutilizada hace nacer la obligacion vencida.
   */
  ruleCreatedAt?: Date | null;
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
 *
 * ─── CUANDO NACE LA OBLIGACION NO ES CUANDO ENTRO A LA AUDIENCIA (2026-09-03) ───
 *
 * Ese "hoy" era `joinedAt`, y es falso en el caso mas comun de todos: **las audiencias se
 * REUTILIZAN entre formaciones** (`audiences.findOrCreate`, y esta bien que asi sea). "Toda la
 * empresa" o "Cargo: Conductor" pueden existir desde hace meses, asi que al estrenar un requisito
 * nuevo la gente ya lleva meses dentro del grupo — y su plazo se contaba desde entonces.
 *
 * MEDIDO: con una audiencia de 60 dias y un requisito nuevo de 30, las **7 de 7** obligaciones
 * nacieron VENCIDAS, con fecha de hacia un mes. Es exactamente el incumplimiento inventado que la
 * gracia existe para impedir, pero la gracia comparaba contra el mismo `joinedAt` viejo y no se
 * disparaba nunca. Lo encontro el recorrido de la REINDUCCION, que es donde mas duele: se publica
 * y la plantilla entera aparece en rojo el primer dia.
 *
 * La obligacion nace cuando empieza a existir **la regla que la crea**, o cuando la persona entra
 * a la audiencia si eso ocurre despues. De ahi el maximo de los dos.
 */
export function computeFirstDueAt(trigger: Trigger, dueDays: number, ctx: FirstDueContext): Date {
  // Sin `ruleCreatedAt` se comporta como antes, para no obligar a tocar a quien solo quiere la
  // fecha de una obligacion suelta, que no viene de ninguna regla.
  const nacimiento =
    ctx.ruleCreatedAt && ctx.ruleCreatedAt > ctx.joinedAt ? ctx.ruleCreatedAt : ctx.joinedAt;
  const desde = toBogotaDate(nacimiento);
  if (trigger === 'SCHEDULED' && ctx.recurrence?.fixedDate) {
    return endOfDay(nextFixedDate(ctx.recurrence.fixedDate, desde));
  }

  /*
    ── LA PRIMERA RONDA DE UNA CAMPANA CAE EN LA FECHA DE LA CAMPANA, SI DA TIEMPO (2026-09-04) ──

    Antes no. La fecha fija solo la usaba `SCHEDULED`, y el automatismo que exige una reinduccion al
    publicarla pone `ON_JOIN`: la primera ronda vencia a los 30 dias de publicarla y la campana solo
    regia desde la segunda. La pantalla decia "cada ano antes del 31 de marzo" y la primera no vencia
    ese dia — lo que el auditor lee y lo que el sistema hace no coincidian el primer ano.

    Y la razon por la que se dejo asi era buena: estrenar la reinduccion el 15 de marzo con
    vencimiento el 31 da dos semanas para que 1.060 personas la hagan. Asi que no se trata de
    escoger una de las dos, sino de mirar CUANTO FALTA:

      falta mas que la ventana (60 dias)  -> vence en la fecha de la campana. Es lo que dice la
                                             pantalla, y hay tiempo de sobra.
      falta menos                          -> los dias de gracia. Estrenarla encima de la fecha no
                                             puede obligar a una empresa entera en dos semanas.

    Se usa la VENTANA de la propia recurrencia como umbral y no un numero suelto: es la misma
    antelacion con la que el sistema abre las rondas siguientes, asi que la primera se comporta como
    las demas en vez de tener su propia regla.
  */
  const recurrencia = ctx.recurrence;
  if (recurrencia?.fixedDate && trigger !== 'ON_HIRE') {
    const enLaCampana = nextFixedDate(recurrencia.fixedDate, desde);
    const diasQueFaltan = Math.round((endOfDay(enLaCampana).getTime() - endOfDay(desde).getTime()) / 86_400_000);
    if (diasQueFaltan >= recurrencia.windowDays) return endOfDay(enLaCampana);
    return endOfDay(addDays(desde, DIAS_DE_GRACIA));
  }

  const anchor = trigger === 'ON_HIRE' && ctx.hiredAt ? fromDateOnly(ctx.hiredAt) : desde;
  const calculada = addDays(anchor, dueDays);
  const nace = endOfDay(calculada) < endOfDay(desde) ? addDays(desde, DIAS_DE_GRACIA) : calculada;
  return endOfDay(nace);
}

/**
 * DE DONDE SE CUENTA LA RONDA SIGUIENTE, que NO es lo mismo en las dos formas de repetir.
 *
 * ─── EL FALLO QUE OBLIGO A SEPARARLAS (2026-09-05) ───
 *
 * El ancla era `completedAt` para las dos, y en una CAMPANA eso es falso: quien hace la
 * reinduccion el 20 de marzo la hace **para el periodo que vence el 31 de marzo**, no para el dia
 * 20. Con el ancla en la fecha de completado, `nextFixedDate` devolvia la ocurrencia siguiente al
 * dia 20 —que es el 31 de marzo **del mismo ano**, once dias despues—, la ventana de 60 dias ya
 * estaba abierta, y al dia siguiente de cumplir le nacia la ronda 2 con el mismo vencimiento que
 * acababa de satisfacer.
 *
 * MEDIDO: completada el 20/03/2026, ronda 2 abierta con vencimiento 31/03/2026. Esa ronda pasa a
 * VENCIDA el 1 de abril y se cierra como NO REALIZADA diez meses despues, asi que **el indicador
 * acusa de incumplir justo a quien cumplio**, y solo a quien cumplio: al que la hace tarde o no la
 * hace no le pasa. Un indicador que castiga cumplir esta al reves.
 *
 * Solo pica cuando se completa DENTRO de la ventana de la campana —que es cuando la hace todo el
 * mundo—, y por eso no lo vieron los recorridos: `reinduccion-ciclos.mjs` comprime la recurrencia
 * a un mes (`everyMonths`) y prueba el camino de la que NO se hizo.
 *
 *   fecha fija    ancla en el VENCIMIENTO de la ronda: lo que se satisface es el PERIODO, y el
 *                 siguiente es la ocurrencia posterior a ese periodo.
 *   cada N meses  ancla en `completedAt`, que es el sentido entero del aniversario: quien se
 *                 adelanta gana esos dias de vigencia, y es lo correcto — el certificado es suyo.
 */
export function cycleAnchor(
  recurrence: Recurrence,
  ronda: { completedAt?: Date | null; dueAt?: Date | null },
  fallback: Date,
): Date {
  if (recurrence.fixedDate !== undefined) return ronda.dueAt ?? ronda.completedAt ?? fallback;
  return ronda.completedAt ?? ronda.dueAt ?? fallback;
}

/**
 * Vencimiento de la ronda SIGUIENTE (Decision #12: la obligacion es viva en el tiempo).
 * El ancla la elige `cycleAnchor`: no es la misma para una campana que para un aniversario.
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
