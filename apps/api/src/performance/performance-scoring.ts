/**
 * DESEMPENO: LA NOTA Y A QUIEN SE EVALUA (Decision #134).
 *
 * Calculo puro, sin base de datos, por lo mismo que `plan-metrics.ts`: son las dos reglas que hay
 * que poder discutir con el cliente sin levantar nada, y las que no pueden cambiar por accidente.
 */

export type EscalaCompetencia = 'ONE_TO_FIVE' | 'ONE_TO_TEN' | 'YES_NO' | 'TEXT_ONLY';

/** El maximo de cada escala. Es lo que permite promediar un formulario que mezcla escalas. */
const TOPE: Record<EscalaCompetencia, number | null> = {
  ONE_TO_FIVE: 5,
  ONE_TO_TEN: 10,
  YES_NO: 1,
  // Sin escala no hay nota: es texto. No es un cero.
  TEXT_ONLY: null,
};


/**
 * UNA RESPUESTA, EN PORCENTAJE DE SU ESCALA.
 *
 * La saco aparte el 2026-09-09, cuando el consolidado empezo a promediar POR COMPETENCIA: esa
 * cuenta y la nota de una persona tienen que aplicar exactamente la misma regla —un 4 de 5 es 80,
 * un «cumple» es 100, y lo que no se respondio no es un cero— o el promedio de la competencia y la
 * nota de quien la respondio dirian cosas distintas sobre los mismos numeros.
 */
export function notaDeRespuesta(escala: EscalaCompetencia, valor: number | null): number | null {
  const tope = TOPE[escala];
  if (tope === null || valor === null) return null;
  return (valor / tope) * 100;
}
export interface RespuestaCalificable {
  escala: EscalaCompetencia;
  /** `null` = no se respondio, o la competencia era de solo texto. */
  valor: number | null;
  /** Peso relativo dentro del formulario. Con todos a 1 es un promedio simple. */
  peso: number;
}

/**
 * LA NOTA DE UNA EVALUACION: promedio ponderado, normalizado a 100.
 *
 * ─── POR QUE SE NORMALIZA ───
 *
 * Un formulario puede mezclar "1 a 5" con "cumple / no cumple". Promediar los numeros crudos daria
 * que un "cumple" (1) hunde la nota de alguien con cincos, que es exactamente lo contrario de lo
 * que significa. Cada respuesta se lleva primero a su porcentaje de la escala —un 4 sobre 5 es 80,
 * un "cumple" es 100— y despues se promedia.
 *
 * ─── LO QUE NO SE RESPONDIO NO CUENTA COMO CERO ───
 *
 * Un cero es una calificacion pesima; no haber contestado es no haber contestado. Se saca del
 * promedio y del denominador. Si no queda ninguna respuesta calificable, la nota es `null` y no 0:
 * un formulario de solo texto no tiene nota, y decir "0" seria acusar a alguien de algo que nadie
 * evaluo.
 */
export function calcularNota(respuestas: RespuestaCalificable[]): number | null {
  let suma = 0;
  let pesos = 0;

  for (const respuesta of respuestas) {
    const nota = notaDeRespuesta(respuesta.escala, respuesta.valor);
    if (nota === null) continue;
    const peso = Math.max(1, respuesta.peso);
    suma += nota * peso;
    pesos += peso;
  }

  if (pesos === 0) return null;
  // Un decimal: dos fingirian una precision que no existe cuando alguien marca "4 de 5".
  return Math.round((suma / pesos) * 10) / 10;
}

export interface PersonaAEvaluar {
  userId: string;
  areaId: string | null;
  jobTitleId: string | null;
  /** Con que formulario del ciclo se le evalua. Lo decide `repartirFormularios`. */
  cycleFormId: string;
}

export interface EvaluacionAGenerar {
  subjectUserId: string;
  evaluatorUserId: string;
  reviewerRole: 'SELF' | 'MANAGER';
  cycleFormId: string;
}

// ─────────────────────────  EL REPARTO DE FORMULARIOS  ─────────────────────────

export interface FormularioDelCiclo {
  /** La fila de `performance_cycle_forms`: el formulario DENTRO de esta campaña. */
  cycleFormId: string;
  /** Los cargos que declara. Vacio = es el general del ciclo. */
  jobTitleIds: string[];
}

export interface SinFormulario {
  userId: string;
  motivo: 'SIN_CARGO' | 'CARGO_SIN_FORMULARIO';
}

export interface ProblemaDeReparto {
  /** Un cargo reclamado por dos formularios del mismo ciclo. */
  cargosSolapados: string[];
  /** Cuantos formularios generales lleva el ciclo. Mas de uno es ambiguo. */
  generales: number;
}

/**
 * LO QUE HACE IMPOSIBLE REPARTIR, antes de repartir.
 *
 * Dos formularios del mismo ciclo que reclaman el mismo cargo, o dos generales, dejan el reparto a
 * merced del orden de la consulta: el conductor respondera uno u otro segun quien se guardo
 * primero. Eso no es un detalle que se resuelve eligiendo — es una campaña que no se puede abrir, y
 * se dice antes de generar seiscientas evaluaciones.
 */
