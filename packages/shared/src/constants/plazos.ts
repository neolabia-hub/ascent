/**
 * PLAZO DE UNA INDUCCION DE INGRESO: 8 DIAS DESPUES DE LA FECHA DE INGRESO (2026-10-01).
 *
 * Era -1, «un dia antes del ingreso», para que la induccion fuera PREVIA al inicio de labores
 * (D1072 art. 2.2.4.6.11). Funcionaba solo si a la persona la creaban en la plataforma dias antes
 * de su primer dia: si la creaban el mismo dia —o despues—, el vencimiento ya habia pasado y nacia
 * VENCIDA. El cliente lo decidio: en la practica a veces se crea el mismo dia, asi que el plazo es
 * de 8 dias desde el ingreso. Quien quiera otro lo ajusta por formacion en Quiénes.
 *
 * Una sola constante para las tres puertas que crean el requisito —publicar, «volver a exigir» y la
 * matriz por cargo—: cuando estaba escrito en cada una, la misma casilla vencia distinto segun por
 * donde se hubiera creado.
 */
export const PLAZO_INDUCCION_DE_INGRESO = 8;

/**
 * EL MINIMO: 1 DIA DESPUES DEL INGRESO, y no se puede bajar (2026-10-01, decision del cliente:
 * «dejar siempre despues, que no haya forma de que falle»).
 *
 * Con -1 fallaba a quien se creaba la vispera de su ingreso; con 0, a quien se creaba la tarde de
 * su ingreso: en los dos casos vencia esa misma medianoche y amanecia VENCIDA. Desde 1 dia despues
 * siempre queda al menos un dia entero, y si la persona se crea tarde, la gracia de 30 dias
 * (Decision #70) la cubre. Lo valida el esquema —pantalla y API— y `updateRule` en el servidor.
 */
export const PLAZO_MINIMO_DE_INGRESO = 1;

export const MENSAJE_PLAZO_DE_INGRESO =
  'Al ingresar, el plazo es de 1 día o más DESPUÉS de la fecha de ingreso (por defecto 8). Antes del ingreso o el mismo día, a quien se crea la víspera le nace vencida.';
