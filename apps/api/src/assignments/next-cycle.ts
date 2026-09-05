import type { OnExpiry, Recurrence } from '@neo-pulse/shared';
import { cycleOpensAt, proximoVencimiento, type RondaCumplida } from './due-date.js';

/** Lo que hay que hacer con la ronda anterior y con la siguiente. */
export interface NextCycleDecision {
  /** Abrir la ronda siguiente. */
  abrir: boolean;
  /** Cerrar la anterior como NO REALIZADA (solo si sigue viva). */
  cerrarAnterior: boolean;
}

/** Estados en los que la ronda anterior sigue VIVA y por tanto se puede cerrar. */
const VIVA = new Set(['PENDING', 'OVERDUE']);

/**
 * ¿SE ABRE LA RONDA SIGUIENTE, Y QUE PASA CON LA ANTERIOR?
 *
 * Vive aparte del motor y sin tocar la base a proposito: es una regla de negocio con tres caminos
 * y un monton de esquinas, y probarla exige exactamente cero infraestructura. Misma familia que
 * `due-date.ts` y `audience-rule.ts`.
 *
 * ─── LAS TRES POLITICAS ───
 *
 *   ESPERA   no nace la siguiente hasta que haga la anterior. Era lo unico que habia, y tiene un
 *            efecto que casi nadie quiere: quien nunca la hace **desaparece del denominador** de
 *            todos los anos siguientes, asi que el peor incumplidor sale de la cuenta y la
 *            cobertura del ano que viene se ve mejor de lo que es.
 *   ACUMULA  nace la siguiente Y la anterior sigue pendiente: debe las dos. Para quien exige
 *            ponerse al dia antes de seguir. A los tres anos debe tres.
 *   CIERRA   la anterior se cierra como NO REALIZADA —que SI cuenta como incumplimiento de ese
 *            periodo, a diferencia de retirada o eximida— y la siguiente nace para todos. Es como
 *            funciona el cumplimiento por CALENDARIO: cada campana es su periodo, y el periodo
 *            cierra. Es lo que pregunta el auditor, ano por ano.
 *
 * Lo cumplido nunca se cierra: `cerrarAnterior` solo puede ser cierto sobre una ronda VIVA. Una
 * eximida o una retirada ya tienen su explicacion escrita y no se pisan.
 */
export function decidirRondaSiguiente(input: {
  /** Estado de la ronda anterior. */
  estadoAnterior: string;
  politica: OnExpiry;
  /** ¿Llego ya la ventana en la que se abre la siguiente? */
  ventanaAbierta: boolean;
}): NextCycleDecision {
  const hecha = input.estadoAnterior === 'COMPLETED';
  const NO = { abrir: false, cerrarAnterior: false };

  // Sin hacer y la politica es esperar: no pasa nada hasta que la haga.
  if (!hecha && input.politica === 'ESPERA') return NO;
  // Todavia no toca. Se comprueba DESPUES de la politica para que "esperar" no dependa del
  // calendario: si no la hizo, da igual que la ventana este abierta.
  if (!input.ventanaAbierta) return NO;

  return { abrir: true, cerrarAnterior: !hecha && input.politica === 'CIERRA' && VIVA.has(input.estadoAnterior) };
}

/** Lo que hay que hacer con la PRIMERA ronda de una regla para una persona concreta. */
export interface PrimeraRondaDecision {
  /** Crear la obligacion. */
  abrir: boolean;
  /**
   * Con ESTE vencimiento, heredado de lo que ya tenia hecho. `null` = calcularlo como a
   * cualquiera (`computeFirstDueAt`), que es el camino de siempre.
   */
  venceEl: Date | null;
}

/**
 * ¿LE NACE LA RONDA 1 A QUIEN YA HIZO ESA MISMA FORMACION POR OTRA REGLA?
 *
 * ─── EL CASO, Y POR QUE NO ES RARO ───
 *
 * La deduplicacion del motor es POR REGLA: una obligacion por regla, persona y ronda. Es lo
 * correcto mientras cada formacion cuelgue de un solo cargo, y deja de serlo en cuanto la matriz
 * repite una formacion en varios — que en transporte es lo normal: la induccion de bodega vale
 * igual para auxiliar, montacarguista y coordinador.
 *
 * Sin esto, **quien la COMPLETO y cambia a otro cargo que exige la misma, la vuelve a deber**: la
 * regla del cargo nuevo no tiene historia suya, asi que le abre la ronda 1 como si nunca la
 * hubiera hecho. Y no hay forma de que el usuario entienda por que: en su pantalla aparece una
 * formacion que hizo el mes pasado, con constancia emitida.
 *
 * ─── LOS TRES CAMINOS ───
 *
 *   no se repite    el hecho no caduca. La hizo, punto: no le nace nunca. Su evidencia sigue
 *                   siendo la obligacion CUMPLIDA de la otra regla, que no se borra jamas.
 *   vigente         no le nace TODAVIA. Le nacera cuando se abra la ventana de la vigencia que ya
 *                   tiene, con SU vencimiento — el certificado es de la persona, no del cargo:
 *                   cambiar de puesto no reinicia el reloj ni lo adelanta.
 *   caducada        le nace como a cualquiera, con sus dias de gracia. No se hereda una fecha ya
 *                   pasada: una obligacion no puede nacer vencida (ver `computeFirstDueAt`), y
 *                   quien acaba de entrar al cargo esta en la misma situacion que un ingreso nuevo.
 *
 * Vive aparte del motor y sin tocar la base, como `decidirRondaSiguiente`: son cuatro esquinas y
 * probarlas no deberia costar infraestructura.
 */
export function decidirPrimeraRonda(input: {
  /**
   * La ronda que ya cumplio de esta MISMA formacion, por otra regla. `null` = nunca la hizo.
   * Van las dos fechas porque el ancla no es la misma en una campana que en un aniversario
   * (`cycleAnchor`): quien hizo la reinduccion de 2026 la hizo para el periodo de 2026, y su
   * siguiente es la de 2027 aunque haya cambiado de cargo en septiembre.
   */
  cumplida: RondaCumplida | null;
  /** La recurrencia de la regla NUEVA: es ella la que dice cada cuanto hay que renovarla. */
  recurrencia: Recurrence | null;
  ahora: Date;
}): PrimeraRondaDecision {
  const DE_SIEMPRE = { abrir: true, venceEl: null };
  if (!input.cumplida?.completedAt) return DE_SIEMPRE;
  if (!input.recurrencia) return { abrir: false, venceEl: null };

  const vence = proximoVencimiento(input.recurrencia, input.cumplida, input.cumplida.completedAt);
  if (vence <= input.ahora) return DE_SIEMPRE;
  if (input.ahora < cycleOpensAt(vence, input.recurrencia)) return { abrir: false, venceEl: null };
  return { abrir: true, venceEl: vence };
}
