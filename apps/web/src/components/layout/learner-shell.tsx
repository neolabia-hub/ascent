'use client';

import {
  CircleUser,
  ClipboardCheck,
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
import { misEvaluaciones, sobreMi } from '@/lib/performance-api';
import { getMyProgress, type MyProgress } from '@/lib/learner-api';
import { saludoDe } from '@/lib/greeting';
import { cn } from '@/components/ui/cn';
import { TenantMark } from '@/components/layout/tenant-mark';
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
  /**
   * Como se llama EN LA BARRA DE ABAJO, cuando el nombre entero no cabe.
   *
   * La barra reparte el ancho del telefono entre sus items, y con el de Desempeño puesto son
   * CINCO: a 402px tocan a 80px cada uno. «Mi aprendizaje» necesita mas, asi que se partia en dos
   * lineas y se montaba encima del item de al lado — con la barra fija a su alto, el texto salia
   * por fuera. No era un rotulo apretado: eran dos palabras encima de otras dos.
   *
   * En el carril de escritorio no pasa —hay 264px de ancho— y por eso ahi se sigue leyendo
   * entero. Es la misma pieza diciendo lo mismo con las palabras que caben en cada sitio.
   */
  corto?: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/hoy', label: 'Inicio', icon: House },
  { href: '/mi-formacion', label: 'Mi aprendizaje', corto: 'Aprender', icon: GraduationCap },
  { href: '/repaso', label: 'Repaso', icon: Repeat2 },
  { href: '/perfil', label: 'Perfil', icon: CircleUser },
];

/**
 * DESEMPENO: UN SOLO SITIO, y solo cuando hay algo (Decisiones #138 y #140).
 *
 * Calificar a la gente a cargo es una tarea con fecha limite y hay que poder encontrarla en el
 * menu — un jefe de area normalmente no tiene acceso a administracion, asi que este es su unico
 * camino. Y LO PROPIO va detras de la misma puerta desde el 2026-09-02: antes vivia en el perfil,
 * entre las constancias, y nadie busca ahi su evaluacion de desempeno.
 *
 * Sigue sin ser fijo. Aparece cuando hay algo —que responder, o algo tuyo que leer— y desaparece
 * cuando no queda nada: un item permanente que casi todo el año no lleva a ninguna parte enseña a
 * no pulsarlo. En movil la barra inferior pasa de cuatro a cinco items solo durante la campaña.
 */
const ITEM_DESEMPENO: NavItem = { href: '/mi-desempeno', label: 'Desempeño', icon: ClipboardCheck };


