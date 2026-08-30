import { decidePlanDeletion, deletionNeedsJustification, type PlanDeletionFacts } from './plan-deletion.js';

function facts(overrides: Partial<PlanDeletionFacts> = {}): PlanDeletionFacts {
  return { status: 'DRAFT', obligations: 0, started: 0, ...overrides };
}

describe('decidePlanDeletion', () => {
  it('un borrador se borra: nunca obligo a nadie', () => {
    expect(decidePlanDeletion(facts())).toEqual({ allowed: true, revokes: 0 });
  });

  it('un plan aprobado que nadie abrio se borra, y dice cuantas obligaciones revoca', () => {
    const verdict = decidePlanDeletion(facts({ status: 'APPROVED', obligations: 34 }));
    expect(verdict).toEqual({ allowed: true, revokes: 34 });
  });

  it('lo mismo en ejecucion: el estado no es la frontera, el avance de la gente si', () => {
    expect(decidePlanDeletion(facts({ status: 'ACTIVE', obligations: 7 }))).toEqual({ allowed: true, revokes: 7 });
  });

  it('una sola persona que empezo lo bloquea, aunque las demas obligaciones esten intactas', () => {
    const verdict = decidePlanDeletion(facts({ status: 'ACTIVE', obligations: 200, started: 1 }));
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('inalcanzable');
    expect(verdict.code).toBe('PLAN_HAS_EVIDENCE');
    // El mensaje se lee en pantalla: en singular no puede decir "1 personas".
    expect(verdict.message).toContain('Una persona');
  });

  it('con varios, el mensaje dice cuantos son', () => {
    const verdict = decidePlanDeletion(facts({ status: 'ACTIVE', obligations: 200, started: 12 }));
    if (verdict.allowed) throw new Error('inalcanzable');
    expect(verdict.message).toContain('12 personas');
  });

  it('el plan cerrado no se borra ni estando vacio: cerrar es lo que lo hace evidencia', () => {
    const verdict = decidePlanDeletion(facts({ status: 'CLOSED' }));
    if (verdict.allowed) throw new Error('inalcanzable');
    expect(verdict.code).toBe('PLAN_CLOSED_IS_EVIDENCE');
  });

  it('el cierre manda sobre el avance: cerrado y con gente que empezo sigue siendo CLOSED', () => {
    const verdict = decidePlanDeletion(facts({ status: 'CLOSED', obligations: 9, started: 4 }));
    if (verdict.allowed) throw new Error('inalcanzable');
    expect(verdict.code).toBe('PLAN_CLOSED_IS_EVIDENCE');
  });
});

describe('deletionNeedsJustification', () => {
  it('en borrador no se pide motivo: es una lista de trabajo', () => {
    expect(deletionNeedsJustification('DRAFT')).toBe(false);
  });

  it('desde aprobado si, porque hubo gente a la que ya se le anuncio', () => {
    expect(deletionNeedsJustification('APPROVED')).toBe(true);
    expect(deletionNeedsJustification('ACTIVE')).toBe(true);
  });
});
