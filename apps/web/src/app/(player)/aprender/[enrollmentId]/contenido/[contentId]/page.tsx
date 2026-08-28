'use client';

import { Check, Lock, Play, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaUrl } from '@/lib/use-media-url';
import {
  getContent,
  openEnrollment,
  saveProgress,
  type ContentDetail,
  type LessonCard,
  type OpenEnrollment,
  type ProgressInput,
} from '@/lib/learner-api';
import { LessonCardView, requiresInteraction, toEmbedUrl } from '@/components/modules/learner/lesson-cards';
import { cn } from '@/components/ui/cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * EL REPRODUCTOR. Pantalla completa, fondo oscuro, una tarjeta a la vez y un solo boton grande
 * abajo (skill pulse-ui, seccion 2).
 *
 * TELEMETRIA CON SENAL INTERMITENTE — la razon de ser de esta pantalla (DoD del Sprint 4):
 * el tiempo se acumula en el cliente y se envia al pasar de tarjeta; si el envio FALLA, los
 * segundos no se pierden: se guardan y viajan con el siguiente intento. El servidor acumula el
 * tiempo y se queda con el mayor porcentaje, asi que reenviar nunca empeora el estado de nadie.
 */
export default function ContentPlayerPage() {
  const params = useParams<{ enrollmentId: string; contentId: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<ContentDetail | null>(null);
  /**
   * La formacion COMPLETA, no solo la pieza que se esta cursando. Se pide aparte para poder
   * dibujar el panel de contenido: mientras alguien cursa quiere saber cuanto le falta EN TOTAL,
   * no solo cuantas tarjetas quedan de la leccion en la que esta.
   */
  const [course, setCourse] = useState<OpenEnrollment | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Hasta donde ha llegado: el indice solo deja saltar a lo ya visto. */
  const [furthest, setFurthest] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Segundos vistos que el servidor todavia no confirmo (incluye los de envios fallidos). */
  const unsentSeconds = useRef(0);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    getContent(params.contentId)
      .then((value) => {
        if (cancelled) return;
        setDetail(value);
        setIndex(0);
        setFurthest(0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.contentId]);

  // El panel de contenido es contexto, no contenido: si falla, se cursa igual sin el.
  useEffect(() => {
    let cancelled = false;
    openEnrollment(params.enrollmentId)
      .then((value) => {
        if (!cancelled) setCourse(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [params.enrollmentId]);

  // Un contador propio y no `Date.now()` al final: si el telefono se bloquea a mitad de una
  // tarjeta, ese rato no cuenta como tiempo de estudio.
  useEffect(() => {
    lastTick.current = Date.now();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastTick.current = Date.now();
        return;
      }
      const now = Date.now();
      unsentSeconds.current += Math.round((now - lastTick.current) / 1000);
      lastTick.current = now;
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cards = useMemo(() => detail?.lesson?.cards ?? [], [detail]);

  const push = useCallback(
    async (pct: number, lastCardIndex?: number) => {
      const seconds = unsentSeconds.current;
      const input: ProgressInput = { pct, secondsSpent: seconds, ...(lastCardIndex !== undefined ? { lastCardIndex } : {}) };
      try {
        const result = await saveProgress(params.contentId, input);
        unsentSeconds.current = 0;
        return result;
      } catch {
        // Se conservan los segundos: el proximo envio los lleva. El backend es acumulativo.
        return null;
      }
    },
    [params.contentId],
  );

  if (failed) {
    return (
      <main className="learner-surface reading-surface flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <p className="text-base opacity-80">No pudimos abrir este contenido.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/aprender/${params.enrollmentId}`)}>
            Volver
          </Button>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="learner-surface reading-surface min-h-screen px-6 py-6">
        <div className="mx-auto w-full max-w-[720px] space-y-5">
          <Skeleton className="h-1 w-full bg-black/10" />
          <Skeleton className="h-64 w-full rounded-xl bg-black/10" />
          <Skeleton className="h-[52px] w-full rounded-md bg-black/10" />
        </div>
      </main>
    );
  }

  const isLesson = detail.lesson !== null && cards.length > 0;

  async function leave() {
    // Al salir se guarda lo avanzado: volver mas tarde tiene que retomar donde se dejo.
    if (isLesson) {
      await push(Math.round(((index + 1) / cards.length) * 100), index);
    }
    router.push(`/aprender/${params.enrollmentId}`);
  }

  const pct = isLesson ? Math.round(((index + 1) / cards.length) * 100) : 0;

  /**
   * FLUJO CONTINUO (patron de Coursera). Al terminar una parte se pasa DIRECTO a la siguiente que
   * falta, en vez de devolver a la ficha.
   *
   * No es comodidad: devolver al indice obliga a la persona a acordarse de que le falta el examen
   * y a volver a entrar. Ahi es donde se abandona una formacion a medias, y una induccion a medias
   * no sirve como evidencia de nada.
   *
   * Solo se salta a piezas que NO son evaluacion: un examen se empieza a proposito, nunca por
   * inercia, porque consume uno de los intentos limitados.
   */
  function goAfterFinishing() {
    const next = course?.contents.find(
      (content) => content.id !== params.contentId && content.status !== 'COMPLETED' && content.type !== 'ASSESSMENT',
    );
    router.push(
      next
        ? `/aprender/${params.enrollmentId}/contenido/${next.id}`
        : `/aprender/${params.enrollmentId}`,
    );
  }

  return (
    <main className="learner-surface reading-surface flex min-h-screen">
      {/*
        Linea de avance pegada al borde superior. Es lo que hace que la lectura tenga sensacion de
        progreso sin ocupar sitio: no es una barra dentro del contenido, es el borde de la ventana.
      */}
      <span
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-[3px] origin-left transition-transform duration-[320ms] ease-pulse"
        style={{ backgroundColor: 'var(--brand-accent)', transform: `scaleX(${pct / 100})` }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 px-6 pt-5 lg:px-10">
          <div className="mx-auto flex w-full max-w-[720px] items-center gap-4">
            <p className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--reading-muted)' }}>
              {isLesson ? (
                <>
                  <span style={{ color: 'var(--reading-ink)' }}>{detail.content.title}</span>
                  <span className="mx-2">·</span>
                  <span className="tabular-nums">
                    {index + 1} de {cards.length}
                  </span>
                </>
              ) : (
                detail.content.title
              )}
            </p>
            <button
              type="button"
              aria-label="Salir"
              onClick={() => void leave()}
              className="focus-ring -mr-2 flex h-10 w-10 items-center justify-center rounded-full"
              style={{ color: 'var(--reading-muted)' }}
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </header>

      {isLesson ? (
        <LessonRunner
          detail={detail}
          index={index}
          interacted={interacted}
          saving={saving}
          onInteracted={() => setInteracted(true)}
          onAdvance={async () => {
            const isLast = index === cards.length - 1;
            const pct = Math.round(((index + 1) / cards.length) * 100);
            setSaving(true);
            const result = await push(pct, isLast ? index : index + 1);
            setSaving(false);

            if (!isLast) {
              setIndex((value) => value + 1);
              setFurthest((value) => Math.max(value, index + 1));
              setInteracted(false);
              return;
            }

            if (result?.streak && (result.streak.outcome === 'CONTINUED' || result.streak.outcome === 'FIRST')) {
              showToast({
                kind: 'success',
                title: `Racha de ${result.streak.currentStreak} ${result.streak.currentStreak === 1 ? 'dia' : 'dias'}`,
                description: 'Terminaste una leccion hoy.',
              });
            }
            if (result === null) {
              showToast({
                kind: 'warning',
                title: 'Guardaremos tu avance al recuperar senal',
                description: 'Puedes seguir; no perdiste nada.',
              });
            }
            goAfterFinishing();
          }}
        />
      ) : (
        <MediaRunner
          detail={detail}
          saving={saving}
          onDone={async (pct) => {
            setSaving(true);
            const result = await push(pct);
            setSaving(false);
            if (result === null) {
              showToast({ kind: 'warning', title: 'Guardaremos tu avance al recuperar senal' });
            }
            goAfterFinishing();
          }}
        />
      )}
      </div>

      {/*
        PANEL DE CONTENIDO a la DERECHA, solo escritorio (asi va en la referencia y asi lo espera
        la vista: la navegacion secundaria a la derecha, el contenido pegado a la izquierda donde
        empieza la lectura). Muestra la formacion entera y despliega la parte que se esta cursando.
      */}
      <CoursePanel
        course={course}
        currentContentId={params.contentId}
        cards={cards}
        index={index}
        furthest={furthest}
        onJumpCard={(target) => {
          setIndex(target);
          setInteracted(false);
        }}
        onJumpContent={(contentId) => router.push(`/aprender/${params.enrollmentId}/contenido/${contentId}`)}
      />
    </main>
  );
}

/**
 * PANEL DE CONTENIDO (referencia: el rail de Udemy/slothui, adaptado).
 *
 * Muestra la formacion completa: cada parte con su estado, y desplegada la que se esta cursando
 * con sus tarjetas. Responde de un vistazo la pregunta que uno se hace a mitad de una formacion,
 * que no es "cuantas tarjetas quedan" sino "cuanto me falta para terminar esto".
 *
 * Dos reglas de navegacion, y las dos protegen la evidencia:
 *  - a otra PARTE solo se salta si ya se completo (o es la siguiente que toca): la secuencia la
 *    valida el servidor de todos modos, pero la interfaz no debe invitar a saltarsela;
 *  - a otra TARJETA de la parte actual, solo hacia lo ya visto.
 */
function CoursePanel({
  course,
  currentContentId,
  cards,
  index,
  furthest,
  onJumpCard,
  onJumpContent,
}: {
  course: OpenEnrollment | null;
  currentContentId: string;
  cards: LessonCard[];
  index: number;
  furthest: number;
  onJumpCard: (target: number) => void;
  onJumpContent: (contentId: string) => void;
}) {
  if (!course) return null;

  const done = course.contents.filter((content) => content.status === 'COMPLETED').length;
  const nextId = course.contents.find((content) => content.status !== 'COMPLETED')?.id;

  return (
    <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l lg:block" style={{ borderColor: 'var(--reading-line)' }}>
      <div className="p-5">
        <p className="font-display text-sm font-semibold">{course.enrollment.activityName}</p>
        <p className="mt-1 text-xs opacity-60">
          {done} de {course.contents.length} partes completadas
        </p>
        <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-black/10">
          <span
            className="block h-full rounded-full transition-[width] duration-[220ms] ease-pulse"
            style={{
              width: `${course.contents.length === 0 ? 0 : Math.round((done / course.contents.length) * 100)}%`,
              backgroundColor: 'var(--brand-accent)',
            }}
          />
        </span>

        <ol className="mt-5 space-y-1">
          {course.contents.map((content, position) => {
            const isCurrent = content.id === currentContentId;
            const completed = content.status === 'COMPLETED';
            const reachable = completed || content.id === nextId || isCurrent;

            return (
              <li key={content.id}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => (isCurrent ? undefined : onJumpContent(content.id))}
                  className={cn(
                    'focus-ring relative flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-150',
                    isCurrent ? 'bg-black/5' : reachable ? 'opacity-80 hover:opacity-100' : 'cursor-not-allowed opacity-30',
                  )}
                >
                  {isCurrent ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full"
                      style={{ backgroundColor: 'var(--brand-accent)' }}
                    />
                  ) : null}
                  <span className="mt-0.5 shrink-0">
                    {completed ? (
                      <Check className="h-4 w-4 text-ok" strokeWidth={2.5} aria-hidden="true" />
                    ) : reachable ? (
                      <Play className="h-4 w-4 opacity-50" strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Lock className="h-4 w-4 opacity-25" strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {String(position + 1).padStart(2, '0')}: {content.title}
                    </span>
                    {!completed && content.pct > 0 ? (
                      <span className="mt-1 block text-xs opacity-60">{content.pct}% avanzado</span>
                    ) : null}
                  </span>
                </button>

                {/* La parte que se esta cursando se despliega con sus tarjetas. */}
                {isCurrent && cards.length > 0 ? (
                  <ol className="ml-6 mt-1 space-y-0.5 border-l pl-3">
                    {cards.map((card, cardPosition) => {
                      const seen = cardPosition <= furthest;
                      return (
                        <li key={card.id}>
                          <button
                            type="button"
                            disabled={!seen}
                            onClick={() => onJumpCard(cardPosition)}
                            className={cn(
                              'focus-ring flex w-full gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150',
                              cardPosition === index
                                ? 'font-medium'
                                : seen
                                  ? 'opacity-70 hover:opacity-100'
                                  : 'cursor-not-allowed opacity-25',
                            )}
                          >
                            <span className="w-4 shrink-0 tabular-nums">{cardPosition + 1}</span>
                            <span className="min-w-0 flex-1 line-clamp-1">{cardTitle(card)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

/** Un rotulo corto para el indice: la tarjeta no siempre tiene titulo, pero siempre tiene algo. */
function cardTitle(card: LessonCard): string {
  const payload = card.payload;
  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return payload.title || payload.body.slice(0, 60);
    case 'VIDEO_SHORT':
      return payload.title || 'Video';
    case 'QUIZ':
      return payload.question;
    case 'POLL':
      return payload.question;
    case 'FLIP':
      return payload.front;
    case 'FILL_GAP':
      return payload.sentence.replace(/___/g, '____');
  }
}

/** La pila de tarjetas. Avanza por boton y por deslizamiento; nunca retrocede el porcentaje. */
function LessonRunner({
  detail,
  index,
  interacted,
  saving,
  onInteracted,
  onAdvance,
}: {
  detail: ContentDetail;
  index: number;
  interacted: boolean;
  saving: boolean;
  onInteracted: () => void;
  onAdvance: () => Promise<void>;
}) {
  const cards = detail.lesson?.cards ?? [];
  const card = cards[index];
  const touchStartX = useRef<number | null>(null);
  if (!card) return null;

  const blocked = requiresInteraction(card.payload) && !interacted;
  const isLast = index === cards.length - 1;

  return (
    <>
      <section
        className="flex flex-1 items-center overflow-y-auto px-6 py-10 lg:px-10 lg:py-14"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartX.current = null;
          if (start === null || end === null) return;
          if (start - end > 60 && !blocked && !saving) void onAdvance();
        }}
      >
        {/* `key` fuerza el remontaje: cada tarjeta ENTRA, no se sustituye en silencio. */}
        <div key={card.id} className="reading-enter mx-auto w-full max-w-[720px]">
          <LessonCardView payload={card.payload} onInteracted={onInteracted} />
        </div>
      </section>

      <footer className="shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 lg:px-10">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-4">
          <Button
            size="lg"
            className="flex-1 sm:flex-none sm:min-w-[200px]"
            disabled={blocked}
            loading={saving}
            onClick={() => void onAdvance()}
          >
            {isLast ? 'Terminar' : 'Siguiente'}
          </Button>
          <p className="text-sm" style={{ color: 'var(--reading-muted)' }}>
            {blocked ? 'Responde para continuar.' : null}
          </p>
        </div>
      </footer>
    </>
  );
}

/**
 * Video, documento y enlace. El video reporta el porcentaje REALMENTE visto (el servidor decide
 * si alcanza con `minWatchPct`); el documento y el enlace los confirma la persona, que es lo
 * unico honesto que se puede registrar de una lectura.
 */
function MediaRunner({
  detail,
  saving,
  onDone,
}: {
  detail: ContentDetail;
  saving: boolean;
  onDone: (pct: number) => Promise<void>;
}) {
  /**
   * SEGUNDOS DISTINTOS realmente vistos, no la posicion maxima alcanzada.
   *
   * La diferencia es el fondo del asunto: si se guardara la posicion maxima, arrastrar la barra
   * hasta el final daria el video por visto en dos segundos. Marcando cada segundo por el que
   * pasa la reproduccion, saltar hacia adelante deja huecos y el porcentaje no sube.
   */
  const watchedSeconds = useRef<Set<number>>(new Set());
  const [watched, setWatched] = useState(0);
  const type = detail.content.type;
  // La firma se resuelve contra el servidor: una etiqueta no puede autenticarse por si sola.
  const source = useMediaUrl(detail.package?.storageKey);

  /**
   * Un VIDEO puede venir de dos sitios y hay que atender los dos: archivo subido al
   * almacenamiento de la empresa, o enlace a YouTube/Vimeo. Antes solo se dibujaba el archivo, y
   * un video enlazado terminaba mostrando "este contenido no tiene material cargado".
   *
   * La diferencia importa para la evidencia: del archivo propio se sabe el porcentaje REAL visto;
   * de un enlace embebido no —el reproductor es de otro— y por eso ahi la confirmacion es de la
   * persona, igual que en un documento.
   */
  const externalUrl =
    typeof (detail.content.config as { externalUrl?: unknown } | null)?.externalUrl === 'string'
      ? String((detail.content.config as { externalUrl?: string }).externalUrl)
      : null;
  const embed = !source && externalUrl ? toEmbedUrl(externalUrl) : null;

  /**
   * Video PROPIO frente a video AJENO, y de ahi sale todo lo demas.
   *
   * Del archivo alojado en la empresa se puede medir lo que se vio de verdad y por tanto se puede
   * EXIGIR. De un embebido de YouTube no: el reproductor es de otra plataforma y la nuestra no
   * sabe si le dieron a reproducir. Fingir que lo comprueba seria peor que reconocerlo, porque
   * este registro tiene que sostenerse ante un auditor.
   */
  const ownedVideo = type === 'VIDEO' && Boolean(source);
  const minWatchPct = (() => {
    const raw = (detail.content.config as { minWatchPct?: unknown } | null)?.minWatchPct;
    return typeof raw === 'number' && raw > 0 && raw <= 100 ? Math.round(raw) : 90;
  })();
  const meetsMinimum = watched >= minWatchPct;

  return (
    <>
      <section className="flex-1 overflow-y-auto px-6 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[720px] space-y-5">
          <h1 className="font-display text-[26px] font-semibold">{detail.content.title}</h1>

          {type === 'VIDEO' && source ? (
            <video
              src={source}
              controls
              playsInline
              className="w-full rounded-xl bg-black"
              onTimeUpdate={(event) => {
                const element = event.currentTarget;
                if (!element.duration || !Number.isFinite(element.duration)) return;
                watchedSeconds.current.add(Math.floor(element.currentTime));
                setWatched(Math.min(100, Math.round((watchedSeconds.current.size / element.duration) * 100)));
              }}
            />
          ) : null}

          {type === 'VIDEO' && !source && embed ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe
                src={embed}
                title={detail.content.title}
                className="h-full w-full"
                allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}

          {type === 'VIDEO' && !source && !embed && externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring block rounded-xl border px-4 py-3 text-center underline"
              style={{ borderColor: 'var(--reading-line)' }}
            >
              Ver el video
            </a>
          ) : null}

          {type === 'DOCUMENT' && source ? (
            <>
              <iframe src={source} title={detail.content.title} className="h-[70vh] w-full rounded-xl bg-white" />
              <a
                href={source}
                target="_blank"
                rel="noreferrer"
                className="focus-ring block text-center text-sm underline opacity-70"
              >
                Abrir el documento aparte
              </a>
            </>
          ) : null}

          {type === 'LINK' ? (
            <a
              href={String((detail.content.config as { url?: string } | null)?.url ?? '#')}
              target="_blank"
              rel="noreferrer"
              className="focus-ring block rounded-lg border px-4 py-3 text-center underline"
            >
              Abrir el recurso
            </a>
          ) : null}

          {!source && !embed && !externalUrl && type !== 'LINK' ? (
            <p className="text-base opacity-70">Este contenido no tiene material cargado.</p>
          ) : null}
        </div>
      </section>

      <footer className="shrink-0 px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 lg:px-10">
        <div className="mx-auto w-full max-w-[720px]">
          {/*
            Con video PROPIO no hay boton de confianza: el paso se habilita cuando el porcentaje
            realmente visto llega al minimo que exige la formacion. Con video de otra plataforma
            no se puede medir —el reproductor es suyo— y entonces se dice, en vez de fingir rigor.
          */}
          {ownedVideo && !meetsMinimum ? (
            <div className="mb-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--reading-line)' }}>
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-pulse"
                  style={{ width: `${Math.min(100, (watched / minWatchPct) * 100)}%`, backgroundColor: 'var(--brand-accent)' }}
                />
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--reading-muted)' }}>
                Llevas <span className="tabular-nums">{watched}%</span> visto. Se habilita al{' '}
                <span className="tabular-nums">{minWatchPct}%</span>. Adelantar no cuenta.
              </p>
            </div>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            loading={saving}
            disabled={ownedVideo && !meetsMinimum}
            onClick={() => void onDone(ownedVideo ? watched : 100)}
          >
            {type === 'VIDEO' ? (ownedVideo ? 'Terminar' : 'Confirmo que lo vi') : 'Ya lo lei'}
          </Button>

          {type === 'VIDEO' && !ownedVideo ? (
            <p className="mt-2.5 text-center text-sm" style={{ color: 'var(--reading-muted)' }}>
              Este video esta alojado fuera y la plataforma no puede comprobar que lo hayas visto:
              queda registrado como declaracion tuya.
            </p>
          ) : null}
        </div>
      </footer>
    </>
  );
}
