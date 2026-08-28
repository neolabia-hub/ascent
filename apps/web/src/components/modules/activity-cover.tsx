'use client';

import { cn } from '@/components/ui/cn';

/**
 * PORTADA de una formacion, dibujada por codigo.
 *
 * POR QUE NO HAY FOTOGRAFIAS: las plataformas de contenido (Netflix y compania) apoyan todo su
 * peso visual en el poster. Aqui no existe ese poster —una pildora sobre el uso del casco en
 * bodega no tiene cartel— y rellenar con fotos de banco de imagenes es peor que no poner nada:
 * no dice nada del contenido, se repite entre formaciones y envejece en un ano.
 *
 * La alternativa es una identidad GENERADA: el patron sale del id de la actividad, asi que la
 * misma formacion se ve siempre igual, en el catalogo del aprendiz y en el del administrador, y
 * entre sesiones. Tres familias de patron dan variedad de "portadas" sin caer en el ruido.
 */

export interface ActivityCoverProps {
  /** Semilla estable: el id de la actividad. */
  seed: string;
  /** Color del tipo de formacion. Si falta, se usa el de la marca. */
  colorHex?: string | null;
  /** Texto corto sobre la portada (el tipo: "Pildora", "Induccion general"). */
  label?: string | null;
  className?: string;
  /** `wide` para el heroe y la ficha; `tile` para las tarjetas del catalogo. */
  variant?: 'tile' | 'wide';
}

/** Hash determinista y estable entre sesiones (no se usa Math.random a proposito). */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

export function ActivityCover({ seed, colorHex, label, className, variant = 'tile' }: ActivityCoverProps) {
  const base = colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : 'var(--brand-primary)';
  const noise = hash(seed);
  const family = noise % 3;
  const id = `cv${noise.toString(36)}`;

  // El foco de luz se mueve con la semilla: dos formaciones seguidas no se ven iguales.
  const lightX = 20 + (noise % 4) * 20;
  const lightY = 15 + ((noise >> 3) % 3) * 25;
  const tilt = -25 + ((noise >> 11) % 6) * 10;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg',
        variant === 'tile' ? 'aspect-[16/10]' : 'aspect-[21/9]',
        className,
      )}
      style={{ backgroundColor: base }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          {/* Luz desde una esquina: da volumen sin necesidad de una foto. */}
          <radialGradient id={`${id}-light`} cx={`${lightX}%`} cy={`${lightY}%`} r="85%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
          </radialGradient>
          {/* Sombra al pie: asienta la portada y despega el texto que va encima. */}
          <linearGradient id={`${id}-foot`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="60%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        <g transform={`rotate(${tilt} 50 30)`}>
          {family === 0 ? <Arcs noise={noise} /> : family === 1 ? <Bands noise={noise} /> : <Blobs noise={noise} />}
        </g>

        <rect width="100" height="60" fill={`url(#${id}-light)`} />
        <rect width="100" height="60" fill={`url(#${id}-foot)`} />
      </svg>

      {label ? (
        <span className="absolute left-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-white backdrop-blur-sm">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** Ondas concentricas: la familia mas serena, para inducciones y formacion larga. */
function Arcs({ noise }: { noise: number }) {
  const cx = 15 + (noise % 5) * 18;
  const cy = 10 + ((noise >> 4) % 4) * 14;
  const rings = 5 + ((noise >> 7) % 3);
  return (
    <g stroke="#ffffff" fill="none">
      {Array.from({ length: rings }).map((_, index) => (
        <circle key={index} cx={cx} cy={cy} r={8 + index * 13} strokeOpacity={0.2 - index * 0.022} strokeWidth={1.4} />
      ))}
    </g>
  );
}

/** Franjas diagonales: la mas grafica, funciona bien en tarjetas pequenas. */
function Bands({ noise }: { noise: number }) {
  const count = 4 + ((noise >> 5) % 3);
  const gap = 16 + ((noise >> 9) % 3) * 6;
  return (
    <g fill="#ffffff">
      {Array.from({ length: count }).map((_, index) => (
        <rect
          key={index}
          x={-40 + index * gap}
          y={-30}
          width={gap * 0.42}
          height={130}
          fillOpacity={0.13 - index * 0.014}
          rx={2}
        />
      ))}
    </g>
  );
}

/** Masas superpuestas: la mas organica, da un aire de "portada" a las pildoras. */
function Blobs({ noise }: { noise: number }) {
  const shapes = [
    { cx: 20 + (noise % 30), cy: 12 + ((noise >> 3) % 20), r: 26 + ((noise >> 6) % 12), o: 0.16 },
    { cx: 62 + ((noise >> 8) % 26), cy: 38 + ((noise >> 5) % 18), r: 32 + ((noise >> 10) % 14), o: 0.12 },
    { cx: 44 + ((noise >> 12) % 20), cy: 4 + ((noise >> 7) % 14), r: 18 + ((noise >> 2) % 10), o: 0.1 },
  ];
  return (
    <g fill="#ffffff">
      {shapes.map((shape, index) => (
        <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fillOpacity={shape.o} />
      ))}
    </g>
  );
}
