/**
 * Cliente tipado de la ENTREGA de la formacion (Sprint 3): convocatorias, audiencias,
 * requisitos, asignaciones y plan anual.
 *
 * Nombres tecnicos solo aqui: en pantalla se dice Convocatoria, Requisito, Obligacion y Plan.
 */
import { apiFetch, getAccessToken } from './api';
import type { Modality } from './catalog-api';

// ─────────────────────────── Convocatorias ───────────────────────────

export type OfferingKind = 'EVENT' | 'PERMANENT' | 'HYBRID';
export type OfferingStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ExecutedBy = 'PROPIOS' | 'TEMPORALES' | 'ARL' | 'EPS' | 'OTROS';

export interface OfferingActivityRef {
  id: string;
  versionNumber: number;
  /** RETIRED = se publico una version posterior y esta convocatoria quedo atras. */
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  activity: {
    id: string;
    code: string;
    name: string;
    /** Version vigente de la formacion. Si no coincide con la de arriba, esto esta desactualizado. */
    currentVersionId: string | null;
    /** El `config` viaja para saber si esta convocatoria puede contar para el plan. */
    activityType: { code: string; name: string; colorHex: string | null; config: Record<string, unknown> };
    process: { id: string; code: string; name: string };
  };
}

/** Una convocatoria colgada de una version que ya no es la vigente. */
export function isOutdatedVersion(ref: OfferingActivityRef): boolean {
  return ref.activity.currentVersionId !== null && ref.activity.currentVersionId !== ref.id;
}

export type MigrationPolicyCode = 'FINISH_OLD' | 'RESTART_NEW' | 'MOVE_NOT_STARTED';

/**
 * Que pasaria al apuntar la convocatoria a la version vigente. Se pide ANTES de ofrecer el
 * boton: mover a gente ya citada exige saber a cuantos afecta.
 */
export interface VersionUpgrade {
  available: boolean;
  reason: 'UP_TO_DATE' | 'OFFERING_CLOSED' | 'NO_PUBLISHED_TARGET' | null;
  current: { id: string; versionNumber: number; status: string };
  target: { id: string; versionNumber: number; publishedAt: string | null; migrationPolicy: MigrationPolicyCode } | null;
  enrollments: {
    total: number;
    moving: number;
    keepOldVersion: number;
    frozen: number;
    alreadyOnTarget: number;
    conflicted: number;
  } | null;
}

export interface OfferingListItem {
  /** Quien la dicto: la siguiente jornada de la misma formacion lo hereda. */
  executedBy?: string;
  executedByOther?: string | null;
  id: string;
  code: string;
  kind: OfferingKind;
  modality: Modality;
  status: OfferingStatus;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  location: string | null;
  projectedCount: number | null;
  projectedFrozenAt: string | null;
  regional: { id: string; name: string } | null;
  activityVersion: OfferingActivityRef;
  _count: { enrollments: number };
}

export interface OfferingsPage {
  total: number;
  page: number;
  pageSize: number;
  items: OfferingListItem[];
}

export interface ProjectedAudience {
  count: number;
  source: 'OBLIGATIONS' | 'RULES' | 'NONE';
  detail: string;
}

export interface OfferingDetail extends Omit<OfferingListItem, '_count'> {
  intensityTheoryHours: string | number | null;
  intensityPracticeHours: string | number | null;
  instructorUserId: string | null;
  instructorExternalName: string | null;
  executedBy: ExecutedBy;
  executedByOther: string | null;
  capacity: number | null;
  observations: string | null;
  cancelledReason: string | null;
  projectedAdjustReason: string | null;
  regionalId: string | null;
  instructor: { id: string; fullName: string; email: string; jobTitle: { name: string } } | null;
  obligedCount: number;
  derivedProjected: ProjectedAudience;
  /**
   * ¿Esta formacion se acredita con el papel de un tercero? Viene RESUELTO por el servidor —sale de
   * la formacion con su tipo de respaldo— para que la cascada se interprete en un solo sitio.
   */
  registraCertificadoExterno: boolean;
  /** Quien dicta la jornada ("ARL Sura", "PROPIOS"): es el emisor por defecto del certificado. */
  quienLaDicto: string;
  /**
   * ¿Se cierra con lista de asistencia? Viene RESUELTO del servidor —presencial o hibrida, y que no
   * sea de autoservicio—. La pantalla no repite la condicion: ya cambio una vez.
   */
  admiteAsistencia: boolean;
  /** 'Como se acredita' puesto a mano en esta jornada. `null` = lo que diga su modalidad. */
  closesByAttendance: boolean | null;
  planItems: Array<{ id: string; plannedMonth: number; status: string; plan: { id: string; name: string; year: number; status: string } }>;
  /** La TAJADA: a que parte de los obligados atiende esta jornada (Decision #68). */
  audience: { id: string; name: string; rule: AudienceRule } | null;
  versionUpgrade: VersionUpgrade;
  _count: { enrollments: number };
}

