import { cadenaDesde, resolverEvaluador, type AreaEnCadena } from './efficacy-evaluator.js';

const LOGISTICA: AreaEnCadena = { id: 'log', responsibleUserId: 'jefe-log', parentId: null };
const BODEGA: AreaEnCadena = { id: 'bod', responsibleUserId: null, parentId: 'log' };

describe('resolverEvaluador', () => {
  it('manda el jefe del AREA de la persona, no el dueno del proceso', () => {
    // El dueno del proceso (SST) sabe del tema pero no ve trabajar a nadie: si evaluara, tendria
    // que decir de 600 personas si aplican lo aprendido sin haber visto ni un turno.
    const evaluador = resolverEvaluador({
      personaId: 'conductor',
      cadenaDeAreas: [{ id: 'op', responsibleUserId: 'jefe-op', parentId: null }],
      responsableDelProcesoId: 'coordinador-sst',
    });

    expect(evaluador).toEqual({ userId: 'jefe-op', origen: 'AREA' });
  });

  it('sube por el arbol cuando el area no tiene jefe propio', () => {
    // "Bodega" cuelga de "Logistica": el jefe de Logistica si ve trabajar a la gente de Bodega.
    const evaluador = resolverEvaluador({
      personaId: 'auxiliar',
      cadenaDeAreas: [BODEGA, LOGISTICA],
      responsableDelProcesoId: 'coordinador-sst',
    });

    expect(evaluador).toEqual({ userId: 'jefe-log', origen: 'AREA_SUPERIOR' });
  });

  it('cae al dueno del proceso solo si ningun area tiene responsable', () => {
    // Es el respaldo, no la primera opcion: al menos conoce el tema y puede pedir la informacion.
    const evaluador = resolverEvaluador({
      personaId: 'conductor',
      cadenaDeAreas: [{ id: 'op', responsibleUserId: null, parentId: null }],
      responsableDelProcesoId: 'coordinador-sst',
    });

    expect(evaluador).toEqual({ userId: 'coordinador-sst', origen: 'PROCESO' });
  });

  it('nadie se evalua a si mismo: sube un nivel', () => {
    // El jefe de Bodega tambien hace sus formaciones, y su area lo tiene a el como responsable.
    const evaluador = resolverEvaluador({
      personaId: 'jefe-bod',
      cadenaDeAreas: [{ id: 'bod', responsibleUserId: 'jefe-bod', parentId: 'log' }, LOGISTICA],
      responsableDelProcesoId: null,
    });

    expect(evaluador).toEqual({ userId: 'jefe-log', origen: 'AREA_SUPERIOR' });
  });

  it('tampoco se evalua a si mismo por la via del proceso', () => {
    const evaluador = resolverEvaluador({
      personaId: 'coordinador-sst',
      cadenaDeAreas: [{ id: 'sgi', responsibleUserId: null, parentId: null }],
      responsableDelProcesoId: 'coordinador-sst',
    });

    expect(evaluador).toBeNull();
  });

  it('devuelve null cuando no hay a quien preguntar', () => {
    // Estado legitimo y visible: mejor no programar la encuesta que mandarsela a alguien que no
    // puede responderla con criterio.
    const evaluador = resolverEvaluador({
      personaId: 'conductor',
      cadenaDeAreas: [{ id: 'op', responsibleUserId: null, parentId: null }],
      responsableDelProcesoId: null,
    });

    expect(evaluador).toBeNull();
  });
});

describe('cadenaDesde', () => {
  it('ordena desde el area de la persona hacia arriba', () => {
    expect(cadenaDesde('bod', [LOGISTICA, BODEGA]).map((a) => a.id)).toEqual(['bod', 'log']);
  });

  it('no se cuelga con un arbol ciclico', () => {
    // Un arbol mal armado a mano no puede dejar el servidor en un bucle infinito.
    const a: AreaEnCadena = { id: 'a', responsibleUserId: null, parentId: 'b' };
    const b: AreaEnCadena = { id: 'b', responsibleUserId: null, parentId: 'a' };

    expect(cadenaDesde('a', [a, b]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('un area que no existe da una cadena vacia', () => {
    expect(cadenaDesde('fantasma', [LOGISTICA])).toEqual([]);
  });
});
