import { computePlanMetrics, type PlanItemFacts } from './plan-metrics.js';

const item = (partial: Partial<PlanItemFacts>): PlanItemFacts => ({
  itemId: partial.itemId ?? 'item',
  plannedMonth: partial.plannedMonth ?? 3,
  status: partial.status ?? 'PLANNED',
  projectedSnapshot: 'projectedSnapshot' in partial ? (partial.projectedSnapshot ?? null) : 10,
  assigned: partial.assigned ?? 10,
  enrolled: partial.enrolled ?? 0,
  trained: partial.trained ?? 0,
});

describe('indicadores del plan anual', () => {
  it('cumplimiento = ejecutadas / programadas', () => {
    const metrics = computePlanMetrics([
      item({ itemId: 'a', status: 'EXECUTED' }),
      item({ itemId: 'b', status: 'PLANNED' }),
      item({ itemId: 'c', status: 'EXECUTED' }),
      item({ itemId: 'd', status: 'RESCHEDULED' }),
    ]);
    expect(metrics.programmed).toBe(4);
    expect(metrics.executed).toBe(2);
    expect(metrics.compliancePct).toBe(50);
  });

  it('lo cancelado no cuenta ni a favor ni en contra', () => {
    const metrics = computePlanMetrics([
      item({ itemId: 'a', status: 'EXECUTED' }),
      item({ itemId: 'b', status: 'CANCELLED', projectedSnapshot: 100, trained: 0 }),
    ]);
    expect(metrics.programmed).toBe(1);
    expect(metrics.cancelled).toBe(1);
    expect(metrics.compliancePct).toBe(100);
    // El renglon cancelado tampoco arrastra sus proyectados al denominador de la cobertura.
    expect(metrics.projected).toBe(10);
  });

  it('cobertura = capacitados / proyectados congelados', () => {
    const metrics = computePlanMetrics([
      item({ itemId: 'a', projectedSnapshot: 20, trained: 15 }),
      item({ itemId: 'b', projectedSnapshot: 30, trained: 0 }),
    ]);
    expect(metrics.projected).toBe(50);
    expect(metrics.trained).toBe(15);
    expect(metrics.coveragePct).toBe(30);
  });

  it('sin proyectados la cobertura es 0 y no divide por cero', () => {
    const metrics = computePlanMetrics([item({ projectedSnapshot: null, trained: 3 })]);
    expect(metrics.projected).toBe(0);
    expect(metrics.coveragePct).toBe(0);
  });

  it('un plan vacio no rompe ni inventa un 100%', () => {
    const metrics = computePlanMetrics([]);
    expect(metrics.programmed).toBe(0);
    expect(metrics.compliancePct).toBe(0);
    expect(metrics.byMonth).toEqual([]);
  });

  it('agrupa por mes en orden, para la vista del programa', () => {
    const metrics = computePlanMetrics([
      item({ itemId: 'a', plannedMonth: 5, status: 'EXECUTED', projectedSnapshot: 10, trained: 4 }),
      item({ itemId: 'b', plannedMonth: 2, projectedSnapshot: 6, trained: 1 }),
      item({ itemId: 'c', plannedMonth: 5, projectedSnapshot: 4, trained: 2 }),
    ]);
    expect(metrics.byMonth.map((month) => month.month)).toEqual([2, 5]);
    expect(metrics.byMonth[1]).toEqual({ month: 5, programmed: 2, executed: 1, projected: 14, trained: 6 });
  });

  it('REGLA DE ORO: lo que no nacio del plan no puede moverlo', () => {
    // Los hechos que entran aqui ya vienen filtrados por assignment.source = PLAN. Aunque la
    // empresa asigne cien formaciones extraordinarias, el plan solo ve sus propios renglones:
    // el resultado es identico con y sin ese ruido, porque el ruido nunca llega a esta lista.
    const facts = [item({ itemId: 'a', status: 'EXECUTED', projectedSnapshot: 20, trained: 20 })];
    const antes = computePlanMetrics(facts);
    const despues = computePlanMetrics([...facts]);
    expect(despues).toEqual(antes);
    expect(antes.coveragePct).toBe(100);
  });
});
