'use client';

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Popover } from './popover';

/**
 * LA EXPLICACION LARGA, DETRAS DE UN ICONO (pedido por el cliente el 2026-09-06).
 *
 * ─── POR QUE ───
 *
 * No fue una peticion sobre un campo, fue una regla: **nada de textos largos a la vista**. Varios
 * `hint` de los formularios ocupaban tres renglones, empujaban el resto del formulario hacia abajo
 * y, con veinte campos, convertian una pantalla en un muro. La explicacion hace falta —la primera
 * vez que alguien ve "El certificado vence el" la necesita— pero la hace falta UNA vez, no las
 * cuatrocientas siguientes que entra a la misma pantalla.
 *
 * Asi que el texto no se borra: se guarda detras de un icono al lado del rotulo, y quien lo
 * necesita lo abre. La informacion no se pierde, deja de ocupar sitio.
 *
 * ─── DONDE VA ───
 *
 * `Field` lo monta solo: pasarle `ayuda` en vez de `hint` mueve el texto al icono. `hint` sigue
 * existiendo a proposito, para las notas de un renglon que se leen mejor a la vista que
 * escondidas: la regla es LARGO detras del icono, corto debajo del campo.
 *
 * La mecanica del panel —portal, colocacion, cerrar al pulsar fuera o con Escape— es de `Popover`,
 * que la comparte con el motivo de la falta. Dos paneles con dos mecanicas distintas se comportan
 * distinto en el borde de la pantalla, y eso se nota.
 */
export function Ayuda({
  children,
  /** Que explica, para el lector de pantalla: "Ver la explicacion de El certificado vence el". */
  sobre,
  className,
}: {
  children: ReactNode;
  sobre: string;
  className?: string;
}) {
  return (
    <Popover
      etiqueta={`Ver la explicacion de ${sobre}`}
      botonClassName={cn('inline-flex h-4 w-4 items-center justify-center rounded-full', className)}
      ancho="w-72"
      className="text-xs font-normal leading-relaxed text-ink-700"
      boton={(abierta) => (
        <Info
          className={cn(
            'h-3.5 w-3.5 transition-colors duration-150',
            abierta ? 'text-ink-900' : 'text-ink-300 hover:text-ink-700',
          )}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
    >
      {children}
    </Popover>
  );
}
