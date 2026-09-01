'use client';

import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  createSurvey,
  deleteSurvey,

  listSurveys,
  saveSurvey,
  type SurveyKind,
  type SurveyQuestion,
  type SurveyTemplate,
} from '@/lib/surveys-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { SurveyRunner, type Respuestas } from '@/components/modules/learner/survey-runner';

/**
 * LAS ENCUESTAS (Decision #114).
 *
 * ─── POR QUE ESTA PANTALLA ERA URGENTE ───
 *
 * El tipo "Capacitacion del plan" trae `requiresSurvey: true` desde el Sprint 1, y la regla de
 * publicacion lo exige de verdad desde que se conecto. Pero **no habia forma de crear una
 * encuesta**: ni pantalla, ni endpoint, ni una sola fila en la tabla. El resultado era que ese
 * tipo —el que sostiene el indicador del plan anual— NO SE PODIA PUBLICAR, y el mensaje que salia
 * ("agrega una encuesta antes de publicar") pedia algo imposible.
 *
 * ─── LAS DOS CLASES NO SON LO MISMO ───
 *
 * SATISFACCION la responde quien se formo, al terminar: si sirvio, si se entendio. Es el nivel 1
 * de Kirkpatrick y lo que revisan BASC e ISO.
 *
 * EFICACIA la responde SU JEFE, semanas despues: ¿cambio algo en como trabaja? Es el nivel 3, y es
 * la unica que mide si la capacitacion sirvio de algo. Por eso lleva un plazo en dias.
 *
 * Se ven separadas en la lista a proposito: mezclarlas haria que alguien mandara a un jefe una
 * encuesta escrita para el alumno, y "¿le gusto la capacitacion?" no se le puede preguntar a un
 * jefe sobre otra persona.
 */
