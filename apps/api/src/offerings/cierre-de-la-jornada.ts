/**
 * ¿ESTA JORNADA SE CIERRA CON LISTA DE ASISTENCIA, O CON LO QUE CADA QUIEN HAGA EN LA PLATAFORMA?
 *
 * ─── POR QUE ESTO ES UNA PREGUNTA Y NO UNA REGLA ───
 *
 * La regla derivada cambio DOS VECES en dos dias, y las dos por un caso real que la anterior no
 * cubria:
 *
 *   1. Atada al `kind`: toda jornada `EVENT` se cerraba por lista. **Falso** — una capacitacion del
 *      plan puede ser EVENT y virtual con contenido: tiene fecha y se convoca, pero la persona entra
 *      a la plataforma y hace el temario. Pedir lista ahi es pedir la evidencia equivocada.
 *   2. Atada a la MODALIDAD: presencial e hibrida por lista, virtual por plataforma. **Tambien
 *      falso** — la capacitacion que dicta la ARL por videollamada en vivo es virtual y SI tiene
 *      lista de quien se conecto.
 *
 * La leccion no es que faltara una tercera regla mejor. Es que **la respuesta depende de como se
 * dicto esa sesion concreta**, y eso solo lo sabe quien la programa. Cualquier regla que lo deduzca
 * acierta para unos tenants y falla para otros — y aqui el producto es multi-tenant: una empresa de
 * logistica dicta casi todo en salon y una consultora casi todo en la plataforma, con la misma
 * configuracion.
 *
 * ─── LO QUE SI SE PUEDE DEDUCIR: EL DEFECTO ───
 *
 * No preguntar nada obliga a adivinar; preguntarlo todo cansa y se rellena mal. Asi que se pregunta
 * con un defecto que acierta en la inmensa mayoria:
 *
 *   PRESENCIAL  hay salon y lista firmada; en la plataforma no queda nada  -> por LISTA
 *   HIBRIDA     hay sesion y ademas contenido (CLAUDE.md 3.7)              -> por LISTA
 *   VIRTUAL     cada quien entra y hace el temario, y el sistema lo anota  -> por PLATAFORMA
 *
 * `closesByAttendance` se pone explicito solo para lo que no encaja: la videollamada en vivo con
 * lista, o el taller presencial que en realidad se acredita con lo que cada quien haga despues.
 *
 * ─── Y LA CONDICION QUE NO SE NEGOCIA ───
 *
 * Una convocatoria **PERMANENTE** no se cierra por lista, se marque lo que se marque: es
 * autoservicio, la persona entra cuando puede y no hay ninguna sesion a la que asistir. Una
 * permanente con `closesByAttendance: true` es un dato mal puesto, no un caso de uso, y dejarla
 * pasar convertiria el error de captura de alguien en asistencias inventadas.
 *
 * Vive aparte del servicio y sin tocar la base a proposito, como `next-cycle.ts` y `due-date.ts`:
 * es una regla de negocio con cuatro esquinas, y probarla no deberia costar infraestructura.
 */
export interface JornadaParaCerrar {
  kind: 'EVENT' | 'PERMANENT' | 'HYBRID';
  modality: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
  /** `null` = lo que diga su modalidad, que es el caso normal. */
  closesByAttendance?: boolean | null;
}

export function cierraPorLista(jornada: JornadaParaCerrar): boolean {
  // El autoservicio no tiene sesion a la que asistir. Manda sobre lo que diga la casilla.
  if (jornada.kind === 'PERMANENT') return false;
  if (jornada.closesByAttendance !== null && jornada.closesByAttendance !== undefined) {
    return jornada.closesByAttendance;
  }
  return jornada.modality !== 'VIRTUAL';
}

/** Lo que la pantalla enseña como explicacion del defecto, para no tener dos redacciones. */
export function porQueCierraAsi(jornada: JornadaParaCerrar): string {
  if (jornada.kind === 'PERMANENT') return 'Es de autoservicio: cada quien la hace en la plataforma cuando puede.';
  if (jornada.closesByAttendance === true) return 'Se cierra con la lista de asistencia de la sesion.';
  if (jornada.closesByAttendance === false) return 'Se cierra con lo que cada persona complete en la plataforma.';
  return jornada.modality === 'VIRTUAL'
    ? 'Es virtual: se cierra con lo que cada persona complete en la plataforma.'
    : 'Hay una sesion con fecha: se cierra con la lista de asistencia.';
}
