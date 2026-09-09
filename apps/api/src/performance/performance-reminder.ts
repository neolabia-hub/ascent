/**
 * EL RECORDATORIO DEL CICLO: a quien no ha respondido, cuando se acerca el cierre.
 *
 * Calculo puro y sin base de datos, como el resto de reglas del modulo: cuando avisar es una
 * decision que se discute con el cliente ("¿tres dias antes o una semana?") y tiene que poder
 * cambiarse mirando una linea, no un worker.
 */

/**
 * Cuantos dias antes del cierre se avisa, POR DEFECTO.
 *
 * Lo que manda es `performanceReminderDays` de los ajustes del tenant, que es donde se cambia sin
 * tocar codigo: seis semanas de campaña y dos semanas de campaña no se recuerdan con el mismo
 * plazo. Esto es solo el valor con el que arranca una empresa nueva. Y es UN aviso, no varios: dos
 * recordatorios se leen como acoso.
 */
export const DIAS_DE_AVISO = 3;

/**
 * DIAS COMPLETOS que faltan para el cierre, contando por FECHA y no por horas.
 *
 * Si se restaran milisegundos, un ciclo que cierra mañana a las 8 de la mañana daria "0 dias" a las
 * 9 de esta noche y el aviso saldria hoy; y uno que cierra hoy a las 23:59 daria "0" desde el
 * mediodia. Lo que la gente entiende por "faltan 3 dias" es la diferencia entre dos fechas.
 */
export function diasHastaElCierre(cierre: Date, ahora: Date): number {
  const soloFecha = (fecha: Date) => Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.round((soloFecha(cierre) - soloFecha(ahora)) / 86_400_000);
}

/**
 * SI HOY TOCA AVISAR.
 *
 * Se avisa en la VENTANA que va desde `diasDeAviso` hasta el dia del cierre, y no exactamente el
 * dia N: el worker corre una vez al dia y un servidor caido esa mañana —o un ciclo creado dentro de
 * la ventana— dejaria a todo el mundo sin recordatorio para siempre. Que no se repita lo garantiza
 * el propio aviso ya enviado, no el calendario.
 *
 * Un ciclo ya vencido NO recuerda nada: a esas alturas el aviso util es otro, y decirle a alguien
 * que corra por algo que ya cerro solo confirma que el sistema no se entera.
 */
export function tocaRecordar(cierre: Date, ahora: Date, diasDeAviso: number = DIAS_DE_AVISO): boolean {
  const faltan = diasHastaElCierre(cierre, ahora);
  return faltan >= 0 && faltan <= diasDeAviso;
}

/** El texto, que depende de cuanto falta: "mañana" y "hoy" no se dicen con un numero. */
export function cuandoCierra(faltan: number): string {
  if (faltan <= 0) return 'cierra hoy';
  if (faltan === 1) return 'cierra mañana';
  return `cierra en ${faltan} dias`;
}
