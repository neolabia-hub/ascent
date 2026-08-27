/**
 * Cliente tipado del LADO DEL APRENDIZ (Sprint 4). Todo cuelga de `/me` y todo exige el unico
 * permiso del rol Usuario (`enrollments:read_own`).
 *
 * Dos cosas que este archivo asume a proposito, porque el backend las garantiza:
 *  - el avance NO retrocede: reenviar el mismo progreso es seguro (por eso la cola offline
 *    puede reintentar sin comparar nada);
 *  - una pregunta NUNCA llega con su respuesta correcta mientras se esta respondiendo.
 *
 * Los `Decimal` de Prisma viajan como cadena en JSON. Por eso las notas se tipan
 * `number | string | null` y se normalizan con `toScore()` en vez de confiar en el tipo.
 */
import { apiFetch } from './api';

export type ContentType = 'LESSON' | 'VIDEO' | 'DOCUMENT' | 'ASSESSMENT' | 'SURVEY' | 'SCORM' | 'LINK';
export type EnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'EXPIRED';
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED';
export type QuestionType = 'SINGLE' | 'MULTI' | 'TRUE_FALSE' | 'ESSAY';
export type CardType = 'TEXT_IMAGE' | 'VIDEO_SHORT' | 'QUIZ' | 'FLIP' | 'POLL' | 'FILL_GAP';

/** Las notas llegan como cadena (Decimal de Prisma) o numero segun el camino. */
export type Score = number | string | null;

export function toScore(value: Score): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─────────────────────────── Lo mio: pendientes, historial, progreso ───────────────────────────

export interface PendingItem {
  assignmentId: string;
  activityId: string;
  title: string;
  description: string | null;
  type: { code: string; name: string; colorHex: string | null } | null;
  estimatedMinutes: number | null;
  dueAt: string | null;
  overdue: boolean;
  cycleNumber: number | null;
  source: 'MANUAL' | 'RULE' | 'PLAN' | 'STATIC_SNAPSHOT';
  /** Ejecucion ya abierta. Si es null, todavia no ha empezado. */
  enrollmentId: string | null;
  started: boolean;
  /** Convocatoria de autoservicio donde puede empezarla por su cuenta. */
  selfServiceOfferingId: string | null;
}

export interface HistoryItem {
  id: string;
  status: EnrollmentStatus;
  completedAt: string | null;
  finalScore: Score;
  scoreSnapshot: unknown;
  offering: {
    code: string;
    scheduledDate: string | null;
    activityVersion: { versionNumber: number; activity: { id: string; name: string } };
  } | null;
}

export interface MyProgress {
  currentStreak: number;
  longestStreak: number;
  /** Fecha civil (YYYY-MM-DD) del ultimo dia con una leccion completada. */
  lastActivityDate: string | null;
  freezesAvailable: number;
  points: number;
}

export function getPending(): Promise<{ items: PendingItem[] }> {
  return apiFetch<{ items: PendingItem[] }>('/me/pending', { method: 'GET' });
}

export function getHistory(): Promise<{ items: HistoryItem[] }> {
  return apiFetch<{ items: HistoryItem[] }>('/me/history', { method: 'GET' });
}

export function getMyProgress(): Promise<MyProgress> {
  return apiFetch<MyProgress>('/me/progress', { method: 'GET' });
}

export function selfEnroll(offeringId: string): Promise<{ enrollmentId: string; created: boolean }> {
  return apiFetch<{ enrollmentId: string; created: boolean }>('/me/enroll', {
    method: 'POST',
    body: { offeringId },
  });
}

// ─────────────────────────── Reproductor ───────────────────────────

export interface EnrollmentContent {
  id: string;
  type: ContentType;
  title: string;
  isRequired: boolean;
  config: unknown;
  hasLesson: boolean;
  assessmentVersionId: string | null;
  status: ProgressStatus;
  pct: number;
  lastCardIndex: number;
}

export interface EnrollmentAttempt {
  id: string;
  assessmentVersionId: string;
  attemptNumber: number;
  status: AttemptStatus;
  score: Score;
  passed: boolean | null;
}

export interface OpenEnrollment {
  enrollment: {
    id: string;
    status: EnrollmentStatus;
    blockedAt: string | null;
    blockedReason: string | null;
    activityName: string;
    versionNumber: number;
    passingScore: Score;
    estimatedMinutes: number | null;
  };
  contents: EnrollmentContent[];
  attempts: EnrollmentAttempt[];
}

/** Payload de tarjeta: union por `cardType`, igual que el contrato de `@neo-pulse/shared`. */
export type CardPayload =
  | { cardType: 'TEXT_IMAGE'; title?: string; body: string; mediaKey?: string | null; caption?: string }
  | {
      cardType: 'VIDEO_SHORT';
      title?: string;
      mediaKey?: string | null;
      externalUrl?: string | null;
      durationSeconds?: number;
    }
  | {
      cardType: 'QUIZ';
      question: string;
      options: Array<{ id: string; text: string }>;
      correctOptionId: string;
      feedbackCorrect?: string;
      feedbackWrong?: string;
    }
  | { cardType: 'FLIP'; front: string; back: string }
  | { cardType: 'POLL'; question: string; options: Array<{ id: string; text: string }> }
  | { cardType: 'FILL_GAP'; sentence: string; answers: string[]; distractors: string[] };

export interface LessonCard {
  id: string;
  cardType: CardType;
  payload: CardPayload;
  mediaKey: string | null;
}