export interface OfferingBody {
  activityVersionId?: string;
  kind: OfferingKind;
  modality: Modality;
  /** Como se acredita esta jornada. `null` = lo que diga su modalidad, que es el caso normal. */
  closesByAttendance?: boolean | null;
  scheduledDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  intensityTheoryHours?: number | null;
  intensityPracticeHours?: number | null;
  instructorUserId?: string | null;
  instructorExternalName?: string | null;
  executedBy: ExecutedBy;
  executedByOther?: string | null;
  location?: string | null;
  regionalId?: string | null;
  capacity?: number | null;
  observations?: string | null;
  /** A quienes atiende. Sin facetas o null = a todos los obligados. */
  audienceScope?: AudienceRule | null;
}

/** Respuesta de las acciones que pueden pasar por aprobacion (publicar, cancelar). */
export interface GatedResult<T> {
  executed: boolean;
  approvalId?: string;
  result?: T;
}

export function listOfferings(params: {
  q?: string;
  status?: string;
  kind?: string;
  activityId?: string;
  year?: number;
  page?: number;
  pageSize?: number;
}): Promise<OfferingsPage> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return apiFetch(`/offerings?${search.toString()}`, { method: 'GET' });
}

export function getOffering(id: string): Promise<OfferingDetail> {
  return apiFetch(`/offerings/${id}`, { method: 'GET' });
}

export function createOffering(body: OfferingBody): Promise<OfferingDetail> {
  return apiFetch('/offerings', { method: 'POST', body });
}

export function updateOffering(id: string, body: OfferingBody): Promise<OfferingDetail> {
  return apiFetch(`/offerings/${id}`, { method: 'PATCH', body });
}

export function publishOffering(
  id: string,
  body: { projectedOverride?: number; projectedAdjustReason?: string; justification?: string },
): Promise<GatedResult<OfferingDetail>> {
  return apiFetch(`/offerings/${id}/publish`, { method: 'POST', body: { ...body, confirm: true } });
}

/**
 * AJUSTAR los proyectados de una convocatoria ya publicada, con motivo (Decision #56).
 *
 * Devuelve `GatedResult` como publicar y cancelar: quien no tiene `offerings:publish` no recibe
 * un 403 sino una solicitud enviada al administrador, y la pantalla tiene que decir cual de las
 * dos cosas paso.
 */
export function adjustProjected(
  id: string,
  body: { projectedCount: number; reason: string },
): Promise<GatedResult<OfferingDetail>> {
  return apiFetch(`/offerings/${id}/adjust-projected`, { method: 'POST', body });
}

export function cancelOffering(id: string, cancelledReason: string): Promise<GatedResult<OfferingDetail>> {
  return apiFetch(`/offerings/${id}/cancel`, { method: 'POST', body: { cancelledReason } });
}

export function completeOffering(id: string): Promise<OfferingDetail> {
  return apiFetch(`/offerings/${id}/complete`, { method: 'POST' });
}

export function getVersionUpgrade(id: string): Promise<VersionUpgrade> {
  return apiFetch(`/offerings/${id}/version-upgrade`, { method: 'GET' });
}

/**
 * La version destino se manda EXPLICITA: es la que el administrador vio en pantalla. Si mientras
 * decidia se publico otra, el servidor rechaza en vez de mover a la gente a algo no revisado.
 */
export function migrateOfferingVersion(
  id: string,
  targetVersionId: string,
  justification?: string,
): Promise<GatedResult<OfferingDetail>> {
  return apiFetch(`/offerings/${id}/migrate-version`, {
    method: 'POST',
    body: { targetVersionId, justification, confirm: true },
  });
}

export interface RosterRow {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  finalScore: string | number | null;
  assignmentId: string | null;
  /** Cuando se marco que ASISTIO. */
  attendedAt: string | null;
  /**
   * PRESENT / ABSENT / JUSTIFIED, o `null` = **todavia sin revisar**, que no es lo mismo que
   * ausente: la primera es trabajo pendiente y la segunda es evidencia de que se le convoco y no
   * vino. Sale de `attendance_records`, no de la inscripcion.
   */
  attendanceStatus: AsistenciaEstado | null;
  attendanceNote: string | null;
  /** Como se marco: INSTRUCTOR hoy; QR y SIGNATURE cuando se construyan (CLAUDE.md 3.7). */
  attendanceMethod: 'INSTRUCTOR' | 'QR' | 'SIGNATURE' | null;
  extCertIssuer: string | null;
  extCertNumber: string | null;
  extCertIssuedAt: string | null;
  extCertValidUntil: string | null;
  /** La clave del escaneo, si lo hay. Para verlo hay que pedirlo firmado a `/media/sign`. */
  extCertFileKey: string | null;
  user: { id: string; fullName: string; documentNumber: string; jobTitle: { name: string }; area: { name: string } };
}

