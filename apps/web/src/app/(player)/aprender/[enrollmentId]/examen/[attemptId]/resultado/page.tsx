'use client';

import { CircleCheck, CircleX, Hourglass } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { reviewAttempt, type AttemptReview } from '@/lib/learner-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * RESULTADO del intento. Lo que se muestra aqui NO lo decide esta pantalla: lo decide la politica
 * de revision de la evaluacion, que el servidor aplica antes de responder (con un banco de
 * preguntas reutilizado, ensenar las correctas a todo el mundo equivale a publicar el examen).
 * Por eso `detail` puede llegar vacio y `score` en null: se dibuja lo que haya.
 */
export default function AttemptResultPage() {
  const params = useParams<{ enrollmentId: string; attemptId: string }>();
  const router = useRouter();
  const [review, setReview] = useState<AttemptReview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    reviewAttempt(params.attemptId)
      .then((value) => {
        if (!cancelled) setReview(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.attemptId]);

  if (failed) {
    return (
      <main className="learner-surface flex min-h-screen items-center justify-center bg-paper px-6 text-center">
        <div>
          <p className="text-base text-ink-500">Tu examen quedo entregado, pero no pudimos mostrar el resultado.</p>
          <Button className="mt-4" onClick={() => router.push(`/aprender/${params.enrollmentId}`)}>
            Volver a la formacion
          </Button>
        </div>
      </main>
    );
  }

  if (!review) {
    return (
      <main className="learner-surface min-h-screen bg-paper px-5 py-8">
        <div className="mx-auto max-w-md space-y-4">
          <Skeleton className="mx-auto h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  const pending = review.passed === null;
  const attemptsLeft = Math.max(0, review.maxAttempts - review.attemptsUsed);

  return (
    <main className="learner-surface min-h-screen bg-paper px-5 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <section className="text-center">
          <div
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
            style={{
              backgroundColor: pending ? 'var(--info-soft)' : review.passed ? 'var(--ok-soft)' : 'var(--danger-soft)',
            }}
          >
            {pending ? (
              <Hourglass className="h-9 w-9 text-info" strokeWidth={1.75} aria-hidden="true" />
            ) : review.passed ? (
              <CircleCheck className="h-9 w-9 text-ok" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <CircleX className="h-9 w-9 text-danger" strokeWidth={1.75} aria-hidden="true" />
            )}
          </div>

          <h1 className="mt-4 font-display text-[22px] font-semibold text-ink-900">
            {pending ? 'Entregado' : review.passed ? 'Aprobaste' : 'No alcanzaste la nota'}
          </h1>

          {pending ? (
            <p className="mt-2 text-base text-ink-500">
              Tiene preguntas abiertas: las califica una persona y te avisamos cuando este listo.
            </p>
          ) : review.score !== null ? (
            <p className="mt-2 font-display text-[36px] font-extrabold tabular-nums leading-none text-ink-900">
              {review.score}
            </p>
          ) : (
            <p className="mt-2 text-base text-ink-500">Tu resultado quedo registrado.</p>
          )}

          {!pending && !review.passed ? (
            <p className="mt-3 text-sm text-ink-500">
              {attemptsLeft > 0
                ? `Te ${attemptsLeft === 1 ? 'queda 1 intento' : `quedan ${attemptsLeft} intentos`}.`
                : 'Agotaste los intentos. Tu analista y tu jefe ya fueron avisados para habilitarte un refuerzo.'}
            </p>
          ) : null}
        </section>

        {review.detail.length > 0 ? (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-semibold text-ink-500">Revision</h2>
            <ul className="space-y-2">
              {review.detail.map((row, position) => {
                const right = row.pointsAwarded !== null && row.pointsAwarded >= row.pointsPossible;
                return (
                  <li key={`${position}-${row.stem.slice(0, 16)}`} className="card rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      {row.invalidated ? (
                        <span className="mt-0.5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">
                          ANULADA
                        </span>
                      ) : right ? (
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="text-base text-ink-900">{row.stem}</p>
                        {row.explanation ? <p className="mt-1 text-sm text-ink-500">{row.explanation}</p> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="pt-1 text-sm text-ink-500">
              Las preguntas que fallaste vuelven en tu repaso dentro de un par de dias.
            </p>
          </section>
        ) : null}

        <Button size="lg" className="w-full" onClick={() => router.push(`/aprender/${params.enrollmentId}`)}>
          Volver a la formacion
        </Button>
      </div>
    </main>
  );
}
