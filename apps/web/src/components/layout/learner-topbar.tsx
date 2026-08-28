'use client';

import { Bell, ChevronDown, LogOut, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getInbox, logout, markAllNotificationsRead, type InboxItem } from '@/lib/api';
import { clearOfflineData } from '@/components/providers/service-worker-bridge';
import { cn } from '@/components/ui/cn';
import { StreakPill } from '@/components/ui/streak-pill';

/**
 * Barra superior del aprendiz: buscar, avisos y quien soy.
 *
 * Antes el nombre y la racha vivian al pie del carril lateral, que es donde nadie mira. Arriba a
 * la derecha es donde la gente los busca por costumbre —de cualquier otra aplicacion que use— y
 * ademas deja sitio para los avisos, que antes el colaborador no tenia forma de ver: le llegaban
 * por correo y se perdian.
 */

function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const ref = useOutsideClick(() => setOpen(false));

  useEffect(() => {
    let cancelled = false;
    getInbox(false)
      .then((inbox) => {
        if (cancelled) return;
        setUnread(inbox.unread);
        setItems(inbox.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `${unread} avisos sin leer` : 'Avisos'}
        className="focus-ring relative flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-card-in absolute right-0 z-40 mt-2 w-[340px] overflow-hidden rounded-xl border border-line bg-surface shadow-card-hover">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display text-sm font-semibold text-ink-900">Avisos</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => {
                  void markAllNotificationsRead();
                  setUnread(0);
                }}
                className="focus-ring text-xs text-ink-500 hover:text-ink-900"
              >
                Marcar todo leido
              </button>
            ) : null}
          </div>

          {items === null ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              No tienes avisos. Aqui llegan los recordatorios de lo que vence.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.slice(0, 8).map((item) => (
                <li key={item.id} className={cn('border-b border-line px-4 py-3 last:border-0', !item.readAt && 'bg-primary-soft/40')}>
                  <p className="text-sm font-medium text-ink-900">{item.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{item.body}</p>
                  <p className="mt-1 text-xs text-ink-300">
                    {new Date(item.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ fullName, email, streak }: { fullName: string; email: string; streak: number | null }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Tu cuenta"
        className="focus-ring flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors duration-150 hover:bg-paper"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {initials || <UserRound className="h-4 w-4" strokeWidth={1.75} />}
        </span>
        <ChevronDown className="h-4 w-4 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open ? (
        <div className="animate-card-in absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-card-hover">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-display text-sm font-semibold text-ink-900">{fullName}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
            {streak !== null ? (
              <div className="mt-2.5">
                <StreakPill days={streak} />
              </div>
            ) : null}
          </div>
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="focus-ring flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-paper"
          >
            <UserRound className="h-4 w-4 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
            Mi perfil
          </Link>
          <button
            type="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              clearOfflineData();
              void logout().finally(() => window.location.assign('/login'));
            }}
            className="focus-ring flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm text-ink-700 hover:bg-paper disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
            Cerrar sesion
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LearnerTopbar({
  fullName,
  email,
  streak,
  greeting,
  onSearch,
}: {
  fullName: string;
  email: string;
  streak: number | null;
  greeting: string;
  onSearch: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center gap-3 px-5 lg:px-10">
        <p className="min-w-0 flex-1 truncate">
          <span className="text-sm text-ink-500">{greeting}, </span>
          <span className="font-display text-base font-semibold text-ink-900">{fullName.split(/\s+/)[0]}</span>
        </p>

        <button
          type="button"
          onClick={onSearch}
          aria-label="Buscar"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900 lg:hidden"
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <Notifications />
        <UserMenu fullName={fullName} email={email} streak={streak} />
      </div>
    </header>
  );
}
