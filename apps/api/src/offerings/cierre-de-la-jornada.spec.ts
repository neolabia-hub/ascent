import { cierraPorLista, porQueCierraAsi, type JornadaParaCerrar } from './cierre-de-la-jornada.js';

const jornada = (parcial: Partial<JornadaParaCerrar> = {}): JornadaParaCerrar => ({
  kind: 'EVENT',
  modality: 'PRESENCIAL',
  closesByAttendance: null,
  ...parcial,
});

/**
 * COMO SE CIERRA UNA JORNADA.
 *
 * La regla derivada cambio dos veces en dos dias —primero el `kind`, despues la modalidad— y las
 * dos veces por un caso real que la anterior no cubria. Estas pruebas fijan los cuatro casos que la
 * rompieron, para que la tercera version no repita el ciclo.
 */
describe('como se cierra una jornada', () => {
  describe('el defecto, cuando nadie dice nada', () => {
    it('presencial: hay salon y lista', () => {
      expect(cierraPorLista(jornada({ modality: 'PRESENCIAL' }))).toBe(true);
    });

    it('hibrida tambien: hay sesion, y ademas contenido', () => {
      expect(cierraPorLista(jornada({ modality: 'HIBRIDA' }))).toBe(true);
    });

    it('virtual no: la evidencia es lo que la plataforma registro', () => {
      expect(cierraPorLista(jornada({ modality: 'VIRTUAL' }))).toBe(false);
    });
  });

  describe('los dos casos que rompieron las reglas anteriores', () => {
    /*
      El que rompio la regla del `kind`: tiene fecha y se convoca, y aun asi la persona entra a la
      plataforma y hace el temario. Con la regla vieja se le pedia lista.
    */
    it('capacitacion del plan con fecha, virtual y con contenido: NO se cierra por lista', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL' }))).toBe(false);
    });

    /*
      El que rompio la regla de la modalidad: la dicta la ARL por videollamada en vivo. Es virtual y
      SI tiene lista de quien se conecto. Por eso la casilla existe.
    */
    it('videollamada en vivo con lista: se marca, y manda sobre la modalidad', () => {
      expect(cierraPorLista(jornada({ modality: 'VIRTUAL', closesByAttendance: true }))).toBe(true);
    });
  });

  describe('la casilla manda sobre el defecto, en los dos sentidos', () => {
    it('un taller presencial que se acredita con lo que hagan despues', () => {
      expect(cierraPorLista(jornada({ modality: 'PRESENCIAL', closesByAttendance: false }))).toBe(false);
    });

    it('y en blanco vuelve a lo que diga su modalidad', () => {
      expect(cierraPorLista(jornada({ modality: 'PRESENCIAL', closesByAttendance: null }))).toBe(true);
      expect(cierraPorLista(jornada({ modality: 'VIRTUAL', closesByAttendance: null }))).toBe(false);
    });
  });

  describe('el autoservicio no se negocia', () => {
    it('una PERMANENTE nunca se cierra por lista, aunque este marcada', () => {
      expect(cierraPorLista(jornada({ kind: 'PERMANENT', closesByAttendance: true }))).toBe(false);
    });

    it('ni siendo presencial: una permanente presencial es un dato mal puesto', () => {
      expect(cierraPorLista(jornada({ kind: 'PERMANENT', modality: 'PRESENCIAL' }))).toBe(false);
    });
  });

  describe('y la explicacion dice por que, no solo que si o que no', () => {
    it('nombra el autoservicio', () => {
      expect(porQueCierraAsi(jornada({ kind: 'PERMANENT' }))).toContain('autoservicio');
    });

    it('distingue el defecto de la decision explicita', () => {
      expect(porQueCierraAsi(jornada({ modality: 'VIRTUAL' }))).toContain('Es virtual');
      expect(porQueCierraAsi(jornada({ modality: 'VIRTUAL', closesByAttendance: true }))).toContain('lista de asistencia');
    });
  });

  /*
    LAS 27 COMBINACIONES, UNA POR UNA (2026-09-08).

    Lo pidio el cliente con estas palabras: *"que las pruebas de todas las posibles combinaciones se
    hagan bien... entre como se hace, modalidad y como se registra"*. Y el ejemplo que puso es el que
    justifica que sean todas y no una muestra: **una sesion con fecha, virtual, y con lista** —la
    videollamada en vivo donde alguien apunta quien se conecto—, contra **la misma sesion con fecha,
    virtual, y automatica** —la que se dicta en linea y se cierra cuando cada quien termina el
    contenido, la evaluacion y la encuesta—. Son dos casillas contiguas de esta tabla y hacen cosas
    opuestas.

    Los bloques de arriba fijan los cuatro casos que ROMPIERON la regla, que es su valor. Este fija
    las 27 de golpe, que es otra cosa: **impide que la proxima version de la regla acierte en los
    cuatro casos conocidos y falle en cualquiera de los otros veintitres**. Es la diferencia entre
    probar lo que ya paso y probar lo que puede pasar.

    Cuesta cero: `cierraPorLista` es una funcion pura, sin base ni servidor.

    ─── COMO SE LEE LA TABLA ───

      · PERMANENT  siempre `false`. No hay sesion a la que asistir; manda sobre lo que diga la casilla,
                   y por eso las nueve filas de esa forma dicen lo mismo.
      · Con la casilla EXPLICITA (true/false) manda la casilla, sea cual sea la modalidad.
      · Con la casilla en `null` decide la modalidad: virtual no, el resto si.
  */
  describe('las 27 combinaciones de forma x modalidad x casilla', () => {
    const FORMAS = ['EVENT', 'PERMANENT', 'HYBRID'] as const;
    const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'] as const;
    const CASILLAS = [null, true, false] as const;

    /** Lo esperado, escrito como REGLA y no como tabla copiada del resultado. */
    const seEsperaLista = (forma: (typeof FORMAS)[number], modalidad: (typeof MODALIDADES)[number], casilla: boolean | null) => {
      if (forma === 'PERMANENT') return false;
      if (casilla !== null) return casilla;
      return modalidad !== 'VIRTUAL';
    };

    for (const kind of FORMAS) {
      for (const modality of MODALIDADES) {
        for (const closesByAttendance of CASILLAS) {
          const dice = closesByAttendance === null ? 'sin elegir' : closesByAttendance ? 'lista' : 'al completar';
          const esperado = seEsperaLista(kind, modality, closesByAttendance);
          it(`${kind} · ${modality} · ${dice} -> ${esperado ? 'LISTA' : 'contenido'}`, () => {
            expect(cierraPorLista(jornada({ kind, modality, closesByAttendance }))).toBe(esperado);
          });
        }
      }
    }

    /*
      Y LAS DOS CASILLAS DEL EJEMPLO DEL CLIENTE, nombradas, porque son las que hay que poder señalar
      cuando alguien vuelva a preguntar "¿y si es virtual con lista?".
    */
    it('la videollamada en vivo: sesion con fecha, VIRTUAL, y con lista de quien se conecto', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', closesByAttendance: true }))).toBe(true);
    });

    it('el curso en linea: sesion con fecha, VIRTUAL, y se cierra al completar el contenido', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', closesByAttendance: false }))).toBe(false);
    });

    it('y sin elegir, esa misma sesion virtual se cierra al completar: el defecto acierta en la mayoria', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', closesByAttendance: null }))).toBe(false);
    });

    /*
      LA ESQUINA QUE MAS ENGAÑA: una PERMANENTE marcada a mano para cerrarse por lista. Es un dato mal
      puesto, no un caso de uso —no hay sesion a la que asistir— y dejarla pasar convertiria el error
      de captura de alguien en asistencias inventadas. Se comprueba en las tres modalidades porque el
      error de captura no distingue.
    */
    for (const modality of MODALIDADES) {
      it(`una PERMANENTE ${modality} marcada "con lista" sigue sin cerrarse por lista`, () => {
        expect(cierraPorLista(jornada({ kind: 'PERMANENT', modality, closesByAttendance: true }))).toBe(false);
      });
    }

    /*
      Y QUE LA EXPLICACION NO SE DESINCRONICE DE LA REGLA. `porQueCierraAsi` es lo que la pantalla
      enseña; si dijera "se cierra con la lista" donde `cierraPorLista` devuelve `false`, la pantalla
      estaria contando una cosa y el servidor haciendo otra. Se comprueba en las 27.
    */
    for (const kind of FORMAS) {
      for (const modality of MODALIDADES) {
        for (const closesByAttendance of CASILLAS) {
          it(`la explicacion cuadra con la regla: ${kind} · ${modality} · ${closesByAttendance ?? 'sin elegir'}`, () => {
            const j = jornada({ kind, modality, closesByAttendance });
            const texto = porQueCierraAsi(j).toLowerCase();
            const hablaDeLista = texto.includes('lista de asistencia');
            const hablaDePlataforma = texto.includes('plataforma');
            expect(hablaDeLista || hablaDePlataforma).toBe(true);
            // Si la regla dice LISTA, la explicacion no puede mandar a la plataforma, ni al reves.
            expect(hablaDeLista).toBe(cierraPorLista(j));
          });
        }
      }
    }
  });
});
