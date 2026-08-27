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
