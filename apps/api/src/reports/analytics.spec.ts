import { agrupar, type HechoAnalitica } from './analytics.js';
import { calendario, consolidar, resumir, type HechoVencimiento } from './expirations.js';

function hecho(parcial: Partial<HechoAnalitica>): HechoAnalitica {
  return {
    estado: 'TERMINADA',
    area: null,
    subarea: null,
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

  /*
    SUB-AREAS: «Area» sigue siendo la grande, «Sub-area» es el corte fino (2026-09-21).

    La trampa que esto vigila: si `area` pasara a agrupar por la sub-area, «Gestion Humana»
    desapareceria de todos los informes sin que nadie lo pidiera, y el mismo rotulo diria otra cosa
    de un dia para otro. Los hechos traen las dos etiquetas justamente para que no haya que elegir.
  */
  describe('un area con sub-areas', () => {
    const GESTION = { id: 'g', name: 'Gestion Humana' };
    const NOMINA = { id: 'n', name: 'Nomina' };
    const SELECCION = { id: 's', name: 'Seleccion' };
    const dos = [
      hecho({ area: GESTION, subarea: NOMINA }),
      hecho({ area: GESTION, subarea: SELECCION }),
    ];

    it('«Area» los junta a los dos bajo el area madre', () => {
      const resultado = agrupar(dos, 'area');
      expect(resultado.grupos).toHaveLength(1);
      expect(resultado.grupos[0]?.label).toBe('Gestion Humana');
      expect(resultado.grupos[0]?.resumen.total).toBe(2);
    });

    it('y «Sub-area» los separa, que es lo que dice a quien llamar', () => {
      const resultado = agrupar(dos, 'subarea');
      expect(resultado.grupos.map((g) => g.label).sort()).toEqual(['Nomina', 'Seleccion']);
    });

    it('quien trabaja directamente en el area sale como «Sin sub-area», no desaparece', () => {
      const resultado = agrupar([...dos, hecho({ area: GESTION, subarea: null })], 'subarea');
      expect(resultado.grupos.map((g) => g.label)).toContain('Sin sub-area');
      expect(resultado.resumen.total).toBe(3);
    });
  });
});

describe('vencimientos', () => {
  const HOY = new Date('2026-09-01T12:00:00Z');

  function vencimiento(
    fecha: string,
    parcial: Partial<HechoVencimiento> = {},
  ): HechoVencimiento {
    return {
      clase: 'REPROGRAMAR',
      fuente: 'CONSTANCIA',
      fecha: new Date(fecha),
      personaId: 'u1',
      personaNombre: 'Conductor de la regional',
      documento: '123',
      area: null,
      cargo: null,
      regional: null,
      formacion: 'Trabajo en alturas',
      actividadId: null,
      ...parcial,
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
    expect(cubos[2]?.reprogramar).toBe(1);
    expect(cubos[0]?.total).toBe(0);
  });

  it('separa lo que se reprograma de lo que se persigue: se resuelven distinto', () => {
    const cubos = calendario(
      [
        vencimiento('2026-09-10T00:00:00Z'),
        vencimiento('2026-09-20T00:00:00Z', { clase: 'PERSEGUIR', fuente: 'OBLIGACION_ABIERTA' }),
      ],
      HOY,
      1,
    );

    expect(cubos[0]?.reprogramar).toBe(1);
    expect(cubos[0]?.perseguir).toBe(1);
    expect(cubos[0]?.total).toBe(2);
  });

  it('lo vencido antes del horizonte no se esconde: cae en su propio mes', () => {
    const cubos = calendario([vencimiento('2026-07-04T00:00:00Z')], HOY, 3);

    expect(cubos[0]?.mes).toBe('2026-07');
    expect(cubos[0]?.reprogramar).toBe(1);
    // Y los tres meses del horizonte siguen dibujandose.
    expect(cubos).toHaveLength(4);
  });
});

