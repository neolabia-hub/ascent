/**
 * LO QUE EL TIPO DE FORMACION DECIDE.
 *
 * `activity_types.config` se sembro desde el Sprint 1 y hasta ahora no lo leia NADIE: todos los
 * tipos preguntaban lo mismo, y por eso crear una pildora pedia instructor y crear la induccion
 * general obligaba a marcar a mano a las 116 personas de la empresa —marcarlo a mano, cuando la
 * respuesta es "todos", solo puede salir mal—.
 *
 * Este archivo es el UNICO sitio del panel que interpreta ese config. Dos implementaciones
 * acabarian discrepando, y entonces el formulario diria una cosa y el motor haria otra.
 *
 * Que gobierna, en concreto:
 *   - a quien se le exige por defecto  -> la pestana Quienes
 *   - como se dicta por defecto        -> que campos pide la convocatoria
 *   - si se repite                     -> la recurrencia del requisito
 *   - si certifica y si evalua         -> el contenido y el cierre
 */

export type AssignmentMode = 'ON_HIRE' | 'BY_JOB_TITLE' | 'MANUAL';
export type OfferingKind = 'EVENT' | 'PERMANENT' | 'HYBRID';

export interface ActivityTypeConfig {
  requiresAssessment: boolean;
  requiresSurvey: boolean;
  requiresEfficacy: boolean;
  issuesCertificate: boolean;
  requiresBeforeHire: boolean;
  defaultAssignmentMode: AssignmentMode;
  defaultOfferingKind: OfferingKind;
  defaultRecurrenceMonths: number | null;
  /** "Cada año antes del 31 de marzo" (MM-DD): la campaña anual. Manda sobre los meses. */
  defaultAnnualDate: string | null;
  participatesInPlan: boolean;
  isMicro: boolean;
}

const DEFAULTS: ActivityTypeConfig = {
  requiresAssessment: true,
  requiresSurvey: false,
  requiresEfficacy: false,
  issuesCertificate: true,
  requiresBeforeHire: false,
  defaultAssignmentMode: 'MANUAL',
  defaultOfferingKind: 'PERMANENT',
  defaultRecurrenceMonths: null,
  defaultAnnualDate: null,
  participatesInPlan: false,
  isMicro: false,
};

/**
 * Lee el config de un tipo con sus valores por defecto.
 *
 * Llega como JSON suelto desde la base (un tenant puede haber guardado un config parcial, o de
 * una version anterior del producto), asi que cada campo se comprueba en vez de confiar en la
 * forma. Un tipo mal configurado tiene que caer en el comportamiento mas conservador —que el
 * analista lo marque— y no en uno que obligue a media empresa sin que nadie lo pidiera.
 */
export function readTypeConfig(raw: Record<string, unknown> | null | undefined): ActivityTypeConfig {
  if (!raw) return { ...DEFAULTS };
  const bool = (key: keyof ActivityTypeConfig, fallback: boolean): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : fallback;
  const mode = raw.defaultAssignmentMode;
  const kind = raw.defaultOfferingKind;
  const months = raw.defaultRecurrenceMonths;
  return {
    requiresAssessment: bool('requiresAssessment', DEFAULTS.requiresAssessment),
    requiresSurvey: bool('requiresSurvey', DEFAULTS.requiresSurvey),
    requiresEfficacy: bool('requiresEfficacy', DEFAULTS.requiresEfficacy),
    issuesCertificate: bool('issuesCertificate', DEFAULTS.issuesCertificate),
    requiresBeforeHire: bool('requiresBeforeHire', DEFAULTS.requiresBeforeHire),
    defaultAssignmentMode:
      mode === 'ON_HIRE' || mode === 'BY_JOB_TITLE' || mode === 'MANUAL' ? mode : DEFAULTS.defaultAssignmentMode,
    defaultOfferingKind:
      kind === 'EVENT' || kind === 'PERMANENT' || kind === 'HYBRID' ? kind : DEFAULTS.defaultOfferingKind,
    defaultRecurrenceMonths: typeof months === 'number' && months > 0 ? months : DEFAULTS.defaultRecurrenceMonths,
    defaultAnnualDate: typeof raw.defaultAnnualDate === 'string' ? raw.defaultAnnualDate : DEFAULTS.defaultAnnualDate,
    participatesInPlan: bool('participatesInPlan', DEFAULTS.participatesInPlan),
    isMicro: bool('isMicro', DEFAULTS.isMicro),
  };
}

