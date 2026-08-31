/**
 * Cliente tipado del CATALOGO FORMATIVO (Sprint 2): actividades, versiones, contenidos,
 * lecciones en tarjetas, banco de preguntas y evaluaciones.
 */
import { apiFetch, getAccessToken } from './api';
import type { Presentation } from '@/components/assessments/presentation';

// ─────────────────────────── Actividades y versiones ───────────────────────────

export type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type Modality = 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
export type ContentType = 'LESSON' | 'VIDEO' | 'PRESENTATION' | 'DOCUMENT' | 'ASSESSMENT' | 'SURVEY' | 'SCORM' | 'LINK';
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
  activityType: { id: string; code: string; name: string; colorHex: string | null; config: Record<string, unknown> };
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
  /** Portada subida. `null` = se pinta la generada, que es un estado normal (Decision #88). */
  coverKey: string | null;
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
  description: string | null;
  displayOrder: number;
  isRequired: boolean;
  config: Record<string, unknown>;
  lessonId: string | null;
  contentPackageId: string | null;
  assessmentId: string | null;
  /** La encuesta de esta pieza. Viene del servidor (include trae todos los escalares) y hace
   *  falta para saber si un contenido de tipo SURVEY esta completo. */
  surveyTemplateId: string | null;
  lesson: { id: string; title: string; estimatedMinutes: number | null; status: VersionStatus; _count: { cards: number } } | null;
  contentPackage: { id: string; kind: string; originalName: string; sizeBytes: number; storageKey: string } | null;
  /** La evaluacion de esta pieza. En una version publicada es la COPIA congelada (Decision #87). */
  assessment: {
    id: string;
    title: string;
    status: VersionStatus;
    passingScore: number | null;
    maxAttempts: number | null;
    sourceId: string | null;
    _count: { sections: number };
  } | null;
}

export interface VersionDetail extends VersionSummary {
  activityId: string;
  migrationPolicy: MigrationPolicy;
  retryWaitHours: number | null;
  contents: VersionContent[];
}

