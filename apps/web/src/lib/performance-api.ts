import { apiFetch } from './api';
import { descargarArchivo } from './certificates-api';

/**
 * EVALUACION DE DESEMPENO (Decision #134). Ver `docs/modulos/desempeno.md`.
 *
 * Modulo aparte de la formacion a proposito: no comparte tablas ni indicadores con las
 * capacitaciones, porque el cliente pidio expresamente que no se mezclen.
 */

export type EscalaCompetencia = 'ONE_TO_FIVE' | 'ONE_TO_TEN' | 'YES_NO' | 'TEXT_ONLY';

/** Como se llama y como se responde cada escala. Un solo sitio para las tres pantallas. */
export const ESCALAS: Record<EscalaCompetencia, { label: string; tope: number | null; ayuda: string }> = {
  ONE_TO_FIVE: { label: '1 a 5', tope: 5, ayuda: '1 = muy por debajo · 5 = sobresaliente' },
  ONE_TO_TEN: { label: '1 a 10', tope: 10, ayuda: '1 = muy por debajo · 10 = sobresaliente' },
  YES_NO: { label: 'Cumple / no cumple', tope: 1, ayuda: 'Sin matices: cumple o no cumple' },
  TEXT_ONLY: { label: 'Solo texto', tope: null, ayuda: 'No da nota: se responde escribiendo' },
};

export interface Competencia {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scale: EscalaCompetencia;
  active: boolean;
  displayOrder: number;
  suggestedActivityId: string | null;
}

export interface FormularioItem {
  id: string;
  competencyId: string;
  weight: number;
  displayOrder: number;
  competency: Competencia;
}

/** Una competencia que viene del formulario base, con el peso que le dio la base. */
export interface ItemHeredado {
  competencyId: string;
  weight: number;
  competency: Competencia;
}

export interface Formulario {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  items: FormularioItem[];
  jobTitles: { jobTitleId: string; jobTitle: { id: string; name: string } }[];
  /**
   * DE DONDE HEREDA LAS COMUNES (Decision #141). `null` = no hereda de nadie.
   *
   * Las heredadas van PRIMERO en la evaluacion: quien califica lee lo de toda la empresa y despues
   * lo del cargo.
   */
  baseFormId: string | null;
  base: { id: string; name: string; items: ItemHeredado[] } | null;
  /** Usos en campañas, y cuantos formularios cuelgan de este como base. */
  _count: { cycleForms: number; derivados: number };
}

export type EstadoCiclo = 'DRAFT' | 'OPEN' | 'CLOSED';

/** Un formulario DENTRO de una campaña. La copia congelada vive aqui, una por formulario. */
export interface FormularioDelCiclo {
  id: string;
  formId: string;
  form: { id: string; name: string };
}

export interface Ciclo {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: EstadoCiclo;
  selfEvaluation: boolean;
  visibleToEmployee: boolean;
  requiresSignature: boolean;
  openedAt: string | null;
  closedAt: string | null;
  /**
   * LOS FORMULARIOS DE LA CAMPANA (Decision #139). Varios: el de conductores y el de analistas son
   * la misma campaña, y cada persona responde el de su cargo.
   */
  forms: FormularioDelCiclo[];
  _count: { reviews: number };
  /**
   * LAS CIFRAS DE LA CAMPAÑA, en la propia lista (2026-09-09). Las mismas que el consolidado y el
   * Excel, calculadas por el mismo metodo en el servidor. Estan aqui para que el estado de la
   * campaña se vea sin abrir nada.
   */
  cifras: CifrasDeCiclo;
}

export type RolEvaluador = 'SELF' | 'MANAGER';
export type EstadoEvaluacion = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED';

/** Una competencia dentro de la copia congelada del ciclo. */
export interface ItemDeFormulario {
  competencyId: string;
  name: string;
  description: string | null;
  scale: EscalaCompetencia;
  weight: number;
}

