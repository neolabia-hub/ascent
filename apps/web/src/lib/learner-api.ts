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

export type ContentType = 'LESSON' | 'VIDEO' | 'PRESENTATION' | 'DOCUMENT' | 'ASSESSMENT' | 'SURVEY' | 'SCORM' | 'LINK';
export type EnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'EXPIRED';
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED';
/**
 * Los tipos de pregunta son UNA sola lista, no dos copias.
 *
 * Estaban duplicados —aqui y en `catalog-api`— y al anadir los cuatro de la Decision #86 las dos
 * listas se separaron: el escenario del examen es la misma pieza para el aprendiz y para la vista
 * previa del administrador, asi que una lista mas corta que la otra lo parte en dos.
 */
export type { QuestionType } from './catalog-api';
import type { QuestionType } from './catalog-api';
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
  /** La portada subida, si la hay. Sin ella se pinta la generada (Decision #88). */
  coverKey: string | null;
  /** Puntos al terminarla. Los manda el servidor, que es quien los otorga (Decision #90). */
  pointsOnComplete: number;
  dueAt: string | null;
  overdue: boolean;
  cycleNumber: number | null;
  source: 'MANUAL' | 'RULE' | 'PLAN' | 'STATIC_SNAPSHOT';
  /** Ejecucion ya abierta. Si es null, todavia no ha empezado. */
  enrollmentId: string | null;
  started: boolean;
  /** Convocatoria de autoservicio donde puede empezarla por su cuenta. */
  selfServiceOfferingId: string | null;
  /**
   * EL ESTADO YA RESUELTO POR EL SERVIDOR (Decision #101).
   *
   * No se recalcula aqui. Con las banderas sueltas, esta pantalla llego a decir "Vencio hace 3
   * dias" y "todavia no esta abierta, deben convocarte" en la misma tarjeta —un retraso
   * reclamado a quien no podia empezar—, y eso vuelve en cuanto un cliente reconcilia mal.
   */
  state: 'EN_CURSO' | 'ESPERANDO' | 'ATRASADA' | 'PRONTO' | 'ABIERTA';
  stateLabel: string;
  /** Si puede hacer algo AHORA. Lo que no es accionable no se le puede reclamar. */
  actionable: boolean;
  /**
   * Cuanto lleva hecho, de 0 a 100. Lo calcula el SERVIDOR contando piezas terminadas.
   *
   * `null` = no aplica (sin inscripcion, o la version no tiene piezas). Es distinto de 0, que
   * significa "empezada y sin nada hecho", y la pantalla los pinta distinto.
   */
  progressPct: number | null;
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
    activityVersion: {
      versionNumber: number;
      activity: { id: string; name: string; activityType: { code: string; name: string; colorHex: string | null } };
    };
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
  /** De que va ESTA parte. La escribe quien arma la formacion; puede faltar. */
  description: string | null;
  isRequired: boolean;
  config: unknown;
  hasLesson: boolean;
  assessmentId: string | null;
  /** Solo en una pieza de tipo SURVEY: la plantilla que hay que responder. */
  surveyTemplateId: string | null;
  status: ProgressStatus;
  pct: number;
  lastCardIndex: number;
  /** El tamaño de la pieza en la unidad de su tipo. Cada campo es null cuando no aplica. */
  size: { cards: number | null; slides: number | null; minutes: number | null };
  /** El archivo, cuando la pieza ES un archivo (documento, presentacion, video subido). */
  file: { storageKey: string; originalName: string; mimeType: string | null; sizeBytes: number | null } | null;
}

export interface EnrollmentAttempt {
  id: string;
  assessmentId: string;
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
    activityId: string;
    activityName: string;
    activityDescription: string | null;
    activityType: { code: string; name: string; colorHex: string | null };
    activityModality: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
    processName: string;
    /** Normas a las que tributa. Vacio = no tributa a ninguna. */
    normNames: string[];
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
    description: string | null;
    config: unknown;
    lessonId: string | null;
    contentPackageId: string | null;
    assessmentId: string | null;
    /** Solo en una pieza de tipo SURVEY: la plantilla que hay que responder. */
    surveyTemplateId: string | null;
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
    /** Solo en una PRESENTACION: las diapositivas ya convertidas, en orden. */
    manifest: { slides: Array<{ index: number; key: string; width: number; height: number }> } | null;
  } | null;
  /**
   * Cuanto hay que ver de un video para darlo por visto, YA resuelto en cascada por el servidor
   * (formacion -> empresa -> plataforma). No se recalcula aqui: si la pantalla y la regla dieran
   * numeros distintos, la persona veria abrirse el boton y el servidor no le daria la pieza.
   */
  minWatchPct: number;
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
  /** COMO se supo: lo midio la plataforma o lo declaro la persona (Decision #44). */
  evidence?: 'MEASURED' | 'DECLARED';
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

/** Una respuesta. Cada tipo usa el campo que le corresponde y deja el resto sin poner. */
export interface AnswerInput {
  optionId?: string;
  optionIds?: string[];
  value?: boolean;
  text?: string;
  /** FILL_BLANK: lo escrito en cada hueco, por id de hueco. */
  blanks?: Record<string, string>;
  /** ORDER: los ids de los pasos en el orden en que los dejo. */
  order?: string[];
  /** MATCH: a que id de la derecha unio cada id de la izquierda. */
  pairs?: Record<string, string>;
  /** NUMERIC: el numero tecleado. */
  number?: number;
}

export interface AttemptQuestion {
  attemptQuestionId: string;
  questionVersionId: string;
  qtype: QuestionType;
  stem: string;
  /**
   * Que son estas "opciones" depende del tipo: las respuestas en SINGLE/MULTI, los PASOS en
   * ORDER, las DOS COLUMNAS con prefijo L/R en MATCH, y los HUECOS en FILL_BLANK.
   */
  options: Array<{ id: string; text: string }>;
  /** Solo en NUMERIC: la unidad se enseña junto al campo. El numero correcto no sale del servidor. */
  unit?: string;
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
    /** Como se ve el examen (Decision #85). Se lee con `readPresentation`. */
    presentation: unknown;
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

export function startAttempt(enrollmentId: string, assessmentId: string): Promise<AttemptView> {
  return apiFetch<AttemptView>(
    `/me/enrollments/${encodeURIComponent(enrollmentId)}/attempts?assessmentId=${encodeURIComponent(assessmentId)}`,
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

/** Entrega. Puede llevar todas las respuestas de una vez: es el caso del telefono sin señal. */
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
