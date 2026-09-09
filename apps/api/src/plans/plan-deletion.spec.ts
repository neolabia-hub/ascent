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

  /**
   * El plan CERRADO que nunca obligo a nadie SI se borra (Decision #71).
   *
   * La regla anterior lo prohibia siempre, y con un plan por año eso dejo de ser estricto y paso a
   * ser una trampa: un plan de ensayo que alguien cerro por probar el boton se queda con 2026 y ya
   * no hay forma de planear el año. Lo que se protege sigue siendo el registro de PERSONAS, y sin
   * una sola obligacion no hay registro que proteger.
   */
  it('el cerrado que nunca obligo a nadie SI se borra: no es evidencia de nada, es un ensayo', () => {
    expect(decidePlanDeletion(facts({ status: 'CLOSED' }))).toEqual({ allowed: true, revokes: 0 });
  });

  it('el cerrado que SI obligo no se borra, y el mensaje ofrece la salida: reabrirlo', () => {
    const verdict = decidePlanDeletion(facts({ status: 'CLOSED', obligations: 9, started: 4 }));
    if (verdict.allowed) throw new Error('inalcanzable');
    expect(verdict.code).toBe('PLAN_CLOSED_IS_EVIDENCE');
    expect(verdict.message).toContain('reabrelo');
  });

  it('cerrado con obligaciones pero sin que nadie empezara tampoco se borra: ya se anuncio', () => {
    const verdict = decidePlanDeletion(facts({ status: 'CLOSED', obligations: 40 }));
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
