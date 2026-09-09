/**
 * VENCIMIENTOS: LO QUE SE CAE SI NADIE HACE NADA (Decision #126, reescrito el 2026-09-08).
 *
 * ─── LA PREGUNTA QUE CONTESTA ───
 *
 * Todo lo demas mira hacia atras: que se hizo, quien cumplio, cuanto falta. Esto mira hacia
 * ADELANTE, que es de donde sale el plan del año que viene. Hoy esa lista se arma a mano en una
 * hoja de calculo, y por eso siempre llega tarde: nadie recuerda en octubre que en marzo caducan
 * cuarenta certificados de alturas.
 *
 * Es ademas la segunda pregunta del auditor. La primera es "¿quien lo hizo?"; la segunda,
 * "¿sigue vigente?".
 *
 * ─── EL EJE ESTABA MAL, Y NO SOLO LA FUENTE (`PENDIENTES` 3.1 y 3.2) ───
 *
 * Nacio partiendo por DE DONDE SALE EL DATO —«Certificacion» leia `certification_grants`,
 * «Obligacion» leia `assignments`— y eso es una division del esquema, no del trabajo. Tenia dos
 * consecuencias, y las dos se veian en la pantalla:
 *
 *   1. `certification_grants` no la escribe NADIE, asi que su serie salia siempre en cero mientras
 *      las fechas de caducidad existian de verdad en otras dos columnas.
 *   2. Y peor: a quien esta en su ventana de 60 dias —el papel le caduca en marzo y la ronda
 *      siguiente ya le nacio— se le contaba en las DOS series. El mismo trabajo, dos veces.
 *
 * El eje bueno es el que decide QUE SE HACE con la fila, y esa pregunta es «¿ya la tuvo o nunca?»:
 *
 *   REPROGRAMAR   Ya la tuvo y deja de estar acreditada. No hay a quien regañar: hay que volver a
 *                 convocarla, y eso ocupa un salon, un instructor y un dia del año que viene.
 *   PERSEGUIR     Nunca la ha cumplido y tiene una obligacion abierta con fecha limite. Hay a quien
 *                 llamar.
 *
 * Sumarlas seguiria dando un numero grande y sin significado —las dos acciones son opuestas— pero
 * ahora **cada persona y formacion aparece una sola vez**, en el lado que dice que hacer con ella.
 *
 * ─── DE DONDE SALEN LAS FECHAS AHORA ───
 *
 * | Fuente | Que es | Clase |
 * |---|---|---|
 * | `assignments.valid_until_override` | lo que dice el papel de un tercero (#157); manda sobre la recurrencia | REPROGRAMAR |
 * | `certificates.valid_until` | la constancia propia, escrita en cada emision (#111) | REPROGRAMAR |
 * | `assignments.due_at` de una abierta | la ronda que ya nacio y todavia se debe | segun su historia |
 *
 * `certification_grants` ya no se lee: la tabla existe en el modelo y no la escribe ningun modulo,
 * asi que consultarla era garantizar un cero.
 */

/** Que hay que HACER con la fila. Es el eje: no de donde sale el dato, sino que trabajo genera. */
export type ClaseVencimiento = 'REPROGRAMAR' | 'PERSEGUIR';

/**
 * De donde salio la fecha. No decide nada —para eso esta `clase`— pero la pantalla lo dice, y esa
 * es la diferencia entre un informe que se cree y uno que se discute: quien lee "vence en marzo"
 * pregunta siempre "¿segun que?".
 */
export type FuenteVencimiento = 'PAPEL_DE_TERCERO' | 'CONSTANCIA' | 'OBLIGACION_ABIERTA';

/** Un vencimiento concreto, ya con las dimensiones por las que se puede cortar. */
export interface HechoVencimiento {
  clase: ClaseVencimiento;
  fuente: FuenteVencimiento;
  /** Cuando caduca o cuando vence el plazo. */
  fecha: Date;
  personaId: string;
  personaNombre: string;
  documento: string;
  area: string | null;
  cargo: string | null;
  regional: string | null;
  formacion: string;
  actividadId: string | null;
}

export interface CuboMes {
  /** 'YYYY-MM'. Es la unidad en la que se programa un plan anual. */
  mes: string;
  reprogramar: number;
  perseguir: number;
  total: number;
}

export interface ResumenVencimientos {
  /** Ya caducado a dia de hoy. Va aparte: no es "lo que viene", es lo que ya se cayo. */
  vencido: number;
  proximos30: number;
  proximos90: number;
  /** Todo lo que entra en el horizonte pedido, incluido lo vencido. */
  total: number;
}

