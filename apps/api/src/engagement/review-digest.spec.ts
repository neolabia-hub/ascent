import { redactarAvisoDeRepaso, resumirParaElAvisoDeRepaso, type PreguntaVencida } from './review-digest.js';

function pregunta(tema: string | null, diasAtras: number): PreguntaVencida {
  return { tema, dueAt: new Date(Date.now() - diasAtras * 86_400_000) };
}

describe('resumirParaElAvisoDeRepaso', () => {
  it('agrupa por tema y ordena de mas a menos vencidas', () => {
    const resumen = resumirParaElAvisoDeRepaso([
      pregunta('Seguridad vial', 1),
      pregunta('Seguridad vial', 2),
      pregunta('Seguridad vial', 3),
      pregunta('Manejo defensivo', 1),
    ]);

    expect(resumen.total).toBe(4);
    expect(resumen.porTema).toEqual([
      { tema: 'Seguridad vial', cuantas: 3 },
      { tema: 'Manejo defensivo', cuantas: 1 },
    ]);
  });

  it('en un empate, gana el tema con la pregunta mas antigua', () => {
    const resumen = resumirParaElAvisoDeRepaso([
      pregunta('Reciente', 1),
      pregunta('Antiguo', 10),
    ]);

    expect(resumen.porTema[0]?.tema).toBe('Antiguo');
  });

  it('una pregunta sin tema cuenta en el total pero no en el desglose (Decision #84)', () => {
    const resumen = resumirParaElAvisoDeRepaso([pregunta(null, 1), pregunta(null, 2)]);

    expect(resumen.total).toBe(2);
    expect(resumen.porTema).toEqual([]);
  });

  it('sin preguntas, resumen vacio', () => {
    expect(resumirParaElAvisoDeRepaso([])).toEqual({ total: 0, porTema: [] });
  });
});

describe('redactarAvisoDeRepaso', () => {
  it('con el umbral en 0, nunca avisa (mismo convenio que expirationDigestDays)', () => {
    const resumen = resumirParaElAvisoDeRepaso([pregunta('Tema', 1), pregunta('Tema', 2), pregunta('Tema', 3)]);
    expect(redactarAvisoDeRepaso(resumen, 0)).toBeNull();
  });

  it('por debajo del umbral, no avisa', () => {
    const resumen = resumirParaElAvisoDeRepaso([pregunta('Tema', 1)]);
    expect(redactarAvisoDeRepaso(resumen, 3)).toBeNull();
  });

  it('al llegar al umbral, nombra el tema con mas vencidas', () => {
    const resumen = resumirParaElAvisoDeRepaso([
      pregunta('Seguridad vial', 1),
      pregunta('Seguridad vial', 2),
      pregunta('Seguridad vial', 3),
    ]);
    const aviso = redactarAvisoDeRepaso(resumen, 3);

    expect(aviso?.subject).toContain('Seguridad vial');
    expect(aviso?.body).toContain('Seguridad vial (3)');
  });

  it('con varios temas, el asunto dice el total y el cuerpo el que mas falla', () => {
    const resumen = resumirParaElAvisoDeRepaso([
      pregunta('Seguridad vial', 1),
      pregunta('Seguridad vial', 2),
      pregunta('Manejo defensivo', 1),
    ]);
    const aviso = redactarAvisoDeRepaso(resumen, 3);

    expect(aviso?.subject).toBe('3 preguntas esperando repaso, la mayoría de Seguridad vial');
    expect(aviso?.body).toContain('Seguridad vial (2)');
  });

  it('sin ningun tema, avisa igual sin fingir un desglose', () => {
    const resumen = resumirParaElAvisoDeRepaso([pregunta(null, 1), pregunta(null, 2), pregunta(null, 3)]);
    const aviso = redactarAvisoDeRepaso(resumen, 3);

    expect(aviso?.subject).toBe('3 preguntas esperando repaso');
    expect(aviso?.body).not.toContain('null');
  });

  it('una sola pregunta usa singular', () => {
    const resumen = resumirParaElAvisoDeRepaso([pregunta('Tema', 1)]);
    const aviso = redactarAvisoDeRepaso(resumen, 1);

    expect(aviso?.subject).toBe('1 pregunta de Tema esperando repaso');
  });
});
