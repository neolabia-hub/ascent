import ExcelJS from 'exceljs';
import { encabezadoDeTabla, escribirCabecera as escribirCabeceraComun } from '../common/xlsx.js';
import { ESTADO_LABEL, type EstadoEjecucion, type ResumenEjecucion } from './execution-state.js';

/**
 * EL SEGUIMIENTO, EN UN ARCHIVO QUE SE LLEVA EL AUDITOR (Decision #124).
 *
 * ─── POR QUE EXISTE ───
 *
 * La pantalla contesta "¿como vamos?" mirando. La auditoria pide otra cosa: un archivo con fecha,
 * con el universo completo, y donde quien audita pueda ordenar, filtrar y recontar por su cuenta.
 * Un pantallazo no sirve —no se puede recontar— y leerle la pantalla, tampoco.
 *
 * ─── XLSX Y NO CSV ───
 *
 * El mismo motivo que la plantilla de personas: un CSV abierto en un Excel en espanol parte por
 * comas lo que deberia partir por punto y coma, convierte "0987" en 987 y "12-03" en una fecha. El
 * archivo llega a manos que no van a depurarlo.
 *
 * ─── LO QUE SE EXPORTA ES LO QUE SE VE ───
 *
 * Las filas las arma el MISMO servicio que pinta la pantalla, no una consulta paralela: un informe
 * que no cuadra con lo que se acaba de mirar destruye la confianza en los dos a la vez. Aqui solo
 * se da formato.
 */

/** El encabezado que hace auditable el archivo: de quien, de que, cuando y con que filtro. */
export interface Cabecera {
  tenantName: string;
  generadoEn: Date;
  /** Que se estaba mirando. `null` = toda la ejecucion. */
  formacion?: string | null;
  /** El filtro de estado que estaba puesto, si lo habia. */
  estado?: EstadoEjecucion | null;
}

export interface FilaGeneralExport {
  activityName: string;
  typeName: string | null;
  processName: string | null;
  resumen: ResumenEjecucion;
}

export interface FilaPersonaExport {
  fullName: string;
  documentNumber: string;
  area: string | null;
  jobTitle: string | null;
  estado: EstadoEjecucion;
  dueAt: Date | string | null;
  versionNumber: number | null;
  completedAt: Date | string | null;
  intentos: number;
  mejorNota: number | null;
  encuesta: string | null;
  respondioEncuesta: boolean;
  certificadoId: string | null;
}

const ENCUESTA_LABEL: Record<string, string> = {
  POSITIVE: 'Positiva',
  NEGATIVE: 'Negativa',
  NA: 'Respondida',
};

/**
 * La fecha va como FECHA, no como texto.
 *
 * Un "2026-09-01" en una celda de texto no se ordena ni se filtra por rango, que es exactamente lo
 * que se hace con la columna de vencimientos.
 */
function comoFecha(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * La cabecera de ESTE informe, con el formato comun (`common/xlsx.ts`).
 *
 * Lo que aporta aqui es el CONTEXTO: la formacion que se estaba mirando y el filtro de estado que
 * habia puesto, que es lo que impide que doce filas se lean como el universo entero.
 */
function escribirCabecera(hoja: ExcelJS.Worksheet, cabecera: Cabecera, titulo: string, columnas: number): void {
  escribirCabeceraComun(
    hoja,
    {
      empresa: cabecera.tenantName,
      titulo,
      contexto: [
        `Generado el ${cabecera.generadoEn.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
        cabecera.formacion ? `Formacion: ${cabecera.formacion}` : null,
        cabecera.estado
          ? `Filtro: solo ${ESTADO_LABEL[cabecera.estado].toLowerCase()}`
          : 'Sin filtros: todas las obligaciones',
      ],
    },
    columnas,
  );
}

/** Resumen por formacion: una fila por formacion, con su desglose de estados. */
export async function libroDeEjecucionGeneral(items: FilaGeneralExport[], cabecera: Cabecera): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'NEO PULSE';
  libro.created = cabecera.generadoEn;

  const hoja = libro.addWorksheet('Seguimiento');
  escribirCabecera(hoja, cabecera, 'Seguimiento de la ejecucion por formacion', 11);
  encabezadoDeTabla(
    hoja,
    [
      'Formacion',
      'Tipo',
      'Proceso',
      'Obligaciones',
      'Terminadas',
      'En curso',
      'Sin empezar',
      'Atrasadas',
      'Reprobadas',
      'Esperando convocatoria',
      'Avance',
    ],
    [42, 22, 22, 13, 12, 10, 12, 11, 12, 22, 10],
  );

  for (const item of items) {
    const fila = hoja.addRow([
      item.activityName,
      item.typeName ?? '',
      item.processName ?? '',
      item.resumen.total,
      item.resumen.terminadas,
      item.resumen.enCurso,
      item.resumen.sinEmpezar,
      item.resumen.atrasadas,
      item.resumen.reprobadas,
      item.resumen.esperando,
      // Fraccion con formato de porcentaje: en la celda queda un NUMERO, asi que promediar la
      // columna o graficarla funciona. Un "62%" de texto no se puede ni sumar.
      item.resumen.avancePct / 100,
    ]);
    fila.getCell(11).numFmt = '0%';
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Detalle de una formacion: una fila por persona. Es la evidencia nominal. */
export async function libroDeEjecucionDeActividad(
  items: FilaPersonaExport[],
  cabecera: Cabecera,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'NEO PULSE';
  libro.created = cabecera.generadoEn;

  const hoja = libro.addWorksheet('Personas');
  escribirCabecera(hoja, cabecera, 'Seguimiento persona por persona', 12);
  encabezadoDeTabla(
    hoja,
    [
      'Documento',
      'Persona',
      'Area',
      'Cargo',
      'Estado',
      'Vence',
      'Version',
      'Completado',
      'Intentos',
      'Mejor nota',
      'Encuesta',
      'Constancia',
    ],
    [16, 34, 22, 26, 22, 13, 9, 13, 10, 12, 13, 12],
  );

  for (const item of items) {
    const fila = hoja.addRow([
      // El documento como TEXTO: una cedula con ceros delante los pierde en cuanto Excel la lee
      // como numero, y ese es justo el dato con el que se cruza contra nomina.
      item.documentNumber,
      item.fullName,
      item.area ?? '',
      item.jobTitle ?? '',
      ESTADO_LABEL[item.estado],
      // A quien no ha podido empezar no se le pone fecha limite: es la misma acusacion absurda que
      // se corrigio en la pantalla —reclamarle un plazo a quien nunca tuvo puerta abierta—.
      item.estado === 'ESPERANDO' ? null : comoFecha(item.dueAt),
      item.versionNumber ?? '',
      comoFecha(item.completedAt),
      item.intentos,
      // `null` no es cero: es que no hubo examen. Un 0 diria que lo fallo entero.
      item.mejorNota === null ? '' : Math.round(item.mejorNota) / 100,
      item.respondioEncuesta ? (ENCUESTA_LABEL[item.encuesta ?? ''] ?? 'Respondida') : 'Sin responder',
      item.certificadoId ? 'Si' : 'No',
    ]);
    fila.getCell(1).numFmt = '@';
    fila.getCell(6).numFmt = 'yyyy-mm-dd';
    fila.getCell(8).numFmt = 'yyyy-mm-dd';
    if (item.mejorNota !== null) fila.getCell(10).numFmt = '0%';
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
