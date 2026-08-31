import { applyGradingPolicy, detectAnomalies, gradeQuestion, scoreAttempt } from './grading.js';

describe('calificacion de una pregunta', () => {
  it('seleccion unica: acierta o no, sin medias tintas', () => {
    const question = { qtype: 'SINGLE' as const, correct: { optionId: 'b' }, pointsPossible: 2 };
    expect(gradeQuestion(question, { optionId: 'b' })).toEqual({ pointsAwarded: 2, needsManualGrading: false, correct: true });
    expect(gradeQuestion(question, { optionId: 'a' })).toEqual({ pointsAwarded: 0, needsManualGrading: false, correct: false });
  });

  it('no responder vale cero, no rompe', () => {
    const question = { qtype: 'SINGLE' as const, correct: { optionId: 'b' }, pointsPossible: 2 };
    expect(gradeQuestion(question, null).pointsAwarded).toBe(0);
    expect(gradeQuestion(question, {}).correct).toBe(false);
  });

  it('verdadero/falso compara el valor, no su presencia', () => {
    const question = { qtype: 'TRUE_FALSE' as const, correct: { value: true }, pointsPossible: 1 };
    expect(gradeQuestion(question, { value: true }).correct).toBe(true);
    expect(gradeQuestion(question, { value: false }).correct).toBe(false);
    expect(gradeQuestion(question, {}).correct).toBe(false);
  });

  it('multiple sin credito parcial exige el conjunto EXACTO', () => {
    const question = {
      qtype: 'MULTI' as const,
      correct: { optionIds: ['a', 'b'], partialCredit: false },
      pointsPossible: 4,
    };
    expect(gradeQuestion(question, { optionIds: ['b', 'a'] })).toMatchObject({ pointsAwarded: 4, correct: true });
    expect(gradeQuestion(question, { optionIds: ['a'] })).toMatchObject({ pointsAwarded: 0, correct: false });
    // Marcarlas todas no puede valer nada: seria aprobar sin saber.
    expect(gradeQuestion(question, { optionIds: ['a', 'b', 'c'] })).toMatchObject({ pointsAwarded: 0, correct: false });
  });

  it('multiple con credito parcial premia aciertos y castiga los de mas, nunca negativo', () => {
    const question = {
      qtype: 'MULTI' as const,
      correct: { optionIds: ['a', 'b'], partialCredit: true },
      pointsPossible: 4,
    };
    expect(gradeQuestion(question, { optionIds: ['a'] }).pointsAwarded).toBe(2);
    expect(gradeQuestion(question, { optionIds: ['a', 'c'] }).pointsAwarded).toBe(0);
    expect(gradeQuestion(question, { optionIds: ['c', 'd'] }).pointsAwarded).toBe(0);
  });

  it('pregunta abierta espera a una persona: no se autocalifica', () => {
    const grade = gradeQuestion({ qtype: 'ESSAY', correct: {}, pointsPossible: 5 }, { text: 'Una respuesta' });
    expect(grade).toEqual({ pointsAwarded: null, needsManualGrading: true, correct: false });
  });
});