/** Los tres estados de la lista de asistencia (CLAUDE.md 3.7). */
export type AsistenciaEstado = 'PRESENT' | 'ABSENT' | 'JUSTIFIED';

/** El papel de un tercero, cuando el tipo de formacion lo lleva (Decision #157). */
export interface CertificadoExterno {
  /** Opcional: por defecto lo pone el servidor desde quien dicta la jornada. */
  issuer?: string;
  number: string;
  issuedAt?: string;
  /** Lo que dice el papel. MANDA sobre la vigencia que calcularia la recurrencia. */
  validUntil?: string;
  /** El escaneo, ya subido con `subirEvidencia`. Viaja la CLAVE, nunca el archivo. */
  fileKey?: string;
}

/**
 * LA LISTA DE ASISTENCIA de una jornada (Decision #157).
 *
 * Se manda entera y no persona a persona: marcar asistencia es un acto sobre el GRUPO —se lee la
 * hoja firmada de arriba abajo— y enviarla de una en una dejaria la jornada a medias si el
 * navegador se cae en el decimoquinto.
 */
export function marcarAsistencia(
  id: string,
  body: {
    heldOn?: string;
    items: {
      enrollmentId: string;
      estado: AsistenciaEstado;
      /** Obligatorio en JUSTIFIED: una justificacion sin motivo no justifica nada. */
      motivo?: string;
      certificate?: CertificadoExterno;
    }[];
    /**
     * EL ACTA FIRMADA DE LA JORNADA. Una por jornada y no por persona: lo que se escanea es la hoja
     * entera con las cuarenta firmas, y trocearla por persona seria inventar un documento que no
     * existe. El papel de un tercero, en cambio, SI es de cada quien y va en su `certificate`.
     */
    attendanceSheetKey?: string;
  },
): Promise<{ revisadas: number; cerradas: number; ausentes: number; justificados: number; ignoradas: string[]; acta: boolean }> {
  return apiFetch(`/offerings/${id}/attendance`, { method: 'POST', body });
}

export function getRoster(id: string): Promise<{ total: number; items: RosterRow[] }> {
  return apiFetch(`/offerings/${id}/roster`, { method: 'GET' });
}

export function enrollOffering(
  id: string,
  body: { allAssigned?: boolean; userIds?: string[] },
): Promise<{
  enrolled: number;
  skipped: number;
  /** Obligados que NO cupieron. Es lo que permite decir "faltan 17, programa otra jornada". */
  sinCupo: number;
  capacity: number | null;
}> {
  return apiFetch(`/offerings/${id}/enroll`, { method: 'POST', body: { allAssigned: false, userIds: [], ...body } });
}

// ─────────────────────────── Audiencias y requisitos ───────────────────────────

export interface AudienceRule {
  match: 'ALL' | 'ANY';
  jobTitleIds: string[];
  jobTitleTypeIds: string[];
  areaIds: string[];
  regionalIds: string[];
  /** Linea de servicio. Solo alcanza a quien la tenga puesta en su ficha. */
  serviceIds: string[];
  employmentTypes: string[];
  roadActors: string[];
}

export const EMPTY_RULE: AudienceRule = {
  match: 'ALL',
  jobTitleIds: [],
  jobTitleTypeIds: [],
  areaIds: [],
  regionalIds: [],
  serviceIds: [],
  employmentTypes: [],
  roadActors: [],
};

export interface AudienceRow {
  id: string;
  name: string;
  rule: AudienceRule;
  isDynamic: boolean;
  active: boolean;
  memberCount: number;
  ruleCount: number;
  updatedAt: string;
}

export interface AudiencePreview {
  count: number;
  reachesEveryone: boolean;
  sample: Array<{ id: string; fullName: string; jobTitle: { name: string }; area: { name: string } }>;
}

export function listAudiences(): Promise<AudienceRow[]> {
  return apiFetch('/audiences', { method: 'GET' });
}

export function previewAudience(rule: AudienceRule): Promise<AudiencePreview> {
  return apiFetch('/audiences/preview', { method: 'POST', body: rule });
}

export function createAudience(body: { name: string; rule: AudienceRule; isDynamic?: boolean }): Promise<AudienceRow> {
  return apiFetch('/audiences', { method: 'POST', body });
}

/** Una faceta que EXISTE entre los obligados de la formacion, con cuantos hay. */
export interface FacetCount {
  id: string;
  count: number;
}

export interface ProjectedPreview {
  /** Obligados que caen DENTRO de la tajada: el numero que se congela al publicar. */
  count: number;
  /** Obligados en total, sin tajada: el denominador de "N de M". */
  total: number;
  source: 'OBLIGATIONS' | 'RULES' | 'NONE';
  detail: string;
  facets: {
    jobTitles: FacetCount[];
    areas: FacetCount[];
    regionals: FacetCount[];
    services: FacetCount[];
  };
}

