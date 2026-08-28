'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/**
 * Resuelve la URL FIRMADA de un archivo del almacenamiento.
 *
 * Por que no se puede construir en el cliente: el endpoint que sirve archivos no puede exigir la
 * cabecera de autorizacion, porque una etiqueta `<img>` o `<video>` no la envia —eso hacia que
 * ningun archivo subido se viera nunca—. La firma la emite el servidor tras comprobar que el
 * archivo pertenece a la empresa de quien la pide, y caduca en una hora.
 *
 * Se cachea en memoria porque una leccion puede repetir la misma imagen en varias tarjetas y no
 * tiene sentido pedir una firma por cada una.
 */
const cache = new Map<string, string>();

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export function useMediaUrl(storageKey: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (storageKey ? (cache.get(storageKey) ?? null) : null));

  useEffect(() => {
    if (!storageKey) {
      setUrl(null);
      return;
    }
    const cached = cache.get(storageKey);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    void apiFetch<{ url: string }>(`/media/sign?key=${encodeURIComponent(storageKey)}`, { method: 'GET' })
      .then((response) => {
        const absolute = `${API_URL}${response.url}`;
        cache.set(storageKey, absolute);
        if (!cancelled) setUrl(absolute);
      })
      .catch(() => {
        // Sin firma no hay archivo: la pantalla lo dice, no se queda con un hueco roto.
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  return url;
}
