'use client';

import { Check, Loader2, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { subirEvidencia } from '@/lib/delivery-api';
import { useMediaUrl } from '@/lib/use-media-url';
import { cn } from './cn';

/**
 * ADJUNTAR UN PAPEL: el certificado de un tercero, o el acta firmada de la jornada.
 *
 * ─── POR QUE UNA PIEZA Y NO DOS BOTONES ───
 *
 * Son el mismo gesto en dos sitios distintos —uno por persona en la lista, uno por jornada arriba—
 * y el gesto tiene mas partes de las que parece: elegir, subir mientras se espera, decir que quedo,
 * poder quitarlo, y explicar el fallo cuando el archivo no vale. Escrito dos veces, la segunda se
 * queda sin la mitad.
 *
 * ─── EL BOTON ES PEQUEÑO A PROPOSITO ───
 *
 * En la lista de asistencia va DENTRO de una celda, y esa tabla ya perdio dos peleas contra el
 * ancho. Sin archivo es un clip; con archivo, un visto y el nombre recortado. Nunca un campo de
 * subida de los del navegador, que ocupan media columna y ademas se ven distintos en cada uno.
 *
 * ─── Y SE PUEDE VOLVER A ABRIR ───
 *
 * El nombre del archivo es un enlace. Parece obvio y no lo era: hasta el 2026-09-08 esto solo
 * enseñaba un visto, asi que la evidencia se subia y **no habia forma de verla** —ni para comprobar
 * que se subio la hoja correcta, ni para enseñarsela a un auditor sin entrar a la base—. Lo cazo el
 * cliente al adjuntar un certificado.
 *
 * La URL se pide FIRMADA al servidor (`useMediaUrl`): el endpoint que sirve archivos no puede exigir
 * la cabecera de autorizacion, asi que lo que protege el acceso es una firma que caduca y va atada a
 * esa clave. Mientras llega, el nombre sigue siendo texto: nunca un enlace roto.
 *
 * ─── LO QUE NO HACE ───
 *
 * No guarda nada por su cuenta. Devuelve la CLAVE por `onSubido` y quien la recibe la manda cuando
 * se guarda la lista. Un archivo subido y no guardado queda huerfano en el disco, que es barato; una
 * fila de evidencia sin nada detras es lo caro en una auditoria. Ver `media.controller.ts`.
 */
export function Adjuntar({
  valor,
  nombre,
  onSubido,
  onQuitar,
  etiqueta,
  disabled = false,
  className,
}: {
  /** La clave ya guardada, si la hay. */
  valor: string | null | undefined;
  /** El nombre del archivo, para poder enseñarlo sin ir a buscarlo. */
  nombre?: string | null;
  onSubido: (evidencia: { key: string; originalName: string }) => void;
  onQuitar: () => void;
  /** Para el lector de pantalla: "Adjuntar el certificado de Ana Perez". */
  etiqueta: string;
  disabled?: boolean;
  className?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const url = useMediaUrl(valor);

  async function elegido(archivo: File | undefined) {
    if (!archivo) return;
    setFallo(null);
    setSubiendo(true);
    try {
      const subida = await subirEvidencia(archivo);
      onSubido({ key: subida.key, originalName: subida.originalName });
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo subir.');
    } finally {
      setSubiendo(false);
      // Se limpia para que volver a elegir EL MISMO archivo dispare el evento otra vez: si no, tras
      // un fallo hay que elegir otro distinto para poder reintentar, y eso no lo adivina nadie.
      if (entrada.current) entrada.current.value = '';
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <input
        ref={entrada}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => void elegido(e.target.files?.[0])}
      />
      {valor ? (
        <>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              title={`Ver ${nombre ?? 'el archivo adjunto'}`}
              className="focus-ring inline-flex h-7 max-w-[9rem] items-center gap-1 truncate rounded-md border border-ok/30 bg-ok-soft px-2 text-xs text-ok underline decoration-ok/40 underline-offset-2 hover:decoration-ok"
            >
              <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              <span className="truncate">{nombre ?? 'Adjunto'}</span>
            </a>
          ) : (
            <span
              title={nombre ?? 'Archivo adjunto'}
              className="inline-flex h-7 max-w-[9rem] items-center gap-1 truncate rounded-md border border-ok/30 bg-ok-soft px-2 text-xs text-ok"
            >
              <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
              <span className="truncate">{nombre ?? 'Adjunto'}</span>
            </span>
          )}
          {!disabled ? (
            <button
              type="button"
              onClick={onQuitar}
              aria-label={`Quitar el archivo de ${etiqueta}`}
              className="focus-ring rounded-md p-1 text-ink-500 transition-colors duration-150 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          disabled={disabled || subiendo}
          onClick={() => entrada.current?.click()}
          aria-label={`Adjuntar ${etiqueta}`}
          className={cn(
            'focus-ring inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-xs transition-colors duration-150',
            subiendo ? 'text-ink-500' : 'text-ink-700 hover:bg-paper hover:text-ink-900',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {subiendo ? (
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Paperclip className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          )}
          {subiendo ? 'Subiendo' : 'Adjuntar'}
        </button>
      )}
      {fallo ? <span className="text-xs text-danger">{fallo}</span> : null}
    </span>
  );
}
