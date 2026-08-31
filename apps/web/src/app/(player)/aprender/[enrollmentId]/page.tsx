'use client';

import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardCheck,
  Clock,
  FileText,
  Link2,
  Lock,
  PlayCircle,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  openEnrollment,
  startAttempt,
  toScore,
  type ContentType,
  type EnrollmentContent,
  type OpenEnrollment,
} from '@/lib/learner-api';
import { LearnerShell } from '@/components/layout/learner-shell';
import { ActivityCover } from '@/components/modules/activity-cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

const ICON_BY_TYPE: Record<ContentType, LucideIcon> = {
  LESSON: BookOpen,
  VIDEO: PlayCircle,
  PRESENTATION: Presentation,
  DOCUMENT: FileText,
  ASSESSMENT: ClipboardCheck,
  SURVEY: ClipboardCheck,
  SCORM: BookOpen,
  LINK: Link2,
};

const MODALITY_LABEL: Record<'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA', string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HIBRIDA: 'Hibrida',
};

const LABEL_BY_TYPE: Record<ContentType, string> = {
  LESSON: 'Leccion',
  VIDEO: 'Video',
  PRESENTATION: 'Presentacion',
  DOCUMENT: 'Documento',
  ASSESSMENT: 'Evaluacion',
  SURVEY: 'Encuesta',
  SCORM: 'Paquete',
  LINK: 'Enlace',
};

/**
 * Minutos de una pieza, si su configuracion los declara. La leccion los trae de su propio
 * `estimatedMinutes`; el video, de la duracion que puso quien lo cargo. Cuando no hay dato no se
 * inventa: una duracion falsa es peor que ninguna, porque la gente organiza su rato con ella.
 */
function minutesOf(content: EnrollmentContent): number | null {
  const config = (content.config ?? {}) as { estimatedMinutes?: unknown; minutes?: unknown };
  const raw = config.estimatedMinutes ?? config.minutes;
  return typeof raw === 'number' && raw > 0 ? Math.round(raw) : null;
}

/**
 * FICHA DE LA FORMACION, al estilo de una pagina de titulo (referencia Reforge / MasterClass):
 * portada, de que va, y sus partes listadas como capitulos con su estado.
 *
 * Antes esto era una lista de piezas sin contexto. La diferencia importa: alguien que abre una
 * formacion de 16 minutos quiere saber en que se esta metiendo ANTES de empezar, y quien vuelve
 * a los tres dias quiere ver de un vistazo por donde iba.
 *
 * En escritorio se reparte en dos columnas —la ficha manda a la izquierda, las partes a la
 * derecha—; en telefono se apila. Es la misma pantalla, no dos.
 */
