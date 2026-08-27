import { advanceStreak, type StreakState } from './streak.js';

/** `last_activity_date` es columna de SOLO FECHA: se construye a medianoche UTC. */
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}-05:00`);

const base: StreakState = { currentStreak: 3, longestStreak: 5, lastActivityDate: dateOnly('2026-08-26'), freezesAvailable: 2 };

describe('racha', () => {
  it('la primera leccion la arranca en 1', () => {
    const result = advanceStreak({ ...base, currentStreak: 0, longestStreak: 0, lastActivityDate: null }, at('2026-08-27T09:00:00'));
    expect(result).toMatchObject({ currentStreak: 1, longestStreak: 1, outcome: 'FIRST' });
  });

  it('un dia seguido la aumenta', () => {
    const result = advanceStreak(base, at('2026-08-27T09:00:00'));
    expect(result).toMatchObject({ currentStreak: 4, outcome: 'CONTINUED' });
  });

  it('varias lecciones el mismo dia NO la inflan', () => {
    const result = advanceStreak({ ...base, lastActivityDate: dateOnly('2026-08-27') }, at('2026-08-27T22:00:00'));
    expect(result).toMatchObject({ currentStreak: 3, outcome: 'SAME_DAY' });
  });

  it('completar a las 11 de la noche cuenta como HOY, no como manana', () => {
    // Sin leer la fecha civil de Colombia, las 23:30 se guardarian como el dia siguiente en UTC
    // y regalarian un dia de racha.
    const result = advanceStreak(base, at('2026-08-27T23:30:00'));
    expect(result.lastActivityDate?.toISOString()).toBe('2026-08-27T00:00:00.000Z');
    expect(result.outcome).toBe('CONTINUED');
  });

  it('un dia perdido gasta un protector y la racha sobrevive', () => {
    const result = advanceStreak(base, at('2026-08-28T09:00:00'));
    expect(result).toMatchObject({ currentStreak: 4, freezesAvailable: 1, outcome: 'FROZEN' });
  });

  it('sin protectores, dos dias sin actividad la reinician', () => {
    const result = advanceStreak({ ...base, freezesAvailable: 0 }, at('2026-08-28T09:00:00'));
    expect(result).toMatchObject({ currentStreak: 1, outcome: 'RESET' });
  });

  it('una ausencia larga la reinicia aunque queden protectores', () => {
    const result = advanceStreak(base, at('2026-09-10T09:00:00'));
    expect(result).toMatchObject({ currentStreak: 1, freezesAvailable: 2, outcome: 'RESET' });
  });

  it('el record historico nunca baja', () => {
    const result = advanceStreak({ ...base, currentStreak: 1, longestStreak: 9 }, at('2026-08-27T09:00:00'));
    expect(result.longestStreak).toBe(9);
  });
});
