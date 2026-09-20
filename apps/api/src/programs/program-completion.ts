/**
 * CUANDO UN PROGRAMA CUENTA COMO COMPLETO.
 *
 * Un programa (`LearningPath`) agrupa varias formaciones (`Activity`, aqui "modulo") bajo un solo
 * paraguas — "Induccion General" con un modulo por area: Gestion Humana, Comercial, Logistica...
 * Cada modulo sigue siendo una formacion normal, con su propio contenido, su propio examen y sus
 * propios intentos: reprobar un modulo es exactamente lo mismo que reprobar cualquier formacion
 * hoy, con la misma pantalla de "intentos agotados, pide que te desbloqueen". Nada de eso cambia.
 *
 * Lo que SI es nuevo es la regla que decide si el PROGRAMA completo — y tiene DOS partes, no una,
 * porque asi lo pidio el cliente con un ejemplo concreto: *"de 8 modulos, Gestion Humana debe
 * aprobarse si o si; los demas, con aprobar 6 de 7 basta"*.
 *
 * ─── LAS DOS PARTES, Y DE DONDE SALEN (2026-09-14) ───
 *
 * 1. **Obligatorios** (`PathItem.isRequired`, ya existe en el esquema). Un modulo marcado asi tiene
 *    que estar aprobado SIEMPRE — no cuenta para ningun cupo, es una condicion aparte. Es el
 *    default del campo (`@default(true)`), y tiene sentido: un modulo que no se agrupo en ninguna
 *    seccion de cupo es, por definicion, indispensable.
 *
 * 2. **Cupo por seccion** (`PathItem.sectionName` + `minRequiredInSection`, tambien ya existen).
 *    Los modulos NO obligatorios de una misma seccion forman un pozo: hacen falta N aprobados de
 *    esa seccion, sin importar CUALES — a diferencia de los obligatorios, que si importan cuales.
 *
 * El programa completa cuando las DOS partes se cumplen a la vez. No hay un tercer estado
 * "programa reprobado": mientras no complete, esta EN CURSO — cualquier modulo se puede reintentar
 * (segun su propia politica de intentos) y el programa completa el dia que se cumplan las dos
 * condiciones, sin fecha limite propia mas alla de la que ya traiga cada modulo por su tipo.
 */

export interface EstadoModulo {
  itemId: string;
  isRequired: boolean;
  /** `null` = el modulo no pertenece a ninguna seccion de cupo (tratado como obligatorio suelto). */
  sectionName: string | null;
  aprobado: boolean;
  /**
   * Sigue DEBIENDOSE: su obligacion esta viva (PENDING / IN_PROGRESS / OVERDUE). Un modulo que
   * nadie le exigio nunca no esta pendiente — no se le debe nada.
   */
  pendiente: boolean;
}

export interface EstadoSeccion {
  aprobados: number;
  total: number;
  minimo: number;
  completa: boolean;
}

export interface ResultadoPrograma {
  completo: boolean;
  /** itemId de cada obligatorio que TODAVIA no esta aprobado. Vacio si no falta ninguno. */
  obligatoriosPendientes: string[];
  /** itemId de cada modulo que sigue debiendose, sea del cupo o no. */
  sinResolver: string[];
  /** Una entrada por seccion de cupo (nunca incluye los obligatorios, que no tienen cupo). */
  secciones: Record<string, EstadoSeccion>;
}

/**
 * `minimoPorSeccion` se pasa APARTE y no se lee de cada `PathItem.minRequiredInSection` a ciegas:
 * el esquema lo guarda por item (para no inventar una tabla de secciones), pero el UMBRAL es de la
 * SECCION, no del item — todos los items de una seccion tienen que estar de acuerdo. Quien arma el
 * programa (`ProgramsService`) es responsable de mantenerlos iguales; esta funcion recibe ya
 * resuelto "la seccion X exige N" y no tiene que decidir que hacer si discreparan.
 */
