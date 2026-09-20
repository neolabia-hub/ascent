import { z } from 'zod';

/**
 * DONDE VA CADA CAMPO EN LA CONSTANCIA (Decision #112).
 *
 * El cliente sube su arte y nosotros escribimos encima. Esto describe DONDE y COMO.
 *
 * ─── COORDENADAS EN PORCENTAJE, NO EN MILIMETROS NI PIXELES ───
 *
 * El arte puede venir a cualquier resolucion: el mismo diseño exportado a 1000 px o a 4000 px es
 * la misma constancia, y en porcentaje la posicion no cambia. Con pixeles habria que reposicionar
 * todo cada vez que alguien reexporta su imagen un poco mas grande.
 *
 * ORIGEN ARRIBA-IZQUIERDA, como la pantalla donde se colocan. El PDF cuenta desde abajo, y esa
 * conversion se hace al dibujar: hacerla al reves obligaria a quien arrastra los campos a pensar
 * al reves, que es la clase de detalle que convierte una pantalla util en una pantalla que nadie
 * quiere volver a abrir.
 *
 * ─── EL TAMANO TAMBIEN ES RELATIVO ───
 *
 * `size` es el alto de la letra en porcentaje del ALTO de la hoja. Un 3 son unos 6 mm en A4
 * horizontal. En puntos tipograficos absolutos, el mismo numero se veria enorme en A5 y diminuto
 * en A3.
 */
export const campoSchema = z.object({
  /** `false` esconde el campo sin perder su posicion: se vuelve a encender y sigue donde estaba. */
  visible: z.boolean().default(true),
  /** Porcentaje del ancho de la hoja, desde la izquierda. */
  x: z.number().min(0).max(100),
  /** Porcentaje del alto de la hoja, desde ARRIBA. */
  y: z.number().min(0).max(100),
  /** Alto de la letra en porcentaje del alto de la hoja. */
  size: z.number().min(0.5).max(20).default(3),
  /**
   * `center` es el valor util para casi todo: el nombre va centrado bajo una linea del arte, y
   * centrado significa que un nombre largo y uno corto quedan igual de bien puestos. Con `left`
   * habria que recolocar el campo segun la longitud del nombre, que es imposible de antemano.
   */
  align: z.enum(['left', 'center', 'right']).default('center'),
  bold: z.boolean().default(false),
  /** HEX. Por defecto casi negro, no negro puro: sobre papel impreso el negro puro se ve duro. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#101418'),
});

export type CampoConstancia = z.infer<typeof campoSchema>;

/**
 * LOS CAMPOS QUE SE PUEDEN COLOCAR, y solo estos.
 *
 * La lista es cerrada a proposito. Con campos libres, alguien pondria "{{jefe}}" en su plantilla y
 * el dia que ese dato no exista la constancia saldria con el texto crudo impreso — o peor, en
 * blanco y sin que nadie lo note hasta que la vea un auditor. Todos estos salen del snapshot
 * congelado, asi que todos tienen valor siempre.
 *
 * `qr` no es texto: es el codigo de verificacion dibujado, para que quien reciba el papel pueda
 * comprobarlo con el telefono sin teclear veinte caracteres.
 */
export const CAMPOS_CONSTANCIA = [
  'nombre',
  'documento',
  'cargo',
  'area',
  'formacion',
  'tipo',
  'horas',
  'fecha',
  'vence',
  'serial',
  'codigo',
  'nota',
  'qr',
  /**
   * QUE MODULOS COMPONEN EL PROGRAMA (2026-09-15). Solo imprime algo en una constancia DE
   * PROGRAMA — en una de formacion suelta sale vacio, porque no hay modulos que listar. Es el
   * unico campo que puede ocupar VARIAS LINEAS: quien lo coloque tiene que dejarle sitio debajo.
   */
  'modulos',
] as const;

export type CampoClave = (typeof CAMPOS_CONSTANCIA)[number];

export const certificateFieldsSchema = z
  .object({
    nombre: campoSchema.optional(),
    documento: campoSchema.optional(),
    /** El cargo QUE TENIA al cursarla, no el de hoy: el papel no habla de hoy. */
    cargo: campoSchema.optional(),
    area: campoSchema.optional(),
    formacion: campoSchema.optional(),
    /** "Capacitacion del plan", "Induccion general". El nombre del tipo en esa empresa. */
    tipo: campoSchema.optional(),
    horas: campoSchema.optional(),
    fecha: campoSchema.optional(),
    /** Hasta cuando acredita. Solo sale en lo que se repite; lo que no vence no lo pinta. */
    vence: campoSchema.optional(),
    serial: campoSchema.optional(),
    codigo: campoSchema.optional(),
    nota: campoSchema.optional(),
    qr: campoSchema.optional(),
    modulos: campoSchema.optional(),
  })
  .strict();

export type CertificateFields = z.infer<typeof certificateFieldsSchema>;

/** Una firma: la imagen y a quien pertenece. El cargo importa tanto como el nombre. */
export const firmanteSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().max(120).default(''),
  /** PNG con fondo transparente, subido a `/media/upload?kind=signature`. */
  imageKey: z.string().max(500).nullable().default(null),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  /** Ancho de la firma en porcentaje del ancho de la hoja. El alto sale de la proporcion. */
  width: z.number().min(2).max(60).default(18),
});

