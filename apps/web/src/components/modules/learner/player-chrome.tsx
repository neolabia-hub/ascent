'use client';

import {
  ChevronLeft,
  CircleUser,
  GraduationCap,
  House,
  ListTree,
  PanelRightClose,
  PanelRightOpen,
  Repeat2,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { TenantMark } from '@/components/layout/tenant-mark';
import { cn } from '@/components/ui/cn';
import { LearnerTopbar } from '@/components/layout/learner-topbar';

/**
 * EL ARMAZON DEL REPRODUCTOR.
 *
 * Hasta el 2026-08-28 el reproductor se presentaba sin nada alrededor: ni carril ni barra. La
 * razon era buena —cada elemento de navegacion en pantalla es una invitacion a irse— y se cambia
 * a proposito, porque en escritorio costaba mas de lo que ahorraba: quien cursa una formacion de
 * siete partes necesita saber DONDE esta y CUANTO le falta sin salir a mirarlo, y sin barra no
 * habia forma. Lo que se conserva es la intencion: el carril se presenta PLEGADO a iconos, la
 * barra superior lleva el nombre de la formacion y no un menu, y en telefono no aparece ninguno
 * de los dos (Decision #49).
 *
 * Tres columnas, como los LMS que hacen esto bien:
 *
 *   [carril 64px] [ escenario, que manda ] [ indice del curso 340px ]
 *
 * UN INDICADOR POR PREGUNTA, y solo uno. Llego a haber tres midiendo lo mismo —una barra en la
 * barra superior, una linea bajo ella y el anillo del indice— y tres barras no informan el triple:
 * informan menos, porque ninguna se mira. Quedan dos, y responden preguntas DISTINTAS: el anillo
 * del indice dice cuanto llevas de la FORMACION; dentro del escenario, cada tipo de contenido
 * enseña su propio avance en su propia unidad —los tramos de la presentacion, el relleno del boton
 * en el video, el contador de tarjetas en una leccion—.
 *
 * El indice va a la DERECHA y no a la izquierda por una razon concreta: al plegarlo, el escenario
 * crece hacia ese lado y su borde izquierdo NO se mueve. Con el indice a la izquierda, mostrarlo
 * u ocultarlo desplazaria el video entero de sitio, que es justo lo que marea a mitad de una
 * leccion.
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/hoy', label: 'Inicio', icon: House },
  { href: '/mi-formacion', label: 'Mi aprendizaje', icon: GraduationCap },
  { href: '/repaso', label: 'Repaso', icon: Repeat2 },
  { href: '/perfil', label: 'Perfil', icon: CircleUser },
];

const INDEX_PREFERENCE_KEY = 'pulse.player.index';

/**
 * Si el indice se ve o no, recordado entre sesiones.
 *
 * Es una preferencia de comodidad, no un dato: si el navegador no deja leerla (modo privado,
 * almacenamiento bloqueado) se abre visible, que es lo util por defecto.
 */
export function useIndexPanel(): [boolean, () => void] {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(INDEX_PREFERENCE_KEY);
      if (stored === 'oculto') setOpen(false);
    } catch {
      // Sin preferencia guardada se queda con el valor util por defecto.
    }
  }, []);

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(INDEX_PREFERENCE_KEY, next ? 'visible' : 'oculto');
      } catch {
        // Que no se pueda recordar no impide usarlo ahora.
      }
      return next;
    });
  };

  return [open, toggle];
}

/**
 * CARRIL DE LA APLICACION: plegado a iconos por defecto, desplegable a mano.
 *
 * Plegado ocupa 64 px y sigue diciendo donde se puede ir; desplegado pone los rotulos. No se
 * despliega solo al pasar el raton: un carril que se abre sin que nadie lo pida empuja el
 * contenido mientras alguien lee, y eso es peor que un icono sin rotulo.
 */
