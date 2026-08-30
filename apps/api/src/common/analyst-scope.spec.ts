import { offeringScopeWhere, processScopeWhere, scopeAllows } from './analyst-scope.js';

const SST = '11111111-1111-1111-1111-111111111111';
const PESV = '22222222-2222-2222-2222-222222222222';

describe('alcance del analista', () => {
  describe('sin alcance (Administrador)', () => {
    it('no filtra nada cuando la pantalla tampoco filtra', () => {
      expect(processScopeWhere(null)).toEqual({});
    });

    it('respeta el filtro que pide la pantalla', () => {
      expect(processScopeWhere(null, PESV)).toEqual({ processId: PESV });
    });

    it('ve cualquier proceso', () => {
      expect(scopeAllows(null, PESV)).toBe(true);
    });
  });

  describe('con alcance (Analista)', () => {
    it('acota a sus procesos cuando la pantalla no filtra', () => {
      expect(processScopeWhere([SST], undefined)).toEqual({ processId: { in: [SST] } });
    });

    it('deja pasar el filtro que cae dentro de su alcance', () => {
      expect(processScopeWhere([SST, PESV], PESV)).toEqual({ processId: PESV });
    });

    // El caso que importa: no se ignora el filtro (seria mentirle) ni se lanza 403 (confirmaria
    // que el proceso existe). Se devuelve vacio.
    it('devuelve vacio si pide un proceso ajeno, en vez de caer a lo suyo', () => {
      expect(processScopeWhere([SST], PESV)).toEqual({ processId: { in: [] } });
    });

    it('no ve procesos ajenos en una ficha', () => {
      expect(scopeAllows([SST], PESV)).toBe(false);
      expect(scopeAllows([SST], SST)).toBe(true);
    });
  });

  describe('convocatorias (el proceso cuelga de version → actividad)', () => {
    it('no envuelve nada si no hay filtro que aplicar', () => {
      expect(offeringScopeWhere(null)).toEqual({});
    });

    it('cuelga el filtro del camino correcto', () => {
      expect(offeringScopeWhere([SST])).toEqual({
        activityVersion: { activity: { processId: { in: [SST] } } },
      });
    });
  });
});
