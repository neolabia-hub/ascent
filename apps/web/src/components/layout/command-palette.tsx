'use client';

import { ArrowRight, CircleUser, GraduationCap, House, Repeat2, Search, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getHistory, getPending } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';

/**
 * Buscador de comandos (Ctrl+K), al estilo de Linear o Sana Labs.
 *
 * En una aplicacion con cuatro destinos podria parecer un lujo, y no lo es: cuando alguien tiene
 * catorce formaciones asignadas, buscarla por nombre es mas rapido que recorrer el catalogo. Y en
 * escritorio, quien ya sabe lo que quiere no deberia tener que usar el raton.
 *
 * Busca sobre lo que la persona YA tiene (pendientes e historial), no sobre el catalogo completo
 * de la empresa: nadie deberia descubrir por un buscador que existe una formacion que no le toca.
 */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

/**
 * Destinos del aprendiz. El panel de administracion pasa los suyos: el buscador es el mismo
 * componente en las dos superficies, pero nunca mezcla sus contenidos.
 */
export const LEARNER_COMMANDS: Command[] = [
  { id: 'nav-hoy', label: 'Inicio', href: '/hoy', icon: House, group: 'Ir a' },
  { id: 'nav-mi', label: 'Mi aprendizaje', href: '/mi-formacion', icon: GraduationCap, group: 'Ir a' },
  { id: 'nav-repaso', label: 'Repaso de hoy', href: '/repaso', icon: Repeat2, group: 'Ir a' },
  { id: 'nav-perfil', label: 'Mi perfil', href: '/perfil', icon: CircleUser, group: 'Ir a' },
];

/** Carga por defecto: lo que la persona tiene asignado y su historial. */
async function loadLearnerCommands(): Promise<Command[]> {
  const [pending, history] = await Promise.all([
    getPending().catch(() => ({ items: [] })),
    getHistory().catch(() => ({ items: [] })),
  ]);
  return [
    ...pending.items
      .filter((item) => item.enrollmentId)
      .map((item) => ({
        id: `p-${item.assignmentId}`,
        label: item.title,
        hint: item.overdue ? 'Vencida' : 'Pendiente',
        href: `/aprender/${item.enrollmentId}`,
        icon: GraduationCap,
        group: 'Mis pendientes',
      })),
    ...history.items.map((item) => ({
      id: `h-${item.id}`,
      label: item.offering?.activityVersion.activity.name ?? 'Formacion',
      hint: 'Ya terminada',
      href: `/aprender/${item.id}`,
      icon: GraduationCap,
      group: 'Mi historial',
    })),
  ];
}

/** Compara sin acentos ni mayusculas: "induccion" tiene que encontrar "Inducción". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function CommandPalette({
  open,
  onOpenChange,
  staticCommands = LEARNER_COMMANDS,
  loadCommands = loadLearnerCommands,
  placeholder = 'Buscar una formacion o ir a una pantalla',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staticCommands?: Command[];
  loadCommands?: () => Promise<Command[]>;
  placeholder?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [dynamic, setDynamic] = useState<Command[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    inputRef.current?.focus();

    let cancelled = false;
    void loadCommands()
      .then((commands) => {
        if (!cancelled) setDynamic(commands);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadCommands, open]);

  const results = useMemo(() => {
    const all = [...staticCommands, ...dynamic];
    if (query.trim().length === 0) return all.slice(0, 12);
    const needle = normalize(query.trim());
    return all.filter((command) => normalize(command.label).includes(needle)).slice(0, 12);
  }, [dynamic, query, staticCommands]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const go = (command: Command | undefined) => {
    if (!command) return;
    onOpenChange(false);
    router.push(command.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onOpenChange(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => Math.min(current + 1, results.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => Math.max(current - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      go(results[cursor]);
    }
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="animate-card-in w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-card-hover"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label="Buscar"
            className="h-12 w-full bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-300"
          />
          <kbd className="shrink-0 rounded border border-line px-1.5 text-[11px] text-ink-300">Esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-500">Nada coincide con eso.</p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto p-2">
            {results.map((command, index) => {
              const Icon = command.icon;
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              return (
                <li key={command.id}>
                  {showGroup ? (
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-500">
                      {command.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(command)}
                    className={cn(
                      'focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm',
                      index === cursor ? 'bg-paper text-ink-900' : 'text-ink-700',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? <span className="shrink-0 text-xs text-ink-500">{command.hint}</span> : null}
                    {index === cursor ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
