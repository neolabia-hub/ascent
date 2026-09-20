'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

/**
 * UN PANEL QUE SE ABRE AL PULSAR UN BOTON.
 *
 * ─── POR QUE VA EN UN PORTAL Y NO DEBAJO DEL BOTON ───
 *
 * Es la razon de que exista esta pieza y no un `div` con `absolute` en cada sitio. Las tablas de
 * esta aplicacion viven dentro de un contenedor con `overflow-x-auto` —hace falta para que una
 * tabla ancha ruede en vez de romperse—, y **ese contenedor recorta a sus hijos posicionados**. Un
 * panel abierto desde una celda saldria cortado por el borde de la tabla, o peor: aparecerira a
 * medias y con una barra de desplazamiento propia.
 *
 * Asi que el panel se pinta en `document.body` con `position: fixed`, y su sitio se calcula desde
 * el rectangulo del boton. Nada lo recorta.
 *
 * ─── SE COLOCA SOLO ───
 *
 * Debajo del boton si cabe; encima si no. Y se acota a los bordes de la ventana, que es lo que
 * evita que un panel abierto desde la ultima columna se salga por la derecha.
 *
 * ─── AL PULSAR, NO AL PASAR POR ENCIMA ───
 *
 * Un panel que sale con el raton no existe para quien va con el dedo ni para quien navega con
 * teclado. Al pulsar funciona en los tres sitios y no aparece sin que nadie lo pida.
 */
export function Popover({
  boton,
  etiqueta,
  children,
  ancho = 'w-72',
  botonClassName,
  className,
  onAbrir,
}: {
  /** Lo que se ve dentro del boton. Recibe si esta abierta, para poder marcarlo. */
  boton: (abierta: boolean) => ReactNode;
  /** Nombre del boton para lectores de pantalla: "Motivo de la falta de Ana Perez". */
  etiqueta: string;
  /**
   * El contenido del panel. Como FUNCION recibe `cerrar`, que es lo que necesita un menu: al pulsar
   * una opcion el panel tiene que irse, y el cierre por clic fuera no se entera de un clic dentro.
   */
  children: ReactNode | ((cerrar: () => void) => ReactNode);
  /** Clase de ancho del panel. */
  ancho?: string;
  botonClassName?: string;
  className?: string;
  /** Para poner el foco en el primer campo al abrirlo. */
  onAbrir?: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [sitio, setSitio] = useState<{ top: number; left: number } | null>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const colocar = useCallback(() => {
    const b = disparador.current?.getBoundingClientRect();
    if (!b) return;
    const alto = panel.current?.offsetHeight ?? 160;
    const anchoPanel = panel.current?.offsetWidth ?? 288;
    const MARGEN = 8;
    // Debajo si cabe; si no, encima. Y siempre dentro de la ventana.
    const cabeDebajo = b.bottom + alto + MARGEN <= window.innerHeight;
    const top = cabeDebajo ? b.bottom + 6 : Math.max(MARGEN, b.top - alto - 6);
    const left = Math.min(Math.max(MARGEN, b.left), window.innerWidth - anchoPanel - MARGEN);
    setSitio({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!abierta) return;
    colocar();
  }, [abierta, colocar]);

  useEffect(() => {
    /*
      HASTA QUE EL PANEL NO TIENE SITIO, NO SE ESCUCHA EL DESPLAZAMIENTO (2026-09-15).

      El panel se cierra al rodar la pagina, y eso incluye el desplazamiento que provoca el
      NAVEGADOR al enfocar algo: un panel con `autoFocus` dentro —el motivo de una falta, sin ir mas
      lejos— pedia el foco en el mismo instante en que se montaba, y si el foco llegaba antes de que
      `colocar()` lo pusiera en su sitio, el navegador rodaba para alcanzarlo y ese desplazamiento
      **cerraba el panel recien abierto**. Quien lo vivia lo contaba como "lo abri y se cerro solo",
      y en la suite salia como un tiempo de espera agotado esperando el campo.

      Esperar a `sitio` corta la carrera de raiz: mientras el panel no esta colocado, un
      desplazamiento no significa que la persona se haya movido — significa que todavia se esta
      montando.
    */
    if (!abierta || !sitio) return;
    function fuera(evento: MouseEvent) {
      const destino = evento.target as Node;
      if (disparador.current?.contains(destino) || panel.current?.contains(destino)) return;
      setAbierta(false);
    }
    function escape(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      setAbierta(false);
      disparador.current?.focus();
    }
    /*
      Se cierra al rodar la pagina o la tabla y no se recoloca: mantenerlo pegado a una celda
      mientras se desplaza obliga a recalcular en cada fotograma, y lo que la persona quiere al
      empezar a rodar es ver la lista, no arrastrar un panel. `capture` para enterarse tambien del
      desplazamiento del contenedor de la tabla, que no burbujea.
    */
    const cerrar = () => setAbierta(false);
    document.addEventListener('mousedown', fuera, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', colocar);
    return () => {
      document.removeEventListener('mousedown', fuera, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', colocar);
    };
  }, [abierta, sitio, colocar]);

  return (
    <>
      <button
        ref={disparador}
        type="button"
        aria-expanded={abierta}
        aria-controls={abierta ? id : undefined}
        aria-label={etiqueta}
        onClick={() => {
          const siguiente = !abierta;
          setAbierta(siguiente);
          if (siguiente) onAbrir?.();
        }}
        className={cn('focus-ring rounded-md', botonClassName)}
      >
        {boton(abierta)}
      </button>
      {abierta && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={etiqueta}
              /*
                MIENTRAS NO TIENE SITIO SE PINTA EN 0,0 Y TRANSPARENTE, no en -9999 (2026-09-15).

                Aparcarlo fuera de la pantalla parecia mas limpio y tenia un efecto que no se veia:
                si algo de dentro pedia el foco antes de colocarlo —un `autoFocus`— el navegador
                rodaba la pagina para alcanzar ese punto imposible. En 0,0 sigue estando dentro de
                la ventana (es `fixed`), asi que enfocarlo no mueve nada. Lo que evita el parpadeo
                es el `opacity-0` de abajo, que ya estaba: el -9999 no hacia falta para eso.
              */
              style={{ top: sitio?.top ?? 0, left: sitio?.left ?? 0 }}
              className={cn(
                'fixed z-50 rounded-lg border border-line bg-surface p-3 shadow-card-hover',
                // Invisible hasta que se sabe donde va: un salto de una posicion a otra parpadea.
                sitio ? 'opacity-100' : 'pointer-events-none opacity-0',
                ancho,
                className,
              )}
            >
              {typeof children === 'function' ? children(() => setAbierta(false)) : children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
