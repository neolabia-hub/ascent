import type { QuestionPayloadClient, QuestionType } from '@/lib/catalog-api';

/**
 * EL MODELO DE UNA PREGUNTA: los tipos que existen, como nace vacia y que le falta.
 *
 * Antes este archivo era tambien el editor —un formulario para meter en un cajon lateral—. El
 * editor se fue a `question-canvas.tsx`, donde la pregunta se escribe con la forma que va a
 * tener para quien la responda (Decision #84); aqui se queda lo que NO es pantalla, que es lo
 * unico que de verdad comparten el lienzo, el rail y el guardado.
 */

export const QTYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: 'Seleccion unica',
  MULTI: 'Seleccion multiple',
  TRUE_FALSE: 'Verdadero o falso',
  FILL_BLANK: 'Completar huecos',
  ORDER: 'Ordenar los pasos',
  MATCH: 'Emparejar',
  NUMERIC: 'Respuesta numerica',
  ESSAY: 'Abierta (la califica una persona)',
};

/**
 * Que resuelve cada tipo, para poder elegirlo sin tener que probarlos.
 *
 * Los cuatro ultimos son de la Decision #86, y no se anadieron por variedad: con solo opcion
 * multiple, media formacion de SST se pregunta mal. Un LOTO es una secuencia y las cuatro
 * opciones llevan la respuesta escrita; una distancia de seguridad se acierta por descarte; una
 * senal se reconoce, no se elige de una lista.
 */
export const QTYPE_HINT: Record<QuestionType, string> = {
  SINGLE: 'Una sola respuesta es correcta. Es la que mejor se corrige sola.',
  MULTI: 'Varias correctas a la vez. Se puede dar puntaje parcial.',
  TRUE_FALSE: 'Para afirmaciones tajantes. Ojo: se acierta la mitad de las veces al azar.',
  FILL_BLANK: 'Escribe la palabra que falta. No hay opciones a la vista de donde copiar.',
  ORDER: 'Pone los pasos en su orden. Para procedimientos: un bloqueo, una emergencia.',
  MATCH: 'Une dos columnas: senal con significado, EPP con riesgo. Cubre mucho en una pregunta.',
  NUMERIC: 'Un numero con su unidad y su margen. Evita acertar la distancia por descarte.',
  ESSAY: 'Responde con sus palabras. No se corrige sola: alguien tiene que calificarla.',
};

/** Hasta ocho opciones. Mas abajo de la H la pregunta ya no se lee, se recorre. */
export const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** La marca de un hueco dentro del enunciado: `{{1}}`, `{{2}}`... */
export const MARCA_HUECO = /\{\{(\w+)\}\}/g;

/** Los huecos que hay ESCRITOS en el enunciado, en el orden en que aparecen. */
export function huecosDelEnunciado(stem: string): string[] {
  return [...stem.matchAll(MARCA_HUECO)].map((match) => match[1] as string);
}

export function emptyPayload(qtype: QuestionType): QuestionPayloadClient {
  const base = { qtype, stem: '', points: 1 } as QuestionPayloadClient;
  if (qtype === 'SINGLE' || qtype === 'MULTI') {
    base.options = [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
    ];
    if (qtype === 'SINGLE') base.correctOptionId = 'a';
    else base.correctOptionIds = [];
  }
  if (qtype === 'TRUE_FALSE') base.correctValue = true;

  if (qtype === 'FILL_BLANK') {
    // Nace con el hueco YA puesto en el enunciado. Un enunciado vacio con "escribe {{1}} donde
    // quieras el hueco" en la ayuda es la clase de instruccion que nadie lee.
    base.stem = 'El arnes se inspecciona cada {{1}}.';
    base.blanks = [{ id: '1', accept: [''] }];
    base.partialCredit = true;
  }
  if (qtype === 'ORDER') {
    base.items = [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
      { id: 'c', text: '' },
    ];
    base.correctOrder = ['a', 'b', 'c'];
    base.partialCredit = true;
  }
  if (qtype === 'MATCH') {
    base.pairs = [
      { id: '1', left: '', right: '' },
      { id: '2', left: '', right: '' },
    ];
    base.partialCredit = true;
  }
  if (qtype === 'NUMERIC') {
    base.correctNumber = 0;
    base.tolerance = 0;
  }
  return base;
}

/**
 * Lo que le falta a la pregunta para poder guardarse, en frases. Vacio = lista.
 *
 * Se dice en vez de apagar el boton a secas: un boton deshabilitado sin motivo obliga a adivinar
 * cual de los seis campos es el que falta.
 */
export function loQueFaltaEnLaPregunta(payload: QuestionPayloadClient): string[] {
  const faltan: string[] = [];
  if (payload.stem.trim().length < 5) faltan.push('Escribe el enunciado.');

  if (payload.qtype === 'SINGLE' || payload.qtype === 'MULTI') {
    const options = payload.options ?? [];
    if (options.some((option) => !option.text.trim())) faltan.push('Hay opciones sin texto.');
    if (options.length < 2) faltan.push('Una pregunta de opciones necesita al menos dos.');
    if (payload.qtype === 'SINGLE' && !payload.correctOptionId) faltan.push('Marca cual es la correcta.');
    if (payload.qtype === 'MULTI' && (payload.correctOptionIds ?? []).length === 0) {
      faltan.push('Marca al menos una correcta.');
    }
  }

  if (payload.qtype === 'FILL_BLANK') {
    const enElTexto = huecosDelEnunciado(payload.stem);
    const blanks = payload.blanks ?? [];
    if (enElTexto.length === 0) faltan.push('El enunciado no tiene ningun hueco. Pulsa "Agregar hueco".');
    // El servidor lo rechaza igual, pero descubrirlo AQUI evita perder lo escrito al guardar.
    const huerfanos = blanks.filter((blank) => !enElTexto.includes(blank.id));
    if (huerfanos.length > 0) faltan.push('Hay huecos que ya no aparecen en el enunciado: quitalos.');
    if (blanks.some((blank) => (blank.accept ?? []).every((value) => !value.trim()))) {
      faltan.push('Algun hueco no tiene ninguna respuesta valida.');
    }
  }

  if (payload.qtype === 'ORDER') {
    const items = payload.items ?? [];
    if (items.length < 2) faltan.push('Hacen falta al menos dos pasos.');
    if (items.some((item) => !item.text.trim())) faltan.push('Hay pasos sin texto.');
  }

  if (payload.qtype === 'MATCH') {
    const pairs = payload.pairs ?? [];
    if (pairs.length < 2) faltan.push('Hacen falta al menos dos parejas.');
    if (pairs.some((pair) => !pair.left.trim() || !pair.right.trim())) {
      faltan.push('Hay parejas con algun lado vacio.');
    }
  }

  if (payload.qtype === 'NUMERIC') {
    if (typeof payload.correctNumber !== 'number' || Number.isNaN(payload.correctNumber)) {
      faltan.push('Escribe el numero correcto.');
    }
  }

  if (!payload.points || payload.points <= 0) faltan.push('El puntaje tiene que ser mayor que cero.');
  return faltan;
}
