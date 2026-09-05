import type ExcelJS from 'exceljs';

/**
 * EL FORMATO COMUN DE LOS LIBROS QUE SE LLEVA EL AUDITOR.
 *
 * Nacio dentro del export de Seguimiento (Decision #124) y se saco aqui al aparecer el segundo
 * —el consolidado de desempeno—: son las dos piezas que hacen auditable un archivo, y tenerlas
 * dos veces garantiza que un dia un informe lleve fecha y el otro no.
 *
 * Lo que NO va aqui son las columnas ni los datos: eso es de cada informe.
 */

/**
 * Las tres lineas de arriba: de quien es, que es, y en que condiciones se genero.
 *
 * EL FILTRO SE DECLARA DENTRO DEL ARCHIVO. Doce filas sin decir que solo son las atrasadas se leen
 * como el universo entero, y entonces el informe miente sin que nadie haya mentido. Va en el
 * archivo y no en el nombre: el nombre se cambia al guardarlo, el contenido no.
 */
export function escribirCabecera(
  hoja: ExcelJS.Worksheet,
  encabezado: { empresa: string; titulo: string; contexto: (string | null)[] },
  columnas: number,
): void {
  hoja.addRow([encabezado.empresa]);
  hoja.getRow(1).font = { bold: true, size: 14 };
  hoja.addRow([encabezado.titulo]);
  hoja.addRow([encabezado.contexto.filter(Boolean).join('  |  ')]);
  hoja.getRow(3).font = { size: 10, color: { argb: 'FF6B7280' } };
  hoja.addRow([]);
  hoja.mergeCells(1, 1, 1, columnas);
  hoja.mergeCells(2, 1, 2, columnas);
  hoja.mergeCells(3, 1, 3, columnas);
}

/**
 * La fila de titulos, con anchos, CONGELADA y con AUTOFILTRO.
 *
 * Sin eso, seiscientas filas obligan a recordar que columna era cual, y quien audita vuelve a pedir
 * otra exportacion por cada pregunta. Con el autofiltro, el archivo se recorta solo.
 */
export function encabezadoDeTabla(hoja: ExcelJS.Worksheet, titulos: string[], anchos: number[]): void {
  const fila = hoja.addRow(titulos);
  fila.font = { bold: true };
  fila.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  });
  titulos.forEach((_, indice) => {
    hoja.getColumn(indice + 1).width = anchos[indice] ?? 18;
  });
  hoja.autoFilter = { from: { row: fila.number, column: 1 }, to: { row: fila.number, column: titulos.length } };
  hoja.views = [{ state: 'frozen', ySplit: fila.number }];
}
