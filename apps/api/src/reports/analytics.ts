import { resumirEjecucion, type EstadoEjecucion, type ResumenEjecucion } from './execution-state.js';

/**
 * ANALITICA: LA MISMA EJECUCION, CORTADA POR DONDE HAGA FALTA (Decision #125).
 *
 * ─── EL HUECO QUE CIERRA ───
 *
 * El seguimiento contesta "¿como va CADA FORMACION?". Eso sirve para perseguir una, y no sirve para
 * las preguntas que de verdad se hacen en un comite: *"¿que area va peor?"*, *"¿la regional Caribe
 * esta al dia?"*, *"¿como vamos con BASC?"*. Ninguna de esas se puede contestar mirando una lista de
 * doscientas formaciones, y por eso hasta ahora se contestaban a ojo.
 *
 * ─── UN MOTOR CON DIMENSIONES, NO CUATRO PANTALLAS ───
 *
 * "Por area", "por regional", "por norma" y "por cargo" NO son cuatro informes: son el mismo dato
 * agrupado por otra columna. Construirlos por separado garantiza que dentro de tres meses uno diga
 * 62% y otro 58% sobre lo mismo, porque alguien arreglo el criterio en un sitio y no en los otros.
 * Aqui el hecho es siempre el mismo —una obligacion de una persona, con su estado ya resuelto— y lo
 * unico que cambia es por donde se agrupa.
 *
 * ─── LAS NORMAS SUMAN MAS QUE EL TOTAL, Y ESTA BIEN ───
 *
 * Una formacion puede responder a varias normas a la vez: la de alturas cuenta para SST y para
 * BASC. Al agrupar por norma, esa obligacion aparece en las dos, asi que los totales por norma
 * SUMAN MAS que el universo. No es un error de conteo: es que la pregunta "¿como vamos con BASC?"
 * incluye todo lo que BASC exige, comparta o no con otra norma. La pantalla lo advierte; callarlo
 * haria que alguien intentara cuadrar los numeros y no pudiera.
 */

export type Dimension = 'area' | 'cargo' | 'regional' | 'servicio' | 'proceso' | 'tipo' | 'norma';

export const DIMENSIONES: Record<Dimension, { label: string; sinValor: string }> = {
  area: { label: 'Area', sinValor: 'Sin area' },
  cargo: { label: 'Cargo', sinValor: 'Sin cargo' },
  regional: { label: 'Regional', sinValor: 'Sin regional' },
  servicio: { label: 'Servicio', sinValor: 'Sin servicio' },
  proceso: { label: 'Proceso', sinValor: 'Sin proceso' },
  tipo: { label: 'Tipo de formacion', sinValor: 'Sin tipo' },
  norma: { label: 'Norma', sinValor: 'Sin norma asociada' },
};

/** Una etiqueta de agrupacion. `id` null = el hecho no tiene valor en esa dimension. */
export interface Etiqueta {
  id: string | null;
  name: string;
}

/**
 * UNA obligacion de UNA persona, con su estado ya resuelto y las dimensiones por las que se puede
 * mirar. El estado no se recalcula aqui: llega hecho de `resolverEstadoEjecucion`, que sigue siendo
 * el unico sitio donde vive el criterio.
 */
export interface HechoAnalitica {
  estado: EstadoEjecucion;
  area: Etiqueta | null;
  cargo: Etiqueta | null;
  regional: Etiqueta | null;
  servicio: Etiqueta | null;
  proceso: Etiqueta | null;
  tipo: Etiqueta | null;
  /** Varias: una formacion puede responder a mas de una norma (ver cabecera). */
  normas: Etiqueta[];
}

export interface GrupoAnalitica {
  id: string | null;
  label: string;
  resumen: ResumenEjecucion;
}

export interface ResultadoAnalitica {
  dimension: Dimension;
  grupos: GrupoAnalitica[];
  /** El universo real, sin duplicar por norma. Es contra el que se compara. */
  resumen: ResumenEjecucion;
  /** true cuando los grupos suman mas que el universo (solo pasa agrupando por norma). */
  sumaMasQueElTotal: boolean;
}

/** Las etiquetas de un hecho en una dimension. Varias solo en norma; ninguna = sin valor. */
function etiquetasDe(hecho: HechoAnalitica, dimension: Dimension): Etiqueta[] {
  if (dimension === 'norma') return hecho.normas;
  const unica = hecho[dimension];
  return unica ? [unica] : [];
}

export function agrupar(hechos: HechoAnalitica[], dimension: Dimension): ResultadoAnalitica {
  const porGrupo = new Map<string, { label: string; id: string | null; estados: EstadoEjecucion[] }>();
  let repeticiones = 0;

  for (const hecho of hechos) {
    const etiquetas = etiquetasDe(hecho, dimension);
    repeticiones += Math.max(1, etiquetas.length);

    /*
      SIN VALOR SE AGRUPA, NO SE DESCARTA.

      Quien no tiene regional asignada tambien tiene obligaciones, y si sus filas desaparecen el
      total del informe deja de cuadrar con el de la pantalla de seguimiento — y entonces alguien
      pierde una tarde buscando el descuadre. Ademas, "23 personas sin regional" ES un hallazgo:
      normalmente significa que faltan datos por cargar.
    */
    const destinos: Etiqueta[] = etiquetas.length > 0 ? etiquetas : [{ id: null, name: DIMENSIONES[dimension].sinValor }];

    for (const etiqueta of destinos) {
      const clave = etiqueta.id ?? '__sin_valor__';
      const grupo = porGrupo.get(clave);
      if (grupo) grupo.estados.push(hecho.estado);
      else porGrupo.set(clave, { id: etiqueta.id, label: etiqueta.name, estados: [hecho.estado] });
    }
  }

  const grupos = [...porGrupo.values()]
    .map((grupo) => ({ id: grupo.id, label: grupo.label, resumen: resumirEjecucion(grupo.estados) }))
    /*
      SE ORDENA POR LO QUE HAY QUE MIRAR, igual que el seguimiento: primero lo atrasado, despues lo
      que espera convocatoria, y al final lo que va bien. Alfabeticamente obligaria a recorrer la
      lista entera para encontrar el problema, y entonces no se recorre.
    */
    .sort((a, b) => {
      if (b.resumen.atrasadas !== a.resumen.atrasadas) return b.resumen.atrasadas - a.resumen.atrasadas;
      if (b.resumen.esperando !== a.resumen.esperando) return b.resumen.esperando - a.resumen.esperando;
      if (a.resumen.avancePct !== b.resumen.avancePct) return a.resumen.avancePct - b.resumen.avancePct;
      return a.label.localeCompare(b.label, 'es');
    });

  return {
    dimension,
    grupos,
    resumen: resumirEjecucion(hechos.map((hecho) => hecho.estado)),
    sumaMasQueElTotal: repeticiones > hechos.length,
  };
}
