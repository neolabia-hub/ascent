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
 * mal configurado que no pidiera examen dejaria formacion sin nota que enseñar; aqui, un tipo mal
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

/**
 * ¿LA ACREDITA UN TERCERO? (Decision #157, ampliada el 2026-09-06)
 *
 * Cuando es que si, la lista de asistencia de la jornada pide ademas el numero del certificado y su
 * fecha de vencimiento — y esa fecha MANDA sobre la vigencia que calcularia la recurrencia.
 *
 * ─── POR QUE NO BASTA CON EL TIPO ───
 *
 * Empezo viviendo solo en `activity_types.config` y el cliente lo cazo: *"el plan puede que haya
 * capacitaciones de ARL o externo que emitan o no certificados oficiales, o extraordinaria"*. Dentro
 * de la MISMA clase de formacion conviven las dos cosas: una charla de seguridad vial que dicta la
 * ARL y no certifica nada, y un curso de alturas que dicta la ARL y si. Preguntarlo solo por tipo
 * obliga a elegir mal en la mitad de los casos, y lo que se elige mal se rellena a mano o se salta.
 *
 * Es la MISMA cascada que la constancia y la eficacia, y vive junto a ellas por lo mismo: tres
 * archivos con la misma logica y distinto nombre se separan el dia que alguien corrige uno.
 *
 * `null` en la actividad = lo que diga su tipo, que es el caso normal.
 */
export function decidirCertificadoExterno(
  tipo: TipoDeFormacion | null,
  actividad: { tracksExternalCertificate: boolean | null },
): boolean {
  const cfg = (tipo?.config ?? {}) as Record<string, unknown>;
  return actividad.tracksExternalCertificate ?? cfg.tracksExternalCertificate === true;
}

/**
 * ¿SE PUEDE DAR POR CUMPLIDA CON UNA CERTIFICACION PREVIA DE OTRA EMPRESA? (via C, 2.3).
 *
 * Misma cascada que la de arriba y por el mismo motivo: dentro de la MISMA clase conviven las dos
 * cosas. Una recertificacion de alturas es transferible porque lo dice la norma; una recertificacion
 * interna sobre el procedimiento de un equipo propio no lo es, y las dos son "Recertificacion".
 *
 * `null` en la formacion = hereda del tipo. Y el defecto del tipo es `false`: lo raro es que un papel
 * ajeno valga, no al reves. Una induccion no la exime nada — por definicion enseña los
 * procedimientos de ESTA empresa.
 *
 * OJO, no confundir con `decidirCertificadoExterno`, que esta tres lineas arriba y suena parecido:
 *
 *   · aquella dice "cuando la hagamos AQUI, ademas queda un papel de un tercero"
 *   · esta dice "un papel que ya traia de OTRA empresa nos vale en lugar de hacerla"
 *
 * Son independientes: una formacion puede llevar papel de tercero y no admitir convalidacion (la
 * dicta la ARL, pero exigimos nuestra propia sesion), y al reves es raro pero posible.
 */
export function decidirConvalidacion(
  tipo: TipoDeFormacion | null,
  actividad: { admiteConvalidacion: boolean | null },
): boolean {
  const cfg = (tipo?.config ?? {}) as Record<string, unknown>;
  return actividad.admiteConvalidacion ?? cfg.admiteConvalidacion === true;
}

/**
 * CUANTO VALE LA CONSTANCIA CUANDO HAY VARIAS REGLAS VIVAS (2026-09-08).
 *
 * La vigencia sale de la recurrencia del requisito —si hay que repetirla cada 12 meses, el papel
 * vale 12 meses— y eso funcionaba mientras hubiera UNA regla. Pero puede haber varias: publicar una
 * induccion crea sola su regla de "toda la empresa", y ademas se la puede exigir a un cargo con
 * recurrencia propia.
 *
 * Con dos, la consulta cogia la que devolviera primero la base de datos. Si esa era la que NO tiene
 * recurrencia, la constancia se emitia **sin fecha de vencimiento**, y una constancia sin vencimiento
 * es una acreditacion que el informe de Vencimientos no puede ver: la persona sale del radar hasta
 * que alguien se acuerde. El resultado dependia del orden de las filas, que es la peor clase de
 * fallo — no falla siempre y no se parece a su causa.
 *
 * SE QUEDA LA MAS CORTA. Si una regla dice que hay que repetirla cada 12 meses y otra no dice nada,
 * la acreditacion deja de valer a los 12: la obligacion mas exigente es la que manda, y equivocarse
 * hacia el lado de avisar antes es un error que se corrige mirando, mientras que el otro se descubre
 * en una auditoria.
 *
 * Las reglas de FECHA FIJA —"cada 31 de enero"— no cuentan: ahi el vencimiento es un dia del
 * calendario y no un plazo desde que se curso, y mezclarlas daria una vigencia inventada.
 */
