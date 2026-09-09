/**
 * BORRAR UN PLAN — donde esta la linea entre un error y la evidencia.
 *
 * Hasta ahora un plan no se podia borrar de ninguna forma, y eso convertia cada prueba, cada
 * nombre mal escrito y cada plan duplicado en un renglon permanente de la lista. La regla
 * anterior protegia lo correcto —un plan aprobado obliga a personas— aplicandola a TODO, incluido
 * el plan que nadie llego a abrir.
 *
 * Lo que de verdad hay que proteger no es el plan: es lo que la GENTE ya hizo contra el. Por eso
 * la frontera no es el estado, es si alguien EMPEZO.
 *
 *   - BORRADOR              → se borra. Nunca obligo a nadie; no hay nada que reescribir.
 *   - CERRADO SIN NINGUNA OBLIGACION
 *                           → se borra. Un plan que se cerro sin haber obligado a nadie no es
 *                             evidencia de nada: es un ensayo. Desde que hay UN plan por año
 *                             (Decision #71) dejarlo puesto bloquea el año entero.
 *   - APROBADO / EN EJECUCION sin que nadie haya empezado
 *                           → se borra, REVOCANDO sus obligaciones y diciendo cuantas. Un plan
 *                             aprobado por error el viernes y detectado el lunes es un error, no
 *                             historia, y obligar a arrastrarlo todo el año ensucia el indicador
 *                             de cumplimiento de la empresa entera.
 *   - Con alguien que YA EMPEZO → NO. Ese avance es de una persona, no del plan, y borrarlo seria
 *                             borrarle a alguien lo que hizo. Se cancelan los renglones o se
 *                             cierra el año, que es lo que el auditor espera encontrar.
 *   - CERRADO CON OBLIGACIONES → NO. Cerrar es lo que lo convierte en evidencia. Pero ya no es un
 *                             callejon sin salida: se REABRE con motivo auditado, que deja rastro
 *                             donde borrar no lo dejaria.
 *
 * Vive aparte y pura, como `version-migration.ts` y `progress-rules.ts`: es una decision
 * irreversible sobre datos de personas y tiene que poder leerse y probarse sin levantar nada.
 */

export type PlanDeletionStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'CLOSED';

export interface PlanDeletionFacts {
  status: PlanDeletionStatus;
  /** Obligaciones vivas creadas por el plan (assignments source = PLAN de sus renglones). */
  obligations: number;
  /** Personas que ya abrieron alguna de esas obligaciones. Una sola basta para bloquear. */
  started: number;
}

export type PlanDeletionVerdict =
  | { allowed: true; revokes: number }
  | { allowed: false; code: string; message: string };

export function decidePlanDeletion(facts: PlanDeletionFacts): PlanDeletionVerdict {
  if (facts.status === 'CLOSED') {
    /**
     * UN PLAN CERRADO QUE NUNCA OBLIGO A NADIE NO ES EVIDENCIA DE NADA.
     *
     * La regla anterior —"cerrado no se borra ni se reabre"— protegia lo correcto y lo aplicaba a
     * todo, y desde que hay UN plan por año (Decision #71) eso dejo de ser una molestia y paso a
     * ser una TRAMPA: un plan de ensayo que alguien cerro por probar el boton ocupa 2026 para
     * siempre, y ya no se puede planear el año ni programar nada en el. Sin salida en la interfaz,
     * la unica salida real era entrar a la base de datos.
     *
     * Lo que hay que proteger sigue siendo lo mismo que en el resto de esta funcion: el registro
     * de PERSONAS. Si el plan no creo ni una obligacion, no hay registro que defender.
     *
     * Cuando SI obligo a alguien, borrar sigue prohibido — pero ya no es un callejon sin salida:
     * se REABRE (`changeStatus` a ACTIVE, con motivo auditado). Reabrir deja rastro; borrar no.
     */
    if (facts.obligations === 0 && facts.started === 0) {
      return { allowed: true, revokes: 0 };
    }
    return {
      allowed: false,
      code: 'PLAN_CLOSED_IS_EVIDENCE',
      message:
        'El plan cerrado ya obligo a gente: es la evidencia del año y no se borra. Si hay que corregirlo, reabrelo.',
    };
  }

  if (facts.started > 0) {
    return {
      allowed: false,
      code: 'PLAN_HAS_EVIDENCE',
      message:
        facts.started === 1
          ? 'Una persona ya empezo una formacion de este plan: ese avance es suyo. Cancela los renglones o cierra el plan.'
          : `Ya hay ${facts.started} personas que empezaron formaciones de este plan: ese avance es suyo. Cancela los renglones o cierra el plan.`,
    };
  }

  return { allowed: true, revokes: facts.obligations };
}

/**
 * ¿Hace falta que quien borra escriba POR QUE?
 *
 * En borrador no: es una lista de trabajo y pedir un motivo para tirar un ensayo es ruido. En
 * cuanto el plan fue aprobado si, porque aunque nadie haya empezado, hubo gente a la que se le
 * anuncio una obligacion y ahora va a desaparecer de su bandeja. Alguien tiene que poder
 * responder que paso.
 */
export function deletionNeedsJustification(status: PlanDeletionStatus): boolean {
  return status !== 'DRAFT';
}