export function listActivities(params: {
  q?: string;
  activityTypeId?: string;
  processId?: string;
  page?: number;
  pageSize?: number;
}) {
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
  modality?: Modality;
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

/**
 * Resultado de pedir la publicacion: si el usuario tiene permiso, se publico (`executed`);
 * si no, quedo una solicitud de aprobacion para el administrador.
 */
export interface PublishResult {
  executed: boolean;
  approvalId?: string;
}

export function publishVersion(versionId: string, migrationPolicy: MigrationPolicy, justification?: string) {
  return apiFetch<PublishResult>(`/activities/versions/${versionId}/publish`, {
    method: 'POST',
    body: { migrationPolicy, confirm: true, justification },
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
  body: { type: ContentType; title: string; description?: string | null; isRequired?: boolean; config?: Record<string, unknown>; lessonId?: string | null; contentPackageId?: string | null; assessmentId?: string | null },
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
// (el tipo Presentation vive con su paleta, en components/assessments/presentation.ts)

export type QuestionType =
  | 'SINGLE'
  | 'MULTI'
  | 'TRUE_FALSE'
  | 'ESSAY'
  // Decision #86: con solo opcion multiple, media formacion de SST se pregunta mal.
  | 'FILL_BLANK'
  | 'ORDER'
  | 'MATCH'
  | 'NUMERIC';

export interface QuestionCategory {
  id: string;
  name: string;
  parentId: string | null;
  _count: { questions: number };
}

export interface QuestionListItem {
  id: string;
  /** `null` = sin tema. El tema solo hace falta para los bloques al azar (Decision #84). */
  categoryId: string | null;
  categoryName: string | null;
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

  // ── Los tipos de la Decision #86 ──
  /** FILL_BLANK: un hueco por entrada. `accept` son todas las formas que cuentan como buenas. */
  blanks?: Array<{ id: string; accept: string[] }>;
  /** ORDER: los pasos, y aparte el orden correcto. */
  items?: Array<{ id: string; text: string }>;
  correctOrder?: string[];
  /** MATCH: las dos columnas, ya emparejadas. Al servir se barajan. */
  pairs?: Array<{ id: string; left: string; right: string }>;
  /** NUMERIC: el numero, su margen y la unidad que se ensena junto al campo. */
  correctNumber?: number;
  tolerance?: number;
  unit?: string;
}

export interface QuestionDetail {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
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

export function createQuestion(categoryId: string | null, payload: QuestionPayloadClient) {
  return apiFetch<QuestionDetail>('/questions', { method: 'POST', body: { categoryId, payload } });
}

/** Cambiar el tema NO crea una version: archiva, no revisa. */
export function setQuestionCategory(id: string, categoryId: string | null) {
  return apiFetch<QuestionDetail>(`/questions/${id}/category`, { method: 'PATCH', body: { categoryId } });
}

export function reviseQuestion(id: string, payload: QuestionPayloadClient) {
  return apiFetch<QuestionDetail>(`/questions/${id}/revise`, { method: 'POST', body: { payload } });
}

export function retireQuestion(id: string) {
  return apiFetch(`/questions/${id}`, { method: 'DELETE' });
}

// ─────────────────────────── Evaluaciones ───────────────────────────

/** Una pregunta ELEGIDA a mano, con lo que hace falta para ensenarla y volver a guardarla. */
export interface FixedQuestionRef {
  questionVersionId: string;
  /** El id de la PREGUNTA: es lo que se manda al guardar, no el de la version. */
  questionId: string;
  versionNumber: number;
  qtype: QuestionType;
  stem: string;
  points: number;
  categoryId: string | null;
  categoryName: string | null;
  /**
   * La pregunta ENTERA, con sus opciones y la correcta. Es lo que permite pintarla y editarla en
   * el lienzo sin pedirla una por una. Llega `null` a quien no puede editar el banco.
   */
  payload: QuestionPayloadClient | null;
}

export interface AssessmentSection {
  id: string;
  mode: 'FIXED' | 'RANDOM_FROM_POOL';
  categoryId: string | null;
  pickCount: number | null;
  fixedQuestionVersionIds: string[];
  /** Las mismas preguntas, ya resueltas y EN ORDEN. Vacio en los bloques al azar. */
  fixedQuestions: FixedQuestionRef[];
  displayOrder: number;
  availableInCategory: number | null;
}

/**
 * UNA EVALUACION ES UN OBJETO PLANO (Decision #87).
 *
 * Ya no tiene versiones propias: se edita siempre, y publicar la FORMACION congela una copia.
 * `sourceId` distingue las dos clases de fila —null = la editable, con valor = la copia—, y el
 * listado solo trae las editables.
 */
export interface AssessmentDetail {
  id: string;
  title: string;
  status: VersionStatus;
  sourceId: string | null;
  /** Ya esta dentro de alguna formacion publicada: hay copias congeladas de ella. */
  enUso: boolean;

  timeLimitMin: number | null;
  maxAttempts: number | null;
  passingScore: number | null;
  gradingPolicy: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  reviewPolicy: Record<string, boolean>;

  /** Como se ve el examen. Ver `components/assessments/presentation.ts`. */
  presentation: Partial<Presentation>;
  sections: AssessmentSection[];
}

export interface AssessmentListItem {
  id: string;
  title: string;
  passingScore: number | null;
  maxAttempts: number | null;
  timeLimitMin: number | null;
  createdAt: string;
  updatedAt: string;
  _count: { sections: number; copias: number };
}

export function updateAssessmentPresentation(id: string, presentation: Presentation) {
  return apiFetch<AssessmentDetail>(`/assessments/${id}/presentation`, {
    method: 'PATCH',
    body: { presentation },
  });
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

/** Una seccion tal como se GUARDA: preguntas elegidas, o N al azar de una categoria. */
export type AssessmentSectionInput =
  | { mode: 'FIXED'; questionIds: string[] }
  | { mode: 'RANDOM_FROM_POOL'; categoryId: string; pickCount: number };

export interface AssessmentDraftBody {
  timeLimitMin?: number | null;
  maxAttempts?: number | null;
  passingScore?: number | null;
  gradingPolicy?: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  reviewPolicy?: Record<string, boolean>;
  sections?: AssessmentSectionInput[];
}

export function updateAssessment(id: string, body: AssessmentDraftBody) {
  return apiFetch<AssessmentDetail>(`/assessments/${id}`, { method: 'PATCH', body });
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

/** Una diapositiva ya convertida: imagen propia, no una pagina de un archivo. */
export interface SlideRef {
  index: number;
  key: string;
  width: number;
  height: number;
}

export interface PresentationManifest {
  slides: SlideRef[];
  convertedAt: string;
}

export interface UploadedPresentation extends UploadedPackage {
  manifest: PresentationManifest;
}

/**
 * Sube una presentacion. El servidor la CONVIERTE en una imagen por diapositiva antes de
 * responder, asi que esta llamada tarda —de 5 a 30 segundos segun el tamano— y la pantalla tiene
 * que decirlo. A cambio, lo que queda se reproduce y se mide como cualquier otra parte.
 */
export async function uploadPresentation(file: File): Promise<UploadedPresentation> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', file);
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/media/presentation`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    // El mensaje del servidor ya explica que hacer (exportar a PDF, partir la presentacion): se
    // pasa tal cual en vez de sustituirlo por uno generico.
    const detail = (data ?? {}) as { title?: string; message?: string };
    throw new Error(detail.message ?? detail.title ?? 'No se pudo convertir la presentacion.');
  }
  return data as UploadedPresentation;
}

/** Si este servidor convierte PowerPoint o solo PDF. Se pregunta ANTES de ofrecer el campo. */
export function presentationCapabilities(): Promise<{ office: boolean }> {
  return apiFetch('/media/presentation/capabilities', { method: 'GET' });
}

/** URL para mostrar un medio ya subido (usa la clave de almacenamiento). */
export function mediaUrl(storageKey: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  return `${apiUrl}/v1/media/file/${encodeURIComponent(storageKey)}`;
}

/**
 * Eliminar una formacion. El servidor la marca como borrada, no la borra: el historico de quien
 * la curso sigue existiendo. Y se niega si tiene convocatorias (`ACTIVITY_IN_USE`), porque ahi
 * hay gente citada o inscrita.
 */
export function deleteActivity(id: string): Promise<void> {
  return apiFetch<void>(`/activities/${id}`, { method: 'DELETE' });
}

/**
 * DESCARTAR el borrador de una evaluacion. La accion opuesta a publicar, y no existia: quien abria
 * una version nueva "a ver que tal" se quedaba con ella para siempre.
 */


/** Eliminar la evaluacion entera. El servidor la protege si ya la respondio alguien o esta en uso. */
export function deleteAssessment(assessmentId: string) {
  return apiFetch<{ ok: true }>(`/assessments/${assessmentId}`, { method: 'DELETE' });
}
