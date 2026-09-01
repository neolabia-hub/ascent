import { z } from 'zod';

/**
 * ENCUESTAS (Sprint 5, Decision #114).
 *
 * ─── DOS CLASES, Y NO SON VARIANTES DE LO MISMO ───
 *
 * `SATISFACTION` la responde QUIEN SE FORMO, al terminar. Es el nivel 1 de Kirkpatrick —reaccion—
 * y es lo que revisan BASC e ISO como "evaluacion de la capacitacion". Pregunta si sirvio, si se
 * entendio, si el instructor explico bien.
 *
 * `EFFICACY` la responde SU JEFE, semanas despues. Es el nivel 3 —transferencia al puesto— y
 * contesta la unica pregunta que de verdad importa: ¿cambio algo en como trabaja? Se programa con
 * `scheduledDaysAfter` y es la que puede disparar un refuerzo si sale negativa.
 *
 * Son la misma tabla porque comparten forma —preguntas, respuestas, version— y distinto momento,
 * distinto respondiente y distinta consecuencia. Mezclarlas en la UI seria un error; guardarlas
 * aparte, duplicacion.
 *
 * ─── POR QUE LAS PREGUNTAS SON UN JSON Y NO UNA TABLA ───
 *
 * Una plantilla de encuesta se responde tal como estaba EL DIA que se respondio. Con las preguntas
 * en su propia tabla, editar una redaccion reescribiria el pasado: las respuestas guardadas
 * apuntarian a un texto que ya no es el que leyo esa persona. Con el JSON y `templateVersion`
 * congelados en cada respuesta, lo contestado sigue explicandose para siempre.
 *
 * Es la misma razon por la que la constancia guarda un snapshot (Decision #14).
 */

/**
 * LOS TIPOS DE PREGUNTA, y por que solo estos tres.
 *
 * `SCALE`  del 1 al 5 (o al 10), pintable como estrellas, caras o numeros. Es el 90% de una
 *          encuesta de satisfaccion y lo unico que se puede promediar para un indicador. Sin al
 *          menos una, la encuesta no produce ningun numero.
 * `YES_NO` para lo que es binario de verdad ("¿aplicaste lo aprendido?"). En eficacia es la que
 *          decide si el resultado es positivo o negativo.
 * `CHOICE` una opcion entre varias. NO se promedia: sirve para segmentar ("¿como preferirias
 *          recibirla?"), no para medir. Se cuenta por opcion.
 * `TEXT`   abierta. No se promedia y no se grafica; existe porque es donde aparece lo que nadie
 *          habia pensado preguntar.
 *
 * NO hay opcion MULTIPLE (varias a la vez) a proposito: una respuesta con tres marcas no se puede
 * meter en un indicador sin decidir arbitrariamente cuanto pesa cada una, y lo que no se puede
 * agregar acaba siendo una columna que nadie mira.
 */
export const surveyQuestionSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().min(3).max(300),
  kind: z.enum(['SCALE', 'YES_NO', 'CHOICE', 'TEXT']),
  /**
   * COMO SE PINTA UNA ESCALA. El dato guardado es el MISMO numero en los tres casos —1 a 5— y por
   * eso se pueden promediar juntas aunque una se haya respondido con estrellas y otra con caras.
   *
   * `stars`   estrellas. Se entiende sin leer nada y es lo que la gente reconoce de las apps.
   * `faces`   caras de contento a descontento (iconos, NUNCA emoji: regla dura del sistema).
   *           Es la mejor para personal operativo, que responde en el telefono y con prisa.
   * `numbers` botones del 1 al 5. La mas neutra, y la unica honesta cuando la pregunta no es de
   *           agrado sino de cantidad ("¿cuanto de lo visto ya conocias?").
   *
   * Es solo presentacion: cambiarla en una plantilla ya respondida no altera lo respondido.
   */
  display: z.enum(['numbers', 'stars', 'faces']).default('faces'),
  /**
   * Cuantos escalones tiene. 5 es lo normal; 10 solo tiene sentido si de verdad se van a
   * distinguir diez niveles, y casi nunca es asi — con diez opciones la gente usa tres.
   */
  scaleMax: z.union([z.literal(5), z.literal(10)]).default(5),
  /** Solo en CHOICE. Entre dos y seis: con mas, se lee la lista en vez de responder. */
  options: z.array(z.string().min(1).max(120)).max(6).default([]),
  /**
   * Si es obligatoria. Por defecto SI: una encuesta que se puede enviar vacia no mide nada, y el
   * auditor pide la evidencia de que se evaluo, no de que se ofrecio evaluar.
   *
   * Las de texto suelen dejarse opcionales, y por eso se puede apagar.
   */
  required: z.boolean().default(true),
});