export default function EnrollmentPage() {
  const params = useParams<{ enrollmentId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<OpenEnrollment | null>(null);
  const [failed, setFailed] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    openEnrollment(params.enrollmentId)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.enrollmentId]);

  if (failed) {
    return (
      <main className="learner-surface flex min-h-screen items-center justify-center bg-paper px-6 text-center">
        <div>
          <p className="text-base text-ink-500">No pudimos abrir esta formacion.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/hoy')}>
            Volver al inicio
          </Button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="learner-surface min-h-screen bg-paper px-5 py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  const { enrollment, contents, attempts } = data;
  const done = contents.filter((content) => content.status === 'COMPLETED').length;
  const pct = contents.length === 0 ? 0 : Math.round((done / contents.length) * 100);
  const blocked = enrollment.blockedAt !== null;
  const next = contents.find((content) => content.status !== 'COMPLETED');

  async function openContent(content: EnrollmentContent) {
    if (content.type !== 'ASSESSMENT') {
      router.push(`/aprender/${params.enrollmentId}/contenido/${content.id}`);
      return;
    }
    if (!content.assessmentId) return;

    // Un intento sin terminar se retoma; no se abre otro (gastaria un intento de los limitados).
    const openAttempt = attempts.find(
      (attempt) => attempt.assessmentId === content.assessmentId && attempt.status === 'IN_PROGRESS',
    );
    if (openAttempt) {
      router.push(`/aprender/${params.enrollmentId}/examen/${openAttempt.id}`);
      return;
    }

    setStartingId(content.id);
    try {
      const attempt = await startAttempt(params.enrollmentId, content.assessmentId);
      router.push(`/aprender/${params.enrollmentId}/examen/${attempt.attempt.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === 'ENROLLMENT_BLOCKED'
          ? 'Agotaste los intentos. Tu analista debe habilitarte un refuerzo.'
          : error instanceof ApiError && error.code === 'MAX_ATTEMPTS_REACHED'
            ? 'Ya no te quedan intentos para esta evaluacion.'
            : 'No se pudo abrir la evaluacion. Intenta de nuevo.';
      showToast({ kind: 'danger', title: message });
      setStartingId(null);
    }
  }

  return (
    <LearnerShell>
      <Link
        href="/hoy"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Volver a mis pendientes
      </Link>

      <div>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
          {/* Columna izquierda: de que va esto. */}
          <section className="animate-card-in">
            <ActivityCover
              seed={enrollment.activityId}
              colorHex={enrollment.activityType.colorHex}
              label={enrollment.activityType.name}
              variant="wide"
            />

            <h1 className="mt-5 font-display text-[26px] font-semibold leading-tight text-ink-900 lg:text-[32px]">
              {enrollment.activityName}
            </h1>

            {enrollment.activityDescription ? (
              <p className="mt-3 text-base leading-relaxed text-ink-500">{enrollment.activityDescription}</p>
            ) : null}

            <div className="mt-6 flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
              <ProgressRing value={pct} size={64} pulse={pct === 100} />
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-ink-900">
                  {done} de {contents.length} {contents.length === 1 ? 'parte' : 'partes'}
                </p>
                <p className="mt-0.5 text-sm text-ink-500">
                  Version {enrollment.versionNumber}
                  {enrollment.estimatedMinutes ? ` · ${enrollment.estimatedMinutes} min en total` : ''}
                </p>
              </div>
            </div>

            {/*
              SOBRE ESTA FORMACION. Las plataformas de mercado ponen aqui estrellas e inscritos,
              que sirven para decidir una compra. Aqui nadie elige: la induccion es obligatoria.
              Lo que si necesita saber quien la cursa es de donde sale y para que cuenta —a que
              proceso pertenece y a que norma tributa—, que es justo lo que convierte esto en
              evidencia y no en un video suelto. Ese dato existia y solo lo veia el administrador.
            */}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-line bg-surface p-5">
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Proceso</dt>
                <dd className="mt-1 text-sm text-ink-900">{enrollment.processName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Modalidad</dt>
                <dd className="mt-1 text-sm text-ink-900">{MODALITY_LABEL[enrollment.activityModality]}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Nota minima</dt>
                <dd className="mt-1 text-sm tabular-nums text-ink-900">
                  {toScore(enrollment.passingScore) ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Version</dt>
                <dd className="mt-1 text-sm tabular-nums text-ink-900">{enrollment.versionNumber}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Norma a la que tributa</dt>
                <dd className="mt-1 text-sm text-ink-900">
                  {enrollment.normNames.length > 0 ? enrollment.normNames.join(' · ') : 'No tributa a ninguna norma'}
                </dd>
              </div>
            </dl>

            {blocked ? (
              <section className="mt-4 rounded-xl border border-danger/40 bg-danger-soft p-5">
                <h2 className="font-display text-base font-semibold text-danger">Formacion bloqueada</h2>
                <p className="mt-1 text-sm text-ink-700">
                  {enrollment.blockedReason ?? 'Agotaste los intentos de la evaluacion.'} Tu analista y tu jefe ya
                  fueron avisados para habilitarte un refuerzo.
                </p>
              </section>
            ) : next ? (
              <Button
                size="lg"
                className="mt-4 w-full"
                loading={startingId === next.id}
                onClick={() => void openContent(next)}
              >
                {done === 0 ? 'Empezar' : 'Continuar'}
              </Button>
            ) : (
              <section className="mt-4 rounded-xl border border-ok/40 bg-ok-soft p-5 text-center">
                <Check className="mx-auto h-8 w-8 text-ok" strokeWidth={2} aria-hidden="true" />
                <h2 className="mt-2 font-display text-base font-semibold text-ok">Formacion terminada</h2>
                <p className="mt-1 text-sm text-ink-700">Quedo registrada en tu historial.</p>
              </section>
            )}
          </section>

          {/* Columna derecha: sus partes, como capitulos. */}
          <section className="mt-8 lg:mt-0">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Contenido</h2>
            <ol className="space-y-2">
              {contents.map((content, index) => {
                const Icon = ICON_BY_TYPE[content.type];
                const completed = content.status === 'COMPLETED';
                const isNext = content.id === next?.id;
                const attempt = content.assessmentId
                  ? attempts.filter((row) => row.assessmentId === content.assessmentId).at(-1)
                  : undefined;
                const score = attempt ? toScore(attempt.score) : null;

                return (
                  <li key={content.id}>
                    <button
                      type="button"
                      disabled={blocked || startingId !== null}
                      onClick={() => void openContent(content)}
                      className={cn(
                        'focus-ring flex w-full items-center gap-3 rounded-lg border bg-surface p-4 text-left transition-shadow duration-150 ease-pulse disabled:cursor-not-allowed disabled:opacity-60',
                        isNext ? 'border-primary shadow-card' : 'border-line hover:shadow-card',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium',
                          completed ? 'bg-ok-soft text-ok' : 'bg-paper text-ink-500',
                        )}
                      >
                        {completed ? <Check className="h-5 w-5" strokeWidth={2.5} /> : blocked ? <Lock className="h-4 w-4" strokeWidth={1.75} /> : index + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base text-ink-900">{content.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                            {LABEL_BY_TYPE[content.type]}
                          </span>
                          {minutesOf(content) ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                              {minutesOf(content)} min
                            </span>
                          ) : null}
                          {completed && score !== null ? <span className="text-ok">Aprobada con {score}</span> : null}
                          {!content.isRequired ? <span>Opcional</span> : null}
                        </span>

                        {/*
                          La barra solo aparece cuando hay algo empezado. Una barra a cero en cada
                          fila llena la pantalla de ruido y no informa de nada.
                        */}
                        {!completed && content.pct > 0 ? (
                          <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-line">
                            <span
                              className="block h-full rounded-full transition-[width] duration-[220ms] ease-pulse"
                              style={{ width: `${content.pct}%`, backgroundColor: 'var(--brand-accent)' }}
                            />
                          </span>
                        ) : null}
                      </span>

                      {isNext && !blocked ? (
                        <span className="shrink-0 text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
                          {content.pct > 0 ? 'Seguir' : 'Empezar'}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </LearnerShell>
  );
}