export interface ContentDetail {
  content: {
    id: string;
    type: ContentType;
    title: string;
    config: unknown;
    lessonId: string | null;
    contentPackageId: string | null;
    assessmentVersionId: string | null;
    activityVersionId: string;
  };
  enrollmentId: string;
  lesson: { id: string; title: string; estimatedMinutes: number | null; cards: LessonCard[] } | null;
  package: {
    id: string;
    kind: string;
    storageKey: string;
    originalName: string;
    mimeType: string | null;
    sizeBytes: number | null;
  } | null;
}

export interface StreakUpdate {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  freezesAvailable: number;
  outcome: 'FIRST' | 'CONTINUED' | 'SAME_DAY' | 'FROZEN' | 'RESET';
}

export interface CompletionOutcome {
  status: EnrollmentStatus;
  /** Titulos de las piezas obligatorias que aun faltan. */
  missing: string[];
  assignmentClosed: boolean;
}

export interface SaveProgressResult {
  pct: number;
  timeSpentS: number;
  completed: boolean;
  streak: StreakUpdate | null;
  enrollment: CompletionOutcome;
}

export interface ProgressInput {
  pct: number;
  secondsSpent: number;
  lastCardIndex?: number;
}

export function openEnrollment(enrollmentId: string): Promise<OpenEnrollment> {
  return apiFetch<OpenEnrollment>(`/me/enrollments/${encodeURIComponent(enrollmentId)}`, { method: 'GET' });
}

export function getContent(contentId: string): Promise<ContentDetail> {
  return apiFetch<ContentDetail>(`/me/contents/${encodeURIComponent(contentId)}`, { method: 'GET' });
}

export function saveProgress(contentId: string, input: ProgressInput): Promise<SaveProgressResult> {
  return apiFetch<SaveProgressResult>(`/me/contents/${encodeURIComponent(contentId)}/progress`, {
    method: 'POST',
    body: input,
  });
}

// ─────────────────────────── Evaluaciones ───────────────────────────

export interface AnswerInput {
  optionId?: string;
  optionIds?: string[];
  value?: boolean;
  text?: string;
}

export interface AttemptQuestion {
  attemptQuestionId: string;
  questionVersionId: string;
  qtype: QuestionType;
  stem: string;
  options: Array<{ id: string; text: string }>;
  points: number;
  answer: AnswerInput | null;
  pointsPossible: number;
}

export interface AttemptView {
  attempt: {
    id: string;
    attemptNumber: number;
    status: AttemptStatus;
    startedAt: string;
    timeLimitMin: number | null;
  };
  questions: AttemptQuestion[];
}

export type SubmitResult =
  | { status: 'PENDING_MANUAL'; score: null; passed: null; blocked: false }
  | { status: 'GRADED'; score: Score; passed: boolean; blocked: boolean; completion: CompletionOutcome };

export interface AttemptReview {
  score: number | null;
  passed: boolean | null;
  attemptsUsed: number;
  maxAttempts: number;
  detail: Array<{
    stem: string;
    invalidated: boolean;
    pointsAwarded: number | null;
    pointsPossible: number;
    /** Solo si la politica de revision lo permite; si no, null. */
    correct: unknown;
    explanation: string | null;
  }>;
}

export function startAttempt(enrollmentId: string, assessmentVersionId: string): Promise<AttemptView> {
  return apiFetch<AttemptView>(
    `/me/enrollments/${encodeURIComponent(enrollmentId)}/attempts?assessmentVersionId=${encodeURIComponent(assessmentVersionId)}`,
    { method: 'POST' },
  );
}

export function viewAttempt(attemptId: string): Promise<AttemptView> {
  return apiFetch<AttemptView>(`/me/attempts/${encodeURIComponent(attemptId)}`, { method: 'GET' });
}

export function saveAnswer(attemptId: string, attemptQuestionId: string, answer: AnswerInput): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/me/attempts/${encodeURIComponent(attemptId)}/answers`, {
    method: 'POST',
    body: { attemptQuestionId, answer },
  });
}

/** Entrega. Puede llevar todas las respuestas de una vez: es el caso del telefono sin senal. */
export function submitAttempt(
  attemptId: string,
  answers: Array<{ attemptQuestionId: string; answer: AnswerInput }>,
): Promise<SubmitResult> {
  return apiFetch<SubmitResult>(`/me/attempts/${encodeURIComponent(attemptId)}/submit`, {
    method: 'POST',
    body: { answers },
  });
}

export function reviewAttempt(attemptId: string): Promise<AttemptReview> {
  return apiFetch<AttemptReview>(`/me/attempts/${encodeURIComponent(attemptId)}/review`, { method: 'GET' });
}

// ─────────────────────────── Repaso espaciado ───────────────────────────

export interface ReviewQuestion {
  questionVersionId: string;
  qtype: QuestionType;
  stem: string;
  options: Array<{ id: string; text: string }>;
  points: number;
}

export interface TodayReview {
  items: ReviewQuestion[];
  total: number;
  /** Cuantas quedan en la cola para dias siguientes (solo cuando hoy no hay nada). */
  pendingLater: number;
  nextDueAt: string | null;
}

export interface ReviewResult {
  answered: number;
  correct: number;
  results: Array<{ questionVersionId: string; correct: boolean }>;
}

export function getTodayReview(): Promise<TodayReview> {
  return apiFetch<TodayReview>('/me/review', { method: 'GET' });
}

export function answerReview(
  answers: Array<{ questionVersionId: string; answer: AnswerInput }>,
): Promise<ReviewResult> {
  return apiFetch<ReviewResult>('/me/review', { method: 'POST', body: { answers } });
}