function claveMes(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);
}

/**
 * UNA FILA POR PERSONA Y FORMACION, Y SE QUEDA LA QUE HAY QUE ATENDER.
 *
 * ─── EL CASO QUE OBLIGA A ESTO ───
 *
 * A alguien le caduca el papel de alturas el 30 de marzo. El motor le hace nacer la ronda siguiente
 * 60 dias antes, con esa misma fecha limite. Son el MISMO trabajo visto desde dos tablas, y contarlo
 * dos veces no infla el informe un poco: infla justo lo que esta a punto de pasar, que es la unica
 * parte que alguien mira.
 *
 * ─── CUAL SE QUEDA ───
 *
 * La OBLIGACION ABIERTA, cuando existe: es la que tiene fecha limite de verdad, la que el informe de
 * seguimiento persigue y la que se cierra al tomar la lista. La vigencia que la origino ya hizo su
 * trabajo el dia que la ronda nacio.
 *
 * Sin obligacion abierta se queda la caducidad MAS PROXIMA. Dos papeles vivos de la misma formacion
 * son un dato mal metido y no un caso real; ante la duda el informe avisa antes, que es el error que
 * se corrige mirando.
 *
 * Lo que NO se agrupa: las filas sin `actividadId`. Sin formacion identificable no se puede afirmar
 * que dos fechas hablen de lo mismo, y fusionar por el NOMBRE haria desaparecer una fila de verdad
 * el dia que dos formaciones se llamen parecido.
 */
export function consolidar(candidatos: HechoVencimiento[]): HechoVencimiento[] {
  const porPar = new Map<string, HechoVencimiento>();
  const sueltos: HechoVencimiento[] = [];

  for (const candidato of candidatos) {
    if (!candidato.actividadId) {
      sueltos.push(candidato);
      continue;
    }
    const clave = `${candidato.personaId}|${candidato.actividadId}`;
    const previo = porPar.get(clave);
    porPar.set(clave, previo ? gana(previo, candidato) : candidato);
  }

  return [...porPar.values(), ...sueltos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

function gana(a: HechoVencimiento, b: HechoVencimiento): HechoVencimiento {
  const abiertaA = a.fuente === 'OBLIGACION_ABIERTA';
  const abiertaB = b.fuente === 'OBLIGACION_ABIERTA';
  if (abiertaA !== abiertaB) return abiertaA ? a : b;
  return a.fecha <= b.fecha ? a : b;
}

/**
 * El calendario mes a mes.
 *
 * SE DEVUELVEN TAMBIEN LOS MESES VACIOS del horizonte. Un calendario al que le faltan los meses sin
 * nada se lee como si esos meses no existieran, y justo ahi es donde se puede reprogramar lo que se
 * amontona en el mes de al lado: el hueco es informacion.
 */
export function calendario(hechos: HechoVencimiento[], desde: Date, meses: number): CuboMes[] {
  const cubos = new Map<string, CuboMes>();

  const inicio = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  for (let i = 0; i < meses; i += 1) {
    const mes = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
    cubos.set(claveMes(mes), { mes: claveMes(mes), reprogramar: 0, perseguir: 0, total: 0 });
  }

  for (const hecho of hechos) {
    const clave = claveMes(hecho.fecha);
    // Lo anterior al horizonte —lo ya vencido— se acumula en su propio mes aunque quede fuera de la
    // rejilla: esconderlo seria justo lo contrario de lo que hace falta.
    const cubo = cubos.get(clave) ?? { mes: clave, reprogramar: 0, perseguir: 0, total: 0 };
    if (hecho.clase === 'REPROGRAMAR') cubo.reprogramar += 1;
    else cubo.perseguir += 1;
    cubo.total += 1;
    cubos.set(clave, cubo);
  }

  return [...cubos.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

export function resumir(hechos: HechoVencimiento[], hoy: Date): ResumenVencimientos {
  let vencido = 0;
  let proximos30 = 0;
  let proximos90 = 0;

  for (const hecho of hechos) {
    const restantes = dias(hoy, hecho.fecha);
    if (restantes < 0) vencido += 1;
    // Los tramos se ACUMULAN: lo que vence en 20 dias tambien vence dentro de 90. Contarlos como
    // excluyentes obligaria a sumar mentalmente para saber "cuanto tengo que resolver este
    // trimestre", que es la pregunta que se hace de verdad.
    else {
      if (restantes <= 30) proximos30 += 1;
      if (restantes <= 90) proximos90 += 1;
    }
  }

  return { vencido, proximos30, proximos90, total: hechos.length };
}