export function vigenciaMasCorta(recurrencias: unknown[]): number | null {
  const meses = recurrencias
    .map((recurrencia) => {
      if (!recurrencia || typeof recurrencia !== 'object') return null;
      const valor = (recurrencia as Record<string, unknown>).everyMonths;
      return typeof valor === 'number' && valor > 0 ? valor : null;
    })
    .filter((valor): valor is number => valor !== null);

  return meses.length === 0 ? null : Math.min(...meses);
}

/**
 * ¿DE DONDE SALE que esta formacion lleve papel de un tercero: de su ficha o de su tipo?
 *
 * No cambia ninguna decision — la toma `decidirCertificadoExterno` — pero la pantalla necesita poder
 * DECIRLO, y esa es la mitad que faltaba: el 2026-09-08 el cliente vio una *Induccion especifica*
 * pidiendo papel de un tercero y no tuvo como averiguar por que. Enseñar el nombre de la formacion
 * sin decir quien lo pide obliga a abrir la ficha, comprobar que esta en `null`, ir a Configuracion
 * y mirar el tipo — cuatro pantallas para responder una pregunta que el servidor ya sabe.
 *
 * `HEREDADO` significa que la ficha no dice nada y manda su clase; `PROPIO`, que alguien lo decidio
 * para ESTA formacion. La diferencia es la que dice donde hay que ir a cambiarlo.
 */
export function origenDelCertificadoExterno(actividad: {
  tracksExternalCertificate: boolean | null;
}): 'PROPIO' | 'HEREDADO' {
  return actividad.tracksExternalCertificate === null ? 'HEREDADO' : 'PROPIO';
}

/**
 * SI LA DICTA LA EMPRESA, NO HAY TERCERO QUE CERTIFIQUE (2026-09-06, extraido aqui el 2026-09-08).
 *
 * Un certificado **externo** es por definicion el de alguien de fuera. Con `executedBy: PROPIOS` no
 * hay fuera, asi que pedir su numero es pedir un dato que no existe — y un campo que no se puede
 * llenar se aprende a saltar.
 *
 * ─── POR QUE VIVE AQUI Y NO EN LA PANTALLA QUE LO USA ───
 *
 * Porque nacio dentro de la lista de asistencia y la segunda puerta —*Papeles de un tercero* en la
 * ficha de la persona— no se entero: filtraba solo por la cascada tipo → ficha y enseñaba filas
 * diciendo *"la dicto PROPIOS"* al lado de un campo para el numero del certificado, contradiciendose
 * en la misma linea (`PENDIENTES` 2.5). Un criterio copiado a mano en dos pantallas se separa; uno
 * importado de un sitio, no.
 *
 * ─── Y NO ES UNA COMPUERTA ───
 *
 * Decide QUE PIDE la pantalla, no que se pueda guardar. La compuerta sigue siendo la de la formacion
 * (409 `TYPE_DOES_NOT_TRACK_EXTERNAL_CERT`). Hay tenants —un centro de entrenamiento acreditado—
 * donde «propios» y «certificado oficial» conviven, y rechazarlo aqui seria convertir una suposicion
 * nuestra sobre como trabajan las empresas en una regla del producto.
 */
export function laDictaUnTercero(executedBy: string | null | undefined): boolean {
  return (executedBy ?? 'PROPIOS') !== 'PROPIOS';
}
