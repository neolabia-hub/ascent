/**
 * Cliente tipado del CATALOGO FORMATIVO (Sprint 2): actividades, versiones, contenidos,
 * lecciones en tarjetas, banco de preguntas y evaluaciones.
 */
import { apiFetch, getAccessToken } from './api';

// ─────────────────────────── Actividades y versiones ───────────────────────────

export type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type Modality = 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
export type ContentType = 'LESSON' | 'VIDEO' | 'DOCUMENT' | 'ASSESSMENT' | 'SURVEY' | 'SCORM' | 'LINK';
export type MigrationPolicy = 'FINISH_OLD' | 'RESTART_NEW' | 'MOVE_NOT_STARTED';

export interface VersionSummary {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  publishedAt: string | null;
  passingScore?: number;
  maxAttempts?: number;
  estimatedMinutes?: number | null;
  _count?: { contents: number };
}

export interface ActivityListItem {
  id: string;
  code: string;
  name: string;
  modality: Modality;
  active: boolean;
  updatedAt: string;
  currentVersionId: string | null;
  activityType: { id: string; code: string; name: string; colorHex: string | null };
  process: { id: string; code: string; name: string };
  versions: VersionSummary[];
}

export interface ActivitiesPage {
  total: number;
  page: number;
  pageSize: number;
  items: ActivityListItem[];
}

export interface CatalogRef {
  id: string;
  code: string;
  name: string;
}

export interface ActivityDetail extends Omit<ActivityListItem, 'versions'> {
  description: string | null;
  responsibleUserId: string | null;
  tags: string[];
  norms: CatalogRef[];
  services: CatalogRef[];
  regionals: CatalogRef[];
  jobTitles: CatalogRef[];
  versions: VersionSummary[];
}

export interface VersionContent {
  id: string;
  type: ContentType;
  title: string;
  displayOrder: number;
  isRequired: boolean;
  config: Record<string, unknown>;
  lessonId: string | null;
  contentPackageId: string | null;
  assessmentVersionId: string | null;
  lesson: { id: string; title: string; estimatedMinutes: number | null; status: VersionStatus; _count: { cards: number } } | null;
  contentPackage: { id: string; kind: string; originalName: string; sizeBytes: number; storageKey: string } | null;
  assessmentVersion: {
    id: string;
    versionNumber: number;
    status: VersionStatus;
    passingScore: number | null;
    maxAttempts: number | null;
    assessment: { id: string; title: string };
    _count: { sections: number };
  } | null;
}

export interface VersionDetail extends VersionSummary {
  activityId: string;
  migrationPolicy: MigrationPolicy;
  retryWaitHours: number | null;
  contents: VersionContent[];
}

export function listActivities(params: { q?: string; activityTypeId?: string; processId?: string; page?: number }) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, String(v));
  });
  return apiFetch<ActivitiesPage>(`/activities?${search.toString()}`, { method: 'GET' });
}

export function getActivity(id: string) {
  return apiFetch<ActivityDetail>(`/activities/${id}`, { method: 'GET' });
}

export function createActivity(body: {
  code: string;
  name: string;
  description?: string | null;
  activityTypeId: string;
  processId: string;
  modality: Modality;
  normIds?: string[];
  serviceIds?: string[];
  regionalIds?: string[];
  jobTitleIds?: string[];
}) {
  return apiFetch<ActivityDetail>('/activities', { method: 'POST', body });
}

export function updateActivity(id: string, body: Record<string, unknown>) {
  return apiFetch<ActivityDetail>(`/activities/${id}`, { method: 'PATCH', body });
}

export function getVersion(versionId: string) {
  return apiFetch<VersionDetail>(`/activities/versions/${versionId}`, { method: 'GET' });
}

export function updateVersionSettings(versionId: string, body: Record<string, unknown>) {
  return apiFetch(`/activities/versions/${versionId}/settings`, { method: 'PATCH', body });
}

export function publishVersion(versionId: string, migrationPolicy: MigrationPolicy) {
  return apiFetch<VersionSummary>(`/activities/versions/${versionId}/publish`, {
    method: 'POST',
    body: { migrationPolicy, confirm: true },
  });
}

export function createNextVersion(activityId: string) {
  return apiFetch<VersionSummary>(`/activities/${activityId}/versions`, { method: 'POST' });
}