/**
 * Los proyectados de una convocatoria que todavia no existe. NO es `previewAudience`: aquella
 * cuenta gente de la EMPRESA que encaja con las facetas —con los campos vacios, la plantilla
 * entera— y esta cuenta OBLIGADOS dentro del corte, que es lo que de verdad se congela.
 */
export function previewProjected(body: {
  activityVersionId: string;
  scope: AudienceRule;
  regionalId: string | null;
}): Promise<ProjectedPreview> {
  return apiFetch('/offerings/proyectados', { method: 'POST', body });
}

/**
 * Que dispara la obligacion. `PLAN` es el unico que NO dispara nada: guarda a quienes se le va
 * a exigir una capacitacion del plan, y las obligaciones las crea el plan al aprobar el renglon
 * (Decision #76). Lo pone el servidor; la pantalla no lo ofrece.
 */
export type RuleTrigger = 'ON_JOIN' | 'ON_HIRE' | 'SCHEDULED' | 'PLAN';

export interface Recurrence {
  everyMonths?: number;
  fixedDate?: string;
  windowDays: number;
}

export interface AssignmentRuleRow {
  id: string;
  audience: { id: string; name: string; active: boolean };
  targetType: string;
  targetId: string;
  targetName: string | null;
  trigger: RuleTrigger;
  dueDaysAfterTrigger: number | null;
  recurrence: Recurrence | null;
  active: boolean;
  assignmentCount: number;
  createdAt: string;
}

export function listAssignmentRules(): Promise<AssignmentRuleRow[]> {
  return apiFetch('/assignment-rules', { method: 'GET' });
}

export function createAssignmentRule(body: {
  audienceId: string;
  targetId: string;
  trigger: RuleTrigger;
  dueDaysAfterTrigger: number;
  recurrence?: Recurrence | null;
}): Promise<{ rule: AssignmentRuleRow; generated: number }> {
  return apiFetch('/assignment-rules', { method: 'POST', body: { targetType: 'ACTIVITY', ...body } });
}

export function updateAssignmentRule(id: string, body: { active?: boolean; dueDaysAfterTrigger?: number }): Promise<AssignmentRuleRow> {
  return apiFetch(`/assignment-rules/${id}`, { method: 'PATCH', body });
}

export interface JobTitleMatrix {
  /** `people`: cuanta gente tiene hoy ese cargo. Una casilla sin nadie detras no urge igual. */
  jobTitles: Array<{ id: string; code: string; name: string; jobTitleType: { name: string }; people: number }>;
  /** Solo las que se deciden POR CARGO (inducciones especificas). `published`: tiene contenido. */
  activities: Array<{
    id: string;
    code: string;
    name: string;
    activityType: { code: string; name: string; colorHex: string | null };
    published: boolean;
  }>;
  cells: Array<{
    jobTitleId: string;
    activityId: string;
    ruleId: string;
    trigger: string;
    dueDaysAfterTrigger: number | null;
    assignmentCount: number;
    /** Viene de un requisito de VARIOS cargos: se ve, pero se corrige en la ficha. */
    shared: boolean;
  }>;
  broaderRules: number;
}

export function getJobTitleMatrix(): Promise<JobTitleMatrix> {
  return apiFetch('/assignment-rules/job-title-matrix', { method: 'GET' });
}

export function toggleJobTitleMatrix(body: {
  jobTitleId: string;
  activityId: string;
  enabled: boolean;
  /** Dias respecto al ingreso. Por defecto -1: D1072 exige que la induccion sea PREVIA. */
  dueDaysAfterTrigger?: number;
  /** La novedad, cuando la casilla ya existia. El servidor la exige. */
  reason?: string | null;
}): Promise<{ enabled: boolean; ruleId: string | null; generated?: number }> {
  return apiFetch('/assignment-rules/job-title-matrix', { method: 'POST', body: { dueDaysAfterTrigger: -1, ...body } });
}

// ─────────────────────────── Asignaciones ───────────────────────────

export type AssignmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'WITHDRAWN_LEFT_AUDIENCE'
  /** El renglon del plan que la creo se cancelo: esa jornada ya no se dicta. */
  | 'WITHDRAWN_PLAN_ITEM_CANCELLED'
  | 'WAIVED'
  /** Cerro el periodo y no la hizo. SI cuenta como incumplimiento de ese periodo. */
  | 'EXPIRED_NOT_DONE';

export interface AssignmentRow {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  source: 'MANUAL' | 'RULE' | 'PLAN' | 'STATIC_SNAPSHOT';
  cycleNumber: number;
  dueAt: string | null;
  status: AssignmentStatus;
  assignedAt: string;
  completedAt: string | null;
  waivedReason: string | null;
  user: { id: string; fullName: string; documentNumber: string; jobTitle: { name: string }; area: { name: string } };
}

export interface AssignmentsPage {
  total: number;
  page: number;
  pageSize: number;
  items: AssignmentRow[];
}

