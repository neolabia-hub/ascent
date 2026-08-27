import { dueAtForStage, enterQueue, MAX_STAGE, nextState, REVIEW_INTERVALS_DAYS } from './spaced-repetition.js';

const NOW = new Date('2026-08-27T10:00:00-05:00');
const daysFrom = (date: Date) => Math.round((date.getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000));

describe('repeticion espaciada', () => {
  it('una pregunta fallada vuelve al dia siguiente', () => {
    const entry = enterQueue(NOW);
    expect(entry.stage).toBe(0);
    expect(entry.lapses).toBe(1);
    expect(daysFrom(entry.dueAt)).toBe(1);
  });

  it('acertar la aleja siguiendo la escalera 2-7-14-30', () => {
    let state = { stage: 0, lapses: 1, retired: false };
    const gaps: number[] = [];
    for (let step = 0; step < MAX_STAGE; step += 1) {
      const transition = nextState(state, true, NOW);
      gaps.push(daysFrom(transition.dueAt));
      state = { stage: transition.stage, lapses: transition.lapses, retired: transition.retired };
    }
    expect(gaps).toEqual([2, 7, 14, 30]);
  });

  it('fallar retrocede UN escalon, no reinicia', () => {
    const transition = nextState({ stage: 3, lapses: 0, retired: false }, false, NOW);
    expect(transition.stage).toBe(2);
    expect(transition.lapses).toBe(1);
    expect(daysFrom(transition.dueAt)).toBe(REVIEW_INTERVALS_DAYS[2]);
  });

  it('fallar en el primer escalon no baja de cero', () => {
    expect(nextState({ stage: 0, lapses: 2, retired: false }, false, NOW).stage).toBe(0);
  });

  it('acertar en el ultimo escalon la da por dominada y sale de la cola', () => {
    const transition = nextState({ stage: MAX_STAGE, lapses: 1, retired: false }, true, NOW);
    expect(transition.retired).toBe(true);
    expect(transition.stage).toBe(MAX_STAGE);
  });

  it('el intervalo de un escalon fuera de rango se acota, no revienta', () => {
    expect(daysFrom(dueAtForStage(99, NOW))).toBe(30);
    expect(daysFrom(dueAtForStage(-5, NOW))).toBe(1);
  });
});
