import { meetsCompletion, mergeProgressData, readLastCard, resolveMinWatchPct } from './progress-rules.js';

describe('meetsCompletion (cuando una pieza cuenta como cumplida)', () => {
  it('un VIDEO se da por visto con el 90% por defecto: los creditos no son el contenido', () => {
    expect(meetsCompletion('VIDEO', null, 90, 0)).toBe(true);
    expect(meetsCompletion('VIDEO', null, 89, 0)).toBe(false);
  });

  it('el minimo del video lo puede subir la EMPRESA cuando la formacion no dice nada', () => {
    expect(meetsCompletion('VIDEO', null, 95, 0, 100)).toBe(false);
    expect(meetsCompletion('VIDEO', null, 100, 0, 100)).toBe(true);
  });

  it('la formacion manda sobre la empresa', () => {
    // La empresa exige el video entero; esta formacion se conforma con el 70.
    expect(meetsCompletion('VIDEO', { minWatchPct: 70 }, 70, 0, 100)).toBe(true);
  });

  it('el umbral del video se puede subir por formacion', () => {
    expect(meetsCompletion('VIDEO', { minWatchPct: 100 }, 95, 0)).toBe(false);
    expect(meetsCompletion('VIDEO', { minWatchPct: 100 }, 100, 0)).toBe(true);
  });

  it('una PRESENTACION exige verlas TODAS: no hay barra que arrastrar, saltarse la mitad es no verla', () => {
    expect(meetsCompletion('PRESENTATION', null, 99, 600)).toBe(false);
    expect(meetsCompletion('PRESENTATION', null, 100, 0)).toBe(true);
  });

  it('una PRESENTACION con tiempo minimo no se cierra a golpe de siguiente', () => {
    expect(meetsCompletion('PRESENTATION', { minSeconds: 120 }, 100, 119)).toBe(false);
    expect(meetsCompletion('PRESENTATION', { minSeconds: 120 }, 100, 120)).toBe(true);
  });

  it('a una PRESENTACION no se le aplica el umbral del video aunque se lo pongan en la config', () => {
    expect(meetsCompletion('PRESENTATION', { minWatchPct: 60 }, 60, 0)).toBe(false);
  });

  it('una LECCION o un DOCUMENTO se completan enteros, con su tiempo minimo si lo hay', () => {
    expect(meetsCompletion('LESSON', { minSeconds: 30 }, 100, 29)).toBe(false);
    expect(meetsCompletion('LESSON', { minSeconds: 30 }, 100, 30)).toBe(true);
    expect(meetsCompletion('DOCUMENT', null, 100, 0)).toBe(true);
  });

  it('una config corrupta no rompe: se cae al criterio de siempre', () => {
    expect(meetsCompletion('LESSON', 'no es un objeto', 100, 0)).toBe(true);
  });
});

describe('resolveMinWatchPct (cascada formacion -> empresa -> plataforma)', () => {
  it('sin nada en la formacion, manda el valor de la empresa', () => {
    expect(resolveMinWatchPct(null, 80)).toBe(80);
    expect(resolveMinWatchPct({}, 100)).toBe(100);
  });

  it('lo que diga la formacion gana', () => {
    expect(resolveMinWatchPct({ minWatchPct: 75 }, 100)).toBe(75);
  });

  it('un valor imposible en la formacion se ignora en vez de dar por visto un video vacio', () => {
    expect(resolveMinWatchPct({ minWatchPct: 0 }, 90)).toBe(90);
    expect(resolveMinWatchPct({ minWatchPct: 140 }, 90)).toBe(90);
    expect(resolveMinWatchPct({ minWatchPct: 'casi todo' }, 90)).toBe(90);
  });
});

describe('mergeProgressData (que queda escrito del avance)', () => {
  it('un envio sin lastCardIndex NO borra por donde iba la persona', () => {
    expect(mergeProgressData({ lastCardIndex: 7 }, {})).toEqual({ lastCardIndex: 7 });
  });

  it('el envio nuevo manda cuando trae la tarjeta', () => {
    expect(mergeProgressData({ lastCardIndex: 7 }, { lastCardIndex: 9 })).toEqual({ lastCardIndex: 9 });
  });

  it('sin nada previo empieza en cero', () => {
    expect(mergeProgressData(null, {})).toEqual({ lastCardIndex: 0 });
  });

  it('una DECLARACION no asciende a MEDIDA por un envio posterior (Decision #46)', () => {
    expect(mergeProgressData({ lastCardIndex: 0, evidence: 'DECLARED' }, { evidence: 'MEASURED' })).toEqual({
      lastCardIndex: 0,
      evidence: 'DECLARED',
    });
  });

  it('una MEDIDA si baja a DECLARADA: se conserva la peor forma, no la primera', () => {
    expect(mergeProgressData({ lastCardIndex: 0, evidence: 'MEASURED' }, { evidence: 'DECLARED' })).toEqual({
      lastCardIndex: 0,
      evidence: 'DECLARED',
    });
  });

  it('la evidencia previa sobrevive a un envio que no la trae', () => {
    expect(mergeProgressData({ lastCardIndex: 3, evidence: 'MEASURED' }, { lastCardIndex: 4 })).toEqual({
      lastCardIndex: 4,
      evidence: 'MEASURED',
    });
  });

  it('un valor de evidencia que no es ninguno de los dos no se guarda', () => {
    expect(mergeProgressData({ evidence: 'INVENTADO' }, {})).toEqual({ lastCardIndex: 0 });
  });
});

describe('readLastCard', () => {
  it('tolera un data vacio, nulo o con basura', () => {
    expect(readLastCard(null)).toBe(0);
    expect(readLastCard({})).toBe(0);
    expect(readLastCard({ lastCardIndex: 'cuatro' })).toBe(0);
    expect(readLastCard({ lastCardIndex: 4 })).toBe(4);
  });
});
