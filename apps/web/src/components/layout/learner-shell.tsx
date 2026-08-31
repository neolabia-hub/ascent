'use client';

import {
  CircleUser,
  Flame,
  GraduationCap,
  House,
  Repeat2,
  Snowflake,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { useTenant } from '@/components/providers/tenant-provider';
import { cn } from '@/components/ui/cn';
import { CommandPalette } from './command-palette';
import { LearnerTopbar } from './learner-topbar';

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
  const tenant = useTenant();
  const pathname = usePathname();
  /*
    "HOY" VA A SANGRE (Decision #89). El resto del modo aprendiz vive en una columna centrada de
    1100 px, que es lo correcto para leer; la biblioteca no, porque un heroe con margenes deja de
    ser un heroe y una fila que no se corta contra el borde no se lee como que sigue.
  */
  const cine = pathname === '/hoy';
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

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="learner-surface min-h-screen bg-paper lg:flex">
      {/* Carril lateral: solo escritorio. */}
      {/*
        UNA SOLA SUPERFICIE (Decision #89). La barra comparte fondo con el cuerpo y se separa por
        una linea, no por un cambio de color: partir la pantalla en dos tonos hace que la vista
        salte cada vez que cruza el borde, y no aporta nada que la linea no diga ya.
      */}
      {/*
        LA BARRA SE QUEDA QUIETA. Sin `sticky`, el aside se estira hasta el alto del DOCUMENTO
        —que en la biblioteca son varios miles de pixeles—, asi que el bloque de progreso del final
        quedaba a un scroll enorme de distancia: existia y no lo veia nadie.
      */}
      {/*
        LA BARRA ES UNA TARJETA QUE FLOTA (Decision #92).

        Lo pregunto el cliente y la respuesta es que si, con una condicion: BLANCA sobre el fondo
        de la pagina, no de color. Una barra de color macizo pegada al borde parte la pantalla en
        dos mitades de luminosidad distinta y la vista salta cada vez que cruza el filo; una
        tarjeta blanca separada del borde hace lo contrario —el fondo pasa por detras y las dos
        zonas siguen siendo la misma pantalla—.

        Y es ademas lo que ya hacen las tarjetas del catalogo y el bloque de progreso: una
        superficie elevada sobre papel. Un lenguaje, no dos.
      */}
      <aside className="hidden shrink-0 p-3 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[264px] lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <span className="truncate font-display text-sm font-semibold text-ink-900">{tenant.name}</span>
        </div>

        {/*
          EL BUSCADOR SE FUE A LA BARRA DE ARRIBA (Decision #90), donde ocupa el centro. Aqui
          quedaba DUPLICADO —dos cajas de buscar en la misma pantalla, a diez centimetros— y la de
          la barra lateral era la peor de las dos: mas estrecha y lejos de donde mira la vista al
          entrar. El atajo Ctrl K sigue funcionando igual desde cualquier sitio.
        */}

        <nav aria-label="Navegacion principal" className="scroll-hidden min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 ease-pulse',
                  active ? 'font-medium text-ink-900' : 'text-ink-500 hover:bg-paper hover:text-ink-900',
                )}
              >
                {/* El color de la empresa marca lo ACTIVO, no rellena el fondo de nada. */}
                {/*
                  El activo se rellena con el azul de la empresa al 10%: DENTRO de una tarjeta
                  blanca, una superficie blanca no marcaria nada.
                */}
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl"
                    style={{ backgroundColor: 'var(--primary-soft)' }}
                  />
                ) : null}
                <Icon
                  className="relative h-[18px] w-[18px] shrink-0"
                  strokeWidth={active ? 2 : 1.75}
                  style={active ? { color: 'var(--brand-primary)' } : undefined}
                  aria-hidden="true"
                />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/*
          LA GAMIFICACION VIVE AQUI (Decision #90), y es la respuesta a "¿hago un panel izquierdo
          con el perfil, los avisos y la gamificacion?".

          UN PANEL NUEVO NO: seria una tercera columna que le roba ancho a los carruseles justo en
          el portatil de 1280 donde ya van justos, y ademas duplicaria lo que la barra de arriba ya
          tiene —los avisos y la cuenta— en la misma pantalla. Dos sitios para lo mismo es peor que
          uno mediocre.

          DENTRO DE LA BARRA QUE YA EXISTE SI: no cuesta un pixel de ancho, esta siempre a la vista
          y es donde la referencia de plataforma de contenido pone su bloque bajo la navegacion.

          Y JUNTOS, no sueltos. La racha era una pastilla en la barra de arriba: un numero con una
          llama al lado no dice que es una racha ni que se pierde manana. Con los puntos, las
          congelaciones y la frase de que se pierde, se entiende sin que nadie lo explique.

          SIGUE SIENDO PRIVADA (Decision #23): es la propia, jamas la de otro. No hay tabla de
          clasificacion y no la va a haber —en formacion obligatoria, competir por puntos empuja a
          pasar rapido, no a aprender—.
        */}
        <ProgresoPropio />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/*
          "HOY" VA A SANGRE Y LA BARRA FLOTA ENCIMA (Decision #89).

          El resto del modo aprendiz vive dentro de una columna centrada de 1100 px, que es lo
          correcto para leer. La biblioteca no: un heroe con margenes a los lados deja de ser un
          heroe y pasa a ser una tarjeta grande, y una fila que no se corta contra el borde no se
          lee como una fila que sigue —esa tarjeta cortada es justo lo que invita a arrastrar—.

          Y ahi la barra pierde fondo y borde: sobre una imagen a sangre, una franja clara con
          linea inferior parte la portada en dos. Los controles flotan sobre el degradado del
          heroe, que ya es oscuro y los sostiene sin necesidad de superficie propia.
        */}
        {/*
          LA BARRA NO SE SUPERPONE (Decision #90). Se probo flotando sobre la portada del heroe y
          tapaba justo su franja de arriba, que es donde la foto tiene su asunto. Ahora la barra va
          en el flujo y el heroe empieza debajo: a sangre de lado a lado, pero sin robarle sitio a
          nada.
        */}
        <LearnerTopbar greeting={greeting(new Date())} onSearch={() => setPaletteOpen(true)} wide={cine} />

        <main className="flex-1 pb-24 lg:pb-10">
          {cine ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-md px-5 py-6 lg:max-w-[1100px] lg:px-10 lg:py-10">{children}</div>
          )}
        </main>
      </div>

      {/* Barra inferior: solo movil. */}
      <nav
        aria-label="Navegacion principal"
        /*
          EN MOVIL, LA MISMA TARJETA FLOTANTE QUE EN ESCRITORIO (Decision #92).

          Era una franja pegada al borde de abajo con una linea encima. Ahora es una tarjeta que
          flota sobre el contenido, con el mismo radio y la misma sombra que la barra lateral: una
          persona que usa el telefono y el computador ve el MISMO producto, no dos.

          Se separa del borde tambien por abajo (`bottom-3` + el area segura), que es lo que la
          aleja de la barra de gestos del telefono: pegada al filo, el gesto de "volver atras" de
          iOS y Android se come los toques del primer y del ultimo icono.
        */
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-30 rounded-2xl border border-line bg-surface/90 shadow-card-hover backdrop-blur-lg lg:hidden"
      >
        <ul className="mx-auto flex w-full items-stretch p-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-ring relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors duration-150 ease-pulse',
                    active ? 'text-ink-900' : 'text-ink-500',
                  )}
                >
                  {/* El activo se rellena con el azul de la empresa, igual que en la barra lateral. */}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: 'var(--primary-soft)' }}
                    />
                  ) : null}
                  <Icon
                    className="relative h-5 w-5"
                    strokeWidth={active ? 2 : 1.75}
                    aria-hidden="true"
                    style={active ? { color: 'var(--brand-primary)' } : undefined}
                  />
                  <span className="relative">{item.label}</span>
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

