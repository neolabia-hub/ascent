'use client';

import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from './cn';

export interface MultiSelectOption {
  id: string;
  label: string;
  hint?: string;
  /**
   * Por donde TAMBIEN se encuentra esta opcion aunque no se vea escrito: la cedula de una persona,
   * el codigo de un cargo. Sirve para el buscador y para pegar una lista (ver `aTokens`).
   */
  keywords?: string;
}

/** A partir de cuantas opciones sale el buscador. Con menos, todo cabe a la vista. */
const CON_BUSCADOR = 8;

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Una LISTA pegada —«1045876321, 1116267708» o una columna copiada de Excel— se parte en sus
 * piezas. Solo cuenta como lista si hay dos o mas Y TODAS LLEVAN NUMEROS: «Juan Perez» tambien son
 * dos palabras, y es una busqueda por nombre, no una lista de dos personas.
 */
function aTokens(texto: string): string[] {
  const piezas = texto.split(/[\s,;]+/).map((pieza) => pieza.trim()).filter(Boolean);
  return piezas.length >= 2 && piezas.every((pieza) => /\d/.test(pieza)) ? piezas : [];
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
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const conBuscador = options.length > CON_BUSCADOR;

  /*
    EL BUSCADOR (2026-09-30). Se pidio para elegir personas —*"que se pueda buscar por cedula
    tambien, y varios"*— con 1.001 en la lista y ninguna forma de encontrar una que no fuera bajar a
    ojo. Vive aqui y no en un selector de personas aparte para que lo tengan TODAS las listas largas:
    cargos, areas y normas crecen igual.

    Se abre con el foco puesto, y al cerrarse se vacia: volver a abrir y encontrar la lista filtrada
    por lo que se busco hace un rato hace creer que faltan opciones.
  */
  useEffect(() => {
    if (open && conBuscador) searchRef.current?.focus();
    if (!open) setQuery('');
  }, [open, conBuscador]);

  const indice = useMemo(
    () => options.map((option) => ({ option, texto: normalizar(`${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`) })),
    [options],
  );
  const tokens = aTokens(query);
  /** Modo LISTA: cada pieza pegada se busca EXACTA por su clave o su nombre, nunca por parecido. */
  const lista = useMemo(() => {
    if (tokens.length === 0) return null;
    const encontradas: MultiSelectOption[] = [];
    const faltan: string[] = [];
    for (const token of tokens) {
      const t = normalizar(token);
      const hit = options.find((option) => normalizar(option.keywords ?? '') === t || normalizar(option.label) === t);
      if (hit) {
        if (!encontradas.includes(hit)) encontradas.push(hit);
      } else faltan.push(token);
    }
    return { encontradas, faltan };
  }, [tokens.join('|'), options]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = normalizar(query);
  const visibles = lista ? lista.encontradas : q ? indice.filter((row) => row.texto.includes(q)).map((row) => row.option) : options;

  const marcarTodas = (ids: string[]) => onChange([...new Set([...value, ...ids])]);

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
        <div className="card absolute left-0 right-0 z-20 mt-1 p-1">
          {conBuscador ? (
            <div className="border-b border-line p-1 pb-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  /*
                    UNA COLUMNA COPIADA DE EXCEL llega con saltos de linea, y un campo de una sola
                    linea los TRAGA sin separador: «1045876321» y «1116267708» se pegaban en un
                    solo numero que no es de nadie. Se convierten en comas antes de que se pierdan.
                  */
                  onPaste={(event) => {
                    const texto = event.clipboardData.getData('text');
                    if (!/[\r\n]/.test(texto)) return;
                    event.preventDefault();
                    setQuery(texto.replace(/[\r\n]+/g, ', ').replace(/,\s*$/, ''));
                  }}
                  placeholder="Buscar, o pegar varias cédulas"
                  aria-label="Buscar en la lista"
                  className="focus-ring h-9 w-full rounded-md border border-line-strong bg-surface pl-8 pr-2 text-sm text-ink-900 placeholder:text-ink-300"
                />
              </div>
              {lista ? (
                <div className="mt-2 space-y-1 px-1 text-xs">
                  <p className="text-ink-700">
                    {lista.encontradas.length} de {tokens.length} encontradas
                    {lista.faltan.length > 0 ? (
                      <span className="text-warn"> · no están: {lista.faltan.join(', ')}</span>
                    ) : null}
                  </p>
                  {lista.encontradas.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        marcarTodas(lista.encontradas.map((option) => option.id));
                        setQuery('');
                      }}
                      className="focus-ring rounded font-medium text-info hover:underline"
                    >
                      Marcar las {lista.encontradas.length} encontradas
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto pt-1">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">No hay opciones. Se crean en Configuración.</li>
          ) : visibles.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">Nada coincide con «{query}».</li>
          ) : (
            visibles.map((option) => {
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
        </div>
      ) : null}
    </div>
  );
}
