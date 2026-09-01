'use client';

import { Angry, Frown, Meh, Smile, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SurveyQuestion } from '@/lib/surveys-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

export type Respuestas = Record<string, number | boolean | string>;

/**
 * LA ENCUESTA, TAL COMO LA VE QUIEN LA RESPONDE (Decision #119).
 *
 * ─── UNA SOLA PIEZA PARA LOS DOS SITIOS ───
 *
 * La usan el REPRODUCTOR —donde se responde de verdad— y la VISTA PREVIA del constructor. Nunca
 * duplicar esto: si fueran dos, la vista previa mentiria en cuanto una cambiara, y quien disena
 * publicaria confiando en ella. Es la misma regla que ya rige el escenario del examen.
 *
 * ─── SE RESPONDE CON EL DEDO, NO LEYENDO ───
 *
 * Quien contesta esto es un auxiliar de bodega con el telefono en la mano, de pie, al terminar una
 * formacion. Por eso las escalas son objetos grandes que se tocan —caras, estrellas, numeros de
 * 44 px— y no una fila de radios de 16. Un control que exige puntería se responde al azar.
 *
 * ─── TODO EN UNA PANTALLA, no una pregunta por vez ───
 *
 * Al reves que el examen, y a proposito: un examen esconde las preguntas para que no se comparen y
 * para que se piense cada una. Una encuesta de cinco preguntas es lo contrario — se quiere que se
 * vea entera y que se acabe en treinta segundos. Partirla en cinco pantallas la convierte en un
 * tramite, y de un tramite la gente se sale.
 */
