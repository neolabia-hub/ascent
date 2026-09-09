'use client';

import type { LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import { cn } from './cn';

/** El color del relleno cuando la opcion esta marcada. `neutral` usa la marca del tenant. */
export type SegmentedTone = 'ok' | 'warn' | 'info' | 'neutral';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Rotulo para lectores de pantalla cuando el visible se abrevia. */
  srLabel?: string;
  /**
   * SOLO ICONO, sin texto visible. Para cuando el control se repite en cada fila de una tabla:
   * tres rotulos por fila, multiplicados por cuarenta filas, son doscientos pixeles de columna que
   * se le quitan a los datos. El `label` sigue siendo obligatorio —es el nombre accesible y el
   * globo del raton—, solo deja de pintarse.
   *
   * No se usa a la ligera: un icono hay que aprenderlo. Vale cuando son convencionales (un visto,
   * una equis) y cuando hay una leyenda cerca la primera vez que se ven.
   */
  icon?: LucideIcon;
  tone?: SegmentedTone;
}

/**
 * ELEGIR ENTRE POCAS OPCIONES QUE SE VEN TODAS A LA VEZ.
 *
 * ─── POR QUE NO UN <select> ───
 *
 * Nacio para la lista de asistencia, donde hay un control por fila y cuarenta filas. Un desplegable
 * ahi cuesta dos gestos por persona —abrir y elegir— y, sobre todo, **no se puede leer de un
 * vistazo**: para saber a quien falta por marcar hay que recorrer cuarenta cajas iguales y leer el
 * texto de cada una. Con las opciones a la vista, el estado de la lista entera se ve de golpe.
 *
 * La regla es la de siempre en este sistema: con tres o cuatro opciones cortas y excluyentes se
 * enseñan todas; a partir de ahi, desplegable.
 *
 * ─── MARCADO ES RELLENO, Y EL RELLENO ES DE LA EMPRESA ───
 *
 * Lo mismo que aprendieron la escala de puntuacion y `ViewTabs`: en una fila de opciones iguales la
 * unica pregunta es CUAL, y eso se contesta con area de color, no con un borde ni un tinte. Y el
 * color por defecto es `--brand-primary`, como en el resto de lo que se marca en el producto: en
 * una empresa con acento verde, la señal de "esto es lo elegido" tiene que ser su verde.
 *
 * `tone` existe para el caso en que el color signifique algo por si mismo —un si/no de riesgo, por
 * ejemplo—, pero es la excepcion: por defecto manda la marca.
 *
 * ─── ACCESIBILIDAD ───
 *
 * Es un `radiogroup` de verdad: tabulador para entrar y salir del grupo, flechas para moverse
 * dentro (tabindex movil). Un grupo de botones donde el tabulador visita los tres obliga a tres
 * pulsaciones por fila a quien navega con teclado, que es justo a quien mas le cuesta la lista.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  disabled = false,
  className,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Que se esta eligiendo: "Asistencia de Ana Perez". Obligatorio, es el nombre del grupo. */
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}) {
  const grupo = useRef<HTMLDivElement>(null);

  function alTeclado(evento: React.KeyboardEvent<HTMLDivElement>) {
    const teclas = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!teclas.includes(evento.key)) return;
    evento.preventDefault();
    const actual = options.findIndex((opcion) => opcion.value === value);
    const ultimo = options.length - 1;
    let siguiente = actual;
    if (evento.key === 'Home') siguiente = 0;
    else if (evento.key === 'End') siguiente = ultimo;
    else if (evento.key === 'ArrowRight' || evento.key === 'ArrowDown') siguiente = actual >= ultimo ? 0 : actual + 1;
    else siguiente = actual <= 0 ? ultimo : actual - 1;
    const elegida = options[siguiente];
    if (!elegida) return;
    onChange(elegida.value);
    // El foco sigue a la seleccion, que es lo que un radiogroup hace y lo que deja encadenar flechas.
    const botones = grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    botones?.[siguiente]?.focus();
  }

  return (
    <div
      ref={grupo}
      role="radiogroup"
      aria-label={label}
      onKeyDown={alTeclado}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line-strong bg-paper p-0.5 shadow-btn-flat',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {options.map((opcion) => {
        const marcada = opcion.value === value;
        const tono = opcion.tone ?? 'neutral';
        return (
          <button
            key={opcion.value}
            type="button"
            role="radio"
            aria-checked={marcada}
            aria-label={opcion.srLabel ?? (opcion.icon ? opcion.label : undefined)}
            // El globo del raton es lo que hace aprendible un icono sin rotulo.
            title={opcion.icon ? (opcion.srLabel ?? opcion.label) : undefined}
            // Tabindex movil: solo la marcada entra en el recorrido del tabulador.
            tabIndex={marcada ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(opcion.value)}
            className={cn(
              'focus-ring whitespace-nowrap rounded-md transition-all duration-150 ease-pulse disabled:cursor-not-allowed',
              // Ajustados a la baja el 2026-09-06: con un control por fila, cada pixel de ancho se
              // multiplica por cuarenta y empujaba las columnas de al lado.
              size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
              // Cuadrado cuando es un icono: con el relleno del texto se ve torcido.
              opcion.icon
                ? cn('flex items-center justify-center', size === 'sm' ? 'w-7' : 'w-8')
                : size === 'sm'
                  ? 'px-2'
                  : 'px-3',
              marcada
                ? cn(
                    'font-medium text-white shadow-btn-flat',
                    tono === 'ok' && 'bg-ok',
                    tono === 'warn' && 'bg-warn',
                    tono === 'info' && 'bg-info',
                  )
                : 'text-ink-500 hover:bg-surface hover:text-ink-900',
            )}
            // La marca del tenant se resuelve en tiempo de ejecucion, asi que no puede ser una clase.
            style={marcada && tono === 'neutral' ? { backgroundColor: 'var(--brand-primary)' } : undefined}
          >
            {opcion.icon ? <opcion.icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" /> : opcion.label}
          </button>
        );
      })}
    </div>
  );
}
