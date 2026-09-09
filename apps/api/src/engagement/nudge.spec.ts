import { DEFAULT_NUDGE_HOUR, decideNudge, preferredHourFrom, startOfWeek, type NudgeInput } from './nudge.js';

/** 8:00 de la mañana en Bogota (UTC-5) del dia indicado. */
function bogota(year: number, month: number, day: number, hour = 8): Date {
  return new Date(Date.UTC(year, month - 1, day, hour + 5, 0, 0));
}

/** Fecha civil de una columna @db.Date: medianoche UTC, sin zona. */
function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function baseInput(overrides: Partial<NudgeInput> = {}): NudgeInput {
  return {
    now: bogota(2026, 9, 2), // miercoles
    preferredHour: 8,
    lastActivityDate: null,
    lastNudgeAt: null,
    nudgesThisWeek: 0,
    pendingPills: 1,
    hiredAt: null,
    cadencePerWeek: 3,
    weeklyCap: 5,
    ...overrides,
  };
}

describe('cadencia de pildoras', () => {
  it('no avisa si no hay pildoras pendientes', () => {
    expect(decideNudge(baseInput({ pendingPills: 0 }))).toEqual({ send: false, reason: 'NO_PILLS' });
  });

  it('no avisa a quien ya estudio hoy: el aviso es para quien no volvio', () => {
    const decision = decideNudge(baseInput({ lastActivityDate: dateOnly(2026, 9, 2) }));
    expect(decision).toEqual({ send: false, reason: 'ACTIVE_TODAY' });
  });

  it('avisa a quien estudio ayer pero no hoy', () => {
    const decision = decideNudge(baseInput({ lastActivityDate: dateOnly(2026, 9, 1) }));
    expect(decision.send).toBe(true);
  });

  it('solo envia en la franja horaria de la persona', () => {
    expect(decideNudge(baseInput({ now: bogota(2026, 9, 2, 15), preferredHour: 8 }))).toEqual({
      send: false,
      reason: 'WRONG_HOUR',
    });
    expect(decideNudge(baseInput({ now: bogota(2026, 9, 2, 15), preferredHour: 15 })).send).toBe(true);
  });

  it('respeta la cadencia semanal del tenant', () => {
    expect(decideNudge(baseInput({ nudgesThisWeek: 3, cadencePerWeek: 3 }))).toEqual({
      send: false,
      reason: 'WEEKLY_CAP',
    });
  });

  it('el tope de notificaciones del tenant manda sobre la cadencia', () => {
    // Cadencia 7 pero tope 2: a la tercera no se envia, aunque la cadencia lo permitiria.
    expect(decideNudge(baseInput({ cadencePerWeek: 7, weeklyCap: 2, nudgesThisWeek: 2 }))).toEqual({
      send: false,
      reason: 'WEEKLY_CAP',
    });
  });

  it('el tope tambien manda durante el onboarding', () => {
    const decision = decideNudge(
      baseInput({ hiredAt: dateOnly(2026, 8, 31), weeklyCap: 1, nudgesThisWeek: 1 }),
    );
    expect(decision).toEqual({ send: false, reason: 'WEEKLY_CAP' });
  });

  it('separa los avisos segun la cadencia (3 por semana = uno cada dos dias)', () => {
    const ayer = decideNudge(baseInput({ lastNudgeAt: bogota(2026, 9, 1) }));
    expect(ayer).toEqual({ send: false, reason: 'TOO_SOON' });

    const anteayer = decideNudge(baseInput({ lastNudgeAt: bogota(2026, 8, 31) }));
    expect(anteayer.send).toBe(true);
  });

  it('la primera semana de onboarding admite ritmo diario', () => {
    const decision = decideNudge(
      baseInput({ hiredAt: dateOnly(2026, 8, 31), lastNudgeAt: bogota(2026, 9, 1) }),
    );
    expect(decision).toEqual({ send: true, reason: 'ONBOARDING' });
  });

  it('pasados los siete dias del ingreso vuelve la cadencia normal', () => {
    const decision = decideNudge(
      baseInput({ hiredAt: dateOnly(2026, 8, 20), lastNudgeAt: bogota(2026, 9, 1) }),
    );
    expect(decision).toEqual({ send: false, reason: 'TOO_SOON' });
  });
});

describe('franja horaria preferida', () => {
  it('sin historia usa la hora de arranque de turno', () => {
    expect(preferredHourFrom([])).toBe(DEFAULT_NUDGE_HOUR);
  });

  it('toma la hora en la que mas veces ha aprendido', () => {
    expect(preferredHourFrom([6, 19, 19, 7, 19])).toBe(19);
  });

  it('ante empate prefiere la mas temprana, para no arrastrar los avisos a la noche', () => {
    expect(preferredHourFrom([6, 22])).toBe(6);
  });
});

describe('ventana del tope semanal', () => {
  it('empieza el lunes a medianoche de Bogota', () => {
    // El miercoles 2 de septiembre de 2026 pertenece a la semana del lunes 31 de agosto.
    expect(startOfWeek(bogota(2026, 9, 2)).toISOString()).toBe('2026-08-31T05:00:00.000Z');
  });

  it('un domingo pertenece a la semana que empezo el lunes anterior', () => {
    expect(startOfWeek(bogota(2026, 9, 6, 23)).toISOString()).toBe('2026-08-31T05:00:00.000Z');
  });
});
