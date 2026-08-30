import { withDescendants } from './permission.service.js';

/**
 * El arbol de areas es lo que separa "la jefatura de SGI ve todo lo suyo" de "cada responsable ve
 * solo su proceso" (Decision #57). Se prueba aparte porque es la unica logica del alcance que no
 * es una consulta: lo demas lo decide la base de datos.
 */
describe('areas alcanzadas por un alcance', () => {
  const SGI = 'sgi';
  const SGI_DOC = 'sgi-documental';
  const SGI_DOC_HIJA = 'sgi-documental-hija';
  const LOGISTICA = 'logistica';

  const AREAS = [
    { id: SGI, parentId: null },
    { id: SGI_DOC, parentId: SGI },
    { id: SGI_DOC_HIJA, parentId: SGI_DOC },
    { id: LOGISTICA, parentId: null },
  ];

  it('incluye la propia area', () => {
    expect(withDescendants(AREAS, [LOGISTICA])).toEqual(new Set([LOGISTICA]));
  });

  it('baja por todo el arbol, no solo un nivel', () => {
    expect(withDescendants(AREAS, [SGI])).toEqual(new Set([SGI, SGI_DOC, SGI_DOC_HIJA]));
  });

  it('no sube: la subarea no alcanza a su padre', () => {
    expect(withDescendants(AREAS, [SGI_DOC])).toEqual(new Set([SGI_DOC, SGI_DOC_HIJA]));
  });

  it('no se lleva por delante las areas hermanas', () => {
    expect(withDescendants(AREAS, [SGI]).has(LOGISTICA)).toBe(false);
  });

  it('acumula varias raices', () => {
    expect(withDescendants(AREAS, [SGI_DOC, LOGISTICA])).toEqual(
      new Set([SGI_DOC, SGI_DOC_HIJA, LOGISTICA]),
    );
  });

  // Un padre mal capturado no puede colgar la aplicacion entera: el recorrido para cuando el
  // conjunto deja de crecer, asi que un ciclo termina igual.
  it('sobrevive a un ciclo en los datos', () => {
    const ciclo = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(withDescendants(ciclo, ['a'])).toEqual(new Set(['a', 'b']));
  });

  it('sin alcance no alcanza nada', () => {
    expect(withDescendants(AREAS, [])).toEqual(new Set());
  });
});
