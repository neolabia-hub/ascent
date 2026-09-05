import { agrupar, type HechoAnalitica } from './analytics.js';
import { calendario, resumir, type HechoVencimiento } from './expirations.js';

function hecho(parcial: Partial<HechoAnalitica>): HechoAnalitica {
  return {
    estado: 'TERMINADA',
    area: null,
    cargo: null,
    regional: null,
    servicio: null,
    proceso: null,
    tipo: null,
    normas: [],
    ...parcial,
  };
}

const CARIBE = { id: 'r1', name: 'Caribe' };
const ANDINA = { id: 'r2', name: 'Andina' };

describe('agrupar', () => {
  it('agrupa por la dimension pedida y resume cada grupo', () => {
    const resultado = agrupar(
      [
        hecho({ regional: CARIBE, estado: 'TERMINADA' }),
        hecho({ regional: CARIBE, estado: 'ATRASADA' }),
        hecho({ regional: ANDINA, estado: 'TERMINADA' }),
      ],
      'regional',
    );

    expect(resultado.grupos).toHaveLength(2);
    // Primero lo que hay que mirar: Caribe tiene una atrasada, Andina ninguna.
    expect(resultado.grupos[0]?.label).toBe('Caribe');
    expect(resultado.grupos[0]?.resumen.avancePct).toBe(50);
    expect(resultado.grupos[1]?.label).toBe('Andina');
    expect(resultado.resumen.total).toBe(3);
  });

  it('lo que no tiene valor se agrupa aparte, no se descarta', () => {
    // Si desapareciera, el total del informe dejaria de cuadrar con el del seguimiento; y "sin
    // regional" suele significar que faltan datos por cargar, que es un hallazgo en si mismo.
    const resultado = agrupar([hecho({ regional: CARIBE }), hecho({ regional: null })], 'regional');

    expect(resultado.grupos.map((g) => g.label)).toContain('Sin regional');
    expect(resultado.resumen.total).toBe(2);
  });

  it('una formacion con dos normas cuenta en las dos, y se avisa', () => {
    const sst = { id: 'n1', name: 'SST' };
    const basc = { id: 'n2', name: 'BASC' };
    const resultado = agrupar([hecho({ normas: [sst, basc] }), hecho({ normas: [sst] })], 'norma');

    expect(resultado.grupos.find((g) => g.label === 'SST')?.resumen.total).toBe(2);
    expect(resultado.grupos.find((g) => g.label === 'BASC')?.resumen.total).toBe(1);
    // El universo real son 2 obligaciones, no 3: la bandera existe para poder decirlo en pantalla.
    expect(resultado.resumen.total).toBe(2);
    expect(resultado.sumaMasQueElTotal).toBe(true);
  });

  it('sin solapamiento no se avisa de nada', () => {
    const resultado = agrupar([hecho({ area: CARIBE }), hecho({ area: ANDINA })], 'area');
    expect(resultado.sumaMasQueElTotal).toBe(false);
  });
});

describe('vencimientos', () => {
  const HOY = new Date('2026-09-01T12:00:00Z');

  function vencimiento(fecha: string, clase: 'CERTIFICACION' | 'OBLIGACION' = 'CERTIFICACION'): HechoVencimiento {
    return {
      clase,
      fecha: new Date(fecha),
      personaId: 'u1',
      personaNombre: 'Conductor de la regional',
      documento: '123',
      area: null,
      cargo: null,
      regional: null,
      formacion: 'Trabajo en alturas',
      actividadId: null,
    };
  }

  it('los tramos se acumulan: lo de 20 dias tambien esta dentro de 90', () => {
    const resumen = resumir([vencimiento('2026-09-21T00:00:00Z')], HOY);

    expect(resumen.proximos30).toBe(1);
    expect(resumen.proximos90).toBe(1);
    expect(resumen.vencido).toBe(0);
  });

  it('lo ya caducado va aparte y no se cuenta como proximo', () => {
    const resumen = resumir([vencimiento('2026-08-01T00:00:00Z')], HOY);

    expect(resumen.vencido).toBe(1);
    expect(resumen.proximos30).toBe(0);
    expect(resumen.proximos90).toBe(0);
    expect(resumen.total).toBe(1);
  });

  it('el calendario devuelve tambien los meses vacios del horizonte', () => {
    // Un calendario sin los meses en blanco se lee como si no existieran, y es justo ahi donde se
    // puede reprogramar lo que se amontona en el mes de al lado.
    const cubos = calendario([vencimiento('2026-11-10T00:00:00Z')], HOY, 4);

    expect(cubos.map((c) => c.mes)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(cubos[2]?.certificaciones).toBe(1);
    expect(cubos[0]?.total).toBe(0);
  });

  it('separa certificaciones de obligaciones: se resuelven distinto', () => {
    const cubos = calendario(
      [vencimiento('2026-09-10T00:00:00Z'), vencimiento('2026-09-20T00:00:00Z', 'OBLIGACION')],
      HOY,
      1,
    );

    expect(cubos[0]?.certificaciones).toBe(1);
    expect(cubos[0]?.obligaciones).toBe(1);
    expect(cubos[0]?.total).toBe(2);
  });
});
