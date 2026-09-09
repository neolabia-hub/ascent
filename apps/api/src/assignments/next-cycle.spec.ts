import { formatCalendarDate, toBogotaDate } from './due-date.js';
import { decidirPrimeraRonda, decidirRondaSiguiente } from './next-cycle.js';

/** La fecha CIVIL en Bogota de un vencimiento, que es como se lee en la pantalla. */
const enBogota = (fecha: Date | null): string | null => (fecha ? formatCalendarDate(toBogotaDate(fecha)) : null);

/**
 * QUE PASA CUANDO LLEGA LA RONDA SIGUIENTE Y LA ANTERIOR NO SE HIZO.
 *
 * Lo destapo la pregunta del cliente sobre la reinduccion: "si no la terminó, no le aparece la
 * otra; ¿qué debe pasar?". Lo que pasaba —no abrir nada— tiene un efecto que casi nadie quiere:
 * quien nunca la hace desaparece del denominador de los años siguientes, asi que el peor
 * incumplidor sale de la cuenta y la cobertura del año que viene se ve mejor de lo que es.
 */
describe('la ronda siguiente de una obligacion que se repite', () => {
  const ventana = { ventanaAbierta: true };

  describe('ESPERA — lo que habia', () => {
    it('no abre nada mientras no la haya hecho', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'OVERDUE', politica: 'ESPERA', ...ventana })).toEqual({
        abrir: false,
        cerrarAnterior: false,
      });
    });

    it('y abre cuando la cumplio', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'COMPLETED', politica: 'ESPERA', ...ventana })).toEqual({
        abrir: true,
        cerrarAnterior: false,
      });
    });
  });

  describe('ACUMULA — debe las dos', () => {
    it('abre la siguiente y deja viva la anterior', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'OVERDUE', politica: 'ACUMULA', ...ventana })).toEqual({
        abrir: true,
        cerrarAnterior: false,
      });
    });
  });

  describe('CIERRA — cada campaña es su periodo', () => {
    it('cierra la que no se hizo y abre la nueva', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'OVERDUE', politica: 'CIERRA', ...ventana })).toEqual({
        abrir: true,
        cerrarAnterior: true,
      });
    });

    it('tambien si se quedo en PENDIENTE sin llegar a vencer', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'PENDING', politica: 'CIERRA', ...ventana }).cerrarAnterior).toBe(
        true,
      );
    });

    it('NO pisa una eximida: ya tiene su explicacion escrita', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'WAIVED', politica: 'CIERRA', ...ventana })).toEqual({
        abrir: true,
        cerrarAnterior: false,
      });
    });

    it('NO pisa una retirada', () => {
      expect(
        decidirRondaSiguiente({ estadoAnterior: 'WITHDRAWN_LEFT_AUDIENCE', politica: 'CIERRA', ...ventana })
          .cerrarAnterior,
      ).toBe(false);
    });

    it('y lo cumplido nunca se cierra', () => {
      expect(decidirRondaSiguiente({ estadoAnterior: 'COMPLETED', politica: 'CIERRA', ...ventana })).toEqual({
        abrir: true,
        cerrarAnterior: false,
      });
    });
  });

  describe('la ventana manda sobre las tres', () => {
    it('sin ventana no se abre nada aunque la hubiera cumplido', () => {
      expect(
        decidirRondaSiguiente({ estadoAnterior: 'COMPLETED', politica: 'CIERRA', ventanaAbierta: false }),
      ).toEqual({ abrir: false, cerrarAnterior: false });
    });

    it('y no se cierra la anterior antes de tiempo: cerrar sin abrir dejaria a la persona sin nada', () => {
      expect(
        decidirRondaSiguiente({ estadoAnterior: 'OVERDUE', politica: 'CIERRA', ventanaAbierta: false }),
      ).toEqual({ abrir: false, cerrarAnterior: false });
    });
  });
});

/**
 * QUIEN YA LA HIZO POR OTRO CARGO NO LA VUELVE A DEBER.
 *
 * El caso que lo obliga: la matriz de inducciones repite una formacion en varios puestos —en
 * transporte, la de bodega vale para auxiliar, montacarguista y coordinador— y la deduplicacion
 * del motor es POR REGLA. Al cambiar de cargo, la regla del puesto nuevo no tiene historia de la
 * persona y le abria la ronda 1 de algo que hizo el mes pasado, con constancia emitida.
 */
describe('la PRIMERA ronda de quien ya hizo esa formacion por otra regla', () => {
  const ahora = new Date('2026-09-05T12:00:00Z');
  const cada12 = { everyMonths: 12, windowDays: 60, onExpiry: 'ESPERA' as const, exemptRecentHiresMonths: 0 };
  const campana = { fixedDate: '03-31', windowDays: 60, onExpiry: 'CIERRA' as const, exemptRecentHiresMonths: 0 };

  /** Lo hecho el dia D, a media mañana en Bogota, con el vencimiento que satisfizo. */
  const hizoEl = (dia: string, vencia: string) => ({
    completedAt: new Date(`${dia}T15:00:00Z`),
    dueAt: new Date(`${vencia}T23:59:59-05:00`),
  });

  it('sin nada hecho, se comporta como siempre: nace y la fecha la calcula el motor', () => {
    expect(decidirPrimeraRonda({ cumplida: null, recurrencia: cada12, ahora })).toEqual({
      abrir: true,
      venceEl: null,
    });
  });

  it('si la formacion NO se repite, no le nace nunca: el hecho no caduca', () => {
    expect(
      decidirPrimeraRonda({ cumplida: hizoEl('2024-02-10', '2024-03-11'), recurrencia: null, ahora }),
    ).toEqual({ abrir: false, venceEl: null });
  });

  it('si la hizo hace poco y sigue vigente, no le nace: esperara a su ventana', () => {
    // Completada en junio de 2026 -> vence en junio de 2027, y su ventana abre en abril de 2027.
    expect(
      decidirPrimeraRonda({ cumplida: hizoEl('2026-06-15', '2026-06-30'), recurrencia: cada12, ahora }),
    ).toEqual({ abrir: false, venceEl: null });
  });

  it('dentro de la ventana hereda SU vencimiento: cambiar de cargo no reinicia el reloj', () => {
    // Certificada el 20 de octubre de 2025 -> vence el 20 de octubre de 2026, y hoy (5 de
    // septiembre) ya faltan menos de 60 dias.
    const decision = decidirPrimeraRonda({
      cumplida: hizoEl('2025-10-20', '2025-10-31'),
      recurrencia: cada12,
      ahora,
    });
    expect(decision.abrir).toBe(true);
    expect(enBogota(decision.venceEl)).toBe('2026-10-20');
  });

  it('si ya caduco, le nace como a cualquiera — nunca heredando una fecha ya pasada', () => {
    expect(
      decidirPrimeraRonda({ cumplida: hizoEl('2024-01-10', '2024-01-31'), recurrencia: cada12, ahora }),
    ).toEqual({ abrir: true, venceEl: null });
  });

  it('en una campaña la vigencia va hasta la ocurrencia siguiente, no hasta la que ya cumplio', () => {
    // Hizo la campaña de 2026 el 20 de marzo, once dias antes de que venciera. Su siguiente es la
    // de 2027: cambiar de cargo en septiembre no le puede volver a pedir la de 2026.
    expect(
      decidirPrimeraRonda({ cumplida: hizoEl('2026-03-20', '2026-03-31'), recurrencia: campana, ahora }),
    ).toEqual({ abrir: false, venceEl: null });
  });
});