export interface Evaluacion {
  id: string;
  cycleId: string;
  subjectUserId: string;
  evaluatorUserId: string;
  reviewerRole: RolEvaluador;
  status: EstadoEvaluacion;
  score: string | null;
  comment: string | null;
  submittedAt: string | null;
  signedAt: string | null;
  subjectName: string | null;
  subjectJobTitle: string | null;
  subjectArea: string | null;
  evaluatorName: string | null;
  cycle?: {
    id: string;
    name: string;
    endsAt?: string;
    requiresSignature?: boolean;
    visibleToEmployee?: boolean;
  };
  /**
   * EL FORMULARIO QUE LE TOCO A ESTA PERSONA, con su copia congelada (Decision #139).
   *
   * De aqui salen las preguntas, y no del ciclo: en la misma campaña el conductor y el analista
   * responden formularios distintos. Y si alguien renombro o retiro una competencia despues, esta
   * evaluacion sigue preguntando lo que preguntaba — que es lo unico que permite compararla con
   * las demas del mismo año.
   */
  cycleForm?: {
    id: string;
    form: { name: string };
    formSnapshot?: { formId: string; name: string; items: ItemDeFormulario[] } | null;
  };
  answers?: { competencyId: string; competencyName: string; value: number | null; comment: string | null }[];
}

/**
 * Lo que devuelve abrir un ciclo: cuantas evaluaciones se generaron, y las DOS listas de quienes
 * se quedan fuera — sin jefe que los evalue, o sin formulario que los reclame.
 */
export interface AperturaDeCiclo {
  evaluaciones: number;
  sinEvaluador: { userId: string; motivo: 'SIN_AREA' | 'SIN_RESPONSABLE' | 'ES_SU_PROPIO_JEFE' }[];
  sinFormulario: { userId: string; motivo: 'SIN_CARGO' | 'CARGO_SIN_FORMULARIO' }[];
}

export const MOTIVOS_SIN_EVALUADOR: Record<AperturaDeCiclo['sinEvaluador'][number]['motivo'], string> = {
  SIN_AREA: 'No tiene área asignada',
  SIN_RESPONSABLE: 'Su área no tiene responsable',
  ES_SU_PROPIO_JEFE: 'Dirige su propia área',
};

export const MOTIVOS_SIN_FORMULARIO: Record<AperturaDeCiclo['sinFormulario'][number]['motivo'], string> = {
  SIN_CARGO: 'No tiene cargo, y el ciclo no lleva formulario general',
  CARGO_SIN_FORMULARIO: 'Ningún formulario del ciclo cubre su cargo',
};

/** Las cifras de una campaña, o de uno de sus formularios. Se cuentan igual. */
export interface CifrasDeCiclo {
  total: number;
  entregadas: number;
  firmadas: number;
  promedio: number | null;
}


/** Un corte del promedio de una competencia: «en Logistica, 52 %». */
export interface CortePorCompetencia {
  nombre: string;
  promedio: number | null;
}

/**
 * EL RESULTADO DE UNA COMPETENCIA en la campaña. Es la unidad del analisis: contesta «¿en qué
 * estamos flojos?», y sus dos cortes contestan «¿dónde?» y «¿a quién?».
 */
export interface ResultadoDeCompetencia {
  competencyId: string;
  name: string;
  escala: 'ONE_TO_FIVE' | 'ONE_TO_TEN' | 'YES_NO' | 'TEXT_ONLY';
  /** Cuantas respuestas con valor la sostienen. Un promedio de dos respuestas no es un diagnostico. */
  respuestas: number;
  promedio: number | null;
  /** Separados a proposito: la diferencia entre los dos ES el analisis. */
  promedioJefe: number | null;
  promedioAuto: number | null;
  /** La formacion que la refuerza, si el catalogo la declara. Es la costura hacia el plan. */
  formacion: { id: string; name: string } | null;
  porArea: CortePorCompetencia[];
  porCargo: CortePorCompetencia[];
}

/** Las cifras de un grupo de personas —un area, un cargo—, con su nombre. */
export interface GrupoDeCiclo extends CifrasDeCiclo {
  nombre: string;
}

