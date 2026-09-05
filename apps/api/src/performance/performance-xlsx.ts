import ExcelJS from 'exceljs';
import { encabezadoDeTabla, escribirCabecera } from '../common/xlsx.js';

/**
 * EL CONSOLIDADO DE UN CICLO, EN UN ARCHIVO (2026-09-02).
 *
 * ─── POR QUE, SI LA PANTALLA YA LO ENSENA ───
 *
 * La pantalla contesta "¿como va la campana?" mirando, y se queda en las 100 primeras filas. Lo que
 * se pide despues es otra cosa: el universo completo con fecha, para ordenar por nota, cruzar por
 * area y guardarlo como evidencia del ano. Es el mismo motivo que el export de Seguimiento.
 *
 * ─── DOS HOJAS, Y NO UNA ───
 *
 * "Por formulario" y "persona por persona" responden preguntas distintas: la primera es la unica
 * que sirve para comparar conductores con analistas —promedios de poblaciones distintas—, y la
 * segunda es la evidencia nominal. Mezcladas, una tabla dinamica al lado de un resumen, ninguna de
 * las dos se puede filtrar sin romper la otra.
 *
 * ─── LA NOTA VA COMO NUMERO ───
 *
 * En fraccion con formato de porcentaje, no como texto "80%": asi se puede promediar la columna,
 * graficarla y ordenarla. Un porcentaje escrito no se puede ni sumar.
 */

export interface CabeceraConsolidado {
  empresa: string;
  cicloNombre: string;
  generadoEn: Date;
  abre: Date;
  cierra: Date;
  estado: string;
}

export interface FilaPorFormulario {
  name: string;
  total: number;
  entregadas: number;
  firmadas: number;
  promedio: number | null;
}

export interface FilaDeEvaluacion {
  subjectName: string | null;
  subjectJobTitle: string | null;
  subjectArea: string | null;
  formulario: string | null;
  evaluatorName: string | null;
  esAutoevaluacion: boolean;
  entregada: boolean;
  score: number | null;
  firmadaEn: Date | null;
}

export async function libroDeConsolidado(
  cabecera: CabeceraConsolidado,
  porFormulario: FilaPorFormulario[],
  evaluaciones: FilaDeEvaluacion[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'NEO PULSE';
  libro.created = cabecera.generadoEn;

  const contexto = [
    `Generado el ${cabecera.generadoEn.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
    `Del ${cabecera.abre.toLocaleDateString('es-CO')} al ${cabecera.cierra.toLocaleDateString('es-CO')}`,
    `Estado del ciclo: ${cabecera.estado}`,
  ];

  // ── Hoja 1: por formulario ──────────────────────────────────────────────
  const resumen = libro.addWorksheet('Por formulario');
  escribirCabecera(
    resumen,
    { empresa: cabecera.empresa, titulo: `Desempeno — ${cabecera.cicloNombre}`, contexto },
    5,
  );
  encabezadoDeTabla(
    resumen,
    ['Formulario', 'Evaluaciones', 'Entregadas', 'Firmadas', 'Promedio'],
    [42, 14, 12, 11, 12],
  );
  for (const fila of porFormulario) {
    const escrita = resumen.addRow([
      fila.name,
      fila.total,
      fila.entregadas,
      fila.firmadas,
      fila.promedio === null ? null : fila.promedio / 100,
    ]);
    escrita.getCell(5).numFmt = '0%';
  }

  // ── Hoja 2: la evidencia nominal ────────────────────────────────────────
  const detalle = libro.addWorksheet('Persona por persona');
  escribirCabecera(
    detalle,
    { empresa: cabecera.empresa, titulo: `Desempeno — ${cabecera.cicloNombre}`, contexto },
    9,
  );
  encabezadoDeTabla(
    detalle,
    ['Persona', 'Cargo', 'Area', 'Formulario', 'Quien evalua', 'Tipo', 'Estado', 'Nota', 'Firmada el'],
    [30, 24, 22, 28, 26, 16, 13, 10, 14],
  );
  for (const fila of evaluaciones) {
    const escrita = detalle.addRow([
      fila.subjectName ?? '',
      fila.subjectJobTitle ?? '',
      fila.subjectArea ?? '',
      fila.formulario ?? '',
      fila.esAutoevaluacion ? 'Ella misma' : (fila.evaluatorName ?? ''),
      fila.esAutoevaluacion ? 'Autoevaluacion' : 'La del jefe',
      fila.entregada ? 'Entregada' : 'Pendiente',
      fila.score === null ? null : fila.score / 100,
      fila.firmadaEn,
    ]);
    escrita.getCell(8).numFmt = '0%';
    escrita.getCell(9).numFmt = 'dd/mm/yyyy';
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