export function listAssignments(params: {
  q?: string;
  status?: string;
  source?: string;
  targetId?: string;
  areaId?: string;
  page?: number;
}): Promise<AssignmentsPage> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return apiFetch(`/assignments?${search.toString()}`, { method: 'GET' });
}

export function createAssignments(body: {
  targetId: string;
  userIds?: string[];
  jobTitleIds?: string[];
  areaIds?: string[];
  regionalIds?: string[];
  serviceIds?: string[];
  dueAt?: string | null;
}): Promise<{ created: number; skipped: number }> {
  return apiFetch('/assignments', { method: 'POST', body: { targetType: 'ACTIVITY', ...body } });
}

export function waiveAssignment(id: string, waivedReason: string): Promise<AssignmentRow> {
  return apiFetch(`/assignments/${id}/waive`, { method: 'POST', body: { waivedReason } });
}

// ─────────────────────────── Plan anual ───────────────────────────

export type PlanStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'CLOSED';
export type PlanItemStatus = 'PLANNED' | 'EXECUTED' | 'RESCHEDULED' | 'CANCELLED';

export interface PlanRow {
  id: string;
  year: number;
  name: string;
  status: PlanStatus;
  /** La META de cumplimiento en porcentaje, o null si todavia no se acordo. */
  goalPct: number | null;
  approvedAt: string | null;
  itemCount: number;
  updatedAt: string;
  /**
   * Los indicadores del año, ya calculados. Vienen en el LISTADO a proposito: la pregunta que
   * trae a alguien a esa pantalla es "¿como vamos?", y antes habia que entrar a cada plan.
   */
  metrics: PlanMetrics;
}

export interface PlanItemFacts {
  itemId: string;
  plannedMonth: number;
  status: PlanItemStatus;
  projectedSnapshot: number | null;
  assigned: number;
  enrolled: number;
  trained: number;
}

export interface PlanMetrics {
  programmed: number;
  executed: number;
  cancelled: number;
  compliancePct: number;
  projected: number;
  assigned: number;
  enrolled: number;
  trained: number;
  coveragePct: number;
  byMonth: Array<{ month: number; programmed: number; executed: number; projected: number; trained: number }>;
}

export interface PlanItemRow {
  id: string;
  plannedMonth: number;
  projectedSnapshot: number | null;
  status: PlanItemStatus;
  notes: string | null;
  facts: PlanItemFacts | null;
  offering: {
    id: string;
    code: string;
    kind: OfferingKind;
    status: OfferingStatus;
    scheduledDate: string | null;
    projectedCount: number | null;
    regional: { id: string; name: string } | null;
    activityVersion: {
      id: string;
      versionNumber: number;
      activity: {
        id: string;
        name: string;
        /** Lo que necesita "otra jornada de esta misma": sin ellos el formulario no sabe que pedir. */
        modality: Modality;
        process: { id: string; code: string; name: string };
        activityType: { code: string; name: string; colorHex: string | null; config: Record<string, unknown> };
      };
    };
  };
}

export interface PlanDetail {
  id: string;
  year: number;
  name: string;
  objective: string | null;
  /** La META en porcentaje: cuanto del programa se compromete la empresa a ejecutar este año. */
  goalPct: number | null;
  scope: string | null;
  status: PlanStatus;
  approvedAt: string | null;
  items: PlanItemRow[];
  metrics: PlanMetrics;
  byProcess: Array<{ process: { id: string; code: string; name: string }; metrics: PlanMetrics }>;
}

export function listPlans(params: { year?: number; status?: string } = {}): Promise<PlanRow[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return apiFetch(`/plans?${search.toString()}`, { method: 'GET' });
}

export function getPlan(id: string): Promise<PlanDetail> {
  return apiFetch(`/plans/${id}`, { method: 'GET' });
}

/**
 * Se pide LO MISMO que al editar. El alta preguntaba solo año, nombre y objetivo, asi que la meta
 * y el alcance —que son parte del documento que revisa el auditor— habia que acordarse de
 * anadirlos despues, entrando al plan y abriendo "Editar". Un campo que solo existe en una de las
 * dos pantallas es un campo que se queda vacio.
 */
export function createPlan(body: {
  year: number;
  name: string;
  objective?: string | null;
  goalPct?: number | null;
  scope?: string | null;
}): Promise<PlanDetail> {
  return apiFetch('/plans', { method: 'POST', body });
}

/**
 * Corregir la cabecera. `justification` es OBLIGATORIA si el plan ya esta aprobado o en
 * ejecucion, y el `year` solo se acepta en borrador (ancla los vencimientos de los renglones).
 */
export function updatePlan(
  id: string,
  body: {
    year?: number;
    name?: string;
    objective?: string | null;
    goalPct?: number | null;
    scope?: string | null;
    justification?: string;
  },
): Promise<PlanDetail> {
  return apiFetch(`/plans/${id}`, { method: 'PATCH', body });
}

