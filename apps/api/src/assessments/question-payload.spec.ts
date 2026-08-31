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

/**
 * LOS TIPOS DE LA DECISION #86.
 *
 * Lo que se prueba aqui no es "que no rompa": es que la RESPUESTA CORRECTA no se escape hacia el
 * cliente por ninguno de los cuatro caminos nuevos, y que la ida y vuelta a columnas conserve
 * exactamente lo que el administrador escribio. Un emparejar cuyos ids delaten la pareja se
 * resuelve leyendo el HTML, sin haber leido la pregunta.
 */
/** Monta la vista del aprendiz desde unas columnas recien traducidas. */
function vistaDe(id: string, columns: ReturnType<typeof payloadToColumns>) {
  return {
    id,
    qtype: columns.qtype,
    stem: columns.stem,
    options: columns.options as never,
    correct: columns.correct as never,
    feedback: columns.feedback as never,
    points: columns.points,
  };
}

describe('tipos de la Decision #86', () => {
  it('completar huecos conserva sus huecos y sus formas aceptadas', () => {
    const payload: QuestionPayload = {
      qtype: 'FILL_BLANK',
      stem: 'El arnes se inspecciona cada {{1}} y lo revisa el {{2}}.',
      blanks: [
        { id: '1', accept: ['seis meses', 'medio ano'] },
        { id: '2', accept: ['supervisor'] },
      ],
      partialCredit: true,
      points: 2,
    };
    expect(roundTrip(payload)).toEqual(payload);
  });

  it('completar huecos NUNCA manda las respuestas al que responde', () => {
    const columns = payloadToColumns({
      qtype: 'FILL_BLANK',
      stem: 'El arnes se inspecciona cada {{1}}.',
      blanks: [{ id: '1', accept: ['seis meses'] }],
      partialCredit: true,
      points: 1,
    });
    const vista = toLearnerView(vistaDe('v1', columns));
    expect(JSON.stringify(vista)).not.toContain('seis meses');
    // Los huecos si viajan, vacios y en su orden: el reproductor los necesita para abrirlos.
    expect(vista.options).toEqual([{ id: '1', text: '' }]);
  });

  it('ordenar conserva los pasos y su orden correcto', () => {
    const payload: QuestionPayload = {
      qtype: 'ORDER',
      stem: 'Ordena el bloqueo de la maquina',
      items: [
        { id: 'a', text: 'Avisar al operador' },
        { id: 'b', text: 'Cortar la energia' },
        { id: 'c', text: 'Poner el candado' },
      ],
      correctOrder: ['a', 'b', 'c'],
      partialCredit: true,
      points: 3,
    };
    expect(roundTrip(payload)).toEqual(payload);
  });

  it('ordenar manda los pasos pero NO su orden correcto', () => {
    const columns = payloadToColumns({
      qtype: 'ORDER',
      stem: 'Ordena el bloqueo de la maquina',
      items: [
        { id: 'a', text: 'Avisar al operador' },
        { id: 'b', text: 'Cortar la energia' },
      ],
      correctOrder: ['b', 'a'],
      partialCredit: true,
      points: 2,
    });
    const vista = toLearnerView(vistaDe('v1', columns));
    expect(vista.options).toHaveLength(2);
    expect(JSON.stringify(vista)).not.toContain('order');
  });

  it('emparejar conserva las parejas al ir y volver', () => {
    const payload: QuestionPayload = {
      qtype: 'MATCH',
      stem: 'Une cada senal con su significado',
      pairs: [
        { id: '1', left: 'Senal de alto', right: 'Detenerse por completo' },
        { id: '2', left: 'Senal de ceda', right: 'Dar prioridad' },
      ],
      partialCredit: true,
      points: 2,
    };
    expect(roundTrip(payload)).toEqual(payload);
  });

  it('emparejar no delata la pareja: el emparejamiento vive solo en `correct`', () => {
    const columns = payloadToColumns({
      qtype: 'MATCH',
      stem: 'Une cada senal con su significado',
      pairs: [
        { id: '1', left: 'Senal de alto', right: 'Detenerse por completo' },
        { id: '2', left: 'Senal de ceda', right: 'Dar prioridad' },
      ],
      partialCredit: true,
      points: 2,
    });
    const vista = toLearnerView(vistaDe('v1', columns));
    // Las dos columnas viajan, pero el mapa L->R se queda en el servidor.
    expect(vista.options.map((option) => option.id)).toEqual(['L1', 'L2', 'R1', 'R2']);
    expect(JSON.stringify(vista)).not.toContain('pairs');
  });

  it('numerica conserva numero, margen y unidad', () => {
    const payload: QuestionPayload = {
      qtype: 'NUMERIC',
      stem: 'A cuantos metros es obligatorio el arnes?',
      correctNumber: 1.5,
      tolerance: 0,
      unit: 'm',
      points: 1,
    };
    expect(roundTrip(payload)).toEqual(payload);
  });

  it('numerica manda la UNIDAD pero jamas el numero', () => {
    const columns = payloadToColumns({
      qtype: 'NUMERIC',
      stem: 'A cuantos metros es obligatorio el arnes?',
      correctNumber: 1.5,
      tolerance: 0.1,
      unit: 'm',
      points: 1,
    });
    const vista = toLearnerView(vistaDe('v1', columns));
    // La unidad si: sin ella "1,5" y "150" parecen respuestas distintas a la misma pregunta.
    expect(vista.unit).toBe('m');
    expect(JSON.stringify(vista)).not.toContain('1.5');
    expect(JSON.stringify(vista)).not.toContain('0.1');
  });

  it('la unidad solo sale en las numericas, no en el resto de tipos', () => {
    const columns = payloadToColumns({
      qtype: 'TRUE_FALSE',
      stem: 'El arnes se revisa antes de cada uso',
      correctValue: true,
      points: 1,
    });
    expect(toLearnerView(vistaDe('v1', columns)).unit).toBeUndefined();
  });
});
