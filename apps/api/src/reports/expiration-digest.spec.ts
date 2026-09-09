import { dentroDelAviso, redactarAviso, resumirParaElAviso } from './expiration-digest.js';
import type { HechoVencimiento } from './expirations.js';

const HOY = new Date('2026-09-08T12:00:00Z');

function hecho(fecha: string, clase: 'REPROGRAMAR' | 'PERSEGUIR' = 'REPROGRAMAR'): HechoVencimiento {
  return {
    clase,
    fuente: clase === 'PERSEGUIR' ? 'OBLIGACION_ABIERTA' : 'PAPEL_DE_TERCERO',
    fecha: new Date(fecha),
    personaId: 'u1',
    personaNombre: 'Conductora de la regional',
    documento: '123',
    area: null,
    cargo: null,
    regional: null,
    formacion: 'Trabajo en alturas',
    actividadId: 'a1',
  };
}

describe('que entra en el aviso', () => {
  it('lo que vence dentro del plazo', () => {
    expect(dentroDelAviso(hecho('2026-09-20T00:00:00Z'), HOY, 30)).toBe(true);
  });

  it('lo de mas alla no: existe, pero no es de esta semana', () => {
    expect(dentroDelAviso(hecho('2026-12-20T00:00:00Z'), HOY, 30)).toBe(false);
  });

  it('lo YA vencido entra siempre, sea de cuando sea', () => {
    // Es lo unico que ya se cayo. Dejarlo fuera por antiguo seria esconder justo lo urgente.
    expect(dentroDelAviso(hecho('2025-01-01T00:00:00Z'), HOY, 30)).toBe(true);
  });
});

describe('el resumen del aviso', () => {
  it('cuenta las dos clases por separado y no las suma en una sola cifra', () => {
    const resumen = resumirParaElAviso(
      [hecho('2026-09-20T00:00:00Z'), hecho('2026-09-25T00:00:00Z', 'PERSEGUIR')],
      HOY,
      30,
    );

    expect(resumen.reprogramar).toBe(1);
    expect(resumen.perseguir).toBe(1);
    expect(resumen.total).toBe(2);
  });

  it('lo vencido cuenta aparte, y ademas en su clase', () => {
    const resumen = resumirParaElAviso([hecho('2026-08-01T00:00:00Z')], HOY, 30);

    expect(resumen.vencido).toBe(1);
    expect(resumen.reprogramar).toBe(1);
    expect(resumen.total).toBe(1);
  });

  it('lo de mas alla del plazo no entra en ninguna cuenta', () => {
    const resumen = resumirParaElAviso([hecho('2027-05-01T00:00:00Z')], HOY, 30);

    expect(resumen.total).toBe(0);
  });
});

describe('el texto del aviso', () => {
  it('cuando no hay nada, no se manda nada', () => {
    // Un aviso semanal que llega igual cuando no vence nada se convierte en ruido en tres semanas.
    expect(redactarAviso({ vencido: 0, reprogramar: 0, perseguir: 0, total: 0 }, 30)).toBeNull();
  });

  it('lo vencido manda en el titulo: es sobre lo que hay que actuar hoy', () => {
    const aviso = redactarAviso({ vencido: 2, reprogramar: 3, perseguir: 1, total: 4 }, 30);

    expect(aviso?.subject).toBe('2 acreditaciones vencidas y 2 por vencer');
  });

  it('sin nada vencido, el titulo habla del plazo', () => {
    const aviso = redactarAviso({ vencido: 0, reprogramar: 1, perseguir: 0, total: 1 }, 45);

    expect(aviso?.subject).toBe('1 vencimiento en los próximos 45 días');
  });

  it('el cuerpo dice los dos trabajos, no la suma', () => {
    const aviso = redactarAviso({ vencido: 0, reprogramar: 2, perseguir: 3, total: 5 }, 30);

    expect(aviso?.body).toContain('2 formaciones por volver a convocar');
    expect(aviso?.body).toContain('3 personas que nunca la han hecho');
    expect(aviso?.body).toContain('Reportes → Vencimientos');
  });

  it('con una sola clase no deja el separador colgando', () => {
    const aviso = redactarAviso({ vencido: 0, reprogramar: 0, perseguir: 1, total: 1 }, 30);

    expect(aviso?.body).toBe('1 persona que nunca la ha hecho. Están en Reportes → Vencimientos, con nombre y fecha.');
  });

  it('los singulares se escriben en singular', () => {
    const aviso = redactarAviso({ vencido: 1, reprogramar: 1, perseguir: 0, total: 1 }, 30);

    expect(aviso?.subject).toBe('1 acreditación vencida');
    expect(aviso?.body).toContain('1 formación por volver a convocar');
  });

  it('si TODO lo que hay ya se cayo, el titulo no promete un "por vencer" que es cero', () => {
    const aviso = redactarAviso({ vencido: 3, reprogramar: 3, perseguir: 0, total: 3 }, 30);

    expect(aviso?.subject).toBe('3 acreditaciones vencidas');
  });
});
