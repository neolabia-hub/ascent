'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, Plus, X } from 'lucide-react';
import type { QuestionPayloadClient } from '@/lib/catalog-api';
import { cn } from '@/components/ui/cn';
import { huecosDelEnunciado, OPTION_IDS } from './question-model';

/**
 * ESCRIBIR UNA PREGUNTA CON LA FORMA QUE VA A TENER (Decision #84).
 *
 * Antes esto era un formulario dentro de un cajon lateral de 420 px: "Enunciado" con su etiqueta
 * encima, las opciones como renglones de un campo de texto con un radio de 13 px al lado, y la
 * respuesta correcta decidida en ese radio. Lo dijo el cliente sin rodeos —*"esa interfaz de
 * editor no me gusta, en barra lateral"*— y el problema de fondo no era el ancho:
 *
 *   - escribir la pregunta es EL ACTO PRINCIPAL de la pantalla, no un recado lateral. Un cajon
 *     dice "esto es una cosa aparte" con su sola presencia;
 *   - lo que se escribia no se parecia a lo que iba a salir. Se revisaban veinte preguntas en un
 *     formulario y se publicaban sin haber visto ninguna.
 *
 * Ahora la pregunta se edita EXACTAMENTE con la pinta que tendra: el enunciado en el mismo
 * cuerpo y tamaño que leera el empleado, y las opciones como las mismas tarjetas de 60 px. Se
 * escribe encima del resultado.
 *
 * LA UNICA DIFERENCIA con la vista del aprendiz es deliberada: aqui SE VE cual es la correcta, y
 * se pinta en VERDE DE ACIERTO y no en el color de acento. Son dos cosas distintas —"esta es la
 * buena" y "esta es la que marco quien responde"— y si compartieran color, al revisar un examen
 * ajeno no habria forma de distinguirlas.
 */

