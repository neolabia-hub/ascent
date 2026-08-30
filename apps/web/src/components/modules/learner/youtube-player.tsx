'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * REPRODUCTOR DE YOUTUBE QUE SI SE PUEDE COMPROBAR.
 *
 * Hasta ahora un video enlazado se daba por visto con un boton de confianza ("Confirmo que lo
 * vi"), porque el `<iframe>` de siempre no cuenta nada: es una ventana a otra plataforma. Para
 * formacion que tiene que sostenerse ante un auditor, eso era lo unico honesto que se podia
 * registrar (Decision #44).
 *
 * La API del reproductor de YouTube si responde `getCurrentTime()` y `getDuration()`, y con eso
 * se mide igual que con un archivo propio: SEGUNDOS DISTINTOS reproducidos, no la posicion
 * maxima alcanzada. Arrastrar la barra al final deja huecos y el porcentaje no sube.
 *
 * Lo que NO se hace: dar por medido lo que no se pudo medir. Si el script de YouTube no carga
 * —red corporativa que lo bloquea, telefono sin salida a ese dominio— el componente lo dice
 * (`onMeasurable(false)`) y la pantalla vuelve al boton de confianza. Quedarse esperando una
 * medicion que no va a llegar dejaria a la persona sin poder avanzar por una razon que no es
 * suya.
 */

/** Solo lo que se usa; la libreria de tipos completa de YouTube no vale la dependencia. */
interface YTPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void; onError?: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** El id del video, de las dos formas en que la gente pega un enlace de YouTube. */
export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1) || null;
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.slice('/embed/'.length) || null;
      return parsed.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

/** Cuanto se espera al script antes de aceptar que aqui no se va a poder medir. */
const API_TIMEOUT_MS = 8000;

let apiPromise: Promise<YTNamespace> | null = null;

/**
 * Carga la API UNA vez por pagina. `onYouTubeIframeAPIReady` es un global unico: si dos
 * reproductores lo definieran, el segundo pisaria al primero y uno de los dos no arrancaria.
 */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const timer = window.setTimeout(() => reject(new Error('YOUTUBE_API_TIMEOUT')), API_TIMEOUT_MS);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YOUTUBE_API_MISSING'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('YOUTUBE_API_BLOCKED'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Que un fallo no deje la promesa envenenada para el resto de la sesion.
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

export interface YouTubePlayerProps {
  videoId: string;
  title: string;
  /** Porcentaje de segundos DISTINTOS reproducidos, 0-100. */
  onProgress: (pct: number) => void;
  /** false = aqui no se puede medir; la pantalla debe volver a la declaracion de la persona. */
  onMeasurable: (measurable: boolean) => void;
}

export function YouTubePlayer({ videoId, title, onProgress, onMeasurable }: YouTubePlayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const watched = useRef<Set<number>>(new Set());
  const [failed, setFailed] = useState(false);

  // Los callbacks entran por ref: si la pantalla los redefine en cada render, el efecto no debe
  // reconstruir el reproductor (y con el, perder los segundos ya contados).
  const progressRef = useRef(onProgress);
  const measurableRef = useRef(onMeasurable);
  progressRef.current = onProgress;
  measurableRef.current = onMeasurable;

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    let timer: number | null = null;
    watched.current = new Set();

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        player = new YT.Player(host.current, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              measurableRef.current(true);
              // Se muestrea cada segundo: es el grano de la medida. Marcar el segundo por el que
              // pasa la reproduccion es lo que hace que saltar hacia adelante deje huecos.
              timer = window.setInterval(() => {
                if (!player) return;
                const duration = player.getDuration();
                if (!duration || !Number.isFinite(duration)) return;
                watched.current.add(Math.floor(player.getCurrentTime()));
                progressRef.current(Math.min(100, Math.round((watched.current.size / duration) * 100)));
              }, 1000);
            },
            onError: () => {
              if (cancelled) return;
              setFailed(true);
              measurableRef.current(false);
            },
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        measurableRef.current(false);
      });

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      player?.destroy();
    };
  }, [videoId]);

  // Sin medicion se vuelve al iframe de siempre: el video se ve igual, y quien decide si eso
  // basta es la pantalla de arriba, no este componente.
  if (failed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          className="h-full w-full"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
      {/* La API SUSTITUYE este div por su iframe; por eso no lleva contenido propio. */}
      <div ref={host} className="h-full w-full" />
    </div>
  );
}
