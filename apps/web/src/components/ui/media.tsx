'use client';

import type { VideoHTMLAttributes } from 'react';
import { CROSS_ORIGIN_MEDIOS, useMediaUrl } from '@/lib/use-media-url';

/**
 * Imagen y video de un archivo del almacenamiento.
 *
 * Existen como componentes —y no como una funcion que devuelva la URL— porque resolver la firma
 * es asincrono, y una funcion no puede esperar. Metido en un componente, cada elemento pide su
 * firma cuando se monta y se dibuja cuando la tiene, sin que quien lo usa tenga que enterarse.
 *
 * Mientras no hay firma no se pinta un elemento roto: se deja el hueco, o se dice lo que pasa.
 *
 * POR QUE LLEVAN `crossOrigin` SOLO A VECES: el porque entero esta en `use-media-url.ts`. En
 * resumen: hace falta cuando la API esta en otro origen (desarrollo) y ESTORBA cuando no lo esta
 * (produccion), donde el 302 hacia el bucket acaba bloqueado por CORS. Fijarlo en "anonymous"
 * arreglaba desarrollo y tumbaba el video del cliente: el 2026-09-10 no se reproducia ninguno.
 */

export function MediaImage({
  storageKey,
  alt,
  className,
  style,
}: {
  storageKey: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const url = useMediaUrl(storageKey);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} crossOrigin={CROSS_ORIGIN_MEDIOS} />;
}

export function MediaVideo({
  storageKey,
  ...props
}: { storageKey: string | null | undefined } & VideoHTMLAttributes<HTMLVideoElement>) {
  const url = useMediaUrl(storageKey);
  if (!url) return null;
  return <video src={url} crossOrigin={CROSS_ORIGIN_MEDIOS} {...props} />;
}