export function SurveyRunner({
  questions,
  value,
  onChange,
  onSubmit,
  submitting = false,
  faltan = [],
  readOnly = false,
}: {
  questions: SurveyQuestion[];
  value: Respuestas;
  onChange: (respuestas: Respuestas) => void;
  onSubmit?: () => void;
  submitting?: boolean;
  /** Textos de las obligatorias que faltan. Los calcula quien llama, con la regla del servidor. */
  faltan?: string[];
  /** En la vista previa se ve y se toca, pero no se envia nada. */
  readOnly?: boolean;
}) {
  const responder = (id: string, respuesta: number | boolean | string) => onChange({ ...value, [id]: respuesta });

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="space-y-5">
        {questions.map((pregunta, indice) => (
          <section
            key={pregunta.id}
            className="reading-enter rounded-2xl border border-line bg-surface p-5 shadow-card"
            style={{ animationDelay: `${Math.min(indice, 6) * 50}ms` }}
          >
            <p className="text-[15px] font-medium leading-snug text-ink-900">
              {pregunta.text || 'Pregunta sin texto'}
              {/*
                LO OPCIONAL SE DICE, lo obligatorio no se marca. Al reves de la costumbre: si casi
                todo es obligatorio, poner un asterisco en casi todo no informa de nada — lo que
                informa es senalar la excepcion.
              */}
              {!pregunta.required ? <span className="ml-1.5 text-xs font-normal text-ink-500">(opcional)</span> : null}
            </p>

            <div className="mt-3.5">
              {pregunta.kind === 'SCALE' ? (
                <Escala
                  pregunta={pregunta}
                  valor={typeof value[pregunta.id] === 'number' ? (value[pregunta.id] as number) : null}
                  onPick={(numero) => responder(pregunta.id, numero)}
                />
              ) : pregunta.kind === 'YES_NO' ? (
                <SiNo
                  valor={typeof value[pregunta.id] === 'boolean' ? (value[pregunta.id] as boolean) : null}
                  onPick={(booleano) => responder(pregunta.id, booleano)}
                />
              ) : pregunta.kind === 'CHOICE' ? (
                <Opciones
                  opciones={pregunta.options}
                  valor={typeof value[pregunta.id] === 'string' ? (value[pregunta.id] as string) : null}
                  onPick={(opcion) => responder(pregunta.id, opcion)}
                />
              ) : (
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={typeof value[pregunta.id] === 'string' ? (value[pregunta.id] as string) : ''}
                  onChange={(e) => responder(pregunta.id, e.target.value)}
                  placeholder="Escribe aqui..."
                  className="focus-ring w-full resize-y rounded-xl border border-line bg-paper px-3.5 py-3 text-[15px] text-ink-900 placeholder:text-ink-300"
                />
              )}
            </div>
          </section>
        ))}
      </div>

      {faltan.length > 0 ? (
        <div role="alert" className="animate-card-in mt-4 rounded-xl bg-warn-soft px-4 py-3">
          <p className="text-sm font-medium text-ink-900">Falta responder:</p>
          {/* Con el TEXTO de la pregunta, no "faltan 2": si no se dice cual, hay que releer todo. */}
          <ul className="mt-1 list-inside list-disc text-sm text-ink-700">
            {faltan.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {onSubmit && !readOnly ? (
        <Button size="lg" glow className="mt-5 w-full" loading={submitting} onClick={onSubmit}>
          Enviar
        </Button>
      ) : null}
    </div>
  );
}

/** Las caras, de peor a mejor. Iconos y NUNCA emoji: regla dura del sistema. */
const CARAS = [Angry, Frown, Meh, Smile, ThumbsUp];

/**
 * LA ESCALA. El dato guardado es el mismo numero en las tres formas, asi que se promedian juntas.
 *
 * `stars` se rellenan HASTA la elegida —cuatro estrellas significa cuatro, no la cuarta— porque es
 * lo que la gente ya sabe de otras aplicaciones. Las caras no se acumulan: cada una es un estado
 * distinto, y encender tres caras a la vez no querria decir nada.
 */
function Escala({
  pregunta,
  valor,
  onPick,
}: {
  pregunta: SurveyQuestion;
  valor: number | null;
  onPick: (valor: number) => void;
}) {
  const escalones = Array.from({ length: pregunta.scaleMax }, (_, i) => i + 1);
  const caras = pregunta.display === 'faces' && pregunta.scaleMax === 5;

  return (
    <div>
      <div className={cn('flex gap-2', pregunta.scaleMax > 5 ? 'flex-wrap' : '')}>
        {escalones.map((numero) => {
          const elegido = valor === numero;
          const relleno = pregunta.display === 'stars' && valor !== null && numero <= valor;
          const Cara = caras ? CARAS[numero - 1] : null;

          return (
            <button
              key={numero}
              type="button"
              aria-label={`${numero} de ${pregunta.scaleMax}`}
              aria-pressed={elegido}
              onClick={() => onPick(numero)}
              className={cn(
                'focus-ring flex h-12 min-w-[48px] flex-1 items-center justify-center rounded-xl border transition-all duration-150',
                elegido || relleno ? 'border-transparent' : 'border-line bg-paper hover:border-line-strong',
              )}
              style={
                elegido || relleno
                  ? { backgroundColor: 'var(--primary-soft)', borderColor: 'var(--brand-primary)' }
                  : undefined
              }
            >
              {Cara ? (
                <Cara
                  className="h-6 w-6"
                  strokeWidth={elegido ? 2 : 1.5}
                  style={{ color: elegido ? 'var(--brand-primary)' : 'var(--ink-500)' }}
                  aria-hidden="true"
                />
              ) : pregunta.display === 'stars' ? (
                <Star
                  className="h-6 w-6"
                  strokeWidth={1.75}
                  fill={relleno ? 'var(--brand-primary)' : 'none'}
                  style={{ color: relleno ? 'var(--brand-primary)' : 'var(--ink-300)' }}
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="text-base font-semibold tabular-nums"
                  style={{ color: elegido ? 'var(--brand-primary)' : 'var(--ink-700)' }}
                >
                  {numero}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/*
        LOS EXTREMOS, ESCRITOS. Sin ellos una cara sonriente puede leerse como "me gusto" o como
        "mucho", y en una pregunta de cantidad son cosas distintas. Dos palabras lo resuelven.
      */}
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-500">
        <span>{pregunta.display === 'numbers' ? 'Nada' : 'Muy mal'}</span>
        <span>{pregunta.display === 'numbers' ? 'Mucho' : 'Muy bien'}</span>
      </div>
    </div>
  );
}

function SiNo({ valor, onPick }: { valor: boolean | null; onPick: (valor: boolean) => void }) {
  return (
    <div className="flex gap-2.5">
      <Boton elegido={valor === true} onClick={() => onPick(true)}>
        <ThumbsUp className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        Si
      </Boton>
      <Boton elegido={valor === false} onClick={() => onPick(false)}>
        <ThumbsDown className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        No
      </Boton>
    </div>
  );
}

function Opciones({
  opciones,
  valor,
  onPick,
}: {
  opciones: string[];
  valor: string | null;
  onPick: (valor: string) => void;
}) {
  if (opciones.length === 0) {
    return <p className="text-sm text-ink-500">Esta pregunta todavia no tiene opciones.</p>;
  }
  return (
    <div className="space-y-2">
      {opciones.map((opcion) => (
        <Boton key={opcion} elegido={valor === opcion} onClick={() => onPick(opcion)} ancho>
          {opcion}
        </Boton>
      ))}
    </div>
  );
}

/** Un objeto de 48 px que se toca con el pulgar, no un radio de 16 que exige punteria. */
function Boton({
  elegido,
  onClick,
  ancho = false,
  children,
}: {
  elegido: boolean;
  onClick: () => void;
  ancho?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onClick}
      className={cn(
        'focus-ring flex h-12 items-center justify-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition-all duration-150',
        ancho ? 'w-full justify-start text-left' : 'flex-1',
        elegido ? 'border-transparent' : 'border-line bg-paper text-ink-700 hover:border-line-strong',
      )}
      style={elegido ? { backgroundColor: 'var(--primary-soft)', borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * LO QUE FALTA POR RESPONDER. Espejo de `loQueFalta` del servidor.
 *
 * Se repite aqui para poder avisar ANTES de enviar —que es donde sirve— y el servidor lo vuelve a
 * comprobar, porque es quien no se puede saltar. Si los dos se separaran, quien falla es el
 * servidor: se veria como un envio rechazado, no como un dato malo guardado.
 */
export function loQueFaltaEnCliente(questions: SurveyQuestion[], respuestas: Respuestas): string[] {
  return questions
    .filter((pregunta) => {
      if (!pregunta.required) return false;
      const valor = respuestas[pregunta.id];
      if (valor === undefined || valor === null || valor === '') return true;
      if (pregunta.kind === 'SCALE') return typeof valor !== 'number' || valor < 1 || valor > pregunta.scaleMax;
      if (pregunta.kind === 'YES_NO') return typeof valor !== 'boolean';
      return false;
    })
    .map((pregunta) => pregunta.text);
}
