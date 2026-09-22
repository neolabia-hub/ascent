import {
  cierraPorLista,
  porQueCierraAsi,
  queSeExige,
  seTomaLista,
  type Exigencia,
  type JornadaParaCerrar,
} from './cierre-de-la-jornada.js';

const jornada = (parcial: Partial<JornadaParaCerrar> = {}): JornadaParaCerrar => ({
  kind: 'EVENT',
  modality: 'PRESENCIAL',
  completionRequirement: null,
  takesAttendance: null,
  ...parcial,
});

/**
 * COMO SE CIERRA UNA JORNADA, Y SI SE TOMA LISTA.
 *
 * La regla derivada cambio dos veces en dos dias —primero el `kind`, despues la modalidad— y las
 * dos veces por un caso real que la anterior no cubria. El 2026-09-21 cambio una tercera, pero en
 * otra direccion: no se sustituyo por otra regla, se **desdoblo en dos preguntas** (`PENDIENTES`
 * 2.7). Estas pruebas fijan los casos que rompieron cada version, para que la siguiente no repita
 * el ciclo.
 */
describe('como se cierra una jornada', () => {
  describe('el defecto, cuando nadie dice nada', () => {
    it('presencial: hay salon y lista', () => {
      expect(queSeExige(jornada({ modality: 'PRESENCIAL' }))).toBe('ATTENDANCE');
    });

    it('hibrida tambien: hay sesion, y ademas contenido', () => {
      expect(queSeExige(jornada({ modality: 'HIBRIDA' }))).toBe('ATTENDANCE');
    });

    it('virtual no: la evidencia es lo que la plataforma registro', () => {
      expect(queSeExige(jornada({ modality: 'VIRTUAL' }))).toBe('CONTENT');
    });

    it('y BOTH no es NUNCA un defecto: exigir dos cosas se decide, no se deduce', () => {
      for (const modality of ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'] as const) {
        expect(queSeExige(jornada({ modality }))).not.toBe('BOTH');
      }
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
      expect(cierraPorLista(jornada({ modality: 'VIRTUAL', completionRequirement: 'ATTENDANCE' }))).toBe(true);
    });
  });

  describe('la eleccion manda sobre el defecto, en los dos sentidos', () => {
    it('un taller presencial que se acredita con lo que hagan despues', () => {
      expect(cierraPorLista(jornada({ modality: 'PRESENCIAL', completionRequirement: 'CONTENT' }))).toBe(false);
    });

    it('y en blanco vuelve a lo que diga su modalidad', () => {
      expect(cierraPorLista(jornada({ modality: 'PRESENCIAL', completionRequirement: null }))).toBe(true);
      expect(cierraPorLista(jornada({ modality: 'VIRTUAL', completionRequirement: null }))).toBe(false);
    });
  });

  describe('el autoservicio no se negocia', () => {
    it('una PERMANENTE nunca se cierra por lista, aunque este marcada', () => {
      expect(cierraPorLista(jornada({ kind: 'PERMANENT', completionRequirement: 'ATTENDANCE' }))).toBe(false);
    });

    it('ni siendo presencial: una permanente presencial es un dato mal puesto', () => {
      expect(cierraPorLista(jornada({ kind: 'PERMANENT', modality: 'PRESENCIAL' }))).toBe(false);
    });

    it('y tampoco toma lista, aunque alguien marque que si', () => {
      expect(seTomaLista(jornada({ kind: 'PERMANENT', takesAttendance: true }))).toBe(false);
      expect(seTomaLista(jornada({ kind: 'PERMANENT', completionRequirement: 'BOTH', takesAttendance: true }))).toBe(false);
    });
  });

  /*
    ─── EL CASO QUE ABRIO EL 2.7, NOMBRADO ───

    Es el que no se podia pedir, y por eso tiene bloque propio: mientras «como se acredita» y «hay
    lista» fueran la misma casilla, elegir una descartaba la otra.
  */
  describe('el curso con evaluacion que ademas deja constancia de que la persona estuvo', () => {
    const curso = jornada({ kind: 'EVENT', modality: 'PRESENCIAL', completionRequirement: 'CONTENT', takesAttendance: true });

    it('lo que acredita es el contenido: el examen obliga', () => {
      expect(queSeExige(curso)).toBe('CONTENT');
    });

    it('y AUN ASI se toma lista: hay QR, firma y acta', () => {
      expect(seTomaLista(curso)).toBe(true);
    });

    it('pero esa marca NO cierra nada: es evidencia, no acreditacion', () => {
      expect(cierraPorLista(curso)).toBe(false);
    });

    it('la explicacion lo dice, para que nadie marque la lista creyendo que cumple', () => {
      expect(porQueCierraAsi(curso).toLowerCase()).toContain('evidencia');
    });
  });

  describe('«las dos cosas»: ni venir basta, ni aprobar desde casa', () => {
    const ambas = jornada({ completionRequirement: 'BOTH' });

    it('se toma lista, porque hay sesion a la que hay que venir', () => {
      expect(seTomaLista(ambas)).toBe(true);
    });

    it('pero la lista NO cierra por si sola: falta aprobar', () => {
      expect(cierraPorLista(ambas)).toBe(false);
    });

    it('y la lista no se puede apagar: sin ella la mitad de la exigencia seria incomprobable', () => {
      expect(seTomaLista(jornada({ completionRequirement: 'BOTH', takesAttendance: false }))).toBe(true);
    });
  });

  describe('y la explicacion dice por que, no solo que si o que no', () => {
    it('nombra el autoservicio', () => {
      expect(porQueCierraAsi(jornada({ kind: 'PERMANENT' }))).toContain('autoservicio');
    });

    it('distingue el defecto de la decision explicita', () => {
      expect(porQueCierraAsi(jornada({ modality: 'VIRTUAL' }))).toContain('Es virtual');
      expect(porQueCierraAsi(jornada({ modality: 'VIRTUAL', completionRequirement: 'ATTENDANCE' }))).toContain(
        'lista de asistencia',
      );
    });

    it('y nombra las dos cosas cuando son dos', () => {
      expect(porQueCierraAsi(jornada({ completionRequirement: 'BOTH' })).toLowerCase()).toContain('las dos cosas');
    });
  });

  /*
    LAS 108 COMBINACIONES, UNA POR UNA (2026-09-08, ampliado el 2026-09-21).

    Lo pidio el cliente con estas palabras: *"que las pruebas de todas las posibles combinaciones se
    hagan bien... entre como se hace, modalidad y como se registra"*. Y el ejemplo que puso es el que
    justifica que sean todas y no una muestra: **una sesion con fecha, virtual, y con lista** —la
    videollamada en vivo donde alguien apunta quien se conecto—, contra **la misma sesion con fecha,
    virtual, y automatica**. Son dos casillas contiguas de esta tabla y hacen cosas opuestas.

    Eran 27 (forma x modalidad x casilla). Al desdoblar la casilla en dos preguntas pasan a ser
    **forma (3) x modalidad (3) x exigencia (4, con el heredado) x lista (3, con el heredado) = 108**.
    Se amplia la tabla en vez de añadir casos sueltos por el mismo motivo de la primera vez: impide
    que la proxima version de la regla acierte en los casos conocidos y falle en cualquier otro.

    Cuesta cero: son funciones puras, sin base ni servidor.

    ─── COMO SE LEE LA TABLA ───

      · PERMANENT  siempre CONTENT y sin lista. No hay sesion a la que asistir; manda sobre lo que
                   diga cualquier casilla, y por eso sus filas dicen todas lo mismo.
      · Con la exigencia EXPLICITA manda ella, sea cual sea la modalidad.
      · Con la exigencia en `null` decide la modalidad: virtual CONTENT, el resto ATTENDANCE.
      · La lista se toma SIEMPRE que la exigencia la incluya; solo con CONTENT es una eleccion.
  */
  describe('las 108 combinaciones de forma x modalidad x exigencia x lista', () => {
    const FORMAS = ['EVENT', 'PERMANENT', 'HYBRID'] as const;
    const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'HIBRIDA'] as const;
    const EXIGENCIAS = [null, 'ATTENDANCE', 'CONTENT', 'BOTH'] as const;
    const LISTAS = [null, true, false] as const;

    /** Lo esperado, escrito como REGLA y no como tabla copiada del resultado. */
    const exigenciaEsperada = (
      forma: (typeof FORMAS)[number],
      modalidad: (typeof MODALIDADES)[number],
      exigencia: Exigencia | null,
    ): Exigencia => {
      if (forma === 'PERMANENT') return 'CONTENT';
      if (exigencia) return exigencia;
      return modalidad === 'VIRTUAL' ? 'CONTENT' : 'ATTENDANCE';
    };

    const listaEsperada = (
      forma: (typeof FORMAS)[number],
      modalidad: (typeof MODALIDADES)[number],
      exigencia: Exigencia | null,
      lista: boolean | null,
    ): boolean => {
      if (forma === 'PERMANENT') return false;
      if (exigenciaEsperada(forma, modalidad, exigencia) !== 'CONTENT') return true;
      return lista === true;
    };

    for (const kind of FORMAS) {
      for (const modality of MODALIDADES) {
        for (const completionRequirement of EXIGENCIAS) {
          for (const takesAttendance of LISTAS) {
            const dice = completionRequirement ?? 'heredado';
            const conLista = takesAttendance === null ? 'lista heredada' : takesAttendance ? 'lista si' : 'lista no';
            const esperada = exigenciaEsperada(kind, modality, completionRequirement);
            const hayLista = listaEsperada(kind, modality, completionRequirement, takesAttendance);

            it(`${kind} · ${modality} · ${dice} · ${conLista} -> exige ${esperada}, ${hayLista ? 'con' : 'sin'} lista`, () => {
              const j = jornada({ kind, modality, completionRequirement, takesAttendance });
              expect(queSeExige(j)).toBe(esperada);
              expect(seTomaLista(j)).toBe(hayLista);
              // `cierraPorLista` es una lectura derivada: no puede discrepar de la exigencia.
              expect(cierraPorLista(j)).toBe(esperada === 'ATTENDANCE');
            });
          }
        }
      }
    }

    /*
      DOS INVARIANTES QUE NINGUNA COMBINACION PUEDE ROMPER. Valen mas que la tabla: la tabla fija
      108 resultados, esto fija lo que significan.
    */
    for (const kind of FORMAS) {
      for (const modality of MODALIDADES) {
        for (const completionRequirement of EXIGENCIAS) {
          for (const takesAttendance of LISTAS) {
            const j = jornada({ kind, modality, completionRequirement, takesAttendance });

            it(`si la lista acredita, la lista se toma: ${kind} · ${modality} · ${completionRequirement ?? 'heredado'} · ${takesAttendance ?? 'heredada'}`, () => {
              // Lo contrario dejaria una jornada que no se puede cerrar de ninguna forma.
              if (queSeExige(j) !== 'CONTENT' && kind !== 'PERMANENT') expect(seTomaLista(j)).toBe(true);
            });

            it(`marcar la lista solo CIERRA cuando la lista es lo unico que se exige: ${kind} · ${modality} · ${completionRequirement ?? 'heredado'} · ${takesAttendance ?? 'heredada'}`, () => {
              expect(cierraPorLista(j)).toBe(queSeExige(j) === 'ATTENDANCE');
            });
          }
        }
      }
    }

    /*
      Y LAS CASILLAS DE LOS EJEMPLOS DEL CLIENTE, nombradas, porque son las que hay que poder señalar
      cuando alguien vuelva a preguntar "¿y si es virtual con lista?".
    */
    it('la videollamada en vivo: sesion con fecha, VIRTUAL, y con lista de quien se conecto', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', completionRequirement: 'ATTENDANCE' }))).toBe(true);
    });

    it('el curso en linea: sesion con fecha, VIRTUAL, y se cierra al completar el contenido', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', completionRequirement: 'CONTENT' }))).toBe(false);
    });

    it('y sin elegir, esa misma sesion virtual se cierra al completar: el defecto acierta en la mayoria', () => {
      expect(cierraPorLista(jornada({ kind: 'EVENT', modality: 'VIRTUAL', completionRequirement: null }))).toBe(false);
    });

    /*
      LA ESQUINA QUE MAS ENGAÑA: una PERMANENTE marcada a mano para cerrarse por lista. Es un dato mal
      puesto, no un caso de uso —no hay sesion a la que asistir— y dejarla pasar convertiria el error
      de captura de alguien en asistencias inventadas. Se comprueba en las tres modalidades porque el
      error de captura no distingue.
    */
    for (const modality of MODALIDADES) {
      it(`una PERMANENTE ${modality} marcada "con lista" sigue sin cerrarse por lista`, () => {
        expect(cierraPorLista(jornada({ kind: 'PERMANENT', modality, completionRequirement: 'ATTENDANCE' }))).toBe(false);
      });
    }

    /*
      Y QUE LA EXPLICACION NO SE DESINCRONICE DE LA REGLA. `porQueCierraAsi` es lo que la pantalla
      enseña; si dijera "se cierra con la lista" donde la exigencia es otra, la pantalla estaria
      contando una cosa y el servidor haciendo otra. Se comprueba en las 108.
    */
    for (const kind of FORMAS) {
      for (const modality of MODALIDADES) {
        for (const completionRequirement of EXIGENCIAS) {
          for (const takesAttendance of LISTAS) {
            it(`la explicacion cuadra con la regla: ${kind} · ${modality} · ${completionRequirement ?? 'heredado'} · ${takesAttendance ?? 'heredada'}`, () => {
              const j = jornada({ kind, modality, completionRequirement, takesAttendance });
              const texto = porQueCierraAsi(j).toLowerCase();
              const exige = queSeExige(j);

              if (exige === 'BOTH') {
                // Tiene que nombrar las DOS, o alguien leera solo la mitad que ya esperaba.
                expect(texto).toContain('asistir');
                expect(texto).toContain('aprobar');
                return;
              }

              const hablaDeLista = texto.includes('lista de asistencia');
              const hablaDePlataforma = texto.includes('plataforma') || texto.includes('autoservicio');
              expect(hablaDeLista || hablaDePlataforma).toBe(true);
              // Si la regla dice LISTA, la explicacion no puede mandar a la plataforma, ni al reves.
              expect(hablaDeLista).toBe(exige === 'ATTENDANCE');
            });
          }
        }
      }
    }
  });
});