export function LearnerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [hayDesempeno, setHayDesempeno] = useState(false);

  /*
    EL ITEM APARECE SI HAY ALGO, sea de las dos cosas (Decision #140).

    Antes solo miraba lo que hay que CALIFICAR, asi que a quien no evalua a nadie —la mayoria— el
    item no le salia nunca y su propia evaluacion quedaba escondida en el perfil. Ahora se pregunta
    tambien por lo suyo: si le evaluaron, tiene sitio donde leerlo y firmarlo.

    Se relee al cambiar de pantalla, como la racha: al entregar la ultima el item tiene que
    desaparecer sin recargar. Si falla, no pasa nada — el item simplemente no aparece.
  */
  useEffect(() => {
    let cancelado = false;
    void Promise.all([misEvaluaciones().catch(() => []), sobreMi().catch(() => [])])
      .then(([porCalificar, mias]) => {
        if (!cancelado) {
          setHayDesempeno(porCalificar.some((fila) => fila.status !== 'SUBMITTED') || mias.length > 0);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [pathname]);

  const navItems = hayDesempeno ? [...NAV_ITEMS, ITEM_DESEMPENO] : NAV_ITEMS;
  /*
    "HOY" VA A SANGRE (Decision #89). El resto del modo aprendiz vive en una columna centrada de
    1100 px, que es lo correcto para leer; la biblioteca no, porque un heroe con margenes deja de
    ser un heroe y una fila que no se corta contra el borde no se lee como que sigue.
  */
  const cine = pathname === '/hoy';
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Una sola peticion para las dos piezas que lo enseñan (carril en escritorio, burbuja en telefono).
  const progress = useMiProgreso();

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
    /*
      EL QUE SE DESPLAZA ES EL CONTENIDO, NO LA VENTANA (Decision #133).

      Asi la barra de arriba se queda quieta SIN necesitar fondo: no hay nada que le pase por
      debajo. Antes se iba con el contenido y la persona perdia su avatar, sus avisos y el buscador
      en cuanto bajaba un poco — en el telefono, un gesto largo y constante para recuperarlos.

      `100dvh` y no `100vh`: en el movil, `vh` cuenta con la barra del navegador PLEGADA, asi que
      la pantalla mide mas de lo que se ve y la barra inferior se queda por debajo del filo. El
      precio conocido de desplazar por dentro es que la barra del navegador movil ya no se recoge
      al bajar; se acepta porque la alternativa era perder la cabecera.
    */
    /*
      EN TELEFONO TAMBIEN ES UNA COLUMNA FLEXIBLE, y esto era el fallo de fondo.

      Ponia `lg:flex`, asi que en telefono la raiz NO era flex: era un bloque corriente. Y entonces
      el `flex-1` de la columna de dentro no significaba nada —`flex-1` solo lo entiende un padre
      flexible—, asi que esa columna crecia con su contenido en vez de medir la pantalla. Con ella,
      el `flex-1` de `<main>` tampoco tenia contra que repartir: `main` acababa midiendo lo mismo
      que su contenido, nunca desbordaba y **su `overflow-y-auto` no llegaba a desplazar nada**.

      El resultado no era una barra que tapa: era que la raiz, con `h-[100dvh] overflow-hidden`,
      RECORTABA todo lo que pasara de la pantalla y no habia forma de llegar a ello. Medido: la
      pagina entera daba 874px de alto en un telefono de 874px, y cero elementos desplazables.

      Por eso «no deja bajar» y por eso el boton de «Empezar» de una formacion no se podia pulsar:
      no estaba debajo de la barra, estaba fuera de la parte visible del documento. En escritorio
      no se veia porque ahi `lg:flex` si estaba puesto.

      `flex flex-col lg:flex-row` es lo mismo de antes en escritorio —una fila con el carril al
      lado— y arregla el telefono, que es donde vive el 95% de esta gente.
    */
    <div className="learner-surface flex h-[100dvh] flex-col overflow-hidden bg-paper lg:flex-row">
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
        <div className="px-5 py-5">
          <TenantMark />
        </div>

        {/*
          EL BUSCADOR SE FUE A LA BARRA DE ARRIBA (Decision #90), donde ocupa el centro. Aqui
          quedaba DUPLICADO —dos cajas de buscar en la misma pantalla, a diez centimetros— y la de
          la barra lateral era la peor de las dos: mas estrecha y lejos de donde mira la vista al
          entrar. El atajo Ctrl K sigue funcionando igual desde cualquier sitio.
        */}

        <nav aria-label="Navegacion principal" className="scroll-hidden min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => {
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
                    style={{ backgroundColor: 'var(--brand-primary-soft)' }}
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
          llama al lado no dice que es una racha ni que se pierde mañana. Con los puntos, las
          congelaciones y la frase de que se pierde, se entiende sin que nadie lo explique.

          SIGUE SIENDO PRIVADA (Decision #23): es la propia, jamas la de otro. No hay tabla de
          clasificacion y no la va a haber —en formacion obligatoria, competir por puntos empuja a
          pasar rapido, no a aprender—.
        */}
        <ProgresoPropio progress={progress} />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
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
        <LearnerTopbar greeting={saludoDe()} onSearch={() => setPaletteOpen(true)} wide={cine} />

        {/*
          EL HUECO DE ABAJO LO DICE LA BARRA, no un numero escrito a ojo (`--barra-espacio`, en
          globals.css). Con `pb-24` faltaba casi un centimetro en cualquier telefono con area
          segura, y lo ultimo de cada pantalla quedaba DEBAJO de la barra: el boton «Empezar» de una
          formacion y la tarjeta de «Sigue donde ibas» de Inicio se veian a medias y no se dejaban
          pulsar, porque la barra flota encima y se queda los toques.
        */}
        <main className="min-h-0 flex-1 overflow-y-auto pb-[var(--barra-espacio)] lg:pb-10">
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

          Se separa del borde tambien por abajo, que es lo que la aleja de la barra de gestos del
          telefono: pegada al filo, el gesto de "volver atras" de iOS y Android se come los toques
          del primer y del ultimo icono.

          CUANTO se separa lo dice `--barra-hueco` (globals.css), y es un `max()` y no una suma:
          antes era `area-segura + 12px`, que cuenta dos veces el mismo espacio y dejaba la barra
          flotando muy por encima del filo en cualquier telefono con gestos.
        */
        className="fixed inset-x-3 bottom-[var(--barra-hueco)] z-30 rounded-2xl border border-line bg-surface/90 shadow-card-hover backdrop-blur-lg lg:hidden"
      >
        <ul className="mx-auto flex w-full items-stretch p-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-ring relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[11px] font-medium transition-colors duration-150 ease-pulse',
                    active ? 'text-ink-900' : 'text-ink-500',
                  )}
                >
                  {/* El activo se rellena con el azul de la empresa, igual que en la barra lateral. */}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: 'var(--brand-primary-soft)' }}
                    />
                  ) : null}
                  <Icon
                    className="relative h-5 w-5 shrink-0"
                    strokeWidth={active ? 2 : 1.75}
                    aria-hidden="true"
                    style={active ? { color: 'var(--brand-primary)' } : undefined}
                  />
                  {/*
                    `truncate` es la red de seguridad, no la solucion: lo que hace que quepa es el
                    nombre corto. Pero un rotulo que no puede partirse en dos lineas NUNCA vuelve a
                    montarse encima del de al lado, aunque mañana entre un item mas o alguien
                    traduzca «Repaso» a una palabra de doce letras.
                  */}
                  <span className="relative w-full truncate text-center">{item.corto ?? item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        LA RACHA, EN TELEFONO, COMO BURBUJA FLOTANTE (2026-09-11).

        Bajo de la barra de arriba, donde se comia 56px de una fila que a 402px ya iba justa y
        dejaba el saludo en «Buen…». De los cuatro controles que habia alli, la racha es la que
        mejor aguanta la mudanza: la campana avisa de cosas con fecha limite, la cuenta es la
        salida y el buscador acepta escritura; la racha solo INFORMA.

        DONDE: pegada al filo derecho, justo encima de la barra de abajo —su altura sale de las
        mismas variables, asi que no puede desalinearse— y del lado del pulgar.

        TAPA UN CUADRADO DE 44px DE CONTENIDO y se acepta a proposito: es la esquina de abajo a la
        derecha, el contenido ya se aparta de la barra, y lo que hay debajo siempre se alcanza
        desplazando un poco. La alternativa —reservarle sitio— le quitaria alto a todas las
        pantallas para algo que solo se mira de reojo.

        NO SALE SI NO HAY RACHA. Un «0» con una llama apagada flotando todo el dia no motiva a
        nadie: recuerda cada vez que se perdio.
      */}
      <StreakBubble progress={progress} />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

