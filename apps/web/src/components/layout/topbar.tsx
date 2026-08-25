'use client';

import { Bell, ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { getInbox, logout, markNotificationRead, type InboxItem } from '@/lib/api';
import { cn } from '@/components/ui/cn';

function useOutsideClick(ref: RefObject<HTMLElement>, onOutside: () => void) {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutside();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, onOutside]);
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  useEffect(() => {
    let cancelled = false;
    getInbox(true)
      .then((inbox) => {
        if (!cancelled) {
          setUnread(inbox.unread);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const inbox = await getInbox();
        setItems(inbox.items.slice(0, 10));
        setUnread(inbox.unread);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMarkRead(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    setUnread((current) => Math.max(0, current - 1));
    try {
      await markNotificationRead(id);
    } catch {
      // el estado ya se actualizo de forma optimista; una recarga posterior lo reconcilia
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notificaciones"
        className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-md text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card absolute right-0 top-11 z-50 w-80 overflow-hidden animate-card-in">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notificaciones</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Cargando...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">No hay notificaciones.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (item.readAt ? undefined : handleMarkRead(item.id))}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-paper',
                    !item.readAt && 'bg-info-soft',
                  )}
                >
                  <span className="text-sm font-medium text-ink-900">{item.subject}</span>
                  <span className="line-clamp-2 text-xs text-ink-500">{item.body}</span>
                  <span className="mt-0.5 text-[11px] text-ink-300">{formatRelative(item.createdAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ userFullName }: { userFullName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  async function handleLogout() {
    try {
      await logout();
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="focus-ring flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-700 transition-colors duration-150 hover:bg-paper"
      >
        <span className="max-w-[140px] truncate">{userFullName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-500" strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="card absolute right-0 top-11 z-50 w-48 overflow-hidden animate-card-in">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-700 transition-colors duration-150 hover:bg-paper"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Cerrar sesion
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface TopbarProps {
  breadcrumb: ReactNode;
  userFullName: string;
}

export function Topbar({ breadcrumb, userFullName }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
      <div className="min-w-0 text-sm text-ink-500">{breadcrumb}</div>
      <div className="flex items-center gap-2">
        <NotificationsMenu />
        <UserMenu userFullName={userFullName} />
      </div>
    </header>
  );
}
