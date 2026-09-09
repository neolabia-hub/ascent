'use client';

import {
  ChevronLeft,
  CircleUser,
  GraduationCap,
  House,
  PanelRightClose,
  PanelRightOpen,
  Repeat2,
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
        aria-label={expanded ? 'Plegar el menu' : 'Desplegar el menu'}
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
  onExit,
  index,
  children,
}: {
  activityName: string;
  subtitle: string | null;
  indexOpen: boolean;
  onToggleIndex: () => void;
  onExit: () => void;
  index: ReactNode;
  children: ReactNode;
}) {
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
          onSearch={onExit}
          leading={
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={onExit}
                aria-label="Volver a la formacion"
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
            <button
              type="button"
              onClick={onToggleIndex}
              aria-label={indexOpen ? 'Ocultar el contenido de la formacion' : 'Ver el contenido de la formacion'}
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
          }
        />

        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
          {indexOpen ? index : null}
        </div>
      </div>
    </div>
  );
}
