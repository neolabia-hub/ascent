import {
  inscripcionDeCadaRonda,
  resolverEstadoEjecucion,
  resumirEjecucion,
  type EntradaDeEstado,
} from './execution-state.js';

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

  it('la ronda cerrada sin hacerse es NO_REALIZADA, no "sin empezar"', () => {
    // Es la mitad que faltaba de la Decision #142: el motor escribia EXPIRED_NOT_DONE y el informe
    // lo leia como "todavia no la ha empezado", que dice justo lo contrario. Encontrado de punta a
    // punta el 2026-09-04 con `scripts/recorridos/reinduccion-ciclos.mjs`.
    expect(resolverEstadoEjecucion(caso({ assignmentStatus: 'EXPIRED_NOT_DONE' }))).toBe('NO_REALIZADA');
  });

  it('la eximida es su propio estado', () => {
    // Tiene un motivo escrito que el auditor puede leer: no es trabajo pendiente de nadie.
    expect(resolverEstadoEjecucion(caso({ assignmentStatus: 'WAIVED' }))).toBe('EXIMIDA');
  });

  it('el RESULTADO manda sobre los dos estados terminales', () => {
    // Si alcanzo a aprobarla, esta hecha aunque despues alguien la eximiera o cerrara el periodo.
    expect(resolverEstadoEjecucion(caso({ assignmentStatus: 'WAIVED', enrollmentStatus: 'PASSED' }))).toBe('TERMINADA');
    expect(
      resolverEstadoEjecucion(caso({ assignmentStatus: 'EXPIRED_NOT_DONE', enrollmentStatus: 'PASSED' })),
    ).toBe('TERMINADA');
  });

  it('lo cerrado gana a la convocatoria y al plazo', () => {
    // Preguntar si puede inscribirse a algo que ya cerro no significa nada: no hay nada que hacer.
    expect(
      resolverEstadoEjecucion(
        caso({ assignmentStatus: 'EXPIRED_NOT_DONE', puedeAutoinscribirse: false, overdue: true }),
      ),
    ).toBe('NO_REALIZADA');
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

  it('la NO REALIZADA si cuenta en el denominador: es el incumplimiento', () => {
    const resumen = resumirEjecucion(['TERMINADA', 'NO_REALIZADA']);

    expect(resumen.noRealizadas).toBe(1);
    expect(resumen.avancePct).toBe(50);
  });

  it('la EXIMIDA sale del denominador, para que el indicador no tenga techo', () => {
    // Con la eximida dentro, eximir a una de cuatro haria imposible pasar del 75% aunque las tres
    // restantes la hicieran: se castigaria una decision legitima y escrita.
    const resumen = resumirEjecucion(['TERMINADA', 'TERMINADA', 'TERMINADA', 'EXIMIDA']);

    expect(resumen.eximidas).toBe(1);
    expect(resumen.total).toBe(4);
    expect(resumen.avancePct).toBe(100);
  });

  it('sin nadie asignado no divide por cero', () => {
    expect(resumirEjecucion([])).toMatchObject({ total: 0, avancePct: 0 });
  });

  it('con todas eximidas tampoco divide por cero', () => {
    expect(resumirEjecucion(['EXIMIDA', 'EXIMIDA'])).toMatchObject({ total: 2, eximidas: 2, avancePct: 0 });
  });
});

/**
 * QUE EJECUCION DESCRIBE A CADA RONDA.
 *
 * El informe cogia la inscripcion MAS RECIENTE de cada persona y la aplicaba a todas sus filas.
 * Como `resolverEstadoEjecucion` pregunta primero por el resultado, quien completo la ronda 1
 * salia con la ronda 2 tambien como TERMINADA. Medido: 5 obligaciones, 3 pendientes de verdad, y
 * el informe decia 4 terminadas.
 */
describe('la inscripcion se pega a su RONDA, no a la persona', () => {
  const ronda1 = { id: 'a1', completedEnrollmentId: 'e1' };
  const ronda2 = { id: 'a2', completedEnrollmentId: null };
  const hecha = { id: 'e1', assignmentId: 'a1', status: 'COMPLETED' as const };

  it('la que CERRO la ronda 1 solo describe a la ronda 1', () => {
    const mapa = inscripcionDeCadaRonda([ronda1, ronda2], [hecha]);
    expect(mapa.get('a1')).toBe(hecha);
    expect(mapa.get('a2')).toBeUndefined();
  });

  it('y por eso la ronda 2 NO se lee como terminada', () => {
    const mapa = inscripcionDeCadaRonda([ronda1, ronda2], [hecha]);
    const estadoDe = (id: string, overdue = false) =>
      resolverEstadoEjecucion({
        overdue,
        assignmentStatus: 'PENDING',
        enrollmentStatus: mapa.get(id)?.status ?? null,
        puedeAutoinscribirse: true,
      });
    expect(estadoDe('a1')).toBe('TERMINADA');
    expect(estadoDe('a2')).toBe('SIN_EMPEZAR');
  });

  it('la inscripcion abierta PARA una ronda la describe aunque no la haya cerrado', () => {
    const enCurso = { id: 'e2', assignmentId: 'a2', status: 'IN_PROGRESS' as const };
    const mapa = inscripcionDeCadaRonda([ronda1, ronda2], [hecha, enCurso]);
    expect(mapa.get('a2')).toBe(enCurso);
  });

  it('y una ejecucion sin obligacion no colorea ninguna fila: no responde por ese requisito', () => {
    const suelta = { id: 'e9', assignmentId: null, status: 'COMPLETED' as const };
    const mapa = inscripcionDeCadaRonda([ronda2], [suelta]);
    expect(mapa.size).toBe(0);
  });

  it('el enlace de CIERRE gana sobre el de apertura: es la respuesta directa', () => {
    // La misma inscripcion abierta para la ronda 2 pero que acabo cerrando la 1 (caso raro, pero
    // el orden tiene que ser deliberado y no depender de en que bucle caiga primero).
    const rara = { id: 'e3', assignmentId: 'a2', status: 'COMPLETED' as const };
    const mapa = inscripcionDeCadaRonda([{ id: 'a1', completedEnrollmentId: 'e3' }], [rara]);
    expect(mapa.get('a1')).toBe(rara);
  });
});
