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
