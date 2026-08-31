'use client';

import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from './cn';

/**
 * ELEGIR UNA COSA DE UNA LISTA LARGA, viendola.
 *
 * Sustituye al `<select>` donde lo que se elige no cabe en una linea de texto. Una convocatoria
 * no es "CONV-2026-000420": es esa formacion, de ese tipo, en ese estado y en esa fecha — y un
 * desplegable nativo solo sabe ensenar lo primero, en gris, sin poder mirar dos a la vez.
 *
 * Cuando ademas la lista viene FILTRADA, un `<select>` miente por omision: se busca algo, no
 * aparece, y no hay forma de saber si es que no existe o que no se ofrece. Aqui el vacio tiene
 * titulo y explicacion, que es lo unico que convierte un filtro en ayuda en vez de en un fallo.
 *
 * Es un grupo de radios de verdad —`role="radiogroup"`, flechas y espacio— no una lista de
 * `div`s con `onClick`: quien navega con teclado tiene que poder elegir igual que con el raton.
 */

export interface PickListItem {
  id: string;
  /** Lo que identifica la fila. Se lee primero. */
  title: string;
  /** El codigo o la referencia corta. Va en monoespaciada, antes del titulo. */
  code?: string;
  /** Datos de apoyo en una linea: fecha, proceso, cupo. */
  meta?: string;
  /** Etiqueta con el color del tipo, igual que en las fichas. */
  chip?: { label: string; colorHex?: string | null };
  /** Estado, con las mismas palabras que el resto del producto. */
  badge?: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' };
}

const TONO: Record<NonNullable<PickListItem['badge']>['tone'], string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-paper text-ink-500',
};

export function PickList({
  items,
  value,
  onChange,
  emptyTitle,
  emptyHint,
  label,
  id,
}: {
  items: PickListItem[];
  value: string;
  onChange: (id: string) => void;
  emptyTitle: string;
  /** POR QUE esta vacio. Sin esto, un filtro se lee como un fallo de busqueda. */
  emptyHint: string;
  label: string;
  /** Para que el `htmlFor` del campo apunte al grupo, y para poder localizarlo en las pruebas. */
  id?: string;
}) {
  const generado = useId();
  const groupId = id ?? generado;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-paper px-4 py-6 text-center">
        <p className="text-sm font-medium text-ink-900">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      id={groupId}
      // Alto acotado y desplazamiento propio: con 250 convocatorias la lista no puede empujar
      // el boton de guardar fuera de la pantalla.
      className="max-h-[19rem] space-y-1.5 overflow-y-auto rounded-lg border border-line bg-paper p-1.5"
    >
      {items.map((item) => {
        const elegido = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={elegido}
            onClick={() => onChange(item.id)}
            className={cn(
              'focus-ring flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150',
              elegido
                ? 'border-primary bg-primary-soft'
                : 'border-transparent bg-surface hover:border-line-strong',
            )}
          >
            {/* La marca ocupa su sitio SIEMPRE, elegida o no: si apareciera solo al elegir, la
                fila entera se desplazaria un poco y la lista daria un salto. */}
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                elegido ? 'border-primary bg-primary text-white' : 'border-line-strong',
              )}
            >
              {elegido ? <Check size={11} strokeWidth={3} /> : null}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                {item.code ? <span className="font-mono text-xs text-ink-500">{item.code}</span> : null}
                <span className="text-sm font-medium text-ink-900">{item.title}</span>
                {item.chip ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${item.chip.colorHex ?? '#5b6572'} 12%, white)`,
                      color: item.chip.colorHex ?? 'var(--ink-700)',
                    }}
                  >
                    {item.chip.label}
                  </span>
                ) : null}
                {item.badge ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]',
                      TONO[item.badge.tone],
                    )}
                  >
                    {item.badge.label}
                  </span>
                ) : null}
              </span>
              {item.meta ? <span className="mt-0.5 block text-xs text-ink-500">{item.meta}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