export interface Consolidado extends CifrasDeCiclo {
  cycle: Ciclo;
  /** El mismo recuento, formulario a formulario: es para lo que sirve tenerlos en una campaña. */
  porFormulario: (CifrasDeCiclo & { cycleFormId: string; name: string })[];
  /** EL ANALISIS (2026-09-09): en que estamos flojos, donde y con quien. Ver `docs/modulos/desempeno.md`. */
  porCompetencia: ResultadoDeCompetencia[];
  /** Agrupa por el ÁREA GRANDE: la madre, cuando la persona está en una sub-área. */
  porArea: GrupoDeCiclo[];
  /**
   * El corte fino, por la sub-área de cada quien. En una empresa sin sub-áreas sale idéntico a
   * `porArea` y la pantalla no lo enseña. Cuando las hay, es el que dice **con qué jefatura
   * hablar**: «Gestión Humana 3,4» no señala a nadie; «Nómina 2,8» sí.
   */
  porSubArea: GrupoDeCiclo[];
  porCargo: GrupoDeCiclo[];
  items: Evaluacion[];
}

// ── Catalogo ──────────────────────────────────────────────────────────────

export function listCompetencias(): Promise<Competencia[]> {
  return apiFetch('/desempeno/competencias', { method: 'GET' });
}

export function crearCompetencia(body: unknown): Promise<Competencia> {
  return apiFetch('/desempeno/competencias', { method: 'POST', body });
}

export function actualizarCompetencia(id: string, body: unknown): Promise<Competencia> {
  return apiFetch(`/desempeno/competencias/${id}`, { method: 'PATCH', body });
}

export function listFormularios(): Promise<Formulario[]> {
  return apiFetch('/desempeno/formularios', { method: 'GET' });
}

export function guardarFormulario(id: string | null, body: unknown): Promise<Formulario> {
  return id
    ? apiFetch(`/desempeno/formularios/${id}`, { method: 'PATCH', body })
    : apiFetch('/desempeno/formularios', { method: 'POST', body });
}

// ── Ciclos ────────────────────────────────────────────────────────────────

export function listCiclos(): Promise<Ciclo[]> {
  return apiFetch('/desempeno/ciclos', { method: 'GET' });
}

export function crearCiclo(body: unknown): Promise<Ciclo> {
  return apiFetch('/desempeno/ciclos', { method: 'POST', body });
}

export function abrirCiclo(id: string): Promise<AperturaDeCiclo> {
  return apiFetch(`/desempeno/ciclos/${id}/abrir`, { method: 'POST' });
}

export function cerrarCiclo(id: string): Promise<Ciclo> {
  return apiFetch(`/desempeno/ciclos/${id}/cerrar`, { method: 'POST' });
}

export function getConsolidado(id: string): Promise<Consolidado> {
  return apiFetch(`/desempeno/ciclos/${id}/consolidado`, { method: 'GET' });
}

/**
 * El consolidado ENTERO, en Excel. La pantalla se queda en 100 filas; el archivo no.
 *
 * El nombre lo decide el servidor —lleva ciclo y fecha— y llega en la cabecera del archivo, asi que
 * aqui no se inventa uno: dos sitios nombrando el mismo fichero acaban discrepando.
 */
export function descargarConsolidadoXlsx(id: string, nombreCiclo: string): Promise<void> {
  const limpio = nombreCiclo.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'ciclo';
  const hoy = new Date().toISOString().slice(0, 10);
  return descargarArchivo(`/desempeno/ciclos/${id}/consolidado/xlsx`, `desempeno-${limpio}-${hoy}.xlsx`);
}

// ── Evaluar y leer lo propio ──────────────────────────────────────────────

export function misEvaluaciones(): Promise<Evaluacion[]> {
  return apiFetch('/desempeno/mis-evaluaciones', { method: 'GET' });
}

export function sobreMi(): Promise<Evaluacion[]> {
  return apiFetch('/desempeno/sobre-mi', { method: 'GET' });
}

export function getEvaluacion(id: string): Promise<Evaluacion> {
  return apiFetch(`/desempeno/${id}`, { method: 'GET' });
}

export function entregarEvaluacion(
  id: string,
  body: { answers: { competencyId: string; value: number | null; comment?: string | null }[]; comment?: string | null },
): Promise<{ ok: true; score: number | null }> {
  return apiFetch(`/desempeno/${id}/entregar`, { method: 'POST', body });
}

export function firmarEvaluacion(id: string): Promise<{ ok: true; signedAt: string }> {
  return apiFetch(`/desempeno/${id}/firmar`, { method: 'POST' });
}
