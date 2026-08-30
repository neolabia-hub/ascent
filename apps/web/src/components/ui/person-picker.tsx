'use client';

import { ChevronDown, Search, UserRound, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from './cn';

export interface PersonOption {
  id: string;
  fullName: string;
  jobTitle?: { name: string } | null;
  area?: { id: string; name: string } | null;
}

/**
 * ELEGIR UNA PERSONA de una lista larga.
 *
 * Un `<select>` con 116 nombres obliga a saberse de memoria a quien buscas y a recorrerlo con la
 * rueda del raton. Aqui se escribe: la lista se acorta mientras tecleas, y cada fila lleva el
 * cargo y el area, que es lo que distingue a dos personas que se llaman parecido.
 *
 * SUGERIDAS vs. TODAS. Cuando quien llama sabe que area es la natural —el area del proceso, por
 * ejemplo— se ofrecen primero esas, porque acertaras casi siempre. Pero NO se esconden las demas:
 * el jefe se va de vacaciones y lo cubre alguien de otra area, y un selector que no deja hacer eso
 * obliga a inventarse un rodeo. Se muestran las suyas y se ofrece "ver todas", que es guiar sin
 * imponer.
 */
export function PersonPicker({
  people,
  value,
  onChange,
  suggestedAreaId = null,
  placeholder = 'Sin asignar',
  disabled = false,
  id,
}: {
  people: PersonOption[];
  value: string | null;
  onChange: (personId: string | null) => void;
  /** Area cuya gente se ofrece primero. `null` = no hay una mejor que otra. */
  suggestedAreaId?: string | null;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

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
    // El cursor va al buscador al abrir: se abre para buscar, no para mirar.
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = people.find((person) => person.id === value) ?? null;
  const sugeridas = useMemo(
    () => (suggestedAreaId ? people.filter((person) => person.area?.id === suggestedAreaId) : []),
    [people, suggestedAreaId],
  );
  const haySugeridas = sugeridas.length > 0;

  const visibles = useMemo(() => {
    const base = haySugeridas && !showAll ? sugeridas : people;
    const termino = query.trim().toLowerCase();
    if (!termino) return base;
    return base.filter((person) =>
      `${person.fullName} ${person.jobTitle?.name ?? ''} ${person.area?.name ?? ''}`.toLowerCase().includes(termino),
    );
  }, [people, sugeridas, haySugeridas, showAll, query]);

  const elegir = (personId: string | null) => {
    onChange(personId);
    setOpen(false);
    setQuery('');
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
        className="focus-ring flex min-h-10 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-ink-900">
                {iniciales(selected.fullName)}
              </span>
              <span className="min-w-0 truncate text-ink-900">{selected.fullName}</span>
              {selected.jobTitle?.name ? (
                <span className="hidden truncate text-xs text-ink-500 sm:inline">· {selected.jobTitle.name}</span>
              ) : null}
            </>
          ) : (
            <>
              <UserRound size={15} className="shrink-0 text-ink-500" strokeWidth={1.75} />
              <span className="text-ink-500">{placeholder}</span>
            </>
          )}
        </span>
        {selected && !disabled ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Quitar la persona asignada"
            onClick={(event) => {
              event.stopPropagation();
              elegir(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                elegir(null);
              }
            }}
            className="focus-ring rounded p-0.5 text-ink-500 hover:text-ink-900"
          >
            <X size={14} strokeWidth={2} />
          </span>
        ) : null}
        <ChevronDown size={15} className="shrink-0 text-ink-500" strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-ink-500" strokeWidth={2} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, cargo o area"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500"
            />
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-ink-500">
                {query ? 'Nadie coincide con esa busqueda.' : 'No hay personas para elegir.'}
              </li>
            ) : (
              visibles.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={person.id === value}
                    onClick={() => elegir(person.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-paper',
                      person.id === value && 'bg-primary-soft',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-[10px] font-semibold text-ink-700">
                      {iniciales(person.fullName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink-900">{person.fullName}</span>
                      <span className="block truncate text-xs text-ink-500">
                        {[person.jobTitle?.name, person.area?.name].filter(Boolean).join(' · ') || 'Sin cargo'}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {haySugeridas ? (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="focus-ring w-full border-t border-line px-3 py-2 text-left text-xs text-ink-500 hover:text-ink-900"
            >
              {showAll
                ? `Ver solo las ${sugeridas.length} del area`
                : `Ver todas las personas (${people.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes[1]?.[0] ?? ''}`.toUpperCase();
}
