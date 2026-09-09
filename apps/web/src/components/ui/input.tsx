import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    /*
      UN SOLO RADIO PARA TODO EL SISTEMA: `rounded-lg` (2026-09-07).

      Los controles iban a `rounded-md` y las tarjetas a `rounded-lg`, asi que un campo dentro de una
      tarjeta tenia la esquina mas dura que la caja que lo contiene — al reves de como se lee una
      jerarquia. Se noto al pasar el desplegable a `lg` y quedarse el resto atras: dos radios en la
      misma fila se ven como un descuido aunque nadie sepa nombrarlo.

      Sale de la referencia que paso el cliente el 2026-09-06, cuyo denominador comun es que todo es
      mas blando. Aqui se aplica lo que se puede aplicar de una vez y sin riesgo: el radio.

      ─── LA REGLA, QUE ES LO QUE FALTABA (2026-09-08) ───

      La primera pasada dejo a medias: Input, Textarea, Button y Select cambiaron, pero `Combo`,
      `MultiSelect` y `PersonPicker` —que son la misma clase de control— se quedaron atras. Se veia
      en la ficha, con "Norma aplicable" mas cuadrada que el campo de encima. Lo cazo el cliente
      preguntando si estaba mejor antes o ahora: no era ni una cosa ni la otra, estaba a medio
      aplicar.

      **La caja de un control va a `rounded-lg`; lo que vive DENTRO de ella, a `rounded-md`.** Las
      opciones de una lista desplegable, los botones de un `Segmented` y los iconos de cerrar un
      cajon se quedan en `md` a proposito: un radio anidado tiene que ser menor que el que lo
      contiene, o las esquinas se ven despegadas.
    */
    <input
      ref={ref}
      className={cn(
        'focus-ring h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-300 transition-colors duration-150',
        invalid ? 'border-danger' : 'border-line-strong',
        'disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-300',
        className,
      )}
      {...props}
    />
  );
});
