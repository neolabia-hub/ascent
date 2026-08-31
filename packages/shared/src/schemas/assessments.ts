import { z } from 'zod';

/**
 * Contratos del BANCO DE PREGUNTAS y las EVALUACIONES (CLAUDE.md 3.6).
 *
 * Reglas duras del dominio:
 *  - La pregunta se VERSIONA: editar crea una version nueva; los intentos historicos apuntan a
 *    la version que realmente se sirvio (Decision #6/#7). Nunca se reescribe la historia.
 *  - `correct` JAMAS viaja al cliente en el contexto de rendir un examen. Solo se expone al
 *    editar el banco, con permiso questions:manage.
 */

export const questionTypeSchema = z.enum([
  'SINGLE',
  'MULTI',
  'TRUE_FALSE',
  'ESSAY',
  // Decision #86: con solo opcion multiple, media formacion de SST se pregunta mal.
  'FILL_BLANK',
  'ORDER',
  'MATCH',
  'NUMERIC',
]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

const answerOptionSchema = z.object({
  id: z.string().min(1).max(20),
  text: z.string().min(1).max(500),
  /** Retroalimentacion por opcion (por que esta opcion esta bien o mal). */
  feedback: z.string().max(300).optional(),
});

const singleQuestionSchema = z
  .object({
    qtype: z.literal('SINGLE'),
    stem: z.string().min(5).max(1000),
    options: z.array(answerOptionSchema).min(2).max(8),
    correctOptionId: z.string().min(1).max(20),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.options.some((o) => o.id === q.correctOptionId), {
    message: 'La respuesta correcta debe ser una de las opciones',
    path: ['correctOptionId'],
  });

const multiQuestionSchema = z
  .object({
    qtype: z.literal('MULTI'),
    stem: z.string().min(5).max(1000),
    options: z.array(answerOptionSchema).min(3).max(8),
    correctOptionIds: z.array(z.string().min(1).max(20)).min(1),
    /** Si es true, marcar de mas descuenta; si no, se exige el conjunto exacto. */
    partialCredit: z.boolean().default(false),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.correctOptionIds.every((id) => q.options.some((o) => o.id === id)), {
    message: 'Todas las respuestas correctas deben existir entre las opciones',
    path: ['correctOptionIds'],
  })
  .refine((q) => q.correctOptionIds.length < q.options.length, {
    message: 'No pueden ser correctas todas las opciones',
    path: ['correctOptionIds'],
  });

const trueFalseQuestionSchema = z.object({
  qtype: z.literal('TRUE_FALSE'),
  stem: z.string().min(5).max(1000),
  correctValue: z.boolean(),
  points: z.number().min(0.1).max(100).default(1),
  explanation: z.string().max(1000).optional(),
});

const essayQuestionSchema = z.object({
  qtype: z.literal('ESSAY'),
  stem: z.string().min(5).max(1000),
  /** Guia para quien califica manualmente. */
  rubric: z.string().max(2000).optional(),
  points: z.number().min(0.1).max(100).default(1),
});

/**
 * COMPLETAR HUECOS (Decision #86).
 *
 * El enunciado lleva marcas `{{1}}`, `{{2}}`... y cada una tiene su lista de respuestas validas.
 * Se aceptan VARIAS a proposito: "arnes", "arnés" y "arnes de cuerpo entero" son la misma
 * respuesta, y una lista de una sola cadena convierte la pregunta en una loteria de ortografia.
 * La comparacion ignora tildes, mayusculas y espacios de mas (ver `grading.ts`).
 */
const fillBlankQuestionSchema = z
  .object({
    qtype: z.literal('FILL_BLANK'),
    stem: z.string().min(5).max(1000),
    blanks: z
      .array(
        z.object({
          id: z.string().min(1).max(20),
          /** Todas las formas que cuentan como correctas para ESE hueco. */
          accept: z.array(z.string().min(1).max(200)).min(1).max(10),
        }),
      )
      .min(1)
      .max(10),
    /** Cada hueco suma por separado. Sin esto, un dedazo en el ultimo anula toda la pregunta. */
    partialCredit: z.boolean().default(true),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.blanks.every((blank) => q.stem.includes(`{{${blank.id}}}`)), {
    message: 'Cada hueco tiene que aparecer en el enunciado',
    path: ['blanks'],
  });

/**
 * ORDENAR LOS PASOS (Decision #86).
 *
 * Es el tipo que le faltaba a este producto: un bloqueo LOTO, la reaccion ante un derrame o la
 * inspeccion de un arnes son SECUENCIAS, y preguntarlas con opcion multiple regala la respuesta
 * porque el orden correcto esta escrito en una de las cuatro opciones.
 *
 * Los pasos se sirven SIEMPRE barajados, elija lo que elija el administrador en "barajar
 * opciones": servirlos en su orden correcto seria dar la respuesta hecha.
 */
const orderQuestionSchema = z
  .object({
    qtype: z.literal('ORDER'),
    stem: z.string().min(5).max(1000),
    items: z.array(answerOptionSchema).min(2).max(10),
    /** Los ids en el orden CORRECTO. */
    correctOrder: z.array(z.string().min(1).max(20)).min(2).max(10),
    /** Puntua cada paso que quedo en su sitio. Sin esto, un solo cambio anula la pregunta. */
    partialCredit: z.boolean().default(true),
    points: z.number().min(0.1).max(100).default(1),
    explanation: z.string().max(1000).optional(),
  })
  .refine((q) => q.correctOrder.length === q.items.length, {
    message: 'El orden correcto tiene que incluir todos los pasos',
    path: ['correctOrder'],
  })
  .refine((q) => q.correctOrder.every((id) => q.items.some((item) => item.id === id)), {
    message: 'El orden correcto solo puede usar los pasos de la lista',
    path: ['correctOrder'],
  });

/**
 * EMPAREJAR (Decision #86).
 *
 * Senal <-> significado, EPP <-> riesgo, extintor <-> tipo de fuego. Cubre en una pregunta lo que
 * hoy son seis sueltas, y ademas se responde razonando por descarte sobre el conjunto, que es
 * mas parecido a lo que se hace en el puesto.
 */
const matchQuestionSchema = z.object({
  qtype: z.literal('MATCH'),
  stem: z.string().min(5).max(1000),
  pairs: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        left: z.string().min(1).max(300),
        right: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(10),
  /** Cada pareja acertada suma. */
  partialCredit: z.boolean().default(true),
  points: z.number().min(0.1).max(100).default(1),
  explanation: z.string().max(1000).optional(),
});

/**
 * RESPUESTA NUMERICA (Decision #86).
 *
 * "¿A cuantos metros es obligatorio el arnes?" con cuatro opciones se acierta descartando. Aqui
 * hay que saberlo. La TOLERANCIA existe porque hay preguntas donde el numero exacto no es lo que
 * importa —"¿cada cuantos metros una linea de vida?"— y una diferencia de 0,1 no es un fallo.
 */
const numericQuestionSchema = z.object({
  qtype: z.literal('NUMERIC'),
  stem: z.string().min(5).max(1000),
  correctNumber: z.number(),
  /** Margen aceptado hacia arriba y hacia abajo. 0 = exacto. */
  tolerance: z.number().min(0).max(1000).default(0),
  /** Se ENSENA a quien responde: sin unidad, "1,5" y "150" parecen respuestas distintas. */
  unit: z.string().max(20).optional(),
  points: z.number().min(0.1).max(100).default(1),
  explanation: z.string().max(1000).optional(),
});

/** Contenido completo de una version de pregunta. */
export const questionPayloadSchema = z.union([
  singleQuestionSchema,
  multiQuestionSchema,
  trueFalseQuestionSchema,
  essayQuestionSchema,
  fillBlankQuestionSchema,
  orderQuestionSchema,
  matchQuestionSchema,
  numericQuestionSchema,
]);
export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

/**
 * El TEMA es opcional (Decision #84).
 *
 * Era obligatorio, y eso ponia una ceremonia delante de la primera pregunta: habia que salirse a
 * crear una categoria antes de poder escribir nada. El tema solo hace falta cuando se quiere un
 * BLOQUE AL AZAR, que saca N preguntas de un tema; una pregunta escrita para un examen concreto
 * no necesita ninguno.
 */
export const createQuestionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  payload: questionPayloadSchema,
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

/** Editar una pregunta NO la modifica: crea una version nueva. */
export const reviseQuestionSchema = z.object({
  payload: questionPayloadSchema,
});

/** Cambiar el TEMA no es cambiar la pregunta: archiva, no revisa. Por eso no crea version. */
export const setQuestionCategorySchema = z.object({
  categoryId: z.string().uuid().nullable(),
});

export const createQuestionCategorySchema = z.object({
  name: z.string().min(2).max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export const listQuestionsQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  qtype: questionTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─────────────────────────── Evaluaciones ───────────────────────────

export const gradingPolicySchema = z.enum(['HIGHEST', 'LAST', 'FIRST', 'AVERAGE']);

/** Que puede ver el aprendiz despues de un intento (critico si el banco se reutiliza). */
export const reviewPolicySchema = z
  .object({
    showScore: z.boolean().default(true),
    showCorrectAnswers: z.boolean().default(false),
    showExplanations: z.boolean().default(true),
    onlyAfterLastAttempt: z.boolean().default(true),
  })
  .strict()
  .default({});

/**
 * COMO SE VE EL EXAMEN para quien lo rinde (Decision #85).
 *
 * Lo pidio el cliente asi: *"la interfaz de aprendiz debe ser lo mejor tipo Typeform,
 * transiciones, dinamica y wow; desde admin configuracion como diseño, colores o animaciones"*.
 *
 * Es un puñado CERRADO de opciones y no un editor de temas: cada una responde a una pregunta que
 * quien arma el examen se hace de verdad, y ninguna puede dejar la pantalla ilegible. Un selector
 * de color libre si puede —texto gris sobre fondo gris—, y ademas no hay quien lo mantenga.
 *
 * La transicion "ninguna" no es solo una preferencia estetica: es la salida para quien se marea
 * y para el equipo viejo. Ademas, prefers-reduced-motion la fuerza sin preguntar.
 */
export const presentationSchema = z
  .object({
    /** El color con el que se pinta lo elegido y el progreso. */
    accent: z.enum(['brand', 'indigo', 'teal', 'violet', 'amber', 'rose']).default('brand'),
    /** Como se pasa de una pregunta a la siguiente. */
    transition: z.enum(['slide', 'fade', 'none']).default('slide'),
    /** Una pregunta por pantalla (Typeform) o todas en una lista (formulario de siempre). */
    pace: z.enum(['one', 'all']).default('one'),
    /** Al marcar una respuesta unica, pasar solo a la siguiente. */
    autoAdvance: z.boolean().default(false),
    /** Fondo liso o degradado suave hacia el acento. */
    background: z.enum(['plain', 'gradient']).default('plain'),
    /** Numerar las opciones con A/B/C y aceptarlas por teclado. */
    optionLetters: z.boolean().default(true),
  })
  .strict()
  .default({});
export type PresentationInput = z.infer<typeof presentationSchema>;

export const updatePresentationSchema = z.object({
  presentation: presentationSchema,
});

export const createAssessmentSchema = z.object({
  title: z.string().min(3).max(200),
});

/** Seccion FIJA (preguntas elegidas a mano) o ALEATORIA (N al azar de una categoria). */
export const assessmentSectionSchema = z.union([
  z.object({
    mode: z.literal('FIXED'),
    questionIds: z.array(z.string().uuid()).min(1).max(100),
  }),
  z.object({
    mode: z.literal('RANDOM_FROM_POOL'),
    categoryId: z.string().uuid(),
    pickCount: z.number().int().min(1).max(50),
  }),
]);
export type AssessmentSectionInput = z.infer<typeof assessmentSectionSchema>;

export const updateAssessmentDraftSchema = z.object({
  timeLimitMin: z.number().int().min(1).max(600).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(10).nullable().optional(),
  passingScore: z.number().int().min(1).max(100).nullable().optional(),
  gradingPolicy: gradingPolicySchema.optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  reviewPolicy: reviewPolicySchema.optional(),
  sections: z.array(assessmentSectionSchema).min(1).max(20).optional(),
});
export type UpdateAssessmentDraftInput = z.infer<typeof updateAssessmentDraftSchema>;

export const publishAssessmentSchema = z.object({ confirm: z.literal(true) });
