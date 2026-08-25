import type { QuestionPayload } from '@neo-pulse/shared';
import { columnsToPayload, payloadToColumns, toLearnerView } from './question-payload.js';

/** Simula el viaje completo contrato -> columnas -> contrato (lo que hace la base de datos). */
function roundTrip(payload: QuestionPayload): QuestionPayload {
  const columns = payloadToColumns(payload);
  return columnsToPayload({
    qtype: columns.qtype,
    stem: columns.stem,
    options: columns.options as never,
    correct: columns.correct as never,
    feedback: columns.feedback as never,
    points: columns.points,
  });
}

describe('question-payload', () => {
  describe('ida y vuelta contrato/columnas', () => {
    it('conserva una pregunta de seleccion unica', () => {
      const payload: QuestionPayload = {
        qtype: 'SINGLE',
        stem: 'Cada cuanto se hace la reinduccion?',
        options: [
          { id: 'a', text: 'Cada 12 meses' },
          { id: 'b', text: 'Nunca' },
        ],
        correctOptionId: 'a',
        points: 2,
        explanation: 'Lo exige el Decreto 1072.',
      };
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('conserva una pregunta de seleccion multiple con credito parcial', () => {
      const payload: QuestionPayload = {
        qtype: 'MULTI',
        stem: 'Cuales son elementos de proteccion personal?',
        options: [
          { id: 'a', text: 'Casco' },
          { id: 'b', text: 'Guantes' },
          { id: 'c', text: 'Telefono' },
        ],
        correctOptionIds: ['a', 'b'],
        partialCredit: true,
        points: 3,
        explanation: 'El telefono no es EPP.',
      };
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('conserva verdadero o falso', () => {
      const payload: QuestionPayload = {
        qtype: 'TRUE_FALSE',
        stem: 'La induccion debe hacerse antes de iniciar labores.',
        correctValue: true,
        points: 1,
        explanation: 'Decreto 1072, articulo 2.2.4.6.11.',
      };
      expect(roundTrip(payload)).toEqual(payload);
    });

    it('conserva una pregunta abierta con su rubrica', () => {
      const payload: QuestionPayload = {
        qtype: 'ESSAY',
        stem: 'Describe el procedimiento ante un derrame.',
        rubric: 'Debe mencionar contencion, aviso y registro.',
        points: 5,
      };
      expect(roundTrip(payload)).toEqual(payload);
    });
  });

  describe('vista del aprendiz (seguridad)', () => {
    // El enunciado y las opciones evitan a proposito la palabra "correct": asi, si aparece en
    // el JSON servido, es porque se filtro un campo de respuesta y no por el texto del contenido.
    const stored = {
      id: 'version-1',
      ...payloadToColumns({
        qtype: 'SINGLE',
        stem: 'Que se debe hacer ante un derrame?',
        options: [
          { id: 'a', text: 'Contener y avisar', feedback: 'Esta es la buena' },
          { id: 'b', text: 'Seguir trabajando', feedback: 'Esta no' },
        ],
        correctOptionId: 'a',
        points: 1,
        explanation: 'Lo indica el procedimiento.',
      }),
    };

    it('NUNCA expone la respuesta correcta', () => {
      const view = toLearnerView({ ...stored, options: stored.options as never, correct: stored.correct as never, feedback: stored.feedback as never });
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain('correct');
      expect(Object.keys(view)).not.toContain('correct');
      // Tampoco por la puerta de atras: ninguna opcion debe traer campos extra.
      expect(view.options.every((option) => Object.keys(option).length === 2)).toBe(true);
    });

    it('elimina la retroalimentacion por opcion, que delataria la respuesta', () => {
      const view = toLearnerView({ ...stored, options: stored.options as never, correct: stored.correct as never, feedback: stored.feedback as never });
      expect(JSON.stringify(view)).not.toContain('Esta es la buena');
      expect(view.options).toEqual([
        { id: 'a', text: 'Contener y avisar' },
        { id: 'b', text: 'Seguir trabajando' },
      ]);
    });

    it('entrega lo necesario para responder: enunciado, tipo, opciones y puntaje', () => {
      const view = toLearnerView({ ...stored, options: stored.options as never, correct: stored.correct as never, feedback: stored.feedback as never });
      expect(view.stem).toBe('Que se debe hacer ante un derrame?');
      expect(view.qtype).toBe('SINGLE');
      expect(view.points).toBe(1);
      expect(view.questionVersionId).toBe('version-1');
    });

    it('no filtra la rubrica de una pregunta abierta', () => {
      const essay = {
        id: 'version-2',
        ...payloadToColumns({ qtype: 'ESSAY', stem: 'Describe el procedimiento.', rubric: 'Debe mencionar contencion', points: 5 }),
      };
      const view = toLearnerView({ ...essay, options: essay.options as never, correct: essay.correct as never, feedback: essay.feedback as never });
      expect(JSON.stringify(view)).not.toContain('contencion');
    });
  });
});
