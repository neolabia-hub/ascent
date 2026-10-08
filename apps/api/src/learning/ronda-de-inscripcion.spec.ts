import { decidirInscripcion } from './ronda-de-inscripcion.js';

describe('una inscripcion por ronda', () => {
  it('la primera vez crea la ronda 1', () => {
    expect(decidirInscripcion([], 'obligacion-1')).toEqual({ crear: 1 });
    // Tambien quien entra por gusto, sin obligacion.
    expect(decidirInscripcion([], null)).toEqual({ crear: 1 });
  });

  it('con una inscripcion viva no se crea otra: se sigue en esa', () => {
    const previas = [{ id: 'e1', status: 'IN_PROGRESS', round: 1, assignmentId: 'obligacion-1' }];
    expect(decidirInscripcion(previas, 'obligacion-1')).toEqual({ reusar: 'e1' });
  });

  it('la SEGUNDA vez abre la ronda 2 en la misma convocatoria, sin tocar la del año anterior', () => {
    const previas = [{ id: 'e1', status: 'COMPLETED', round: 1, assignmentId: 'obligacion-1' }];
    expect(decidirInscripcion(previas, 'obligacion-2')).toEqual({ crear: 2 });
  });

  it('y la tercera, la ronda 3: cuenta desde la ultima, no desde la primera', () => {
    const previas = [
      { id: 'e2', status: 'PASSED', round: 2, assignmentId: 'obligacion-2' },
      { id: 'e1', status: 'COMPLETED', round: 1, assignmentId: 'obligacion-1' },
    ];
    expect(decidirInscripcion(previas, 'obligacion-3')).toEqual({ crear: 3 });
  });

  it('sin obligacion nueva, volver a entrar es repasar: la misma inscripcion', () => {
    const previas = [{ id: 'e1', status: 'COMPLETED', round: 1, assignmentId: 'obligacion-1' }];
    expect(decidirInscripcion(previas, null)).toEqual({ reusar: 'e1' });
  });

  it('quien reprobo y sigue debiendo LA MISMA obligacion no estrena ronda', () => {
    const previas = [{ id: 'e1', status: 'FAILED', round: 1, assignmentId: 'obligacion-1' }];
    expect(decidirInscripcion(previas, 'obligacion-1')).toEqual({ reusar: 'e1' });
  });

  it('la ronda que no hizo (retirada o vencida) no bloquea la siguiente', () => {
    const previas = [{ id: 'e1', status: 'EXPIRED', round: 1, assignmentId: 'obligacion-1' }];
    expect(decidirInscripcion(previas, 'obligacion-2')).toEqual({ crear: 2 });
  });
});
