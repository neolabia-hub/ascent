import type { SurveyQuestion } from '@neo-pulse/shared';
import { calificarEncuesta, loQueFalta } from './survey-grading.js';

/**
 * La presentacion (`display`, `scaleMax`) no influye en la calificacion: una escala respondida con
 * estrellas y otra con caras guardan el mismo numero y se promedian juntas. Por eso las pruebas
 * usan siempre los mismos valores y no los varian: variarlos no probaria nada.
 */
const COMO: Pick<SurveyQuestion, 'display' | 'scaleMax' | 'options'> = { display: 'faces', scaleMax: 5, options: [] };

const ESCALAS: SurveyQuestion[] = [
  { id: 'a', text: 'Contenido claro', kind: 'SCALE', required: true, ...COMO },
  { id: 'b', text: 'Me sirve', kind: 'SCALE', required: true, ...COMO },
];
const EFICACIA: SurveyQuestion[] = [
  { id: 'aplica', text: 'Aplica lo aprendido', kind: 'YES_NO', required: true, ...COMO },
  { id: 'desempeno', text: 'Mejoro su desempeno', kind: 'SCALE', required: true, ...COMO },
  { id: 'refuerzo', text: 'En que necesita refuerzo', kind: 'TEXT', required: false, ...COMO },
];

describe('calificarEncuesta', () => {
  it('promedia las escalas y aprueba a partir de 3', () => {
    expect(calificarEncuesta(ESCALAS, { a: 4, b: 5 })).toBe('POSITIVE');
    expect(calificarEncuesta(ESCALAS, { a: 3, b: 3 })).toBe('POSITIVE');
  });

  it('menos de 3 es negativo: "regular" no es haber cumplido', () => {
    // El corte NO esta en la mitad exacta (2.5) a proposito: con 2.5 todo lo mediocre saldria
    // aprobado, y lo mediocre es justo lo que hay que detectar.
    expect(calificarEncuesta(ESCALAS, { a: 2, b: 3 })).toBe('NEGATIVE');
  });

  it('UN "no" manda sobre un promedio alto', () => {
    // El jefe dice que NO aplica lo aprendido pero puntua 5 el desempeno porque la clase estuvo
    // bien. Lo que se mide es la transferencia al puesto: eso es un negativo, y con el promedio
    // mandando saldria positivo y nadie reforzaria nada.
    expect(calificarEncuesta(EFICACIA, { aplica: false, desempeno: 5 })).toBe('NEGATIVE');
  });

  it('un "si" sin escalas tambien es positivo', () => {
    const soloBinaria: SurveyQuestion[] = [EFICACIA[0] as SurveyQuestion];

    expect(calificarEncuesta(soloBinaria, { aplica: true })).toBe('POSITIVE');
  });

  it('sin nada medible es NA, no positivo', () => {
    // Un indicador que cuenta los NA como buenos miente.
    const soloTexto: SurveyQuestion[] = [{ id: 't', text: 'Comentarios', kind: 'TEXT', required: false, ...COMO }];

    expect(calificarEncuesta(soloTexto, { t: 'todo bien' })).toBe('NA');
    expect(calificarEncuesta(ESCALAS, {})).toBe('NA');
  });

  it('ignora las escalas fuera de rango en vez de contarlas como cero', () => {
    // Un cero inventado hunde la media y produciria refuerzos que nadie necesita.
    expect(calificarEncuesta(ESCALAS, { a: 4, b: 99 })).toBe('POSITIVE');
    expect(calificarEncuesta(ESCALAS, { a: 4, b: 'cinco' })).toBe('POSITIVE');
  });

  it('el texto no influye en el resultado', () => {
    expect(calificarEncuesta(EFICACIA, { aplica: true, desempeno: 4, refuerzo: 'nada' })).toBe('POSITIVE');
  });
});

describe('loQueFalta', () => {
  it('nombra las obligatorias sin responder, con su texto', () => {
    // Con su texto y no con su id: quien lo lee es quien esta respondiendo, no quien programo.
    expect(loQueFalta(ESCALAS, { a: 4 })).toEqual(['Me sirve']);
  });

  it('las opcionales nunca faltan', () => {
    expect(loQueFalta(EFICACIA, { aplica: true, desempeno: 3 })).toEqual([]);
  });

  it('una escala fuera de rango cuenta como no respondida', () => {
    expect(loQueFalta(ESCALAS, { a: 4, b: 9 })).toEqual(['Me sirve']);
  });

  it('un binario que no es booleano cuenta como no respondido', () => {
    // "si" en texto no es una respuesta: se guardaria y no se podria calificar.
    expect(loQueFalta(EFICACIA, { aplica: 'si', desempeno: 4 })).toEqual(['Aplica lo aprendido']);
  });

  it('la cadena vacia no cuenta como respuesta', () => {
    expect(loQueFalta(ESCALAS, { a: '', b: 4 })).toEqual(['Contenido claro']);
  });
});
