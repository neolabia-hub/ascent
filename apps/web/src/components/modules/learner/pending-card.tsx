'use client';

import { ArrowRight, Clock, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { describeDueDate } from '@/lib/format';
import { selfEnroll, type PendingItem } from '@/lib/learner-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/**
 * Una obligacion pendiente, tal como la ve quien tiene que cumplirla.
 *
 * La regla dura de esta tarjeta: **nunca un boton que no lleva a ninguna parte**. Hay tres
 * caminos posibles y la tarjeta elige uno solo:
 *  1. ya tiene la ejecucion abierta -> entra a ella;
 *  2. no la tiene pero hay convocatoria de autoservicio -> se inscribe sola y entra;
 *  3. no hay ninguna via -> lo DICE, en vez de ofrecer un boton que dara error.
 */
export function PendingCard({ item, featured = false }: { item: PendingItem; featured?: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const canEnterNow = item.enrollmentId !== null;
  const canSelfStart = !canEnterNow && item.selfServiceOfferingId !== null;

  async function handleStart() {
    if (canEnterNow) {
      router.push(`/aprender/${item.enrollmentId}`);
      return;
    }
    if (!item.selfServiceOfferingId) return;

    setStarting(true);
    try {
      const result = await selfEnroll(item.selfServiceOfferingId);
      router.push(`/aprender/${result.enrollmentId}`);
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === 'OFFERING_WINDOW_CLOSED'
          ? 'Esta formación no esta disponible hoy.'
          : 'No se pudo empezar la formación. Intenta de nuevo.';
      showToast({ kind: 'danger', title: message });
      setStarting(false);
    }
  }

  return (
    <article
      className={cn(
        'card card-hover animate-card-in rounded-xl p-5',
        item.overdue && 'border-danger/40',
        featured && 'p-6',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {item.type ? (
            <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">{item.type.name}</p>
          ) : null}
          <h3
            className={cn(
              'mt-1 font-display font-semibold text-ink-900',
              featured ? 'text-[22px] leading-tight' : 'text-base',
            )}
          >
            {item.title}
          </h3>
        </div>
        <StatusPill
          kind={item.overdue ? 'danger' : 'warn'}
          label={item.overdue ? 'VENCIDO' : 'PENDIENTE'}
        />
      </div>

      {featured && item.description ? (
        <p className="mt-2 line-clamp-3 text-sm text-ink-500">{item.description}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
        <span className={cn(item.overdue && 'font-medium text-danger')}>{describeDueDate(item.dueAt)}</span>
        {item.estimatedMinutes ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {item.estimatedMinutes} min
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {canEnterNow || canSelfStart ? (
          <Button
            size={featured ? 'lg' : 'md'}
            className={featured ? 'w-full' : undefined}
            loading={starting}
            onClick={() => void handleStart()}
          >
            {item.started ? 'Continuar' : 'Empezar'}
            {!starting ? <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : null}
          </Button>
        ) : (
          <p className="inline-flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-sm text-ink-500">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Todavia no esta abierta. Quien programa la formacion debe convocarte.
          </p>
        )}
      </div>
    </article>
  );
}
