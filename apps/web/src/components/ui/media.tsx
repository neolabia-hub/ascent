'use client';

import type { VideoHTMLAttributes } from 'react';
import { useMediaUrl } from '@/lib/use-media-url';

/**
 * Imagen y video de un archivo del almacenamiento.
 *
 * Existen como componentes —y no como una funcion que devuelva la URL— porque resolver la firma
 * es asincrono, y una funcion no puede esperar. Metido en un componente, cada elemento pide su
 * firma cuando se monta y se dibuja cuando la tiene, sin que quien lo usa tenga que enterarse.
 *
 * Mientras no hay firma no se pinta un elemento roto: se deja el hueco, o se dice lo que pasa.
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
  return <img src={url} alt={alt} className={className} style={style} />;
}

export function MediaVideo({
  storageKey,
  ...props
}: { storageKey: string | null | undefined } & VideoHTMLAttributes<HTMLVideoElement>) {
  const url = useMediaUrl(storageKey);
  if (!url) return null;
  return <video src={url} {...props} />;
}
