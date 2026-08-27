'use client';

import { Flame, LogOut, Shield, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logout } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { useLearnerProfile } from '@/components/layout/learner-session';
import { clearOfflineData } from '@/components/providers/service-worker-bridge';
import { useTenant } from '@/components/providers/tenant-provider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERFIL. Aqui vive la racha, y vive SOLA: es privada (Decision #23), no se compara con nadie y
 * no existe ninguna pantalla donde otra persona la vea.
 *
 * Los puntos se ganan por logro real (terminar una leccion, aprobar un examen, hacer el repaso),
 * nunca por entrar. Por eso no hay "puntos por racha" ni moneda que gastar.
 */
export default function ProfilePage() {
  const profile = useLearnerProfile();
  const tenant = useTenant();
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyProgress()
      .then((value) => {
        if (!cancelled) setProgress(value);
      })
      .catch(() => {
        if (!cancelled) setProgress(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLeaving(true);
    // Antes de salir se borran del telefono la formacion cacheada y la cola pendiente.
    clearOfflineData();
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <div className="space-y-6">
      <section className="card rounded-xl p-6 text-center">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full font-display text-xl font-semibold"
          style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
          aria-hidden="true"
        >
          {profile.fullName.trim().charAt(0).toUpperCase()}
        </div>
        <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">{profile.fullName}</h2>
        <p className="mt-0.5 text-sm text-ink-500">{profile.email}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.04em] text-ink-500">{tenant.name}</p>
      </section>

      {progress === null ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <section className="grid grid-cols-2 gap-3">
          <StatTile
            icon={Flame}
            label="Racha actual"
            value={`${progress.currentStreak}`}
            hint={progress.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
          />
          <StatTile icon={Trophy} label="Puntos" value={formatNumber(progress.points)} hint="por logro real" />
          <StatTile
            icon={Flame}
            label="Racha mas larga"
            value={`${progress.longestStreak}`}
            hint={progress.longestStreak === 1 ? 'dia' : 'dias'}
          />
          <StatTile
            icon={Shield}
            label="Protectores"
            value={`${progress.freezesAvailable}`}
            hint="cubren un dia sin senal"
          />
        </section>
      )}

      <p className="text-center text-sm text-ink-500">
        Tu racha es privada: nadie mas la ve.
      </p>

      <Button variant="outline" size="lg" className="w-full" loading={leaving} onClick={() => void handleLogout()}>
        <LogOut className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        Cerrar sesion
      </Button>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2 text-ink-500">
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-[0.04em]">{label}</span>
      </div>
      <p className="mt-2 font-display text-[28px] font-extrabold tabular-nums leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