export function discardDraft(versionId: string) {
  return apiFetch(`/activities/versions/${versionId}`, { method: 'DELETE' });
}

export function addContent(
  versionId: string,
  body: { type: ContentType; title: string; isRequired?: boolean; config?: Record<string, unknown>; lessonId?: string | null; contentPackageId?: string | null; assessmentVersionId?: string | null },
) {
  return apiFetch<VersionContent>(`/activities/versions/${versionId}/contents`, { method: 'POST', body });
}

export function updateContent(contentId: string, body: Record<string, unknown>) {
  return apiFetch<VersionContent>(`/activities/contents/${contentId}`, { method: 'PATCH', body });
}

export function removeContent(contentId: string) {
  return apiFetch(`/activities/contents/${contentId}`, { method: 'DELETE' });
}

export function reorderContents(versionId: string, orderedIds: string[]) {
  return apiFetch(`/activities/versions/${versionId}/contents/reorder`, { method: 'POST', body: { orderedIds } });
}

// ─────────────────────────── Lecciones ───────────────────────────

export type CardType = 'TEXT_IMAGE' | 'VIDEO_SHORT' | 'QUIZ' | 'FLIP' | 'POLL' | 'FILL_GAP';

export interface CardOption {
  id: string;
  text: string;
}

/** Payload de tarjeta. Union laxa en el cliente; la API valida con Zod (fuente unica). */
export interface CardPayloadClient {
  cardType: CardType;
  title?: string;
  body?: string;
  mediaKey?: string | null;
  caption?: string;
  externalUrl?: string | null;
  durationSeconds?: number;
  question?: string;
  options?: CardOption[];
  correctOptionId?: string;
  feedbackCorrect?: string;
  feedbackWrong?: string;
  front?: string;
  back?: string;
  sentence?: string;
  answers?: string[];
  distractors?: string[];
}

export interface LessonCard {
  id: string;
  cardType: CardType;
  displayOrder: number;
  payload: CardPayloadClient;
  mediaKey: string | null;
}

export interface LessonDetail {
  id: string;
  title: string;
  estimatedMinutes: number | null;
  status: VersionStatus;
  cards: LessonCard[];
}

export interface LessonListItem {
  id: string;
  title: string;
  estimatedMinutes: number | null;
  status: VersionStatus;
  updatedAt: string;
  _count: { cards: number };
}

export function listLessons(status?: 'DRAFT' | 'PUBLISHED') {
  return apiFetch<LessonListItem[]>(`/lessons${status ? `?status=${status}` : ''}`, { method: 'GET' });
}

export function getLesson(id: string) {
  return apiFetch<LessonDetail>(`/lessons/${id}`, { method: 'GET' });
}

export function createLesson(body: { title: string; estimatedMinutes?: number | null }) {
  return apiFetch<LessonDetail>('/lessons', { method: 'POST', body });
}

export function updateLesson(id: string, body: { title?: string; estimatedMinutes?: number | null }) {
  return apiFetch<LessonDetail>(`/lessons/${id}`, { method: 'PATCH', body });
}

export function saveLessonCards(id: string, cards: Array<{ id?: string; payload: CardPayloadClient }>) {
  return apiFetch<LessonDetail>(`/lessons/${id}/cards`, { method: 'PUT', body: { cards } });
}

export function duplicateLesson(id: string) {
  return apiFetch<LessonDetail>(`/lessons/${id}/duplicate`, { method: 'POST' });
}

export function deleteLesson(id: string) {
  return apiFetch(`/lessons/${id}`, { method: 'DELETE' });
}

// ─────────────────────────── Banco de preguntas ───────────────────────────

export type QuestionType = 'SINGLE' | 'MULTI' | 'TRUE_FALSE' | 'ESSAY';

export interface QuestionCategory {
  id: string;
  name: string;
  parentId: string | null;
  _count: { questions: number };
}

export interface QuestionListItem {
  id: string;
  categoryId: string;
  categoryName: string;
  versionCount: number;
  currentVersionId: string | null;
  qtype: QuestionType | null;
  stem: string;
  points: number;
  versionNumber: number;
}

export interface QuestionsPage {
  total: number;
  page: number;
  pageSize: number;
  items: QuestionListItem[];
}

