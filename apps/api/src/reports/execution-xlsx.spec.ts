import ExcelJS from 'exceljs';
import { libroDeEjecucionDeActividad, libroDeEjecucionGeneral } from './execution-xlsx.js';
import { resumirEjecucion } from './execution-state.js';

/**
 * Se comprueba leyendo el archivo DE VUELTA y no el codigo que lo escribe.
 *
 * Lo que puede salir mal aqui no es la logica sino como aterriza el dato en la celda —una cedula
 * convertida en numero, un porcentaje que es texto, un vencimiento que Excel no sabe ordenar— y eso
 * solo se ve abriendo el libro.
 */
async function abrir(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return libro.worksheets[0] as ExcelJS.Worksheet;
}

const CABECERA = { tenantName: 'TRANSPRENSA', generadoEn: new Date('2026-09-01T15:00:00Z') };

describe('libroDeEjecucionGeneral', () => {
  it('encabeza con la empresa y declara que no hay filtro', async () => {
    const hoja = await abrir(await libroDeEjecucionGeneral([], CABECERA));

    expect(hoja.getCell('A1').value).toBe('TRANSPRENSA');
    // Sin esta linea, un archivo recortado se lee como el universo entero.
    expect(String(hoja.getCell('A3').value)).toContain('Sin filtros');
  });

  it('declara el filtro con el nombre que usa la pantalla', async () => {
    const hoja = await abrir(await libroDeEjecucionGeneral([], { ...CABECERA, estado: 'ESPERANDO' }));

    expect(String(hoja.getCell('A3').value)).toContain('esperando convocatoria');
  });

  it('escribe el avance como numero y no como texto, para poder promediarlo', async () => {
    const hoja = await abrir(
      await libroDeEjecucionGeneral(
        [
          {
            activityName: 'Trabajo en alturas',
            typeName: 'Capacitacion del plan',
            processName: 'Almacenamiento',
            resumen: resumirEjecucion(['TERMINADA', 'TERMINADA', 'ATRASADA', 'ESPERANDO']),
          },
        ],
        CABECERA,
      ),
    );

    const fila = hoja.getRow(6);
    expect(fila.getCell(1).value).toBe('Trabajo en alturas');
    expect(fila.getCell(4).value).toBe(4);
    expect(fila.getCell(8).value).toBe(1);
    // 50% guardado como 0.5 con formato de porcentaje: sumable, graficable, ordenable.
    expect(fila.getCell(11).value).toBe(0.5);
    expect(fila.getCell(11).numFmt).toBe('0%');
  });
});

describe('libroDeEjecucionDeActividad', () => {
  const persona = {
    fullName: 'Auxiliar de bodega',
    documentNumber: '0104587632',
    area: 'Logistica',
    jobTitle: 'Auxiliar',
    estado: 'ATRASADA' as const,
    dueAt: '2026-08-15T00:00:00.000Z',
    versionNumber: 2,
    completedAt: null,
    intentos: 1,
    mejorNota: 72,
    encuesta: null,
    respondioEncuesta: false,
    certificadoId: null,
  };

  it('guarda el documento como texto: una cedula con ceros delante los conserva', async () => {
    const hoja = await abrir(await libroDeEjecucionDeActividad([persona], CABECERA));

    const fila = hoja.getRow(6);
    expect(fila.getCell(1).value).toBe('0104587632');
    expect(fila.getCell(5).value).toBe('Atrasada');
    expect(fila.getCell(6).value).toBeInstanceOf(Date);
    expect(fila.getCell(11).value).toBe('Sin responder');
    expect(fila.getCell(12).value).toBe('No');
  });

  it('a quien espera convocatoria no le pone fecha limite', async () => {
    // Es la misma acusacion absurda que se corrigio en pantalla: reclamar un plazo a quien nunca
    // tuvo puerta abierta. Si el archivo la trae, el reclamo se hace igual por correo.
    const hoja = await abrir(
      await libroDeEjecucionDeActividad([{ ...persona, estado: 'ESPERANDO' }], CABECERA),
    );

    expect(hoja.getRow(6).getCell(6).value).toBeNull();
  });

  it('sin examen deja la nota vacia y no un cero', async () => {
    const hoja = await abrir(await libroDeEjecucionDeActividad([{ ...persona, mejorNota: null }], CABECERA));

    // Un 0% diria que lo fallo entero; lo que pasa es que esa formacion no tiene examen.
    expect(hoja.getRow(6).getCell(10).value).toBe('');
  });
});
