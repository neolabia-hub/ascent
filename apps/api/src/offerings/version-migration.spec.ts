import { planVersionMigration, type MigrationCandidate } from './version-migration.js';

const V1 = 'v1';
const V2 = 'v2';

function person(overrides: Partial<MigrationCandidate> & { id: string }): MigrationCandidate {
  return {
    userId: `u-${overrides.id}`,
    status: 'ENROLLED',
    activityVersionId: V1,
    started: false,
    hasOtherEnrollmentOnTarget: false,
    ...overrides,
  };
}

describe('planVersionMigration', () => {
  it('no mueve a nadie con FINISH_OLD: quien estaba inscrito termina en la version vieja', () => {
    const plan = planVersionMigration(
      [person({ id: 'a' }), person({ id: 'b', status: 'IN_PROGRESS', started: true })],
      V2,
      'FINISH_OLD',
    );
    expect(plan.moving).toHaveLength(0);
    expect(plan.counts.keepOldVersion).toBe(2);
  });

  it('con MOVE_NOT_STARTED mueve solo a quien no ha abierto nada', () => {
    const plan = planVersionMigration(
      [
        person({ id: 'sin-empezar' }),
        person({ id: 'con-avance', started: true }),
        person({ id: 'en-curso', status: 'IN_PROGRESS', started: true }),
      ],
      V2,
      'MOVE_NOT_STARTED',
    );
    expect(plan.moving.map((e) => e.id)).toEqual(['sin-empezar']);
    expect(plan.counts.keepOldVersion).toBe(2);
  });

  it('MOVE_NOT_STARTED mira el HECHO, no el estado: con avance no se mueve aunque diga ENROLLED', () => {
    // Guardar avance no siempre mueve el estado a IN_PROGRESS (un envio perdido por falta de
    // señal, por ejemplo). Fiarse del rotulo le borraria el avance a alguien que si empezo.
    const plan = planVersionMigration([person({ id: 'a', status: 'ENROLLED', started: true })], V2, 'MOVE_NOT_STARTED');
    expect(plan.moving).toHaveLength(0);
  });

  it('con RESTART_NEW mueve a todo el que no haya cerrado', () => {
    const plan = planVersionMigration(
      [person({ id: 'a' }), person({ id: 'b', status: 'IN_PROGRESS', started: true })],
      V2,
      'RESTART_NEW',
    );
    expect(plan.moving).toHaveLength(2);
    expect(plan.counts.keepOldVersion).toBe(0);
  });

  it.each(['COMPLETED', 'PASSED', 'FAILED', 'WITHDRAWN', 'EXPIRED'])(
    'NUNCA mueve una ejecucion %s, ni con RESTART_NEW: es evidencia',
    (status) => {
      const plan = planVersionMigration([person({ id: 'a', status, started: true })], V2, 'RESTART_NEW');
      expect(plan.moving).toHaveLength(0);
      expect(plan.counts.frozen).toBe(1);
      expect(plan.counts.keepOldVersion).toBe(0);
    },
  );

  it('deja quieto a quien ya tiene otra ejecucion abierta de la version destino, y lo reporta', () => {
    const plan = planVersionMigration(
      [person({ id: 'a' }), person({ id: 'b', hasOtherEnrollmentOnTarget: true })],
      V2,
      'RESTART_NEW',
    );
    expect(plan.moving.map((e) => e.id)).toEqual(['a']);
    expect(plan.counts.conflicted).toBe(1);
    expect(plan.counts.keepOldVersion).toBe(1);
  });

  it('cuenta como rezagado al que quedo en una version anterior a la anterior', () => {
    // La convocatoria fue v1 -> v2 con FINISH_OLD (nadie se movio) y ahora va v2 -> v3.
    const plan = planVersionMigration([person({ id: 'rezagado', activityVersionId: V1 })], 'v3', 'MOVE_NOT_STARTED');
    expect(plan.moving.map((e) => e.id)).toEqual(['rezagado']);
  });

  it('no cuenta como movible al que ya esta en la version destino', () => {
    const plan = planVersionMigration([person({ id: 'a', activityVersionId: V2 })], V2, 'RESTART_NEW');
    expect(plan.moving).toHaveLength(0);
    expect(plan.counts.alreadyOnTarget).toBe(1);
    expect(plan.counts.keepOldVersion).toBe(0);
  });

  it('las casillas SUMAN el total: quien autoriza ve numeros que cuadran', () => {
    const plan = planVersionMigration(
      [
        person({ id: 'mueve' }),
        person({ id: 'queda', started: true }),
        person({ id: 'choca', hasOtherEnrollmentOnTarget: true }),
        person({ id: 'cerrada', status: 'PASSED' }),
        person({ id: 'ya-en-nueva', activityVersionId: V2 }),
      ],
      V2,
      'MOVE_NOT_STARTED',
    );
    const { total, moving, keepOldVersion, frozen, alreadyOnTarget } = plan.counts;
    expect(moving + keepOldVersion + frozen + alreadyOnTarget).toBe(total);
    expect(total).toBe(5);
  });
});
