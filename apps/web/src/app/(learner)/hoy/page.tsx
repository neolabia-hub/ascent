'use client';

import { ArrowRight, CircleCheck, Clock, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { describeDueDate, formatDate } from '@/lib/format';
import { getPending, getTodayReview, selfEnroll, type PendingItem, type TodayReview } from '@/lib/learner-api';
import { ActivityCard } from '@/components/modules/learner/activity-card';
import { ActivityCover } from '@/components/modules/activity-cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * INICIO del aprendiz: un catalogo, no una lista.
 *
 * El orden responde a como decide una persona con cinco minutos libres:
 *   1. lo que ya empezo (terminar algo a medias cuesta menos que empezar),
 *   2. el repaso del dia (tres minutos, sostiene lo aprendido),
 *   3. lo que le falta.
 *
 * Estetica sobria a proposito (referencia Sana Labs, no Netflix): portadas limpias, una sola
 * accion por tarjeta y nada que se mueva sin motivo. El contenido de una empresa no necesita
 * carrusel; necesita que se entienda que toca hacer.
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
      <div className="space-y-6">
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const started = pending.filter((item) => item.started);
  const notStarted = pending.filter((item) => !item.started);
  const hero = started[0] ?? notStarted[0] ?? null;
  const rest = pending.filter((item) => item.assignmentId !== hero?.assignmentId);

  if (!hero && (!review || review.total === 0)) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Estas al dia"
        description="No tienes formacion pendiente. Cuando te asignen una, aparecera aqui y te avisamos."
      />
    );
  }

  return (
    <div className="space-y-10">
      {hero ? <Hero item={hero} /> : null}

      <ReviewRow review={review} />

      {rest.length > 0 ? (
        <section aria-labelledby="pendientes">
          <h2 id="pendientes" className="mb-4 font-display text-lg font-semibold text-ink-900">
            {started.length > 1 ? 'Lo demas que tienes pendiente' : 'Tu formacion pendiente'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((item, index) => (
              <ActivityCard key={item.assignmentId} item={item} index={index} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * El heroe: UNA formacion, la que conviene hacer ahora. Se prefiere la que ya se empezo sobre la
 * mas urgente, porque abandonar algo a medias es el patron que mas mata la constancia.
 */
function Hero({ item }: { item: PendingItem }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const canEnter = item.enrollmentId !== null;
  const canSelfStart = !canEnter && item.selfServiceOfferingId !== null;

  const open = async () => {
    if (canEnter) {
      router.push(`/aprender/${item.enrollmentId}`);
      return;
    }
    if (!item.selfServiceOfferingId) return;
    setStarting(true);
    try {
      const result = await selfEnroll(item.selfServiceOfferingId);
      router.push(`/aprender/${result.enrollmentId}`);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_WINDOW_CLOSED'
            ? 'Esta formacion no esta disponible hoy.'
            : 'No se pudo empezar la formacion.',
      });
      setStarting(false);
    }
  };

  return (
    <section className="animate-card-in overflow-hidden rounded-xl border border-line bg-surface lg:flex">
      {/*
        En escritorio la portada llena su columna y deja de mandar la proporcion: si conserva el
        21/9 calcula su ancho desde el alto de la fila y se desborda sobre el texto.
      */}
      <div className="relative lg:w-[42%] lg:shrink-0">
        <ActivityCover
          seed={item.activityId}
          colorHex={item.type?.colorHex}
          label={item.type?.name}
          variant="wide"
          className="lg:absolute lg:inset-0 lg:aspect-auto lg:h-full lg:w-full lg:rounded-none"
        />
      </div>

      <div className="flex flex-1 flex-col justify-center p-6 lg:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">
          {item.started ? 'Continua donde ibas' : 'Lo primero'}
        </p>
        <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight text-ink-900 lg:text-[32px]">
          {item.title}
        </h1>

        {item.description ? <p className="mt-3 line-clamp-3 text-base text-ink-500">{item.description}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          {item.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {item.estimatedMinutes} min
            </span>
          ) : null}
          <span className={cn(item.overdue && 'font-medium text-danger')}>{describeDueDate(item.dueAt)}</span>
        </div>

        <div className="mt-6">
          {canEnter || canSelfStart ? (
            <Button size="lg" className="w-full sm:w-auto" loading={starting} onClick={() => void open()}>
              {item.started ? 'Continuar' : 'Empezar ahora'}
              {!starting ? <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : null}
            </Button>
          ) : (
            <p className="rounded-md bg-paper px-3 py-2 text-sm text-ink-500">
              Todavia no esta abierta. Quien programa la formacion debe convocarte.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** El repaso del dia. Si hoy no hay nada, se dice cuando vuelve en vez de dejar el hueco vacio. */
function ReviewRow({ review }: { review: TodayReview | null }) {
  if (!review) return null;

  if (review.total === 0) {
    if (review.pendingLater === 0) return null;
    return (
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink-900">Hoy no tienes repaso</h2>
        <p className="mt-1 text-sm text-ink-500">
          {review.pendingLater === 1 ? 'Tienes 1 pregunta guardada' : `Tienes ${review.pendingLater} preguntas guardadas`}
          {review.nextDueAt ? `; la proxima vuelve el ${formatDate(review.nextDueAt)}.` : '.'}
        </p>
      </section>
    );
  }

  return (
    <Link
      href="/repaso"
      className="focus-ring group flex items-center gap-4 rounded-xl border border-line bg-surface p-5 transition-shadow duration-150 ease-pulse hover:shadow-card-hover"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--brand-primary-soft)' }}
      >
        <Repeat2 className="h-6 w-6" strokeWidth={1.75} style={{ color: 'var(--brand-primary)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-semibold text-ink-900">Tu repaso de hoy</h2>
        <p className="mt-0.5 text-sm text-ink-500">
          {review.total === 1 ? '1 pregunta' : `${review.total} preguntas`} que fallaste antes. Tres minutos.
        </p>
      </div>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-ink-300 transition-transform duration-150 ease-pulse group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