/**
 * EL PROGRESO PROPIO: racha, puntos y congelaciones, en la barra lateral.
 *
 * Si falla la peticion no se pinta nada y ya: es un adorno que motiva, no un dato que alguien
 * necesite para trabajar. Un bloque de error aqui seria mas ruido que ausencia.
 */
function ProgresoPropio() {
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const pathname = usePathname();

  // Se relee al cambiar de pantalla: al terminar una leccion la racha y los puntos se mueven.
  useEffect(() => {
    let cancelled = false;
    getMyProgress()
      .then((value) => {
        if (!cancelled) setProgress(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!progress) return null;

  return (
    <div className="m-3 mt-auto rounded-2xl bg-paper p-3.5">
      <div className="flex items-center gap-3">
        {/*
          La llama crece con la racha en vez de ser un icono fijo: a los 30 dias tiene que
          sentirse distinta que a los 2, y es lo unico que puede decirlo sin una frase mas.
        */}
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)' }}
        >
          <Flame
            className="h-6 w-6"
            strokeWidth={progress.currentStreak > 0 ? 2 : 1.5}
            style={{ color: progress.currentStreak > 0 ? 'var(--brand-accent)' : 'var(--ink-300)' }}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl font-bold leading-none tabular-nums text-ink-900">
            {progress.currentStreak}
          </p>
          <p className="text-xs text-ink-500">
            {progress.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: 'var(--brand-accent)' }} aria-hidden="true" />
          <span className="tabular-nums">{progress.points}</span>
          <span className="text-xs font-normal text-ink-500">pts</span>
        </span>
        {/*
          Las congelaciones solo se ensenan si quedan: un "0 congelaciones" no ayuda a nadie y
          convierte un premio en un reproche.
        */}
        {progress.freezesAvailable > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-500" title="Te salvan la racha un dia">
            <Snowflake className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {progress.freezesAvailable}
          </span>
        ) : null}
      </div>

      {progress.longestStreak > progress.currentStreak ? (
        <p className="mt-2 text-[11px] leading-tight text-ink-300">
          Tu mejor racha fueron {progress.longestStreak} dias.
        </p>
      ) : null}
    </div>
  );
}
