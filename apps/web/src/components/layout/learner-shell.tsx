'use client';

import { CircleUser, GraduationCap, House, Repeat2, Search, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { useTenant } from '@/components/providers/tenant-provider';
import { cn } from '@/components/ui/cn';
import { CommandPalette } from './command-palette';
import { LearnerTopbar } from './learner-topbar';
import { useLearnerProfile } from './learner-session';

/**
 * El chrome del aprendiz, en las DOS superficies donde se usa.
 *
 * En telefono manda la barra INFERIOR: el pulgar no llega arriba y mucha de esta gente trabaja
 * con guantes. En escritorio esa misma barra abajo se ve como una app de movil estirada, asi que
 * a partir de `lg` pasa a ser un carril lateral y el contenido se ensancha.
 *
 * Es la misma aplicacion, no dos: cambia la disposicion, no las pantallas ni las rutas.
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


export function LearnerShell({ children }: { children: ReactNode }) {
  const profile = useLearnerProfile();
  const tenant = useTenant();
  const pathname = usePathname();
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="learner-surface min-h-screen bg-paper lg:flex">
      {/* Carril lateral: solo escritorio. */}
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <span className="truncate font-display text-sm font-semibold text-ink-900">{tenant.name}</span>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="focus-ring mx-3 mb-3 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink-500 transition-colors duration-150 hover:border-line-strong hover:text-ink-700"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="rounded border border-line px-1.5 text-[11px] text-ink-300">Ctrl K</kbd>
        </button>

        <nav aria-label="Navegacion principal" className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150 ease-pulse',
                  active ? 'bg-primary-soft font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                <Icon
                  className="h-4 w-4 shrink-0"
                  strokeWidth={active ? 2 : 1.75}
                  style={active ? { color: 'var(--brand-primary)' } : undefined}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Saludo a la izquierda, avisos y cuenta a la derecha: donde la gente los busca. */}
        <LearnerTopbar
          fullName={profile.fullName}
          email={profile.email}
          streak={progress?.currentStreak ?? null}
          greeting={greeting(new Date())}
          onSearch={() => setPaletteOpen(true)}
        />

        <main className="flex-1 pb-24 lg:pb-10">
          <div className="mx-auto w-full max-w-md px-5 py-6 lg:max-w-[1100px] lg:px-10 lg:py-10">{children}</div>
        </main>
      </div>

      {/* Barra inferior: solo movil. */}
      <nav
        aria-label="Navegacion principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex w-full max-w-md items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
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

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
