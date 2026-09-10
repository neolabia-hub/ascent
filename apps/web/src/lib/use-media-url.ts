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

/**
 * `crossOrigin` PARA LAS ETIQUETAS DE MEDIOS — solo cuando de verdad hace falta.
 *
 * Se puso fijo en `anonymous` el 2026-08-28 con una razon buena: en DESARROLLO la web vive en el
 * 3200 y la API en el 3002, y sin ese atributo Chrome pide el archivo en modo "no-cors" y ABANDONA
 * la carga en silencio — el video gira para siempre, sin error en consola.
 *
 * Pero en PRODUCCION el atributo hace justo lo contrario, y tumbo el video del cliente:
 *
 *   1. `NEXT_PUBLIC_API_URL` va vacia a proposito (un subdominio por empresa), asi que la web llama
 *      a la API por ruta relativa: MISMO origen.
 *   2. Esa peticion la responde la API con un 302 hacia una URL prefirmada de R2, que es OTRO
 *      origen.
 *   3. Con `crossOrigin` puesto, ese salto viaja en modo CORS. Y el bucket no devuelve
 *      `Access-Control-Allow-Origin`, asi que el navegador recibe los bytes (206) y los tira.
 *
 * Sin el atributo, un `<video>` carga de cualquier origen sin pedir permiso —es como funciona
 * cualquier video servido desde una CDN— y el redireccionamiento deja de ser un problema.
 *
 * Asi que se pone SOLO cuando la API esta en otro origen, que es exactamente el caso que lo
 * necesitaba. En produccion sale `undefined` y el video se reproduce.
 *
 * NO sustituye a la politica CORS del bucket (`scripts/r2-cors.sh`), que sigue haciendo falta el
 * dia que los videos lleven subtitulos: una pista `<track>` de otro origen si exige CORS. Lo que
 * consigue es que reproducir un video no dependa de ella.
 */
export const CROSS_ORIGIN_MEDIOS: 'anonymous' | undefined = API_URL ? 'anonymous' : undefined;

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