/**
 * Borrar el plan. El servidor decide si se puede: la frontera no es el estado sino si alguien
 * EMPEZO alguna formacion suya. Devuelve cuantas obligaciones revoco, para poder decirlo.
 */
export function deletePlan(id: string, body: { justification?: string } = {}): Promise<{ ok: true; revokedAssignments: number }> {
  return apiFetch(`/plans/${id}`, { method: 'DELETE', body: { confirm: true, ...body } });
}

/** `justification` es obligatoria si el plan ya esta aprobado o en ejecucion (Decision #55). */
export function addPlanItem(
  planId: string,
  body: { offeringId: string; plannedMonth: number; notes?: string | null; justification?: string },
): Promise<PlanDetail> {
  return apiFetch(`/plans/${planId}/items`, { method: 'POST', body });
}

/**
 * Mover el mes de un renglon es REPROGRAMAR: el servidor lo marca RESCHEDULED solo, para que el
 * indicador distinga lo que se movio de lo que se cumplio en su mes.
 */
export function updatePlanItem(
  itemId: string,
  body: { plannedMonth?: number; notes?: string | null; status?: 'PLANNED' | 'CANCELLED' },
): Promise<PlanItemRow> {
  return apiFetch(`/plans/items/${itemId}`, { method: 'PATCH', body });
}

export function removePlanItem(itemId: string): Promise<{ ok: true }> {
  return apiFetch(`/plans/items/${itemId}`, { method: 'DELETE' });
}

export function approvePlan(id: string): Promise<{ plan: PlanRow; assignments: number }> {
  return apiFetch(`/plans/${id}/approve`, { method: 'POST', body: { confirm: true } });
}

export function activatePlan(id: string): Promise<PlanRow> {
  return apiFetch(`/plans/${id}/activate`, { method: 'POST' });
}

export function closePlan(id: string): Promise<PlanRow> {
  return apiFetch(`/plans/${id}/close`, { method: 'POST' });
}

/**
 * REABRIR un plan cerrado, con motivo obligatorio.
 *
 * Cerrar es lo que convierte al plan en la evidencia del año, y por eso durante meses no se
 * reabria. Con un plan por año (Decision #71) esa regla paso a ser una trampa: un plan cerrado se
 * queda con el año y ya no hay forma de planear. Reabrir deja rastro en la auditoria; borrar no,
 * y por eso borrar sigue reservado al plan que nunca obligo a nadie.
 */
export function reopenPlan(id: string, justification: string): Promise<PlanRow> {
  return apiFetch(`/plans/${id}/reopen`, { method: 'POST', body: { confirm: true, justification } });
}

// ──────────── Exigir la formacion desde la formacion misma ────────────

/**
 * Un requisito visto desde la ficha: a quien alcanza, cuando vence y si se repite. Es la misma
 * regla que administra el modulo de Asignaciones, dicha sin la palabra "audiencia".
 */
export interface ActivityRequirement {
  id: string;
  audienceId: string;
  audienceName: string;
  scope: AudienceRule;
  reachesEveryone: boolean;
  trigger: RuleTrigger;
  dueDaysAfterTrigger: number;
  everyMonths: number | null;
  /** "Cada año antes del 31 de marzo" (MM-DD). Alternativa a `everyMonths`. */
  fixedDate: string | null;
  assignmentCount: number;
  /** Si solo obliga a quien entre desde que se creo. Cambia como se lee `reach`. */
  soloNuevos: boolean;
  /** Cuanta gente alcanza HOY. */
  reach: number;
}

export function listActivityRequirements(activityId: string): Promise<ActivityRequirement[]> {
  return apiFetch(`/activities/${activityId}/requirements`, { method: 'GET' });
}

export function setActivityRequirement(
  activityId: string,
  body: {
    scope: AudienceRule;
    trigger: 'ON_HIRE' | 'ON_JOIN';
    dueDaysAfterTrigger: number;
    everyMonths?: number | null;
    fixedDate?: string | null;
    reason?: string | null;
  },
): Promise<{ ruleId: string; audienceId: string; audienceName: string; created: number; updated: boolean }> {
  return apiFetch(`/activities/${activityId}/requirements`, { method: 'POST', body });
}

export function retireActivityRequirement(activityId: string, ruleId: string): Promise<{ ok: true }> {
  return apiFetch(`/activities/${activityId}/requirements/${ruleId}`, { method: 'DELETE' });
}

// ──────────── Convocados y quien falta por convocar ────────────

/**
 * La respuesta a "¿ya cite a todos los que me tocan?". `faltan` son personas obligadas dentro de
 * la tajada de la jornada que no estan inscritas en NINGUNA convocatoria de esa formacion: a
 * quien ya se cito el 12 de marzo no le falta nada por no estar en la del 19.
 */
