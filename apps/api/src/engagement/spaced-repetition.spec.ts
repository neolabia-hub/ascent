import { dueAtForStage, enterQueue, nextState } from './spaced-repetition.js';

const NOW = new Date('2026-08-27T10:00:00-05:00');
const daysFrom = (date: Date) => Math.round((date.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000));

/** Los escalones por defecto de la semilla, usados en la mayoria de los casos. */
const ESCALONES = [1, 2, 7, 14, 30];
const MAX_STAGE = ESCALONES.length - 1;

describe('repeticion espaciada', () => {
  it('una pregunta fallada vuelve al primer escalon', () => {
    const entry = enterQueue(NOW, ESCALONES);
    expect(entry.stage).toBe(0);
    expect(entry.lapses).toBe(1);
    expect(daysFrom(entry.dueAt)).toBe(1);
  });

  it('acertar la aleja siguiendo la escalera del tenant', () => {
    let state = { stage: 0, lapses: 1, retired: false };
    const gaps: number[] = [];
    for (let step = 0; step < MAX_STAGE; step += 1) {
      const transition = nextState(state, true, NOW, ESCALONES);
      gaps.push(daysFrom(transition.dueAt));
      state = { stage: transition.stage, lapses: transition.lapses, retired: transition.retired };
    }
    expect(gaps).toEqual([2, 7, 14, 30]);
  });

  it('fallar retrocede UN escalon, no reinicia', () => {
    const transition = nextState({ stage: 3, lapses: 0, retired: false }, false, NOW, ESCALONES);
    expect(transition.stage).toBe(2);
    expect(transition.lapses).toBe(1);
    expect(daysFrom(transition.dueAt)).toBe(ESCALONES[2]);
  });

  it('fallar en el primer escalon no baja de cero', () => {
    expect(nextState({ stage: 0, lapses: 2, retired: false }, false, NOW, ESCALONES).stage).toBe(0);
  });

  it('acertar en el ultimo escalon la da por dominada y sale de la cola', () => {
    const transition = nextState({ stage: MAX_STAGE, lapses: 1, retired: false }, true, NOW, ESCALONES);
    expect(transition.retired).toBe(true);
    expect(transition.stage).toBe(MAX_STAGE);
  });

  it('el intervalo de un escalon fuera de rango se acota, no revienta', () => {
    expect(daysFrom(dueAtForStage(99, NOW, ESCALONES))).toBe(30);
    expect(daysFrom(dueAtForStage(-5, NOW, ESCALONES))).toBe(1);
  });

  /**
   * LOS ESCALONES SON DEL TENANT (`PENDIENTES` 5.1, 2026-09-14): dos tenants con la misma
   * pregunta en el mismo estado tienen que poder recibir fechas DISTINTAS si configuraron
   * escaleras distintas. Es lo que hace que la parametrizacion sea real y no cosmetica.
   */
  describe('dos tenants, dos escaleras', () => {
    const AGRESIVA = [1, 3, 5]; // una empresa que quiere machacar mas rapido, con menos escalones
    const RELAJADA = [2, 10, 30, 90, 180]; // otra que prefiere espaciar mas y tiene mas paciencia

    it('la misma pregunta fallada vence en fechas distintas segun el tenant', () => {
      expect(daysFrom(enterQueue(NOW, AGRESIVA).dueAt)).toBe(1);
      expect(daysFrom(enterQueue(NOW, RELAJADA).dueAt)).toBe(2);
    });

    it('el escalon final —y por tanto cuando se da por dominada— depende de la escalera', () => {
      // AGRESIVA tiene 3 escalones (indices 0,1,2): el ultimo es el 2.
      const dominadaAgresiva = nextState({ stage: 2, lapses: 0, retired: false }, true, NOW, AGRESIVA);
      expect(dominadaAgresiva.retired).toBe(true);

      // En la RELAJADA (5 escalones), estar en el mismo indice (2) todavia NO es el ultimo.
      const enCursoRelajada = nextState({ stage: 2, lapses: 0, retired: false }, true, NOW, RELAJADA);
      expect(enCursoRelajada.retired).toBe(false); // en la relajada, todavia quedan escalones
      expect(daysFrom(enCursoRelajada.dueAt)).toBe(90);
    });

    it('una escalera de solo dos escalones (el minimo permitido) funciona igual', () => {
      const minima = [1, 5];
      // Primera falla: entra en el escalon 0. Un acierto la sube al escalon 1 (el ultimo, pero
      // TODAVIA no dominada: acertar EN el ultimo es lo que retira, no llegar a el).
      const entry = enterQueue(NOW, minima);
      const enElUltimo = nextState({ stage: entry.stage, lapses: entry.lapses, retired: entry.retired }, true, NOW, minima);
      expect(enElUltimo.retired).toBe(false);
      expect(enElUltimo.stage).toBe(1);
      // Un segundo acierto, ya ESTANDO en el ultimo escalon, es lo que la da por dominada.
      const dominada = nextState({ stage: enElUltimo.stage, lapses: enElUltimo.lapses, retired: enElUltimo.retired }, true, NOW, minima);
      expect(dominada.retired).toBe(true);
    });
  });
});
