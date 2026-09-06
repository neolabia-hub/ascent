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
});
