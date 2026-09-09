'use client';

import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  House,
  LogOut,
  Search,
  Settings,
  Target,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { getInbox, logout, markAllNotificationsRead, markNotificationRead, type InboxItem } from '@/lib/api';
import { listUsers } from '@/lib/admin-api';
import { listActivities } from '@/lib/catalog-api';
import { SpaceSwitcher } from './space-switcher';
import { Avatar } from '@/components/ui/avatar';
import { saludoDe } from '@/lib/greeting';
import { cn } from '@/components/ui/cn';
import { useSession } from '@/components/providers/session-provider';
import { CommandPalette, type Command } from './command-palette';
import { useRouter } from 'next/navigation';
import { KIND_LABEL, notificationHref, notificationKind } from '@/lib/notification-kind';

/** Destinos del panel. Mismo buscador que el aprendiz, contenidos distintos. */
const ADMIN_COMMANDS: Command[] = [
  { id: 'a-inicio', label: 'Inicio', href: '/inicio', icon: House, group: 'Ir a' },
  { id: 'a-formaciones', label: 'Formaciones', href: '/contenido-formativo', icon: BookOpen, group: 'Ir a' },
  { id: 'a-convocatorias', label: 'Convocatorias', href: '/convocatorias', icon: CalendarDays, group: 'Ir a' },
  { id: 'a-asignaciones', label: 'Asignaciones', href: '/asignaciones', icon: Target, group: 'Ir a' },
  { id: 'a-plan', label: 'Plan anual', href: '/plan', icon: ClipboardList, group: 'Ir a' },
  { id: 'a-usuarios', label: 'Usuarios', href: '/usuarios', icon: Users, group: 'Ir a' },
  { id: 'a-roles', label: 'Roles y permisos', href: '/configuracion/roles', icon: Settings, group: 'Ir a' },
  { id: 'a-aprobaciones', label: 'Aprobaciones', href: '/aprobaciones', icon: CheckSquare, group: 'Ir a' },
  { id: 'a-reportes', label: 'Seguimiento', href: '/reportes', icon: ChartColumn, group: 'Ir a' },
];

/**
 * Lo que se busca de verdad en el panel: una formacion concreta o una persona concreta.
 *
 * Si una de las dos consultas falla por permisos —un analista sin `users:manage`— se devuelve lo
 * que si se pudo traer en vez de dejar el buscador vacio.
 */
async function loadAdminCommands(): Promise<Command[]> {
  const [activities, users] = await Promise.all([
    listActivities({ pageSize: 50 }).catch(() => ({ items: [] })),
    listUsers({ active: 'true', pageSize: 50 }).catch(() => ({ items: [] })),
  ]);
  return [
    ...activities.items.map((activity) => ({
      id: `act-${activity.id}`,
      label: activity.name,
      hint: activity.activityType.name,
      href: `/contenido-formativo/${activity.id}`,
      icon: BookOpen,
      group: 'Formaciones',
    })),
    ...users.items.map((user) => ({
      id: `usr-${user.id}`,
      label: user.fullName,
      hint: user.jobTitle.name,
      href: '/usuarios',
      icon: Users,
      group: 'Personas',
    })),
  ];
}

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