export function QuestionCanvas({
  payload,
  onChange,
  disabled = false,
}: {
  payload: QuestionPayloadClient;
  onChange: (payload: QuestionPayloadClient) => void;
  disabled?: boolean;
}) {
  const set = (parcial: Partial<QuestionPayloadClient>) => onChange({ ...payload, ...parcial } as QuestionPayloadClient);

  const opciones = payload.options ?? [];
  const esCorrecta = (id: string) =>
    payload.qtype === 'SINGLE' ? payload.correctOptionId === id : (payload.correctOptionIds ?? []).includes(id);

  const marcar = (id: string) => {
    if (disabled) return;
    if (payload.qtype === 'SINGLE') {
      set({ correctOptionId: id });
      return;
    }
    const actuales = payload.correctOptionIds ?? [];
    set({ correctOptionIds: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id] });
  };

  const agregarOpcion = () => {
    const usados = new Set(opciones.map((option) => option.id));
    const siguiente = OPTION_IDS.find((id) => !usados.has(id));
    if (siguiente) set({ options: [...opciones, { id: siguiente, text: '' }] });
  };

  const quitarOpcion = (id: string) => {
    const restantes = opciones.filter((option) => option.id !== id);
    set({
      options: restantes,
      ...(payload.qtype === 'SINGLE'
        ? { correctOptionId: payload.correctOptionId === id ? restantes[0]?.id : payload.correctOptionId }
        : { correctOptionIds: (payload.correctOptionIds ?? []).filter((x) => x !== id) }),
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/*
        EL ENUNCIADO en el mismo cuerpo con el que se leera, y sin caja. Un campo con borde y
        etiqueta encima se lee como "un formulario"; sin borde, se lee como el examen que es.
        Crece con el texto: una pregunta larga no puede acabar en una ranura de dos lineas.
      */}
      <textarea
        value={payload.stem}
        disabled={disabled}
        onChange={(event) => {
          set({ stem: event.target.value });
          event.target.style.height = 'auto';
          event.target.style.height = `${event.target.scrollHeight}px`;
        }}
        ref={(node) => {
          if (node) {
            node.style.height = 'auto';
            node.style.height = `${node.scrollHeight}px`;
          }
        }}
        rows={1}
        maxLength={1000}
        placeholder="Escribe la pregunta"
        aria-label="Enunciado de la pregunta"
        className="focus-ring block w-full resize-none overflow-hidden rounded-lg border-2 border-transparent bg-transparent px-2 py-1 font-display text-xl font-semibold leading-snug text-ink-900 placeholder:text-ink-300 hover:border-line focus:border-line-strong lg:text-[26px]"
      />

      {payload.qtype === 'ESSAY' ? (
        <div className="mt-6 rounded-xl border-2 border-dashed border-line-strong bg-paper p-6 text-center">
          <p className="text-sm text-ink-500">
            Aqui escribira su respuesta con sus palabras. No se corrige sola: alguien tiene que calificarla.
          </p>
          <p className="mt-1 text-xs text-ink-300">La guia de correccion se escribe en el panel de la derecha.</p>
        </div>
      ) : null}

      {payload.qtype === 'TRUE_FALSE' ? (
        <ul className="mt-6 space-y-3">
          {[
            { id: 'true', text: 'Verdadero' },
            { id: 'false', text: 'Falso' },
          ].map((option) => {
            const correcta = payload.correctValue === (option.id === 'true');
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => set({ correctValue: option.id === 'true' })}
                  className={cn(
                    'focus-ring flex min-h-[60px] w-full items-center gap-3.5 rounded-xl border-2 px-4 py-3 text-left text-base transition-all duration-150',
                    correcta
                      ? 'border-ok bg-ok-soft text-ink-900'
                      : 'border-line-strong bg-surface text-ink-700 hover:border-line-strong hover:bg-paper',
                  )}
                >
                  <Marca correcta={correcta} />
                  <span className="flex-1">{option.text}</span>
                  {correcta ? <span className="text-xs font-medium uppercase tracking-wide text-ok">Correcta</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {payload.qtype === 'SINGLE' || payload.qtype === 'MULTI' ? (
        <>
          <p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-500">
            {payload.qtype === 'SINGLE' ? 'Opciones — pulsa la marca de la correcta' : 'Opciones — marca todas las correctas'}
          </p>
          <ul className="mt-3 space-y-3">
            {opciones.map((option, posicion) => {
              const correcta = esCorrecta(option.id);
              return (
                <li key={option.id} className="group relative">
                  <div
                    className={cn(
                      'flex min-h-[60px] w-full items-center gap-3.5 rounded-xl border-2 px-4 py-2.5 transition-colors duration-150',
                      correcta ? 'border-ok bg-ok-soft' : 'border-line-strong bg-surface',
                    )}
                  >
                    {/*
                      LA MARCA ES EL OBJETIVO, y ocupa 40 px. Antes era un radio de 13 px al lado
                      del campo: el objetivo mas pequeño de la pantalla, justo donde se decide lo
                      mas importante de la pregunta.
                    */}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => marcar(option.id)}
                      aria-pressed={correcta}
                      aria-label={`Marcar la opción ${(OPTION_IDS[posicion] ?? '').toUpperCase()} como correcta`}
                      title={correcta ? 'Es la correcta' : 'Marcar como correcta'}
                      className="focus-ring -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                    >
                      <Marca correcta={correcta} letra={(OPTION_IDS[posicion] ?? '').toUpperCase()} />
                    </button>

                    <input
                      value={option.text}
                      disabled={disabled}
                      maxLength={500}
                      placeholder={`Opcion ${(OPTION_IDS[posicion] ?? '').toUpperCase()}`}
                      aria-label={`Texto de la opción ${(OPTION_IDS[posicion] ?? '').toUpperCase()}`}
                      onChange={(event) =>
                        set({
                          options: opciones.map((row) =>
                            row.id === option.id ? { ...row, text: event.target.value } : row,
                          ),
                        })
                      }
                      className="focus-ring min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-900 placeholder:text-ink-300 focus:ring-0"
                    />

                    {correcta ? (
                      <span className="hidden shrink-0 text-xs font-medium uppercase tracking-wide text-ok sm:block">
                        Correcta
                      </span>
                    ) : null}

                    {/*
                      Quitar solo aparece al pasar por encima o al enfocar. Con seis opciones,
                      seis aspas permanentes convierten la lista en una barra de herramientas.
                    */}
                    {opciones.length > 2 && !disabled ? (
                      <button
                        type="button"
                        onClick={() => quitarOpcion(option.id)}
                        aria-label={`Quitar la opcion ${(OPTION_IDS[posicion] ?? '').toUpperCase()}`}
                        className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-300 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {!disabled && opciones.length < OPTION_IDS.length ? (
            <button
              type="button"
              onClick={agregarOpcion}
              className="focus-ring mt-3 flex min-h-[52px] w-full items-center gap-3.5 rounded-xl border-2 border-dashed border-line-strong px-4 text-left text-sm text-ink-500 transition-colors hover:border-[var(--brand-primary)] hover:text-ink-900"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong">
                <Plus size={15} />
              </span>
              Agregar opcion
            </button>
          ) : null}
        </>
      ) : null}

      {payload.qtype === 'FILL_BLANK' ? <EditorHuecos payload={payload} set={set} disabled={disabled} /> : null}
      {payload.qtype === 'ORDER' ? <EditorOrden payload={payload} set={set} disabled={disabled} /> : null}
      {payload.qtype === 'MATCH' ? <EditorParejas payload={payload} set={set} disabled={disabled} /> : null}
      {payload.qtype === 'NUMERIC' ? <EditorNumerica payload={payload} set={set} disabled={disabled} /> : null}
    </div>
  );
}

type Set = (parcial: Partial<QuestionPayloadClient>) => void;

/**
 * COMPLETAR HUECOS (Decision #86).
 *
 * El hueco vive DENTRO del enunciado como `{{1}}`, asi que no puede editarse en una lista aparte
 * sin que las dos cosas se desincronicen. Aqui se hace lo contrario: "Agregar hueco" ESCRIBE la
 * marca al final del enunciado, y la lista de abajo solo pregunta que respuestas valen. Si
 * alguien borra un `{{2}}` del texto a mano, el hueco huerfano se marca en rojo en vez de
 * dejarlo pasar y que el servidor rechace el guardado con lo escrito ya perdido.
 */
function EditorHuecos({
  payload,
  set,
  disabled,
}: {
  payload: QuestionPayloadClient;
  set: Set;
  disabled: boolean;
}) {
  const enElTexto = huecosDelEnunciado(payload.stem);
  const blanks = payload.blanks ?? [];

  const agregarHueco = () => {
    // Se numera desde el mayor que haya: reciclar un numero borrado confundiria las respuestas.
    const siguiente = String(Math.max(0, ...blanks.map((b) => Number(b.id) || 0), ...enElTexto.map(Number)) + 1);
    set({
      stem: `${payload.stem.trimEnd()} {{${siguiente}}}`,
      blanks: [...blanks, { id: siguiente, accept: [''] }],
    });
  };

  return (
    <div className="mt-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Respuestas que valen</p>
          <p className="mt-1 text-xs text-ink-500">
            Se ignoran tildes y mayusculas: &quot;arnes&quot; y &quot;arn&eacute;s&quot; cuentan igual.
          </p>
        </div>
        {!disabled && enElTexto.length < 10 ? (
          <button
            type="button"
            onClick={agregarHueco}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-1.5 text-sm text-ink-500 transition-colors hover:border-[var(--brand-primary)] hover:text-ink-900"
          >
            <Plus size={14} />
            Agregar hueco
          </button>
        ) : null}
      </div>

      {enElTexto.length === 0 ? (
        <p className="mt-4 rounded-xl border-2 border-dashed border-line-strong p-6 text-center text-sm text-ink-500">
          El enunciado no tiene ningun hueco todavia. Pulsa &quot;Agregar hueco&quot; y se escribe solo.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {enElTexto.map((id, posicion) => {
            const blank = blanks.find((row) => row.id === id);
            const acepta = blank?.accept ?? [''];
            return (
              <li key={id} className="rounded-xl border-2 border-line-strong bg-surface p-3.5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Hueco {posicion + 1}
                  <span className="ml-1.5 font-mono font-normal normal-case tracking-normal text-ink-300">
                    {`{{${id}}}`}
                  </span>
                </p>
                <div className="space-y-2">
                  {acepta.map((valor, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={valor}
                        disabled={disabled}
                        maxLength={200}
                        placeholder={i === 0 ? 'La respuesta' : 'Otra forma que tambien vale'}
                        aria-label={`Respuesta ${i + 1} valida para el hueco ${posicion + 1}`}
                        onChange={(event) =>
                          set({
                            blanks: conHueco(blanks, id, acepta.map((v, j) => (j === i ? event.target.value : v))),
                          })
                        }
                        className="focus-ring min-h-[40px] flex-1 rounded-lg border border-line-strong bg-paper px-3 text-sm text-ink-900 placeholder:text-ink-300"
                      />
                      {acepta.length > 1 && !disabled ? (
                        <button
                          type="button"
                          onClick={() =>
                            set({ blanks: conHueco(blanks, id, acepta.filter((_, j) => j !== i)) })
                          }
                          aria-label={`Quitar la respuesta ${i + 1} del hueco ${posicion + 1}`}
                          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-danger-soft hover:text-danger"
                        >
                          <X size={15} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {!disabled && acepta.length < 10 ? (
                  <button
                    type="button"
                    onClick={() => set({ blanks: conHueco(blanks, id, [...acepta, '']) })}
                    className="focus-ring mt-2 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"
                  >
                    <Plus size={13} />
                    Otra forma valida
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Un hueco que ya no esta en el texto no se borra solo: se avisa y se ofrece quitarlo. */}
      {blanks.some((blank) => !enElTexto.includes(blank.id)) ? (
        <div className="mt-3 rounded-lg border border-danger bg-danger-soft px-3.5 py-2.5">
          <p className="text-sm text-danger">
            Hay respuestas guardadas para huecos que ya no aparecen en el enunciado.
          </p>
          {!disabled ? (
            <button
              type="button"
              onClick={() => set({ blanks: blanks.filter((blank) => enElTexto.includes(blank.id)) })}
              className="focus-ring mt-1 text-xs font-medium text-danger underline"
            >
              Quitarlas
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function conHueco(blanks: Array<{ id: string; accept: string[] }>, id: string, accept: string[]) {
  return blanks.some((blank) => blank.id === id)
    ? blanks.map((blank) => (blank.id === id ? { ...blank, accept } : blank))
    : [...blanks, { id, accept }];
}

/**
 * ORDENAR LOS PASOS (Decision #86).
 *
 * Se escriben EN SU ORDEN CORRECTO, que es como se piensa un procedimiento, y las flechas lo
 * reordenan. Al servirlo se baraja siempre —lo fuerza el servidor—, asi que aqui no hay que
 * preocuparse de que se vea la respuesta: esta lista ES la respuesta, y por eso se numera.
 */
function EditorOrden({ payload, set, disabled }: { payload: QuestionPayloadClient; set: Set; disabled: boolean }) {
  const items = payload.items ?? [];

  const mover = (indice: number, salto: -1 | 1) => {
    const destino = indice + salto;
    if (destino < 0 || destino >= items.length) return;
    const copia = [...items];
    [copia[indice], copia[destino]] = [copia[destino] as (typeof items)[number], copia[indice] as (typeof items)[number]];
    set({ items: copia, correctOrder: copia.map((item) => item.id) });
  };

  return (
    <div className="mt-7">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Los pasos, en su orden correcto</p>
      <p className="mt-1 text-xs text-ink-500">
        Quien responda los recibira barajados y tendra que ponerlos asi.
      </p>

      <ul className="mt-4 space-y-2.5">
        {items.map((item, posicion) => (
          <li key={item.id} className="group flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ok-soft text-sm font-semibold tabular-nums text-ok">
              {posicion + 1}
            </span>
            <div className="flex min-h-[56px] flex-1 items-center gap-2 rounded-xl border-2 border-line-strong bg-surface px-3.5">
              <input
                value={item.text}
                disabled={disabled}
                maxLength={500}
                placeholder={`Paso ${posicion + 1}`}
                aria-label={`Texto del paso ${posicion + 1}`}
                onChange={(event) =>
                  set({
                    items: items.map((row) => (row.id === item.id ? { ...row, text: event.target.value } : row)),
                  })
                }
                className="focus-ring min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-900 placeholder:text-ink-300 focus:ring-0"
              />
              {!disabled ? (
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => mover(posicion, -1)}
                    disabled={posicion === 0}
                    aria-label={`Subir el paso ${posicion + 1}`}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-paper disabled:opacity-25"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(posicion, 1)}
                    disabled={posicion === items.length - 1}
                    aria-label={`Bajar el paso ${posicion + 1}`}
                    className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-paper disabled:opacity-25"
                  >
                    <ArrowDown size={15} />
                  </button>
                  {items.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const restantes = items.filter((row) => row.id !== item.id);
                        set({ items: restantes, correctOrder: restantes.map((row) => row.id) });
                      }}
                      aria-label={`Quitar el paso ${posicion + 1}`}
                      className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:bg-danger-soft hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!disabled && items.length < 10 ? (
        <button
          type="button"
          onClick={() => {
            const usados = new Set(items.map((item) => item.id));
            const siguiente = OPTION_IDS.find((id) => !usados.has(id));
            if (!siguiente) return;
            const nuevos = [...items, { id: siguiente, text: '' }];
            set({ items: nuevos, correctOrder: nuevos.map((item) => item.id) });
          }}
          className="focus-ring mt-2.5 ml-12 flex min-h-[52px] w-[calc(100%-3rem)] items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 text-sm text-ink-500 transition-colors hover:border-[var(--brand-primary)] hover:text-ink-900"
        >
          <Plus size={15} />
          Agregar paso
        </button>
      ) : null}
    </div>
  );
}

/**
 * EMPAREJAR (Decision #86).
 *
 * Se escriben las parejas YA UNIDAS, en una fila cada una: es como se piensan ("la señal de alto
 * significa detenerse por completo"). El barajado de la columna derecha lo hace el servidor al
 * servir el intento, no esta pantalla.
 */
function EditorParejas({ payload, set, disabled }: { payload: QuestionPayloadClient; set: Set; disabled: boolean }) {
  const pairs = payload.pairs ?? [];

  const cambiar = (id: string, lado: 'left' | 'right', valor: string) =>
    set({ pairs: pairs.map((pair) => (pair.id === id ? { ...pair, [lado]: valor } : pair)) });

  return (
    <div className="mt-7">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Las parejas, ya unidas</p>
      <p className="mt-1 text-xs text-ink-500">
        La columna de la derecha le llegara barajada, para que no se resuelva por posicion.
      </p>

      <ul className="mt-4 space-y-2.5">
        {pairs.map((pair, posicion) => (
          <li key={pair.id} className="group flex items-center gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <input
                value={pair.left}
                disabled={disabled}
                maxLength={300}
                placeholder="Señal de alto"
                aria-label={`Lado izquierdo de la pareja ${posicion + 1}`}
                onChange={(event) => cambiar(pair.id, 'left', event.target.value)}
                className="focus-ring min-h-[56px] rounded-xl border-2 border-line-strong bg-surface px-3.5 text-base text-ink-900 placeholder:text-ink-300"
              />
              <span aria-hidden="true" className="hidden items-center justify-center text-ink-300 sm:flex">
                <ArrowRight size={16} />
              </span>
              <input
                value={pair.right}
                disabled={disabled}
                maxLength={300}
                placeholder="Detenerse por completo"
                aria-label={`Lado derecho de la pareja ${posicion + 1}`}
                onChange={(event) => cambiar(pair.id, 'right', event.target.value)}
                className="focus-ring min-h-[56px] rounded-xl border-2 border-ok bg-ok-soft px-3.5 text-base text-ink-900 placeholder:text-ink-300"
              />
            </div>
            {pairs.length > 2 && !disabled ? (
              <button
                type="button"
                onClick={() => set({ pairs: pairs.filter((row) => row.id !== pair.id) })}
                aria-label={`Quitar la pareja ${posicion + 1}`}
                className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-300 opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={15} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {!disabled && pairs.length < 10 ? (
        <button
          type="button"
          onClick={() =>
            set({
              pairs: [...pairs, { id: String(Math.max(0, ...pairs.map((p) => Number(p.id) || 0)) + 1), left: '', right: '' }],
            })
          }
          className="focus-ring mt-2.5 flex min-h-[52px] w-full items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 text-sm text-ink-500 transition-colors hover:border-[var(--brand-primary)] hover:text-ink-900"
        >
          <Plus size={15} />
          Agregar pareja
        </button>
      ) : null}
    </div>
  );
}

/**
 * RESPUESTA NUMERICA (Decision #86).
 *
 * La TOLERANCIA se enseña resuelta —"se acepta de 1,4 a 1,6"— y no como un numero suelto: quien
 * la escribe esta pensando en el margen que quiere dar, no en hacer dos restas.
 */
function EditorNumerica({ payload, set, disabled }: { payload: QuestionPayloadClient; set: Set; disabled: boolean }) {
  const numero = payload.correctNumber ?? 0;
  const margen = payload.tolerance ?? 0;

  return (
    <div className="mt-7">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">La respuesta correcta</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-700">Número</span>
          <input
            type="number"
            step="any"
            disabled={disabled}
            value={Number.isFinite(numero) ? numero : ''}
            onChange={(event) => set({ correctNumber: Number(event.target.value) })}
            className="focus-ring min-h-[56px] w-full rounded-xl border-2 border-ok bg-ok-soft px-3.5 text-lg font-semibold text-ink-900"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-700">Margen (±)</span>
          <input
            type="number"
            step="any"
            min={0}
            disabled={disabled}
            value={margen}
            onChange={(event) => set({ tolerance: Math.max(0, Number(event.target.value)) })}
            className="focus-ring min-h-[56px] w-full rounded-xl border-2 border-line-strong bg-surface px-3.5 text-lg text-ink-900"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink-700">Unidad</span>
          <input
            disabled={disabled}
            maxLength={20}
            placeholder="m, kg, %"
            value={payload.unit ?? ''}
            onChange={(event) => set({ unit: event.target.value || undefined })}
            className="focus-ring min-h-[56px] w-full rounded-xl border-2 border-line-strong bg-surface px-3.5 text-lg text-ink-900 placeholder:text-ink-300"
          />
        </label>
      </div>

      <p className="mt-3 rounded-lg bg-paper px-4 py-3 text-sm text-ink-700">
        {margen > 0
          ? `Se acepta cualquier valor entre ${redondear(numero - margen)} y ${redondear(numero + margen)}${payload.unit ? ` ${payload.unit}` : ''}.`
          : `Solo se acepta ${redondear(numero)}${payload.unit ? ` ${payload.unit}` : ''} exacto.`}
      </p>
    </div>
  );
}

/** Sin decimales de coma flotante a la vista: 1.5000000000000002 no es una respuesta. */
function redondear(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** La marca de "esta es la correcta". Verde de acierto, nunca el color de acento. */
function Marca({ correcta, letra }: { correcta: boolean; letra?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors',
        correcta ? 'border-ok bg-ok text-white' : 'border-line-strong text-ink-300',
      )}
    >
      {correcta ? <Check className="h-4 w-4" strokeWidth={3} /> : (letra ?? '')}
    </span>
  );
}

