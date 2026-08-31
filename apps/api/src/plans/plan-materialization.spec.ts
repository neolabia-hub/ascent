import { repartirObligaciones, type ObligacionExistente } from './plan-materialization.js';

const RENGLON = 'item-marzo';
const OTRO_RENGLON = 'item-junio';

function obligacion(userId: string, planItemId: string | null = null, id = `a-${userId}`): ObligacionExistente {
  return { id, userId, planItemId };
}

describe('repartirObligaciones', () => {
  it('sin nada previo, se crean todas: es una jornada para gente que no estaba obligada', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana', 'beto'], []);
    expect(reparto).toEqual({ adoptar: [], crear: ['ana', 'beto'], yaContadas: 0 });
  });

  /**
   * EL CASO NORMAL, y el que estaba roto: Quienes creo la obligacion y el plan derivo a quien
   * obligar precisamente de ahi, asi que se encontraba con las suyas ya creadas y hacia una
   * segunda. Ahora la adopta.
   */
  it('si ya tienen la obligacion del requisito, se ADOPTA y no se crea una segunda', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana', 'beto'], [
      obligacion('ana', null, 'a-1'),
      obligacion('beto', null, 'a-2'),
    ]);
    expect(reparto.adoptar).toEqual(['a-1', 'a-2']);
    expect(reparto.crear).toEqual([]);
  });

  it('mezcla: se adopta a quien la tiene y se crea a quien no', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana', 'beto'], [obligacion('ana', null, 'a-1')]);
    expect(reparto.adoptar).toEqual(['a-1']);
    expect(reparto.crear).toEqual(['beto']);
  });

  it('aprobar dos veces no cuenta a nadie dos veces', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana'], [obligacion('ana', RENGLON, 'a-1')]);
    expect(reparto).toEqual({ adoptar: [], crear: [], yaContadas: 1 });
  });

  /**
   * Dos jornadas del mismo plan sobre la misma formacion no pueden contar a la misma persona dos
   * veces: es el mismo error que dejaba 40 obligados como 80 proyectados (Decision #68), solo que
   * por el lado del numerador.
   */
  it('a quien ya cuenta OTRO renglon del plan no se le toca', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana', 'beto'], [
      obligacion('ana', OTRO_RENGLON, 'a-1'),
      obligacion('beto', null, 'a-2'),
    ]);
    expect(reparto.adoptar).toEqual(['a-2']);
    expect(reparto.crear).toEqual([]);
    expect(reparto.yaContadas).toBe(1);
  });

  it('con varias obligaciones sin sello se adopta UNA, la primera', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana'], [
      obligacion('ana', null, 'a-vieja'),
      obligacion('ana', null, 'a-nueva'),
    ]);
    expect(reparto.adoptar).toEqual(['a-vieja']);
    expect(reparto.crear).toEqual([]);
  });

  it('si una de las suyas ya tiene sello, manda el sello aunque haya otra sin el', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana'], [
      obligacion('ana', null, 'a-sin-sello'),
      obligacion('ana', OTRO_RENGLON, 'a-con-sello'),
    ]);
    expect(reparto.adoptar).toEqual([]);
    expect(reparto.crear).toEqual([]);
    expect(reparto.yaContadas).toBe(1);
  });

  it('un proyectado repetido no produce dos acciones', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana', 'ana'], []);
    expect(reparto.crear).toEqual(['ana']);
  });

  it('las obligaciones de OTRA gente no se cuelan', () => {
    const reparto = repartirObligaciones(RENGLON, ['ana'], [obligacion('carlos', null, 'a-9')]);
    expect(reparto.adoptar).toEqual([]);
    expect(reparto.crear).toEqual(['ana']);
  });
});
