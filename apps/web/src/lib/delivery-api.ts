/**
 * Cliente tipado de la ENTREGA de la formacion (Sprint 3): convocatorias, audiencias,
 * requisitos, asignaciones y plan anual.
 *
 * Nombres tecnicos solo aqui: en pantalla se dice Convocatoria, Requisito, Obligacion y Plan.
 */
import { apiFetch } from './api';
import type { Modality } from './catalog-api';

// ─────────────────────────── Convocatorias ───────────────────────────

export type OfferingKind = 'EVENT' | 'PERMANENT' | 'HYBRID';
export type OfferingStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ExecutedBy = 'PROPIOS' | 'TEMPORALES' | 'ARL' | 'EPS' | 'OTROS';

export interface OfferingActivityRef {
  id: string;
  versionNumber: number;
  activity: {
    id: string;
    code: string;
    name: string;
    activityType: { code: string; name: string; colorHex: string | null };
    process: { id: string; code: string; name: string };
  };
}

export interface OfferingListItem {
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
  source: 'RULES' | 'ACTIVITY_JOB_TITLES' | 'NONE';
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
  planItems: Array<{ id: string; plannedMonth: number; status: string; plan: { id: string; name: string; year: number; status: string } }>;
  _count: { enrollments: number };
}

export interface OfferingBody {
  activityVersionId?: string;
  kind: OfferingKind;
  modality: Modality;
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

export function cancelOffering(id: string, cancelledReason: string): Promise<GatedResult<OfferingDetail>> {
  return apiFetch(`/offerings/${id}/cancel`, { method: 'POST', body: { cancelledReason } });
}

export function completeOffering(id: string): Promise<OfferingDetail> {
  return apiFetch(`/offerings/${id}/complete`, { method: 'POST' });
}

export interface RosterRow {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  finalScore: string | number | null;
  assignmentId: string | null;
  user: { id: string; fullName: string; documentNumber: string; jobTitle: { name: string }; area: { name: string } };
}

export function getRoster(id: string): Promise<{ total: number; items: RosterRow[] }> {
  return apiFetch(`/offerings/${id}/roster`, { method: 'GET' });
}

export function enrollOffering(id: string, body: { allAssigned?: boolean; userIds?: string[] }): Promise<{ enrolled: number; skipped: number }> {
  return apiFetch(`/offerings/${id}/enroll`, { method: 'POST', body: { allAssigned: false, userIds: [], ...body } });
}

// ─────────────────────────── Audiencias y requisitos ───────────────────────────

export interface AudienceRule {
  match: 'ALL' | 'ANY';
  jobTitleIds: string[];
  jobTitleTypeIds: string[];
  areaIds: string[];
  regionalIds: string[];
  employmentTypes: string[];
  roadActors: string[];
}

export const EMPTY_RULE: AudienceRule = {
  match: 'ALL',
  jobTitleIds: [],
  jobTitleTypeIds: [],
  areaIds: [],
  regionalIds: [],
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

export type RuleTrigger = 'ON_JOIN' | 'ON_HIRE' | 'SCHEDULED';

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
  jobTitles: Array<{ id: string; code: string; name: string; jobTitleType: { name: string } }>;
  activities: Array<{ id: string; code: string; name: string; activityType: { code: string; name: string; colorHex: string | null } }>;
  cells: Array<{ jobTitleId: string; activityId: string; ruleId: string; trigger: string; dueDaysAfterTrigger: number | null }>;
  broaderRules: number;
}

export function getJobTitleMatrix(): Promise<JobTitleMatrix> {
  return apiFetch('/assignment-rules/job-title-matrix', { method: 'GET' });
}

export function toggleJobTitleMatrix(body: {
  jobTitleId: string;
  activityId: string;
  enabled: boolean;
  dueDaysAfterTrigger?: number;
}): Promise<{ enabled: boolean; ruleId: string | null; generated?: number }> {
  return apiFetch('/assignment-rules/job-title-matrix', { method: 'POST', body: { dueDaysAfterTrigger: 0, ...body } });
}

// ─────────────────────────── Asignaciones ───────────────────────────

export type AssignmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'WITHDRAWN_LEFT_AUDIENCE'
  | 'WAIVED';

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
  approvedAt: string | null;
  itemCount: number;
  updatedAt: string;
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
      versionNumber: number;
      activity: {
        id: string;
        name: string;
        process: { id: string; code: string; name: string };
        activityType: { code: string; name: string; colorHex: string | null };
      };
    };
  };
}

export interface PlanDetail {
  id: string;
  year: number;
  name: string;
  objective: string | null;
  goals: string | null;
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

export function createPlan(body: { year: number; name: string; objective?: string | null }): Promise<PlanDetail> {
  return apiFetch('/plans', { method: 'POST', body });
}

export function addPlanItem(planId: string, body: { offeringId: string; plannedMonth: number; notes?: string | null }): Promise<PlanDetail> {
  return apiFetch(`/plans/${planId}/items`, { method: 'POST', body });
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
