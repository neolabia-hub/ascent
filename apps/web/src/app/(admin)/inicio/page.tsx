'use client';

import { useEffect, useState } from 'react';
import { me, type MeResponse } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

interface StatTileProps {
  label: string;
  value: string;
  note: string;
}

function StatTile({ label, value, note }: StatTileProps) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-2 font-display text-[28px] font-extrabold leading-none text-ink-900">{value}</p>
      <p className="mt-2 text-xs text-ink-300">{note}</p>
    </div>
  );
}

export default function InicioPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((result) => {
        if (!cancelled) {
          setProfile(result);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        {profile ? (
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Hola, {profile.fullName}</h1>
        ) : (
          <Skeleton className="h-8 w-64" />
        )}
        <p className="mt-1 text-sm text-ink-500">Este es el resumen de tu plataforma de formacion.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Personas activas" value="—" note="Disponible en el Sprint de reportes" />
        <StatTile label="Actividades" value="—" note="Disponible en el Sprint de reportes" />
        <StatTile label="Cumplimiento" value="—" note="Disponible en el Sprint de reportes" />
      </div>
    </div>
  );
}
