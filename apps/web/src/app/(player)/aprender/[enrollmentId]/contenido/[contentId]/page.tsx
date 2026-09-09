'use client';

import { ChevronRight } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  answerSurvey,
  getSurveyToAnswer,
  type SurveyParaResponder,
} from '@/lib/surveys-api';
import { SurveyRunner, loQueFaltaEnCliente, type Respuestas } from '@/components/modules/learner/survey-runner';
import { useMediaUrl } from '@/lib/use-media-url';
import { ApiError } from '@/lib/api';
import {
  getContent,
  openEnrollment,
  saveProgress,
  startAttempt,
  toScore,
  type ContentDetail,
  type EnrollmentContent,
  type EnrollmentAttempt,
  type OpenEnrollment,
  type ProgressInput,
} from '@/lib/learner-api';
import { ContentTabs } from '@/components/modules/learner/content-tabs';
import { CourseIndex, contentMeta } from '@/components/modules/learner/course-index';
import { LessonCardView, requiresInteraction, toEmbedUrl } from '@/components/modules/learner/lesson-cards';
import { PlayerShell, useIndexPanel } from '@/components/modules/learner/player-chrome';
import { SlideRunner } from '@/components/modules/learner/slide-runner';
import { YouTubePlayer, youtubeVideoId } from '@/components/modules/learner/youtube-player';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * EL REPRODUCTOR. Superficie de lectura clara, el contenido en el centro y, en escritorio, el
 * indice de la formacion a la derecha (skill pulse-ui, seccion 2).
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
   * dibujar el indice: mientras alguien cursa quiere saber cuanto le falta EN TOTAL, no solo
   * cuantas tarjetas quedan de la leccion en la que esta.
   */
  const [course, setCourse] = useState<OpenEnrollment | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Hasta donde ha llegado: el indice solo deja saltar a lo ya visto. */
  const [furthest, setFurthest] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Porcentaje de diapositivas distintas vistas, cuando el contenido es una presentacion. */
  const [watchedSlides, setWatchedSlides] = useState(0);
  const [indexOpen, toggleIndex] = useIndexPanel();

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
        setWatchedSlides(0);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.contentId]);

  // El indice es contexto, no contenido: si falla, se cursa igual sin el.
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
    async (pct: number, lastCardIndex?: number, evidence?: 'MEASURED' | 'DECLARED') => {
      const seconds = unsentSeconds.current;
      const input: ProgressInput = {
        pct,
        secondsSpent: seconds,
        ...(lastCardIndex !== undefined ? { lastCardIndex } : {}),
        // COMO se supo que lo vio. Un auditor no pregunta solo el porcentaje: pregunta si lo
        // midio la plataforma o lo declaro la persona.
        ...(evidence ? { evidence } : {}),
      };
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
  const slides =
    detail.content.type === 'PRESENTATION' && detail.package?.manifest?.slides?.length
      ? detail.package.manifest.slides
      : null;

  /** La misma pieza, vista desde el indice: trae la descripcion y el tamaño que el detalle no da. */
  const listed = course?.contents.find((content) => content.id === params.contentId) ?? null;

  async function leave() {
    // Al salir se guarda lo avanzado: volver mas tarde tiene que retomar donde se dejo. Tambien
    // en una presentacion: quien vio ocho de once diapositivas y se quedo sin señal no puede
    // volver a cero. El servidor se queda con el mayor porcentaje, asi que reenviar nunca resta.
    if (isLesson) {
      await push(Math.round(((index + 1) / cards.length) * 100), index);
    } else if (slides) {
      await push(watchedSlides, undefined, 'MEASURED');
    }
    router.push(`/aprender/${params.enrollmentId}`);
  }

  const totalParts = course?.contents.length ?? 0;

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
  /**
   * "Terminar" solo cuando de verdad se termina. Con cinco partes por delante, ese rotulo hace
   * creer que la formacion queda cumplida y esa es la peor confusion posible en algo que la
   * empresa exige: la persona cierra, se va, y sigue apareciendo como incumplida.
   */
  const pendingAfter = (course?.contents ?? []).filter(
    (content) => content.id !== params.contentId && content.status !== 'COMPLETED',
  );
  const nextLabel = pendingAfter.length > 0 ? 'Siguiente parte' : 'Terminar';

  function goAfterFinishing() {
    const next = course?.contents.find(
      (content) => content.id !== params.contentId && content.status !== 'COMPLETED' && content.type !== 'ASSESSMENT',
    );
    router.push(
      next ? `/aprender/${params.enrollmentId}/contenido/${next.id}` : `/aprender/${params.enrollmentId}`,
    );
  }

  return (
    <PlayerShell
      activityName={course?.enrollment.activityName ?? detail.content.title}
      subtitle={course ? `Parte ${(course.contents.findIndex((c) => c.id === params.contentId) + 1) || 1} de ${totalParts}` : null}
      indexOpen={indexOpen}
      onToggleIndex={toggleIndex}
      onExit={() => void leave()}
      index={
        <CourseIndex
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
      }
    >
      {/*
        UNA PRESENTACION NO ES UN DOCUMENTO. Se reproduce diapositiva a diapositiva con el
        lenguaje del producto —progreso arriba, un gesto principal, se desliza— en vez de
        entregarse como archivo en un visor. Es lo unico que permite registrar que se vio.
      */}
      {slides ? (
        <div className="scroll-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/*
            LA LAMINA SE QUEDA CON LA PANTALLA. El bloque ocupa el alto de la ventana menos la
            barra, y dentro reparte: titulo arriba, lamina en lo que quede, controles abajo. Asi la
            diapositiva sale tan grande como el monitor permita —una presentacion se diseño para
            verse en grande— y las pestanas quedan a un scroll, que es donde tienen que estar.
          */}
          <div
            className="flex shrink-0 flex-col"
            style={{ height: 'calc(100vh - 4rem - 3px)', minHeight: '460px' }}
          >
            <div className="shrink-0 px-6 pt-5 lg:px-10">
              <p className="text-[13px]" style={{ color: 'var(--reading-muted)' }}>
                {listed ? contentMeta(listed, toScore(course?.enrollment.passingScore ?? null) ?? undefined) : null}
              </p>
              <h1 className="mt-0.5 font-display text-[24px] font-semibold leading-tight" style={{ color: 'var(--reading-ink)' }}>
                {detail.content.title}
              </h1>
            </div>

            <SlideRunner
              slides={slides}
              finishLabel={nextLabel}
              finishing={saving}
              onProgress={(value) => setWatchedSlides(value)}
              onFinish={async () => {
                setSaving(true);
                const result = await push(watchedSlides, undefined, 'MEASURED');
                setSaving(false);
                if (result === null) {
                  showToast({ kind: 'warning', title: 'Guardaremos tu avance al recuperar señal' });
                }
                goAfterFinishing();
              }}
            />
          </div>
          <ContentTabs
            description={detail.content.description ?? listed?.description ?? null}
            requirement={requirementFor(detail, listed, null)}
            course={course}
            currentContentId={params.contentId}
            original={
              detail.package
                ? { storageKey: detail.package.storageKey, originalName: detail.package.originalName }
                : null
            }
          />
        </div>
      ) : detail.content.type === 'SURVEY' && detail.content.surveyTemplateId ? (
        /*
          LA ENCUESTA, dentro del reproductor como una pieza mas (Decision #119).

          No es una pantalla aparte a la que se mande por correo: se responde donde se acaba de
          cursar, con el contexto delante. Una encuesta que llega tres dias despues por correo la
          contesta el 10% y ademas ya nadie se acuerda de que opinaba.
        */
        /*
          CON SU PROPIO CONTENEDOR QUE SE DESPLAZA, como las diapositivas.

          El armazon del reproductor es `h-screen overflow-hidden` a proposito —solo se desplaza el
          escenario, para que la barra y el indice no se vayan al bajar— asi que una pieza que no
          traiga su propio scroll se CORTA. Con cinco preguntas, el boton de enviar quedaba fuera
          de la pantalla y no habia forma de llegar a el: se podia responder y no entregar.
        */
        <div className="scroll-hidden min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <SurveyGate
          enrollmentId={params.enrollmentId}
          templateId={detail.content.surveyTemplateId}
          nextLabel={nextLabel}
          onDone={async () => {
            // Se marca completa aunque se haya saltado: la pieza es opcional y dejarla en rojo
            // haria que la formacion se viera sin terminar por una encuesta que no obliga.
            await push(100, index);
            goAfterFinishing();
          }}
        />
        </div>
      ) : detail.content.type === 'ASSESSMENT' ? (
        <AssessmentGate
          detail={detail}
          listed={listed}
          course={course}
          enrollmentId={params.enrollmentId}
          currentContentId={params.contentId}
        />
      ) : isLesson ? (
        <LessonRunner
          detail={detail}
          nextLabel={nextLabel}
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
                description: 'Terminaste una lección hoy.',
              });
            }
            if (result === null) {
              showToast({
                kind: 'warning',
                title: 'Guardaremos tu avance al recuperar señal',
                description: 'Puedes seguir; no perdiste nada.',
              });
            }
            goAfterFinishing();
          }}
        />
      ) : (
        <MediaRunner
          detail={detail}
          listed={listed}
          course={course}
          currentContentId={params.contentId}
          nextLabel={nextLabel}
          saving={saving}
          onDone={async (pct, evidence) => {
            setSaving(true);
            const result = await push(pct, undefined, evidence);
            setSaving(false);
            if (result === null) {
              showToast({ kind: 'warning', title: 'Guardaremos tu avance al recuperar señal' });
            }
            goAfterFinishing();
          }}
        />
      )}
    </PlayerShell>
  );
}