export function evaluarPrograma(modulos: readonly EstadoModulo[], minimoPorSeccion: Readonly<Record<string, number>>): ResultadoPrograma {
  const obligatoriosPendientes: string[] = [];
  const secciones: Record<string, EstadoSeccion> = {};
  /*
    NADA PUEDE QUEDAR SIN HACER (2026-09-15).

    El cupo perdona haber PERDIDO un modulo, no haberlo IGNORADO — el cliente lo dijo asi: *"no se
    puede aceptar nada sin hacer; si no hace 1 no puede aprobar aunque diga 6 de 7"*. Antes la regla
    solo miraba "aprobado / no aprobado", y en ese saco caian por igual el que reprobo y el que
    nunca abrio el modulo, asi que se podia completar un programa ignorando una formacion entera.

    Ahora un modulo que sigue DEBIENDOSE bloquea el programa, aunque el cupo ya de los numeros. Para
    el que no pudo presentarse existe la salida que el sistema ya tenia y que es un acto con nombre,
    fecha y motivo: **eximir** la obligacion. Eximir resuelve el modulo pero NO lo aprueba, asi que
    consume una de las que el cupo deja perder — y si se exime de mas de las que el cupo permite, el
    programa no completa, que es exactamente lo que deberia pasar. Para que una exencion SI cuente
    como hecha, la via es convalidar (Decision de `PENDIENTES` 2.3), que cierra la obligacion como
    CUMPLIDA porque la formacion se hizo de verdad en otro sitio.
  */
  const sinResolver: string[] = [];

  for (const modulo of modulos) {
    if (modulo.pendiente) sinResolver.push(modulo.itemId);
    // Sin seccion, un no-obligatorio no tendria cupo que lo cuente: se trata como obligatorio
    // suelto, que es el default del propio campo en el esquema.
    const esObligatorio = modulo.isRequired || !modulo.sectionName;

    if (esObligatorio) {
      if (!modulo.aprobado) obligatoriosPendientes.push(modulo.itemId);
      continue;
    }

    const seccion = modulo.sectionName as string;
    const actual = secciones[seccion] ?? { aprobados: 0, total: 0, minimo: minimoPorSeccion[seccion] ?? 0, completa: false };
    actual.total += 1;
    if (modulo.aprobado) actual.aprobados += 1;
    secciones[seccion] = actual;
  }

  let todasLasSeccionesCompletas = true;
  for (const seccion of Object.values(secciones)) {
    seccion.completa = seccion.aprobados >= seccion.minimo;
    if (!seccion.completa) todasLasSeccionesCompletas = false;
  }

  return {
    completo: obligatoriosPendientes.length === 0 && todasLasSeccionesCompletas && sinResolver.length === 0,
    obligatoriosPendientes,
    sinResolver,
    secciones,
  };
}

/**
 * ¿EN QUE RONDA ESTA EL PROGRAMA, para esta persona? (2026-09-15)
 *
 * ─── EL CASO ───
 *
 * Reinduccion armada como programa: varias formaciones de tipo Reinduccion, cada una con SU PROPIA
 * regla y SU PROPIA recurrencia (`AssignmentRule.recurrence`), igual que cualquier obligacion que se
 * repite (ver `next-cycle.ts`). El programa no tiene una recurrencia propia — no existe un campo
 * "cada cuanto vence el programa" (ver la nota en `CertificatesService.emitirPorPrograma`) — asi que
 * su ronda nace de las rondas de sus modulos, no de una fecha que el programa mismo calcule.
 *
 * ─── LA REGLA: el que va mas ADELANTE marca la ronda del programa ───
 *
 * En cuanto UN modulo abre su ronda 2 (`Assignment.cycleNumber` avanzo), el programa entero pasa a
 * "ronda 2 en curso": los demas modulos siguen contando lo que ya aprobaron en su ronda 1 hasta que
 * A ELLOS tambien les toque, y por eso van cayendo en `obligatoriosPendientes` uno por uno segun se
 * les abre su propia ventana — no todos el mismo dia. Usar el MINIMO en cambio dejaria el programa
 * entero congelado en la ronda 1 mientras un solo modulo lento (o uno que nunca se repite, como una
 * Especifica sin recurrencia) no avance jamas.
 *
 * Nunca RETROCEDE (`Math.max` con la ronda que ya tenia la inscripcion): borrar o desactivar una
 * regla no debe hacer que un programa que ya iba en la ronda 3 aparente volver a la 1.
 */
export function cicloDePrograma(cicloInscripcion: number, ciclosPorModulo: readonly number[]): number {
  return ciclosPorModulo.reduce((maximo, ciclo) => Math.max(maximo, ciclo), cicloInscripcion);
}

