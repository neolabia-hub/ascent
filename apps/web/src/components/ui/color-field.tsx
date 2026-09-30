'use client';

import { useEffect, useState } from 'react';
import { cn } from './cn';

/** #RRGGBB, o #RGB que se expande. Con o sin la almohadilla. `null` si no es un color. */
export function normalizarHex(texto: string): string | null {
  const limpio = texto.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(limpio)) return `#${limpio.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(limpio)) {
    return `#${limpio
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`;
  }
  return null;
}

/**
 * UN COLOR, ELEGIDO O ESCRITO (2026-09-30).
 *
 * Era solo el selector nativo: se podia pinchar un color parecido, pero no poner EL de la empresa.
 * Y el color corporativo casi siempre llega escrito —«#0B3D91», del manual de marca—, no se elige a
 * ojo. Ahora son las dos cosas juntas: la muestra abre el selector, y al lado se escribe o se pega el
 * codigo.
 *
 * Lo escrito solo sube cuando ES un color (acepta «0B3D91», «#0b3d91» y el corto «#09f»). Mientras se
 * teclea a medias no se toca el valor bueno; al salir del campo, si no es un color, se dice y se
 * vuelve al ultimo valido — un color roto guardado pintaria de negro los botones de toda la empresa.
 */
export function ColorField({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState(value);
  const [error, setError] = useState(false);

  // Si el valor cambia por fuera (el selector, o una recarga), el texto lo sigue.
  useEffect(() => {
    setTexto(value);
    setError(false);
  }, [value]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="relative h-10 w-12 shrink-0 overflow-hidden rounded-lg border border-line-strong">
          <span aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: normalizarHex(value) ?? '#000000' }} />
          <input
            type="color"
            aria-label="Elegir el color"
            disabled={disabled}
            value={normalizarHex(value) ?? '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
        <input
          id={id}
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          disabled={disabled}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            const hex = normalizarHex(e.target.value);
            if (hex) {
              setError(false);
              onChange(hex);
            }
          }}
          onBlur={() => {
            const hex = normalizarHex(texto);
            if (hex) {
              setTexto(hex);
              return;
            }
            setError(true);
            setTexto(value);
          }}
          placeholder="#0b3d91"
          aria-invalid={error}
          className={cn(
            'focus-ring h-10 w-full min-w-0 rounded-lg border bg-surface px-3 font-mono text-sm uppercase text-ink-900 placeholder:normal-case placeholder:text-ink-300',
            error ? 'border-danger' : 'border-line-strong',
          )}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          Escribe un color en hexadecimal, por ejemplo #0B3D91.
        </p>
      ) : null}
    </div>
  );
}