/**
 * QUE SE EXIGE para dar la pieza por vista, dicho en castellano y en el sitio donde se decide.
 *
 * Se dice siempre, no solo cuando la noticia es mala: que un video enlazado ahora se mida es lo
 * que convierte esta pantalla en evidencia, y quien la cursa tiene derecho a saber que se cuenta.
 */
function requirementFor(
  detail: ContentDetail,
  listed: EnrollmentContent | null,
  measuredVideo: boolean | null,
): ReactNode {
  const config = (detail.content.config ?? {}) as { minWatchPct?: number; minSeconds?: number };
  const minSeconds = typeof config.minSeconds === 'number' && config.minSeconds > 0 ? config.minSeconds : null;
  const tail = minSeconds ? ` Ademas hay que dedicarle al menos ${Math.ceil(minSeconds / 60)} min.` : '';

  switch (detail.content.type) {
    case 'PRESENTATION':
      return (
        <p>
          Se da por vista cuando pases por <strong>todas</strong> las diapositivas
          {listed?.size.slides ? ` (${listed.size.slides})` : ''}. Queda registrado cual viste y cuanto tiempo, y por
          eso no hace falta que confirmes nada.
          {tail}
        </p>
      );
    case 'VIDEO':
      if (measuredVideo === false) {
        return (
          <p>
            Este video esta alojado fuera y la plataforma no puede comprobar que lo hayas visto: se registra como una{' '}
            <strong>declaracion tuya</strong>, y asi consta.
            {tail}
          </p>
        );
      }
      return (
        <p>
          Se cuentan los segundos que reproduces <strong>de verdad</strong>: adelantar deja huecos y no suma. Se
          habilita al {typeof config.minWatchPct === 'number' ? config.minWatchPct : 90}%.
          {tail}
        </p>
      );
    case 'DOCUMENT':
      return (
        <p>
          De un documento en un visor lo unico que se puede afirmar es que lo abriste y lo confirmaste: eso es lo que
          queda registrado, ni mas ni menos.
          {tail}
        </p>
      );
    case 'LINK':
      return <p>Se registra tu confirmacion de que abriste el recurso.{tail}</p>;
    default:
      return <p>Se completa al recorrerla entera.{tail}</p>;
  }
}

