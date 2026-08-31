'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from './cn';

/**
 * ELEGIR UNA COSA. El selector del producto.
 *
 * Sustituye al `<select>` nativo, que tenia tres problemas y ninguno era estetico:
 *
 *  1. **No se puede buscar.** Con 250 convocatorias o 60 cargos, elegir es recorrer una lista con
 *     la rueda del raton. El `<select>` nativo solo salta a la primera letra.
 *  2. **Solo sabe pintar una linea de texto gris.** Una convocatoria es su codigo, su formacion,
 *     su tipo, su estado y su fecha; meterlo todo en una cadena la vuelve ilegible, y dejarlo
 *     fuera obliga a abrir otra pantalla para saber cual es cual.
 *  3. **Miente cuando la lista viene filtrada.** Se busca algo, no aparece, y no hay forma de
 *     saber si es que no existe o que no se ofrece.
 *
 * El buscador **aparece solo cuando hace falta** (`umbralBusqueda`, 8 por defecto). Con cinco
 * opciones un campo de busqueda es ruido: ocupa sitio y no ahorra nada. Con cincuenta es lo unico
 * que hace la lista usable. La misma pieza sirve para los dos casos sin que nadie lo configure.
 *
 * Se cierra con Escape y al pulsar fuera; se navega con flechas, Inicio/Fin y Enter. El disparador
 * es un boton de 40 px como los inputs, asi que en un formulario no se nota que no es un campo.
 */

export interface ComboOption {
  id: string;
  label: string;
  /** Segunda linea: proceso, fecha, categoria. Lo que hace falta para distinguir dos parecidas. */
  meta?: string;
  /** Referencia corta en monoespaciada, antes del rotulo (un codigo). */
  code?: string;
  /** Etiqueta con el color del tipo, como en las fichas. */
  chip?: { label: string; colorHex?: string | null };
  /** Estado, con las palabras del producto. */
  badge?: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' };
  disabled?: boolean;
}

const TONO: Record<NonNullable<ComboOption['badge']>['tone'], string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-paper text-ink-500',
};

export interface ComboProps {
  options: ComboOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** A partir de cuantas opciones aparece el buscador. */
  umbralBusqueda?: number;
  /** Que decir cuando no hay nada que elegir, y POR QUE. */
  emptyLabel?: string;
  emptyHint?: string;
  /** Texto del buscador. */
  searchPlaceholder?: string;
  /**
   * SE AVISA AL PADRE DE LO QUE SE ESCRIBE, para que pueda pedirlo al SERVIDOR.
   *
   * Sin esto, el Combo solo puede filtrar lo que ya tiene en la mano, y eso es exactamente el
   * fallo que este proyecto ya se comio tres veces (ver RUNBOOK, "un desplegable no puede sostener
   * el catalogo"): con 253 convocatorias en la base y un tope de 100, la que se acaba de publicar
   * no esta en la lista y "buscarla" no la encuentra nunca. El sintoma es "la busqueda no
   * funciona" y la causa esta dos capas mas abajo.
   *
   * Cuando se pasa, el padre amplia el conjunto y el Combo sigue filtrando lo que recibe: las dos
   * cosas suman, no se estorban.
   */
  onSearchChange?: (texto: string) => void;
  /** Aviso bajo el buscador cuando la lista puede no estar completa. */
  searchHint?: string;
}

