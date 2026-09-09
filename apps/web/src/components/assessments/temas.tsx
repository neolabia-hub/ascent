'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  SquarePen,
  Tags,
  Trash2,
  Undo2,
} from 'lucide-react';
import { motivoDelError } from '@/lib/api';
import {
  borrarQuestionCategory,
  createQuestionCategory,
  listQuestions,
  renombrarQuestionCategory,
  retirarQuestion,
  setQuestionCategory,
  type QuestionCategory,
  type QuestionsPage,
} from '@/lib/catalog-api';
import { Ayuda } from '@/components/ui/ayuda';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * LOS TEMAS DEL BANCO, Y LAS PREGUNTAS QUE TIENEN DENTRO.
 *
 * ─── QUÉ ES UN TEMA, QUE ES LO PRIMERO QUE NADIE SABÍA ───
 *
 * Una **etiqueta** que se le pone a una pregunta. No la cambia, no sale en el examen y no altera lo
 * ya respondido. Sirve para **una sola cosa**: que un bloque al azar pueda decir «sácame 10 de
 * *Alturas*». Si todas las evaluaciones eligen las preguntas a mano, no hace falta ninguno.
 *
 * ─── POR QUÉ AQUÍ Y NO EN UNA PANTALLA PROPIA ───
 *
 * Nadie entra a «administrar temas»: entra a armar un examen y se encuentra con que el tema está mal
 * escrito o sobra. Una pestaña de primer nivel volvería a cobrar el peaje que la Decisión #84 quitó.
 *
 * ─── UN SOLO CAMPO QUE BUSCA Y CREA (2026-09-09, pedido del cliente) ───
 *
 * Antes había un campo rotulado «Tema nuevo» con su botón Crear, y la lista entera debajo. Con
 * treinta temas eso es lo contrario de lo que hace falta: **lo que uno hace casi siempre es BUSCAR
 * uno que ya existe**, y crear es la excepción. Ahora el campo filtra según se escribe y, solo si lo
 * escrito no coincide con ninguno, aparece «Crear ...». El nombre no se pide dos veces: el que se
 * escribió para buscar es el que se crea.
 *
 * ─── Y POR QUÉ SE DESPLIEGAN LAS PREGUNTAS ───
 *
 * La primera versión decía «71 preguntas» y no había forma de ver cuáles. Sin verlas tampoco había
 * forma de vaciar un tema para poder borrarlo: la única salida era abrir cada evaluación a buscarlas.
 * Ahora cada fila tiene su propio botón **Ver preguntas** —el nombre no parecía pulsable y el cliente
 * dijo justo eso: «dónde se editan las preguntas de ese tema no la veo»— y se piden **solo al
 * desplegar**: cargar las de treinta temas para pintar treinta nombres sería traerse el banco entero
 * para nada.
 */
