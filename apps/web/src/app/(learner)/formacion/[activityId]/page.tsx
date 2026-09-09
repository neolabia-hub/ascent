'use client';

import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getHistory, getPending, type HistoryItem, type PendingItem } from '@/lib/learner-api';
import { ActivityCard } from '@/components/modules/learner/activity-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * UNA FORMACION CONCRETA, desde un aviso.
 *
 * Un aviso dice "se te asigno la induccion de alturas" y hasta ahora lo mejor que podia hacer era
 * dejarte en una lista de doce tarjetas para que la buscaras. Esto resuelve el salto: se busca esa
 * formacion entre lo tuyo y se entra a ella.
 *
 * Y cuando NO esta —que es el caso que mas confunde— se dice por que. La obligacion pudo retirarse
 * despues del aviso: quien sale de la audiencia deja de tenerla (`WITHDRAWN_LEFT_AUDIENCE`), y el
 * aviso, que es un registro de lo que paso, se queda. Antes eso se veia como "pulso y no pasa
 * nada", que es la peor forma de contarlo.
 */
export default function LearnerActivityPage() {
  const router = useRouter();
  const activityId = String(useParams().activityId ?? '');

  const [pendiente, setPendiente] = useState<PendingItem | null | undefined>(undefined);
  const [hecha, setHecha] = useState<HistoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getPending().catch(() => ({ items: [] })), getHistory().catch(() => ({ items: [] }))]).then(
      ([pendientes, historial]) => {
        if (cancelled) return;
        const encontrada = pendientes.items.find((item) => item.activityId === activityId) ?? null;

        // Si ya esta empezada, no hay nada que enseñar aqui: se entra directamente a ella.
        if (encontrada?.enrollmentId) {
          router.replace(`/aprender/${encontrada.enrollmentId}`);
          return;
        }
        setPendiente(encontrada);
        setHecha(
          historial.items.find((item) => item.offering?.activityVersion.activity.id === activityId) ?? null,
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [activityId, router]);

  if (pendiente === undefined) return <Skeleton className="h-64 w-full rounded-2xl" />;

  if (pendiente) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-[26px] font-semibold text-ink-900">{pendiente.title}</h1>
        <div className="max-w-md">
          <ActivityCard item={pendiente} />
        </div>
        <Link href="/mi-formacion" className="focus-ring inline-block text-sm text-ink-500 underline-offset-4 hover:underline">
          Ver toda mi formacion
        </Link>
      </div>
    );
  }

  return (
    <EmptyState
      icon={GraduationCap}
      title={hecha ? 'Esta formacion ya la hiciste' : 'Esta formacion ya no esta entre tus pendientes'}
      description={
        hecha
          ? 'Esta en tu historial, con su nota y su fecha.'
          : 'El aviso quedo como registro de lo que paso, pero la obligacion se retiro despues: ocurre cuando alguien deja de pertenecer a la audiencia a la que se le exigia.'
      }
      action={
        <Link href="/mi-formacion">
          <Button variant="outline">{hecha ? 'Ver mi historial' : 'Ver mi formacion'}</Button>
        </Link>
      }
    />
  );
}
