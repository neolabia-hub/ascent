/**
 * VENCIMIENTOS: LO QUE SE CAE SI NADIE HACE NADA (Decision #126).
 *
 * ─── LA PREGUNTA QUE CONTESTA ───
 *
 * Todo lo demas mira hacia atras: que se hizo, quien cumplio, cuanto falta. Esto mira hacia
 * ADELANTE, que es de donde sale el plan del ano que viene. Hoy esa lista se arma a mano en una
 * hoja de calculo, y por eso siempre llega tarde: nadie recuerda en octubre que en marzo caducan
 * cuarenta certificados de alturas.
 *
 * Es ademas la segunda pregunta del auditor. La primera es "¿quien lo hizo?"; la segunda,
 * "¿sigue vigente?".
 *
 * ─── DOS COSAS DISTINTAS QUE VENCEN ───
 *
 *   CERTIFICACION   el papel caduca en una fecha (`certification_grants.valid_until`). La persona
 *                   lo hizo bien y aun asi deja de estar acreditada: hay que repetir la formacion.
 *   OBLIGACION      una formacion que se debe y todavia no se ha hecho, con su fecha limite.
 *
 * No se mezclan en una sola cuenta. La primera es trabajo que HAY que reprogramar aunque todo vaya
 * perfecto; la segunda es trabajo atrasado o por hacer. Sumarlas daria un numero grande y sin
 * significado — y las acciones son distintas: una se programa, la otra se persigue.
 */

export type ClaseVencimiento = 'CERTIFICACION' | 'OBLIGACION';

/** Un vencimiento concreto, ya con las dimensiones por las que se puede cortar. */
export interface HechoVencimiento {
  clase: ClaseVencimiento;
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
  certificaciones: number;
  obligaciones: number;
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
    cubos.set(claveMes(mes), { mes: claveMes(mes), certificaciones: 0, obligaciones: 0, total: 0 });
  }

  for (const hecho of hechos) {
    const clave = claveMes(hecho.fecha);
    // Lo anterior al horizonte —lo ya vencido— se acumula en su propio mes aunque quede fuera de la
    // rejilla: esconderlo seria justo lo contrario de lo que hace falta.
    const cubo = cubos.get(clave) ?? { mes: clave, certificaciones: 0, obligaciones: 0, total: 0 };
    if (hecho.clase === 'CERTIFICACION') cubo.certificaciones += 1;
    else cubo.obligaciones += 1;
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