/** La pila de tarjetas. Avanza por boton y por deslizamiento; nunca retrocede el porcentaje. */
function LessonRunner({
  detail,
  nextLabel,
  index,
  interacted,
  saving,
  onInteracted,
  onAdvance,
}: {
  detail: ContentDetail;
  nextLabel: string;
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
      {/*
        RIEL DE TRAMOS de la pila, uno por tarjeta (patron "stories", skill pulse-ui). Sustituye a
        la linea que iba pegada al borde de la ventana: esa media lo mismo pero lejos del contenido
        y compitiendo con las otras dos barras de la pantalla. Aqui el avance esta donde se lee.
      */}
      <div className="shrink-0 px-6 pt-5 lg:px-10">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-[3px]" aria-hidden="true">
          {cards.map((row, position) => (
            <span
              key={row.id}
              className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--reading-line)' }}
            >
              {/*
                Cada tramo se RELLENA de izquierda a derecha al llegar a el, en vez de cambiar de
                color de golpe. Es el mismo gesto de pasar de tarjeta, dibujado: se ve avanzar, no
                se ve saltar.
              */}
              <span
                className="block h-full origin-left rounded-full transition-transform duration-[420ms] ease-pulse"
                style={{
                  transform: `scaleX(${position <= index ? 1 : 0})`,
                  backgroundColor: position < index ? 'var(--reading-muted)' : 'var(--brand-accent)',
                }}
              />
            </span>
          ))}
        </div>
      </div>

      <section
        className="scroll-hidden flex flex-1 items-center overflow-y-auto px-6 py-8 lg:px-10 lg:py-12"
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
            className="group/go w-full max-w-[280px]"
            disabled={blocked}
            loading={saving}
            onClick={() => void onAdvance()}
          >
            {isLast ? nextLabel : 'Siguiente'}
            <ChevronRight
              className="h-5 w-5 transition-transform duration-150 ease-pulse group-hover/go:translate-x-0.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </Button>
          <p className="text-sm" style={{ color: 'var(--reading-muted)' }}>
            {blocked ? 'Responde para continuar.' : null}
          </p>
          <p className="ml-auto hidden text-sm tabular-nums sm:block" style={{ color: 'var(--reading-muted)' }}>
            {index + 1} de {cards.length}
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
  listed,
  course,
  currentContentId,
  nextLabel,
  saving,
  onDone,
}: {
  detail: ContentDetail;
  listed: EnrollmentContent | null;
  course: OpenEnrollment | null;
  currentContentId: string;
  /** "Siguiente parte" o "Terminar": decir "Terminar" con cinco partes por delante es mentir. */
  nextLabel: string;
  saving: boolean;
  onDone: (pct: number, evidence: 'MEASURED' | 'DECLARED') => Promise<void>;
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
   */
  const externalUrl =
    typeof (detail.content.config as { externalUrl?: unknown } | null)?.externalUrl === 'string'
      ? String((detail.content.config as { externalUrl?: string }).externalUrl)
      : null;
  const embed = !source && externalUrl ? toEmbedUrl(externalUrl) : null;

  /**
   * YouTube SI se puede medir, y por eso deja de ir con el resto de los embebidos.
   *
   * `youtubeMeasurable` empieza en null a proposito: mientras no se sepa si el reproductor
   * arranco no se puede prometer medicion NI negarla. Si el script no carga —red que lo bloquea,
   * video restringido— pasa a false y la pantalla vuelve a la confirmacion de la persona, que es
   * lo unico honesto que queda. Lo que no puede pasar es que alguien se quede sin poder avanzar.
   */
  const youtubeId = type === 'VIDEO' && !source && externalUrl ? youtubeVideoId(externalUrl) : null;
  const [youtubeMeasurable, setYoutubeMeasurable] = useState<boolean | null>(null);

  const measuredVideo = type === 'VIDEO' && (Boolean(source) || (Boolean(youtubeId) && youtubeMeasurable === true));
  const deciding = Boolean(youtubeId) && youtubeMeasurable === null;
  // Ya viene resuelto en cascada (formacion -> empresa -> plataforma): no se recalcula aqui.
  const minWatchPct = detail.minWatchPct;
  const meetsMinimum = watched >= minWatchPct;

  return (
    <div className="scroll-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section className="shrink-0 px-6 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-[840px]">
          {/*
            EL TITULO VA ARRIBA, sobre el contenido. Abajo, en el resumen, llega tarde: quien abre
            la parte 4 de 7 quiere saber que esta a punto de ver antes de darle a reproducir.
          */}
          <div className="mb-4">
            <p className="text-[13px]" style={{ color: 'var(--reading-muted)' }}>
              {listed ? contentMeta(listed, toScore(course?.enrollment.passingScore ?? null) ?? undefined) : null}
            </p>
            <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight" style={{ color: 'var(--reading-ink)' }}>
              {detail.content.title}
            </h1>
          </div>

          {type === 'VIDEO' && source ? (
            <video
              src={source}
              // Sin esto la peticion viaja en modo "no-cors" y Chrome abandona la carga en
              // silencio: el video se queda girando. Ver `components/ui/media.tsx`.
              crossOrigin="anonymous"
              controls
              playsInline
              /*
                ALTO ACOTADO. Sin tope, un video vertical —los que se graban con el telefono, que
                son la mitad de los que sube el cliente— ocupaba tres pantallas de alto y obligaba
                a desplazarse para ver sus propios controles.
              */
              className="max-h-[68vh] w-full rounded-2xl bg-black object-contain shadow-card"
              onTimeUpdate={(event) => {
                const element = event.currentTarget;
                if (!element.duration || !Number.isFinite(element.duration)) return;
                watchedSeconds.current.add(Math.floor(element.currentTime));
                setWatched(Math.min(100, Math.round((watchedSeconds.current.size / element.duration) * 100)));
              }}
            />
          ) : null}

          {type === 'VIDEO' && !source && youtubeId ? (
            <YouTubePlayer
              videoId={youtubeId}
              title={detail.content.title}
              onMeasurable={setYoutubeMeasurable}
              onProgress={(pct) => setWatched(pct)}
            />
          ) : null}

          {type === 'VIDEO' && !source && !youtubeId && embed ? (
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-card">
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
            <iframe
              src={source}
              title={detail.content.title}
              className="h-[70vh] w-full rounded-2xl bg-white shadow-card"
            />
          ) : null}

          {type === 'LINK' ? (
            <a
              href={String((detail.content.config as { url?: string } | null)?.url ?? '#')}
              target="_blank"
              rel="noreferrer"
              className="focus-ring block rounded-xl border px-4 py-3 text-center underline"
              style={{ borderColor: 'var(--reading-line)' }}
            >
              Abrir el recurso
            </a>
          ) : null}

          {!source && !embed && !youtubeId && !externalUrl && type !== 'LINK' ? (
            <p className="text-base opacity-70">Este contenido no tiene material cargado.</p>
          ) : null}

          {/*
            LA ACCION VA PEGADA AL CONTENIDO, no anclada abajo: debajo hay pestanas por las que se
            baja a leer, y un boton flotante sobre ellas taparia justo lo que se esta leyendo.
          */}
          <div className="mt-5">
            {/*
              EL BOTON ES EL MEDIDOR (ver `Button.meterPct`). Antes habia tres elementos diciendo
              lo mismo —una barra, el texto que la explicaba y un boton gris al lado—, y el unico
              que la persona miraba era el que no podia pulsar. Ahora el boton se rellena con lo
              que lleva visto y se abre con un latido al llegar al minimo.
            */}
            <div className="flex flex-wrap items-center gap-3">
              {/*
                ANCHO SOLO MIENTRAS MIDE. Como medidor necesita sitio para que el relleno diga
                algo; en cuanto se abre, la accion es un boton normal y no tiene por que ocupar
                media pantalla. Los dos estados son el mismo elemento: se estrecha al desbloquearse,
                que es parte de lo que hace notar que ya puedes seguir.
              */}
              <Button
                size="lg"
                className={cn(
                  'group/go transition-[max-width] duration-[320ms] ease-pulse',
                  measuredVideo && !meetsMinimum ? 'w-full max-w-[440px]' : 'w-full max-w-[280px]',
                )}
                loading={saving || deciding}
                disabled={deciding}
                meterPct={measuredVideo ? Math.min(100, Math.round((watched / minWatchPct) * 100)) : undefined}
                onClick={() => void onDone(measuredVideo ? watched : 100, measuredVideo ? 'MEASURED' : 'DECLARED')}
              >
                {deciding
                  ? 'Preparando el reproductor'
                  : measuredVideo && !meetsMinimum
                    ? `Llevas ${watched}% de ${minWatchPct}%`
                    : type === 'VIDEO'
                      ? measuredVideo
                        ? nextLabel
                        : 'Confirmo que lo vi'
                      : 'Ya lo lei'}
                {deciding || (measuredVideo && !meetsMinimum) ? null : (
                  <ChevronRight
                    className="h-5 w-5 transition-transform duration-150 ease-pulse group-hover/go:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </Button>

              {type === 'DOCUMENT' && source ? (
                <a
                  href={source}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring text-sm underline"
                  style={{ color: 'var(--reading-muted)' }}
                >
                  Abrir aparte
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <ContentTabs
        description={detail.content.description ?? listed?.description ?? null}
        requirement={requirementFor(detail, listed, type === 'VIDEO' ? measuredVideo : null)}
        course={course}
        currentContentId={currentContentId}
        original={null}
      />
    </div>
  );
}

/**
 * LA ANTESALA DE UNA EVALUACION.
 *
 * Una evaluacion no es un medio: no tiene archivo que reproducir, y hasta hoy caia en el
 * reproductor de medios y terminaba diciendo "este contenido no tiene material cargado" con un
 * boton de "Ya lo lei". Se veia al saltar a ella desde el indice.
 *
 * El examen se rinde APARTE, a pantalla completa (Decision #50), pero su puerta vive aqui: aqui
 * es donde se dice lo que cuesta —los intentos son limitados y al agotarlos la ejecucion se
 * bloquea— antes de gastar uno. Un examen se empieza a proposito, nunca por inercia.
 */
function AssessmentGate({
  detail,
  listed,
  course,
  enrollmentId,
  currentContentId,
}: {
  detail: ContentDetail;
  listed: EnrollmentContent | null;
  course: OpenEnrollment | null;
  enrollmentId: string;
  currentContentId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const versionId = detail.content.assessmentId;
  const mine: EnrollmentAttempt[] = (course?.attempts ?? []).filter(
    (attempt) => attempt.assessmentId === versionId,
  );
  // Un intento sin terminar se RETOMA; abrir otro gastaria uno de los limitados.
  const open = mine.find((attempt) => attempt.status === 'IN_PROGRESS') ?? null;
  const passed = mine.some((attempt) => attempt.passed);
  const blocked = course?.enrollment.blockedAt != null;
  const passingScore = toScore(course?.enrollment.passingScore ?? null);

  async function begin() {
    if (open) {
      router.push(`/aprender/${enrollmentId}/examen/${open.id}`);
      return;
    }
    if (!versionId) return;
    setStarting(true);
    try {
      const attempt = await startAttempt(enrollmentId, versionId);
      router.push(`/aprender/${enrollmentId}/examen/${attempt.attempt.id}`);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'ENROLLMENT_BLOCKED'
            ? 'Agotaste los intentos. Tu analista debe habilitarte un refuerzo.'
            : error instanceof ApiError && error.code === 'MAX_ATTEMPTS_REACHED'
              ? 'Ya no te quedan intentos para esta evaluacion.'
              : 'No se pudo abrir la evaluacion. Intenta de nuevo.',
      });
      setStarting(false);
    }
  }

  return (
    <div className="scroll-hidden flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section className="shrink-0 px-6 py-10 lg:px-10">
        <div className="mx-auto w-full max-w-[840px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--reading-muted)' }}>
            Evaluacion
          </p>
          <h1 className="mt-2 font-display text-[30px] font-semibold leading-tight" style={{ color: 'var(--reading-ink)' }}>
            {detail.content.title}
          </h1>

          {/* Lo que cuesta, antes de gastar un intento. */}
          <dl className="mt-7 grid gap-3 sm:grid-cols-3">
            <GateFact label="Nota mínima" value={passingScore ? `${passingScore}%` : 'La del tenant'} />
            <GateFact label="Intentos usados" value={`${mine.length}`} />
            <GateFact label="Estado" value={passed ? 'Aprobada' : blocked ? 'Bloqueada' : open ? 'A medias' : 'Sin empezar'} />
          </dl>

          <div className="mt-8">
            <Button size="lg" className="min-w-[240px]" loading={starting} disabled={blocked || passed} onClick={() => void begin()}>
              {passed ? 'Ya la aprobaste' : open ? 'Retomar la evaluacion' : 'Empezar la evaluacion'}
            </Button>
            <p className="mt-3 max-w-[520px] text-sm" style={{ color: 'var(--reading-muted)' }}>
              {blocked
                ? 'Agotaste los intentos: tu analista tiene que habilitarte un refuerzo.'
                : passed
                  ? 'Queda registrada con la nota que sacaste. No hace falta repetirla.'
                  : open
                    ? 'Tienes un intento abierto. Al retomarlo sigues donde lo dejaste; no gastas otro.'
                    : 'Se abre a pantalla completa y sin el contenido a la vista: la evaluacion mide lo que recuerdas, no lo que puedes buscar.'}
            </p>
          </div>
        </div>
      </section>

      <ContentTabs
        description={detail.content.description ?? listed?.description ?? null}
        requirement={
          <p>
            Se aprueba con {passingScore ?? 'la nota minima de la empresa'}
            {passingScore ? '%' : ''} o mas. Los intentos son limitados y al agotarlos la formacion queda bloqueada
            hasta que tu analista habilite un refuerzo.
          </p>
        }
        course={course}
        currentContentId={currentContentId}
        original={null}
      />
    </div>
  );
}

function GateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--reading-line)' }}>
      <dt className="text-xs" style={{ color: 'var(--reading-muted)' }}>
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums" style={{ color: 'var(--reading-ink)' }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * LA ENCUESTA DENTRO DEL REPRODUCTOR (Decision #119).
 *
 * ─── SE RESPONDE UNA VEZ, Y SI YA ESTA SE DICE ───
 *
 * Volver a mostrarla en blanco invitaria a responderla otra vez, y una segunda respuesta contaria
 * doble en el indicador. Si ya se respondio, se agradece y se deja pasar.
 *
 * ─── NO BLOQUEA ───
 *
 * La pieza es `isRequired: false` (ver el enganche al publicar), asi que se puede saltar. Es
 * deliberado: si bloqueara, quien no opina se queda sin terminar la formacion y SIN CONSTANCIA —se
 * le negaria la evidencia de una capacitacion que si hizo por no haber dado su opinion—. Se pide y
 * se agradece; no se cobra.
 */
function SurveyGate({
  enrollmentId,
  templateId,
  nextLabel,
  onDone,
}: {
  enrollmentId: string;
  templateId: string;
  nextLabel: string;
  onDone: () => Promise<void>;
}) {
  const [encuesta, setEncuesta] = useState<SurveyParaResponder | null>(null);
  const [respuestas, setRespuestas] = useState<Respuestas>({});
  const [faltan, setFaltan] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    void getSurveyToAnswer(enrollmentId, templateId)
      .then((valor) => {
        setEncuesta(valor);
        if (valor.answered) setListo(true);
      })
      .catch(() => setEncuesta(null));
  }, [enrollmentId, templateId]);

  if (!encuesta) return <Skeleton className="mx-auto h-64 w-full max-w-[560px] rounded-2xl" />;

  if (listo) {
    return (
      <div className="mx-auto max-w-[480px] text-center">
        <p className="font-display text-xl font-bold text-ink-900">Gracias</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
          Tu respuesta ya quedo registrada. Sirve para mejorar la proxima formacion.
        </p>
        <Button size="lg" glow className="mt-6 w-full" onClick={() => void onDone()}>
          {nextLabel}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto mb-5 max-w-[560px] text-center">
        <p className="font-display text-xl font-bold text-ink-900">{encuesta.name}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          Son treinta segundos y es anonima para quien dicta la formacion.
        </p>
      </div>

      <SurveyRunner
        questions={encuesta.questions}
        value={respuestas}
        onChange={(valor) => {
          setRespuestas(valor);
          // El aviso se limpia al tocar algo: dejarlo puesto mientras se corrige regana dos veces.
          if (faltan.length > 0) setFaltan([]);
        }}
        faltan={faltan}
        submitting={enviando}
        onSubmit={async () => {
          const pendientes = loQueFaltaEnCliente(encuesta.questions, respuestas);
          if (pendientes.length > 0) {
            setFaltan(pendientes);
            return;
          }
          setEnviando(true);
          try {
            await answerSurvey(enrollmentId, templateId, respuestas);
            setListo(true);
          } finally {
            setEnviando(false);
          }
        }}
      />

      {/*
        SALTARLA ES UNA OPCION VISIBLE, no un truco. Esconderla obligaria a quien no quiere opinar a
        cerrar el navegador, y entonces la formacion se queda a medias por una encuesta opcional.
      */}
      <div className="mx-auto mt-4 max-w-[560px] text-center">
        <button
          type="button"
          onClick={() => void onDone()}
          className="focus-ring text-sm text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
        >
          Prefiero no responder
        </button>
      </div>
    </div>
  );
}