export function AdministrarTemas({
  open,
  onOpenChange,
  categories,
  onCambio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: QuestionCategory[];
  /** Se llama tras cada cambio para que quien la abrió recargue su lista. */
  onCambio: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [preguntas, setPreguntas] = useState<QuestionsPage | null>(null);

  const texto = busqueda.trim();
  const filtrados = useMemo(() => {
    if (texto.length === 0) return categories;
    const aguja = texto.toLocaleLowerCase();
    return categories.filter((tema) => tema.name.toLocaleLowerCase().includes(aguja));
  }, [categories, texto]);

  /*
    SE OFRECE CREAR solo si lo escrito no es ya un tema. Comparado sin mayúsculas ni espacios de
    sobra: ofrecer «Crear Alturas» cuando *Alturas* ya existe es la forma de acabar con dos temas
    que se llaman igual y ninguno completo.
  */
  const yaExiste = categories.some(
    (tema) => tema.name.trim().toLocaleLowerCase() === texto.toLocaleLowerCase(),
  );
  const puedeCrear = texto.length >= 2 && !yaExiste;

  async function crear() {
    if (!puedeCrear) return;
    setOcupado(true);
    try {
      await createQuestionCategory(texto);
      setBusqueda('');
      await onCambio();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo crear el tema', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function renombrar(id: string) {
    if (borrador.trim().length < 2) return;
    setOcupado(true);
    try {
      await renombrarQuestionCategory(id, borrador.trim());
      setEditando(null);
      await onCambio();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo renombrar', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(id: string) {
    setOcupado(true);
    try {
      await borrarQuestionCategory(id);
      if (abierto === id) setAbierto(null);
      await onCambio();
    } catch (error) {
      // El servidor explica por qué no se puede —cuántas preguntas tiene dentro—, y esa frase es la
      // que hay que enseñar: «no se pudo» a secas manda a adivinar.
      showToast({ kind: 'danger', title: 'No se pudo borrar el tema', description: motivoDelError(error) });
    } finally {
      setOcupado(false);
    }
  }

  async function desplegar(id: string) {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    setPreguntas(null);
    setPreguntas(await listQuestions({ categoryId: id }).catch(() => null));
  }

  async function recargarPreguntas(id: string) {
    setPreguntas(await listQuestions({ categoryId: id }).catch(() => null));
    await onCambio();
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Temas del banco"
      description="Etiquetas para agrupar preguntas. Solo hacen falta para los bloques al azar."
    >
      {/*
        UN CAMPO QUE HACE LAS DOS COSAS. Sin rótulo: la lupa y el texto de dentro dicen lo que es, y
        un rótulo de dos palabras encima de un buscador es sitio gastado.
      */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
            aria-hidden
          />
          <Input
            id="tema-buscar"
            className="pl-9"
            aria-label="Buscar un tema o escribir uno nuevo"
            placeholder="Buscar un tema, o escribir uno nuevo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeCrear) void crear();
              if (e.key === 'Escape') setBusqueda('');
            }}
          />
        </div>
        {/*
          LA EXPLICACION LARGA, DETRAS DEL ICONO (regla del cliente del 2026-09-06). Hace falta la
          primera vez que alguien abre esto y estorba las cuatrocientas siguientes.
        */}
        <Ayuda sobre="los temas del banco" className="h-9 w-9 shrink-0">
          Un tema es una <strong>etiqueta</strong> que se le pone a una pregunta: no la cambia, no sale
          en el examen y no toca lo que alguien ya respondió. Sirve para que un bloque al azar pueda
          decir <em>«saca 10 de este montón»</em>. Si eliges las preguntas a mano, no necesitas ninguno.
        </Ayuda>
      </div>

      {puedeCrear ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void crear()}
          className="focus-ring mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm text-ink-700 transition-colors duration-150 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          Crear <strong className="font-medium">«{texto}»</strong>
        </button>
      ) : null}

      <div className="mt-5">
        {categories.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="Todavía no hay temas"
            description="Escribe uno arriba, o sigue sin ellos: solo hacen falta si algún examen va a sacar preguntas al azar."
          />
        ) : filtrados.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">
            Ningún tema se llama así. Puedes crearlo con el botón de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtrados.map((tema) => (
              <li key={tema.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  {editando === tema.id ? (
                    <>
                      <Input
                        className="h-9 flex-1"
                        aria-label={`Nombre de ${tema.name}`}
                        value={borrador}
                        autoFocus
                        onChange={(e) => setBorrador(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void renombrar(tema.id);
                          if (e.key === 'Escape') setEditando(null);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Guardar el nombre de ${tema.name}`}
                        title="Guardar"
                        className="focus-ring rounded-md p-1.5 text-ok hover:bg-ok-soft"
                        onClick={() => void renombrar(tema.id)}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Deshacer"
                        title="Deshacer"
                        className="focus-ring rounded-md p-1.5 text-ink-500 hover:bg-paper hover:text-ink-900"
                        onClick={() => setEditando(null)}
                      >
                        <Undo2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-900">{tema.name}</span>
                      {/*
                        VER LAS PREGUNTAS, EN SU PROPIO BOTON (2026-09-09). Antes se desplegaba
                        pulsando el NOMBRE, y el cliente lo dijo mirando: «donde se editan las
                        preguntas de ese tema no la veo». Un nombre no parece un boton; esto si, y
                        ademas dice cuantas hay, que es lo que decide si un bloque al azar cabe.
                      */}
                      <button
                        type="button"
                        onClick={() => void desplegar(tema.id)}
                        aria-expanded={abierto === tema.id}
                        className="focus-ring flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
                      >
                        {abierto === tema.id ? (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        )}
                        <span className="tabular-nums">{tema._count.questions}</span>
                        {tema._count.questions === 1 ? 'pregunta' : 'preguntas'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Renombrar ${tema.name}`}
                        title="Renombrar"
                        className="focus-ring rounded-md p-1.5 text-ink-500 hover:bg-paper hover:text-ink-900"
                        onClick={() => {
                          setEditando(tema.id);
                          setBorrador(tema.name);
                        }}
                      >
                        <SquarePen className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Borrar ${tema.name}`}
                        title="Borrar el tema"
                        className="focus-ring rounded-md p-1.5 text-ink-500 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                        disabled={ocupado}
                        onClick={() => void borrar(tema.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )}
                </div>

                {abierto === tema.id ? (
                  <div className="mt-2 rounded-lg bg-paper p-3">
                    {!preguntas ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : preguntas.items.length === 0 ? (
                      <p className="text-sm text-ink-500">
                        Este tema está vacío. Ya se puede borrar, o ponérselo a preguntas desde la
                        evaluación donde se escriben.
                      </p>
                    ) : (
                      <>
                        <ul className="space-y-1.5">
                          {preguntas.items.map((pregunta) => (
                            <li
                              key={pregunta.id}
                              className="flex items-start gap-2 rounded-md bg-surface px-3 py-2"
                            >
                              <span className="flex-1 text-sm text-ink-700">{pregunta.stem}</span>
                              {/*
                                DOS SALIDAS, Y NO SON LO MISMO. «Quitar del tema» la deja en el banco
                                y solo le borra la etiqueta —es lo que hace falta para poder borrar el
                                tema—; RETIRAR la saca del banco entero. La segunda lleva icono de
                                ARCHIVAR y no de papelera a proposito: retirar no borra nada, y lo que
                                alguien respondio sigue apuntando a su version.
                              */}
                              <button
                                type="button"
                                className="focus-ring shrink-0 rounded-md px-2 py-0.5 text-xs text-ink-500 hover:text-ink-900"
                                onClick={async () => {
                                  try {
                                    await setQuestionCategory(pregunta.id, null);
                                    await recargarPreguntas(tema.id);
                                  } catch (error) {
                                    showToast({
                                      kind: 'danger',
                                      title: 'No se pudo quitar del tema',
                                      description: motivoDelError(error),
                                    });
                                  }
                                }}
                              >
                                Quitar del tema
                              </button>
                              <button
                                type="button"
                                aria-label={`Retirar del banco: ${pregunta.stem.slice(0, 50)}`}
                                title="Retirar del banco"
                                className="focus-ring shrink-0 rounded-md p-1 text-ink-300 hover:text-danger"
                                onClick={async () => {
                                  try {
                                    await retirarQuestion(pregunta.id);
                                    await recargarPreguntas(tema.id);
                                  } catch (error) {
                                    showToast({
                                      kind: 'danger',
                                      title: 'No se pudo retirar',
                                      description: motivoDelError(error),
                                    });
                                  }
                                }}
                              >
                                <Archive className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {/*
                          DONDE SE EDITA UNA PREGUNTA, detras del icono: hace falta una vez y era un
                          parrafo de tres renglones. No se edita en el banco — se trae a una
                          evaluacion y se corrige alli, lo que crea una version nueva sin tocar lo ya
                          respondido (Decision #6).
                        */}
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                          El texto de una pregunta no se cambia aquí
                          <Ayuda sobre="dónde se cambia el texto de una pregunta">
                            Tráela a una evaluación con <strong>«Traer una ya escrita»</strong> y corrígela
                            ahí: se guarda como versión nueva y lo que alguien ya respondió no se toca.
                          </Ayuda>
                          {preguntas.total > preguntas.items.length
                            ? `· ${preguntas.items.length} de ${preguntas.total}`
                            : ''}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
