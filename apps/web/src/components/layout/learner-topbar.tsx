'use client';

import { Bell, ChevronDown, LogOut, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getInbox, logout, markAllNotificationsRead, markNotificationRead, type InboxItem } from '@/lib/api';
import { getMyProgress } from '@/lib/learner-api';
import { useLearnerProfile } from './learner-session';
import { clearOfflineData } from '@/components/providers/service-worker-bridge';
import { managesAnything } from '@/lib/landing';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/components/ui/cn';
import { SpaceSwitcher } from './space-switcher';
import { StreakPill } from '@/components/ui/streak-pill';
import { KIND_LABEL, notificationHref, notificationKind } from '@/lib/notification-kind';

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

function Notifications() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  /** Ver arriba (barra del panel): la campaña enseña lo no leido; lo leido no se borra, se pliega. */
  const [verLeidas, setVerLeidas] = useState(false);
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

  const visibles = items === null ? [] : verLeidas ? items : items.filter((item) => !item.readAt);
  const leidas = items === null ? 0 : items.filter((item) => item.readAt).length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setVerLeidas(false);
        }}
        aria-label={unread > 0 ? `${unread} avisos sin leer` : 'Avisos'}
        /*
          LA MISMA PASTILLA QUE EL CONMUTADOR (Decision #92): borde, superficie y sombra propios,
          siempre puestos. Los tres controles de la derecha son la misma familia, asi que se ven
          igual y se levantan igual al pasar. Antes cada uno tenia su forma y la barra parecia
          tres cosas pegadas.
        */
        className={cn(
          'focus-ring group/bell relative flex h-10 w-10 items-center justify-center rounded-full border shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:shadow-card-hover',
          open ? 'border-transparent text-ink-900' : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
        )}
        // Ver la nota del tono en `barras`: 5% de marca en reposo, --primary-soft al abrir.
        style={{ backgroundColor: open ? 'var(--brand-primary-soft)' : 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
      >
        {/* Se inclina al pasar. Es lo que hace una campana, y basta para que se sienta viva. */}
        <Bell
          className="h-[18px] w-[18px] origin-top transition-transform duration-300 ease-pulse group-hover/bell:-rotate-12"
          strokeWidth={1.75}
          aria-hidden="true"
        />
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
          ) : visibles.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              {verLeidas ? 'No tienes avisos.' : 'Nada sin leer. Aqui llegan los recordatorios de lo que vence.'}
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {visibles.slice(0, 8).map((item) => {
                const destino = notificationHref(item);
                const contenido = (
                  <>
                    {/*
                      DE QUE SOMBRERO ES el aviso. La bandeja es una sola —la persona tambien— pero
                      "tienes una formacion nueva" y "alguien agoto sus intentos" no son la misma
                      clase de cosa: una la haces tu, la otra es trabajo sobre otro.
                    */}
                    <div className="mb-1 flex items-center gap-2">
                      <KindChip eventType={item.eventType} />
                    </div>
                    <p className="text-sm font-medium text-ink-900">{item.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{item.body}</p>
                    <p className="mt-1 text-xs text-ink-300">
                      {new Date(item.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    </p>
                  </>
                );
                return (
                  <li key={item.id} className={cn('border-b border-line last:border-0', !item.readAt && 'bg-primary-soft/40')}>
                    {/*
                      Aqui los avisos ni siquiera se podian pulsar: se leian y habia que ir a
                      buscar a mano la formacion que nombraban. Ahora el que tiene destino LLEVA
                      —y el que no, se queda como texto, que es honesto—.
                    */}
                    {destino ? (
                      <Link
                        href={destino}
                        /*
                          ABRIRLO ES HABERLO LEIDO. Aqui faltaba: se podia entrar al aviso y el
                          contador seguia contandolo, asi que la campaña marcaba tres cuando ya se
                          habian visto los tres. No se BORRA —un aviso es el registro de algo que
                          paso y es la unica traza que explica por que alguien creia tener esa
                          formacion— pero deja de reclamar atencion.
                        */
                        onClick={() => {
                          setOpen(false);
                          if (!item.readAt) {
                            setUnread((actual) => Math.max(0, actual - 1));
                            void markNotificationRead(item.id);
                          }
                        }}
                        className="focus-ring block px-4 py-3 hover:bg-paper"
                      >
                        {contenido}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{contenido}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

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

function UserMenu({
  fullName,
  email,
  jobTitle,
  avatarKey,
}: {
  fullName: string;
  email: string;
  jobTitle: string | null;
  avatarKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Tu cuenta: ${fullName}${jobTitle ? `, ${jobTitle}` : ''}`}
        title={`${fullName}${jobTitle ? ` · ${jobTitle}` : ''}`}
        className={cn(
          'group/av focus-ring flex h-10 items-center gap-2 rounded-full border p-1 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:shadow-card-hover',
          open ? 'border-transparent' : 'border-line hover:border-line-strong',
        )}
        style={{ backgroundColor: open ? 'var(--brand-primary-soft)' : 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
      >
        <Avatar avatarKey={avatarKey} fullName={fullName} size={32} />
        {/*
          SOLO LA CARA, y el nombre APARECE AL PASAR (Decision #108).

          El nombre y el cargo estaban siempre puestos y ocupaban 140 px fijos de la barra para un
          dato que nadie necesita consultar: cada uno sabe como se llama. Servian para reconocer
          "esta es mi cuenta", y para eso basta la foto.

          Se despliega igual que el conmutador, con `grid-template-columns` de 0fr a 1fr: es lo
          unico que deja animar la aparicion de un texto de ancho DESCONOCIDO —con `width` habria
          que fijar un numero y un nombre largo se cortaria—. Sigue estando entero en el nombre
          accesible y en el tooltip, asi que quien navega escuchando no pierde nada; solo deja de
          ocupar sitio para quien no lo esta mirando.

          En TELEFONO no se abre nunca: ahi no hay "pasar por encima" y el ancho es lo que mas
          escasea. Queda la foto, que es justo el caso para el que la foto existe.

          `\s+` lleva barra invertida. Estuvo escrito `/s+/` y partia el nombre por la LETRA "s":
          "Jose Sanchez" salia "Jo e ". Falla callado — no revienta nada, solo escribe mal el
          nombre de quien acaba de entrar.
        */}
        <span className="hidden grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-focus-visible/av:grid-cols-[1fr] group-hover/av:grid-cols-[1fr] lg:grid">
          <span className="min-w-0 overflow-hidden pl-0.5 pr-1 text-left">
            <span className="block whitespace-nowrap text-xs font-semibold leading-tight text-ink-900">
              {fullName.trim().split(/\s+/).slice(0, 2).join(' ')}
            </span>
            {jobTitle ? (
              <span className="block whitespace-nowrap text-[11px] leading-tight text-ink-500">{jobTitle}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown className="mr-1 h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open ? (
        <div className="animate-card-in absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-card-hover">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-display text-sm font-semibold text-ink-900">{fullName}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
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

/**
 * LA BARRA SUPERIOR DEL APRENDIZ, la misma en toda su superficie —incluido el reproductor—.
 *
 * La racha se pide aqui dentro y no desde fuera para que quien monte la barra no tenga que saber
 * que existe: antes cada pantalla que la usara tenia que traerse el progreso a mano.
 *
 * `leading` sustituye al saludo donde el saludo no viene a cuento (en el reproductor va la salida
 * y el nombre de la formacion); `trailing` agrega los controles propios de esa pantalla.
 */
export function LearnerTopbar({
  greeting,
  onSearch,
  leading,
  leadingControls,
  trailing,
  wide = false,
}: {
  greeting?: string;
  onSearch: () => void;
  leading?: ReactNode;
  /** Controles de la pantalla, a la izquierda del bloque de la persona. */
  leadingControls?: ReactNode;
  trailing?: ReactNode;
  wide?: boolean;
}) {
  const profile = useLearnerProfile();
  const pathname = usePathname();
  const [streak, setStreak] = useState<number | null>(null);

  // Se relee al cambiar de pantalla: al terminar una leccion la racha puede haber avanzado.
  useEffect(() => {
    let cancelled = false;
    getMyProgress()
      .then((value) => {
        if (!cancelled) setStreak(value.currentStreak);
      })
      .catch(() => {
        // La racha es un adorno: si falla, la barra sigue siendo util sin ella.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    /*
     * `flush`: la barra se funde con el fondo, sin linea ni superficie propia. Se usa donde nada
     * se desplaza POR DEBAJO de ella —el reproductor, que desplaza solo el escenario—, y ahi la
     * linea solo partia la pantalla en dos sin separar nada. Donde el contenido si pasa por
     * debajo, la barra conserva su fondo y su borde: sin ellos, el texto se leeria encima.
     */
    <header
      className={cn(
        /*
          NI FONDO NI FIJA, y lo segundo es consecuencia de lo primero.

          Sin fondo y fija, el contenido pasaba POR DEBAJO y el saludo se leia encima de las
          tarjetas: ilegible en cuanto se desplazaba un poco. Las dos salidas de siempre son
          devolverle un velo —que es justo lo que se quito— o que no se quede pegada. Se elige la
          segunda: la barra se va con el contenido, no hay superficie que ensucie la portada y no
          hay nada que se pise. La navegacion no se pierde por eso —vive en la barra lateral, que
          si esta fija— y el buscador sigue a un Ctrl K desde cualquier sitio.
        */
        'z-30',
        // Sin linea inferior nunca: lo que separa la barra del contenido es el aire, no un filo.
        // Con contenido pasando por debajo conserva el velo difuminado para que el texto no se
        // lea encima. La barra NUNCA se superpone al contenido: el heroe empieza DEBAJO. Se probo
        // flotando sobre la portada y tapaba justo la primera franja de la imagen, que es donde
        // la foto tiene su asunto.
        /*
          SIEMPRE VISIBLE Y SIN FONDO, LAS DOS COSAS.

          Se probo con un velo que aparecia al desplazar y no vale: la barra no puede tener fondo
          en ningun estado. Y sin fondo, fija sobre el contenido, el saludo se leeria encima de las
          tarjetas.

          La salida no esta en la barra sino en el ARMAZON: quien desplaza no es la ventana, es el
          contenido (`learner-shell`). Con eso la barra no se superpone a nada —esta fuera de la
          zona que se mueve— y no necesita superficie para separarse. Es lo que ya hacia la
          superficie de administracion.
        */
        'shrink-0 bg-transparent',
      )}
    >
      <div className={cn('flex h-16 w-full items-center gap-3 px-5 lg:px-8', wide ? '' : 'mx-auto max-w-[1100px]')}>
        {leading ?? (
          <p className="min-w-0 shrink-0 truncate">
            <span className="text-sm text-ink-500">{greeting}, </span>
            <span className="font-display text-base font-semibold text-ink-900">
              {profile.fullName.split(/\s+/)[0]}
            </span>
          </p>
        )}

        <button
          type="button"
          onClick={onSearch}
          aria-label="Buscar"
          className="focus-ring flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900 lg:hidden"
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </button>

        {/*
          EL BUSCADOR OCUPA EL CENTRO y se lleva el espacio sobrante (Decision #90).

          Antes la barra tenia DOS zonas —saludo a la izquierda y todo lo demas amontonado a la
          derecha— y en un monitor ancho eso dejaba un vacio enorme en medio, con el bloque de la
          persona flotando lejos de las dos esquinas: no se leia ni como "arriba a la derecha" ni
          como parte de nada. Con el buscador en medio, cada cosa tiene su sitio y la barra se
          reparte sola a cualquier ancho.
        */}
        {/*
          EL BORDE SE ENCIENDE con los dos colores de la empresa al pasar y al enfocar
          (`.aurora-focus`, Decision #104). Es la misma pieza que ya usan los campos del ingreso, y
          va justamente aqui porque el buscador es el unico control de esta barra que ACEPTA algo
          escrito: el resto son botones. Un borde vivo dice "aqui se escribe" sin ninguna palabra.

          Se insinua al pasar y se enciende al enfocar, no late solo: una animacion permanente en
          la barra de arriba es un parpadeo en el rabillo del ojo durante toda la jornada, y esto lo
          mira gente que esta leyendo otra cosa.
        */}
        <button
          type="button"
          onClick={onSearch}
          className="aurora-focus focus-ring hidden h-10 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-sm text-ink-500 transition-colors duration-150 hover:border-transparent hover:text-ink-700 lg:flex"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1 truncate text-left">Buscar una formación</span>
          <kbd className="shrink-0 rounded border border-line px-1.5 text-[11px] text-ink-300">Ctrl K</kbd>
        </button>

        {/*
          `leadingControls` son los controles de la PANTALLA (plegar un panel, por ejemplo) y van
          antes de lo que es de la PERSONA —racha, avisos, cuenta—, que es un bloque y no debe
          partirse con botones de otra naturaleza en medio.
        */}
        {leadingControls}

        {/*
          LA RACHA SOLO EN TELEFONO (Decision #90). En escritorio vive en la barra lateral, junto a
          los puntos y las congelaciones: aqui era una pastilla suelta —un numero con una llama al
          lado no dice que es una racha ni que se pierde mañana— y ademas quedaba DUPLICADA con el
          bloque de la barra. En telefono no hay barra lateral, asi que ahi si se queda.
          Sigue siendo PRIVADA (Decision #23): es la propia, jamas la de otro.
        */}
        {streak !== null ? <StreakPill days={streak} className="animate-card-in inline-flex lg:hidden" /> : null}

        {/*
          LA VUELTA AL PANEL, solo para quien administra algo. Para el 95% del personal operativo
          esta superficie es la unica que existe y una puerta de mas seria una pantalla prohibida
          a un clic. Se decide por permisos, nunca por el nombre del rol.
        */}
        {managesAnything(profile.permissions) ? <SpaceSwitcher to="admin" /> : null}

        <Notifications />
        <UserMenu
          fullName={profile.fullName}
          email={profile.email}
          jobTitle={profile.jobTitle}
          avatarKey={profile.avatarKey}
        />
        {trailing}
      </div>
    </header>
  );
}
