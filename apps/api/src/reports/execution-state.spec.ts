import { resolverEstadoEjecucion, resumirEjecucion, type EntradaDeEstado } from './execution-state.js';

function caso(parcial: Partial<EntradaDeEstado> = {}): EntradaDeEstado {
  return { overdue: false, enrollmentStatus: null, puedeAutoinscribirse: true, ...parcial };
}

describe('resolverEstadoEjecucion', () => {
  it('lo aprobado esta TERMINADO aunque su fecha limite haya pasado', () => {
    // Una formacion aprobada el mes pasado no esta "atrasada": esta hecha. El resultado manda
    // sobre el plazo.
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: 'PASSED', overdue: true }))).toBe('TERMINADA');
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: 'COMPLETED', overdue: true }))).toBe('TERMINADA');
  });

  it('REPROBADA es su propio estado, no "sin empezar"', () => {
    // Hay que reprogramarla. Mezclarla con las que solo faltan la esconde justo cuando hay que
    // hacer algo con ella.
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: 'FAILED' }))).toBe('REPROBADA');
  });

  it('sin inscripcion y sin autoservicio, ESPERANDO: no es culpa de la persona', () => {
    // Es la separacion que mas importa para quien administra: "no la ha hecho" frente a "no ha
    // podido hacerla". Lo segundo se arregla programando la jornada, no persiguiendo a nadie.
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: null, puedeAutoinscribirse: false }))).toBe('ESPERANDO');
  });

  it('esperando gana al vencimiento', () => {
    // Reclamar un retraso a quien nunca pudo empezar es la misma acusacion absurda que ya se
    // corrigio en la pantalla del aprendiz.
    expect(
      resolverEstadoEjecucion(caso({ enrollmentStatus: null, puedeAutoinscribirse: false, overdue: true })),
    ).toBe('ESPERANDO');
  });

  it('con la puerta abierta y la fecha pasada, ATRASADA', () => {
    expect(resolverEstadoEjecucion(caso({ overdue: true, puedeAutoinscribirse: true }))).toBe('ATRASADA');
    expect(resolverEstadoEjecucion(caso({ overdue: true, enrollmentStatus: 'ENROLLED' }))).toBe('ATRASADA');
  });

  it('distingue empezada de no empezada', () => {
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: 'IN_PROGRESS' }))).toBe('EN_CURSO');
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: 'ENROLLED' }))).toBe('SIN_EMPEZAR');
    expect(resolverEstadoEjecucion(caso({ enrollmentStatus: null }))).toBe('SIN_EMPEZAR');
  });
});

describe('resumirEjecucion', () => {
  it('cuenta cada estado y calcula el avance', () => {
    const resumen = resumirEjecucion(['TERMINADA', 'TERMINADA', 'EN_CURSO', 'ATRASADA']);

    expect(resumen).toMatchObject({ total: 4, terminadas: 2, enCurso: 1, atrasadas: 1, avancePct: 50 });
  });

  it('las que ESPERAN convocatoria cuentan en el denominador', () => {
    // Sacarlas daria un porcentaje mas bonito y falso: si de cuatro personas dos no han sido
    // convocadas, el avance real es 50%, no 100% sobre las dos que si.
    const resumen = resumirEjecucion(['TERMINADA', 'TERMINADA', 'ESPERANDO', 'ESPERANDO']);

    expect(resumen.avancePct).toBe(50);
    expect(resumen.esperando).toBe(2);
  });

  it('sin nadie asignado no divide por cero', () => {
    expect(resumirEjecucion([])).toMatchObject({ total: 0, avancePct: 0 });
  });
});
