import { renglonAutomatico, type PlanCandidato } from './plan-auto-item.js';

const HOY = new Date('2026-08-31T10:00:00-05:00');
const BORRADOR_2026: PlanCandidato = { id: 'p-2026', year: 2026, status: 'DRAFT' };
const APROBADO_2026: PlanCandidato = { id: 'p-2026', year: 2026, status: 'APPROVED' };
const BORRADOR_2027: PlanCandidato = { id: 'p-2027', year: 2027, status: 'DRAFT' };

describe('renglonAutomatico', () => {
  it('una formacion que NO es del plan no entra a ninguno', () => {
    expect(renglonAutomatico(false, '2026-03-10', [BORRADOR_2026], HOY)).toBeNull();
  });

  /** El caso que reporto el cliente: programar desde la ficha dejaba la jornada fuera del plan. */
  it('la capacitacion del plan entra al plan de su ano, en el mes de su fecha', () => {
    expect(renglonAutomatico(true, '2026-03-10', [BORRADOR_2026], HOY)).toEqual({
      planId: 'p-2026',
      plannedMonth: 3,
    });
  });

  it('el ano lo manda la FECHA, no el dia de hoy', () => {
    expect(renglonAutomatico(true, '2027-05-04', [BORRADOR_2026, BORRADOR_2027], HOY)).toEqual({
      planId: 'p-2027',
      plannedMonth: 5,
    });
  });

  /**
   * Un renglon en un plan vivo nace obligando a gente real y exige decir por que (Decision #55).
   * Un motivo no se inventa por detras: ahi tiene que preguntarlo la ficha.
   */
  it('con el plan ya APROBADO no entra sola: eso obliga a gente y pide motivo', () => {
    expect(renglonAutomatico(true, '2026-03-10', [APROBADO_2026], HOY)).toBeNull();
  });

  it('sin plan de ese ano no entra a ninguna parte', () => {
    expect(renglonAutomatico(true, '2029-03-10', [BORRADOR_2026], HOY)).toBeNull();
    expect(renglonAutomatico(true, '2026-03-10', [], HOY)).toBeNull();
  });

  /**
   * Una permanente de autoservicio no tiene fecha. El mes en curso es lo unico honesto que se
   * puede decir de algo disponible desde ya, y sigue siendo corregible en el cronograma.
   */
  it('sin fecha usa el mes en curso', () => {
    expect(renglonAutomatico(true, null, [BORRADOR_2026], HOY)).toEqual({
      planId: 'p-2026',
      plannedMonth: 8,
    });
  });

  /**
   * Se parte el TEXTO y no se construye un Date: 'YYYY-MM-DD' se interpreta como UTC y en Colombia
   * el dia 1 caeria en el mes anterior. Es la leccion de `fromDateOnly` (RUNBOOK 2026-08-27).
   */
  it('el dia 1 de un mes cae en ESE mes, no en el anterior', () => {
    expect(renglonAutomatico(true, '2026-03-01', [BORRADOR_2026], HOY)?.plannedMonth).toBe(3);
    expect(renglonAutomatico(true, '2026-01-01', [BORRADOR_2026], HOY)?.plannedMonth).toBe(1);
  });

  it('una fecha con forma rara cae al mes en curso en vez de inventarse un mes', () => {
    expect(renglonAutomatico(true, 'manana', [BORRADOR_2026], HOY)).toEqual({
      planId: 'p-2026',
      plannedMonth: 8,
    });
  });

  it('el ultimo mes del ano tambien vale', () => {
    expect(renglonAutomatico(true, '2026-12-31', [BORRADOR_2026], HOY)?.plannedMonth).toBe(12);
  });
});
