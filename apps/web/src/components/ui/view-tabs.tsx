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
 * CAMBIAR DE VISTA DENTRO DE UNA PANTALLA.
 *
 * ─── POR QUE ES UNA PIEZA Y NO CSS SUELTO ───
 *
 * Habia dos formas de decir lo mismo. El plan y Seguimiento usaban una pastilla rellena con el
 * color de la empresa; Asignaciones, un subrayado gris tinta. La misma pregunta —"¿en cual de las
 * cuatro estoy?"— se contestaba distinta segun la pantalla, y la de Asignaciones ademas no usaba
 * la marca: en una empresa con acento verde, la senal de "estas aqui" salia gris.
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
}: {
  tabs: ReadonlyArray<ViewTab<T>>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
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
