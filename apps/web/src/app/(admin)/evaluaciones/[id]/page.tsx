'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCheck,
  Dices,
  Eye,
  Library,
  Monitor,
  Palette,
  PenLine,
  Plus,
  Scale,
  Search,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  createQuestion,
  createQuestionCategory,
  deleteAssessment,
  getAssessment,
  getQuestion,
  listQuestionCategories,
  retirarQuestion,
  listQuestions,
  reviseQuestion,
  setQuestionCategory,
  updateAssessment,
  updateAssessmentPresentation,
  type AssessmentDetail,
  type AssessmentSectionInput,
  type QuestionCategory,
  type QuestionPayloadClient,
  type QuestionsPage,
  type QuestionType,
} from '@/lib/catalog-api';
import type { AnswerInput } from '@/lib/learner-api';
import { emptyPayload, loQueFaltaEnLaPregunta, QTYPE_HINT, QTYPE_LABEL } from '@/components/assessments/question-model';
import { AdministrarTemas } from '@/components/assessments/temas';
import { QuestionCanvas } from '@/components/assessments/question-canvas';
import { ExamStage, type StageQuestion } from '@/components/assessments/exam-stage';
import {
  ACCENTS,
  PRESENTATION_DEFAULT,
  readPresentation,
  TRANSITION_HINT,
  TRANSITION_LABEL,
  type Accent,
  type Presentation,
  type Transition,
} from '@/components/assessments/presentation';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/**
 * ARMAR UNA EVALUACION: rail, lienzo y ajustes (Decision #84).
 *
 * DE DONDE VIENE ESTO. La version anterior ya no era un cajon suelto, pero seguia teniendo tres
 * problemas que el cliente resumio en una frase —*"esa interfaz de editor no me gusta"*— y que al
 * mirarlos de cerca eran estructurales:
 *
 *   1. LA PREGUNTA ERA UNA LINEA DE TEXTO. En el listado del examen se veia el enunciado y nada
 *      mas: ni las opciones ni cual era la correcta. Revisar veinte preguntas antes de publicar
 *      obligaba a abrir veinte veces otra pantalla, asi que en la practica nadie las revisaba.
 *   2. EL EXAMEN ERAN DOS LISTAS. Las preguntas elegidas arriba, los bloques al azar en otra
 *      tarjeta abajo, y el total un numero calculado. Quien lo responde no lo vive asi: lo vive
 *      como UNA secuencia, y el orden entre las dos listas no se podia ni expresar.
 *   3. SE ESCRIBIA EN UN CAJON de 420 px, que es donde van los recados, no el acto principal.
 *
 * COMO QUEDA. Tres zonas, y cada una responde una pregunta distinta:
 *
 *   RAIL (izquierda)   "¿que hay y que me falta?" — la secuencia entera numerada, con el estado
 *                      de cada paso. Una pregunta a medias se ve sin abrirla.
 *   LIENZO (centro)    "¿como va a quedar?" — la pregunta con la forma que tendra para quien la
 *                      responda, y se escribe encima.
 *   AJUSTES (derecha)  "¿como se comporta?" — tipo, puntaje, tema, explicacion.
 *
 * Y UN BLOQUE AL AZAR ES UN PASO MAS de la secuencia, no otra lista. Por dentro se guarda como
 * secciones intercaladas: una corrida de preguntas seguidas es una seccion FIJA, y cada bloque su
 * propia seccion aleatoria, todas con su `displayOrder`. El servidor ya lo soportaba; lo que
 * faltaba era una pantalla capaz de decirlo.
 *
 * NO HAY NI UN CAJON EN EL CAMINO NORMAL. Traer una pregunta del banco tampoco: es un paso mas del
 * rail cuyo lienzo es el buscador, y ahi la pregunta se VE entera antes de meterla, que es lo que
 * una lista de enunciados dentro de un cajon no permitia.
 */

/** Un paso de la secuencia, en el orden en que se respondera. */
type Paso =
  | {
      kind: 'Q';
      localId: string;
      /** `null` mientras no exista en el banco: se crea al guardar. */
      questionId: string | null;
      payload: QuestionPayloadClient;
      categoryId: string | null;
      categoryName: string | null;
      /** Cambio el contenido: al guardar hay que crear la version N+1. */
      dirty: boolean;
    }
  | { kind: 'RANDOM'; localId: string; categoryId: string; pickCount: number }
  /** Sitio reservado mientras se elige del banco. Nunca se guarda. */
  | { kind: 'PICK'; localId: string };

type Seleccion = { tipo: 'PASO'; localId: string } | { tipo: 'CALIFICA' } | { tipo: 'DISENO' };

const POLITICA_NOTA: Record<AssessmentDetail['gradingPolicy'], string> = {
  HIGHEST: 'La nota mas alta de sus intentos',
  LAST: 'La del ultimo intento',
  FIRST: 'La del primer intento',
  AVERAGE: 'El promedio de sus intentos',
};

let contador = 0;
const nuevoId = () => `p${++contador}`;

