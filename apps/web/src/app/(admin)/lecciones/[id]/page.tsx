'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  createNextVersion,
  duplicateLesson,
  getLesson,
  saveLessonCards,
  updateLesson,
  uploadMedia,
  type CardOption,
  type CardPayloadClient,
  type CardType,
  type LessonDetail,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MediaImage, MediaVideo } from '@/components/ui/media';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/** Tope duro de video (packages/shared/src/schemas/lessons.ts). No importable desde `web` (sin dep de zod). */
const MAX_CARD_VIDEO_SECONDS = 180;
const VIDEO_WARNING_SECONDS = 90;

const CARD_TYPES: CardType[] = ['TEXT_IMAGE', 'VIDEO_SHORT', 'QUIZ', 'FLIP', 'POLL', 'FILL_GAP'];

const CARD_TYPE_META: Record<CardType, { label: string; icon: LucideIcon }> = {
  TEXT_IMAGE: { label: 'Texto e imagen', icon: ImageIcon },
  VIDEO_SHORT: { label: 'Video corto', icon: Video },
  QUIZ: { label: 'Quiz', icon: HelpCircle },
  FLIP: { label: 'Tarjeta volteable', icon: RefreshCw },
  POLL: { label: 'Encuesta', icon: BarChart3 },
  FILL_GAP: { label: 'Completar frase', icon: PenLine },
};

interface WorkingCard {
  /** Clave estable en cliente: el id existente, o un uuid generado para tarjetas nuevas. */
  key: string;
  id?: string;
  payload: CardPayloadClient;
}

function apiErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Ocurrio un error. Intenta de nuevo.';
}

function defaultPayload(cardType: CardType): CardPayloadClient {
  switch (cardType) {
    case 'TEXT_IMAGE':
      return { cardType, body: '' };
    case 'VIDEO_SHORT':
      return { cardType };
    case 'QUIZ':
      return {
        cardType,
        question: '',
        options: [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
        ],
        correctOptionId: 'a',
      };
    case 'FLIP':
      return { cardType, front: '', back: '' };
    case 'POLL':
      return {
        cardType,
        question: '',
        options: [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
        ],
      };
    case 'FILL_GAP':
      return { cardType, sentence: '', answers: [], distractors: [] };
    default:
      return { cardType: 'TEXT_IMAGE', body: '' };
  }
}

function cardExcerpt(payload: CardPayloadClient): string {
  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return payload.title || payload.body || '';
    case 'VIDEO_SHORT':
      return payload.title || payload.externalUrl || '';
    case 'QUIZ':
    case 'POLL':
      return payload.question || '';
    case 'FLIP':
      return payload.front || '';
    case 'FILL_GAP':
      return payload.sentence || '';
    default:
      return '';
  }
}

function isCardValid(payload: CardPayloadClient): boolean {
  switch (payload.cardType) {
    case 'TEXT_IMAGE': {
      const body = payload.body ?? '';
      return body.length >= 1 && body.length <= 1200 && (payload.title?.length ?? 0) <= 120 && (payload.caption?.length ?? 0) <= 200;
    }
    case 'VIDEO_SHORT': {
      const hasMedia = Boolean(payload.mediaKey) || Boolean(payload.externalUrl);
      const duration = payload.durationSeconds;
      const durationOk = duration === undefined || (Number.isInteger(duration) && duration >= 1 && duration <= MAX_CARD_VIDEO_SECONDS);
      return hasMedia && durationOk;
    }
    case 'QUIZ': {
      const question = payload.question ?? '';
      const options = payload.options ?? [];
      return (
        question.length >= 3 &&
        question.length <= 400 &&
        options.length >= 2 &&
        options.length <= 5 &&
        options.every((o) => o.text.trim().length > 0 && o.text.length <= 300) &&
        options.some((o) => o.id === payload.correctOptionId)
      );
    }
    case 'FLIP': {
      const front = payload.front ?? '';
      const back = payload.back ?? '';
      return front.length >= 1 && front.length <= 300 && back.length >= 1 && back.length <= 600;
    }
    case 'POLL': {
      const question = payload.question ?? '';
      const options = payload.options ?? [];
      return (
        question.length >= 3 &&
        question.length <= 400 &&
        options.length >= 2 &&
        options.length <= 6 &&
        options.every((o) => o.text.trim().length > 0 && o.text.length <= 300)
      );
    }
    case 'FILL_GAP': {
      const sentence = payload.sentence ?? '';
      const gapCount = (sentence.match(/___/g) ?? []).length;
      const answers = payload.answers ?? [];
      return (
        sentence.length >= 5 &&
        sentence.length <= 400 &&
        gapCount === answers.length &&
        answers.length >= 1 &&
        answers.length <= 5 &&
        answers.every((a) => a.trim().length > 0 && a.length <= 60) &&
        (payload.distractors ?? []).length <= 6
      );
    }
    default:
      return false;
  }
}

