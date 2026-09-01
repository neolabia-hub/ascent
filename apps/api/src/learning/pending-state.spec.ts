import { resolvePendingState, venceEnDosDias, type PendingStateInput } from './pending-state.js';

const AHORA = new Date('2026-09-01T12:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);
const dentroDe = (dias: number) => new Date(AHORA.getTime() + dias * 86_400_000);

function entrada(parcial: Partial<PendingStateInput> = {}): PendingStateInput {
  return { overdue: false, dueAt: null, enrollmentId: null, started: false, selfServiceOfferingId: null, ...parcial };
}

describe('resolvePendingState', () => {
  it('NO reclama un retraso a quien nunca pudo empezar', () => {
    // El fallo original: "Vencio hace 3 dias" y debajo "Todavia no esta abierta, deben
    // convocarte". Dos verdades sueltas que juntas acusan a quien no causo el retraso.
    const resultado = resolvePendingState(entrada({ overdue: true, dueAt: hace(3) }), AHORA);

    expect(resultado.state).toBe('ESPERANDO');
    expect(resultado.actionable).toBe(false);
    expect(resultado.stateLabel).toBe('Pendiente de que la abran');
  });

  it('sin retraso y sin convocatoria, dice a quien se espera', () => {
    const resultado = resolvePendingState(entrada(), AHORA);

    expect(resultado.state).toBe('ESPERANDO');
    expect(resultado.stateLabel).toBe('Esperando convocatoria');
  });

  it('si esta atrasada y SI podia entrar, lo dice con el numero de dias', () => {
    const resultado = resolvePendingState(entrada({ overdue: true, dueAt: hace(3), enrollmentId: 'e1' }), AHORA);

    expect(resultado.state).toBe('ATRASADA');
    expect(resultado.actionable).toBe(true);
    expect(resultado.stateLabel).toBe('Se paso 3 dias');
  });

  it('una convocatoria de autoservicio tambien es poder actuar', () => {
    // Sin inscripcion previa, pero con la puerta abierta: el retraso si es reclamable.
    const resultado = resolvePendingState(
      entrada({ overdue: true, dueAt: hace(3), selfServiceOfferingId: 'o1' }),
      AHORA,
    );

    expect(resultado.state).toBe('ATRASADA');
  });

  it('lo empezado manda sobre vence-pronto y sobre atrasada', () => {
    const empezadaYUrgente = resolvePendingState(
      entrada({ started: true, enrollmentId: 'e1', dueAt: dentroDe(1) }),
      AHORA,
    );
    const empezadaYAtrasada = resolvePendingState(
      entrada({ started: true, enrollmentId: 'e1', overdue: true, dueAt: hace(5) }),
      AHORA,
    );

    expect(empezadaYUrgente.state).toBe('EN_CURSO');
    expect(empezadaYAtrasada.state).toBe('EN_CURSO');
  });

  it('escala el retraso a meses cuando ya no se cuenta en dias', () => {
    const conRetraso = (dias: number) =>
      resolvePendingState(entrada({ overdue: true, enrollmentId: 'e1', dueAt: hace(dias) }), AHORA).stateLabel;

    expect(conRetraso(1)).toBe('Se paso 1 dia');
    expect(conRetraso(29)).toBe('Se paso 29 dias');
    expect(conRetraso(45)).toBe('Se paso 1 mes');
    expect(conRetraso(70)).toBe('Se paso 2 meses');
  });

  it('atrasada sin fecha no inventa un numero', () => {
    const resultado = resolvePendingState(entrada({ overdue: true, enrollmentId: 'e1', dueAt: null }), AHORA);

    expect(resultado.stateLabel).toBe('Fuera de plazo');
  });
});

describe('venceEnDosDias', () => {
  it('dos dias aprieta, tres ya no', () => {
    expect(venceEnDosDias(dentroDe(2), AHORA)).toBe(true);
    expect(venceEnDosDias(dentroDe(3), AHORA)).toBe(false);
  });

  it('lo ya pasado NO es "vence pronto"', () => {
    // Antes lo vencido y lo que esta por vencer caian en la misma fila y se leian igual.
    expect(venceEnDosDias(hace(1), AHORA)).toBe(false);
  });

  it('sin fecha no hay urgencia que calcular', () => {
    expect(venceEnDosDias(null, AHORA)).toBe(false);
  });
});
