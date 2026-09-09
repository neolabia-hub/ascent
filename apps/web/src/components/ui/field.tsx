import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Ayuda } from './ayuda';
import { cn } from './cn';
import { Label } from './label';

export interface FieldProps {
  htmlFor: string;
  label: string;
  /**
   * Nota CORTA, a la vista debajo del campo. Un renglon: "Se propone desde el nombre, editable".
   * Si ocupa dos o mas, va en `ayuda`.
   */
  hint?: string;
  /**
   * EXPLICACION LARGA, detras del icono de informacion del rotulo (ver `Ayuda`).
   *
   * La regla que pidio el cliente el 2026-09-06 —*nada de textos largos a la vista*— aplicada al
   * unico sitio desde el que alcanza a toda la aplicacion de una vez: los `hint` de tres renglones
   * empujaban el formulario entero y se leian una sola vez en la vida del usuario.
   *
   * Se pueden usar los dos: el renglon corto queda debajo y el desarrollo detras del icono.
   */
  ayuda?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, ayuda, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {/*
        EL ICONO VA AL LADO DEL <label>, NUNCA DENTRO.

        Un <button> dentro de un <label> hereda su comportamiento: pulsarlo activaria ademas el
        campo rotulado —abriria el calendario de una fecha, marcaria una casilla— y el usuario veria
        dos cosas al pedir una. Por eso hay una fila y no un rotulo con un hijo.
      */}
      {ayuda ? (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor}>
            {label}
            {required ? <span className="ml-0.5 text-danger">*</span> : null}
          </Label>
          <Ayuda sobre={label}>{ayuda}</Ayuda>
        </div>
      ) : (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </Label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
