import { loQueExigeElTipo } from './type-requirements.js';

const CON_EXAMEN = [{ type: 'LESSON' }, { type: 'ASSESSMENT' }];
const SOLO_VIDEO = [{ type: 'VIDEO' }];

describe('loQueExigeElTipo', () => {
  it('el tipo que no exige nada deja publicar con lo que sea', () => {
    expect(loQueExigeElTipo({ requiresAssessment: false, requiresSurvey: false }, SOLO_VIDEO)).toEqual([]);
  });

  it('la pildora se publica sin examen: su config lo dice', () => {
    expect(loQueExigeElTipo({ requiresAssessment: false, issuesCertificate: false }, SOLO_VIDEO)).toEqual([]);
  });

  /** El caso que estaba roto: "Capacitacion del plan" pide examen Y encuesta y no se comprobaba. */
  it('la capacitacion del plan sin examen ni encuesta no se publica, y dice las dos cosas', () => {
    const faltan = loQueExigeElTipo({ requiresAssessment: true, requiresSurvey: true }, SOLO_VIDEO);
    expect(faltan).toHaveLength(2);
    expect(faltan[0]).toContain('evaluacion');
    expect(faltan[1]).toContain('encuesta');
  });

  it('con el examen puesto solo reclama la encuesta', () => {
    const faltan = loQueExigeElTipo({ requiresAssessment: true, requiresSurvey: true }, CON_EXAMEN);
    expect(faltan).toHaveLength(1);
    expect(faltan[0]).toContain('encuesta');
  });

  it('con las dos puestas, se publica', () => {
    const completo = [...CON_EXAMEN, { type: 'SURVEY' }];
    expect(loQueExigeElTipo({ requiresAssessment: true, requiresSurvey: true }, completo)).toEqual([]);
  });

  /**
   * Un tipo mal configurado tiene que caer del lado que PROTEGE el registro. Si `config` llega
   * vacio o de una version anterior del producto, exigir evaluacion es el defecto de todo el
   * resto del producto y dejarlo pasar seria relajar la regla justo cuando no se sabe nada.
   */
  it('sin config, exige evaluacion: el defecto conservador', () => {
    expect(loQueExigeElTipo(null, SOLO_VIDEO)).toHaveLength(1);
    expect(loQueExigeElTipo({}, SOLO_VIDEO)).toHaveLength(1);
  });

  it('sin config no exige encuesta: solo la piden los tipos que lo dicen', () => {
    expect(loQueExigeElTipo({}, CON_EXAMEN)).toEqual([]);
  });

  it('un valor que no es booleano no cuenta como "si"', () => {
    expect(loQueExigeElTipo({ requiresSurvey: 'si' }, CON_EXAMEN)).toEqual([]);
  });

  it('las frases dicen POR QUE se pide, no solo que falta', () => {
    const [evaluacion] = loQueExigeElTipo({ requiresAssessment: true }, SOLO_VIDEO);
    expect(evaluacion).toContain('auditor');
  });
});
