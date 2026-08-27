'use client';

import { CircleCheck, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/format';
import { getPending, getTodayReview, type PendingItem, type TodayReview } from '@/lib/learner-api';
import { PendingCard } from '@/components/modules/learner/pending-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * INICIO del aprendiz. Responde UNA pregunta: que me toca ahora.
 *
 * El orden no es decorativo: primero lo que mas apremia (lo mas proximo a vencer, que el backend
 * ya devuelve ordenado), luego el repaso del dia —que son 3 minutos y sostiene lo aprendido— y
 * solo despues la lista completa. Una persona con guantes y cinco minutos libres tiene que poder
 * pulsar una sola vez.
 */
export default function TodayPage() {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [review, setReview] = useState<TodayReview | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getPending()
      .then((response) => {
        if (!cancelled) setPending(response.items);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });

    void getTodayReview()
      .then((response) => {
        if (!cancelled) setReview(response);
      })
      .catch(() => {
        if (!cancelled) setReview(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (pending === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const [first, ...rest] = pending;

  return (
    <div className="space-y-6">
      {first ? (
        <section aria-labelledby="lo-de-hoy">
          <h2 id="lo-de-hoy" className="mb-3 font-display text-sm font-semibold text-ink-500">
            Lo primero
          </h2>
          <PendingCard item={first} featured />
        </section>
      ) : (
        <EmptyState
          icon={CircleCheck}
          title="No tienes formacion pendiente"
          description="Cuando te asignen una, aparecera aqui y te avisamos."
        />
      )}

      <ReviewTeaser review={review} />

      {rest.length > 0 ? (
        <section aria-labelledby="tambien-pendiente" className="space-y-3">
          <h2 id="tambien-pendiente" className="font-display text-sm font-semibold text-ink-500">
            Tambien pendiente ({rest.length})
          </h2>
          {rest.map((item) => (
            <PendingCard key={item.assignmentId} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/**
 * La sesion de repaso del dia. Si no hay nada vencido HOY se dice cuando vuelve: dejar el hueco
 * en blanco haria pensar que la funcion no sirve.
 */
function ReviewTeaser({ review }: { review: TodayReview | null }) {
  if (!review) return null;

  if (review.total === 0) {
    if (review.pendingLater === 0) return null;
    return (
      <section className="card rounded-xl p-5">
        <h2 className="font-display text-base font-semibold text-ink-900">Hoy no tienes repaso</h2>
        <p className="mt-1 text-sm text-ink-500">
          {review.pendingLater === 1
            ? 'Tienes 1 pregunta guardada'
            : `Tienes ${review.pendingLater} preguntas guardadas`}
          {review.nextDueAt ? `; la proxima vuelve el ${formatDate(review.nextDueAt)}.` : '.'}
        </p>
      </section>
    );
  }

  return (
    <Link
      href="/repaso"
      className="focus-ring card card-hover animate-card-in block rounded-xl p-5 text-left"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--brand-primary-soft)' }}
        >
          <Repeat2 className="h-6 w-6" strokeWidth={1.75} style={{ color: 'var(--brand-primary)' }} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink-900">Tu repaso de hoy</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {review.total === 1 ? '1 pregunta' : `${review.total} preguntas`} que fallaste antes. Tres minutos.
          </p>
        </div>
      </div>
    </Link>
  );
}