export type FirmanteConstancia = z.infer<typeof firmanteSchema>;

export const certificateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  backgroundKey: z.string().max(500).nullable().default(null),
  landscape: z.boolean().default(true),
  fields: certificateFieldsSchema.default({}),
  // Cuatro firmas es mas de lo que cabe legible en una hoja; el tope evita una plantilla imposible.
  signers: z.array(firmanteSchema).max(4).default([]),
  active: z.boolean().default(false),
});

export type CertificateTemplateInput = z.infer<typeof certificateTemplateSchema>;

/**
 * LA COLOCACION POR DEFECTO de una plantilla nueva.
 *
 * No se deja vacia: una plantilla sin campos produce una constancia que es solo el fondo, sin el
 * nombre de nadie, y eso parece que el sistema esta roto. Con estas posiciones sale algo sensato
 * de entrada —nombre grande al centro, datos debajo, serial y QR en la esquina— y quien la disene
 * mueve lo que no le cuadre en vez de partir de una hoja en blanco.
 */
export const CAMPOS_POR_DEFECTO: CertificateFields = {
  nombre: { visible: true, x: 50, y: 44, size: 5, align: 'center', bold: true, color: '#101418' },
  documento: { visible: true, x: 50, y: 52, size: 2.4, align: 'center', bold: false, color: '#4b5563' },
  /*
    APAGADOS DE ENTRADA, no ausentes. Cargo, area, tipo y vencimiento son utiles pero no van en
    todas las constancias, y encenderlos todos por defecto daria un papel abarrotado que hay que
    desmontar. Salen en la lista para que se sepa que existen, y se encienden si hacen falta.
  */
  cargo: { visible: false, x: 50, y: 57, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  area: { visible: false, x: 50, y: 57, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  tipo: { visible: false, x: 50, y: 58, size: 2, align: 'center', bold: false, color: '#6b7280' },
  vence: { visible: false, x: 50, y: 78, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  formacion: { visible: true, x: 50, y: 62, size: 3.2, align: 'center', bold: true, color: '#101418' },
  horas: { visible: true, x: 50, y: 68, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  fecha: { visible: true, x: 50, y: 73, size: 2.2, align: 'center', bold: false, color: '#4b5563' },
  serial: { visible: true, x: 6, y: 94, size: 1.8, align: 'left', bold: false, color: '#6b7280' },
  codigo: { visible: false, x: 6, y: 97, size: 1.6, align: 'left', bold: false, color: '#6b7280' },
  nota: { visible: false, x: 94, y: 94, size: 1.8, align: 'right', bold: false, color: '#6b7280' },
  qr: { visible: true, x: 92, y: 90, size: 10, align: 'center', bold: false, color: '#101418' },
  // Apagado de entrada, como cargo/area/tipo/vence: solo dice algo en un programa, y quien no los
  // usa no tiene por que verlo ocupando un hueco en su plantilla.
  modulos: { visible: false, x: 50, y: 84, size: 1.8, align: 'center', bold: false, color: '#4b5563' },
};
