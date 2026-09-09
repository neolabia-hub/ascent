'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface ViewTab<T extends string> {
  key: T;
  label: string;
  icon: LucideIcon;
  /** Cifra al lado del rotulo: "Obligaciones 128". Se omite cuando no aporta. */
  count?: number;
}

/**
 * DOS FORMAS, Y LA DIFERENCIA ES SI LOS PASOS TIENEN ORDEN.
 *
 *   pastillas  Vistas HERMANAS de lo mismo: ejecucion, analitica, vencimientos. Se entra por
 *              cualquiera y ninguna va antes que otra.
 *   etapas     Un recorrido con ORDEN: ficha -> contenido -> a quienes -> convocatorias. Se numeran
 *              y se encadenan porque armar una formacion se hace en ese orden, y quien llega nuevo
 *              necesita ver el camino, no cinco botones iguales.
 *
 * Lo pidio el cliente con estas palabras: *"que sea tipo pipeline o tracking por etapas"*, y
 * señalando el problema real — el selector de antes era un subrayado de 2 px que ademas **se
 * parecia a los botones** de al lado.
 */
export type FormaDeSelector = 'pastillas' | 'etapas';

/**
 * CAMBIAR DE VISTA DENTRO DE UNA PANTALLA.
 *
 * ─── POR QUE ES UNA PIEZA Y NO CSS SUELTO ───
 *
 * Habia dos formas de decir lo mismo. El plan y Seguimiento usaban una pastilla rellena con el
 * color de la empresa; Asignaciones, un subrayado gris tinta. La misma pregunta —"¿en cual de las
 * cuatro estoy?"— se contestaba distinta segun la pantalla, y la de Asignaciones ademas no usaba
 * la marca: en una empresa con acento verde, la señal de "estas aqui" salia gris.
 *
 * ─── POR QUE LA PASTILLA Y NO EL SUBRAYADO ───
 *
 * El subrayado es de toda la vida y funciona cuando el contenido de debajo empieza pegado a el:
 * la linea "cose" la pestana con su panel. Aqui debajo hay tarjetas con su propio borde, asi que
 * la linea no cose nada y queda un trazo de 2px como unica marca de estado — que es justo lo que
 * la entrada del 2026-09-02 aprendio con la escala de puntuacion: **marcado es RELLENO**, no un
 * trazo ni un tinte, porque en una fila de cuatro elementos iguales lo unico que se pregunta es
 * CUAL, y eso se contesta con area de color, no con una linea.
 *
 * El color sale de `--brand-primary` en linea y no de una clase de Tailwind porque el valor lo
 * pone el tenant en tiempo de ejecucion.
 */
export function ViewTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  forma = 'pastillas',
}: {
  tabs: ReadonlyArray<ViewTab<T>>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
  forma?: FormaDeSelector;
}) {
  if (forma === 'etapas') {
    return <Etapas tabs={tabs} value={value} onChange={onChange} className={className} />;
  }

  return (
    <div role="tablist" className={cn('flex flex-wrap items-center gap-1', className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={cn(
              'focus-ring flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
              selected ? 'font-medium text-white shadow-btn-flat' : 'text-ink-500 hover:bg-surface hover:text-ink-900',
            )}
            style={selected ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-white/20' : 'bg-paper text-ink-500',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * EL RECORRIDO, EN ETAPAS NUMERADAS.
 *
 * ─── QUE PROBLEMA RESUELVE ───
 *
 * La ficha de una formacion tenia cinco pestañas subrayadas, y el subrayado es un trazo de 2 px:
 * en una pantalla con botones de accion al lado, la unica marca de «estas aqui» pesaba menos que
 * los botones. El cliente lo dijo mirando: *"el boton se parece a esos selectores"*.
 *
 * ─── POR QUE NUMERADAS Y ENCADENADAS ───
 *
 * Porque **tienen orden**: se crea la ficha, se le pone contenido, se dice a quien se le exige y
 * se convoca. Numerarlas no es decoracion — le dice a quien llega nuevo por donde empieza, y a
 * quien vuelve, por donde iba. Y el conector entre una y otra es lo que las convierte en un
 * recorrido en vez de cinco botones iguales.
 *
 * ─── COMO SE MARCA LA ACTIVA ───
 *
 * Con RELLENO del color de la empresa, que es la misma leccion de las pastillas y de la escala de
 * puntuacion: en una fila de elementos iguales lo unico que se pregunta es CUAL, y eso se contesta
 * con area de color, no con una linea. Las demas van en gris y solo el numero lleva caja, para que
 * la fila no parezca cinco botones.
 */
function Etapas<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<ViewTab<T>>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const actual = tabs.findIndex((tab) => tab.key === value);

  return (
    <div role="tablist" className={cn('flex w-full items-stretch overflow-x-auto', className)}>
      {tabs.map((tab, indice) => {
        const selected = tab.key === value;
        // Lo ya recorrido se ve mas oscuro que lo que falta: el camino se lee de un vistazo.
        const recorrido = indice < actual;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={cn(
              'focus-ring group flex shrink-0 items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150',
              indice === 0 && 'rounded-l-xl',
              indice === tabs.length - 1 && 'rounded-r-xl',
              selected
                ? 'font-medium text-white'
                : recorrido
                  ? 'text-ink-700 hover:bg-surface'
                  : 'text-ink-500 hover:bg-surface hover:text-ink-900',
            )}
            style={selected ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                selected ? 'bg-white/20 text-white' : 'bg-paper text-ink-500 group-hover:bg-line',
              )}
            >
              {indice + 1}
            </span>
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-white/20' : 'bg-paper text-ink-500',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
