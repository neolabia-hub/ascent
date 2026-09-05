import { z } from 'zod';

/**
 * LA FECHA DE UNA CAMPANA ANUAL: "MM-DD", y el dia TIENE que existir en ese mes.
 *
 * ─── POR QUE ESTA APARTE ───
 *
 * El mismo patron vivia escrito a mano en tres sitios —el requisito, la matriz y el tipo de
 * formacion— y los tres aceptaban `3[01]` en CUALQUIER mes. Con el dia desbordado nada falla:
 * `Date.UTC` se lo lleva al mes siguiente en silencio, asi que una reinduccion guardada como
 * `09-31` vencia **el 1 de octubre** mientras la pantalla seguia diciendo 09-31.
 *
 * Se encontro el 2026-09-04 leyendo la configuracion real del tenant, que tenia justo esa: `09-31`.
 * Un patron copiado en tres sitios es un patron que se corrige en dos.
 *
 * Se valida contra un ano BISIESTO a proposito: `02-29` es una fecha legitima para una campana
 * —cae en 28 los anos que no lo son, y de eso se encarga `nextFixedDate`—, y rechazarla obligaria
 * a explicar por que el 29 de febrero no se puede elegir.
 */
export const FIXED_DATE_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Cuantos dias tiene el mes, en un ano bisiesto (para admitir el 29 de febrero). */
function diasDelMes(month: number): number {
  return new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

export const fixedDateSchema = z
  .string()
  .regex(FIXED_DATE_PATTERN, 'Fecha MM-DD')
  .refine(
    (valor) => {
      const [month, day] = valor.split('-').map(Number) as [number, number];
      return day <= diasDelMes(month);
    },
    // El mensaje dice el numero, no la regla: "el 31 de septiembre no existe" se entiende sin saber
    // nada del sistema; "dia invalido para el mes" hace pensar en un error del programa.
    { message: 'Ese dia no existe en ese mes. Revisa la fecha de la campana.' },
  );
