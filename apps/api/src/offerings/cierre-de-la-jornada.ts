/**
 * ¿QUE SE EXIGE PARA DAR POR CUMPLIDA ESTA JORNADA, Y SE TOMA LISTA?
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
 * ─── Y POR QUE SON DOS PREGUNTAS Y NO UNA (2026-09-21, `PENDIENTES` 2.7) ───
 *
 * Habia un solo booleano, `closesByAttendance`, y respondia a la vez QUE ACREDITA y SI HAY LISTA.
 * Pegadas asi, elegir una descartaba la otra, y el cliente dio con el hueco:
 *
 *   *"si la formacion tiene evaluacion se cierra por contenido, pero se quiere el QR, la firma o el
 *   acta como constancia de que estuvo presente"*
 *
 * Eso no se podia pedir: al cerrar por contenido la lista desaparecia entera, y con ella el QR, la
 * firma y el acta. La evidencia documental estaba haciendo de compuerta cuando es otra cosa —
 * material del expediente— y ademas faltaba el caso que un auditor pide en una presencial con
 * examen: **asistio Y aprobo**.
 *
 * Asi que son dos:
 *
 *   `queSeExige`   ATTENDANCE · CONTENT · BOTH  -> que hace falta para dar por cumplida
 *   `seTomaLista`  si / no, independiente        -> si hay lista, QR, firma y acta
 *
 * ─── LO QUE SI SE PUEDE DEDUCIR: EL DEFECTO ───
 *
 * No preguntar nada obliga a adivinar; preguntarlo todo cansa y se rellena mal. Asi que se pregunta
 * con un defecto que acierta en la inmensa mayoria:
 *
 *   PRESENCIAL  hay salon y lista firmada; en la plataforma no queda nada  -> ATTENDANCE
 *   HIBRIDA     hay sesion y ademas contenido (CLAUDE.md 3.7)              -> ATTENDANCE
 *   VIRTUAL     cada quien entra y hace el temario, y el sistema lo anota  -> CONTENT
 *
 * Es **el mismo defecto de siempre**: desdoblar la pregunta no le cambia el significado a ninguna
 * jornada ya dictada. `BOTH` no es nunca un defecto — exigir dos cosas es una decision, y deducirla
 * dejaria a gente sin cumplir sin que nadie lo hubiera pedido.
 *
 * ─── Y LAS CONDICIONES QUE NO SE NEGOCIAN ───
 *
 * Una convocatoria **PERMANENTE** no lleva lista ni se cierra con ella, se marque lo que se marque:
 * es autoservicio, la persona entra cuando puede y **no hay ninguna sesion a la que asistir**. Una
 * permanente pidiendo asistencia es un dato mal puesto, no un caso de uso, y dejarla pasar
 * convertiria el error de captura de alguien en asistencias inventadas.
 *
 * Y si lo que acredita es la lista, **la lista se toma**: `seTomaLista` no puede decir que no
 * cuando `queSeExige` dice que si, o la jornada no tendria forma de cerrarse nunca.
 *
 * Vive aparte del servicio y sin tocar la base a proposito, como `next-cycle.ts` y `due-date.ts`:
 * es una regla de negocio con cuatro esquinas, y probarla no deberia costar infraestructura.
 */
export type Exigencia = 'ATTENDANCE' | 'CONTENT' | 'BOTH';

export interface JornadaParaCerrar {
  kind: 'EVENT' | 'PERMANENT' | 'HYBRID';
  modality: 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA';
  /** `null` = lo que diga su modalidad, que es el caso normal. */
  completionRequirement?: Exigencia | null;
  /** `null` = lo que se deduzca de la exigencia: se toma lista si la lista acredita. */
  takesAttendance?: boolean | null;
}

/** Que hace falta para dar por cumplida la jornada. */
export function queSeExige(jornada: JornadaParaCerrar): Exigencia {
  // El autoservicio no tiene sesion a la que asistir. Manda sobre lo que diga la casilla.
  if (jornada.kind === 'PERMANENT') return 'CONTENT';
  if (jornada.completionRequirement) return jornada.completionRequirement;
  return jornada.modality === 'VIRTUAL' ? 'CONTENT' : 'ATTENDANCE';
}

/**
 * ¿Se toma lista en esta jornada? Es independiente de lo que acredite: con `CONTENT` la lista es
 * EVIDENCIA —queda en el expediente y no cierra nada—, que es justo lo que pedia el 2.7.
 */
export function seTomaLista(jornada: JornadaParaCerrar): boolean {
  if (jornada.kind === 'PERMANENT') return false;
  const exige = queSeExige(jornada);
  // Si la lista acredita, se toma. No es configurable: sin lista no habria forma de cerrarla.
  if (exige !== 'CONTENT') return true;
  return jornada.takesAttendance === true;
}

/**
 * ¿MARCAR LA LISTA CIERRA la formacion, por si sola?
 *
 * Solo con `ATTENDANCE`. Con `BOTH` la marca se guarda y el cierre lo decide
 * `CompletionService.evaluate`, que mira las dos condiciones; con `CONTENT` no cierra nada.
 *
 * Se conserva el nombre porque es la pregunta que hacen las dos puertas de asistencia, y responde
 * exactamente lo que respondia antes para las jornadas que ya existian.
 */
export function cierraPorLista(jornada: JornadaParaCerrar): boolean {
  return queSeExige(jornada) === 'ATTENDANCE';
}

/** Lo que la pantalla enseña como explicacion del defecto, para no tener dos redacciones. */
export function porQueCierraAsi(jornada: JornadaParaCerrar): string {
  if (jornada.kind === 'PERMANENT') return 'Es de autoservicio: cada quien la hace en la plataforma cuando puede.';
  if (jornada.completionRequirement === 'BOTH') {
    return 'Hacen falta las dos cosas: asistir a la sesion y aprobar lo de la plataforma.';
  }
  if (jornada.completionRequirement === 'ATTENDANCE') return 'Se cierra con la lista de asistencia de la sesion.';
  if (jornada.completionRequirement === 'CONTENT') {
    return seTomaLista(jornada)
      ? 'Se cierra con lo que cada persona complete en la plataforma. La lista queda como evidencia.'
      : 'Se cierra con lo que cada persona complete en la plataforma.';
  }
  return jornada.modality === 'VIRTUAL'
    ? 'Es virtual: se cierra con lo que cada persona complete en la plataforma.'
    : 'Hay una sesion con fecha: se cierra con la lista de asistencia.';
}
