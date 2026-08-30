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
 *   - APROBADO / EN EJECUCION sin que nadie haya empezado
 *                           → se borra, REVOCANDO sus obligaciones y diciendo cuantas. Un plan
 *                             aprobado por error el viernes y detectado el lunes es un error, no
 *                             historia, y obligar a arrastrarlo todo el ano ensucia el indicador
 *                             de cumplimiento de la empresa entera.
 *   - Con alguien que YA EMPEZO → NO. Ese avance es de una persona, no del plan, y borrarlo seria
 *                             borrarle a alguien lo que hizo. Se cancelan los renglones o se
 *                             cierra el ano, que es lo que el auditor espera encontrar.
 *   - CERRADO               → NO, nunca. Cerrar es exactamente lo que lo convierte en evidencia
 *                             (por eso tampoco se reabre).
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
    return {
      allowed: false,
      code: 'PLAN_CLOSED_IS_EVIDENCE',
      message: 'El plan cerrado es la evidencia del ano: no se borra ni se reabre.',
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
