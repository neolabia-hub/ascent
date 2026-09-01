'use client';

import { UserRound } from 'lucide-react';
import { useMediaUrl } from '@/lib/use-media-url';
import { cn } from './cn';

/**
 * LA CARA DE UNA PERSONA (Decision #105).
 *
 * ─── POR QUE DEJARON DE SER LAS INICIALES ───
 *
 * El avatar era siempre dos letras sobre un cuadro de color. Funciona como respaldo y no como
 * destino: en una empresa de seiscientas personas hay decenas de "JG", y en un turno con tres
 * apellidos repetidos dos letras no identifican a nadie. Una cara si, de inmediato y sin leer.
 *
 * ─── EL RESPALDO, EN ORDEN ───
 *
 * 1. La FOTO, si la subio.
 * 2. Sus INICIALES, si sabemos el nombre. Siguen siendo mejores que un icono generico: al menos
 *    distinguen a dos personas sentadas en la misma pantalla.
 * 3. Un icono de persona, cuando ni el nombre hay.
 *
 * Nunca un hueco vacio: en una barra superior se lee como que algo no cargo.
 *
 * `object-cover` y no `contain` —al reves que el logo del tenant—: aqui el recorte es lo correcto.
 * Una foto de carnet dentro de un circulo tiene que llenarlo; dejarla "entera" con bandas a los
 * lados es lo que hace que un avatar parezca un cromo.
 */
export function Avatar({
  avatarKey,
  fullName,
  size = 32,
  className,
}: {
  avatarKey: string | null | undefined;
  fullName: string;
  /** Lado en pixeles. La tipografia de las iniciales se escala con el. */
  size?: number;
  className?: string;
}) {
  const url = useMediaUrl(avatarKey);
  const iniciales = calcularIniciales(fullName);

  const base = cn('shrink-0 overflow-hidden rounded-full', className);
  const estilo = { width: size, height: size } as const;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={fullName} className={cn(base, 'object-cover')} style={estilo} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(base, 'flex items-center justify-center font-semibold text-white')}
      style={{ ...estilo, backgroundColor: 'var(--brand-primary)', fontSize: Math.round(size * 0.36) }}
    >
      {iniciales || <UserRound style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.75} />}
    </span>
  );
}

/** Primera y ultima palabra del nombre: "Juan Carlos Gomez Diaz" -> "JD". */
function calcularIniciales(fullName: string): string {
  const partes = fullName.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return `${primera}${ultima}`.toUpperCase();
}