function KindChip({ eventType }: { eventType: string }) {
  const kind = notificationKind(eventType);
  if (!kind) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        kind === 'formacion' ? 'bg-primary-soft text-primary' : 'bg-info-soft text-info',
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function NotificationsMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  /**
   * LA CAMPANA ENSENA LO NO LEIDO. Un aviso leido se va de la vista: eso es lo que significa una
   * campaña, y sin ello la lista era un registro que no se vaciaba nunca —el aviso de una
   * obligacion retirada hace tres semanas seguia ahi, delante de lo de hoy—.
   *
   * Pero NO se borra: sigue estando bajo "Ver leidas", porque a veces es la unica traza que
   * explica por que alguien creia tener una formacion que ya le retiraron. Desaparecer de la vista
   * y desaparecer de la historia no son lo mismo.
   */
  const [verLeidas, setVerLeidas] = useState(false);
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
    if (next) setVerLeidas(false);
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

  const visibles = verLeidas ? items : items.filter((item) => !item.readAt);
  const leidas = items.filter((item) => item.readAt).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notificaciones"
        /*
          LA MISMA PASTILLA QUE EN EL APRENDIZ: borde, superficie y sombra propios, siempre
          puestos. Los tres controles de la derecha son una familia y tienen que verse como tal;
          sobre una barra sin fondo, un icono suelto no se lee como algo que se pulsa.
        */
        className={cn(
          'focus-ring group/bell relative flex h-10 w-10 items-center justify-center rounded-full border shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:shadow-card-hover',
          open ? 'border-transparent text-ink-900' : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
        )}
        style={{ backgroundColor: open ? 'var(--brand-primary-soft)' : 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
      >
        <Bell
          className="h-[18px] w-[18px] origin-top transition-transform duration-300 ease-pulse group-hover/bell:-rotate-12"
          strokeWidth={1.75}
        />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card absolute right-0 top-11 z-50 w-80 overflow-hidden animate-card-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notificaciones</p>
            {/* Lo tenia el aprendiz y no el panel, que es justo donde mas se acumulan. */}
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
                  setUnread(0);
                  void markAllNotificationsRead();
                }}
                className="focus-ring text-xs text-ink-500 hover:text-ink-900"
              >
                Marcar todo leido
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">Cargando...</p>
            ) : visibles.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                {verLeidas ? 'No hay notificaciones.' : 'Nada sin leer.'}
              </p>
            ) : (
              visibles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  /*
                    PULSAR UN AVISO LLEVA A SU SITIO, y de paso lo marca leido. Antes solo lo
                    marcaba: habia que leerlo, entenderlo y buscar a mano lo que nombraba. Si el
                    aviso no tiene un destino honesto se queda como estaba —marcar y nada mas—,
                    que es mejor que aterrizar en una lista donde hay que volver a buscar.
                  */
                  onClick={() => {
                    if (!item.readAt) void handleMarkRead(item.id);
                    const destino = notificationHref(item);
                    if (destino) {
                      setOpen(false);
                      router.push(destino);
                    }
                  }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-paper',
                    !item.readAt && 'bg-info-soft',
                  )}
                >
                  <span className="mb-1 flex items-center gap-2">
                    <KindChip eventType={item.eventType} />
                  </span>
                  <span className="text-sm font-medium text-ink-900">{item.subject}</span>
                  <span className="line-clamp-2 text-xs text-ink-500">{item.body}</span>
                  <span className="mt-0.5 text-[11px] text-ink-300">{formatRelative(item.createdAt)}</span>
                </button>
              ))
            )}
          </div>

          {leidas > 0 ? (
            <button
              type="button"
              onClick={() => setVerLeidas((actual) => !actual)}
              className="focus-ring w-full border-t border-line px-4 py-2.5 text-center text-xs text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
            >
              {verLeidas ? 'Ver solo lo no leido' : `Ver leidas (${leidas})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ userFullName, avatarKey }: { userFullName: string; avatarKey: string | null }) {
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
        className={cn(
          'group/av focus-ring flex h-10 items-center gap-2 rounded-full border p-1 pr-2.5 text-sm text-ink-700 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:shadow-card-hover',
          open ? 'border-transparent' : 'border-line hover:border-line-strong',
        )}
        style={{ backgroundColor: open ? 'var(--brand-primary-soft)' : 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
      >
        {/*
          SOLO LA CARA, y el nombre al pasar (Decision #108) — igual que en el aprendiz. Estaba
          siempre puesto y ocupaba 140 px de barra para decirle a alguien como se llama.
        */}
        <Avatar avatarKey={avatarKey} fullName={userFullName} size={32} />
        <span className="hidden grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-focus-visible/av:grid-cols-[1fr] group-hover/av:grid-cols-[1fr] lg:grid">
          <span className="min-w-0 overflow-hidden whitespace-nowrap">{userFullName}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
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
  userFullName: string;
}

export function Topbar({ userFullName }: TopbarProps) {
  const profile = useSession();
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  return (
    /*
      LA MISMA BARRA QUE LA DEL APRENDIZ (Decision #98). Era la ultima pieza con lenguaje propio.

      SIN FONDO Y SIN LINEA INFERIOR. Antes era una franja blanca con un filo debajo, y ese filo
      no separaba nada: la barra lateral ya se despego del borde para ser una tarjeta, asi que la
      franja pegada arriba dejaba la pantalla con una esquina cuadrada y un lado redondeado. Lo
      que separa la barra del contenido es el aire.

      Y por eso mismo LOS TRES CONTROLES llevan superficie propia siempre puesta, no solo al pasar
      el raton: sobre un fondo que no es suyo, un icono suelto no se lee como algo que se pulsa. Es
      literalmente lo que pidio el cliente —"los iconos tienen que verse, no el fondo"— y valia
      igual para las dos superficies.
    */
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 bg-transparent px-6">
      {/*
        EL SALUDO, NO EL NOMBRE DE LA PANTALLA (Decision #109).

        Ahi iba un breadcrumb que decia "Formaciones" estando en la pantalla de Formaciones, con
        el titulo "Formaciones" cincuenta pixeles mas abajo y el item "Formaciones" marcado en la
        barra lateral: la misma palabra tres veces sin que ninguna aportara nada. Un breadcrumb
        sirve para volver atras en una jerarquia, y este no era navegable ni tenia jerarquia.

        En su sitio va lo mismo que en el aprendiz y con la misma tipografia: quien administra es
        una persona de la empresa igual que el resto, y esta es la unica linea de la barra que le
        habla a ella. Las dos superficies dejan de sentirse dos productos.
      */}
      <p className="min-w-0 shrink-0 truncate">
        <span className="text-sm text-ink-500">{saludoDe()}, </span>
        <span className="font-display text-base font-semibold text-ink-900">
          {profile.fullName.trim().split(/\s+/)[0]}
        </span>
      </p>

      {/*
        Buscar es la accion mas repetida de quien administra: con doscientas formaciones y
        seiscientas personas, recorrer listas es el cuello de botella real del dia a dia.
      */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        /*
          EL MISMO BUSCADOR QUE EL DEL APRENDIZ (Decision #108): mismo alto, misma forma, mismo
          borde que se enciende con los colores de la empresa al enfocar. Eran dos cajas distintas
          para la misma accion en las dos mitades del producto, y quien administra usa las dos el
          mismo dia.

          Aqui tambien se lleva el espacio sobrante (`flex-1`), asi que la barra se reparte sola a
          cualquier ancho en vez de dejar un vacio en medio.
        */
        /*
          ANCHO ACOTADO, no todo el sobrante. Con `flex-1` a secas se estiraba hasta ochocientos
          pixeles en un monitor ancho: un campo de buscar de ese tamaño promete que ahi se escribe
          mucho, cuando lo que se teclea es un apellido. Con un maximo de 420 la barra respira y el
          saludo se queda pegado a su esquina en vez de flotar en medio.
        */
        className="aurora-focus focus-ring mx-auto hidden h-10 w-full max-w-[420px] min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-500 transition-colors duration-150 hover:border-transparent hover:text-ink-700 md:flex"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1 truncate text-left">Buscar</span>
        <kbd className="shrink-0 rounded border border-line px-1.5 text-[11px] text-ink-300">Ctrl K</kbd>
      </button>

      <div className="flex items-center gap-2">
        {/*
          QUIEN ADMINISTRA TAMBIEN SE FORMA. Va antes de la campaña y de la cuenta porque es
          navegacion —lleva a otro sitio— y no un desplegable de la barra.
        */}
        <SpaceSwitcher to="learner" />
        <NotificationsMenu />
        <UserMenu userFullName={userFullName} avatarKey={profile.avatarKey} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        staticCommands={ADMIN_COMMANDS}
        loadCommands={loadAdminCommands}
        placeholder="Buscar una formacion, una persona o ir a una pantalla"
      />
    </header>
  );
}
