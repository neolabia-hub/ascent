'use client';

import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  ClipboardList,
  House,
  Layers,
  LogOut,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '@/lib/api';
import { useTenant } from '@/components/providers/tenant-provider';
import { cn } from '@/components/ui/cn';

const SIDEBAR_COLLAPSED_KEY = 'pulso.sidebar.collapsed';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: House },
  { href: '/contenido-formativo', label: 'Contenido formativo', icon: BookOpen },
  { href: '/lecciones', label: 'Lecciones', icon: Layers },
  { href: '/evaluaciones', label: 'Evaluaciones', icon: ClipboardCheck },
  { href: '/convocatorias', label: 'Convocatorias', icon: CalendarDays },
  { href: '/asignaciones', label: 'Asignaciones', icon: Target },
  { href: '/plan', label: 'Plan', icon: ClipboardList },
  { href: '/personas', label: 'Personas', icon: Users },
  { href: '/aprobaciones', label: 'Aprobaciones', icon: CheckSquare },
  { href: '/reportes', label: 'Reportes', icon: ChartColumn },
  { href: '/configuracion', label: 'Configuracion', icon: Settings },
];

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export interface SidebarProps {
  userFullName: string;
}

export function Sidebar({ userFullName }: SidebarProps) {
  const pathname = usePathname();
  const tenant = useTenant();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === '1') {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col bg-ink-900 transition-[width] duration-[220ms] ease-pulse',
        collapsed ? 'w-16' : 'w-[248px]',
      )}
    >
      <div className={cn('flex items-center gap-2 px-4 py-4', collapsed && 'justify-center px-0')}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-display text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {tenant.name.charAt(0).toUpperCase()}
        </div>
        {!collapsed ? (
          <span className="truncate font-display text-sm font-semibold text-white">{tenant.name}</span>
        ) : null}
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'focus-ring relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150',
                collapsed && 'justify-center px-0',
                active ? 'bg-white/10 font-medium text-white' : 'text-ink-300 hover:text-white',
              )}
              title={collapsed ? item.label : undefined}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: 'var(--brand-accent)' }}
                />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expandir menu' : 'Contraer menu'}
        className={cn(
          'focus-ring mx-2 mb-2 flex items-center justify-center gap-2 rounded-md py-2 text-xs text-ink-300 transition-colors duration-150 hover:bg-white/5 hover:text-white',
        )}
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <>
            <ChevronsLeft className="h-4 w-4" strokeWidth={1.75} />
            <span>Contraer</span>
          </>
        )}
      </button>

      <div className={cn('flex items-center gap-2.5 border-t border-white/10 px-3 py-3', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
          {getInitials(userFullName)}
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userFullName}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Cerrar sesion"
          title="Cerrar sesion"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-300 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