export default function EncuestasPage() {
  const { showToast } = useToast();
  const [plantillas, setPlantillas] = useState<SurveyTemplate[] | null>(null);
  const [abierta, setAbierta] = useState<SurveyTemplate | null>(null);

  useEffect(() => {
    void recargar();
  }, []);

  async function recargar() {
    setPlantillas(await listSurveys().catch(() => []));
  }

  async function crear(kind: SurveyKind) {
    // Sin `questions`: el servidor siembra las de manual segun la clase. Una encuesta que nace
    // vacia produce encuestas de una sola pregunta, que no miden nada.
    const creada = await createSurvey({
      name: kind === 'EFFICACY' ? 'Eficacia de la formacion' : 'Satisfaccion de la formacion',
      kind,
    }).catch(() => null);
    if (!creada) {
      showToast({ kind: 'danger', title: 'No se pudo crear' });
      return;
    }
    await recargar();
    setAbierta(creada);
  }

  if (abierta) {
    return (
      <Editor
        plantilla={abierta}
        onCerrar={() => {
          setAbierta(null);
          void recargar();
        }}
      />
    );
  }

  const de = (kind: SurveyKind) => (plantillas ?? []).filter((p) => p.kind === kind);

  return (
    <div className="max-w-3xl">
      <Link href="/configuracion" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Configuracion
      </Link>
      <h1 className="font-display text-[28px] font-semibold text-ink-900">Encuestas</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        Se agregan a una formacion como una pieza mas de su contenido. Los tipos que las exigen se marcan en{' '}
        <Link href="/configuracion/tipos-de-formacion" className="focus-ring font-medium text-primary hover:underline">
          Tipos de formacion
        </Link>
        .
      </p>

      {plantillas === null ? (
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      ) : (
        <div className="mt-6 space-y-8">
          <Grupo
            titulo="De satisfaccion"
            detalle="La responde quien se formo, al terminar. Es la evaluacion de reaccion que revisan BASC e ISO."
            filas={de('SATISFACTION')}
            onCrear={() => void crear('SATISFACTION')}
            onAbrir={setAbierta}
          />
          <Grupo
            titulo="De eficacia"
            detalle="La responde su jefe semanas despues. Mide si lo aprendido se aplica en el puesto."
            filas={de('EFFICACY')}
            onCrear={() => void crear('EFFICACY')}
            onAbrir={setAbierta}
          />
        </div>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  detalle,
  filas,
  onCrear,
  onAbrir,
}: {
  titulo: string;
  detalle: string;
  filas: SurveyTemplate[];
  onCrear: () => void;
  onAbrir: (plantilla: SurveyTemplate) => void;
}) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink-900">{titulo}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{detalle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onCrear}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Nueva
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {filas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-500">
            Todavia no hay ninguna.
          </p>
        ) : (
          filas.map((fila) => (
            <button
              key={fila.id}
              type="button"
              onClick={() => onAbrir(fila)}
              className="focus-ring flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-semibold text-ink-900">{fila.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {fila.questions.length} pregunta{fila.questions.length === 1 ? '' : 's'} · version {fila.version}
                  {fila.kind === 'EFFICACY' && fila.scheduledDaysAfter ? ` · a los ${fila.scheduledDaysAfter} dias` : ''}
                </p>
              </div>
              {fila.active ? null : (
                <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink-500">Inactiva</span>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}

/** Como se llama cada tipo de pregunta, y que hace con el resultado. */
const TIPOS = [
  { valor: 'SCALE' as const, label: 'Escala 1 a 5', nota: 'Se promedia. Es lo unico que produce un indicador.' },
  { valor: 'YES_NO' as const, label: 'Si / No', nota: 'Un "no" marca la encuesta como negativa, aunque el resto puntue alto.' },
  {
    valor: 'CHOICE' as const,
    label: 'Una opcion entre varias',
    nota: 'No se promedia: sirve para segmentar, no para medir. Se cuenta por opcion.',
  },
  { valor: 'TEXT' as const, label: 'Texto libre', nota: 'No se promedia. Es donde aparece lo que nadie penso preguntar.' },
];

function Editor({ plantilla, onCerrar }: { plantilla: SurveyTemplate; onCerrar: () => void }) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState(plantilla.name);
  const [preguntas, setPreguntas] = useState<SurveyQuestion[]>(plantilla.questions);
  const [dias, setDias] = useState<number>(plantilla.scheduledDaysAfter ?? 30);
  const [activa, setActiva] = useState(plantilla.active);
  const [guardando, setGuardando] = useState(false);
  /** Lo que se responde en la vista previa. No se guarda: es para ver como se comporta. */
  const [ensayo, setEnsayo] = useState<Respuestas>({});

  function actualizar(indice: number, cambio: Partial<SurveyQuestion>) {
    setPreguntas((previas) => previas.map((p, i) => (i === indice ? { ...p, ...cambio } : p)));
  }

  function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= preguntas.length) return;
    setPreguntas((previas) => {
      const copia = [...previas];
      const [movida] = copia.splice(indice, 1);
      if (movida) copia.splice(destino, 0, movida);
      return copia;
    });
  }

  async function guardar() {
    setGuardando(true);
    try {
      await saveSurvey(plantilla.id, {
        name: nombre,
        kind: plantilla.kind,
        questions: preguntas,
        scheduledDaysAfter: plantilla.kind === 'EFFICACY' ? dias : null,
        active: activa,
      });
      showToast({ kind: 'success', title: 'Guardado' });
      onCerrar();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar',
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <button onClick={onCerrar} className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Encuestas
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field htmlFor="s-name" label="Nombre" className="min-w-[260px] flex-1">
          <Input id="s-name" value={nombre} maxLength={160} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-danger"
            aria-label="Borrar encuesta"
            title="Borrar encuesta"
            onClick={async () => {
              try {
                await deleteSurvey(plantilla.id);
                onCerrar();
              } catch (error) {
                showToast({
                  kind: 'danger',
                  title: 'No se pudo borrar',
                  description: error instanceof ApiError ? error.message : undefined,
                });
              }
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button onClick={() => void guardar()} loading={guardando} glow>
            Guardar
          </Button>
        </div>
      </div>

      {plantilla.kind === 'EFFICACY' ? (
        <div className="card mt-5 p-4">
          <Field
            htmlFor="s-dias"
            label="Se le pide al jefe a los"
            hint="Antes de un mes nadie ha tenido ocasion de aplicar nada, y por eso 30 es el valor de manual."
          >
            <div className="flex items-center gap-2">
              <Input
                id="s-dias"
                type="number"
                min={1}
                max={365}
                className="w-28"
                value={dias}
                onChange={(e) => setDias(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
              />
              <span className="text-sm text-ink-500">dias de terminada la formacion</span>
            </div>
          </Field>
        </div>
      ) : null}

      {/*
        EL AVISO DE LA VERSION. Cambiar el texto de una pregunta SUBE la version, y lo ya respondido
        se queda apuntando a la anterior: por eso una respuesta de hace un ano sigue explicandose.
        Se dice aqui porque es la duda inmediata de quien va a corregir una redaccion.
      */}
      <p className="mt-5 rounded-lg border border-line bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink-700">
        Cambiar las preguntas crea una version nueva. Lo ya respondido conserva la version con la que se
        contesto, asi que las respuestas viejas siguen queriendo decir lo que decian.
      </p>

      {/*
        DOS COLUMNAS: lo que se edita y COMO SE VE (Decision #119).

        La vista previa usa el MISMO componente que el reproductor (`SurveyRunner`), no una
        imitacion: si fueran dos implementaciones, esta mentiria en cuanto una cambiara, y quien
        disena publicaria confiando en ella. Es la misma regla que ya rige el escenario del examen.

        Y es viva: se toca, se responden las escalas, se ve el aviso de lo que falta. Sin eso no se
        descubre que una pregunta de diez escalones no cabe en un telefono hasta que la responde
        alguien de bodega.
      */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
        {preguntas.map((pregunta, indice) => (
          <div key={pregunta.id} className="card p-4">
            <div className="flex items-start gap-3">
              {/*
                SUBIR Y BAJAR, CON DOS FLECHAS (Decision #120).

                Habia un solo boton con un icono de agarre girado, y no se entendia: parecia que se
                arrastraba y solo subia. El orden importa —una encuesta que empieza por la pregunta
                abierta se abandona— asi que el control tiene que ser obvio.

                Flechas y no arrastrar: son cuatro o cinco preguntas, y arrastrar en una lista corta
                es mas trabajo que pulsar. Ademas arrastrar no funciona con teclado.
              */}
              <div className="flex shrink-0 flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => mover(indice, -1)}
                  disabled={indice === 0}
                  aria-label={`Subir "${pregunta.text || 'la pregunta'}"`}
                  title="Subir"
                  className="focus-ring rounded-lg border border-line p-1 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 disabled:opacity-25"
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
                <span className="text-center text-[11px] font-semibold tabular-nums text-ink-300">{indice + 1}</span>
                <button
                  type="button"
                  onClick={() => mover(indice, 1)}
                  disabled={indice === preguntas.length - 1}
                  aria-label={`Bajar "${pregunta.text || 'la pregunta'}"`}
                  title="Bajar"
                  className="focus-ring rounded-lg border border-line p-1 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 disabled:opacity-25"
                >
                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <Input
                  value={pregunta.text}
                  maxLength={300}
                  placeholder="Escribe la pregunta"
                  onChange={(e) => actualizar(indice, { text: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    aria-label="Tipo de pregunta"
                    className="w-44"
                    value={pregunta.kind}
                    onChange={(e) => actualizar(indice, { kind: e.target.value as SurveyQuestion['kind'] })}
                  >
                    {TIPOS.map((tipo) => (
                      <option key={tipo.valor} value={tipo.valor}>
                        {tipo.label}
                      </option>
                    ))}
                  </Select>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={pregunta.required}
                      onChange={(e) => actualizar(indice, { required: e.target.checked })}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    Obligatoria
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreguntas((previas) => previas.filter((_, i) => i !== indice))}
                    disabled={preguntas.length === 1}
                    aria-label="Quitar la pregunta"
                    title={preguntas.length === 1 ? 'Una encuesta necesita al menos una pregunta' : 'Quitar'}
                    className="focus-ring ml-auto rounded-lg p-1.5 text-ink-500 hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
                {/*
                  LAS OPCIONES solo aparecen donde tienen sentido. Un campo de opciones visible en
                  una pregunta de escala es un campo que alguien va a rellenar y que no se va a
                  usar en ninguna parte.
                */}
                {pregunta.kind === 'CHOICE' ? (
                  <div className="space-y-1.5 rounded-lg border border-line bg-paper p-2.5">
                    {pregunta.options.map((opcion, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={opcion}
                          maxLength={120}
                          placeholder={`Opcion ${i + 1}`}
                          onChange={(e) =>
                            actualizar(indice, {
                              options: pregunta.options.map((o, j) => (j === i ? e.target.value : o)),
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => actualizar(indice, { options: pregunta.options.filter((_, j) => j !== i) })}
                          aria-label="Quitar opcion"
                          className="focus-ring shrink-0 rounded p-1.5 text-ink-500 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                    {pregunta.options.length < 6 ? (
                      <button
                        type="button"
                        onClick={() => actualizar(indice, { options: [...pregunta.options, ''] })}
                        className="focus-ring text-xs font-medium text-primary hover:underline"
                      >
                        Anadir opcion
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/*
                  COMO SE PINTA una escala. Es presentacion pura: el numero guardado es el mismo,
                  asi que una respondida con estrellas y otra con caras se promedian juntas.
                */}
                {pregunta.kind === 'SCALE' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {(['faces', 'stars', 'numbers'] as const).map((forma) => (
                      <button
                        key={forma}
                        type="button"
                        onClick={() => actualizar(indice, { display: forma })}
                        className={cn(
                          'focus-ring rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                          pregunta.display === forma
                            ? 'border-transparent bg-primary-soft font-semibold text-primary'
                            : 'border-line text-ink-700 hover:border-line-strong',
                        )}
                      >
                        {forma === 'faces' ? 'Caras' : forma === 'stars' ? 'Estrellas' : 'Numeros'}
                      </button>
                    ))}
                    <Select
                      aria-label="Escalones"
                      className="w-28"
                      value={String(pregunta.scaleMax)}
                      onChange={(e) => actualizar(indice, { scaleMax: Number(e.target.value) === 10 ? 10 : 5 })}
                    >
                      <option value="5">1 a 5</option>
                      <option value="10">1 a 10</option>
                    </Select>
                  </div>
                ) : null}

                <p className="text-xs leading-relaxed text-ink-500">
                  {TIPOS.find((t) => t.valor === pregunta.kind)?.nota}
                </p>
              </div>
            </div>
          </div>
        ))}

        </div>

        {/* ─────────────── Como la ve quien responde ─────────────── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            {plantilla.kind === 'EFFICACY' ? 'Como la ve el jefe' : 'Como la ve quien se formo'}
          </p>
          {/*
            EN UN MARCO DE TELEFONO, no a lo ancho de la pantalla. El 80% de las respuestas van a
            llegar desde un celular, y una encuesta que se ve comoda en 1400 px puede ser ilegible
            en 390. El marco obliga a mirar el caso real.
          */}
          <div className="learner-surface overflow-hidden rounded-[2rem] border-[6px] border-ink-900 bg-paper">
            <div className="max-h-[560px] overflow-y-auto p-4">
              {/*
                EL ENCABEZADO TAMBIEN, no solo las preguntas: es lo primero que se lee y lo que
                explica por que aparece esto al terminar. Sin el, la vista previa ensenaba una lista
                de preguntas sueltas y no la pantalla de verdad.
              */}
              <div className="mb-4 text-center">
                <p className="font-display text-lg font-bold text-ink-900">{nombre || 'Sin nombre'}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  {plantilla.kind === 'EFFICACY'
                    ? 'Son treinta segundos. Responde sobre como aplica lo aprendido.'
                    : 'Son treinta segundos y es anonima para quien dicta la formacion.'}
                </p>
              </div>
              <SurveyRunner questions={preguntas} value={ensayo} onChange={setEnsayo} readOnly />
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Se puede tocar para probarla. Nada de lo que respondas aqui se guarda.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={preguntas.length >= 12}
          title={preguntas.length >= 12 ? 'Doce es el maximo: mas larga, se responde a la ligera' : undefined}
          onClick={() =>
            setPreguntas((previas) => [
              ...previas,
              // El id se genera aqui y NO cambia nunca: es la clave con la que se guardan las
              // respuestas. Si cambiara al renombrar la pregunta, lo respondido quedaria huerfano.
              {
                id: `p${Date.now().toString(36)}`,
                text: '',
                kind: 'SCALE',
                required: true,
                // Caras y escala de 5: es lo que responde bien el personal operativo en el
                // telefono, y es el caso de nueve de cada diez preguntas nuevas.
                display: 'faces',
                scaleMax: 5,
                options: [],
              },
            ])
          }
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Anadir pregunta
        </Button>

        <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', activa ? 'text-ink-900' : 'text-ink-500')}>
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand-primary)]"
          />
          Disponible para usar en formaciones
        </label>
      </div>
    </div>
  );
}
