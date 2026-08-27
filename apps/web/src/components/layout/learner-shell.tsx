'use client';

import { CircleUser, GraduationCap, House, Repeat2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';
import { StreakPill } from '@/components/ui/streak-pill';
import { useLearnerProfile } from './learner-session';

/**
 * El chrome del aprendiz: cabecera minima y barra INFERIOR de cuatro destinos
 * (skill pulse-ui, seccion 2). Sin barra lateral y sin migas de pan: el 80% de esta gente entra
 * desde un telefono, muchas veces con guantes puestos, y necesita el pulgar cerca de todo.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/hoy', label: 'Inicio', icon: House },
  { href: '/mi-formacion', label: 'Mi formacion', icon: GraduationCap },
  { href: '/repaso', label: 'Repaso', icon: Repeat2 },
  { href: '/perfil', label: 'Perfil', icon: CircleUser },
];

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Buenos dias';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Nombre de pila: "JUAN CARLOS PEREZ GOMEZ" en una cabecera de telefono no cabe ni sirve. */
function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function LearnerShell({ children }: { children: ReactNode }) {
  const profile = useLearnerProfile();
  const pathname = usePathname();
  const [progress, setProgress] = useState<MyProgress | null>(null);

  // Se relee al cambiar de pantalla: al volver de una leccion la racha puede haber avanzado.
  useEffect(() => {
    let cancelled = false;
    getMyProgress()
      .then((value) => {
        if (!cancelled) setProgress(value);
      })
      .catch(() => {
        // La racha es un adorno: si falla, la pantalla sigue siendo util sin ella.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="learner-surface flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-5">
          <div className="min-w-0">
            <p className="text-xs text-ink-500">{greeting(new Date())}</p>
            <p className="truncate font-display text-base font-semibold text-ink-900">
              {firstName(profile.fullName)}
            </p>
          </div>
          {progress ? <StreakPill days={progress.currentStreak} /> : null}
        </div>
      </header>

      <main className="flex-1 pb-24">
        <div className="mx-auto w-full max-w-md px-5 py-6">{children}</div>
      </main>

      <nav
        aria-label="Navegacion principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex w-full max-w-md items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-ring flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 ease-pulse',
                    active ? 'text-primary' : 'text-ink-500',
                  )}
                >
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={active ? 2 : 1.75}
                    aria-hidden="true"
                    style={active ? { color: 'var(--brand-primary)' } : undefined}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