function PlayerRail() {
  const tenant = useTenant();
  const [expanded, setExpanded] = useState(false);

  return (
    /*
      LA MISMA BARRA QUE EN EL RESTO DEL APRENDIZ (Decision #109).

      Era la unica del producto con forma propia: pegada al borde, con un filo a la derecha y un
      fondo tenido, mientras las otras dos ya eran tarjetas blancas que flotan. Y sobre todo, NO
      TRAIA EL LOGO —pintaba la inicial de la empresa en un cuadro de color, que es el respaldo de
      cuando no hay logo—, asi que justo en la pantalla donde alguien pasa media hora seguida
      desaparecia la marca de su empresa.

      Ahora es la misma tarjeta flotante, con `TenantMark` como las demas. Lo que NO se copia es el
      ancho: aqui se presenta PLEGADA a 64 px, porque el escenario manda y una barra de 264 px le
      come un tercio de la pantalla a alguien que esta leyendo.

      Los colores salen de la superficie de lectura (`--reading-*`) y no de la paleta general: esta
      pantalla tiene su propio papel calido, y una tarjeta blanca pura encima se veria como un
      parche recortado de otra pantalla.
    */
    <aside
      className={cn(
        'hidden shrink-0 flex-col p-3 transition-[width] duration-[220ms] ease-pulse lg:flex',
        expanded ? 'w-[248px]' : 'w-[80px]',
      )}
    >
      <div
        className="flex min-h-0 flex-1 flex-col rounded-3xl border shadow-card"
        style={{ borderColor: 'var(--reading-line)', backgroundColor: 'var(--reading-paper)' }}
      >
      <Link
        href="/hoy"
        aria-label={`Ir al inicio de ${tenant.name}`}
        className={cn('focus-ring flex shrink-0 items-center px-4 py-4', !expanded && 'justify-center px-0')}
      >
        <TenantMark collapsed={!expanded} />
      </Link>

      <nav aria-label="Navegacion principal" className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={expanded ? undefined : item.label}
              className={cn(
                'focus-ring group relative flex h-11 items-center rounded-[10px] transition-colors duration-150 ease-pulse',
                expanded ? 'gap-3 px-3' : 'justify-center',
              )}
              style={{ color: 'var(--reading-muted)' }}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {expanded ? <span className="truncate text-sm">{item.label}</span> : null}
              {/*
                Rotulo emergente cuando esta plegado. Sin el, un carril de iconos obliga a
                adivinar, y aqui hay gente que entra a la plataforma tres veces al año.
              */}
              {!expanded ? (
                <span
                  role="presentation"
                  className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs shadow-card group-hover:block"
                  style={{ backgroundColor: 'var(--reading-ink)', color: 'var(--reading-paper)' }}
                >
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-label={expanded ? 'Plegar el menú' : 'Desplegar el menú'}
        className={cn(
          'focus-ring m-3 flex h-10 items-center rounded-[10px] text-xs transition-colors duration-150',
          expanded ? 'gap-2 px-3' : 'justify-center',
        )}
        style={{ color: 'var(--reading-muted)' }}
      >
        <ChevronLeft
          className={cn('h-4 w-4 transition-transform duration-[220ms] ease-pulse', expanded ? '' : 'rotate-180')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {expanded ? <span>Plegar</span> : null}
      </button>
      </div>
    </aside>
  );
}

/**
 * BARRA SUPERIOR. Lleva el nombre de la FORMACION, no el de la parte: el titulo de la parte vive
 * junto a su contenido, donde se esta mirando. Arriba se responde otra pregunta —"¿en que estoy
 * metido?"— y esa respuesta no cambia al pasar de pieza.
 */
/**
 * El armazon completo. `stage` es lo que se esta cursando y manda; `index` es el panel de la
 * derecha, que puede no estar.
 *
 * LA BARRA ES LA MISMA DEL RESTO DE LA APLICACION (`LearnerTopbar`): avisos, racha y cuenta donde
 * la persona ya sabe buscarlos. Lo unico que cambia es que el saludo cede su sitio al nombre de
 * la formacion y a la salida, porque aqui el saludo no viene a cuento.
 */
export function PlayerShell({
  activityName,
  subtitle,
  indexOpen,
  onToggleIndex,
  sheetOpen,
  onToggleSheet,
  onExit,
  index,
  children,
}: {
  activityName: string;
  subtitle: string | null;
  /** El carril de la derecha, en escritorio. Es una preferencia y se recuerda. */
  indexOpen: boolean;
  onToggleIndex: () => void;
  /**
   * EL CAJON DEL TELEFONO, que es un estado aparte y NO se recuerda.
   *
   * Son dos cosas distintas aunque enseñen lo mismo. En escritorio el indice es una columna que
   * convive con el contenido, asi que dejarla abierta es comodo y tiene sentido recordarlo. En
   * telefono TAPA la pantalla: abrirlo solo se hace para mirar donde voy o saltar a otra parte, y
   * abrir el reproductor con el cajon puesto seria empezar cada leccion con el contenido tapado.
   *
   * Y son dos botones, no uno: asi cual actua lo decide el CSS —uno es `lg:hidden` y el otro
   * `hidden lg:flex`— y no hay que preguntarle a JavaScript por el ancho de la pantalla, que es lo
   * que provoca que la primera pintada no coincida con la del servidor.
   */
  sheetOpen: boolean;
  onToggleSheet: () => void;
  onExit: () => void;
  /**
   * El indice, pedido segun donde se vaya a pintar. Es una funcion y no un nodo porque hace falta
   * en dos envoltorios distintos —columna y cajon— y montar dos copias del mismo arbol para tener
   * las dos a mano seria pedir dos veces lo mismo.
   */
  index: (presentacion: 'carril' | 'hoja') => ReactNode;
  children: ReactNode;
}) {
  // Escape cierra el cajon. En telefono no hay teclado, pero esta pantalla tambien se abre en un
  // portatil estrecho, y un panel que tapa sin salida por teclado es una trampa.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onToggleSheet();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [sheetOpen, onToggleSheet]);

  return (
    /*
      `h-screen` con `overflow-hidden`, no `min-h-screen`: lo unico que se desplaza es el
      escenario. Con la pagina entera desplazable, bajar a leer el resumen se llevaba por delante
      la barra superior y el indice, que son justo lo que hay que tener a la vista mientras se
      cursa.
    */
    <div className="learner-surface reading-surface flex h-screen overflow-hidden">
      <PlayerRail />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <LearnerTopbar
          wide
          buscador={false}
          onSearch={onExit}
          leading={
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={onExit}
                aria-label="Volver a la formación"
                /*
                  MISMA PASTILLA QUE LA CAMPANA Y LA CUENTA (Decision #109): borde, superficie y
                  sombra propios siempre puestos. Eran dos iconos desnudos en una barra sin fondo,
                  asi que en esta pantalla —la unica donde la barra va sobre una superficie de
                  lectura— no se leian como botones.
                */
                className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-500 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:border-line-strong hover:text-ink-900 hover:shadow-card-hover"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-semibold leading-tight text-ink-900">
                  {activityName}
                </p>
                {subtitle ? <p className="truncate text-xs leading-tight text-ink-500">{subtitle}</p> : null}
              </div>
            </div>
          }
          /*
            SIN aspa de salir: la flecha de la izquierda ya sale, y dos botones para lo mismo en la
            misma barra obligan a preguntarse en que se diferencian. Se queda el de la izquierda,
            que es donde todo el mundo busca "atras".
          */
          leadingControls={
            <>
              {/*
                EN TELEFONO TAMBIEN HAY PUERTA AL CONTENIDO, y hasta hoy no la habia.

                El boton era `hidden lg:flex` y el indice tambien, asi que quien cursaba desde el
                telefono —que es casi todo el mundo aqui— no tenia forma de saber por que parte iba,
                cuanto le faltaba, ni de volver a una parte anterior. Se cursaba a ciegas.

                Lleva la lista y no el icono de panel: en telefono no se abre un panel lateral, se
                despliega un cajon, y una lista dice «aqui esta el indice» sin conocer el lenguaje
                de los paneles de escritorio.
              */}
              <button
                type="button"
                onClick={onToggleSheet}
                aria-label="Ver el contenido de la formación"
                aria-expanded={sheetOpen}
                className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-500 shadow-card transition-all duration-200 ease-pulse lg:hidden"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
              >
                <ListTree className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onToggleIndex}
                aria-label={indexOpen ? 'Ocultar el contenido de la formación' : 'Ver el contenido de la formación'}
                aria-pressed={indexOpen}
                className="focus-ring hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-500 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-px hover:border-line-strong hover:text-ink-900 hover:shadow-card-hover lg:flex"
                style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
              >
                {indexOpen ? (
                  <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                )}
              </button>
            </>
          }
        />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
          {indexOpen ? index('carril') : null}
        </div>
      </div>

      {/*
        EL CAJON DEL TELEFONO.

        Entra desde la derecha, que es el lado donde vive el indice en escritorio: quien use las dos
        superficies encuentra lo mismo en el mismo sitio. Deja ver un poco del contenido detras —no
        ocupa el ancho entero— porque lo que se hace aqui es MIRAR donde voy sin perder de vista lo
        que estaba cursando.

        El velo es un boton de verdad y no un `div` con `onClick`: tocar fuera para cerrar tiene que
        funcionar tambien para quien navega con teclado o lector de pantalla.
      */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar el contenido de la formación"
            onClick={onToggleSheet}
            className="absolute inset-0 h-full w-full bg-ink-900/40 backdrop-blur-[2px]"
          />
          <div
            className="animate-slide-next absolute inset-y-0 right-0 flex w-[min(86vw,340px)] flex-col border-l shadow-card-hover"
            style={{ borderColor: 'var(--reading-line)', backgroundColor: 'var(--reading-paper)' }}
          >
            <button
              type="button"
              onClick={onToggleSheet}
              aria-label="Cerrar"
              className="focus-ring absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full"
              style={{ color: 'var(--reading-muted)', backgroundColor: 'var(--reading-paper)' }}
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </button>
            {index('hoja')}
          </div>
        </div>
      ) : null}
    </div>
  );
}
