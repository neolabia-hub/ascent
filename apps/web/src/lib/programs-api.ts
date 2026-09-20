/**
 * Cliente tipado de PROGRAMAS (2026-09-14): varias formaciones agrupadas bajo un solo paraguas,
 * certificadas como un conjunto. Ver `apps/api/src/programs/programs.service.ts`.
 */
import { apiFetch } from './api';
import type { AudienceRule } from './delivery-api';

export type ProgramStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type PathItemType = 'ACTIVITY' | 'PATH';

export interface ProgramListItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  active: boolean;
  totalModulos: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramModule {
  id: string;
  itemType: PathItemType;
  itemId: string;
  displayOrder: number;
  isRequired: boolean;
  sectionName: string | null;
  minRequiredInSection: number | null;
  actividad: { id: string; name: string; activityType: { name: string } } | null;
  /** Su tipo se exige solo a toda la empresa al publicarse (induccion general, reinduccion). */
  exigenciaAutomatica: boolean;
  /** Y esa exigencia automatica alcanza solo a quien ingrese, no a la plantilla actual. */
  soloAlIngresar: boolean;
  /** Ya tiene una regla de asignacion activa, venga de donde venga. */
  yaExigido: boolean;
  /** Quien tiene que hacer ESTE modulo, por nombre. Vacia = no se le exige a nadie. */
  audiencias: string[];
  /** Sin publicar no la puede hacer nadie: bloquea que el programa llegue a completarse. */
  publicada: boolean;
  /** Tuvo regla y se la quitaron. Distinto de no haberla tenido nunca. */
  reglaRetirada: boolean;
  /** "MM-DD" si su regla es una campana anual de fecha fija. `null` si no se repite asi. */
  fechaDeCampana: string | null;
}

/** Un cupo, dicho como se declara: "de `total`, puede perder `puedePerder`". */
export interface ProgramSection {
  name: string;
  total: number;
  minimo: number;
  puedePerder: number;
}

/** A quien se le exige el programa, agrupado por audiencia. Incluye las reglas automaticas. */
export interface ProgramObligados {
  id: string;
  name: string;
  /** En cuantos modulos del programa aplica. Menos que el total suele ser un error de config. */
  modulos: number;
  trigger: string;
  /** La regla solo alcanza a quien entre despues: no toca a la plantilla actual. */
  soloNuevos: boolean;
}

export interface ProgramDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  active: boolean;
  items: ProgramModule[];
  secciones: ProgramSection[];
  obligados: ProgramObligados[];
  /**
   * A cuántas personas se les exige ALGUNO de los módulos pero **no todos**. Es la cuenta que dice
   * si el programa funciona, y se hace POR PERSONA y no por audiencia: dos audiencias distintas
   * pueden alcanzar a la misma gente —una píldora marcada a todos los cargos llega a la plantilla
   * entera igual que «Toda la empresa»— y comparar audiencias daba falsas alarmas sobre programas
   * sanos. Ver `ProgramsService.contarPorPersona`.
   */
  afectados: number;
  /** A cuántas se les exigen TODOS: esas sí lo completarán y tendrán la constancia del conjunto. */
  conTodos: number;
}

export function listPrograms(): Promise<ProgramListItem[]> {
  return apiFetch('/programas', { method: 'GET' });
}

export function getProgram(id: string): Promise<ProgramDetail> {
  return apiFetch(`/programas/${id}`, { method: 'GET' });
}

export function createProgram(body: { code: string; name: string; description?: string | null }): Promise<ProgramListItem> {
  return apiFetch('/programas', { method: 'POST', body });
}

export function updateProgram(
  id: string,
  body: { name?: string; description?: string | null; active?: boolean },
): Promise<ProgramListItem> {
  return apiFetch(`/programas/${id}`, { method: 'PATCH', body });
}