/*
  LA CONSOLIDACION, QUE ES LO QUE ARREGLA EL EJE (`PENDIENTES` 3.2).

  Antes se contaba por DE DONDE SALIA EL DATO, asi que quien esta en su ventana de 60 dias —el papel
  le caduca en marzo y la ronda siguiente ya le nacio— salia en las dos series. Aqui esta la matriz
  entera de lo que puede coincidir sobre una misma persona y una misma formacion.
*/
describe('consolidar vencimientos', () => {
  const BASE = {
    personaNombre: 'Conductora de la regional',
    documento: '123',
    area: null,
    cargo: null,
    regional: null,
    formacion: 'Trabajo en alturas',
  } as const;

  const papel = (personaId: string, actividadId: string | null, fecha: string): HechoVencimiento => ({
    ...BASE,
    clase: 'REPROGRAMAR',
    fuente: 'PAPEL_DE_TERCERO',
    fecha: new Date(fecha),
    personaId,
    actividadId,
  });
  const constancia = (personaId: string, actividadId: string | null, fecha: string): HechoVencimiento => ({
    ...papel(personaId, actividadId, fecha),
    fuente: 'CONSTANCIA',
  });
  const abierta = (
    personaId: string,
    actividadId: string | null,
    fecha: string,
    clase: 'REPROGRAMAR' | 'PERSEGUIR' = 'REPROGRAMAR',
  ): HechoVencimiento => ({
    ...papel(personaId, actividadId, fecha),
    fuente: 'OBLIGACION_ABIERTA',
    clase,
  });

  it('la ventana de 60 dias ya no cuenta dos veces: manda la obligacion abierta', () => {
    // El caso exacto que rompia el informe: el papel caduca el 30 de marzo y la ronda siguiente
    // nacio con esa misma fecha limite. Es UN trabajo, no dos.
    const filas = consolidar([papel('u1', 'a1', '2027-03-30'), abierta('u1', 'a1', '2027-03-30')]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.fuente).toBe('OBLIGACION_ABIERTA');
  });

  it('y manda aunque su fecha sea posterior a la del papel', () => {
    // La obligacion abierta es la que tiene plazo de verdad y la que se cierra al tomar la lista.
    const filas = consolidar([papel('u1', 'a1', '2027-01-10'), abierta('u1', 'a1', '2027-03-30')]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.fecha.toISOString().slice(0, 10)).toBe('2027-03-30');
  });

  it('sin obligacion abierta se queda la caducidad mas proxima', () => {
    // Los dos documentos de la misma formacion pueden decir fechas distintas y es coherente
    // (`08-evidencia.md` 10.6). Para reprogramar manda la primera que se cae.
    const filas = consolidar([constancia('u1', 'a1', '2027-06-30'), papel('u1', 'a1', '2027-02-15')]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.fuente).toBe('PAPEL_DE_TERCERO');
    expect(filas[0]?.fecha.toISOString().slice(0, 10)).toBe('2027-02-15');
  });

  it('dos personas con la misma formacion son dos filas', () => {
    expect(consolidar([papel('u1', 'a1', '2027-03-30'), papel('u2', 'a1', '2027-03-30')])).toHaveLength(2);
  });

  it('una persona con dos formaciones son dos filas', () => {
    expect(consolidar([papel('u1', 'a1', '2027-03-30'), papel('u1', 'a2', '2027-03-30')])).toHaveLength(2);
  });

  it('lo que no dice de que formacion es, no se fusiona con nada', () => {
    // Fusionar por el NOMBRE haria desaparecer una fila de verdad el dia que dos formaciones se
    // llamen parecido.
    const filas = consolidar([papel('u1', null, '2027-03-30'), papel('u1', null, '2027-04-30')]);

    expect(filas).toHaveLength(2);
  });

  it('la clase de la que se queda es la suya, no la de la que se descarto', () => {
    // Quien nunca la ha tenido y ademas arrastra un papel viejo de otra cosa no puede acabar
    // contado como "reprogramar": la accion es llamarlo.
    const filas = consolidar([constancia('u1', 'a1', '2027-05-01'), abierta('u1', 'a1', '2027-03-30', 'PERSEGUIR')]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.clase).toBe('PERSEGUIR');
  });

  it('sale ordenado por fecha, que es como se lee un calendario', () => {
    const filas = consolidar([
      papel('u2', 'a1', '2027-06-01'),
      papel('u1', 'a1', '2027-01-01'),
      papel('u3', 'a1', '2027-03-01'),
    ]);

    expect(filas.map((f) => f.personaId)).toEqual(['u1', 'u3', 'u2']);
  });

  it('tres fuentes sobre la misma persona y formacion siguen siendo una fila', () => {
    const filas = consolidar([
      constancia('u1', 'a1', '2027-05-01'),
      papel('u1', 'a1', '2027-04-01'),
      abierta('u1', 'a1', '2027-03-30'),
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.fuente).toBe('OBLIGACION_ABIERTA');
  });

  it('sin nada que consolidar devuelve lo mismo que entro', () => {
    expect(consolidar([])).toEqual([]);
  });
});
