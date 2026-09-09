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

/*
  UNA SOLA FORMA: LA PASTILLA (2026-09-09).

  Hubo una segunda, `etapas` —un recorrido con línea y paradas, «tipo pipeline», pedido y luego
  retirado por el cliente: *«el selector de formación no me gustó nada»*—. Se borra en vez de
  dejarla desconectada: una variante que no usa nadie es una invitación a volver a usarla, y aquí
  el motivo para no hacerlo importa. Un recorrido AFIRMA un orden, y las cinco vistas de una ficha
  no lo tienen: se entra a Convocatorias sin pasar por Contenido cada vez que se programa una
  jornada de algo ya publicado. Dibujar una secuencia que el producto no obliga es contar una
  mentira pequeña todos los días.

  Lo que sí era cierto de aquella queja —*«el botón se parece a esos selectores»*— se resolvió
  moviendo el selector a su propia fila, no cambiándole el dibujo.
*/

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
}: {
  tabs: ReadonlyArray<ViewTab<T>>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    /*
      LA BANDA QUE LAS CONTIENE (2026-09-09).

      Antes eran cinco pastillas sueltas sobre el fondo, y sueltas se parecen a cinco botones. Dentro
      de una banda gris con su borde se leen como UN control con cinco posiciones —que es lo que
      son—, y ademas la banda separa el selector de los botones de accion sin depender de que uno
      mire el color: son dos objetos distintos, no dos estilos del mismo.
    */
    <div
      role="tablist"
      className={cn(
        'inline-flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1 shadow-btn-flat',
        className,
      )}
    >
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
              'focus-ring flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
              selected
                ? 'font-medium text-white shadow-btn'
                : 'text-ink-500 hover:bg-surface hover:text-ink-900',
            )}
            style={selected ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            <Icon size={15} strokeWidth={selected ? 2 : 1.75} aria-hidden="true" />
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-white/20' : 'bg-surface text-ink-500',
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
