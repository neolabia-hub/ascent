/**
 * ¿ESTA FORMACION ENTREGA CONSTANCIA, Y POR CUANTO TIEMPO VALE? (Decision #111)
 *
 * ─── LA PREGUNTA NO ES POR FORMACION, ES POR CLASE DE FORMACION ───
 *
 * Lo destapo el cliente: *"una pildora no creo que necesite certificado"*. Y tiene razon, pero lo
 * importante es la forma de la respuesta, no el caso. Emitir un papel por una pildora de tres
 * minutos devalua el papel y llena el expediente de ruido; una induccion o una capacitacion del
 * plan lo emiten SIEMPRE porque son exactamente lo que el auditor pide ver. Eso no cambia entre
 * las doscientas formaciones de una empresa: cambia entre sus seis TIPOS.
 *
 * Por eso la decision baja en cascada —la misma que ya gobierna la nota minima y los intentos
 * (Decision #27)— y no es una casilla suelta por formacion: lo que hay que marcar doscientas veces
 * se olvida, y el olvido se descubre el dia de la auditoria.
 *
 *     TIPO (activity_types.config)  ->  ACTIVIDAD (puede desviarse)  ->  SNAPSHOT al publicar
 *
 * ─── LOS CASOS REALES QUE HAY QUE CUBRIR ───
 *
 * | Situacion | Que pasa |
 * |---|---|
 * | Pildora de 3 minutos | El tipo dice que no. Sin constancia |
 * | Induccion general | El tipo dice que si. Constancia al terminar |
 * | Capacitacion del plan | El tipo dice que si: es lo que sostiene el indicador anual |
 * | Charla extraordinaria de 10 min | El tipo dice que si, pero el analista la desmarca |
 * | Una pildora que ES el refuerzo anual de alturas | El tipo dice que no, y el analista la marca |
 * | La persona reprueba | Sin constancia. No se acredita lo que no se aprobo |
 * | Formacion recurrente (reinduccion anual) | Una constancia por ronda, y VENCE cuando toca repetirla |
 *
 * ─── LA VIGENCIA SALE DE LA RECURRENCIA, NO DE UN CAMPO NUEVO ───
 *
 * Si una formacion hay que repetirla cada 12 meses, su constancia vale 12 meses: el dia que toca
 * repetirla es exactamente el dia en que deja de acreditar. Pedirle al analista que escriba la
 * vigencia APARTE seria pedirle el mismo dato dos veces y garantizar que algun dia no coincidan
 * —y entonces habria un papel diciendo "vigente" sobre algo que el sistema ya reclama vencido—.
 *
 * Sin recurrencia, la constancia NO vence. Es lo correcto: una induccion que se hace una vez al
 * entrar acredita para siempre que se hizo.
 */

export interface TipoDeFormacion {
  /** `activity_types.config`, tal cual viene de la base de datos. */
  config: unknown;
}

export interface DecisionDeConstancia {
  emite: boolean;
  /** Meses de vigencia, o `null` si no vence. Sale de la recurrencia del requisito. */
  vigenciaMeses: number | null;
}

/**
 * Resuelve la cascada. `actividad` es lo que decidio el analista para ESTA formacion:
 * `null` = hereda del tipo, que es el caso normal.
 *
 * POR DEFECTO NO EMITE cuando el tipo no dice nada. Es la direccion segura, y al reves que
 * `requiresAssessment` —que por defecto SI exige— porque los riesgos son opuestos: alli, un tipo
 * mal configurado que no pidiera examen dejaria formacion sin nota que ensenar; aqui, un tipo mal
 * configurado que emitiera de mas llenaria el expediente de papeles que nadie pidio y devaluaria
 * los que si importan. En los dos casos gana lo que protege el registro.
 */
export function decidirConstancia(
  tipo: TipoDeFormacion | null,
  actividad: { issuesCertificate: boolean | null; recurrenceMonths: number | null },
): DecisionDeConstancia {
  const cfg = (tipo?.config ?? {}) as Record<string, unknown>;
  const porTipo = cfg.issuesCertificate === true;
  const emite = actividad.issuesCertificate ?? porTipo;

  return {
    emite,
    // Cero o negativo no es una vigencia: es un dato mal metido, y una constancia que nace vencida
    // es peor que una que no vence.
    vigenciaMeses: emite && actividad.recurrenceMonths && actividad.recurrenceMonths > 0
      ? actividad.recurrenceMonths
      : null,
  };
}

/**
 * La fecha en que deja de acreditar, o `null` si no vence.
 *
 * Se cuenta desde que se COMPLETO, no desde que se emitio el papel: son la misma fecha hoy, pero
 * dejaran de serlo el dia que se pueda reimprimir o emitir a mano una constancia atrasada —y
 * entonces contar desde la impresion regalaria meses de vigencia que nadie curso.
 */
export function vencimientoDe(completadoEn: Date, vigenciaMeses: number | null): Date | null {
  if (vigenciaMeses === null) return null;
  const vence = new Date(completadoEn);
  vence.setMonth(vence.getMonth() + vigenciaMeses);
  return vence;
}

/**
 * ¿SE MIDE LA EFICACIA de esta formacion? (Decision #118)
 *
 * Misma cascada que la constancia y por la misma razon de forma —un solo patron para "lo decide el
 * tipo salvo que la formacion diga otra cosa"— pero con el criterio invertido en la practica: la
 * eficacia es la EXCEPCION, no la regla.
 *
 * Lo explico el cliente mejor que nadie: *"en el plan puede haber situaciones donde no se requiere
 * y en otras si; pero si el plan la tiene marcada aplicara a todos"*. Por eso la decision util
 * vive en la formacion concreta, y el tipo solo pone el punto de partida.
 *
 * Vive en este archivo y no en uno propio porque es la MISMA cascada sobre el MISMO config: dos
 * archivos con la misma logica y distinto nombre se separan el dia que alguien corrige uno.
 */
export function decidirEficacia(
  tipo: TipoDeFormacion | null,
  actividad: { requiresEfficacy: boolean | null },
): boolean {
  const cfg = (tipo?.config ?? {}) as Record<string, unknown>;
  return actividad.requiresEfficacy ?? cfg.requiresEfficacy === true;
}
