import type { HechoVencimiento } from './expirations.js';

/**
 * EL AVISO DE LO QUE SE VENCE (`PENDIENTES` 3.3).
 *
 * ─── EL PROBLEMA QUE CIERRA ───
 *
 * El informe de Vencimientos existe desde la Decision #126 y hay que **acordarse de entrar a
 * mirarlo**, que es exactamente el problema que venia a resolver: la lista se armaba a mano en una
 * hoja de calculo y siempre llegaba tarde. Un informe que solo funciona si alguien se acuerda es la
 * misma hoja de calculo con mejor tipografia.
 *
 * ─── LAS TRES DECISIONES QUE HAY AQUI ───
 *
 * 1. **Un aviso, no cuarenta.** Se manda un resumen por persona y no una notificacion por cada
 *    vencimiento. Cuarenta avisos el mismo lunes no informan de nada: enseñan a archivarlos sin
 *    leerlos, y con ellos se archiva el que si importaba.
 *
 * 2. **Dice las dos cifras por separado, nunca la suma.** Son dos trabajos opuestos —reprogramar
 *    ocupa un salon y un dia del año que viene; perseguir es llamar a alguien esta semana— y un
 *    numero unico obliga a entrar para saber de cual se trata. Que es justo lo que no se hace.
 *
 * 3. **Lo ya vencido se nombra aparte y primero.** No es "lo que viene": es lo que ya se cayo, y es
 *    la unica parte sobre la que hay que actuar hoy.
 *
 * Vive separado del worker para poder probar el texto sin base de datos ni reloj: lo que se rompe
 * de estas cosas es el plural y el caso de "no hay nada", no el cron.
 */

export interface ResumenDelAviso {
  /** Lo que ya caduco y sigue sin resolverse. Va primero. */
  vencido: number;
  /** Ya la tuvo y deja de estar acreditada: hay que volver a convocarla. */
  reprogramar: number;
  /** Nunca la ha cumplido y tiene plazo: hay a quien llamar. */
  perseguir: number;
  total: number;
}

/** Cuantos dias caben en el aviso. Lo de mas alla existe, pero no es de esta semana. */
export function dentroDelAviso(hecho: HechoVencimiento, hoy: Date, dias: number): boolean {
  const limite = new Date(hoy.getTime() + dias * 86_400_000);
  // Lo ya vencido entra SIEMPRE, sea de cuando sea: es lo unico que ya se cayo.
  return hecho.fecha <= limite;
}

export function resumirParaElAviso(hechos: HechoVencimiento[], hoy: Date, dias: number): ResumenDelAviso {
  const resumen: ResumenDelAviso = { vencido: 0, reprogramar: 0, perseguir: 0, total: 0 };

  for (const hecho of hechos) {
    if (!dentroDelAviso(hecho, hoy, dias)) continue;
    resumen.total += 1;
    if (hecho.fecha < hoy) resumen.vencido += 1;
    if (hecho.clase === 'REPROGRAMAR') resumen.reprogramar += 1;
    else resumen.perseguir += 1;
  }

  return resumen;
}

function plural(cuantos: number, singular: string, muchos: string): string {
  return `${cuantos} ${cuantos === 1 ? singular : muchos}`;
}

/**
 * EL TEXTO DEL AVISO, o `null` cuando no hay nada que decir.
 *
 * Devolver `null` es parte del diseño: un aviso semanal que llega igual cuando no vence nada se
 * convierte en ruido de fondo en tres semanas, y entonces tampoco se lee el que trae las cuarenta
 * habilitaciones de marzo.
 *
 * EL TITULO CAMBIA SEGUN LO QUE HAY, y no es coqueteria: es lo unico que se lee en la lista de
 * avisos. Si algo ya se cayo, eso manda; si ademas viene mas, se dice cuanto; y si no hay nada
 * caido, lo que informa es el plazo — "3 vencimientos" a secas no dice si son de esta semana o del
 * año que viene.
 */
export function redactarAviso(
  resumen: ResumenDelAviso,
  dias: number,
): { subject: string; body: string } | null {
  if (resumen.total === 0) return null;

  const caidas = plural(resumen.vencido, 'acreditación vencida', 'acreditaciones vencidas');
  const porVencer = resumen.total - resumen.vencido;
  const subject =
    resumen.vencido > 0
      ? porVencer > 0
        ? `${caidas} y ${porVencer} por vencer`
        : caidas
      : `${plural(resumen.total, 'vencimiento', 'vencimientos')} en los próximos ${dias} días`;

  const partes = [
    resumen.reprogramar > 0
      ? `${plural(resumen.reprogramar, 'formación', 'formaciones')} por volver a convocar`
      : null,
    resumen.perseguir > 0
      ? `${plural(resumen.perseguir, 'persona', 'personas')} que nunca la ha${resumen.perseguir === 1 ? '' : 'n'} hecho`
      : null,
  ].filter((parte): parte is string => parte !== null);

  return {
    subject,
    body: `${partes.join(' · ')}. Están en Reportes → Vencimientos, con nombre y fecha.`,
  };
}
