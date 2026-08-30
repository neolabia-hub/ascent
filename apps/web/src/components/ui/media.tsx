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
 *
 * POR QUE LLEVAN `crossOrigin`, y es la otra mitad del arreglo de los archivos que no se veian:
 * la web y la API viven en origenes distintos. Sin ese atributo el navegador pide el archivo en
 * modo "no-cors" y Chrome ABANDONA la carga EN SILENCIO —el video se queda girando para siempre,
 * sin error en consola y sin nada en la pestana de red—. Con `crossOrigin` la peticion viaja como
 * CORS, que es lo que la API si responde. Comprobado el 2026-08-28: mismo archivo, misma URL
 * firmada, sin el atributo `readyState` se queda en 0 y con el llega a 4.
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
  return <img src={url} alt={alt} className={className} style={style} crossOrigin="anonymous" />;
}

export function MediaVideo({
  storageKey,
  ...props
}: { storageKey: string | null | undefined } & VideoHTMLAttributes<HTMLVideoElement>) {
  const url = useMediaUrl(storageKey);
  if (!url) return null;
  return <video src={url} crossOrigin="anonymous" {...props} />;
}