export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

export const surveyTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(['SATISFACTION', 'EFFICACY']),
  /**
   * Tope de doce: una encuesta mas larga que eso se responde a la ligera o no se responde, y una
   * respuesta pulsada por salir del paso es peor que no tenerla — ensucia el indicador.
   */
  questions: z.array(surveyQuestionSchema).min(1).max(12),
  /**
   * Solo para EFFICACY: a los cuantos dias se le pide al jefe. Nulo en satisfaccion, que se
   * responde en el momento.
   */
  scheduledDaysAfter: z.number().int().min(1).max(365).nullable().default(null),
  active: z.boolean().default(true),
});

export type SurveyTemplateInput = z.infer<typeof surveyTemplateSchema>;

/**
 * LAS RESPUESTAS. Clave = id de la pregunta.
 *
 * El valor se valida contra el TIPO de su pregunta en el servidor, no aqui: este esquema no sabe
 * que preguntas tiene la plantilla. Aqui solo se acota la forma para que no entre cualquier cosa.
 */
export const surveyAnswersSchema = z.record(z.string().min(1), z.union([z.number(), z.boolean(), z.string().max(2000)]));

export const surveyResponseSchema = z.object({
  answers: surveyAnswersSchema,
});

export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;

/**
 * LAS PREGUNTAS QUE TRAE UNA ENCUESTA NUEVA.
 *
 * No se crea vacia: una plantilla sin preguntas es una pantalla en blanco delante de alguien que
 * no sabe que preguntar, y lo que sale de ahi son encuestas de una sola pregunta. Estas cuatro son
 * las de reaccion de manual —contenido, instructor, aplicabilidad y una abierta— y se editan o se
 * borran, pero se parte de algo defendible.
 */
/**
 * Los valores de presentacion por defecto. Sin `as const`: `options: []` tiene que ser un array
 * mutable de cadenas, no una tupla vacia de solo lectura, o no encaja en `SurveyQuestion`.
 */
const ESCALA: Pick<SurveyQuestion, 'display' | 'scaleMax' | 'options'> = {
  display: 'faces',
  scaleMax: 5,
  options: [],
};

export const PREGUNTAS_SATISFACCION: SurveyQuestion[] = [
  { id: 'contenido', text: 'El contenido fue claro y facil de entender', kind: 'SCALE', required: true, ...ESCALA },
  { id: 'utilidad', text: 'Lo aprendido me sirve para mi trabajo', kind: 'SCALE', required: true, ...ESCALA },
  { id: 'instructor', text: 'Quien la dicto explico bien', kind: 'SCALE', required: true, ...ESCALA },
  { id: 'duracion', text: 'La duracion fue la adecuada', kind: 'SCALE', required: true, ...ESCALA },
  /*
    LA OBSERVACION GENERAL VA SIEMPRE, y va la ULTIMA.

    Es donde aparece lo que nadie penso preguntar —"el video no se oia en la bodega"— y es lo unico
    de la encuesta que no se puede anticipar. Opcional a proposito: obligarla convierte una
    encuesta de treinta segundos en un tramite, y lo que se escribe por obligacion es "ninguna".
  */
  { id: 'observacion', text: '¿Algo que quieras agregar?', kind: 'TEXT', required: false, ...ESCALA },
];

/**
 * Las de EFICACIA las responde el JEFE, y por eso preguntan por lo observable.
 *
 * "¿Le gusto la capacitacion?" no se le puede preguntar a un jefe sobre otra persona; "¿aplica lo
 * aprendido en su puesto?" si, y es lo unico que mide transferencia. La primera es la que decide
 * si el resultado se marca positivo o negativo.
 */
export const PREGUNTAS_EFICACIA: SurveyQuestion[] = [
  { id: 'aplica', text: '¿Aplica en su puesto lo que aprendio?', kind: 'YES_NO', required: true, ...ESCALA },
  {
    id: 'desempeno',
    text: 'Su desempeno en este tema mejoro',
    kind: 'SCALE',
    required: true,
    // Numeros y no caras: al jefe se le pide un juicio sobre el desempeno de otra persona, y una
    // cara sonriente banaliza esa pregunta.
    display: 'numbers',
    scaleMax: 5,
    options: [],
  },
  { id: 'refuerzo', text: '¿En que necesita refuerzo?', kind: 'TEXT', required: false, ...ESCALA },
];