export function problemasDeReparto(formularios: FormularioDelCiclo[]): ProblemaDeReparto {
  const vistos = new Map<string, number>();
  for (const formulario of formularios) {
    for (const cargo of formulario.jobTitleIds) {
      vistos.set(cargo, (vistos.get(cargo) ?? 0) + 1);
    }
  }
  return {
    cargosSolapados: [...vistos.entries()].filter(([, cuantos]) => cuantos > 1).map(([cargo]) => cargo),
    generales: formularios.filter((formulario) => formulario.jobTitleIds.length === 0).length,
  };
}

/**
 * A CADA PERSONA, SU FORMULARIO (Decision #139).
 *
 * ─── EL CARGO MANDA, Y EL GENERAL RECOGE ───
 *
 * El formulario que declara cargos se lleva a las personas de esos cargos; el que no declara
 * ninguno es el general de la campaña y recoge a quien no encaje en otro. Es exactamente lo que ya
 * significaba «sin cargos = a toda la empresa» cuando el ciclo llevaba un solo formulario, asi que
 * una campaña de un formulario se comporta igual que antes.
 *
 * ─── QUIEN NO ENCAJA SE REPORTA, NO SE COLOCA EN CUALQUIERA ───
 *
 * Sin formulario general, quien tenga un cargo que nadie reclama se queda fuera y se dice, con el
 * mismo criterio que quien se queda sin jefe: meterlo en el primer formulario disponible seria
 * preguntarle a un conductor por competencias de analista, y eso se descubre cuando ya lo respondio.
 */
export function repartirFormularios(
  personas: { userId: string; jobTitleId: string | null }[],
  formularios: FormularioDelCiclo[],
): { asignaciones: Map<string, string>; sinFormulario: SinFormulario[] } {
  const porCargo = new Map<string, string>();
  for (const formulario of formularios) {
    for (const cargo of formulario.jobTitleIds) porCargo.set(cargo, formulario.cycleFormId);
  }
  const general = formularios.find((formulario) => formulario.jobTitleIds.length === 0) ?? null;

  const asignaciones = new Map<string, string>();
  const sinFormulario: SinFormulario[] = [];

  for (const persona of personas) {
    const propio = persona.jobTitleId ? porCargo.get(persona.jobTitleId) : undefined;
    const elegido = propio ?? general?.cycleFormId;
    if (!elegido) {
      sinFormulario.push({
        userId: persona.userId,
        motivo: persona.jobTitleId ? 'CARGO_SIN_FORMULARIO' : 'SIN_CARGO',
      });
      continue;
    }
    asignaciones.set(persona.userId, elegido);
  }

  return { asignaciones, sinFormulario };
}

export interface SinEvaluador {
  userId: string;
  motivo: 'SIN_AREA' | 'SIN_RESPONSABLE' | 'ES_SU_PROPIO_JEFE';
}

/**
 * QUIEN EVALUA A QUIEN, al abrir un ciclo.
 *
 * ─── EL JEFE SALE DEL AREA ───
 *
 * `areas.responsible_user_id`, que ya existe desde el Sprint 5 (se anadio para la eficacia). No
 * hace falta una jerarquia nueva: son diez areas frente a seiscientas personas, y una jerarquia
 * paralela es una cosa mas que mantener al dia y otra fuente de verdad que puede contradecir a la
 * primera.
 *
 * ─── QUIEN NO TIENE JEFE SE REPORTA, NO SE INVENTA ───
 *
 * Si un area no tiene responsable, o la persona ES la responsable de su area, no se fabrica una
 * evaluacion con un evaluador cualquiera: se devuelve aparte, con el motivo. Abrir un ciclo con
 * cuarenta evaluaciones asignadas a quien no corresponde es peor que abrirlo con cuarenta avisos —
 * lo primero se descubre cuando alguien recibe una evaluacion que no le toca.
 *
 * La AUTOEVALUACION si se genera siempre que el ciclo la pida, tenga jefe o no: es de la persona
 * sobre si misma y no depende de nadie mas.
 */
export function planificarEvaluaciones(
  personas: PersonaAEvaluar[],
  responsablePorArea: Map<string, string>,
  opciones: { autoevaluacion: boolean },
): { evaluaciones: EvaluacionAGenerar[]; sinEvaluador: SinEvaluador[] } {
  const evaluaciones: EvaluacionAGenerar[] = [];
  const sinEvaluador: SinEvaluador[] = [];

  for (const persona of personas) {
    if (opciones.autoevaluacion) {
      evaluaciones.push({
        subjectUserId: persona.userId,
        evaluatorUserId: persona.userId,
        reviewerRole: 'SELF',
        cycleFormId: persona.cycleFormId,
      });
    }

    if (!persona.areaId) {
      sinEvaluador.push({ userId: persona.userId, motivo: 'SIN_AREA' });
      continue;
    }

    const jefe = responsablePorArea.get(persona.areaId);
    if (!jefe) {
      sinEvaluador.push({ userId: persona.userId, motivo: 'SIN_RESPONSABLE' });
      continue;
    }

    if (jefe === persona.userId) {
      // Quien dirige el area no se califica a si misma como si fuera su jefe: esa evaluacion la
      // tiene que asignar una persona, y por eso sale en la lista de avisos.
      sinEvaluador.push({ userId: persona.userId, motivo: 'ES_SU_PROPIO_JEFE' });
      continue;
    }

    evaluaciones.push({
      subjectUserId: persona.userId,
      evaluatorUserId: jefe,
      reviewerRole: 'MANAGER',
      cycleFormId: persona.cycleFormId,
    });
  }

  return { evaluaciones, sinEvaluador };
}
