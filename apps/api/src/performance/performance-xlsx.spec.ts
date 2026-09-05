import ExcelJS from 'exceljs';
import { libroDeConsolidado } from './performance-xlsx.js';

/** El archivo se abre de verdad y se leen sus celdas: comprobar que "no revienta" no dice nada. */
async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

const cabecera = {
  empresa: 'TRANSPRENSA',
  cicloNombre: 'Desempeno 2026',
  generadoEn: new Date('2026-09-02T15:00:00Z'),
  abre: new Date('2026-09-01T00:00:00Z'),
  cierra: new Date('2026-12-31T23:59:59Z'),
  estado: 'Abierto',
};

describe('libroDeConsolidado', () => {
  it('lleva las dos hojas: comparar grupos y la evidencia nominal', async () => {
    const libro = await abrir(await libroDeConsolidado(cabecera, [], []));
    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Por formulario', 'Persona por persona']);
  });

  it('declara de quien es el archivo, de que ciclo y cuando se genero', async () => {
    // Un informe sin fecha ni empresa no sirve como evidencia: no se sabe de cuando es.
    const libro = await abrir(await libroDeConsolidado(cabecera, [], []));
    const hoja = libro.getWorksheet('Por formulario');
    expect(hoja?.getCell('A1').value).toBe('TRANSPRENSA');
    expect(String(hoja?.getCell('A2').value)).toContain('Desempeno 2026');
    expect(String(hoja?.getCell('A3').value)).toContain('Estado del ciclo: Abierto');
  });

  it('la nota va como NUMERO en fraccion, no como texto', async () => {
    // Asi se puede promediar la columna y ordenarla. Un "80%" escrito no se puede ni sumar.
    const libro = await abrir(
      await libroDeConsolidado(
        cabecera,
        [{ name: 'Conductores', total: 10, entregadas: 4, firmadas: 2, promedio: 80 }],
        [],
      ),
    );
    const hoja = libro.getWorksheet('Por formulario');
    const fila = hoja?.getRow(6);
    expect(fila?.getCell(1).value).toBe('Conductores');
    expect(fila?.getCell(5).value).toBeCloseTo(0.8);
    expect(fila?.getCell(5).numFmt).toBe('0%');
  });

  it('sin nota deja la celda VACIA y no un cero', async () => {
    // Un cero es una calificacion pesima; no haber respondido es otra cosa.
    const libro = await abrir(
      await libroDeConsolidado(
        cabecera,
        [{ name: 'Solo texto', total: 3, entregadas: 0, firmadas: 0, promedio: null }],
        [],
      ),
    );
    expect(libro.getWorksheet('Por formulario')?.getRow(6).getCell(5).value).toBeNull();
  });

  it('distingue la autoevaluacion de la del jefe en la evidencia nominal', async () => {
    const libro = await abrir(
      await libroDeConsolidado(cabecera, [], [
        {
          subjectName: 'Persona Uno',
          subjectJobTitle: 'Conductor',
          subjectArea: 'Operaciones',
          formulario: 'Conductores',
          evaluatorName: null,
          esAutoevaluacion: true,
          entregada: true,
          score: 90,
          firmadaEn: null,
        },
      ]),
    );
    const fila = libro.getWorksheet('Persona por persona')?.getRow(6);
    expect(fila?.getCell(5).value).toBe('Ella misma');
    expect(fila?.getCell(6).value).toBe('Autoevaluacion');
    expect(fila?.getCell(7).value).toBe('Entregada');
  });
});