function nextOptionId(existing: CardOption[]): string {
  const used = new Set(existing.map((o) => o.id));
  for (let i = 0; i < 26; i++) {
    const candidate = String.fromCharCode(97 + i);
    if (!used.has(candidate)) return candidate;
  }
  return `o${existing.length}`;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // Se leen ambos antes de escribir: con noUncheckedIndexedAccess el acceso por indice es
    // `T | undefined`, y el rango del bucle ya garantiza que existen.
    const current = arr[i] as T;
    const other = arr[j] as T;
    arr[i] = other;
    arr[j] = current;
  }
  return arr;
}

export default function LessonEditorPage() {
  const params = useParams<{ id: string }>();
  const lessonId = params.id;
  const router = useRouter();
  // Cuando se llega desde una formacion, el editor sabe volver a ella: de otro modo el autor
  // acaba en la biblioteca de lecciones sin saber como regresar a lo que estaba armando.
  const search = useSearchParams();
  const backTo = search.get('volverA');
  /**
   * De QUE formacion se vino. Sin esto, una leccion publicada solo podia ofrecer "duplicar", que
   * crea una copia suelta en la biblioteca: el autor editaba algo que nadie iba a ver nunca y la
   * pantalla no daba ninguna pista de que hacer despues. Sabiendo la formacion se puede ofrecer
   * lo que de verdad resuelve su problema: crear la version siguiente.
   */
  const fromActivityId = search.get('formacion');
  const { showToast } = useToast();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<WorkingCard[]>([]);
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalSignature, setOriginalSignature] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const applyLesson = useCallback((data: LessonDetail) => {
    const working: WorkingCard[] = [...data.cards]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => ({ key: c.id, id: c.id, payload: c.payload }));
    const signature = JSON.stringify(working.map((c) => ({ id: c.id, payload: c.payload })));
    setLesson(data);
    setTitle(data.title);
    setCards(working);
    setOriginalTitle(data.title);
    setOriginalSignature(signature);
    setSelectedKey((prev) => (prev && working.some((w) => w.key === prev) ? prev : (working[0]?.key ?? null)));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getLesson(lessonId);
      applyLesson(data);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar la lección', description: motivoDelError(error) });
      setLesson(null);
    } finally {
      setInitialLoading(false);
    }
  }, [lessonId, applyLesson, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const isPublished = lesson?.status === 'PUBLISHED';

  const dirty = useMemo(() => {
    if (!lesson) return false;
    if (title !== originalTitle) return true;
    const signature = JSON.stringify(cards.map((c) => ({ id: c.id, payload: c.payload })));
    return signature !== originalSignature;
  }, [lesson, title, cards, originalTitle, originalSignature]);

  const titleValid = title.trim().length >= 3 && title.length <= 200;
  const allCardsValid = cards.length >= 1 && cards.length <= 30 && cards.every((c) => isCardValid(c.payload));
  const canSave = !isPublished && dirty && titleValid && allCardsValid && !saving;

  const selectedCard = cards.find((c) => c.key === selectedKey) ?? null;

  const discard = () => {
    if (lesson) applyLesson(lesson);
  };

  const save = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      if (title !== lesson.title) {
        await updateLesson(lesson.id, { title });
      }
      await saveLessonCards(
        lesson.id,
        cards.map((c) => ({ id: c.id, payload: c.payload })),
      );
      showToast({ kind: 'success', title: 'Lección guardada' });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Copia SUELTA en la biblioteca. Sirve para arrancar una leccion nueva a partir de otra, y
   * nada mas: la copia no pertenece a ninguna formacion. Por eso solo se ofrece cuando se llego
   * a esta pantalla desde la biblioteca, y el rotulo lo dice.
   */
  const duplicateAsNew = async () => {
    if (!lesson) return;
    setDuplicating(true);
    try {
      const copy = await duplicateLesson(lesson.id);
      showToast({
        kind: 'success',
        title: 'Copia creada en la biblioteca',
        description: 'Es una lección nueva e independiente: la original no cambia.',
      });
      router.push(`/lecciones/${copy.id}`);
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    } finally {
      setDuplicating(false);
    }
  };

  /**
   * LO QUE DE VERDAD QUIERE quien llega aqui desde una formacion y se encuentra la leccion
   * congelada: cambiar lo que la gente va a cursar. Eso no es duplicar una leccion, es crear la
   * version siguiente de la FORMACION —que clona sus lecciones como editables— y editarla ahi.
   *
   * Se aterriza en la pestana de contenido de la formacion, no en la leccion clonada: la version
   * nueva puede tener varias lecciones y quien la abre necesita ver cual es cual antes de entrar.
   */
  const newActivityVersion = async () => {
    if (!fromActivityId) return;
    setDuplicating(true);
    try {
      const draft = await createNextVersion(fromActivityId);
      showToast({
        kind: 'success',
        title: `Version ${draft.versionNumber} creada en borrador`,
        description: 'Sus lecciones ya son editables. La versión publicada no se toco.',
      });
      router.push(`/contenido-formativo/${fromActivityId}?tab=contenido`);
    } catch (error) {
      // Ya habia un borrador: no es un fallo, es que el trabajo estaba empezado. Se lleva alli.
      if (error instanceof ApiError && error.code === 'DRAFT_ALREADY_EXISTS') {
        showToast({ kind: 'info', title: 'Ya habia una versión en borrador', description: 'Te llevamos a ella.' });
        router.push(`/contenido-formativo/${fromActivityId}?tab=contenido`);
        return;
      }
      showToast({ kind: 'danger', title: apiErrorText(error) });
    } finally {
      setDuplicating(false);
    }
  };

  const addCard = (cardType: CardType) => {
    const key = crypto.randomUUID();
    setCards((prev) => [...prev, { key, payload: defaultPayload(cardType) }]);
    setSelectedKey(key);
    setAddMenuOpen(false);
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    setCards((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index] as WorkingCard;
      const other = next[target] as WorkingCard;
      next[index] = other;
      next[target] = current;
      return next;
    });
  };

  const removeCard = (key: string) => {
    if (cards.length <= 1) {
      showToast({ kind: 'warning', title: 'La lección necesita al menos una tarjeta' });
      return;
    }
    const idx = cards.findIndex((c) => c.key === key);
    const next = cards.filter((c) => c.key !== key);
    setCards(next);
    if (selectedKey === key) {
      const fallback = next[Math.min(idx, next.length - 1)];
      setSelectedKey(fallback ? fallback.key : null);
    }
  };

  const updateCard = (key: string, updater: (payload: CardPayloadClient) => CardPayloadClient) => {
    setCards((prev) => prev.map((c) => (c.key === key ? { ...c, payload: updater(c.payload) } : c)));
  };

  const handleUpload = async (file: File, apply: (storageKey: string) => void) => {
    setUploading(true);
    try {
      const uploaded = await uploadMedia(file, 'lesson');
      apply(uploaded.storageKey);
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof Error ? error.message : 'Error al subir el archivo' });
    } finally {
      setUploading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_300px]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-[620px] w-full" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <EmptyState
        icon={Layers}
        title="Lección no encontrada"
        description="Puede que haya sido eliminada o que el enlace este incorrecto."
        action={
          <Button variant="outline" onClick={() => router.push(backTo ?? '/lecciones')}>
            {backTo ? 'Volver a la formacion' : 'Volver a lecciones'}
          </Button>
        }
      />
    );
  }

  return (
    <div>
      {backTo ? (
        <button
          type="button"
          onClick={() => router.push(backTo)}
          className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft size={14} />
          Volver a la formacion
        </button>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPublished}
            maxLength={200}
            aria-label="Titulo de la lección"
            className="focus-ring min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 font-display text-xl font-semibold text-ink-900 transition-colors duration-150 hover:border-line-strong disabled:cursor-not-allowed disabled:text-ink-500"
          />
          <StatusPill kind={isPublished ? 'info' : 'neutral'} label={isPublished ? 'PUBLICADA' : 'BORRADOR'} />
          {dirty ? <StatusPill kind="warn" label="CAMBIOS SIN GUARDAR" /> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {isPublished ? (
            fromActivityId ? (
              <Button onClick={() => void newActivityVersion()} loading={duplicating}>
                <Plus size={16} />
                Crear version nueva para editar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void duplicateAsNew()} loading={duplicating}>
                <Copy size={16} />
                Duplicar como leccion nueva
              </Button>
            )
          ) : (
            <>
              <Button variant="ghost" onClick={discard} disabled={!dirty}>
                Descartar cambios
              </Button>
              <Button onClick={() => void save()} disabled={!canSave} loading={saving}>
                <Save size={16} />
                Guardar leccion
              </Button>
            </>
          )}
        </div>
      </div>

      {/*
        SE DICE QUE HACER, no solo que no se puede. El aviso anterior mandaba a "duplicar", que
        crea una copia suelta en la biblioteca: el autor editaba algo que ninguna formacion usa y
        se quedaba esperando un boton de publicar que nunca iba a aparecer.
      */}
      {isPublished ? (
        <div className="mb-4 flex items-start gap-3 rounded-md bg-warn-soft px-4 py-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" strokeWidth={1.75} />
          <div className="text-sm text-warn">
            <p className="font-medium">Esta lección esta publicada y ya no se puede cambiar.</p>
            {fromActivityId ? (
              <p className="mt-1">
                Es lo que congela la evidencia: quien la curso tiene que poder ver siempre lo mismo. Para cambiar el
                contenido, crea la version siguiente de la formacion —sus lecciones nacen editables— y publicala cuando
                este lista.
              </p>
            ) : (
              <p className="mt-1">
                Llegaste desde la biblioteca. Aqui solo puedes sacar una copia independiente; para cambiar lo que cursa
                la gente, entra a la formacion que la usa y crea su version siguiente.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Y en el borrador se dice el paso que falta: guardar no publica nada. */}
      {!isPublished && backTo ? (
        <div className="mb-4 rounded-md bg-info-soft px-4 py-3 text-sm text-info">
          Estas editando un borrador: los cambios se guardan aqui, pero nadie los vera hasta que{' '}
          <strong>publiques la versión</strong> desde la formacion.
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_1fr_300px]">
        {/* Columna izquierda: lista de tarjetas */}
        <aside className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">
            Tarjetas ({cards.length})
          </p>
          <div className="space-y-2">
            {cards.map((card, index) => {
              const meta = CARD_TYPE_META[card.payload.cardType];
              const Icon = meta.icon;
              const selected = card.key === selectedKey;
              const excerpt = cardExcerpt(card.payload);
              return (
                <div
                  key={card.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(card.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedKey(card.key);
                  }}
                  className={cn(
                    'card cursor-pointer p-3 transition-colors duration-150',
                    selected ? 'border-2 border-primary' : 'border border-line hover:bg-paper',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-semibold text-ink-500">
                        {index + 1}
                      </span>
                      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" strokeWidth={1.75} />
                      <span className="truncate text-xs font-medium text-ink-700">{meta.label}</span>
                    </div>
                    {!isCardValid(card.payload) ? (
                      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-label="Tarjeta incompleta" />
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-500">{excerpt || 'Sin contenido'}</p>
                  {!isPublished ? (
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard(index, -1);
                        }}
                        disabled={index === 0}
                        aria-label="Subir tarjeta"
                        className="focus-ring rounded p-1 text-ink-500 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard(index, 1);
                        }}
                        disabled={index === cards.length - 1}
                        aria-label="Bajar tarjeta"
                        className="focus-ring rounded p-1 text-ink-500 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCard(card.key);
                        }}
                        disabled={cards.length <= 1}
                        aria-label="Eliminar tarjeta"
                        className="focus-ring rounded p-1 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!isPublished ? (
            <div className="relative">
              <Button variant="outline" className="w-full" onClick={() => setAddMenuOpen((v) => !v)}>
                <Plus size={16} />
                Agregar tarjeta
              </Button>
              {addMenuOpen ? (
                <>
                  <div className="fixed inset-0 z-[5]" onClick={() => setAddMenuOpen(false)} />
                  <div className="card absolute left-0 right-0 z-10 mt-1 p-1">
                    {CARD_TYPES.map((type) => {
                      const meta = CARD_TYPE_META[type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => addCard(type)}
                          className="focus-ring flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-700 hover:bg-paper"
                        >
                          <Icon className="h-4 w-4 text-ink-500" strokeWidth={1.75} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>

        {/* Columna central: formulario de la tarjeta seleccionada */}
        <section className="card p-6">
          {!selectedCard ? (
            <EmptyState
              icon={Layers}
              title="Selecciona una tarjeta"
              description="Elige una tarjeta de la lista o agrega una nueva para empezar."
            />
          ) : (
            <fieldset disabled={isPublished} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                {(() => {
                  const Icon = CARD_TYPE_META[selectedCard.payload.cardType].icon;
                  return <Icon className="h-4 w-4 text-ink-500" strokeWidth={1.75} />;
                })()}
                <p className="text-sm font-semibold text-ink-900">
                  {CARD_TYPE_META[selectedCard.payload.cardType].label}
                </p>
              </div>

              <CardForm
                card={selectedCard}
                uploading={uploading}
                onChange={(updater) => updateCard(selectedCard.key, updater)}
                onUpload={handleUpload}
              />

              {!isCardValid(selectedCard.payload) ? (
                <p className="text-xs text-danger">Completa los campos requeridos de esta tarjeta.</p>
              ) : null}
            </fieldset>
          )}
        </section>

        {/* Columna derecha: vista previa de celular, siempre visible */}
        <aside className="sticky top-6 self-start">
          <div className="mx-auto" style={{ width: 300 }}>
            <div
              className="relative overflow-hidden bg-ink-900"
              style={{ width: 300, height: 620, borderRadius: 36, border: '8px solid var(--ink-900)' }}
            >
              <div className="absolute left-3 right-3 top-3 z-10 flex gap-1">
                {cards.map((card) => (
                  <span
                    key={card.key}
                    className="h-1 flex-1 rounded-full bg-white/20"
                    style={card.key === selectedKey ? { backgroundColor: 'var(--brand-primary)' } : undefined}
                  />
                ))}
              </div>

              <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-5 pb-8 pt-10 text-[#e8ebee]">
                {selectedCard ? (
                  <CardPreview key={selectedCard.key} payload={selectedCard.payload} />
                ) : (
                  <p className="text-center text-sm text-white/50">Agrega una tarjeta para ver la vista previa.</p>
                )}
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-ink-500">Vista previa del reproductor movil</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

interface CardFormProps {
  card: WorkingCard;
  uploading: boolean;
  onChange: (updater: (payload: CardPayloadClient) => CardPayloadClient) => void;
  onUpload: (file: File, apply: (storageKey: string) => void) => Promise<void>;
}

function CardForm({ card, uploading, onChange, onUpload }: CardFormProps) {
  const { payload } = card;
  const patch = (partial: Partial<CardPayloadClient>) => onChange((p) => ({ ...p, ...partial }));

  const options = payload.options ?? [];
  const addOption = (max: number) => {
    if (options.length >= max) return;
    patch({ options: [...options, { id: nextOptionId(options), text: '' }] });
  };
  const removeOption = (id: string, min: number) => {
    if (options.length <= min) return;
    const next = options.filter((o) => o.id !== id);
    const update: Partial<CardPayloadClient> = { options: next };
    if (payload.correctOptionId === id) update.correctOptionId = next[0]?.id;
    patch(update);
  };
  const updateOptionText = (id: string, text: string) => {
    patch({ options: options.map((o) => (o.id === id ? { ...o, text } : o)) });
  };

  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return (
        <>
          <Field htmlFor="c-title" label="Titulo" hint="Opcional, máximo 120 caracteres.">
            <Input id="c-title" value={payload.title ?? ''} maxLength={120} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field htmlFor="c-body" label="Cuerpo" required hint={`${(payload.body ?? '').length}/1200 caracteres.`}>
            <Textarea id="c-body" rows={6} maxLength={1200} value={payload.body ?? ''} onChange={(e) => patch({ body: e.target.value })} />
          </Field>
          <Field htmlFor="c-image" label="Imagen">
            <div className="space-y-2">
              {payload.mediaKey ? (
                <div className="flex items-center gap-3">
                  <MediaImage
                    storageKey={payload.mediaKey}
                    alt=""
                    className="h-16 w-16 rounded-md border border-line object-cover"
                  />
                  <Button variant="ghost" size="sm" onClick={() => patch({ mediaKey: null })}>
                    Quitar imagen
                  </Button>
                </div>
              ) : (
                <input
                  id="c-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file, (key) => patch({ mediaKey: key }));
                    e.target.value = '';
                  }}
                  className="focus-ring block w-full cursor-pointer rounded-md border border-line-strong bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1 file:text-sm"
                />
              )}
            </div>
          </Field>
          <Field htmlFor="c-caption" label="Epigrafe" hint="Opcional, máximo 200 caracteres.">
            <Input id="c-caption" value={payload.caption ?? ''} maxLength={200} onChange={(e) => patch({ caption: e.target.value })} />
          </Field>
        </>
      );

    case 'VIDEO_SHORT':
      return (
        <>
          <Field htmlFor="v-title" label="Titulo" hint="Opcional, máximo 120 caracteres.">
            <Input id="v-title" value={payload.title ?? ''} maxLength={120} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field htmlFor="v-file" label="Archivo de video" hint="Sube un archivo o pega una URL externa abajo (uno de los dos).">
            {payload.mediaKey ? (
              <div className="flex items-center gap-3">
                <MediaVideo storageKey={payload.mediaKey} className="h-16 w-28 rounded-md border border-line object-cover" muted />
                <Button variant="ghost" size="sm" onClick={() => patch({ mediaKey: null })}>
                  Quitar video
                </Button>
              </div>
            ) : (
              <input
                id="v-file"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={Boolean(payload.externalUrl) || uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(file, (key) => patch({ mediaKey: key, externalUrl: null }));
                  e.target.value = '';
                }}
                className="focus-ring block w-full cursor-pointer rounded-md border border-line-strong bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1 file:text-sm disabled:cursor-not-allowed disabled:opacity-50"
              />
            )}
          </Field>
          <Field htmlFor="v-url" label="URL externa" hint="Alternativa a subir un archivo.">
            <Input
              id="v-url"
              type="url"
              disabled={Boolean(payload.mediaKey)}
              value={payload.externalUrl ?? ''}
              maxLength={500}
              onChange={(e) => patch({ externalUrl: e.target.value || null })}
            />
          </Field>
          <Field htmlFor="v-duration" label="Duración (segundos)" hint={`Maximo ${MAX_CARD_VIDEO_SECONDS} segundos.`}>
            <Input
              id="v-duration"
              type="number"
              min={1}
              max={MAX_CARD_VIDEO_SECONDS}
              value={payload.durationSeconds ?? ''}
              onChange={(e) => patch({ durationSeconds: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          {(payload.durationSeconds ?? 0) > VIDEO_WARNING_SECONDS ? (
            <p className="flex items-center gap-1.5 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              Los videos de mas de 90 segundos pierden atencion. Considera dividirlo.
            </p>
          ) : null}
        </>
      );

    case 'QUIZ':
      return (
        <>
          <Field htmlFor="q-question" label="Pregunta" required>
            <Textarea id="q-question" rows={3} maxLength={400} value={payload.question ?? ''} onChange={(e) => patch({ question: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <Label>Opciones (marca la correcta)</Label>
            {options.map((opt, i) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`quiz-correct-${card.key}`}
                  checked={payload.correctOptionId === opt.id}
                  onChange={() => patch({ correctOptionId: opt.id })}
                  aria-label={`Marcar opcion ${i + 1} como correcta`}
                  className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                />
                <Input value={opt.text} maxLength={300} onChange={(e) => updateOptionText(opt.id, e.target.value)} />
                <button
                  type="button"
                  onClick={() => removeOption(opt.id, 2)}
                  disabled={options.length <= 2}
                  aria-label="Eliminar opción"
                  className="focus-ring shrink-0 rounded p-1.5 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addOption(5)} disabled={options.length >= 5}>
              <Plus size={14} />
              Agregar opcion
            </Button>
          </div>
          <Field htmlFor="q-fc" label="Retroalimentacion si acierta" hint="Opcional.">
            <Textarea id="q-fc" rows={2} maxLength={300} value={payload.feedbackCorrect ?? ''} onChange={(e) => patch({ feedbackCorrect: e.target.value })} />
          </Field>
          <Field htmlFor="q-fw" label="Retroalimentacion si falla" hint="Opcional.">
            <Textarea id="q-fw" rows={2} maxLength={300} value={payload.feedbackWrong ?? ''} onChange={(e) => patch({ feedbackWrong: e.target.value })} />
          </Field>
        </>
      );

    case 'FLIP':
      return (
        <>
          <Field htmlFor="f-front" label="Frente" required hint={`${(payload.front ?? '').length}/300 caracteres.`}>
            <Textarea id="f-front" rows={3} maxLength={300} value={payload.front ?? ''} onChange={(e) => patch({ front: e.target.value })} />
          </Field>
          <Field htmlFor="f-back" label="Reverso" required hint={`${(payload.back ?? '').length}/600 caracteres.`}>
            <Textarea id="f-back" rows={5} maxLength={600} value={payload.back ?? ''} onChange={(e) => patch({ back: e.target.value })} />
          </Field>
        </>
      );

    case 'POLL':
      return (
        <>
          <Field htmlFor="p-question" label="Pregunta" required>
            <Textarea id="p-question" rows={3} maxLength={400} value={payload.question ?? ''} onChange={(e) => patch({ question: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <Label>Opciones</Label>
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <Input value={opt.text} maxLength={300} onChange={(e) => updateOptionText(opt.id, e.target.value)} />
                <button
                  type="button"
                  onClick={() => removeOption(opt.id, 2)}
                  disabled={options.length <= 2}
                  aria-label="Eliminar opción"
                  className="focus-ring shrink-0 rounded p-1.5 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addOption(6)} disabled={options.length >= 6}>
              <Plus size={14} />
              Agregar opcion
            </Button>
          </div>
        </>
      );

    case 'FILL_GAP': {
      const sentence = payload.sentence ?? '';
      const answers = payload.answers ?? [];
      const distractors = payload.distractors ?? [];
      const gapCount = (sentence.match(/___/g) ?? []).length;
      return (
        <>
          <Field
            htmlFor="fg-sentence"
            label="Frase"
            required
            hint='Marca cada hueco con tres guiones bajos, por ejemplo: "El EPP se usa ___".'
          >
            <Textarea id="fg-sentence" rows={3} maxLength={400} value={sentence} onChange={(e) => patch({ sentence: e.target.value })} />
          </Field>
          <p className={cn('text-xs', gapCount === answers.length ? 'text-ink-500' : 'text-warn')}>
            Huecos detectados: {gapCount} · Respuestas cargadas: {answers.length}
          </p>
          <div className="space-y-2">
            <Label>Respuestas (en el orden de los huecos)</Label>
            {answers.map((answer, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={answer}
                  maxLength={60}
                  onChange={(e) => patch({ answers: answers.map((a, idx) => (idx === i ? e.target.value : a)) })}
                />
                <button
                  type="button"
                  onClick={() => patch({ answers: answers.filter((_, idx) => idx !== i) })}
                  disabled={answers.length <= 1}
                  aria-label="Eliminar respuesta"
                  className="focus-ring shrink-0 rounded p-1.5 text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => patch({ answers: [...answers, ''] })} disabled={answers.length >= 5}>
              <Plus size={14} />
              Agregar respuesta
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Distractores (opcional)</Label>
            {distractors.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={d}
                  maxLength={60}
                  onChange={(e) => patch({ distractors: distractors.map((x, idx) => (idx === i ? e.target.value : x)) })}
                />
                <button
                  type="button"
                  onClick={() => patch({ distractors: distractors.filter((_, idx) => idx !== i) })}
                  aria-label="Eliminar distractor"
                  className="focus-ring shrink-0 rounded p-1.5 text-danger hover:bg-danger-soft"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ distractors: [...distractors, ''] })}
              disabled={distractors.length >= 6}
            >
              <Plus size={14} />
              Agregar distractor
            </Button>
          </div>
        </>
      );
    }

    default:
      return null;
  }
}

function CardPreview({ payload }: { payload: CardPayloadClient }) {
  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return (
        <div className="flex w-full flex-col gap-4">
          {payload.title ? <h2 className="font-display text-xl font-semibold text-white">{payload.title}</h2> : null}
          {payload.mediaKey ? (
            <MediaImage storageKey={payload.mediaKey} alt="" className="w-full rounded-lg object-cover" style={{ maxHeight: 220 }} />
          ) : null}
          <p className="text-[18px] leading-relaxed text-white/90">{payload.body || 'Cuerpo de la tarjeta...'}</p>
          {payload.caption ? <p className="text-xs text-white/50">{payload.caption}</p> : null}
        </div>
      );

    case 'VIDEO_SHORT':
      return (
        <div className="flex w-full flex-col gap-3">
          {payload.title ? <h2 className="font-display text-lg font-semibold text-white">{payload.title}</h2> : null}
          {payload.mediaKey ? (
            <MediaVideo storageKey={payload.mediaKey} controls className="w-full rounded-lg" style={{ maxHeight: 300 }} />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-lg bg-white/10">
              <Play className="h-10 w-10 text-white/70" strokeWidth={1.5} />
            </div>
          )}
        </div>
      );

    case 'QUIZ':
    case 'POLL':
      return (
        <div className="flex w-full flex-col gap-3">
          <p className="text-[18px] font-medium text-white">{payload.question || 'Pregunta...'}</p>
          <div className="flex flex-col gap-2">
            {(payload.options ?? []).map((opt) => (
              <div
                key={opt.id}
                className="flex min-h-[56px] items-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white/90"
              >
                {opt.text || 'Opcion'}
              </div>
            ))}
          </div>
        </div>
      );

    case 'FLIP':
      return <FlipPreview front={payload.front ?? ''} back={payload.back ?? ''} />;

    case 'FILL_GAP':
      return <FillGapPreview payload={payload} />;

    default:
      return null;
  }
}

function FlipPreview({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="focus-ring w-full text-left"
      style={{ perspective: '1000px' }}
      aria-label="Tocar para voltear"
    >
      <div
        className="relative min-h-[220px] w-full transition-transform duration-300"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 text-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-[18px] text-white">{front || 'Frente de la tarjeta'}</p>
          <span className="text-xs text-white/50">Toca para voltear</span>
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 p-5 text-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <p className="text-[18px] text-white">{back || 'Reverso de la tarjeta'}</p>
        </div>
      </div>
    </button>
  );
}

function FillGapPreview({ payload }: { payload: CardPayloadClient }) {
  const sentence = payload.sentence ?? '';
  const parts = sentence.split('___');
  const tokens = useMemo(
    () => shuffle([...(payload.answers ?? []), ...(payload.distractors ?? [])]),
    [payload.answers, payload.distractors],
  );
  return (
    <div className="flex w-full flex-col gap-5">
      <p className="text-[18px] leading-relaxed text-white/90">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 ? (
              <span className="mx-1 inline-block min-w-[64px] rounded-md border border-dashed border-white/30 px-2 py-0.5 align-middle text-white/40">
                &nbsp;
              </span>
            ) : null}
          </span>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        {tokens.map((token, i) => (
          <span key={`${token}-${i}`} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/90">
            {token}
          </span>
        ))}
      </div>
    </div>
  );
}
