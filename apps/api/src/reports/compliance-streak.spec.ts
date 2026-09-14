import { avanzarRachaCumplimiento, titularDeRacha, type RachaCumplimiento } from './compliance-streak.js';

const NUNCA: RachaCumplimiento = { currentDays: 0, longestDays: 0, lastCheckedAt: null };
const dia = (iso: string): Date => new Date(`${iso}T08:00:00-05:00`);
const fechaSolo = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe('avanzarRachaCumplimiento', () => {
  it('el primer dia sin vencidos arranca la racha en 1', () => {
    const r = avanzarRachaCumplimiento(NUNCA, dia('2026-09-01'), false);
    expect(r).toMatchObject({ currentDays: 1, longestDays: 1, outcome: 'FIRST_ZERO' });
  });

  it('un dia despues, sin vencidos, la racha continua', () => {
    const ayer: RachaCumplimiento = { currentDays: 5, longestDays: 5, lastCheckedAt: fechaSolo('2026-09-01') };
    const r = avanzarRachaCumplimiento(ayer, dia('2026-09-02'), false);
    expect(r).toMatchObject({ currentDays: 6, longestDays: 6, outcome: 'CONTINUED' });
  });

  it('un vencido reinicia la racha a 0, sin importar cuanto llevaba', () => {
    const rachaLarga: RachaCumplimiento = { currentDays: 40, longestDays: 40, lastCheckedAt: fechaSolo('2026-09-01') };
    const r = avanzarRachaCumplimiento(rachaLarga, dia('2026-09-02'), true);
    expect(r).toMatchObject({ currentDays: 0, longestDays: 40, outcome: 'HAD_OVERDUE' });
  });

  it('el record (longestDays) no baja aunque la racha actual se reinicie', () => {
    const r = avanzarRachaCumplimiento({ currentDays: 10, longestDays: 40, lastCheckedAt: fechaSolo('2026-09-01') }, dia('2026-09-02'), true);
    expect(r.longestDays).toBe(40);
  });

  it('comprobar dos veces el mismo dia no cuenta doble (reintento del worker)', () => {
    const hoy: RachaCumplimiento = { currentDays: 3, longestDays: 3, lastCheckedAt: fechaSolo('2026-09-02') };
    const r = avanzarRachaCumplimiento(hoy, dia('2026-09-02'), false);
    expect(r).toMatchObject({ currentDays: 3, outcome: 'SAME_DAY' });
  });

  it('un salto de mas de un dia sin comprobar reinicia el conteo a 1, sin inventar los dias intermedios', () => {
    // El servidor estuvo caido tres dias; hoy no hay vencidos, pero no se puede afirmar nada de
    // los tres dias que no se comprobaron.
    const antes: RachaCumplimiento = { currentDays: 20, longestDays: 20, lastCheckedAt: fechaSolo('2026-09-01') };
    const r = avanzarRachaCumplimiento(antes, dia('2026-09-05'), false);
    expect(r).toMatchObject({ currentDays: 1, longestDays: 20, outcome: 'GAP_RESTARTED' });
  });

  it('la primera comprobacion con algo ya vencido arranca en 0, no en negativo ni en error', () => {
    const r = avanzarRachaCumplimiento(NUNCA, dia('2026-09-01'), true);
    expect(r).toMatchObject({ currentDays: 0, longestDays: 0, outcome: 'HAD_OVERDUE' });
  });
});

describe('titularDeRacha', () => {
  it('con menos de 2 dias no dice nada: "Todo al dia" ya lo cubre', () => {
    expect(titularDeRacha(0)).toBeNull();
    expect(titularDeRacha(1)).toBeNull();
  });

  it('con 2 o mas dias, nombra la racha', () => {
    expect(titularDeRacha(2)).toBe('Nadie tiene nada vencido: 2 días seguidos');
    expect(titularDeRacha(41)).toBe('Nadie tiene nada vencido: 41 días seguidos');
  });
});
