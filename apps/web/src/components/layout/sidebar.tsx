'use client';

import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  House,
  Settings,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listPlans, type PlanRow } from '@/lib/delivery-api';
import { cn } from '@/components/ui/cn';
import { ProgressRing } from '@/components/ui/progress-ring';
import { TenantMark } from '@/components/layout/tenant-mark';

const SIDEBAR_COLLAPSED_KEY = 'pulso.sidebar.collapsed';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Solo Configuracion: destinos propios que se despliegan debajo. */
  hijos?: { href: string; label: string }[];
}

interface NavGroup {
  /** Rotulo de la seccion. `null` = sin rotulo (lo de arriba del todo). */
  titulo: string | null;
  items: NavItem[];
}

/**
 * EL MENU NOMBRA COSAS DEL NEGOCIO, NO TABLAS.
 *
 * "Lecciones" y "Evaluaciones" salieron de aqui a proposito: no son destinos, son piezas que se
 * crean DENTRO de una formacion. Tenerlas en el menu obligaba a construir una formacion saltando
 * entre tres entradas y a acordarse de volver. Siguen existiendo como biblioteca reutilizable, y se
 * llega a ellas desde el selector de contenido de la formacion.
 *
 * ─── EL ORDEN ES LA FRECUENCIA CON QUE SE ABREN (Decision #130) ───
 *
 * Antes el orden seguia el ciclo de vida del producto —primero se crea la formacion, luego se
 * convoca, luego se asigna— y por eso Seguimiento quedaba en el octavo puesto. Pero ese es el orden
 * en que se CONSTRUYE una vez, no el orden en que se TRABAJA todos los dias: el catalogo se toca
 * unas semanas al año y el seguimiento se mira cada mañana. Lo que se abre a diario va primero.
 *
 * ─── LAS SECCIONES SON PREGUNTAS, NO CATEGORIAS ───
 *
 *   (sin rotulo)  el dia a dia: donde estoy y como va
 *   Programar     lo que se decide y se agenda
 *   Administrar   la gente y lo que hay que autorizar
 *
 * Un rotulo de seccion que solo agrupa por parecido —"Contenido", "Datos"— no ayuda a elegir: hay
 * que leerse las tres para saber donde esta lo que se busca.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    titulo: null,
    items: [
      { href: '/inicio', label: 'Inicio', icon: House },
      // El rotulo dice SEGUIMIENTO y no "Reportes": lo que hay ahi es el estado de la ejecucion
      // —quien va como— con la analitica y los vencimientos al lado.
      { href: '/reportes', label: 'Seguimiento', icon: ChartColumn },
      { href: '/plan', label: 'Plan anual', icon: ClipboardList },
    ],
  },
  {
    titulo: 'Programar',
    items: [
      { href: '/contenido-formativo', label: 'Formaciones', icon: BookOpen },
      { href: '/convocatorias', label: 'Convocatorias', icon: CalendarDays },
      { href: '/asignaciones', label: 'Asignaciones', icon: Target },
    ],
  },
  {
    titulo: 'Administrar',
    items: [
      { href: '/usuarios', label: 'Usuarios', icon: Users },
      { href: '/desempeno', label: 'Desempeno', icon: ClipboardCheck },
      { href: '/aprobaciones', label: 'Aprobaciones', icon: CheckSquare },
      {
        href: '/configuracion',
        label: 'Configuracion',
        icon: Settings,
        /*
          CONFIGURACION SE DESPLIEGA Y EL PLAN NO, y la diferencia no es de gusto.

          Aqui debajo hay SEIS PANTALLAS distintas, cada una con su URL y su contenido; sin
          desplegar, la unica forma de saber que existe "Encuestas" es entrar a Configuracion y
          buscarla. Las vistas del plan —Cronograma, Por proceso, Como va— son la MISMA pantalla
          mirada de otra forma: sacarlas al menu prometeria cinco destinos donde hay uno, y
          obligaria a mantener sincronizado el estado de la pantalla con el subrayado del menu, que
          es justo el tipo de sincronia que se rompe y nadie nota.

          La regla: se despliega lo que son destinos propios; no se despliega lo que son filtros.
        */
        hijos: [
          { href: '/configuracion', label: 'Catalogos' },
          { href: '/configuracion/tipos-de-formacion', label: 'Tipos de formacion' },
          { href: '/configuracion/constancias', label: 'Constancias' },
          { href: '/configuracion/encuestas', label: 'Encuestas' },
          { href: '/configuracion/roles', label: 'Roles y permisos' },
          { href: '/configuracion/preferencias', label: 'Preferencias' },
        ],
      },
    ],
  },
];