export interface QuestionPayloadClient {
  qtype: QuestionType;
  stem: string;
  options?: Array<{ id: string; text: string; feedback?: string }>;
  correctOptionId?: string;
  correctOptionIds?: string[];
  partialCredit?: boolean;
  correctValue?: boolean;
  rubric?: string;
  points: number;
  explanation?: string;
}

export interface QuestionDetail {
  id: string;
  categoryId: string;
  categoryName: string;
  currentVersionId: string;
  versionNumber: number;
  payload: QuestionPayloadClient;
  history: Array<{ id: string; versionNumber: number; createdAt: string; isCurrent: boolean }>;
}

export function listQuestionCategories() {
  return apiFetch<QuestionCategory[]>('/question-categories', { method: 'GET' });
}

export function createQuestionCategory(name: string, parentId?: string | null) {
  return apiFetch<QuestionCategory>('/question-categories', { method: 'POST', body: { name, parentId } });
}

export function listQuestions(params: { categoryId?: string; q?: string; page?: number }) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, String(v));
  });
  return apiFetch<QuestionsPage>(`/questions?${search.toString()}`, { method: 'GET' });
}

export function getQuestion(id: string) {
  return apiFetch<QuestionDetail>(`/questions/${id}`, { method: 'GET' });
}

export function createQuestion(categoryId: string, payload: QuestionPayloadClient) {
  return apiFetch<QuestionDetail>('/questions', { method: 'POST', body: { categoryId, payload } });
}

export function reviseQuestion(id: string, payload: QuestionPayloadClient) {
  return apiFetch<QuestionDetail>(`/questions/${id}/revise`, { method: 'POST', body: { payload } });
}

export function retireQuestion(id: string) {
  return apiFetch(`/questions/${id}`, { method: 'DELETE' });
}

// ─────────────────────────── Evaluaciones ───────────────────────────

export interface AssessmentSection {
  id: string;
  mode: 'FIXED' | 'RANDOM_FROM_POOL';
  categoryId: string | null;
  pickCount: number | null;
  fixedQuestionVersionIds: string[];
  displayOrder: number;
  availableInCategory: number | null;
}

export interface AssessmentVersion {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  timeLimitMin: number | null;
  maxAttempts: number | null;
  passingScore: number | null;
  gradingPolicy: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  reviewPolicy: Record<string, boolean>;
  sections: AssessmentSection[];
}

export interface AssessmentDetail {
  id: string;
  title: string;
  currentVersionId: string | null;
  versions: AssessmentVersion[];
}

export interface AssessmentListItem {
  id: string;
  title: string;
  currentVersionId: string | null;
  createdAt: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: VersionStatus;
    passingScore: number | null;
    maxAttempts: number | null;
    _count: { sections: number };
  }>;
}

export function listAssessments() {
  return apiFetch<AssessmentListItem[]>('/assessments', { method: 'GET' });
}

export function getAssessment(id: string) {
  return apiFetch<AssessmentDetail>(`/assessments/${id}`, { method: 'GET' });
}

export function createAssessment(title: string) {
  return apiFetch<AssessmentDetail>('/assessments', { method: 'POST', body: { title } });
}

export function updateAssessmentDraft(versionId: string, body: Record<string, unknown>) {
  return apiFetch<AssessmentDetail>(`/assessments/versions/${versionId}`, { method: 'PATCH', body });
}

export function publishAssessment(versionId: string) {
  return apiFetch(`/assessments/versions/${versionId}/publish`, { method: 'POST', body: { confirm: true } });
}

export function createNextAssessmentVersion(assessmentId: string) {
  return apiFetch(`/assessments/${assessmentId}/versions`, { method: 'POST' });
}

// ─────────────────────────── Medios ───────────────────────────

export interface UploadedPackage {
  id: string;
  kind: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadMedia(file: File, kind = 'media'): Promise<UploadedPackage> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', file);
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/media/upload?kind=${encodeURIComponent(kind)}`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = (data ?? {}) as { title?: string; code?: string };
    throw new Error(detail.code === 'UNSUPPORTED_FILE_TYPE' ? 'Tipo de archivo no permitido.' : (detail.title ?? 'Error al subir'));
  }
  return data as UploadedPackage;
}

/** URL para mostrar un medio ya subido (usa la clave de almacenamiento). */
export function mediaUrl(storageKey: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  return `${apiUrl}/v1/media/file/${encodeURIComponent(storageKey)}`;
}
