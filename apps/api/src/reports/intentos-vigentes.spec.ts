import { loQueCuentaHoy, type InscripcionParaIntentos } from './intentos-vigentes.js';

const V1 = 'version-1';
const V4 = 'version-4';
const EXAMEN_V1 = 'examen-1';
const EXAMEN_V4 = 'examen-4';
const EVALUACIONES = new Map([
  [V1, new Set([EXAMEN_V1])],
  [V4, new Set([EXAMEN_V4])],
]);

const CAMBIO = '2026-10-01T20:51:46.158Z';

function inscripcion(overrides: Partial<InscripcionParaIntentos> = {}): InscripcionParaIntentos {
  return { id: 'ins', userId: 'u', activityVersionId: V4, scoreSnapshot: {}, ...overrides };
}

const reiniciada = inscripcion({ scoreSnapshot: { migratedAt: CAMBIO, migratedFromVersionNumber: 3 } });

const intento = (assessmentId: string, score: number | null) => ({
  userId: 'u',
  enrollmentId: 'ins',
  assessmentId,
  score,
});

describe('loQueCuentaHoy', () => {
  it('cuenta todos los intentos cuando la inscripcion nunca cambio de version', () => {
    const fila = loQueCuentaHoy(
      [inscripcion({ activityVersionId: V1 })],
      [intento(EXAMEN_V1, 60), intento(EXAMEN_V1, 95)],
      [],
      EVALUACIONES,
    ).get('u');

    expect(fila?.intentos).toBe(2);
    expect(fila?.mejorNota).toBe(95);
    expect(fila?.reinicios.size).toBe(0);
  });

  it('aparta los intentos del examen anterior cuando la inscripcion se reinicio en otra version', () => {
    // El caso de produccion: diez intentos en el examen viejo y ninguno en el nuevo.
    const fila = loQueCuentaHoy(
      [reiniciada],
      [intento(EXAMEN_V1, 60), intento(EXAMEN_V1, 80), intento(EXAMEN_V1, 80)],
      [],
      EVALUACIONES,
    ).get('u');

    expect(fila?.intentos).toBe(0);
    expect(fila?.mejorNota).toBeNull();
    expect(fila?.reinicios.get('ins')).toEqual({
      desdeVersion: 3,
      fecha: CAMBIO,
      intentosAnteriores: 3,
      mejorNotaAnterior: 80,
      respondioEncuestaAnterior: false,
    });
  });

  it('separa lo de antes y lo de ahora cuando ya volvio a presentar en la version nueva', () => {
    const fila = loQueCuentaHoy(
      [reiniciada],
      [intento(EXAMEN_V1, 80), intento(EXAMEN_V4, 100)],
      [],
      EVALUACIONES,
    ).get('u');

    expect(fila?.intentos).toBe(1);
    expect(fila?.mejorNota).toBe(100);
    expect(fila?.reinicios.get('ins')?.intentosAnteriores).toBe(1);
  });

  it('no aparta nada de quien se movio sin intentos: no dejo nada atras', () => {
    const fila = loQueCuentaHoy([reiniciada], [intento(EXAMEN_V4, 70)], [], EVALUACIONES).get('u');

    expect(fila?.intentos).toBe(1);
    expect(fila?.reinicios.size).toBe(0);
  });

  it('deja atras la encuesta respondida antes del reinicio y conserva la de despues', () => {
    const encuesta = (respondedAt: string, result: string) => ({
      respondentUserId: 'u',
      enrollmentId: 'ins',
      result,
      respondedAt: new Date(respondedAt),
    });

    const soloVieja = loQueCuentaHoy(
      [reiniciada],
      [intento(EXAMEN_V1, 80)],
      [encuesta('2026-10-01T19:00:00.000Z', 'POSITIVE')],
      EVALUACIONES,
    ).get('u');
    expect(soloVieja?.encuesta).toBeUndefined();
    expect(soloVieja?.reinicios.get('ins')?.respondioEncuestaAnterior).toBe(true);

    const conNueva = loQueCuentaHoy(
      [reiniciada],
      [intento(EXAMEN_V1, 80)],
      [encuesta('2026-10-01T19:00:00.000Z', 'POSITIVE'), encuesta('2026-10-02T10:00:00.000Z', 'NEGATIVE')],
      EVALUACIONES,
    ).get('u');
    expect(conNueva?.encuesta).toBe('NEGATIVE');
  });

  it('conserva la encuesta de quien cambio de version sin reiniciar', () => {
    const fila = loQueCuentaHoy(
      [reiniciada],
      [],
      [{ respondentUserId: 'u', enrollmentId: 'ins', result: 'POSITIVE', respondedAt: new Date('2026-10-01T19:00:00.000Z') }],
      EVALUACIONES,
    ).get('u');

    expect(fila?.encuesta).toBe('POSITIVE');
  });
});
