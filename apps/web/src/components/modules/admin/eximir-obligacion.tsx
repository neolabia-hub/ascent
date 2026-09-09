'use client';

import { useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';

/**
 * EXIMIR A UNA PERSONA DE UNA OBLIGACION, con su motivo.
 *
 * ─── POR QUE ES UNA PIEZA APARTE ───
 *
 * La misma pregunta se hace en dos sitios —Asignaciones, que es la lista completa, y "Quienes la
 * tienen que hacer" dentro de la ficha, que es donde de verdad surge la duda— y la respuesta va al
 * REGISTRO DE AUDITORIA. Dos copias de un formulario que escribe evidencia acaban pidiendo cosas
 * distintas, que es como se termina con la mitad de las exenciones sin motivo util.
 *
 * ─── POR QUE NO ES UN `window.prompt` ───
 *
 * Era lo que habia. Un `prompt` del navegador no dice de QUIEN es la obligacion que se va a
 * eximir, no puede avisar del minimo de diez caracteres hasta que ya se pulso aceptar, no se deja
 * leer por un lector de pantalla como parte de la pagina, y en varios navegadores sale con el
 * dominio delante, que lo hace parecer un aviso del sistema y no del producto. Para algo que
 * queda firmado en el registro es poco.
 *
 * Es una ventana y no un cajon —contra la regla general de "si tiene campos, cajon"— porque no es
 * un formulario que se edita y se sigue: es una decision de una sola pregunta que interrumpe lo
 * que se estaba haciendo, y tiene que leerse entera antes de confirmar.
 */
export function EximirObligacion({
  open,
  onOpenChange,
  /** De quien es la obligacion. Se dice en la ventana: eximir a la persona equivocada no se deshace. */
  personName,
  activityName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  activityName?: string | null;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Cada apertura empieza en blanco: el motivo de la exencion anterior no es el de esta.
  useEffect(() => {
    if (open) {
      setMotivo('');
      setGuardando(false);
    }
  }, [open]);

  const faltan = 10 - motivo.trim().length;
  const listo = faltan <= 0;

  const confirmar = async () => {
    if (!listo) return;
    setGuardando(true);
    try {
      await onConfirm(motivo.trim());
      onOpenChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      icon={ShieldOff}
      title="Eximir de esta formacion"
      description={[personName, activityName].filter(Boolean).join(' · ')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardando}>
            Volver
          </Button>
          <Button variant="danger" onClick={() => void confirmar()} loading={guardando} disabled={!listo}>
            Eximir a {primerNombre(personName)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-500">
          La obligacion deja de contar para el cumplimiento y desaparece de sus pendientes. No se borra: queda con el
          motivo, la fecha y quien la eximio, y es lo que se enseña si alguien pregunta por que esta persona no la hizo.
        </p>
        <Field
          htmlFor="eximir-motivo"
          label="Motivo"
          required
          hint={
            listo
              ? 'Queda en el registro de auditoria.'
              : `Faltan ${faltan} ${faltan === 1 ? 'caracter' : 'caracteres'}: explica por que, no basta con "no aplica".`
          }
        >
          <Textarea
            id="eximir-motivo"
            rows={3}
            maxLength={500}
            autoFocus
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ej.: esta en licencia de maternidad hasta marzo; se reprograma a su regreso."
          />
        </Field>
      </div>
    </Modal>
  );
}

/** "Eximir a Maria" se lee mejor que "Eximir a Maria Fernanda Gonzalez Rojas" en un boton. */
function primerNombre(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'esta persona';
}
