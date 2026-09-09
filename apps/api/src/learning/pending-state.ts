export type PendingState = 'EN_CURSO' | 'ESPERANDO' | 'ATRASADA' | 'PRONTO' | 'ABIERTA';

export interface PendingStateInput {
  /** La asignacion paso su fecha limite. */
  overdue: boolean;
  dueAt: Date | string | null;
  /** Ya inscrito: puede entrar directamente. */
  enrollmentId: string | null;
  /** Ya empezada (inscripcion IN_PROGRESS). */
  started: boolean;
  /** Convocatoria de autoservicio abierta: puede inscribirse por su cuenta. */
  selfServiceOfferingId: string | null;
}

export interface PendingStateResult {
  state: PendingState;
  /** Lo que se escribe junto a la formacion. En frase, no a gritos. */
  stateLabel: string;
  /**
   * Si la persona puede hacer algo AHORA MISMO con esta formacion.
   *
   * Es el campo que impide volver a reclamarle un retraso a quien no podia actuar. Va aparte del
   * estado a proposito: quien pinte la pantalla no tiene que acordarse de que ESPERANDO no es
   * accionable, lo lee.
   */
  actionable: boolean;
}

/**
 * EN QUE ESTADO ESTA UNA FORMACION PENDIENTE, resuelto en el SERVIDOR (Decision #101).
 *
 * ─── EL FALLO QUE ARREGLA ───
 *
 * La pantalla del aprendiz decia las dos cosas a la vez: *"Vencio hace 3 dias"* y, justo debajo,
 * *"Todavia no esta abierta. Quien programa la formacion debe convocarte."* Las dos eran ciertas
 * por separado —la asignacion tiene fecha limite y nadie la convoco— y juntas son una acusacion
 * absurda: se le reclamaba a alguien un retraso en algo que NUNCA pudo empezar.
 *
 * Quien lee eso concluye una de dos cosas, y las dos son malas: que la plataforma esta rota, o que
 * le van a cobrar un incumplimiento que no es suyo. En una empresa donde la formacion es
 * obligatoria por ley y queda en el expediente, lo segundo no es una molestia menor.
 *
 * ─── POR QUE AQUI Y NO EN LA PANTALLA ───
 *
 * La contradiccion existia porque el servidor mandaba BANDERAS SUELTAS (`overdue`, `enrollmentId`,
 * `selfServiceOfferingId`) y dejaba que cada pantalla las reconciliara. Basta que una se despiste
 * para que vuelva. Resuelto aqui, el estado es UNO y viaja ya decidido: ninguna pantalla —ni la
 * web de hoy, ni la aplicacion movil de mañana— puede contradecirse, porque no tiene con que.
 *
 * ─── LA REGLA ───
 *
 * ESPERANDO gana a ATRASADA cuando no hay por donde entrar. El retraso NO se borra ni se oculta:
 * `overdue` sigue viajando y quien administra lo sigue viendo en sus reportes, que es donde ese
 * dato sirve —senala a la organizacion, que es quien no convoco—. Lo que cambia es a quien se le
 * pinta la culpa. **No se muestra como deuda de alguien lo que ese alguien no podia pagar.**
 */
export function resolvePendingState(item: PendingStateInput, now: Date = new Date()): PendingStateResult {
  const puedeActuar = item.enrollmentId !== null || item.selfServiceOfferingId !== null;

  if (!puedeActuar) {
    return {
      state: 'ESPERANDO',
      // Dice de QUIEN se espera. "No disponible" dejaria a la persona sin saber a quien preguntar.
      stateLabel: item.overdue ? 'Pendiente de que la abran' : 'Esperando convocatoria',
      actionable: false,
    };
  }

  // Lo empezado manda: quien ya esta dentro no necesita que le digan que vence pronto, necesita
  // el boton de seguir.
  if (item.started) return { state: 'EN_CURSO', stateLabel: 'En curso', actionable: true };

  if (item.overdue) {
    return { state: 'ATRASADA', stateLabel: describirRetraso(item.dueAt, now), actionable: true };
  }

  if (venceEnDosDias(item.dueAt, now)) {
    return { state: 'PRONTO', stateLabel: 'Vence pronto', actionable: true };
  }

  return { state: 'ABIERTA', stateLabel: 'Sin empezar', actionable: true };
}

/** Vence en dos dias o menos, sin haber vencido todavia: eso es otro estado. */
export function venceEnDosDias(dueAt: Date | string | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const dias = Math.round((new Date(dueAt).getTime() - now.getTime()) / 86_400_000);
  return dias >= 0 && dias <= 2;
}

/**
 * "Se paso 3 dias" y no "VENCIDA".
 *
 * Un participio en mayusculas es una etiqueta que se le pega a la persona; una frase con un numero
 * es un hecho que se puede resolver. Y el numero importa: dos dias y dos meses piden cosas
 * distintas, y "VENCIDA" los dice exactamente igual.
 */
function describirRetraso(dueAt: Date | string | null, now: Date): string {
  if (!dueAt) return 'Fuera de plazo';
  const dias = Math.floor((now.getTime() - new Date(dueAt).getTime()) / 86_400_000);
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Se paso 1 dia';
  if (dias < 30) return `Se paso ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'Se paso 1 mes' : `Se paso ${meses} meses`;
}