export default function EvaluacionEditorPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assessmentId = params.id;
  const { showToast } = useToast();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [presentation, setPresentation] = useState<Presentation>(PRESENTATION_DEFAULT);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  /*
    EL GESTOR DE TEMAS, A UN CLIC DE DONDE SE USAN (2026-09-09).

    Se podian crear al vuelo desde el campo de la pregunta y nada mas: un tema mal escrito el primer
    dia no habia forma de arreglarlo, y nadie sabia cuantas preguntas tenia cada uno. Lo cazo el
    cliente. Vive aqui dentro y no en una pestaña propia por lo mismo que se quito el banco
    (Decision #84): nadie entra a "administrar temas", entra a armar un examen.
  */
  const [temasAbierto, setTemasAbierto] = useState(false);
  const recargarTemas = useCallback(async () => {
    setCategories(await listQuestionCategories().catch(() => []));
  }, []);
  const [seleccion, setSeleccion] = useState<Seleccion>({ tipo: 'CALIFICA' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [borrarOpen, setBorrarOpen] = useState(false);
  const [agregarOpen, setAgregarOpen] = useState(false);

  /** Vista previa: lo que vera el empleado, en escritorio o en telefono. */
  const [vista, setVista] = useState<'EDITAR' | 'PREVIA'>('EDITAR');
  const [dispositivo, setDispositivo] = useState<'ESCRITORIO' | 'MOVIL'>('ESCRITORIO');

  /** El banco, solo cuando hay un paso de eleccion abierto. */
  const [bancoQuery, setBancoQuery] = useState('');
  const [bancoCategoria, setBancoCategoria] = useState('');
  const [banco, setBanco] = useState<QuestionsPage | null>(null);

  const load = useCallback(async () => {
    const detail = await getAssessment(assessmentId).catch(() => null);
    if (!detail) return;
    setAssessment(detail);
    setPresentation(readPresentation(detail.presentation));

    /*
      SE LEE EN EL ORDEN DE LAS SECCIONES, no "primero las fijas y luego las aleatorias". Es lo que
      hace que un bloque al azar puesto en medio siga estando en medio al volver a abrirlo.
    */
    const cargados: Paso[] = detail.sections
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .flatMap<Paso>((section) => {
        if (section.mode === 'RANDOM_FROM_POOL' && section.categoryId) {
          return [
            {
              kind: 'RANDOM',
              localId: nuevoId(),
              categoryId: section.categoryId,
              pickCount: section.pickCount ?? 1,
            },
          ];
        }
        return section.fixedQuestions.map<Paso>((question) => ({
          kind: 'Q',
          localId: nuevoId(),
          questionId: question.questionId,
          // `payload` llega del servidor con opciones y correcta (solo a quien puede editarlas).
          payload: question.payload ?? {
            qtype: question.qtype,
            stem: question.stem,
            points: question.points,
          },
          categoryId: question.categoryId,
          categoryName: question.categoryName,
          dirty: false,
        }));
      });
    setPasos(cargados);
    setSeleccion(cargados[0] ? { tipo: 'PASO', localId: cargados[0].localId } : { tipo: 'CALIFICA' });
    setSucio(false);
  }, [assessmentId]);

  useEffect(() => {
    void load();
    void listQuestionCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, [load]);

  /** El banco se pide al SERVIDOR: con mil preguntas no se puede traer todo y filtrar en memoria. */
  const eligiendo = seleccion.tipo === 'PASO' && pasos.find((p) => p.localId === seleccion.localId)?.kind === 'PICK';
  useEffect(() => {
    if (!eligiendo) return;
    const termino = bancoQuery.trim();
    const timer = setTimeout(() => {
      void listQuestions({
        q: termino.length >= 2 ? termino : undefined,
        categoryId: bancoCategoria || undefined,
      })
        .then(setBanco)
        .catch(() => setBanco(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [eligiendo, bancoQuery, bancoCategoria]);

  const volverA = searchParams.get('volverA') ?? '/evaluaciones';
  /*
    SE EDITA SIEMPRE (Decision #87). Ya no hay borrador ni publicacion propias de la evaluacion:
    lo que congela una copia es publicar la FORMACION. Lo unico que no se toca es esa copia, y
    esta pantalla nunca la abre —el listado solo trae las editables—.
  */
  const isDraft = true;

  const preguntas = pasos.filter((p): p is Extract<Paso, { kind: 'Q' }> => p.kind === 'Q');
  const bloques = pasos.filter((p): p is Extract<Paso, { kind: 'RANDOM' }> => p.kind === 'RANDOM');
  const disponiblesEn = (categoryId: string) =>
    categories.find((categoria) => categoria.id === categoryId)?._count.questions ?? 0;
  const bloqueCorto = bloques.some((bloque) => bloque.pickCount > disponiblesEn(bloque.categoryId));
  const totalPreguntas = preguntas.length + bloques.reduce((suma, bloque) => suma + bloque.pickCount, 0);
  const puntos = preguntas.reduce((suma, p) => suma + (p.payload.points || 0), 0);
  const incompletas = preguntas.filter((p) => loQueFaltaEnLaPregunta(p.payload).length > 0).length;

  const tocar = (siguientes: Paso[]) => {
    setPasos(siguientes);
    setSucio(true);
  };

  const actualizarPaso = (localId: string, cambio: Partial<Extract<Paso, { kind: 'Q' }>>) => {
    tocar(pasos.map((p) => (p.kind === 'Q' && p.localId === localId ? { ...p, ...cambio } : p)));
  };

  // ─────────────────────────── Guardar y publicar ───────────────────────────

  /**
   * Guardar hace DOS cosas, y en este orden:
   *
   *   1. lleva cada pregunta al banco —las nuevas se crean, las tocadas se revisan (version N+1,
   *      Decision #6: lo ya respondido nunca se reescribe)—;
   *   2. guarda la SECUENCIA, agrupando las preguntas seguidas en una seccion fija y dejando cada
   *      bloque al azar en la suya, con su `displayOrder`.
   */
  const guardar = async (silencioso = false): Promise<boolean> => {
    if (!assessment) return false;
    setBusy(true);
    setError(null);
    try {
      const resueltos: Paso[] = [];
      for (const paso of pasos) {
        if (paso.kind !== 'Q') {
          if (paso.kind === 'RANDOM') resueltos.push(paso);
          continue; // los PICK sin elegir no se guardan
        }
        if (loQueFaltaEnLaPregunta(paso.payload).length > 0) {
          setError('Hay preguntas a medias. El rail las marca con un punto hueco.');
          return false;
        }
        if (!paso.questionId) {
          const creada = await createQuestion(paso.categoryId, paso.payload);
          resueltos.push({ ...paso, questionId: creada.id, dirty: false });
        } else if (paso.dirty) {
          await reviseQuestion(paso.questionId, paso.payload);
          resueltos.push({ ...paso, dirty: false });
        } else {
          resueltos.push(paso);
        }
      }

      const secciones: AssessmentSectionInput[] = [];
      let corrida: string[] = [];
      const cerrarCorrida = () => {
        if (corrida.length > 0) {
          secciones.push({ mode: 'FIXED', questionIds: corrida });
          corrida = [];
        }
      };
      for (const paso of resueltos) {
        if (paso.kind === 'Q' && paso.questionId) {
          corrida.push(paso.questionId);
        } else if (paso.kind === 'RANDOM') {
          cerrarCorrida();
          secciones.push({ mode: 'RANDOM_FROM_POOL', categoryId: paso.categoryId, pickCount: paso.pickCount });
        }
      }
      cerrarCorrida();

      await updateAssessment(assessmentId, {
        timeLimitMin: assessment.timeLimitMin,
        maxAttempts: assessment.maxAttempts,
        passingScore: assessment.passingScore,
        gradingPolicy: assessment.gradingPolicy,
        shuffleQuestions: assessment.shuffleQuestions,
        shuffleOptions: assessment.shuffleOptions,
        sections: secciones,
      });
      await load();
      await listQuestionCategories()
        .then(setCategories)
        .catch(() => undefined);
      if (!silencioso) showToast({ kind: 'success', title: 'Evaluacion guardada' });
      return true;
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : 'No se pudo guardar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const guardarDiseno = async (siguiente: Presentation) => {
    setPresentation(siguiente);
    try {
      await updateAssessmentPresentation(assessmentId, siguiente);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar el diseño', description: motivoDelError(error) });
    }
  };

  const eliminar = async () => {
    setBusy(true);
    try {
      await deleteAssessment(assessmentId);
      showToast({ kind: 'success', title: 'Evaluacion eliminada' });
      router.push(volverA);
    } catch (err) {
      // El servidor dice POR QUE no se puede —"una persona ya la respondio", "esta dentro de dos
      // formaciones"— y esa frase es la respuesta, no un error tecnico que haya que traducir.
      setBorrarOpen(false);
      showToast({
        kind: 'danger',
        title: err instanceof ApiError && err.message ? err.message : 'No se pudo eliminar la evaluacion',
      });
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────── Agregar pasos ───────────────────────────

  const agregar = (paso: Paso) => {
    tocar([...pasos, paso]);
    setSeleccion({ tipo: 'PASO', localId: paso.localId });
    setAgregarOpen(false);
    setVista('EDITAR');
  };

  const escribir = () =>
    agregar({
      kind: 'Q',
      localId: nuevoId(),
      questionId: null,
      payload: emptyPayload('SINGLE'),
      categoryId: null,
      categoryName: null,
      dirty: true,
    });

  const reutilizar = () => {
    setBancoQuery('');
    setBancoCategoria('');
    setBanco(null);
    agregar({ kind: 'PICK', localId: nuevoId() });
  };

  const alAzar = () => {
    const primera = categories.find((c) => c._count.questions > 0) ?? categories[0];
    if (!primera) {
      showToast({
        kind: 'warning',
        title: 'Un bloque al azar necesita un tema',
        description: 'Ponle tema a algunas preguntas y vuelve: de ahi las saca.',
      });
      return;
    }
    agregar({ kind: 'RANDOM', localId: nuevoId(), categoryId: primera.id, pickCount: 3 });
  };

  const mover = (localId: string, salto: -1 | 1) => {
    const indice = pasos.findIndex((p) => p.localId === localId);
    const destino = indice + salto;
    if (indice < 0 || destino < 0 || destino >= pasos.length) return;
    const copia = [...pasos];
    [copia[indice], copia[destino]] = [copia[destino] as Paso, copia[indice] as Paso];
    tocar(copia);
  };

  const quitar = (localId: string) => {
    const indice = pasos.findIndex((p) => p.localId === localId);
    const siguientes = pasos.filter((p) => p.localId !== localId);
    tocar(siguientes);
    const vecino = siguientes[Math.min(indice, siguientes.length - 1)];
    setSeleccion(vecino ? { tipo: 'PASO', localId: vecino.localId } : { tipo: 'CALIFICA' });
  };

  if (!assessment) return <Skeleton className="h-96 w-full" />;

  const pasoActivo = seleccion.tipo === 'PASO' ? pasos.find((p) => p.localId === seleccion.localId) : undefined;
  const yaEnElExamen = new Set(preguntas.map((p) => p.questionId).filter(Boolean) as string[]);

  /** Lo que vera el empleado. Los bloques al azar se anuncian: no se pueden inventar preguntas. */
  const escenario: StageQuestion[] = pasos.flatMap<StageQuestion>((paso) => {
    if (paso.kind === 'Q') {
      return [
        {
          key: paso.localId,
          qtype: paso.payload.qtype,
          stem: paso.payload.stem || 'Pregunta sin enunciado',
          // Se arma lo MISMO que el servidor guardaria (ver `question-payload.ts`): sin esto, la
          // vista previa de un ordenar o un emparejar saldria vacia y no serviria para nada.
          options: opcionesDeLaVista(paso.payload),
          unit: paso.payload.unit,
        },
      ];
    }
    if (paso.kind === 'RANDOM') {
      const tema = categories.find((c) => c.id === paso.categoryId)?.name ?? 'un tema';
      return Array.from({ length: paso.pickCount }, (_, i) => ({
        key: `${paso.localId}-${i}`,
        qtype: 'SINGLE' as QuestionType,
        stem: `Una pregunta al azar de "${tema}"`,
        options: [{ id: 'a', text: 'Cada persona recibe una distinta: aqui no se puede adivinar cual.' }],
      }));
    }
    return [];
  });

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <Link
        href={volverA}
        className="focus-ring mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft size={14} />
        Evaluaciones
      </Link>

      {/* ─────────────── Cabecera ─────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[26px] font-semibold text-ink-900">{assessment.title}</h1>
            {/*
              LA PASTILLA DICE SI YA ESTA EN USO, no en que version va (Decision #87). "Borrador"
              y "publicada" eran de la escalera de versiones que se retiro; lo que de verdad
              cambia el significado de tocar esto es si hay gente cursandola.
            */}
            {assessment.enUso ? <StatusPill kind="ok" label="EN USO" /> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {totalPreguntas === 0
              ? 'Todavia no tiene preguntas.'
              : `${totalPreguntas} preguntas · ${puntos} puntos en las elegidas`}
            {incompletas > 0 ? ` · ${incompletas} a medias` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            VER COMO EL EMPLEADO no es un extra: es la unica forma de comprobar antes de publicar
            que el examen se entiende. Y usa el MISMO componente que el reproductor real, para que
            no pueda enseñar algo distinto de lo que va a pasar de verdad.
          */}
          <div className="flex items-center rounded-lg border border-line p-0.5">
            <button
              type="button"
              onClick={() => setVista('EDITAR')}
              className={cn(
                'focus-ring rounded-md px-3 py-1.5 text-sm transition-colors',
                vista === 'EDITAR' ? 'bg-paper font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setVista('PREVIA')}
              className={cn(
                'focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                vista === 'PREVIA' ? 'bg-paper font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              <Eye size={14} />
              Vista del empleado
            </button>
          </div>

          {/*
            SOLO GUARDAR. Ya no hay "publicar" aqui: lo que pone una evaluacion en manos de la
            gente es publicar la FORMACION que la lleva, y ese es el momento en que se congela una
            copia. Tener dos botones de publicar era la contradiccion que se retiro.
          */}
          <Button onClick={() => void guardar()} loading={busy} disabled={totalPreguntas === 0 || bloqueCorto}>
            Guardar
          </Button>
          <Button
            variant="ghost"
            className="text-danger"
            onClick={() => setBorrarOpen(true)}
            disabled={busy}
            aria-label="Eliminar la evaluacion"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {assessment.enUso ? (
        <p className="mb-3 rounded-lg border border-line-strong bg-paper px-4 py-2.5 text-sm text-ink-700">
          Esta evaluacion ya esta dentro de formaciones publicadas. Lo que cambies aqui NO toca a quien las esta
          cursando: cada formacion se quedo con una copia congelada al publicarse. Los cambios entran cuando se
          publique una version nueva de esa formacion.
        </p>
      ) : null}
      {sucio ? (
        <p className="mb-3 rounded-lg border border-line-strong bg-paper px-4 py-2.5 text-sm text-ink-700">
          Hay cambios sin guardar. Si sales ahora se pierden.
        </p>
      ) : null}

      {vista === 'PREVIA' ? (
        <VistaPrevia
          escenario={escenario}
          presentation={presentation}
          dispositivo={dispositivo}
          onDispositivo={setDispositivo}
        />
      ) : (
        <div className="grid flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem] lg:items-start">
          {/* ─────────────── RAIL: la secuencia ─────────────── */}
          <nav className="card flex flex-col overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)]">
            <p className="shrink-0 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
              La secuencia
            </p>

            <ol className="scroll-hidden min-h-0 flex-1 overflow-y-auto p-2">
              {pasos.length === 0 ? (
                <li className="px-2 py-6 text-center text-sm text-ink-500">Todavia no hay nada.</li>
              ) : (
                pasos.map((paso, indice) => {
                  const activo = seleccion.tipo === 'PASO' && seleccion.localId === paso.localId;
                  const falta =
                    paso.kind === 'Q' ? loQueFaltaEnLaPregunta(paso.payload).length > 0 : paso.kind === 'PICK';
                  const titulo =
                    paso.kind === 'Q'
                      ? paso.payload.stem.trim() || 'Sin enunciado'
                      : paso.kind === 'RANDOM'
                        ? `${paso.pickCount} al azar de "${categories.find((c) => c.id === paso.categoryId)?.name ?? '—'}"`
                        : 'Elegir del banco...';
                  return (
                    <li key={paso.localId} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          setSeleccion({ tipo: 'PASO', localId: paso.localId });
                          setVista('EDITAR');
                        }}
                        className={cn(
                          'focus-ring flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          activo ? 'bg-primary-soft' : 'hover:bg-paper',
                        )}
                      >
                        {/*
                          EL ESTADO DE UN VISTAZO. Relleno = lista; hueca = le falta algo; dado =
                          bloque al azar. Es lo que evita descubrir en el momento de publicar que la
                          pregunta 12 se quedo sin correcta marcada.
                        */}
                        <span
                          className={cn(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                            paso.kind === 'RANDOM'
                              ? 'border-transparent bg-ink-900 text-white'
                              : falta
                                ? 'border-dashed border-warn text-warn'
                                : activo
                                  ? 'border-transparent bg-primary text-white'
                                  : 'border-transparent bg-paper text-ink-500',
                          )}
                        >
                          {paso.kind === 'RANDOM' ? <Dices size={13} /> : indice + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm text-ink-900">{titulo}</span>
                          {paso.kind === 'Q' ? (
                            <span className="mt-0.5 block text-xs text-ink-500">
                              {QTYPE_LABEL[paso.payload.qtype]} · {paso.payload.points}{' '}
                              {paso.payload.points === 1 ? 'pto' : 'ptos'}
                            </span>
                          ) : null}
                        </span>
                      </button>

                      {isDraft ? (
                        <span className="absolute right-1 top-1 hidden gap-0.5 rounded-md bg-surface p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
                          <IconoRail
                            label={`Subir el paso ${indice + 1}`}
                            disabled={indice === 0}
                            onClick={() => mover(paso.localId, -1)}
                          >
                            <ArrowUp size={13} />
                          </IconoRail>
                          <IconoRail
                            label={`Bajar el paso ${indice + 1}`}
                            disabled={indice === pasos.length - 1}
                            onClick={() => mover(paso.localId, 1)}
                          >
                            <ArrowDown size={13} />
                          </IconoRail>
                          <IconoRail label={`Quitar el paso ${indice + 1}`} peligro onClick={() => quitar(paso.localId)}>
                            <Trash2 size={13} />
                          </IconoRail>
                        </span>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ol>

            {isDraft ? (
              <div className="shrink-0 border-t border-line p-2">
                {agregarOpen ? (
                  <div className="space-y-1">
                    <OpcionAgregar icono={PenLine} titulo="Escribir pregunta" pista="La mas comun." onClick={escribir} />
                    <OpcionAgregar
                      icono={Library}
                      titulo="Traer una ya escrita"
                      pista="Del banco: todas las preguntas de la empresa."
                      onClick={reutilizar}
                    />
                    <OpcionAgregar
                      icono={Dices}
                      titulo="Bloque al azar"
                      pista="N de un tema, distintas para cada persona."
                      onClick={alAzar}
                    />
                    <button
                      type="button"
                      onClick={() => setAgregarOpen(false)}
                      className="focus-ring w-full rounded-md px-2 py-1.5 text-xs text-ink-500 hover:text-ink-900"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <Button className="w-full" size="sm" onClick={() => setAgregarOpen(true)}>
                    <Plus size={15} />
                    Agregar
                  </Button>
                )}
              </div>
            ) : null}

            {/* Los ajustes son dos paradas mas del mismo rail: no hace falta buscarlos aparte. */}
            <div className="shrink-0 border-t border-line p-2">
              <ParadaAjuste
                icono={Scale}
                label="Como se califica"
                activo={seleccion.tipo === 'CALIFICA'}
                onClick={() => {
                  setSeleccion({ tipo: 'CALIFICA' });
                  setVista('EDITAR');
                }}
              />
              <ParadaAjuste
                icono={Palette}
                label="Como se ve"
                activo={seleccion.tipo === 'DISENO'}
                onClick={() => {
                  setSeleccion({ tipo: 'DISENO' });
                  setVista('EDITAR');
                }}
              />
            </div>
          </nav>

          {/* ─────────────── LIENZO ─────────────── */}
          <div className="card min-h-[28rem] px-5 py-7 lg:px-8">
            {seleccion.tipo === 'CALIFICA' ? (
              <ComoSeCalifica
                assessment={assessment}
                disabled={!isDraft}
                onChange={(cambio) => {
                  setAssessment({ ...assessment, ...cambio });
                  setSucio(true);
                }}
              />
            ) : seleccion.tipo === 'DISENO' ? (
              <ComoSeVe presentation={presentation} onChange={(siguiente) => void guardarDiseno(siguiente)} />
            ) : !pasoActivo ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Una evaluacion sin preguntas no se publica"
                description="Escribe la primera desde el rail: queda tambien en el banco, para poder reutilizarla."
              />
            ) : pasoActivo.kind === 'PICK' ? (
              <ElegirDelBanco
                banco={banco}
                query={bancoQuery}
                onQuery={setBancoQuery}
                categoria={bancoCategoria}
                onCategoria={setBancoCategoria}
                categories={categories}
                excluidas={yaEnElExamen}
                onRetirar={async (id) => {
                  try {
                    await retirarQuestion(id);
                    setBanco(await listQuestions({ q: bancoQuery, categoryId: bancoCategoria }).catch(() => banco));
                    setCategories(await listQuestionCategories().catch(() => categories));
                    showToast({ kind: 'success', title: 'Retirada del banco', description: 'Deja de ofrecerse. Lo ya respondido no se toca.' });
                  } catch (fallo) {
                    showToast({ kind: 'danger', title: 'No se pudo retirar', description: motivoDelError(fallo) });
                  }
                }}
                onElegir={async (pregunta) => {
                  if (!pregunta.qtype) return;
                  /*
                    SE PIDE LA PREGUNTA ENTERA, no se arma con lo que trae la lista.
                    La lista devuelve un RESUMEN —enunciado, tipo y puntaje— sin opciones ni
                    respuesta correcta, que es lo correcto para una lista. Armando el paso con
                    eso, la pregunta entraba al examen sin sus opciones: el rail la marcaba "a
                    medias" y el lienzo salia en blanco, con lo que reutilizar significaba
                    reescribirla. Lo encontro la prueba e2e de reutilizacion.
                  */
                  const detalle = await getQuestion(pregunta.id).catch(() => null);
                  if (!detalle) {
                    showToast({ kind: 'danger', title: 'No se pudo traer la pregunta', description: motivoDelError(error) });
                    return;
                  }
                  tocar(
                    pasos.map((p) =>
                      p.localId === pasoActivo.localId
                        ? {
                            kind: 'Q',
                            localId: p.localId,
                            questionId: pregunta.id,
                            payload: detalle.payload,
                            categoryId: detalle.categoryId,
                            categoryName: detalle.categoryName,
                            // Sin tocar: no hace falta crear una version nueva por reutilizarla.
                            dirty: false,
                          }
                        : p,
                    ),
                  );
                }}
                onCancelar={() => quitar(pasoActivo.localId)}
              />
            ) : pasoActivo.kind === 'RANDOM' ? (
              <BloqueAlAzar
                bloque={pasoActivo}
                categories={categories}
                disabled={!isDraft}
                onChange={(cambio) =>
                  tocar(pasos.map((p) => (p.localId === pasoActivo.localId ? { ...pasoActivo, ...cambio } : p)))
                }
                onAdministrarTemas={() => setTemasAbierto(true)}
              />
            ) : (
              <QuestionCanvas
                payload={pasoActivo.payload}
                disabled={!isDraft}
                onChange={(payload) => actualizarPaso(pasoActivo.localId, { payload, dirty: true })}
              />
            )}
          </div>

          {/*
            EL GESTOR DE TEMAS, montado una vez para toda la pantalla: se abre desde el campo Tema de
            una pregunta y desde el bloque al azar, que son los dos sitios donde un tema significa algo.
          */}
          <AdministrarTemas
            open={temasAbierto}
            onOpenChange={setTemasAbierto}
            categories={categories}
            onCambio={recargarTemas}
          />

          {/* ─────────────── AJUSTES DE LA PREGUNTA ─────────────── */}
          {pasoActivo?.kind === 'Q' ? (
            <AjustesPregunta
              paso={pasoActivo}
              categories={categories}
              disabled={!isDraft}
              onChange={(cambio) => actualizarPaso(pasoActivo.localId, { ...cambio, dirty: true })}
              onTema={async (categoryId, nombre) => {
                let id = categoryId;
                let etiqueta = nombre ?? null;
                if (nombre) {
                  const creada = await createQuestionCategory(nombre);
                  id = creada.id;
                  setCategories(await listQuestionCategories().catch(() => categories));
                } else {
                  etiqueta = id ? (categories.find((c) => c.id === id)?.name ?? null) : null;
                }
                // Si la pregunta ya vive en el banco, el tema se archiva YA y sin crear version: no
                // es un cambio de contenido (ver `setCategory` en el servidor).
                if (pasoActivo.questionId) await setQuestionCategory(pasoActivo.questionId, id);
                actualizarPaso(pasoActivo.localId, { categoryId: id, categoryName: etiqueta });
              }}
            />
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      )}

      {/* ─────────────── Eliminar ─────────────── */}
      <Drawer
        open={borrarOpen}
        onOpenChange={setBorrarOpen}
        title={`Eliminar "${assessment.title}"`}
        description="Desaparece con todas sus versiones. Las preguntas NO se borran: siguen en el banco."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrarOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void eliminar()} loading={busy}>
              <Trash2 size={16} />
              Eliminar la evaluacion
            </Button>
          </div>
        }
      >
        {/*
          No se calcula aqui si se puede: lo sabe el servidor, que mira intentos y formaciones. Se
          dice lo que protege, y si no se puede, su mensaje explica cual de las dos cosas pasa.
        */}
        <p className="text-sm text-ink-700">
          No se puede eliminar si alguien ya la respondio —esa nota es suya— ni si esta dentro de una formacion. En esos
          casos se dira cual de las dos cosas lo impide.
        </p>
      </Drawer>
    </div>
  );
}


/**
 * LAS "OPCIONES" QUE VERIA EL EMPLEADO, armadas igual que las guardaria el servidor.
 *
 * La vista previa no puede pedirle al servidor la pregunta que todavia se esta escribiendo, asi
 * que aqui se repite la unica traduccion que el servidor hace (`payloadToColumns`). Es duplicidad,
 * y consciente: la alternativa es guardar en cada tecla para poder previsualizar.
 */
function opcionesDeLaVista(payload: QuestionPayloadClient): Array<{ id: string; text: string }> {
  if (payload.qtype === 'ORDER') {
    return (payload.items ?? []).map((item, i) => ({ id: item.id, text: item.text || `Paso ${i + 1} sin texto` }));
  }
  if (payload.qtype === 'MATCH') {
    const pairs = payload.pairs ?? [];
    return [
      ...pairs.map((pair, i) => ({ id: `L${i + 1}`, text: pair.left || `Sin texto ${i + 1}` })),
      ...pairs.map((pair, i) => ({ id: `R${i + 1}`, text: pair.right || `Sin texto ${i + 1}` })),
    ];
  }
  if (payload.qtype === 'FILL_BLANK') {
    return (payload.blanks ?? []).map((blank) => ({ id: blank.id, text: '' }));
  }
  if (payload.qtype === 'NUMERIC' || payload.qtype === 'TRUE_FALSE' || payload.qtype === 'ESSAY') return [];
  return (payload.options ?? []).map((option, i) => ({
    id: option.id,
    text: option.text || `Opcion ${i + 1} sin texto`,
  }));
}

// ─────────────────────────── Piezas ───────────────────────────

function IconoRail({
  label,
  onClick,
  disabled,
  peligro,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'focus-ring flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-25',
        peligro
          ? 'text-ink-500 hover:bg-danger-soft hover:text-danger'
          : 'text-ink-500 hover:bg-paper hover:text-ink-900',
      )}
    >
      {children}
    </button>
  );
}

function OpcionAgregar({
  icono: Icono,
  titulo,
  pista,
  onClick,
}: {
  icono: typeof PenLine;
  titulo: string;
  pista: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-paper"
    >
      <Icono size={15} className="mt-0.5 shrink-0 text-ink-500" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{titulo}</span>
        <span className="block text-xs text-ink-500">{pista}</span>
      </span>
    </button>
  );
}

function ParadaAjuste({
  icono: Icono,
  label,
  activo,
  onClick,
}: {
  icono: typeof Scale;
  label: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
        activo ? 'bg-primary-soft font-medium text-ink-900' : 'text-ink-700 hover:bg-paper',
      )}
    >
      <Icono size={15} className="shrink-0 text-ink-500" />
      {label}
    </button>
  );
}

/** El panel derecho: lo que la pregunta ES, no lo que dice. */
function AjustesPregunta({
  paso,
  categories,
  disabled,
  onChange,
  onTema,
}: {
  paso: Extract<Paso, { kind: 'Q' }>;
  categories: QuestionCategory[];
  disabled: boolean;
  onChange: (cambio: Partial<Extract<Paso, { kind: 'Q' }>>) => void;
  onTema: (categoryId: string | null, nombreNuevo?: string) => Promise<void>;
}) {
  const [temaNuevo, setTemaNuevo] = useState('');
  const [creandoTema, setCreandoTema] = useState(false);
  const falta = loQueFaltaEnLaPregunta(paso.payload);

  const cambiarTipo = (qtype: QuestionType) => {
    // Se conserva lo que SIGUE significando lo mismo —enunciado, puntaje, explicacion— y se
    // reinicia lo que no: las opciones de una de seleccion no dicen nada en una de verdadero o
    // falso, y arrastrarlas dejaba respuestas correctas apuntando a opciones que ya no existen.
    const base = emptyPayload(qtype);
    onChange({
      payload: {
        ...base,
        stem: paso.payload.stem,
        points: paso.payload.points,
        explanation: paso.payload.explanation,
      },
    });
  };

  return (
    <aside className="card h-fit px-4 py-4 lg:sticky lg:top-4">
      {/*
        LO QUE FALTA, dicho antes de pulsar nada. Un boton apagado sin motivo obliga a repasar seis
        campos para encontrar cual es el que falta.
      */}
      {falta.length > 0 ? (
        <div className="mb-4 rounded-lg border border-warn bg-warn-soft px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-warn">Falta esto</p>
          <ul className="mt-1 space-y-0.5">
            {falta.map((linea) => (
              <li key={linea} className="text-sm text-ink-700">
                {linea}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-4">
        <Field htmlFor="ap-tipo" label="Tipo de pregunta" hint={QTYPE_HINT[paso.payload.qtype]}>
          <Select
            id="ap-tipo"
            value={paso.payload.qtype}
            disabled={disabled}
            onChange={(event) => cambiarTipo(event.target.value as QuestionType)}
          >
            {(Object.keys(QTYPE_LABEL) as QuestionType[]).map((tipo) => (
              <option key={tipo} value={tipo}>
                {QTYPE_LABEL[tipo]}
              </option>
            ))}
          </Select>
        </Field>

        <Field htmlFor="ap-puntos" label="Puntaje">
          <Input
            id="ap-puntos"
            type="number"
            min={0.1}
            max={100}
            step={0.5}
            disabled={disabled}
            value={paso.payload.points}
            onChange={(event) => onChange({ payload: { ...paso.payload, points: Number(event.target.value) } })}
          />
        </Field>

        {/*
          EL TEMA ES OPCIONAL (Decision #84). Antes era una "categoria" obligatoria que habia que
          crear en otra pestana ANTES de poder escribir la primera pregunta. Solo sirve para una
          cosa —de que monton saca sus preguntas un bloque al azar— y por eso solo se pide aqui, y
          se crea tecleandolo.
        */}
        <Field
          htmlFor="ap-tema"
          label="Tema"
          hint="Opcional. Es una etiqueta: no cambia la pregunta ni sale en el examen."
          ayuda="Ponerle un tema a esta pregunta la mete en ese montón, y con eso un bloque al azar puede decir «saca 10 de aquí». Eso es todo lo que hace: no la cambia, no sale en el examen y no altera lo ya respondido. Si tus evaluaciones eligen las preguntas a mano, déjala en «Sin tema» — no falta nada."
        >
          {creandoTema ? (
            <div className="flex gap-1.5">
              <Input
                id="ap-tema"
                autoFocus
                value={temaNuevo}
                placeholder="Alturas, Manejo defensivo..."
                maxLength={120}
                onChange={(event) => setTemaNuevo(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCreandoTema(false);
                }}
              />
              <Button
                size="sm"
                disabled={temaNuevo.trim().length < 2}
                aria-label="Crear el tema"
                onClick={async () => {
                  await onTema(null, temaNuevo.trim());
                  setTemaNuevo('');
                  setCreandoTema(false);
                }}
              >
                <Check size={15} />
              </Button>
            </div>
          ) : (
            <Select
              id="ap-tema"
              value={paso.categoryId ?? ''}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value === '__nuevo__') {
                  setCreandoTema(true);
                  return;
                }
                void onTema(event.target.value || null);
              }}
            >
              <option value="">Sin tema</option>
              {categories.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
              <option value="__nuevo__">+ Tema nuevo...</option>
            </Select>
          )}
        </Field>

        {paso.payload.qtype === 'ESSAY' ? (
          <Field htmlFor="ap-rubrica" label="Guia de correccion" hint="Para quien la califique a mano.">
            <textarea
              id="ap-rubrica"
              rows={4}
              maxLength={2000}
              disabled={disabled}
              value={paso.payload.rubric ?? ''}
              onChange={(event) => onChange({ payload: { ...paso.payload, rubric: event.target.value } })}
              className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            />
          </Field>
        ) : (
          <Field
            htmlFor="ap-expl"
            label="Explicacion"
            hint="Se puede mostrar despues del intento, segun la politica de revision."
          >
            <textarea
              id="ap-expl"
              rows={3}
              maxLength={1000}
              disabled={disabled}
              value={paso.payload.explanation ?? ''}
              onChange={(event) => onChange({ payload: { ...paso.payload, explanation: event.target.value } })}
              className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            />
          </Field>
        )}

        {paso.questionId ? (
          <p className="border-t border-line pt-3 text-xs text-ink-500">
            Esta pregunta vive en el banco. Al guardar, los cambios crean una version nueva: lo que alguien ya respondio
            no se reescribe.
          </p>
        ) : (
          <p className="border-t border-line pt-3 text-xs text-ink-500">
            Al guardar quedara tambien en el banco, para poder reutilizarla en otra evaluacion.
          </p>
        )}
      </div>
    </aside>
  );
}

function BloqueAlAzar({
  bloque,
  categories,
  disabled,
  onChange,
  onAdministrarTemas,
}: {
  bloque: Extract<Paso, { kind: 'RANDOM' }>;
  categories: QuestionCategory[];
  disabled: boolean;
  onChange: (cambio: Partial<Extract<Paso, { kind: 'RANDOM' }>>) => void;
  onAdministrarTemas: () => void;
}) {
  const disponibles = categories.find((c) => c.id === bloque.categoryId)?._count.questions ?? 0;
  const corto = bloque.pickCount > disponibles;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white">
          <Dices size={18} />
        </span>
        <h2 className="font-display text-xl font-semibold text-ink-900">Bloque al azar</h2>
      </div>
      {/*
        POR QUE EXISTE ESTO y no solo preguntas elegidas: con 116 personas rindiendo el mismo
        examen, un cuestionario fijo se comparte entero el primer dia.
      */}
      <p className="mt-2 max-w-xl text-sm text-ink-500">
        Saca preguntas distintas de un tema en cada intento. Es lo que evita que se comparta la hoja de respuestas
        cuando todos rinden lo mismo.
      </p>

      <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field
          htmlFor="ba-tema"
          label="Del tema"
          ayuda="Un tema es una etiqueta que se le pone a las preguntas: no cambia la pregunta ni sale en el examen. Sirve justo para esto — que el bloque pueda decir «saca 10 de este montón». El número entre paréntesis es cuántas preguntas hay etiquetadas con él."
        >
          <Select
            id="ba-tema"
            value={bloque.categoryId}
            disabled={disabled}
            onChange={(event) => onChange({ categoryId: event.target.value })}
          >
            {categories.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.name} ({categoria._count.questions})
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor="ba-cuantas" label="Cuantas">
          <Input
            id="ba-cuantas"
            type="number"
            min={1}
            max={50}
            disabled={disabled}
            value={bloque.pickCount}
            onChange={(event) => onChange({ pickCount: Number(event.target.value) })}
          />
        </Field>
      </div>

      <p
        className={cn(
          'mt-4 rounded-lg px-4 py-3 text-sm',
          corto ? 'bg-danger-soft text-danger' : 'bg-paper text-ink-700',
        )}
      >
        {corto
          ? `Solo hay ${disponibles} preguntas en ese tema: no alcanza y no se podra publicar.`
          : `Hay ${disponibles} preguntas en ese tema. Cada persona recibira ${bloque.pickCount}, distintas entre si.`}
      </p>

      {/*
        LA SALIDA CUANDO EL TEMA NO ES EL QUE HACE FALTA (2026-09-09).

        Aqui es donde se descubre que el tema esta mal escrito, que sobra o que falta uno — y hasta
        hoy no habia por donde arreglarlo sin salirse de la evaluacion. El boton no compite con nada:
        va debajo del aviso, en texto, porque es la excepcion y no el camino.
      */}
      <button
        type="button"
        className="focus-ring mt-3 rounded-md text-sm text-ink-500 underline underline-offset-2 hover:text-ink-900"
        onClick={onAdministrarTemas}
      >
        Crear, renombrar o borrar temas
      </button>
    </div>
  );
}

function ElegirDelBanco({
  banco,
  query,
  onQuery,
  categoria,
  onCategoria,
  categories,
  excluidas,
  onElegir,
  onRetirar,
  onCancelar,
}: {
  banco: QuestionsPage | null;
  query: string;
  onQuery: (value: string) => void;
  categoria: string;
  onCategoria: (value: string) => void;
  categories: QuestionCategory[];
  excluidas: Set<string>;
  onElegir: (pregunta: QuestionsPage['items'][number]) => void | Promise<void>;
  /** Retira del banco una pregunta que sobra. No la borra: la marca inactiva. */
  onRetirar: (id: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const disponibles = (banco?.items ?? []).filter(
    (pregunta) => !excluidas.has(pregunta.id) && pregunta.qtype !== null,
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink-900">Reutilizar una pregunta</h2>
          <p className="mt-1 text-sm text-ink-500">
            De las que ya se escribieron, en cualquier evaluacion. Reutilizarlas es para lo que existe el banco.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar en el enunciado"
            className="pl-9"
            aria-label="Buscar en el banco"
          />
        </div>
        <Select value={categoria} onChange={(event) => onCategoria(event.target.value)} className="w-52">
          <option value="">Todos los temas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c._count.questions})
            </option>
          ))}
        </Select>
      </div>

      {!banco ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : disponibles.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-500">
          {query.trim() ? `Ninguna coincide con "${query.trim()}".` : 'No hay preguntas que traer todavia.'}
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {disponibles.map((pregunta) => (
            <li key={pregunta.id}>
              {/*
                Aqui la pregunta SE VE antes de meterla —tipo, puntaje y tema— en vez de ser un
                renglon de una lista dentro de un cajon. Elegir a ciegas era como acababan colandose
                duplicados con distinta redaccion.
              */}
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => void onElegir(pregunta)}
                  className="focus-ring w-full rounded-xl border border-line bg-surface p-4 pr-12 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <p className="text-sm text-ink-900">{pregunta.stem}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {pregunta.qtype ? QTYPE_LABEL[pregunta.qtype] : 'Sin version'} · {pregunta.points}{' '}
                    {pregunta.points === 1 ? 'punto' : 'puntos'}
                    {pregunta.categoryName ? ` · ${pregunta.categoryName}` : ' · sin tema'}
                  </p>
                </button>
                {/*
                  RETIRAR DEL BANCO (2026-09-09). Era la puerta que faltaba: se podian escribir y
                  reutilizar preguntas, y no habia forma de sacar del banco una que sobra o que se
                  escribio mal — asi que la lista solo crecia.

                  NO la borra: la marca inactiva. Lo que alguien respondio apunta a la version que
                  respondio, y borrarla dejaria ese intento sin enunciado, que es lo que un auditor
                  pide ver. Deja de ofrecerse y nada mas.
                */}
                <button
                  type="button"
                  aria-label={`Retirar del banco: ${pregunta.stem.slice(0, 60)}`}
                  title="Retirar del banco"
                  className="focus-ring absolute right-3 top-3 rounded-md p-1.5 text-ink-300 opacity-0 transition-opacity duration-150 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  onClick={() => void onRetirar(pregunta.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComoSeCalifica({
  assessment,
  disabled,
  onChange,
}: {
  assessment: AssessmentDetail;
  disabled: boolean;
  onChange: (cambio: Partial<AssessmentDetail>) => void;
}) {
  /*
    LOS MISMOS VALORES POR DEFECTO QUE APLICA EL SERVIDOR (`reviewPolicySchema`).

    Se repiten aqui porque una evaluacion vieja tiene `{}` guardado, y pintar todas las casillas
    apagadas diria que no se enseña nada — cuando en realidad si se enseña la nota y la
    explicacion. Una pantalla que miente sobre lo que esta pasando es peor que no tenerla.
  */
  const revision = {
    showScore: assessment.reviewPolicy?.showScore ?? true,
    showCorrectAnswers: assessment.reviewPolicy?.showCorrectAnswers ?? false,
    showExplanations: assessment.reviewPolicy?.showExplanations ?? true,
    onlyAfterLastAttempt: assessment.reviewPolicy?.onlyAfterLastAttempt ?? true,
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="font-display text-xl font-semibold text-ink-900">Como se califica</h2>
      <p className="mt-1 text-sm text-ink-500">Lo que decide si alguien aprueba y cuantas veces puede intentarlo.</p>

      <div className="mt-7 space-y-5">
        <Field
          htmlFor="cc-score"
          label="Nota minima (%)"
          hint="Vacio = la que tenga la formacion. Ponla solo si esta evaluacion debe exigir mas."
        >
          <Input
            id="cc-score"
            type="number"
            min={1}
            max={100}
            disabled={disabled}
            value={assessment.passingScore ?? ''}
            onChange={(event) => onChange({ passingScore: event.target.value ? Number(event.target.value) : null })}
          />
        </Field>
        {/*
          LOS TRES CAMPOS DE ARRIBA HEREDAN, y el vacio no es "sin limite": es "lo que diga la
          formacion". La cadena real es `evaluacion ?? formacion`, y la formacion a su vez nace
          del valor por defecto del tenant. Decirlo aqui importa porque el numero se puede poner
          en dos sitios y desde este no se ve el otro: dejarlo vacio es lo NORMAL, y poner un
          numero solo tiene sentido cuando esta evaluacion tiene que ser mas estricta que la
          formacion que la use —un piso legal, tipo "alturas siempre 90%"—.
        */}
        <Field
          htmlFor="cc-attempts"
          label="Intentos maximos"
          ayuda="Vacio = los que tenga la formacion. Al agotarlos, la formacion queda bloqueada y se avisa."
        >
          <Input
            id="cc-attempts"
            type="number"
            min={1}
            max={10}
            disabled={disabled}
            value={assessment.maxAttempts ?? ''}
            onChange={(event) => onChange({ maxAttempts: event.target.value ? Number(event.target.value) : null })}
          />
        </Field>
        <Field htmlFor="cc-time" label="Tiempo limite (minutos)" hint="Vacio = sin cronometro.">
          <Input
            id="cc-time"
            type="number"
            min={1}
            max={600}
            disabled={disabled}
            value={assessment.timeLimitMin ?? ''}
            onChange={(event) => onChange({ timeLimitMin: event.target.value ? Number(event.target.value) : null })}
          />
        </Field>
        <Field htmlFor="cc-policy" label="Con varios intentos, cuenta">
          <Select
            id="cc-policy"
            value={assessment.gradingPolicy}
            disabled={disabled}
            onChange={(event) => onChange({ gradingPolicy: event.target.value as AssessmentDetail['gradingPolicy'] })}
          >
            {(Object.keys(POLITICA_NOTA) as Array<AssessmentDetail['gradingPolicy']>).map((clave) => (
              <option key={clave} value={clave}>
                {POLITICA_NOTA[clave]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-2 border-t border-line pt-5">
          {/*
            BARAJAR es lo que hace que dos personas sentadas juntas no vean el mismo examen. Con un
            banco reutilizado, es la defensa mas barata que hay.
          */}
          <Casilla
            checked={assessment.shuffleQuestions}
            disabled={disabled}
            onChange={(shuffleQuestions) => onChange({ shuffleQuestions })}
            titulo="Barajar las preguntas"
            pista="Cada persona las recibe en otro orden."
          />
          <Casilla
            checked={assessment.shuffleOptions}
            disabled={disabled}
            onChange={(shuffleOptions) => onChange({ shuffleOptions })}
            titulo="Barajar las opciones"
            pista='"La respuesta es la C" deja de servir.'
          />
        </div>

        {/*
          QUE VE LA PERSONA DESPUES DE ENTREGAR (Decision #120).

          La politica existia en la base de datos desde el Sprint 2 y **no habia forma de tocarla**:
          se quedaba con sus valores por defecto para siempre. Lo destapo el cliente al ver que su
          examen le devolvia el detalle: *"no debe mostrar respuestas si le quedan intentos, y este
          cliente no quiere mostrarlas en ningun caso"*.

          Las dos cosas ya se podian expresar; lo que faltaba eran estas cuatro casillas.

          ES CRITICO CON UN BANCO REUTILIZADO: enseñar las correctas a todo el mundo equivale a
          publicar el examen. Por eso "mostrar las correctas" nace APAGADA y las otras tres no.
        */}
        <div className="space-y-2 border-t border-line pt-5">
          <p className="text-sm font-medium text-ink-900">Al terminar, la persona ve</p>
          <p className="pb-1 text-xs leading-relaxed text-ink-500">
            Con un banco de preguntas que se reutiliza, enseñar las correctas a todo el mundo equivale a publicar
            el examen.
          </p>
          <Casilla
            checked={revision.showScore}
            disabled={disabled}
            onChange={(showScore) => onChange({ reviewPolicy: { ...revision, showScore } })}
            titulo="Su calificacion"
            pista="El porcentaje que saco. Apagalo si prefieres que solo sepa si aprobo."
          />
          <Casilla
            checked={revision.onlyAfterLastAttempt}
            disabled={disabled}
            onChange={(onlyAfterLastAttempt) => onChange({ reviewPolicy: { ...revision, onlyAfterLastAttempt } })}
            titulo="El detalle solo cuando ya no le queden intentos"
            pista="Con esto apagado ve en que fallo aunque pueda repetir, y el segundo intento deja de medir nada."
          />
          <Casilla
            checked={revision.showExplanations}
            disabled={disabled}
            onChange={(showExplanations) => onChange({ reviewPolicy: { ...revision, showExplanations } })}
            titulo="La explicacion de cada pregunta"
            pista="Lo que escribiste como retroalimentacion. Enseña sin regalar cual era la correcta."
          />
          <Casilla
            checked={revision.showCorrectAnswers}
            disabled={disabled}
            onChange={(showCorrectAnswers) => onChange({ reviewPolicy: { ...revision, showCorrectAnswers } })}
            titulo="Cual era la respuesta correcta"
            pista="Solo si esta evaluacion no reutiliza preguntas de otras. Es lo que mas rapido filtra un examen."
          />
        </div>
      </div>
    </div>
  );
}

/**
 * COMO SE VE (Decision #85). Se guarda al instante y no espera al boton Guardar: no es parte del
 * borrador de la version —vive en la evaluacion— asi que tampoco puede ensuciarlo.
 */
function ComoSeVe({
  presentation,
  onChange,
}: {
  presentation: Presentation;
  onChange: (siguiente: Presentation) => void;
}) {
  const set = (parcial: Partial<Presentation>) => onChange({ ...presentation, ...parcial });

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="font-display text-xl font-semibold text-ink-900">Como se ve</h2>
      <p className="mt-1 text-sm text-ink-500">
        El aspecto del examen para quien lo rinde. Se guarda solo, y se puede cambiar aunque este publicada: el color no
        es evidencia.
      </p>

      <div className="mt-7 space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Color</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACCENTS) as Accent[]).map((clave) => {
              const activo = presentation.accent === clave;
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => set({ accent: clave })}
                  aria-pressed={activo}
                  title={ACCENTS[clave].label}
                  className={cn(
                    'focus-ring flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-all',
                    activo ? 'border-ink-900 text-ink-900' : 'border-line text-ink-500 hover:border-line-strong',
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: ACCENTS[clave].solid }}
                    aria-hidden="true"
                  />
                  {ACCENTS[clave].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Transicion entre preguntas</p>
          <div className="space-y-1.5">
            {(Object.keys(TRANSITION_LABEL) as Transition[]).map((clave) => (
              <button
                key={clave}
                type="button"
                onClick={() => set({ transition: clave })}
                aria-pressed={presentation.transition === clave}
                className={cn(
                  'focus-ring block w-full rounded-lg border-2 px-3.5 py-2.5 text-left transition-colors',
                  presentation.transition === clave
                    ? 'border-primary bg-primary-soft'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <span className="block text-sm font-medium text-ink-900">{TRANSITION_LABEL[clave]}</span>
                <span className="block text-xs text-ink-500">{TRANSITION_HINT[clave]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Quien tenga activado &quot;reducir movimiento&quot; en su equipo no vera animaciones, elijas la que elijas.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Ritmo</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <ElegirRitmo
              activo={presentation.pace === 'one'}
              onClick={() => set({ pace: 'one' })}
              titulo="Una por pantalla"
              pista="Se lee mejor y se abandona menos. Es lo recomendado."
            />
            <ElegirRitmo
              activo={presentation.pace === 'all'}
              onClick={() => set({ pace: 'all' })}
              titulo="Todas en una lista"
              pista="Se ve el examen entero de una. Util si son pocas."
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-line pt-5">
          <Casilla
            checked={presentation.optionLetters}
            onChange={(optionLetters) => set({ optionLetters })}
            titulo="Numerar las opciones con A, B, C"
            pista="Ademas deja responder con el teclado, que en un examen largo son minutos."
          />
          <Casilla
            checked={presentation.autoAdvance}
            onChange={(autoAdvance) => set({ autoAdvance })}
            titulo="Pasar solo al marcar"
            pista="Mas agil, pero quita el momento de cambiar de opinion. Solo aplica a las de una sola respuesta."
          />
          <Casilla
            checked={presentation.background === 'gradient'}
            onChange={(activo) => set({ background: activo ? 'gradient' : 'plain' })}
            titulo="Fondo con degradado"
            pista="Un halo suave del color arriba, en vez de fondo liso."
          />
        </div>
      </div>
    </div>
  );
}

function ElegirRitmo({
  activo,
  onClick,
  titulo,
  pista,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  pista: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'focus-ring rounded-lg border-2 px-3.5 py-2.5 text-left transition-colors',
        activo ? 'border-primary bg-primary-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <span className="block text-sm font-medium text-ink-900">{titulo}</span>
      <span className="block text-xs text-ink-500">{pista}</span>
    </button>
  );
}

function Casilla({
  checked,
  disabled,
  onChange,
  titulo,
  pista,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  titulo: string;
  pista: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
      <input
        type="checkbox"
        className="mt-0.5"
        disabled={disabled}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {titulo}
        <span className="block text-xs text-ink-500">{pista}</span>
      </span>
    </label>
  );
}

/**
 * LA VISTA DEL EMPLEADO, con el mismo componente que el reproductor real (`ExamStage`).
 *
 * En telefono se pinta dentro de un marco de 390 px. Por eso el escenario recibe `wide` como prop
 * y no lo deduce de puntos de ruptura: dentro de un monitor de 1600, un `lg:` creeria que el
 * telefono simulado tiene sitio para el panel lateral, y ensenaria algo que no va a pasar nunca.
 */
function VistaPrevia({
  escenario,
  presentation,
  dispositivo,
  onDispositivo,
}: {
  escenario: StageQuestion[];
  presentation: Presentation;
  dispositivo: 'ESCRITORIO' | 'MOVIL';
  onDispositivo: (value: 'ESCRITORIO' | 'MOVIL') => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});

  useEffect(() => {
    // Al cambiar de aparato se vuelve al principio: si no, el telefono abre por la pregunta 7.
    setIndex(0);
  }, [dispositivo, presentation.pace]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Asi lo vera quien lo responda. Se puede responder aqui: no se guarda nada.</p>
        <div className="flex items-center rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => onDispositivo('ESCRITORIO')}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              dispositivo === 'ESCRITORIO' ? 'bg-paper font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            <Monitor size={14} />
            Escritorio
          </button>
          <button
            type="button"
            onClick={() => onDispositivo('MOVIL')}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              dispositivo === 'MOVIL' ? 'bg-paper font-medium text-ink-900' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            <Smartphone size={14} />
            Movil
          </button>
        </div>
      </div>

      {dispositivo === 'MOVIL' ? (
        <div className="flex justify-center py-4">
          <div className="w-[390px] overflow-hidden rounded-[2.25rem] border-[10px] border-ink-900 shadow-xl">
            <div className="h-[720px]">
              <ExamStage
                presentation={presentation}
                questions={escenario}
                answers={answers}
                onAnswer={(key, answer) => setAnswers((previo) => ({ ...previo, [key]: answer }))}
                index={index}
                onIndex={setIndex}
                wide={false}
                readOnly
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line shadow-sm">
          <div className="h-[720px]">
            <ExamStage
              presentation={presentation}
              questions={escenario}
              answers={answers}
              onAnswer={(key, answer) => setAnswers((previo) => ({ ...previo, [key]: answer }))}
              index={index}
              onIndex={setIndex}
              wide
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}