// Sin props: el nombre y la salida de la persona viven en la barra de arriba (Decision #104).
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  /** Que item tiene los hijos abiertos a mano. `null` = ninguno; estar dentro ya los abre. */
  const [desplegado, setDesplegado] = useState<string | null>(null);

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

  return (
    <aside
      className={cn(
        // LA BARRA ES UNA TARJETA QUE FLOTA (Decision #92), igual que en el aprendiz.
        //
        // Era un bloque oscuro pegado al lado, y partir la pantalla en dos mitades de luminosidad
        // opuesta hace que la vista salte cada vez que cruza el filo. Una tarjeta blanca separada
        // del borde hace lo contrario: el fondo pasa por detras y las dos zonas siguen siendo la
        // misma pantalla. Ademas es la misma forma que ya tienen las tarjetas del contenido, asi
        // que el producto habla UN idioma y no dos.
        'flex h-screen shrink-0 flex-col p-3 transition-[width] duration-[220ms] ease-pulse',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-line bg-surface shadow-card">
      <div className={cn('px-4 py-4', collapsed && 'px-2')}>
        <TenantMark collapsed={collapsed} />
      </div>

      {/*
        SE PUEDE DESPLAZAR, PERO NO SE VE LA BARRA DE DESPLAZAMIENTO.

        Con el menu desplegado no cabe todo en pantallas bajas, asi que el desplazamiento tiene que
        existir: quitarlo dejaria opciones inalcanzables. Lo que sobra es el RAIL gris pegado al
        borde de una tarjeta redondeada — se ve como si algo estuviera roto. Se oculta el adorno y
        se conserva la funcion: rueda, teclado y gesto siguen funcionando igual.
      */}
      <nav className="sin-rail mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV_GROUPS.map((grupo, indice) => (
          <div key={grupo.titulo ?? 'principal'} className={cn(indice > 0 && 'pt-3')}>
            {/*
              EL ROTULO DESAPARECE AL PLEGAR, y en su sitio queda una linea. Con 76 px de ancho el
              texto no cabe, pero la SEPARACION entre grupos si tiene que sobrevivir: es lo unico
              que sigue diciendo que esos iconos no son todos la misma cosa.
            */}
            {grupo.titulo === null ? null : collapsed ? (
              <div className="mx-3 mb-2 h-px bg-line" aria-hidden="true" />
            ) : (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-300">
                {grupo.titulo}
              </p>
            )}
            <div className="space-y-0.5">
              {grupo.items.map((item) => (
                <ItemDeMenu
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname ?? ''}
                  abierto={desplegado === item.href}
                  onAlternar={() => setDesplegado((actual) => (actual === item.href ? null : item.href))}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/*
        EL PULSO DEL PLAN (Decision #92), que es el equivalente administrador de la racha del
        aprendiz: el numero del que esta persona responde.

        Por que ESTE y no "usuarios activos" o "formaciones creadas": el cumplimiento del plan
        anual es lo que le pregunta el auditor y lo que mide el item 1.2.1 de la Res. 0312. Un
        contador de cosas creadas se siente productivo y no responde a nadie.

        Y va con su META al lado, porque un 62% suelto no dice si eso esta bien —que es justo lo
        que hay que poder contestar de un vistazo—.
      */}
      <PulsoDelPlan collapsed={collapsed} />

      {/*
        CONTRAER, DEBAJO DEL PLAN Y SOLO ICONO (Decision #109).

        Estaba ENCIMA del plan y llevaba la palabra "Contraer" al lado. Las dos cosas estaban mal:
        el rotulo gastaba un renglon entero de barra en una accion que se usa una vez y se
        recuerda, y encima del plan partia el bloque de abajo en dos —el numero del que responde
        quien administra quedaba flotando entre un boton y el borde—. Ahora el plan cierra la barra
        y el control de la barra va al final, que es donde va un control de la barra.

        UNA SOLA FLECHA que gira 180 grados, no dos iconos que se intercambian: es lo que de verdad
        esta pasando, el mismo objeto mirando al otro lado.

        CON CONTRASTE, no un icono gris sobre blanco: fondo tenido de marca y el icono en el color
        de la empresa, como los tres controles de la barra de arriba. Antes era invisible.
      */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expandir menu' : 'Contraer menu'}
        title={collapsed ? 'Expandir menu' : 'Contraer menu'}
        className={cn(
          // Al pasar por encima, el fondo sube al color de la empresa: el control se enciende con
          // la marca del tenant en vez de con un gris que podria ser de cualquiera.
          'focus-ring group mx-3 mb-3 flex h-9 items-center justify-center gap-2 rounded-xl border border-line text-ink-700 transition-all duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-primary-soft',
          collapsed && 'mx-2',
        )}
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }}
      >
        <ChevronLeft
          className={cn('h-4 w-4 shrink-0 transition-transform duration-300 ease-pulse', collapsed && 'rotate-180')}
          strokeWidth={2.25}
          style={{ color: 'var(--brand-primary)' }}
          aria-hidden="true"
        />
      </button>

      {/*
        EL BLOQUE DE USUARIO SE FUE DE AQUI (Decision #104).

        Estaba DOS VECES en la misma pantalla: su nombre abajo en la barra y su menu de cuenta
        arriba a la derecha. Duplicar no es solo feo — obliga a decidir cual de los dos se toca
        para salir. Se queda el de arriba, que es donde lo busca todo el mundo.

        El conmutador NO baja aqui: vive en la barra de arriba, en las dos superficies.
      */}
      </div>
    </aside>
  );
}

/**
 * UN ITEM DEL MENU, con o sin hijos.
 *
 * ─── EL PADRE SIGUE SIENDO UN ENLACE ───
 *
 * Configuracion abre su propia pantalla Y despliega. La flecha es un boton aparte, pequeño y a la
 * derecha: si pulsar el nombre solo desplegara, quien quiere ir a Configuracion tendria que
 * desplegar y volver a pulsar — dos gestos para lo que antes era uno.
 *
 * ─── PLEGADA LA BARRA, NO SE DESPLIEGA ───
 *
 * En 76 px no cabe una lista de hijos legible. Se va a la pantalla del padre, que los tiene todos.
 */
function ItemDeMenu({
  item,
  collapsed,
  pathname,
  abierto,
  onAlternar,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const Icon = item.icon;
  const activo = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const tieneHijos = (item.hijos?.length ?? 0) > 0 && !collapsed;
  /*
    SOLO SE DESPLIEGA SI SE PIDE.

    Primera version: al entrar en Configuracion se abria sola, "porque es cuando se necesita". El
    efecto real es que la barra crecia seis renglones de golpe sin que nadie lo pidiera y empujaba
    el resto del menu fuera de la vista — justo al llegar, que es cuando uno se esta ubicando. Un
    menu que cambia de tamaño solo desorienta mas de lo que ayuda.
  */
  const desplegado = tieneHijos && abierto;

  return (
    <div>
      <div className="relative">
        <Link
          href={item.href}
          className={cn(
            'focus-ring relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150',
            collapsed && 'justify-center px-0',
            tieneHijos && 'pr-9',
            activo ? 'bg-primary-soft font-medium text-ink-900' : 'text-ink-500 hover:bg-paper hover:text-ink-900',
          )}
          title={collapsed ? item.label : undefined}
        >
          {activo ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
              style={{ backgroundColor: 'var(--brand-accent)' }}
            />
          ) : null}
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </Link>

        {tieneHijos ? (
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={desplegado}
            aria-label={desplegado ? `Ocultar las opciones de ${item.label}` : `Ver las opciones de ${item.label}`}
            className="focus-ring absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-300 transition-colors duration-150 hover:bg-paper hover:text-ink-700"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-pulse', desplegado && 'rotate-180')}
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {desplegado ? (
        /*
          LOS HIJOS CUELGAN DE UNA LINEA, no de una sangria a secas: con solo margen izquierdo, tres
          niveles de texto gris a distintas distancias del borde se leen como una lista desordenada.
          La linea dice "esto pertenece a lo de arriba" sin gastar una palabra.
        */
        <ul className="ml-[26px] mt-0.5 space-y-0.5 border-l border-line pl-2">
          {item.hijos?.map((hijo) => {
            // Coincidencia EXACTA: `/configuracion` es padre de todos, asi que con `startsWith`
            // "Catalogos" se veria activo estando en Encuestas.
            const hijoActivo = pathname === hijo.href;
            return (
              <li key={hijo.href}>
                <Link
                  href={hijo.href}
                  className={cn(
                    'focus-ring block truncate rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150',
                    hijoActivo
                      ? 'bg-primary-soft font-medium text-ink-900'
                      : 'text-ink-500 hover:bg-paper hover:text-ink-900',
                  )}
                >
                  {hijo.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * COMO VA EL PLAN DEL ANO EN CURSO, en la barra.
 *
 * Si no hay plan o falla la peticion no se pinta nada: es un indicador que orienta, no un dato
 * sin el cual no se pueda trabajar. Un bloque de error aqui seria mas ruido que ausencia.
 */
function PulsoDelPlan({ collapsed }: { collapsed: boolean }) {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    listPlans({ year: new Date().getFullYear() })
      .then((filas) => {
        if (!cancelled) setPlan(filas[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Se relee al cambiar de pantalla: se acaba de ejecutar un renglon y el numero tiene que subir.
  }, [pathname]);

  if (!plan) return null;

  const cumplimiento = Math.round(plan.metrics.compliancePct);
  const meta = plan.goalPct;
  const faltan = meta === null ? null : Math.max(0, meta - cumplimiento);

  const titulo = `Plan ${plan.year}: ${cumplimiento}% de cumplimiento${meta === null ? '' : `, meta ${meta}%`}`;

  /*
    PLEGADA, EL PORCENTAJE NO DESAPARECE (Decision #109).

    Antes el bloque entero se ocultaba al contraer la barra, asi que el numero del que responde
    quien administra —el que le pregunta el auditor— se perdia justo en el modo que mas se usa
    cuando se trabaja con tablas anchas. Y era evitable: en 64 px cabe perfectamente un anillo con
    su cifra dentro.

    El anillo SOLO, sin el rotulo "Plan 2026" ni la meta: ahi no caben y el tooltip ya los lleva.
    Lo que no se puede perder es la cifra.
  */
  if (collapsed) {
    return (
      <Link
        href={`/plan/${plan.id}`}
        className="focus-ring mx-2 mb-1 mt-auto flex items-center justify-center rounded-2xl py-3 transition-colors duration-150 hover:bg-primary-soft"
        title={titulo}
        aria-label={titulo}
      >
        <ProgressRing value={cumplimiento} size={46} showLabel />
      </Link>
    );
  }

  return (
    <Link
      href={`/plan/${plan.id}`}
      className="focus-ring m-3 mb-1 mt-auto flex items-center gap-3 rounded-2xl bg-paper p-3 transition-colors duration-150 hover:bg-primary-soft"
      title={titulo}
    >
      <ProgressRing value={cumplimiento} size={44} showLabel={false} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Plan {plan.year}</p>
        <p className="font-display text-lg font-bold leading-none tabular-nums text-ink-900">{cumplimiento}%</p>
        {/*
          SE DICE LA META, NO LA RESTA.

          Antes ponia "Faltan 90 puntos" y la pregunta que provocaba era "¿que puntos?" — en este
          producto los PUNTOS son otra cosa: los que gana el aprendiz al completar formaciones. Dos
          significados para la misma palabra en la misma pantalla, y el que se lee primero es el
          equivocado.

          El anillo ya ensena donde va; lo unico que falta al lado es hasta donde hay que llegar.
        */}
        <p className="mt-0.5 text-[11px] leading-tight text-ink-500">
          {plan.goalPct === null ? 'Sin meta acordada' : faltan === 0 ? 'Meta cumplida' : `Meta del ${plan.goalPct}%`}
        </p>
      </div>
    </Link>
  );
}
