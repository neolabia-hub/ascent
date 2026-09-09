import { ConflictException } from '@nestjs/common';

/**
 * CUANDO SE PUEDE CAMBIAR EL RESPONSABLE DE UNA FORMACION (Decision #64).
 *
 * El responsable no es un dato de contacto: es quien firma que esa formacion se hizo como dice
 * que se hizo. Por eso se comporta como el resto del contenido publicado —nota minima, temario,
 * intentos—: se decide mientras la version esta en BORRADOR y se congela al publicar.
 *
 * En la practica eso deja exactamente dos momentos para cambiarlo, que son los que el negocio
 * pidio: al CREAR la formacion desde cero, y al abrir una VERSION NUEVA. Con una version publicada
 * y ningun borrador abierto, cambiarlo reescribiria quien respondia por algo que ya se dicto y ya
 * se certifico.
 *
 * No se bloquea "porque si": la salida esta escrita en el propio mensaje, porque crear una version
 * nueva es la operacion que el usuario tiene que hacer y probablemente no sabe que existe.
 */
export interface ResponsibleChangeFacts {
  /** Responsable que tiene hoy la actividad. */
  current: string | null;
  /** El que se pide dejar. `undefined` = no se toca en esta edicion. */
  requested: string | null | undefined;
  /** ¿Hay una version en borrador abierta? Es lo unico que habilita el cambio. */
  hasOpenDraft: boolean;
}

export function responsibleChangeAllowed(facts: ResponsibleChangeFacts): boolean {
  if (facts.requested === undefined) return true;
  if (facts.requested === facts.current) return true;
  return facts.hasOpenDraft;
}

export function assertResponsibleChangeAllowed(facts: ResponsibleChangeFacts): void {
  if (responsibleChangeAllowed(facts)) return;
  throw new ConflictException({
    code: 'RESPONSIBLE_LOCKED',
    message:
      'El responsable quedó congelado en la versión publicada. Para cambiarlo, crea una versión nueva: ' +
      'la que ya se dictó tiene que seguir diciendo quién respondía por ella.',
  });
}
