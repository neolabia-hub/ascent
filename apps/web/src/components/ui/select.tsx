import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...props },
  ref,
) {
  return (
    /*
      EL ANCHO VA EN LA ENVOLTURA, NO EN EL <select> (2026-09-06).

      La flecha esta posicionada contra ESTE div (`absolute right-3`). Cuando el ancho solo se le
      ponia al <select> —que es lo que hace `className` en los diez sitios que lo estrechan—, la
      caja se encogia y la envoltura seguia ocupando toda la celda: la flecha se quedaba pegada al
      borde derecho de la celda, a doscientos pixeles de su desplegable y flotando en blanco.

      En la lista de asistencia eso se leia como UNA COLUMNA DE MAS, SIN NOMBRE —asi lo conto el
      cliente—, y por eso no aparecia contando cabeceras contra celdas en el fuente: son tres y
      tres. No era una columna; era la flecha de la tercera, suelta.

      `className` se le pasa a los DOS a proposito: la envoltura define la huella del control, y el
      <select> necesita el alto cuando se lo cambian (`h-8`). Los diez sitios que lo usan pasan solo
      medidas —anchos, `max-w-sm`, `flex-1`—, nunca color ni tipografia.
    */
    <div className={cn('relative', className)}>
      {/*
        Mismo acabado que los botones: realce interior arriba, y el borde se refuerza al pasar por
        encima. Un desplegable plano al lado de un boton con profundidad se lee como si estuviera
        deshabilitado, y en estos formularios hay mas desplegables que botones.
      */}
      <select
        ref={ref}
        className={cn(
          /*
            EL REPASO DE 2026-09-06, pedido por el cliente para TODOS los desplegables de la
            aplicacion. Tres cosas, ninguna decorativa:

              · `rounded-lg` en vez de `rounded-md`. Estaba mas cuadrado que el resto de la interfaz
                —las tarjetas, los paneles y las pastillas ya van a `lg` o mas— y en un formulario
                con seis desplegables la esquina dura es lo unico que se nota.
              · El fondo se aclara al pasar por encima. Antes solo cambiaba el borde, que en una
                pantalla llena de cajas con borde no se ve: el area si.
              · Y el cursor dice que se puede pulsar. Un `<select>` con `appearance-none` pierde la
                pista de que es un control y se lee como una caja de texto deshabilitada.
          */
          'focus-ring peer h-10 w-full cursor-pointer appearance-none rounded-lg border bg-surface px-3 pr-9 text-sm text-ink-900 shadow-btn-flat transition-all duration-150 ease-pulse',
          'hover:border-line-strong hover:bg-paper hover:shadow-btn',
          invalid ? 'border-danger' : 'border-line-strong',
          'disabled:cursor-not-allowed disabled:border-line disabled:bg-paper disabled:text-ink-300 disabled:shadow-none',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        strokeWidth={2}
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 transition-colors duration-150 peer-hover:text-ink-900 peer-disabled:text-ink-300"
      />
    </div>
  );
});
