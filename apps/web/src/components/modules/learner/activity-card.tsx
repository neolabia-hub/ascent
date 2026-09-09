'use client';

import { Clock, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { describeDueDate } from '@/lib/format';
import { selfEnroll, type PendingItem } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';
import { useToast } from '@/components/ui/toast';
import { ActivityCover } from '../activity-cover';

/**
 * Tarjeta de formacion del catalogo: portada, titulo, cuanto cuesta y cuando vence.
 *
 * Toda la tarjeta es el area de pulsacion, no un boton dentro de ella. En un telefono, apuntar a
 * un boton de 40px con guantes falla; apuntar a una tarjeta de 300px no.
 *
 * Se mantiene la regla de la version anterior: si no hay forma de empezarla, la tarjeta lo DICE
 * en vez de dejar que alguien la pulse y choque contra un error.
 */
export function ActivityCard({ item, index = 0 }: { item: PendingItem; index?: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const canEnter = item.enrollmentId !== null;
  const canSelfStart = !canEnter && item.selfServiceOfferingId !== null;
  const blocked = !canEnter && !canSelfStart;

  const open = async () => {
    if (blocked || starting) return;
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
            ? 'Esta formación no esta disponible hoy.'
            : 'No se pudo empezar la formación.',
      });
      setStarting(false);
    }
  };

  return (
    <article
      // La aparicion escalonada da sensacion de que la lista "llega", no de que parpadea.
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="animate-card-in"
    >
      <button
        type="button"
        disabled={blocked}
        onClick={() => void open()}
        aria-busy={starting}
        className={cn(
          'focus-ring group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition-shadow duration-150 ease-pulse',
          blocked ? 'cursor-not-allowed opacity-70' : 'hover:shadow-card-hover',
        )}
      >
        <div className="relative">
          <ActivityCover seed={item.activityId} colorHex={item.type?.colorHex} label={item.type?.name} />
          {item.started ? (
            <span className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
              <span className="block h-full w-1/3" style={{ backgroundColor: 'var(--brand-accent)' }} />
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink-900">{item.title}</h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            {item.estimatedMinutes ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {item.estimatedMinutes} min
              </span>
            ) : null}
            <span className={cn(item.overdue && 'font-medium text-danger')}>{describeDueDate(item.dueAt)}</span>
          </div>

          {blocked ? (
            <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-ink-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              Todavia no esta abierta
            </p>
          ) : (
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
              {starting ? 'Abriendo...' : item.started ? 'Continuar' : 'Empezar'}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}