export interface PendingInvites {
  proyectados: number;
  detalle: string;
  convocados: number;
  enEstaJornada: number;
  faltan: Array<{
    id: string;
    fullName: string;
    documentNumber: string;
    jobTitle: { name: string };
    area: { name: string };
  }>;
}

export function getPendingInvites(offeringId: string): Promise<PendingInvites> {
  return apiFetch(`/offerings/${offeringId}/pendientes-por-convocar`, { method: 'GET' });
}

/** Una evidencia ya subida: el papel de un tercero, o el acta firmada de la jornada. */
export interface EvidenciaSubida {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * SUBIR UNA EVIDENCIA DE ASISTENCIA.
 *
 * Va aparte de `uploadMedia` —el de contenido— por lo mismo que su endpoint: aquel pide
 * `lessons:manage` y crea un paquete reutilizable del catalogo, y esto pide `attendance:take` y
 * solo deja un archivo con su clave. Ver la nota larga en `media.controller.ts`.
 *
 * Devuelve la CLAVE y nada mas. El archivo no significa nada hasta que se manda dentro de la lista
 * (`certificate.fileKey`) o de la jornada (`attendanceSheetKey`): si quien lo sube cierra la ventana
 * sin guardar, queda un archivo huerfano —barato— y no una evidencia que no evidencia nada.
 */
export async function subirEvidencia(file: File): Promise<EvidenciaSubida> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', file);
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/media/evidencia`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detalle = (data ?? {}) as { title?: string; code?: string; message?: string };
    throw new Error(
      detalle.code === 'UNSUPPORTED_FILE_TYPE'
        ? (detalle.message ?? 'Tiene que ser un PDF o una imagen.')
        : (detalle.title ?? 'No se pudo subir el archivo.'),
    );
  }
  return data as EvidenciaSubida;
}


// ─────────────────────── La sala: QR de sesion, firma y acta (2.4) ───────────────────────

/** El codigo que se proyecta, con su QR ya dibujado y los segundos que le quedan. */
export interface SesionAbierta {
  codigo: string;
  expiraEn: string;
  segundos: number;
  /** PNG en `data:` — la pantalla no tiene que saber dibujar codigos de barras. */
  qr: string;
}

/**
 * Abrir o ROTAR el codigo de la sesion.
 *
 * Si el que hay sigue vigente devuelve el mismo: recargar la pantalla no puede invalidar el codigo
 * que la gente esta escaneando en ese momento.
 */
export function abrirSesion(offeringId: string): Promise<SesionAbierta> {
  return apiFetch(`/offerings/${offeringId}/sesion`, { method: 'POST' });
}

/** Cuantos se han marcado ya, para la cuenta en vivo mientras se proyecta. */
export function marcadosDeSesion(offeringId: string): Promise<{ inscritos: number; presentes: number }> {
  return apiFetch(`/offerings/${offeringId}/sesion/marcados`, { method: 'GET' });
}

/** Cerrarla a mano: el codigo deja de servir aunque no haya caducado. */
export function cerrarSesion(offeringId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/offerings/${offeringId}/sesion/cerrar`, { method: 'POST' });
}

export interface ActaDeSesion {
  id: string;
  generadaEl: string;
  /** SHA-256 de lo que el acta AFIRMA, no de los bytes del PDF. */
  huella: string;
  url: string;
  personas?: number;
  firmadas?: number;
}

/** Genera el acta con la lista, las firmas y su huella. Volver a generarla NO pisa la anterior. */
export function generarActa(offeringId: string): Promise<ActaDeSesion> {
  return apiFetch(`/offerings/${offeringId}/acta`, { method: 'POST' });
}

export function actasDe(offeringId: string): Promise<ActaDeSesion[]> {
  return apiFetch(`/offerings/${offeringId}/actas`, { method: 'GET' });
}

/** A que jornada corresponde un codigo, para poder decirlo ANTES de marcar nada. */
export interface JornadaDelCodigo {
  offeringId: string;
  code: string;
  formacion: string;
  fecha: string | null;
  lugar: string | null;
  segundos: number;
}

export function jornadaDelCodigo(codigo: string): Promise<JornadaDelCodigo> {
  return apiFetch(`/asistencia/${encodeURIComponent(codigo)}`, { method: 'GET' });
}

export function loMioEnLaJornada(
  codigo: string,
): Promise<{ marcada: boolean; estado: string | null; metodo: string | null; cuando: string | null; firmada: boolean }> {
  return apiFetch(`/asistencia/${encodeURIComponent(codigo)}/lo-mio`, { method: 'GET' });
}

/** MECANISMO 2: quedo presente con mi sello de tiempo. */
export function registrarmeEnLaJornada(
  codigo: string,
): Promise<{ ok: boolean; metodo: string; cerrada: boolean; firmada: boolean }> {
  return apiFetch(`/asistencia/${encodeURIComponent(codigo)}/registrarme`, { method: 'POST' });
}

