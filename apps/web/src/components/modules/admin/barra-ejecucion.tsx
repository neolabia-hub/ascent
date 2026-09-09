'use client';

import {
  ESTADOS,
  ORDEN_ESTADOS,
  conteoPorEstado,
  type EstadoEjecucion,
  type ResumenEjecucion,
} from '@/lib/reports-api';
import { cn } from '@/components/ui/cn';

/**
 * COMO VA UNA EJECUCION, en una barra (Decision #122).
 *
 * ─── POR QUE UNA BARRA APILADA Y NO UN PORCENTAJE ───
 *
 * "62%" no dice que hacer. La misma cifra puede significar dos cosas opuestas:
 *
 *   62% con el resto ATRASADO      -> hay que perseguir a treinta personas.
 *   62% con el resto ESPERANDO     -> no hay a quien perseguir: falta programar la jornada.
 *
 * La barra enseña las dos de un vistazo y sin leer numeros. Es la diferencia entre un indicador que
 * se mira y uno que se usa.
 *
 * ─── EL ORDEN DE LOS TRAMOS NO ES ARBITRARIO ───
 *
 * Lo terminado va PRIMERO, pegado a la izquierda, porque una barra de progreso se lee de izquierda
 * a derecha y lo que avanza tiene que crecer desde ahi. Lo demas se ordena por urgencia. Si lo
 * atrasado empezara a la izquierda, la barra parecería retroceder al mejorar.
 */
export function BarraEjecucion({
  resumen,
  onFiltrar,
  activo,
  compacta = false,
}: {
  resumen: ResumenEjecucion;
  /** Si se pasa, cada tramo filtra. Sin esto la barra solo informa. */
  onFiltrar?: (estado: EstadoEjecucion | null) => void;
  activo?: EstadoEjecucion | null;
  compacta?: boolean;
}) {
  const conteo = conteoPorEstado(resumen);
  // Lo terminado primero; el resto por urgencia. Ver la nota de arriba.
  const tramos: EstadoEjecucion[] = ['TERMINADA', ...ORDEN_ESTADOS.filter((estado) => estado !== 'TERMINADA')];

  if (resumen.total === 0) {
    return <p className="text-xs text-ink-300">Nadie la tiene asignada.</p>;
  }

  return (
    <div>
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-paper', compacta ? 'h-1.5' : 'h-2.5')}
        role="img"
        aria-label={`${resumen.terminadas} de ${resumen.total} terminadas`}
      >
        {tramos.map((estado) => {
          const cuantos = conteo[estado];
          if (cuantos === 0) return null;
          return (
            <span
              key={estado}
              className="h-full transition-all duration-300 ease-pulse"
              style={{ width: `${(cuantos / resumen.total) * 100}%`, backgroundColor: ESTADOS[estado].punto }}
              title={`${ESTADOS[estado].label}: ${cuantos}`}
            />
          );
        })}
      </div>

      {!compacta ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ORDEN_ESTADOS.map((estado) => {
            const cuantos = conteo[estado];
            // Un estado con cero no se pinta: una leyenda con seis chips de los que cuatro dicen
            // "0" es ruido que hay que leer para descartar.
            if (cuantos === 0) return null;
            const seleccionado = activo === estado;

            const contenido = (
              <>
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ESTADOS[estado].punto }}
                />
                {ESTADOS[estado].label}
                <span className="tabular-nums font-semibold">{cuantos}</span>
              </>
            );

            if (!onFiltrar) {
              return (
                <span
                  key={estado}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-700"
                >
                  {contenido}
                </span>
              );
            }

            return (
              <button
                key={estado}
                type="button"
                aria-pressed={seleccionado}
                // Pulsar el que ya esta activo lo quita: es la forma de volver a verlo todo sin
                // buscar un boton de "quitar filtro" en otro sitio.
                onClick={() => onFiltrar(seleccionado ? null : estado)}
                className={cn(
                  'focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all duration-150',
                  seleccionado
                    ? 'border-transparent bg-primary-soft font-medium text-primary'
                    : 'border-line text-ink-700 hover:-translate-y-px hover:border-line-strong',
                )}
              >
                {contenido}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** El distintivo de un estado, en una tabla. */
export function ChipEstado({ estado }: { estado: EstadoEjecucion }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', ESTADOS[estado].chip)}>
      {ESTADOS[estado].label}
    </span>
  );
}
