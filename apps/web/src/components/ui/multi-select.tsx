'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from './cn';

export interface MultiSelectOption {
  id: string;
  label: string;
  hint?: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Seleccion multiple sobre un catalogo (normas, servicios, regionales, cargos).
 *
 * Se dibuja como CHIPS y no como una lista con casillas suelta porque lo que el usuario necesita
 * saber de un vistazo es "que quedo elegido", no "que habia disponible". Lo elegido se puede
 * quitar desde su propio chip, sin volver a abrir el desplegable.
 *
 * El desplegable se cierra al hacer clic fuera y con Escape; navegable por teclado.
 *
 * ─── DOS TRAMPAS CONOCIDAS, encontradas persiguiendo un e2e que fallaba ───
 *
 * 1. **El aspa de quitar un chip vive DENTRO del boton que abre y cierra.** Con una sola opcion
 *    marcada y una etiqueta larga, esa aspa puede caer justo donde alguien pulsaria para volver a
 *    cerrar la lista: en vez de cerrarse, se queda abierta y ademas se pierde la seleccion. El
 *    `stopPropagation` del aspa impide lo segundo pero no lo primero. Pendiente: sacar el aspa del
 *    boton, o cerrar solo desde el chevron.
 *
 * 2. **La lista se abre HACIA ABAJO y tapa lo que hay debajo.** Es lo normal en un desplegable,
 *    pero conviene tenerlo presente: dentro de un cajon estrecho puede cubrir el campo siguiente
 *    entero, y quien quiera pulsarlo tiene que cerrar esto primero.
 *
 * Las dos estan documentadas aqui y no arregladas todavia porque ninguna rompe nada hoy: se llega
 * a ellas por caminos poco frecuentes, y arreglar la primera implica rehacer la estructura del
 * control. Quien lo toque, que empiece por aqui.
 */
export function MultiSelect({ options, value, onChange, placeholder = 'Seleccionar...', disabled = false, id }: MultiSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = options.filter((option) => value.includes(option.id));

  const toggle = (optionId: string) => {
    onChange(value.includes(optionId) ? value.filter((item) => item !== optionId) : [...value, optionId]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={controlId}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'focus-ring flex min-h-10 w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="py-1 text-ink-300">{placeholder}</span>
          ) : (
            selected.map((option) => (
              <span
                key={option.id}
                className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs text-ink-700"
              >
                {option.label}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Quitar ${option.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled) toggle(option.id);
                  }}
                  className="rounded-full p-0.5 text-ink-500 hover:bg-line hover:text-ink-900"
                >
                  <X size={11} />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-500" />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="card absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto p-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">No hay opciones. Se crean en Configuracion.</li>
          ) : (
            options.map((option) => {
              const checked = value.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(option.id)}
                    className="focus-ring flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-paper"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-primary bg-primary text-white' : 'border-line-strong',
                      )}
                    >
                      {checked ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-ink-900">{option.label}</span>
                      {option.hint ? <span className="block text-xs text-ink-500">{option.hint}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
