import type { SurveyQuestion } from '@neo-pulse/shared';

export type ResultadoEncuesta = 'POSITIVE' | 'NEGATIVE' | 'NA';

/**
 * ¿QUE DICE UNA ENCUESTA RESPONDIDA? (Decision #114)
 *
 * ─── PARA QUE EXISTE ESTE VEREDICTO ───
 *
 * Sin el, una encuesta es un montón de respuestas sueltas que nadie agrega, y entonces no sirve
 * para lo unico que la justifica: **decidir si hay que reforzar**. En eficacia, un resultado
 * negativo dispara un refuerzo; en satisfaccion, alimenta el indicador que revisa el auditor.
 *
 * ─── LA REGLA, Y POR QUE ES ASI ───
 *
 * | Tipo | Cuenta | Umbral |
 * |---|---|---|
 * | `YES_NO` | Manda. Un "no" en "¿aplica lo aprendido?" es un negativo y no hay promedio que lo tape | Cualquier `false` -> NEGATIVE |
 * | `SCALE` | Se promedia sobre 5 | Media < 3 -> NEGATIVE |
 * | `TEXT` | No cuenta | — |
 *
 * **El binario manda sobre el promedio** y ese orden importa. Un jefe que dice "no aplica lo
 * aprendido" pero puntua 4 en las escalas —porque la formacion en si estuvo bien— tiene que dar
 * NEGATIVO: lo que se esta midiendo es la transferencia al puesto, no si la clase gusto. Con el
 * promedio mandando, ese caso saldria positivo y nadie reforzaria nada.
 *
 * **Menos de 3 sobre 5 es negativo**, no menos de 2.5. En una escala de 1 a 5, el 3 es "regular" y
 * una capacitacion regular no cumplio su objetivo. Poner el corte en la mitad exacta convertiria
 * en aprobado todo lo mediocre, que es justo lo que hay que detectar.
 *
 * **NA cuando no hay nada que medir**: solo preguntas de texto, o ninguna respondida. Es distinto
 * de POSITIVE y no puede confundirse con el —un indicador que cuenta los NA como buenos miente—.
 */
export function calificarEncuesta(
  preguntas: SurveyQuestion[],
  respuestas: Record<string, unknown>,
): ResultadoEncuesta {
  let hayBinaria = false;
  let algunNo = false;
  const escalas: number[] = [];

  for (const pregunta of preguntas) {
    const valor = respuestas[pregunta.id];
    if (valor === undefined || valor === null || valor === '') continue;

    if (pregunta.kind === 'YES_NO') {
      hayBinaria = true;
      if (valor === false) algunNo = true;
    } else if (pregunta.kind === 'SCALE') {
      const numero = Number(valor);
      // Se ignora lo que no sea un numero valido en vez de contarlo como cero: un cero inventado
      // hunde la media y produciria refuerzos que nadie necesita.
      if (Number.isFinite(numero) && numero >= 1 && numero <= 5) escalas.push(numero);
    }
  }

  // El binario manda: ver la nota de arriba.
  if (algunNo) return 'NEGATIVE';

  if (escalas.length > 0) {
    const media = escalas.reduce((suma, valor) => suma + valor, 0) / escalas.length;
    return media < 3 ? 'NEGATIVE' : 'POSITIVE';
  }

  // Sin escalas pero con un binario respondido que si: es un positivo legitimo.
  if (hayBinaria) return 'POSITIVE';

  return 'NA';
}

/**
 * ¿ESTA COMPLETA? Devuelve las preguntas obligatorias que faltan.
 *
 * Se comprueba en el SERVIDOR y no solo en la pantalla: una encuesta a medias guardada como
 * completa es peor que una sin responder, porque cuenta en el denominador del indicador como si se
 * hubiera evaluado.
 *
 * Una escala fuera de 1-5 se trata como NO respondida en vez de rechazarse con un error aparte: el
 * efecto para quien responde es el mismo —le falta esa pregunta— y no hace falta un segundo
 * mensaje que explique un rango que la pantalla ya impone.
 */
export function loQueFalta(preguntas: SurveyQuestion[], respuestas: Record<string, unknown>): string[] {
  return preguntas
    .filter((pregunta) => {
      if (!pregunta.required) return false;
      const valor = respuestas[pregunta.id];
      if (valor === undefined || valor === null || valor === '') return true;
      if (pregunta.kind === 'SCALE') {
        const numero = Number(valor);
        return !Number.isFinite(numero) || numero < 1 || numero > 5;
      }
      if (pregunta.kind === 'YES_NO') return typeof valor !== 'boolean';
      return false;
    })
    .map((pregunta) => pregunta.text);
}