export function Combo({
  options,
  value,
  onChange,
  id,
  placeholder = 'Seleccionar...',
  disabled = false,
  umbralBusqueda = 8,
  emptyLabel = 'No hay opciones',
  emptyHint,
  searchPlaceholder = 'Buscar...',
  onSearchChange,
  searchHint,
}: ComboProps) {
  const generado = useId();
  const controlId = id ?? generado;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const elegida = options.find((option) => option.id === value) ?? null;
  const conBusqueda = options.length >= umbralBusqueda || onSearchChange !== undefined;

  const visibles = useMemo(() => {
    const termino = texto.trim().toLowerCase();
    if (!termino) return options;
    // Se busca en TODO lo que se ve: rotulo, codigo y la linea de apoyo. Buscar solo en el rotulo
    // hace que escribir el codigo que se tiene delante no encuentre nada.
    return options.filter((option) =>
      [option.label, option.code, option.meta, option.chip?.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(termino),
    );
  }, [options, texto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node)) setAbierto(false);
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  /**
   * Lo ultimo que llego, sin ser una dependencia.
   *
   * `options` NO puede estar en las dependencias del efecto de apertura: cuando la busqueda va
   * contra el servidor, cada respuesta cambia `options`, el efecto se vuelve a ejecutar y BORRA lo
   * que se estaba escribiendo. El resultado es un campo que se vacia solo mientras tecleas y una
   * lista que nunca llega a encontrar nada.
   */
  const ultimas = useRef({ options, value });
  ultimas.current = { options, value };

  useEffect(() => {
    if (!abierto) return;
    setTexto('');
    onSearchChange?.('');
    const { options: actuales, value: elegido } = ultimas.current;
    setResaltado(Math.max(0, actuales.findIndex((option) => option.id === elegido)));
    // El foco va al buscador cuando lo hay: quien abre una lista de cincuenta viene a escribir.
    if (conBusqueda) window.setTimeout(() => buscador.current?.focus(), 0);
    // Solo al ABRIR. `onSearchChange` tampoco entra: si el padre lo redefine en cada render, la
    // busqueda se reiniciaria sola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, conBusqueda]);

  const elegir = (option: ComboOption) => {
    if (option.disabled) return;
    onChange(option.id);
    setAbierto(false);
  };

  const navegar = (event: React.KeyboardEvent) => {
    if (!abierto) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        setAbierto(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setResaltado((actual) => Math.min(visibles.length - 1, actual + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setResaltado((actual) => Math.max(0, actual - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setResaltado(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setResaltado(visibles.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visibles[resaltado];
      if (option) elegir(option);
    }
  };

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        id={controlId}
        role="combobox"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-controls={`${controlId}-lista`}
        disabled={disabled}
        onClick={() => setAbierto((valor) => !valor)}
        onKeyDown={navegar}
        className={cn(
          'focus-ring flex h-10 w-full items-center gap-2 rounded-md border bg-surface px-3 text-left text-sm shadow-btn-flat transition-all duration-150',
          'hover:border-line-strong hover:shadow-btn disabled:cursor-not-allowed disabled:border-line disabled:bg-paper disabled:text-ink-300 disabled:shadow-none',
          abierto ? 'border-primary' : 'border-line-strong',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', elegida ? 'text-ink-900' : 'text-ink-500')}>
          {elegida?.label ?? (options.length === 0 ? emptyLabel : placeholder)}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={cn('shrink-0 text-ink-500 transition-transform duration-150', abierto && 'rotate-180')}
        />
      </button>


      {abierto ? (
        <div className="card absolute z-30 mt-1 w-full overflow-hidden p-0">
          {conBusqueda ? (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink-500" />
              <input
                ref={buscador}
                value={texto}
                onChange={(event) => {
                  setTexto(event.target.value);
                  setResaltado(0);
                  onSearchChange?.(event.target.value);
                }}
                onKeyDown={navegar}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-300"
              />
            </div>
          ) : null}

          {searchHint ? (
            <p className="border-b border-line bg-paper px-3 py-1.5 text-xs text-ink-500">{searchHint}</p>
          ) : null}

          <ul id={`${controlId}-lista`} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {visibles.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-ink-500">
                {texto.trim() ? `Ninguna coincide con "${texto.trim()}".` : emptyLabel}
                {emptyHint ? <span className="mt-1 block text-xs">{emptyHint}</span> : null}
              </li>
            ) : (
              visibles.map((option, indice) => {
                const seleccionada = option.id === value;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={seleccionada}
                      disabled={option.disabled}
                      onMouseEnter={() => setResaltado(indice)}
                      onClick={() => elegir(option)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150',
                        indice === resaltado ? 'bg-paper' : 'bg-transparent',
                        option.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                          seleccionada ? 'bg-primary text-white' : 'bg-transparent',
                        )}
                      >
                        {seleccionada ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {option.code ? (
                            <span className="font-mono text-xs text-ink-500">{option.code}</span>
                          ) : null}
                          <span className="text-sm text-ink-900">{option.label}</span>
                          {option.chip ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${option.chip.colorHex ?? '#5b6572'} 12%, white)`,
                                color: option.chip.colorHex ?? 'var(--ink-700)',
                              }}
                            >
                              {option.chip.label}
                            </span>
                          ) : null}
                          {option.badge ? (
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]',
                                TONO[option.badge.tone],
                              )}
                            >
                              {option.badge.label}
                            </span>
                          ) : null}
                        </span>
                        {option.meta ? (
                          <span className="mt-0.5 block text-xs text-ink-500">{option.meta}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