/**
 * A QUIÉN LE CUESTA PUBLICAR ESTE PROGRAMA (2026-09-16).
 *
 * `afectados` son las personas a las que se les exige **alguno** de sus módulos pero **no todos**:
 * al publicar pierden la constancia individual de lo que sí hacen, y como nunca podrán completar el
 * programa, tampoco tendrán la del conjunto. Se quedan sin ningún papel.
 */
export interface ImpactoDePublicar {
  modulos: number;
  afectados: number;
  /** A quienes se les exigen TODOS: esos sí lo completarán y tendrán la constancia del conjunto. */
  conTodos: number;
}

export function impactoDePublicar(id: string): Promise<ImpactoDePublicar> {
  return apiFetch(`/programas/${id}/impacto-de-publicar`, { method: 'GET' });
}

export function publishProgram(id: string): Promise<ProgramListItem> {
  return apiFetch(`/programas/${id}/publicar`, { method: 'POST' });
}

export function unpublishProgram(id: string): Promise<ProgramListItem> {
  return apiFetch(`/programas/${id}/despublicar`, { method: 'POST' });
}

export function addModule(
  programId: string,
  body: { activityId: string; isRequired: boolean; sectionName?: string | null },
): Promise<ProgramModule> {
  return apiFetch(`/programas/${programId}/modulos`, { method: 'POST', body });
}

/** El cupo de un grupo. Es del PROGRAMA, no de un módulo: se declara una vez, con el grupo armado. */
export function setSectionMinimum(programId: string, sectionName: string, minRequiredInSection: number): Promise<ProgramDetail> {
  return apiFetch(`/programas/${programId}/grupos/minimo`, { method: 'POST', body: { sectionName, minRequiredInSection } });
}

export function updateModule(
  programId: string,
  itemId: string,
  body: { isRequired?: boolean; sectionName?: string | null },
): Promise<ProgramModule> {
  return apiFetch(`/programas/${programId}/modulos/${itemId}`, { method: 'PATCH', body });
}

export function removeModule(programId: string, itemId: string): Promise<void> {
  return apiFetch(`/programas/${programId}/modulos/${itemId}`, { method: 'DELETE' });
}

/** Sube o baja un modulo: se manda el orden completo de ids, no un delta. */
export function reorderModules(programId: string, itemIds: string[]): Promise<void> {
  return apiFetch(`/programas/${programId}/modulos/reordenar`, { method: 'POST', body: { itemIds } });
}

export interface AssignProgramResult {
  modulos: number;
  reach: number;
  obligacionesCreadas: number;
  porModulo: Array<{ activityId: string; ruleId: string; created: number; updated: boolean }>;
}

/** Exigir el programa entero a una audiencia, en un solo boton (PENDIENTES 11.3). */
export function assignProgram(
  programId: string,
  body: {
    scope: AudienceRule;
    trigger: 'ON_HIRE' | 'ON_JOIN';
    dueDaysAfterTrigger: number;
    everyMonths?: number | null;
    fixedDate?: string | null;
    soloNuevos?: boolean;
    reason?: string | null;
  },
): Promise<AssignProgramResult> {
  return apiFetch(`/programas/${programId}/asignar`, { method: 'POST', body });
}

// ─────────────────────────── Lado del aprendiz ───────────────────────────

export interface MyProgramModule {
  id: string;
  isRequired: boolean;
  sectionName: string | null;
  actividad: { id: string; name: string; coverKey: string | null } | null;
  aprobado: boolean;
}

export interface MyProgram {
  id: string;
  code: string;
  name: string;
  description: string | null;
  estado: 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | string;
  progressPct: number;
  completedAt: string | null;
  modulos: MyProgramModule[];
}

export function getMyPrograms(): Promise<MyProgram[]> {
  return apiFetch('/me/programas', { method: 'GET' });
}

/** De qué programas es módulo una formación. Incluye los que están en borrador. */
export function getProgramasDeFormacion(activityId: string): Promise<Array<{ id: string; name: string; status: ProgramStatus }>> {
  return apiFetch(`/programas/de-formacion/${activityId}`, { method: 'GET' });
}
