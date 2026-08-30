import { manifestHasSlide, parentPresentationKey, safeTempName, slideKey } from './slide-storage.js';

const SOURCE = 'tenant-1/presentation/2026/08/induccion-arl.pdf';

describe('slideKey (donde se guarda cada diapositiva)', () => {
  it('cuelga de la clave del original y rellena a tres cifras para que ordene bien', () => {
    expect(slideKey(SOURCE, 1)).toBe(`${SOURCE}.slides/001.webp`);
    expect(slideKey(SOURCE, 24)).toBe(`${SOURCE}.slides/024.webp`);
    // Sin relleno, "10" iria antes que "2" en cualquier listado del almacenamiento.
    expect([slideKey(SOURCE, 10), slideKey(SOURCE, 2)].sort()).toEqual([slideKey(SOURCE, 2), slideKey(SOURCE, 10)]);
  });

  it('no se rompe con una presentacion de tres cifras', () => {
    expect(slideKey(SOURCE, 150)).toBe(`${SOURCE}.slides/150.webp`);
  });
});

describe('parentPresentationKey (de que presentacion es esta imagen)', () => {
  it('devuelve la clave del original', () => {
    expect(parentPresentationKey(slideKey(SOURCE, 3))).toBe(SOURCE);
  });

  it('la clave de un archivo normal no es la de una diapositiva', () => {
    expect(parentPresentationKey('tenant-1/document/2026/08/manual.pdf')).toBeNull();
  });

  it('corta por la PRIMERA aparicion: un original que lleve el separador en el nombre sigue siendo el padre', () => {
    const raro = 'tenant-1/presentation/2026/08/copia.slides/resumen.pdf';
    expect(parentPresentationKey(`${raro}.slides/002.webp`)).toBe('tenant-1/presentation/2026/08/copia');
  });

  it('una clave que empieza por el separador no tiene padre', () => {
    expect(parentPresentationKey('.slides/001.webp')).toBeNull();
  });
});

describe('manifestHasSlide (que se puede servir con una firma valida)', () => {
  const manifest = { slides: [{ index: 1, key: slideKey(SOURCE, 1) }, { index: 2, key: slideKey(SOURCE, 2) }] };

  it('sirve una diapositiva que figura en el manifiesto', () => {
    expect(manifestHasSlide(manifest, slideKey(SOURCE, 2))).toBe(true);
  });

  it('RECHAZA una clave inventada bajo la carpeta de una presentacion valida', () => {
    expect(manifestHasSlide(manifest, `${SOURCE}.slides/099.webp`)).toBe(false);
    expect(manifestHasSlide(manifest, `${SOURCE}.slides/../../otro-tenant/nomina.xlsx`)).toBe(false);
  });

  it('un manifiesto ausente, nulo o con otra forma no autoriza nada', () => {
    expect(manifestHasSlide(null, slideKey(SOURCE, 1))).toBe(false);
    expect(manifestHasSlide({}, slideKey(SOURCE, 1))).toBe(false);
    expect(manifestHasSlide({ slides: 'unas cuantas' }, slideKey(SOURCE, 1))).toBe(false);
    expect(manifestHasSlide({ slides: [null] }, slideKey(SOURCE, 1))).toBe(false);
  });
});

describe('safeTempName (el nombre que recibe LibreOffice como argumento)', () => {
  it('conserva la extension, que es lo que decide la conversion', () => {
    expect(safeTempName('Induccion ARL 2026.pptx')).toBe('induccion-arl-2026.pptx');
  });

  it('no deja pasar separadores de ruta ni comillas', () => {
    expect(safeTempName('../../etc/passwd.pptx')).not.toContain('/');
    expect(safeTempName('a"; rm -rf /; echo ".pptx')).toMatch(/^[a-z0-9._-]+$/);
  });

  it('un nombre que se queda en nada recibe uno propio', () => {
    expect(safeTempName('.pdf')).toBe('entrada-.pdf');
  });
});
