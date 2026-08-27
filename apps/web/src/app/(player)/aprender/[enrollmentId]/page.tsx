'use client';

import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  Link2,
  Lock,
  PlayCircle,
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
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

const ICON_BY_TYPE: Record<ContentType, LucideIcon> = {
  LESSON: BookOpen,
  VIDEO: PlayCircle,
  DOCUMENT: FileText,
  ASSESSMENT: ClipboardCheck,
  SURVEY: ClipboardCheck,
  SCORM: BookOpen,
  LINK: Link2,
};

/**
 * INDICE DE LA EJECUCION: las piezas de la formacion en orden, con lo que la persona lleva de
 * cada una y UNA accion evidente: seguir por donde iba.
 *
 * Si la ejecucion esta bloqueada por intentos agotados se dice aqui, arriba y con todas las
 * letras (Decision #29): quien agoto los intentos necesita saber que le toca esperar un refuerzo,
 * no volver a intentar y chocarse con un error.
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
      <main className="learner-surface min-h-screen bg-paper px-5 py-8">
        <div className="mx-auto max-w-md text-center">
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
        <div className="mx-auto max-w-md space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
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
    if (!content.assessmentVersionId) return;

    // Un intento sin terminar se retoma; no se abre otro (gastaria un intento de los limitados).
    const openAttempt = attempts.find(
      (attempt) => attempt.assessmentVersionId === content.assessmentVersionId && attempt.status === 'IN_PROGRESS',
    );
    if (openAttempt) {
      router.push(`/aprender/${params.enrollmentId}/examen/${openAttempt.id}`);
      return;
    }

    setStartingId(content.id);
    try {
      const attempt = await startAttempt(params.enrollmentId, content.assessmentVersionId);
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
    <main className="learner-surface min-h-screen bg-paper pb-10">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-5">
          <Link
            href="/hoy"
            aria-label="Volver"
            className="focus-ring -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-700"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <p className="truncate font-display text-base font-semibold text-ink-900">{enrollment.activityName}</p>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-5 px-5 py-6">
        <section className="card flex items-center gap-4 rounded-xl p-5">
          <ProgressRing value={pct} size={64} pulse={pct === 100} />
          <div className="min-w-0">
            <p className="font-display text-base font-semibold text-ink-900">
              {done} de {contents.length} {contents.length === 1 ? 'parte' : 'partes'}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">
              Version {enrollment.versionNumber}
              {enrollment.estimatedMinutes ? ` · ${enrollment.estimatedMinutes} min` : ''}
            </p>
          </div>
        </section>

        {blocked ? (
          <section className="rounded-xl border border-danger/40 bg-danger-soft p-5">
            <h2 className="font-display text-base font-semibold text-danger">Formacion bloqueada</h2>
            <p className="mt-1 text-sm text-ink-700">
              {enrollment.blockedReason ?? 'Agotaste los intentos de la evaluacion.'} Tu analista y tu jefe ya
              fueron avisados para habilitarte un refuerzo.
            </p>
          </section>
        ) : next ? (
          <Button size="lg" className="w-full" loading={startingId === next.id} onClick={() => void openContent(next)}>
            {done === 0 ? 'Empezar' : 'Continuar'}
          </Button>
        ) : (
          <section className="rounded-xl border border-ok/40 bg-ok-soft p-5 text-center">
            <Check className="mx-auto h-8 w-8 text-ok" strokeWidth={2} aria-hidden="true" />
            <h2 className="mt-2 font-display text-base font-semibold text-ok">Formacion terminada</h2>
            <p className="mt-1 text-sm text-ink-700">Quedo registrada en tu historial.</p>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-display text-sm font-semibold text-ink-500">Partes</h2>
          <ul className="space-y-2">
            {contents.map((content) => {
              const Icon = ICON_BY_TYPE[content.type];
              const completed = content.status === 'COMPLETED';
              const attempt = content.assessmentVersionId
                ? attempts
                    .filter((row) => row.assessmentVersionId === content.assessmentVersionId)
                    .at(-1)
                : undefined;
              const score = attempt ? toScore(attempt.score) : null;

              return (
                <li key={content.id}>
                  <button
                    type="button"
                    disabled={blocked || startingId !== null}
                    onClick={() => void openContent(content)}
                    className={cn(
                      'focus-ring card card-hover flex w-full items-center gap-3 rounded-lg p-4 text-left disabled:opacity-60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        completed ? 'bg-ok-soft' : 'bg-paper',
                      )}
                    >
                      {completed ? (
                        <Check className="h-5 w-5 text-ok" strokeWidth={2.5} />
                      ) : blocked ? (
                        <Lock className="h-5 w-5 text-ink-300" strokeWidth={1.75} />
                      ) : (
                        <Icon className="h-5 w-5 text-ink-500" strokeWidth={1.75} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-ink-900">{content.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-500">
                        {completed
                          ? score !== null
                            ? `Aprobada con ${score}`
                            : 'Completada'
                          : content.pct > 0
                            ? `${content.pct}% avanzado`
                            : content.isRequired
                              ? 'Obligatoria'
                              : 'Opcional'}
                      </span>
                    </span>
                    {!completed && content.isRequired ? (
                      <StatusPill kind="warn" label="PENDIENTE" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
