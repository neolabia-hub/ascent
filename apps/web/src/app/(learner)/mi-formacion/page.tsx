'use client';

import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/format';
import { getHistory, getPending, toScore, type HistoryItem, type PendingItem } from '@/lib/learner-api';
import { ActivityCard } from '@/components/modules/learner/activity-card';
import { ActivityCover } from '@/components/modules/activity-cover';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';

/**
 * MI FORMACION: la hoja de vida formativa de la persona, como catalogo.
 *
 * El historial importa mas de lo que parece. Es lo que alguien enseña cuando le preguntan si hizo
 * la induccion, y lo que consulta antes de pedir un certificado. Por eso se ve igual de cuidado
 * que lo pendiente y no como una tabla de registros.
 */
type Tab = 'pendiente' | 'historial';

/**
 * `?actividad=<id>` llega desde un aviso ("se te asigno X"). Sin eso, pulsar el aviso dejaba a la
 * persona delante de doce tarjetas para buscar la que le acababan de nombrar.
 *
 * Suspense porque `useSearchParams` obliga a ello en el App Router: sin el, la pagina entera se
 * renderiza en cliente y se pierde el prerender.
 */
export default function MyLearningPage() {
  return (
    <Suspense fallback={<CardsSkeleton />}>
      <MyLearning />
    </Suspense>
  );
}

function MyLearning() {
  const destacada = useSearchParams().get('actividad');
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
    <div className="space-y-6">
      <h1 className="font-display text-[26px] font-semibold text-ink-900 lg:text-[32px]">Mi aprendizaje</h1>

      <div role="tablist" aria-label="Mi aprendizaje" className="flex gap-1 rounded-full bg-paper p-1 sm:max-w-md">
        <TabButton active={tab === 'pendiente'} onClick={() => setTab('pendiente')}>
          Pendiente{pending && pending.length > 0 ? ` (${pending.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'historial'} onClick={() => setTab('historial')}>
          Historial{history && history.length > 0 ? ` (${history.length})` : ''}
        </TabButton>
      </div>

      {tab === 'pendiente' ? <PendingList items={pending} highlight={destacada} /> : <HistoryList items={history} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

function PendingList({ items, highlight }: { items: PendingItem[] | null; highlight?: string | null }) {
  const marcada = useRef<HTMLDivElement>(null);

  // Se lleva la vista hasta ella. En un telefono, la que buscas puede estar tres pantallas abajo.
  useEffect(() => {
    if (highlight && marcada.current) {
      marcada.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlight, items]);

  if (items === null) return <CardsSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No tienes formación pendiente"
        description="Cuando te asignen una, aparecera aquí."
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const esLaDelAviso = highlight === item.activityId;
        return (
          <div
            key={item.assignmentId}
            ref={esLaDelAviso ? marcada : undefined}
            className={cn('rounded-2xl transition-shadow duration-300', esLaDelAviso && 'ring-2 ring-primary ring-offset-2 ring-offset-paper')}
          >
            <ActivityCard item={item} index={index} />
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ items }: { items: HistoryItem[] | null }) {
  if (items === null) return <CardsSkeleton />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Todavía no has terminado ninguna"
        description="Lo que completes queda aquí con su fecha y su nota, y no se borra."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const score = toScore(item.finalScore);
        const activity = item.offering?.activityVersion.activity;

        return (
          <article
            key={item.id}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            className="animate-card-in"
          >
            <Link
              href={`/aprender/${item.id}`}
              className="focus-ring block overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-150 ease-pulse hover:shadow-card-hover"
            >
              {/*
                Encadenamiento opcional HASTA EL FINAL. El tipo de formacion se anadio al
                historial despues, y un registro viejo —o una API sin actualizar— lo trae sin el.
                Un campo opcional que falta tiene que degradar la portada, nunca tumbar la
                pantalla entera: esto reventaba el historial completo con una pantalla de error.
              */}
              <ActivityCover
                seed={activity?.id ?? item.id}
                colorHex={activity?.activityType?.colorHex}
                label={activity?.activityType?.name}
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink-900">
                    {activity?.name ?? 'Actividad formativa'}
                  </h3>
                  <StatusPill kind={statusKind(item.status)} label={statusLabel(item.status)} />
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {formatDate(item.completedAt)}
                  {item.offering ? ` · v${item.offering.activityVersion.versionNumber}` : ''}
                </p>
                {score !== null ? (
                  <p className="mt-1 text-sm text-ink-500">
                    Nota <span className="font-display font-semibold tabular-nums text-ink-900">{score}</span>
                  </p>
                ) : null}
              </div>
            </Link>
          </article>
        );
      })}
    </div>
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

function CardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
