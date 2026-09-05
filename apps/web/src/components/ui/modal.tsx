'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Acciones en la CABECERA, al lado de la X.
   *
   * Para la accion suelta —"editar esto que estas leyendo"— que en un pie ocuparia una franja
   * entera para un solo boton. Un formulario con Guardar y Cancelar sigue yendo en el pie: ahi la
   * accion cierra la tarea y el sitio donde se busca es abajo.
   */
  actions?: ReactNode;
  /**
   * ANCHO. `md` (560) es el de siempre: leer, o un formulario de una columna.
   *
   * `lg` (880) es para lo que se arma MIRANDO el resultado —el formulario de desempeno con su
   * vista previa al lado—: en 560 la vista previa habria que esconderla detras de un boton, y una
   * vista previa que hay que ir a buscar no se mira.
   */
  size?: 'md' | 'lg';
  /**
   * ICONO de cabecera, en su pastilla de color de marca.
   *
   * No es adorno: una ventana en blanco y negro con un titulo de 18px se parece a todas las demas,
   * y en un producto donde se abren cinco al dia el icono es lo que hace reconocible «esta es la de
   * crear el ciclo» antes de leer nada. Mismo lenguaje que el estado vacio.
   */
  icon?: LucideIcon;
}

/**
 * VENTANA CENTRADA, PARA LEER — no para editar (Decision #131).
 *
 * ─── POR QUE EXISTE SI YA HAY UN CAJON LATERAL ───
 *
 * El cajon derecho es para EDITAR: aparece al lado, deja ver la lista detras y uno guarda y sigue.
 * Eso lo hace bueno para formularios y malo para consultar, porque secuestra la mitad derecha de la
 * pantalla para ensenar dos parrafos.
 *
 * Esto es lo contrario: se abre en el centro, se lee y se cierra. Se usa para lo que hace falta una
 * vez al trimestre —el objetivo del plan, su alcance— y que hasta ahora ocupaba sitio fijo en una
 * pantalla que se abre todos los dias.
 *
 * Regla: **si tiene campos, cajon. Si es para leer, ventana.**
 *
 * El resto —cerrar con Escape, foco atrapado, clic fuera, fondo inerte para lectores de pantalla—
 * lo pone Radix; escribirlo a mano es la forma habitual de dejarse la mitad.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  actions,
  size = 'md',
  icon: Icono,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/*
          EL FONDO SE DIFUMINA, no solo se oscurece.

          Un velo plano apaga la pantalla; el desenfoque la manda al fondo de verdad — el ojo deja
          de poder leer lo de atras y la ventana pasa a ser lo unico legible. Es la misma sensacion
          del buscador al abrirse, y el mismo recurso que usan las hojas de iOS y de Apple TV.

          El velo sigue siendo suave (30%): con el desenfoque no hace falta oscurecer mas, y una
          pantalla casi negra detras de una ventana pequena se siente pesada.
        */}
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-[6px]',
            'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
          )}
        />
        <Dialog.Content
          className={cn(
            // Centrada y con tope de alto: si el contenido crece, hace scroll DENTRO y no empuja
            // la ventana fuera de la pantalla, que es como se pierden los botones del pie.
            'fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)]',
            size === 'lg' ? 'max-w-[880px]' : 'max-w-[560px]',
            '-translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-surface shadow-card-hover focus:outline-none',
            'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
          )}
        >
          {/*
            LA CABECERA VA TENIDA, y no es adorno.

            Una ventana blanca sobre un velo oscuro se lee como una hoja de papel plana: el titulo,
            el contenido y el pie flotan sin jerarquia. Una banda de fondo arriba separa "de que va
            esto" de "esto es lo que dice", que es la misma division que ya usan las tarjetas del
            producto.

            NO lleva el borde aurora del buscador: ese halo significa una cosa concreta en este
            producto —ahi hay busqueda inteligente— y prestarselo a una ventana de solo lectura lo
            vaciaria de significado. Un lenguaje visual sirve mientras cada senal signifique una
            sola cosa.
          */}
          <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-line bg-paper px-6 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {Icono ? (
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                  aria-hidden="true"
                >
                  <Icono className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
              ) : null}
              <div className="min-w-0">
                <Dialog.Title className="font-display text-lg font-semibold text-ink-900">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-0.5 text-sm text-ink-500">{description}</Dialog.Description>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="focus-ring shrink-0 rounded-md p-1.5 text-ink-500 transition-colors duration-150 hover:bg-surface hover:text-ink-900"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer ? <div className="border-t border-line px-6 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
