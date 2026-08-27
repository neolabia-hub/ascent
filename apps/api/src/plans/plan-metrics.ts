/**
 * Indicadores del PLAN ANUAL (CLAUDE.md 3.10). Calculo puro: entra lo que ya se conto en la
 * base, sale el indicador. Se separa a proposito para poder probar la regla de oro sin base de
 * datos.
 *
 * REGLA DE ORO 2 (Decision #4): el plan se mide SOLO con lo que nacio del plan. Quien ingreso en
 * agosto no hace la convocatoria de marzo ni aparece como incumplido: su formacion nace de la
 * regla de ingreso y se mide aparte. Las capacitaciones extraordinarias y las pildoras tampoco
 * tocan estos numeros. Por eso los hechos que entran aqui vienen filtrados por
 * `assignment.source = PLAN` y `assignment.plan_item_id` del renglon.
 */

export type PlanItemStatus = 'PLANNED' | 'EXECUTED' | 'RESCHEDULED' | 'CANCELLED';

export interface PlanItemFacts {
  itemId: string;
  plannedMonth: number;
  status: PlanItemStatus;
  /** Proyectados CONGELADOS al aprobar el plan. Null = el renglon aun no se aprobo. */
  projectedSnapshot: number | null;
  /** Obligaciones nacidas del plan para este renglon. */
  assigned: number;
  /** Cuantas de esas obligaciones llegaron a inscripcion. */
  enrolled: number;
  /** Cuantas terminaron la formacion (capacitados). */
  trained: number;
}

export interface PlanMonthMetrics {
  month: number;
  programmed: number;
  executed: number;
  projected: number;
  trained: number;
}

export interface PlanMetrics {
  /** Convocatorias programadas (las canceladas no cuentan ni a favor ni en contra). */
  programmed: number;
  executed: number;
  cancelled: number;
  /** Cumplimiento del programa = ejecutadas / programadas. */
  compliancePct: number;
  projected: number;
  assigned: number;
  enrolled: number;
  trained: number;
  /** Cobertura = capacitados / proyectados. */
  coveragePct: number;
  byMonth: PlanMonthMetrics[];
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function computePlanMetrics(items: PlanItemFacts[]): PlanMetrics {
  const live = items.filter((item) => item.status !== 'CANCELLED');
  const executed = live.filter((item) => item.status === 'EXECUTED').length;
  const projected = live.reduce((sum, item) => sum + (item.projectedSnapshot ?? 0), 0);
  const trained = live.reduce((sum, item) => sum + item.trained, 0);

  const months = new Map<number, PlanMonthMetrics>();
  for (const item of live) {
    const month = months.get(item.plannedMonth) ?? {
      month: item.plannedMonth,
      programmed: 0,
      executed: 0,
      projected: 0,
      trained: 0,
    };
    month.programmed += 1;
    month.executed += item.status === 'EXECUTED' ? 1 : 0;
    month.projected += item.projectedSnapshot ?? 0;
    month.trained += item.trained;
    months.set(item.plannedMonth, month);
  }

  return {
    programmed: live.length,
    executed,
    cancelled: items.length - live.length,
    compliancePct: percentage(executed, live.length),
    projected,
    assigned: live.reduce((sum, item) => sum + item.assigned, 0),
    enrolled: live.reduce((sum, item) => sum + item.enrolled, 0),
    trained,
    coveragePct: percentage(trained, projected),
    byMonth: [...months.values()].sort((a, b) => a.month - b.month),
  };
}