/**
 * EL PROGRESO PROPIO, PEDIDO UNA SOLA VEZ.
 *
 * Lo enseñan dos piezas que nunca conviven —el bloque del carril en escritorio y la burbuja en
 * telefono— pero las dos se MONTAN siempre: lo que las separa es el CSS, no React. Si cada una
 * pidiera lo suyo, serian dos llamadas identicas en cada cambio de pantalla, y la mitad para algo
 * que no se esta viendo.
 *
 * Se relee al cambiar de pantalla: al terminar una leccion la racha y los puntos se mueven.
 *
 * Si falla no devuelve nada y ya: es un adorno que motiva, no un dato que alguien necesite para
 * trabajar. Un bloque de error aqui seria mas ruido que ausencia.
 */
function useMiProgreso(): MyProgress | null {
  const [progress, setProgress] = useState<MyProgress | null>(null);
  const pathname = usePathname();

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

  return progress;
}

/**
 * LA RACHA EN TELEFONO: una burbuja que late, encima de la barra de abajo.
 *
 * Late de verdad y muy despacio —`animate-breathe`, que ya existe en el sistema— porque es lo
 * unico que la distingue de un boton mas. Un icono quieto en una esquina se deja de ver a los dos
 * dias; uno que respira se mira de reojo, que es exactamente la atencion que merece.
 *
 * Y late SOLO si la racha esta viva. Con la racha perdida no hay nada que celebrar y la burbuja no
 * sale: la gamificacion que insiste cuando has fallado no motiva, reprocha.
 */
function StreakBubble({ progress }: { progress: MyProgress | null }) {
  if (!progress || progress.currentStreak <= 0) return null;

  return (
    <Link
      href="/perfil"
      aria-label={`Llevas ${progress.currentStreak} ${progress.currentStreak === 1 ? 'dia seguido' : 'dias seguidos'}. Ver tu progreso`}
      className="focus-ring animate-card-in fixed right-4 z-20 flex items-center gap-1.5 rounded-full border border-line bg-surface/90 py-1.5 pl-1.5 pr-3 shadow-card-hover backdrop-blur-lg lg:hidden"
      style={{ bottom: 'calc(var(--barra-hueco) + var(--barra-alto) + 0.75rem)' }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 16%, transparent)' }}
      >
        <Flame
          className="animate-breathe h-[15px] w-[15px]"
          strokeWidth={2}
          style={{ color: 'var(--brand-accent)' }}
          aria-hidden="true"
        />
      </span>
      <span className="font-display text-sm font-bold leading-none tabular-nums text-ink-900">
        {progress.currentStreak}
      </span>
    </Link>
  );
}

/**
 * EL PROGRESO PROPIO: racha, puntos y congelaciones, en la barra lateral de escritorio.
 */
function ProgresoPropio({ progress }: { progress: MyProgress | null }) {
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
          <span className="inline-flex items-center gap-1 text-xs text-ink-500" title="Te salvan la racha un día">
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