describe('nota del intento', () => {
  it('es el porcentaje de puntos obtenidos y se compara con la nota minima', () => {
    const result = scoreAttempt(
      [
        { pointsPossible: 1, pointsAwarded: 1, invalidated: false },
        { pointsPossible: 1, pointsAwarded: 1, invalidated: false },
        { pointsPossible: 1, pointsAwarded: 0, invalidated: false },
      ],
      90,
    );
    expect(result.score).toBe(66.7);
    expect(result.passed).toBe(false);
  });

  it('una pregunta ANULADA sale del numerador y del denominador', () => {
    // Nueve de diez bien, y la fallada resulta defectuosa: al anularla, queda 9/9 = 100%.
    const rows = Array.from({ length: 9 }, () => ({ pointsPossible: 1, pointsAwarded: 1, invalidated: false }));
    const result = scoreAttempt([...rows, { pointsPossible: 1, pointsAwarded: 0, invalidated: true }], 90);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('si algo espera calificacion humana, todavia no hay nota final', () => {
    const result = scoreAttempt(
      [
        { pointsPossible: 1, pointsAwarded: 1, invalidated: false },
        { pointsPossible: 1, pointsAwarded: null, invalidated: false },
      ],
      50,
    );
    expect(result.pending).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('un examen sin preguntas vivas no aprueba a nadie por omision', () => {
    expect(scoreAttempt([], 50)).toEqual({ score: 0, passed: false, pending: false });
  });
});

describe('politica de nota con varios intentos', () => {
  const attempts = [
    { attemptNumber: 1, score: 60, passed: false },
    { attemptNumber: 2, score: 95, passed: true },
    { attemptNumber: 3, score: 80, passed: false },
  ];

  it('la mas alta es el comportamiento por defecto', () => {
    expect(applyGradingPolicy(attempts, 'HIGHEST')).toMatchObject({ attemptNumber: 2, score: 95 });
  });

  it('primero y ultimo respetan el orden del intento, no el de llegada', () => {
    expect(applyGradingPolicy([...attempts].reverse(), 'FIRST')).toMatchObject({ attemptNumber: 1 });
    expect(applyGradingPolicy([...attempts].reverse(), 'LAST')).toMatchObject({ attemptNumber: 3 });
  });

  it('sin intentos no hay nota', () => {
    expect(applyGradingPolicy([], 'HIGHEST')).toBeNull();
  });
});

describe('deteccion de "click siguiente"', () => {
  it('marca, pero no bloquea, un examen terminado en tiempo imposible', () => {
    expect(detectAnomalies(8, 10)).toMatchObject({ tooFast: true, expectedMinimum: 50 });
    expect(detectAnomalies(600, 10).tooFast).toBe(false);
  });
});

/**
 * LOS TIPOS DE LA DECISION #86.
 *
 * Se prueban aparte y con saña porque son los que deciden si alguien aprueba una formacion
 * obligatoria de seguridad, y porque los cuatro tienen credito parcial: un fallo de redondeo o
 * un normalizador de mas convierte un suspenso en un aprobado sin que nadie lo note.
 */
describe('completar huecos', () => {
  const pregunta = {
    qtype: 'FILL_BLANK' as const,
    correct: {
      blanks: [
        { id: '1', accept: ['arnes', 'arnes de cuerpo entero'] },
        { id: '2', accept: ['seis meses'] },
      ],
      partialCredit: true,
    },
    pointsPossible: 4,
  };

  it('ignora tildes, mayusculas y espacios de mas: se mide seguridad, no ortografia', () => {
    expect(gradeQuestion(pregunta, { blanks: { '1': '  ARNÉS ', '2': 'Seis   Meses' } })).toMatchObject({
      pointsAwarded: 4,
      correct: true,
    });
  });

  it('acepta cualquiera de las formas validas del hueco', () => {
    expect(
      gradeQuestion(pregunta, { blanks: { '1': 'arnes de cuerpo entero', '2': 'seis meses' } }).correct,
    ).toBe(true);
  });

  it('con credito parcial cada hueco suma por separado', () => {
    expect(gradeQuestion(pregunta, { blanks: { '1': 'arnes', '2': 'un ano' } })).toMatchObject({
      pointsAwarded: 2,
      correct: false,
    });
  });

  it('sin credito parcial, un hueco mal anula la pregunta entera', () => {
    const estricta = { ...pregunta, correct: { ...pregunta.correct, partialCredit: false } };
    expect(gradeQuestion(estricta, { blanks: { '1': 'arnes', '2': 'un ano' } })).toMatchObject({
      pointsAwarded: 0,
      correct: false,
    });
  });

  it('un hueco en blanco no cuenta como acierto aunque la lista acepte cadena vacia', () => {
    expect(gradeQuestion(pregunta, { blanks: { '1': '   ', '2': 'seis meses' } })).toMatchObject({
      pointsAwarded: 2,
      correct: false,
    });
  });

  it('no responder nada vale cero y no rompe', () => {
    expect(gradeQuestion(pregunta, null)).toMatchObject({ pointsAwarded: 0, correct: false });
  });
});

describe('ordenar los pasos', () => {
  const pregunta = {
    qtype: 'ORDER' as const,
    correct: { order: ['a', 'b', 'c', 'd'], partialCredit: true },
    pointsPossible: 4,
  };

  it('el orden exacto vale todo', () => {
    expect(gradeQuestion(pregunta, { order: ['a', 'b', 'c', 'd'] })).toMatchObject({
      pointsAwarded: 4,
      correct: true,
    });
  });

  it('el credito parcial cuenta los pasos EN SU SITIO, que es lo que se puede explicar', () => {
    // a y d quedaron donde debian; b y c estan intercambiados.
    expect(gradeQuestion(pregunta, { order: ['a', 'c', 'b', 'd'] })).toMatchObject({
      pointsAwarded: 2,
      correct: false,
    });
  });

  it('el orden justo al reves no salva ni un paso', () => {
    expect(gradeQuestion(pregunta, { order: ['d', 'c', 'b', 'a'] })).toMatchObject({
      pointsAwarded: 0,
      correct: false,
    });
  });

  it('sin credito parcial, un solo cambio anula la pregunta', () => {
    const estricta = { ...pregunta, correct: { ...pregunta.correct, partialCredit: false } };
    expect(gradeQuestion(estricta, { order: ['a', 'c', 'b', 'd'] })).toMatchObject({ pointsAwarded: 0 });
  });

  it('una respuesta incompleta no puede dar mas de lo que acerto', () => {
    expect(gradeQuestion(pregunta, { order: ['a'] })).toMatchObject({ pointsAwarded: 1, correct: false });
  });
});

describe('emparejar', () => {
  const pregunta = {
    qtype: 'MATCH' as const,
    correct: { pairs: { L1: 'R2', L2: 'R1', L3: 'R3' }, partialCredit: true },
    pointsPossible: 3,
  };

  it('todas las parejas bien vale todo', () => {
    expect(gradeQuestion(pregunta, { pairs: { L1: 'R2', L2: 'R1', L3: 'R3' } })).toMatchObject({
      pointsAwarded: 3,
      correct: true,
    });
  });

  it('cada pareja acertada suma', () => {
    expect(gradeQuestion(pregunta, { pairs: { L1: 'R2', L2: 'R3', L3: 'R1' } })).toMatchObject({
      pointsAwarded: 1,
      correct: false,
    });
  });

  it('las que se dejan sin unir cuentan como falladas', () => {
    expect(gradeQuestion(pregunta, { pairs: { L1: 'R2' } })).toMatchObject({ pointsAwarded: 1, correct: false });
  });

  it('repetir la misma respuesta en dos filas no puede acertar las dos', () => {
    // Se permite responder asi a proposito (la UI solo avisa), pero solo una puede estar bien.
    expect(gradeQuestion(pregunta, { pairs: { L1: 'R2', L2: 'R2', L3: 'R2' } })).toMatchObject({
      pointsAwarded: 1,
      correct: false,
    });
  });

  it('sin credito parcial se exige el conjunto entero', () => {
    const estricta = { ...pregunta, correct: { ...pregunta.correct, partialCredit: false } };
    expect(gradeQuestion(estricta, { pairs: { L1: 'R2', L2: 'R1', L3: 'R1' } })).toMatchObject({ pointsAwarded: 0 });
  });
});

describe('respuesta numerica', () => {
  it('sin margen exige el numero exacto, pero no falla por decimales binarios', () => {
    const pregunta = { qtype: 'NUMERIC' as const, correct: { number: 1.5, tolerance: 0 }, pointsPossible: 2 };
    expect(gradeQuestion(pregunta, { number: 1.5 })).toMatchObject({ pointsAwarded: 2, correct: true });
    expect(gradeQuestion(pregunta, { number: 0.1 + 1.4 })).toMatchObject({ pointsAwarded: 2, correct: true });
    expect(gradeQuestion(pregunta, { number: 1.6 })).toMatchObject({ pointsAwarded: 0, correct: false });
  });

  it('el margen se aplica hacia arriba y hacia abajo, y los bordes entran', () => {
    const pregunta = { qtype: 'NUMERIC' as const, correct: { number: 10, tolerance: 0.5 }, pointsPossible: 2 };
    expect(gradeQuestion(pregunta, { number: 9.5 }).correct).toBe(true);
    expect(gradeQuestion(pregunta, { number: 10.5 }).correct).toBe(true);
    expect(gradeQuestion(pregunta, { number: 9.49 }).correct).toBe(false);
  });

  it('no hay credito parcial: "casi" no significa nada en una distancia de seguridad', () => {
    const pregunta = { qtype: 'NUMERIC' as const, correct: { number: 10, tolerance: 0 }, pointsPossible: 5 };
    expect(gradeQuestion(pregunta, { number: 9.9 }).pointsAwarded).toBe(0);
  });

  it('dejarlo en blanco no es un cero acertado', () => {
    const pregunta = { qtype: 'NUMERIC' as const, correct: { number: 0, tolerance: 0 }, pointsPossible: 2 };
    expect(gradeQuestion(pregunta, {})).toMatchObject({ pointsAwarded: 0, correct: false });
    expect(gradeQuestion(pregunta, null)).toMatchObject({ pointsAwarded: 0, correct: false });
    // Pero escribir el cero SI acierta: es una respuesta como cualquier otra.
    expect(gradeQuestion(pregunta, { number: 0 })).toMatchObject({ pointsAwarded: 2, correct: true });
  });
});
