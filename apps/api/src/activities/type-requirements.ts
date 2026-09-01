/**
 * LO QUE EL TIPO EXIGE PARA PODER PUBLICAR.
 *
 * `activity_types.config` decide como se comporta cada tipo (Decision #66), y tres de sus campos
 * —`requiresAssessment`, `requiresSurvey` e `issuesCertificate`— se sembraron en el Sprint 1 y
 * **no los leia nadie**.
 * La consecuencia: una "Capacitacion del plan", que los tiene los dos en `true`, se publicaba con
 * un video y nada mas, sin examen y sin encuesta, y ninguna pantalla decia una palabra.
 *
 * Es la misma familia que `participatesInPlan` y `defaultAssignmentMode`: configuracion que la
 * interfaz PROMETE y el motor ignora. Y aqui el precio se paga tarde y en el peor sitio: sin
 * examen no hay nota que ensenarle al auditor, y sin encuesta no hay nivel 1 de Kirkpatrick
 * (CLAUDE.md 3.8), que es lo que BASC pide como evaluacion anual.
 *
 * Vive aparte y pura, como `plan-deletion.ts`: es una regla de negocio que decide si algo se
 * publica, y tiene que poder leerse y probarse sin base de datos.
 *
 * NO se comprueba al crear ni al editar, solo al PUBLICAR. Un borrador se arma a trozos —primero
 * el video, la semana que viene el examen— y bloquearlo mientras se arma es pelearse con quien
 * esta trabajando. Publicar es el acto que lo convierte en lo que la gente va a cursar.
 */

/** Lo minimo que hace falta saber de una pieza de contenido para juzgar la version. */
export interface PiezaDeContenido {
  type: string;
}

/**
 * Devuelve las frases de lo que FALTA, en el idioma de quien publica. Vacio = se puede publicar.
 *
 * Cada frase dice **que falta y por que se pide**, no un codigo: "necesita una evaluacion" a secas
 * deja a alguien preguntandose si es un capricho del sistema, y la respuesta —que sin nota no hay
 * nada que ensenar en una auditoria— es la que hace que no se discuta.
 */
export function loQueExigeElTipo(config: unknown, contenidos: PiezaDeContenido[]): string[] {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const tipos = new Set(contenidos.map((c) => c.type));
  const faltan: string[] = [];

  // Por defecto SI exige evaluacion (es el defecto del config en todo el producto): un tipo mal
  // configurado tiene que caer del lado que protege el registro, no del que lo relaja.
  const exigeEvaluacion = typeof cfg.requiresAssessment === 'boolean' ? cfg.requiresAssessment : true;
  const exigeEncuesta = cfg.requiresSurvey === true;

  if (exigeEvaluacion && !tipos.has('ASSESSMENT')) {
    faltan.push(
      'Este tipo de formacion se evalua: agrega una evaluacion antes de publicar. Sin nota no hay nada que ensenarle a un auditor.',
    );
  }

  /*
    LA ENCUESTA YA NO SE PIDE A MANO (Decision #116).

    Antes esto decia "agrega una encuesta antes de publicar", y esta mal por dos motivos:

      1. **Una encuesta de satisfaccion es UN instrumento de la empresa, no uno por formacion.**
         Si cada formacion tuviera preguntas distintas, no se podria calcular "la satisfaccion del
         plan 2026" — que es justo el numero que se quiere. Las mismas preguntas para todo es lo
         que hace comparables los resultados.
      2. **Lo que hay que acordarse de agregar doscientas veces se olvida**, y el hueco aparece en
         el indicador meses despues.

    Asi que la encuesta la elige el TIPO una vez, y al publicar se engancha sola al final. Lo unico
    que puede faltar ahora es que el tipo no tenga ninguna elegida, y eso se arregla en un sitio y
    para todas.
  */
  if (exigeEncuesta && !tipos.has('SURVEY') && !cfg.surveyTemplateId) {
    faltan.push(
      'Este tipo de formacion pide encuesta y no tiene ninguna elegida. Elige cual en Configuracion > Tipos de formacion: se agregara sola al final de todas las de este tipo.',
    );
  }

  return faltan;
}