/**
 * QUIEN decide a quien se le exige. Es la pregunta que el cliente planteo en estos terminos:
 *
 *   TODOS      la induccion general y la reinduccion: no hay nada que decidir, y dejar que
 *              alguien lo marque a mano solo abre la puerta a que falte gente.
 *   POR_CARGO  la induccion especifica: lo dice la matriz de competencia del cargo.
 *   EL_ANALISTA  el plan, la extraordinaria y la pildora: ahi si es una decision suya, y por eso
 *              es obligatorio marcarlo.
 */
export type QuienDecide = 'TODOS' | 'POR_CARGO' | 'EL_ANALISTA';

export function quienDecide(config: ActivityTypeConfig): QuienDecide {
  if (config.defaultAssignmentMode === 'ON_HIRE') return 'TODOS';
  if (config.defaultAssignmentMode === 'BY_JOB_TITLE') return 'POR_CARGO';
  return 'EL_ANALISTA';
}

/** Una jornada con fecha pide instructor, lugar, horario y cupo; lo permanente no pide nada de eso. */
export function esJornada(config: ActivityTypeConfig): boolean {
  return config.defaultOfferingKind !== 'PERMANENT';
}

/**
 * Lo que le pasa a una formacion de este tipo, en frases cortas, para ensenarlo al ELEGIR el tipo.
 *
 * Se enseña antes de crear nada porque el tipo cambia el resto del formulario: si no se dice, la
 * primera señal de que "induccion general" obliga a toda la empresa llega cuando ya obligo a toda
 * la empresa.
 */
export function consecuenciasDelTipo(config: ActivityTypeConfig): string[] {
  const frases: string[] = [];

  const quien = quienDecide(config);
  if (quien === 'TODOS') frases.push('Se le exige a toda la empresa, sin marcar a nadie.');
  if (quien === 'POR_CARGO') frases.push('Se le exige a los cargos que la tengan en su matriz.');
  if (quien === 'EL_ANALISTA') frases.push('Tu decides a quien se le exige, en la pestana Quienes.');

  if (config.defaultRecurrenceMonths) {
    frases.push(
      config.defaultRecurrenceMonths === 12
        ? 'Se repite cada año.'
        : `Se repite cada ${config.defaultRecurrenceMonths} meses.`,
    );
  }
  if (config.requiresBeforeHire) frases.push('Debe hacerse antes de empezar a trabajar.');

  frases.push(
    esJornada(config)
      ? 'Se dicta en jornadas con fecha, lugar e instructor.'
      : 'Queda disponible para hacerla cuando se pueda.',
  );

  if (config.participatesInPlan) frases.push('Cuenta para los indicadores del plan anual.');
  frases.push(config.issuesCertificate ? 'Emite constancia al cumplirla.' : 'No emite constancia.');

  return frases;
}

/**
 * LO QUE EL TIPO PIDE Y ESTA VERSION NO TRAE.
 *
 * Misma regla que el servidor (`api/src/activities/type-requirements.ts`), y por eso las frases
 * son las mismas: si la pantalla dijera una cosa y el registro de auditoria otra, la que se cree
 * seria la equivocada. Se duplica el CALCULO —son diez lineas— y no la DECISION: el servidor es
 * quien la deja escrita al publicar.
 *
 * `requiresAssessment` y `requiresSurvey` se sembraron en el Sprint 1 y no los leia nadie: una
 * "Capacitacion del plan" se publicaba con un video y ninguna pantalla lo mencionaba.
 *
 * NO impide publicar (Decision #74): el tenant todavia no puede editar el config del tipo desde la
 * interfaz, asi que convertirlo en muro dejaria encerrado a quien no comparta la regla.
 */
export function loQueExigeElTipo(
  raw: Record<string, unknown> | null | undefined,
  contenidos: Array<{ type: string }>,
): string[] {
  const config = readTypeConfig(raw);
  const tipos = new Set(contenidos.map((c) => c.type));
  const faltan: string[] = [];

  if (config.requiresAssessment && !tipos.has('ASSESSMENT')) {
    faltan.push(
      'Este tipo de formación se evalúa: agrega una evaluación antes de publicar. Sin nota no hay nada que enseñarle a un auditor.',
    );
  }
  if (config.requiresSurvey && !tipos.has('SURVEY')) {
    faltan.push(
      'Este tipo de formación pide encuesta de satisfacción: agregala antes de publicar. Es la evaluación de reaccion que revisan BASC e ISO.',
    );
  }

  return faltan;
}
