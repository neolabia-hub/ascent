'use client';

import { X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl } from '@/lib/catalog-api';
import { getContent, saveProgress, type ContentDetail, type ProgressInput } from '@/lib/learner-api';
import { LessonCardView, requiresInteraction } from '@/components/modules/learner/lesson-cards';
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
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
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
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.contentId]);

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
      <main className="learner-surface flex min-h-screen items-center justify-center bg-ink-900 px-6 text-center">
        <div>
          <p className="text-base text-white/80">No pudimos abrir este contenido.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/aprender/${params.enrollmentId}`)}>
            Volver
          </Button>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="learner-surface min-h-screen bg-ink-900 px-5 py-6">
        <div className="mx-auto max-w-md space-y-4">
          <Skeleton className="h-1 w-full bg-white/10" />
          <Skeleton className="h-64 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-[52px] w-full rounded-md bg-white/10" />
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

  return (
    <main className="learner-surface flex min-h-screen flex-col bg-ink-900">
      <header className="shrink-0 px-5 pt-4">
        <div className="mx-auto flex max-w-md items-center gap-3">
          {isLesson ? (
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {cards.map((card, position) => (
                <span
                  key={card.id}
                  className="h-1 flex-1 rounded-full"
                  style={{ backgroundColor: position <= index ? 'var(--brand-accent)' : 'rgb(255 255 255 / 0.2)' }}
                />
              ))}
            </div>
          ) : (
            <p className="flex-1 truncate text-sm text-white/70">{detail.content.title}</p>
          )}
          <button
            type="button"
            aria-label="Salir"
            onClick={() => void leave()}
            className="focus-ring -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-white/70"
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
            router.push(`/aprender/${params.enrollmentId}`);
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
            router.push(`/aprender/${params.enrollmentId}`);
          }}
        />
      )}
    </main>
  );
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
        className="flex-1 overflow-y-auto px-5 py-8"
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
        <div className="mx-auto max-w-md">
          <LessonCardView key={card.id} payload={card.payload} onInteracted={onInteracted} />
        </div>
      </section>

      <footer className="shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="mx-auto max-w-md">
          <Button size="lg" className="w-full" disabled={blocked} loading={saving} onClick={() => void onAdvance()}>
            {isLast ? 'Terminar' : 'Siguiente'}
          </Button>
          {blocked ? <p className="mt-2 text-center text-sm text-white/50">Responde para continuar.</p> : null}
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
  const [watched, setWatched] = useState(0);
  const type = detail.content.type;
  const source = detail.package ? mediaUrl(detail.package.storageKey) : null;

  return (
    <>
      <section className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-md space-y-4">
          <h1 className="font-display text-xl font-semibold text-white">{detail.content.title}</h1>

          {type === 'VIDEO' && source ? (
            <video
              src={source}
              controls
              playsInline
              className="w-full rounded-lg"
              onTimeUpdate={(event) => {
                const element = event.currentTarget;
                if (!element.duration) return;
                setWatched((current) => Math.max(current, Math.round((element.currentTime / element.duration) * 100)));
              }}
            />
          ) : null}

          {type === 'DOCUMENT' && source ? (
            <>
              <iframe src={source} title={detail.content.title} className="h-[60vh] w-full rounded-lg bg-white" />
              <a
                href={source}
                target="_blank"
                rel="noreferrer"
                className="focus-ring block text-center text-sm text-white/70 underline"
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
              className="focus-ring block rounded-lg border border-white/20 px-4 py-3 text-center text-white underline"
            >
              Abrir el recurso
            </a>
          ) : null}

          {!source && type !== 'LINK' ? (
            <p className="text-base text-white/70">Este contenido no tiene material cargado.</p>
          ) : null}
        </div>
      </section>

      <footer className="shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="mx-auto max-w-md">
          <Button
            size="lg"
            className="w-full"
            loading={saving}
            onClick={() => void onDone(type === 'VIDEO' ? watched : 100)}
          >
            {type === 'VIDEO' ? 'Ya lo vi' : 'Ya lo lei'}
          </Button>
          {type === 'VIDEO' ? (
            <p className="mt-2 text-center text-sm text-white/50">Llevas {watched}% del video.</p>
          ) : null}
        </div>
      </footer>
    </>
  );
}