/** La obligacion VIGENTE de un modulo: su `Assignment` de ronda mas alta. `null` = el motor nunca lo alcanzo. */
export interface RondaDeModulo {
  cycleNumber: number;
  status: string;
}

/**
 * ¿CUENTA ESTE MODULO COMO APROBADO, en la ronda en la que va el programa? (2026-09-15)
 *
 * Vive aqui y no dentro del servicio porque **la usan DOS sitios** —`recalcularProgreso` (lo que
 * decide si se emite la constancia del conjunto) y `misProgramas` (el visto verde que ve el
 * aprendiz)— y tienen que decir lo MISMO. Escrita a mano en los dos, el dia que una cambie el
 * aprendiz vera un programa completo que no emite papel, o al reves.
 *
 * ─── LOS DOS CAMINOS, Y POR QUE SON DOS ───
 *
 *   con obligacion    El estado sale de la `Assignment` MAS RECIENTE, no del historial de
 *                     `Enrollment`: aprobado significa que esa obligacion esta CERRADA. Si al
 *                     modulo se le hubiera abierto una ronda nueva, la mas reciente seria ESA y
 *                     estaria pendiente — por eso no hace falta comparar con la ronda del programa.
 *
 *   sin obligacion    Ningun `AssignmentRule` lo alcanzo nunca (se aprobo por otra via, o el
 *                     programa no tiene asignacion propia). No hay rondas que distinguir, asi que
 *                     vale el camino de siempre: "¿lo aprobo alguna vez?".
 *
 * El historial de `Enrollment` **se ignora cuando hay obligacion**, y es deliberado: es lo que no
 * distingue rondas, y consultarlo ahi devolveria "aprobado" para siempre desde la primera vuelta.
 *
 * ─── POR QUE NO SE COMPARA CON LA RONDA DEL PROGRAMA (corregido 2026-09-15) ───
 *
 * La primera version exigia ademas `ronda.cycleNumber >= cicloPrograma`, y eso hacia lo contrario
 * de lo que promete `cicloDePrograma` unas lineas mas arriba: en cuanto UN modulo abria su ronda
 * siguiente, **todos** perdian el visto a la vez, aunque a los demas no les tocara todavia. En una
 * Reinduccion de ocho modulos, el dia que el primero abre su ronda el aprendiz veia los ocho
 * pendientes — y siete de ellos ni siquiera podia hacerlos, porque su obligacion no estaba abierta.
 *
 * La ronda del programa sigue haciendo falta, pero para lo que es: decidir en QUE FILA de
 * `PathEnrollment` se escribe el avance (una por ronda, inmutable). No para juzgar modulo a modulo.
 */
export function moduloAprobado(input: {
  ronda: RondaDeModulo | null | undefined;
  /** ¿Existe algun `Enrollment` suyo en COMPLETED/PASSED? Solo se mira si no hay obligacion. */
  aprobadoAlgunaVez: boolean;
}): boolean {
  if (!input.ronda) return input.aprobadoAlgunaVez;
  return input.ronda.status === 'COMPLETED';
}

/** Los estados en los que una obligacion SIGUE VIVA: se le debe a la persona. */
const OBLIGACION_VIVA = new Set(['PENDING', 'IN_PROGRESS', 'OVERDUE']);

/**
 * ¿ESTE MODULO SIGUE DEBIENDOSE? (2026-09-15)
 *
 * Es lo que impide completar un programa dejando una formacion sin tocar. Un modulo esta pendiente
 * mientras su obligacion este viva; deja de estarlo cuando se cierra —aprobada, EXIMIDA, o retirada
 * porque la persona salio de la audiencia—.
 *
 * **Sin obligacion no hay pendiente**, y es deliberado: si a esa persona nunca se le exigio ese
 * modulo, no se le debe nada. Es lo que hace que un programa sin asignacion propia —alguien que
 * cursa por su cuenta— siga completandose con su cupo, sin exigirle modulos que nadie le pidio.
 */
export function moduloPendiente(ronda: RondaDeModulo | null | undefined): boolean {
  if (!ronda) return false;
  return OBLIGACION_VIVA.has(ronda.status);
}
