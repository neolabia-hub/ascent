'use client';

import { GraduationCap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { getHistory, getPending, toScore, type HistoryItem, type PendingItem } from '@/lib/learner-api';
import { PendingCard } from '@/components/modules/learner/pending-card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';

/**
 * MI FORMACION: la hoja de vida formativa de la persona. Lo que debe y lo que ya hizo, en el
 * mismo sitio, porque para el colaborador es una sola historia.
 *
 * El historial importa mas de lo que parece: es lo que una persona ensena cuando le preguntan si
 * hizo la induccion, y lo que consulta antes de pedir un certificado.
 */
type Tab = 'pendiente' | 'historial';

export default function MyLearningPage() {
  const [tab, setTab] = useState<Tab>('pendiente');
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getPending()
      .then((response) => {
        if (!cancelled) setPending(response.items);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });

    void getHistory()
      .then((response) => {
        if (!cancelled) setHistory(response.items);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Mi formacion" className="flex gap-1 rounded-full bg-paper p-1">
        <TabButton active={tab === 'pendiente'} onClick={() => setTab('pendiente')}>
          Pendiente{pending && pending.length > 0 ? ` (${pending.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'historial'} onClick={() => setTab('historial')}>
          Historial
        </TabButton>
      </div>

      {tab === 'pendiente' ? <PendingList items={pending} /> : <HistoryList items={history} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'focus-ring h-11 flex-1 rounded-full text-sm font-medium transition-colors duration-150 ease-pulse',
        active ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500',
      )}
    >
      {children}
    </button>
  );
}

function PendingList({ items }: { items: PendingItem[] | null }) {
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No tienes formacion pendiente"
        description="Cuando te asignen una, aparecera aqui."
      />
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <PendingCard key={item.assignmentId} item={item} />
      ))}
    </div>
  );
}

function HistoryList({ items }: { items: HistoryItem[] | null }) {
  if (items === null) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Todavia no has terminado ninguna"
        description="Lo que completes queda aqui con su fecha y su nota."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const score = toScore(item.finalScore);
        const activity = item.offering?.activityVersion.activity.name ?? 'Actividad formativa';
        return (
          <li key={item.id} className="card animate-card-in rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-ink-900">{activity}</h3>
                <p className="mt-1 text-sm text-ink-500">
                  {formatDate(item.completedAt)}
                  {item.offering ? ` · v${item.offering.activityVersion.versionNumber}` : ''}
                </p>
              </div>
              <StatusPill kind={statusKind(item.status)} label={statusLabel(item.status)} />
            </div>
            {score !== null ? (
              <p className="mt-3 text-sm text-ink-500">
                Nota <span className="font-display font-semibold tabular-nums text-ink-900">{score}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function statusKind(status: HistoryItem['status']): 'ok' | 'danger' | 'info' {
  if (status === 'FAILED') return 'danger';
  if (status === 'PASSED') return 'ok';
  return 'info';
}

function statusLabel(status: HistoryItem['status']): string {
  if (status === 'PASSED') return 'APROBADO';
  if (status === 'FAILED') return 'REPROBADO';
  return 'COMPLETADO';
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