/** MECANISMO 3: la firma, que ya esta subida, se ata a mi asistencia de esta jornada. */
export function firmarAsistencia(
  codigo: string,
  firmaKey: string,
): Promise<{ ok: boolean; metodo: string; cerrada: boolean; firmada: boolean }> {
  return apiFetch('/asistencia/firmar', { method: 'POST', body: { codigo, firmaKey } });
}

/**
 * Sube la firma (PNG del lienzo) y devuelve su clave.
 *
 * Puerta propia y no la de evidencia: el permiso es otro —`attendance:sign` lo tiene todo el mundo—
 * y por eso el servidor solo acepta PNG y 300 KB.
 */
export async function subirFirma(png: Blob): Promise<{ key: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', png, 'firma.png');
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/media/firma`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detalle = (data ?? {}) as { title?: string; message?: string };
    throw new Error(detalle.message ?? detalle.title ?? 'No se pudo guardar la firma.');
  }
  return data as { key: string };
}

/** Una formacion cumplida que lleva papel de un tercero, vista desde la ficha de la persona. */
export interface PapelDeTercero {
  enrollmentId: string;
  completedAt: string | null;
  /** Para poder ABRIR la formacion desde la fila, y comprobar por que pide papel. */
  actividadId: string;
  actividad: string;
  tipo: string | null;
  convocatoria: { id: string; code: string; scheduledDate: string | null } | null;
  /** Quien la dicto: el emisor por defecto del certificado. */
  quienLaDicto: string | null;
  /**
   * QUIEN PIDE EL PAPEL: la ficha de esta formacion (`PROPIO`) o su tipo (`HEREDADO`). Es lo que
   * contesta "¿y esta por que sale aqui?" — y dice donde se cambia.
   */
  origen: 'PROPIO' | 'HEREDADO';
  /**
   * Si la jornada la dicto alguien de FUERA. Con `PROPIOS` no hay tercero que expida nada, asi que
   * la pantalla no pide el numero por defecto — pero se puede registrar igual: es un defecto, no una
   * compuerta (mismo criterio que la lista de asistencia, `certificate-policy.ts`).
   */
  laDictaUnTercero: boolean;
  number: string | null;
  issuer: string | null;
  validUntil: string | null;
  fileKey: string | null;
}

/**
 * LA SEGUNDA PUERTA AL PAPEL DE UN TERCERO (`PENDIENTES` 2.2).
 *
 * Solo lo CERRADO y solo lo que lleva papel. La cascada tipo -> ficha se resuelve en el servidor
 * (`papel-de-tercero.service.ts`): una formacion que lo hereda del tipo sin decirlo en su ficha
 * tambien sale, y son la mayoria.
 */
export function papelesDePersona(userId: string): Promise<PapelDeTercero[]> {
  return apiFetch(`/enrollments/con-papel-de-tercero?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}

/**
 * Registrar o corregir el papel de una inscripcion, sin volver a la convocatoria.
 *
 * No toca el estado ni la fecha de cumplimiento: solo el papel — y la vigencia de la obligacion,
 * que es lo unico que el papel MANDA.
 */
export function guardarPapelDeTercero(
  enrollmentId: string,
  body: { number: string; issuer?: string; validUntil?: string | null; fileKey?: string | null },
): Promise<{ ok: boolean }> {
  return apiFetch(`/enrollments/${enrollmentId}/papel-de-tercero`, { method: 'PATCH', body });
}

/** Una obligacion abierta que se puede dar por cumplida con un papel de otro empleo (via C). */
export interface Convalidable {
  assignmentId: string;
  /** Para abrir la formacion desde la fila y ver que exige la nuestra. */
  actividadId: string;
  actividad: string;
  tipo: string | null;
  dueAt: string | null;
  cycleNumber: number;
  status: string;
}

/**
 * LO QUE SE LE PUEDE CONVALIDAR A ALGUIEN.
 *
 * Solo obligaciones ABIERTAS de formaciones cuyo tipo lo ADMITE. La segunda condicion es la que
 * impide dar por cumplida una induccion con el papel de otra empresa, y vive en el servidor: una
 * lista que filtra bien no es una compuerta.
 */
export function convalidablesDe(userId: string): Promise<Convalidable[]> {
  return apiFetch(`/assignments/convalidables?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}

/**
 * Aceptar el papel de otro empleo y dar la obligacion por CUMPLIDA (no eximida).
 *
 * El motivo es obligatorio y largo a proposito: seis meses despues, cuando un auditor pregunte por
 * que esta persona no aparece en ninguna lista de asistencia, la respuesta tiene que estar escrita.
 */
export function convalidar(
  assignmentId: string,
  body: { number: string; issuer: string; validUntil: string; fileKey?: string; reason: string },
): Promise<{ ok: boolean; validUntil: string }> {
  return apiFetch(`/assignments/${assignmentId}/convalidar`, { method: 'POST', body });
}
