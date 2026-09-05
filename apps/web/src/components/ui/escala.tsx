'use client';

import { Angry, Frown, Laugh, Meh, Smile, Star, type LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type FormaDeEscala = 'faces' | 'stars' | 'numbers';

/** Las cinco caras, de peor a mejor. Solo tienen sentido con una escala de 5. */
const CARAS: LucideIcon[] = [Angry, Frown, Meh, Smile, Laugh];

/**
 * MARCAR UN VALOR EN UNA ESCALA. Una sola forma en todo el producto (Decision #136).
 *
 * ─── POR QUE ES COMPARTIDO ───
 *
 * Nacio dentro del cuestionario de encuestas y era la parte que mejor funcionaba: botones grandes
 * —se marcan con el pulgar, en un telefono, de pie en una bodega—, las cinco opciones a la vista a
 * la vez y los extremos escritos. Cuando llego la evaluacion de desempeno, la alternativa era
 * escribirlo otra vez: dos implementaciones de "elegir un numero" que se irian separando hasta que
 * la misma accion se sintiera distinta en dos pantallas del mismo producto.
 *
 * ─── LOS EXTREMOS SE ESCRIBEN, Y NO SIEMPRE DICEN LO MISMO ───
 *
 * Una cara sonriente se lee como "me gusto" o como "mucho", y en una encuesta de satisfaccion y en
 * una evaluacion de desempeno esas son cosas distintas. Por eso las palabras de los extremos las
 * pone quien usa el componente: "Muy mal / Muy bien" en una encuesta, "Muy por debajo /
 * Sobresaliente" al calificar a una persona.
 *
 * ─── LAS CARAS NO VALEN PARA TODO ───
 *
 * Para satisfaccion son perfectas. Para calificar el desempeno de una persona, no: convierten un
 * juicio profesional en un emoticono, y quien lo lee despues merece "3 de 5" y no una cara. Ahi se
 * usa `numbers`.
 */
export function Escala({
  max,
  forma = 'numbers',
  valor,
  onPick,
  extremos,
  disabled = false,
}: {
  max: number;
  forma?: FormaDeEscala;
  valor: number | null;
  onPick: (valor: number) => void;
  /** Las dos palabras de los extremos. */
  extremos: [string, string];
  disabled?: boolean;
}) {
  const escalones = Array.from({ length: max }, (_, indice) => indice + 1);
  const caras = forma === 'faces' && max === 5;

  return (
    <div>
      <div className={cn('flex gap-2', max > 5 ? 'flex-wrap' : '')}>
        {escalones.map((numero) => {
          const elegido = valor === numero;
          // En estrellas se rellenan todas las anteriores: es como se leen las estrellas.
          const relleno = forma === 'stars' && valor !== null && numero <= valor;
          const Cara = caras ? CARAS[numero - 1] : null;

          return (
            <button
              key={numero}
              type="button"
              disabled={disabled}
              aria-label={`${numero} de ${max}`}
              aria-pressed={elegido}
              onClick={() => onPick(numero)}
              className={cn(
                'focus-ring flex h-12 min-w-[48px] flex-1 items-center justify-center rounded-xl border transition-all duration-150',
                // MARCADO = RELLENO SOLIDO, no un tinte (2026-09-02).
                //
                // Un 10% de color sobre blanco marca bien un item de menu, donde solo hay uno
                // activo y esta siempre en el mismo sitio. En una fila de cinco botones iguales,
                // donde lo unico que se pregunta es CUAL elegiste, ese tinte se pierde: se veia el
                // borde y poco mas, y en el telefono de una bodega con mala luz, nada. Relleno
                // pleno y numero en blanco — se ve de un vistazo y a un metro.
                elegido || relleno
                  ? 'border-transparent shadow-btn'
                  : 'border-line bg-paper hover:border-line-strong hover:bg-surface',
                disabled && 'cursor-default opacity-70',
              )}
              style={
                elegido || relleno
                  ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)' }
                  : undefined
              }
            >
              {Cara ? (
                <Cara
                  className="h-6 w-6"
                  strokeWidth={elegido ? 2 : 1.5}
                  style={{ color: elegido ? '#ffffff' : 'var(--ink-500)' }}
                  aria-hidden="true"
                />
              ) : forma === 'stars' ? (
                <Star
                  className="h-6 w-6"
                  strokeWidth={1.75}
                  fill={relleno ? '#ffffff' : 'none'}
                  style={{ color: relleno ? '#ffffff' : 'var(--ink-300)' }}
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="text-base font-semibold tabular-nums"
                  style={{ color: elegido ? '#ffffff' : 'var(--ink-700)' }}
                >
                  {numero}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
        <span>{extremos[0]}</span>
        <span>{extremos[1]}</span>
      </div>
    </div>
  );
}

/**
 * CUMPLE / NO CUMPLE. Dos botones anchos y no un interruptor: un interruptor sugiere que hay un
 * valor por defecto, y aqui no responder es un estado distinto de responder "no".
 */
export function EscalaSiNo({
  valor,
  onPick,
  etiquetas = ['No cumple', 'Cumple'],
  disabled = false,
}: {
  valor: boolean | null;
  onPick: (valor: boolean) => void;
  etiquetas?: [string, string];
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {([false, true] as const).map((opcion, indice) => {
        const elegido = valor === opcion;
        return (
          <button
            key={String(opcion)}
            type="button"
            disabled={disabled}
            aria-pressed={elegido}
            onClick={() => onPick(opcion)}
            className={cn(
              'focus-ring h-12 flex-1 rounded-xl border text-sm transition-all duration-150',
              elegido ? 'border-transparent font-medium shadow-btn' : 'border-line bg-paper hover:border-line-strong hover:bg-surface',
              disabled && 'cursor-default opacity-70',
            )}
            style={
              elegido
                ? { backgroundColor: 'var(--brand-primary)', borderColor: 'var(--brand-primary)', color: '#ffffff' }
                : undefined
            }
          >
            {etiquetas[indice]}
          </button>
        );
      })}
    </div>
  );
}
