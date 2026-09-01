'use client';

import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CheckSquare,
  ChevronLeft,
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
}

/**
 * El menu nombra COSAS DEL NEGOCIO, no tablas.
 *
 * "Lecciones" y "Evaluaciones" salieron de aqui a proposito: no son destinos, son piezas que se
 * crean DENTRO de una formacion. Tenerlas en el menu obligaba a construir una formacion saltando
 * entre tres entradas distintas y a acordarse de volver. Siguen existiendo como biblioteca
 * reutilizable, y se llega a ellas desde el selector de contenido de la formacion.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: House },
  { href: '/contenido-formativo', label: 'Formaciones', icon: BookOpen },
  { href: '/convocatorias', label: 'Convocatorias', icon: CalendarDays },
  { href: '/asignaciones', label: 'Asignaciones', icon: Target },
  { href: '/plan', label: 'Plan anual', icon: ClipboardList },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/aprobaciones', label: 'Aprobaciones', icon: CheckSquare },
  { href: '/reportes', label: 'Reportes', icon: ChartColumn },
  { href: '/configuracion', label: 'Configuracion', icon: Settings },
];

// Sin props: el nombre y la salida de la persona viven en la barra de arriba (Decision #104).
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
                active ? 'bg-primary-soft font-medium text-ink-900' : 'text-ink-500 hover:bg-paper hover:text-ink-900',
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
          'focus-ring mx-3 mb-3 flex h-9 items-center justify-center gap-2 rounded-xl border border-line text-ink-700 transition-all duration-150 hover:-translate-y-px hover:border-line-strong',
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
          La meta en palabras y no otro numero suelto: "faltan 28 puntos" se entiende sin restar,
          que es lo que hace falta cuando se mira de reojo desde otra pantalla.
        */}
        <p className="mt-0.5 text-[11px] leading-tight text-ink-500">
          {faltan === null ? 'Sin meta acordada' : faltan === 0 ? 'Meta cumplida' : `Faltan ${faltan} puntos`}
        </p>
      </div>
    </Link>
  );
}
