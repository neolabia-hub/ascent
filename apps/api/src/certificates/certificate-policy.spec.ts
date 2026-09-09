import { decidirConstancia, decidirEficacia, vencimientoDe, vigenciaMasCorta } from './certificate-policy.js';

const PILDORA = { config: { issuesCertificate: false, isMicro: true } };
const INDUCCION = { config: { issuesCertificate: true } };
const HEREDA = { issuesCertificate: null, recurrenceMonths: null };

describe('decidirConstancia', () => {
  it('una pildora NO emite: su tipo dice que no', () => {
    // Emitir un papel por tres minutos devalua el papel y llena el expediente de ruido.
    expect(decidirConstancia(PILDORA, HEREDA).emite).toBe(false);
  });

  it('una induccion SI emite: su tipo dice que si', () => {
    expect(decidirConstancia(INDUCCION, HEREDA).emite).toBe(true);
  });

  it('la formacion puede desviarse del tipo EN LOS DOS SENTIDOS', () => {
    // Una charla extraordinaria de diez minutos no merece papel aunque su tipo lo emita...
    expect(decidirConstancia(INDUCCION, { issuesCertificate: false, recurrenceMonths: null }).emite).toBe(false);
    // ...y una pildora que ES el refuerzo anual de alturas si, aunque su tipo diga que no.
    expect(decidirConstancia(PILDORA, { issuesCertificate: true, recurrenceMonths: null }).emite).toBe(true);
  });

  it('un tipo sin configurar NO emite', () => {
    // Direccion segura: al reves que `requiresAssessment`, que por defecto SI exige. Alli el riesgo
    // es quedarse sin nota que enseñar; aqui es llenar el expediente de papeles que nadie pidio.
    expect(decidirConstancia({ config: {} }, HEREDA).emite).toBe(false);
    expect(decidirConstancia(null, HEREDA).emite).toBe(false);
  });

  it('la vigencia sale de la recurrencia', () => {
    // Si hay que repetirla cada 12 meses, el papel vale 12 meses: el dia que toca repetirla es
    // exactamente el dia en que deja de acreditar.
    expect(decidirConstancia(INDUCCION, { issuesCertificate: null, recurrenceMonths: 12 }).vigenciaMeses).toBe(12);
  });

  it('sin recurrencia la constancia NO vence', () => {
    // Una induccion que se hace una vez al entrar acredita para siempre que se hizo.
    expect(decidirConstancia(INDUCCION, HEREDA).vigenciaMeses).toBeNull();
  });

  it('no hay vigencia si no hay constancia', () => {
    expect(decidirConstancia(PILDORA, { issuesCertificate: null, recurrenceMonths: 12 }).vigenciaMeses).toBeNull();
  });

  it('una recurrencia de cero no es una vigencia', () => {
    // Un dato mal metido no puede producir una constancia que nace vencida.
    expect(decidirConstancia(INDUCCION, { issuesCertificate: null, recurrenceMonths: 0 }).vigenciaMeses).toBeNull();
  });
});

describe('vencimientoDe', () => {
  it('cuenta desde que se completo, no desde que se imprime', () => {
    const vence = vencimientoDe(new Date('2026-03-15T10:00:00Z'), 12);

    expect(vence?.toISOString().slice(0, 10)).toBe('2027-03-15');
  });

  it('sin vigencia no hay vencimiento', () => {
    expect(vencimientoDe(new Date('2026-03-15T10:00:00Z'), null)).toBeNull();
  });

  it('cruza bien el fin de año', () => {
    const vence = vencimientoDe(new Date('2026-11-20T10:00:00Z'), 3);

    expect(vence?.toISOString().slice(0, 10)).toBe('2027-02-20');
  });
});

describe('decidirEficacia', () => {
  it('la formacion manda sobre su tipo, en los dos sentidos', () => {
    // El caso que lo motivo: dentro de "Capacitacion del plan" conviven alturas —donde la eficacia
    // importa— y una actualizacion documental, donde preguntarle al jefe a los 30 dias no dice nada.
    const tipoQueLaPide = { config: { requiresEfficacy: true } };

    expect(decidirEficacia(tipoQueLaPide, { requiresEfficacy: false })).toBe(false);
    expect(decidirEficacia(PILDORA, { requiresEfficacy: true })).toBe(true);
  });

  it('sin decision propia hereda del tipo', () => {
    expect(decidirEficacia({ config: { requiresEfficacy: true } }, { requiresEfficacy: null })).toBe(true);
    expect(decidirEficacia({ config: {} }, { requiresEfficacy: null })).toBe(false);
  });

  it('por defecto NO se mide', () => {
    // La eficacia es la excepcion, no la regla: un jefe que recibe cuarenta encuestas al mes las
    // responde en fila, y eso convierte el indicador de transferencia en una columna de "si".
    expect(decidirEficacia(null, { requiresEfficacy: null })).toBe(false);
  });
});

/*
  LA VIGENCIA CUANDO HAY VARIAS REGLAS VIVAS (2026-09-08).

  Antes se leia UNA regla —la primera que devolviera la base— y si esa no tenia recurrencia la
  constancia salia sin vencimiento. Una acreditacion sin fecha es una que el informe de Vencimientos
  no puede ver: la persona sale del radar hasta que alguien se acuerde.
*/
describe('vigenciaMasCorta', () => {
  const cada = (everyMonths: number) => ({ everyMonths, windowDays: 60 });
  const enFecha = { fixedDate: '01-31', windowDays: 60 };

  it('sin reglas, la constancia no vence', () => {
    // Una induccion que se hace una vez al entrar acredita para siempre que se hizo.
    expect(vigenciaMasCorta([])).toBeNull();
  });

  it('con una regla, la suya', () => {
    expect(vigenciaMasCorta([cada(12)])).toBe(12);
  });

  it('con varias, la MAS CORTA: manda la obligacion mas exigente', () => {
    expect(vigenciaMasCorta([cada(24), cada(12)])).toBe(12);
  });

  it('una regla sin recurrencia no borra la vigencia de la otra', () => {
    // Es el caso que rompia: publicar una induccion crea sola su regla de "toda la empresa", que no
    // tiene recurrencia, y segun el orden de las filas la constancia salia sin vencimiento.
    expect(vigenciaMasCorta([null, cada(12)])).toBe(12);
    expect(vigenciaMasCorta([{}, cada(12)])).toBe(12);
  });

  it('las de fecha fija no cuentan: su vencimiento es un dia, no un plazo', () => {
    expect(vigenciaMasCorta([enFecha])).toBeNull();
    expect(vigenciaMasCorta([enFecha, cada(6)])).toBe(6);
  });

  it('un cero o un negativo no es una vigencia: es un dato mal metido', () => {
    expect(vigenciaMasCorta([cada(0)])).toBeNull();
    expect(vigenciaMasCorta([cada(-3), cada(12)])).toBe(12);
  });
});
