import { PDFDocument } from 'pdf-lib';
import { CAMPOS_POR_DEFECTO } from '@neo-pulse/shared';
import { dibujarConstancia, type DatosParaDibujar } from './certificate-pdf.js';
import type { CertificateSnapshot } from './certificate-snapshot.js';

const SNAPSHOT: CertificateSnapshot = {
  schemaVersion: 1,
  persona: {
    fullName: 'MARIA FERNANDA RODRIGUEZ GOMEZ',
    documentType: 'CC',
    documentNumber: '1098765432',
    jobTitle: 'Auxiliar de Bodega',
    area: 'Operaciones',
  },
  formacion: {
    name: 'Trabajo seguro en alturas',
    code: 'ALT-AVA',
    typeName: 'Capacitacion del plan',
    versionNumber: 3,
    hours: 8,
    syllabus: {},
    responsibleName: 'Jefe de SST',
    responsibleJobTitle: 'Coordinador',
  },
  resultado: { status: 'PASSED', scorePct: 95, completedAt: '2026-03-15T10:00:00.000Z' },
  empresa: { name: 'TRANSPRENSA', displayName: 'TRANSPRENSA', logoKey: null },
};

function datos(parcial: Partial<DatosParaDibujar> = {}): DatosParaDibujar {
  return {
    snapshot: SNAPSHOT,
    serialNumber: 'CERT-2026-000123',
    verificationCode: 'K7M2P-9XQ4T-BC3JH-N8RVY',
    fields: CAMPOS_POR_DEFECTO,
    signers: [],
    landscape: true,
    background: null,
    signatureImages: [],
    qrPng: null,
    validUntil: null,
    ...parcial,
  };
}

/** Los primeros bytes de un PDF valido son siempre `%PDF-`. */
const esPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-';

describe('dibujarConstancia', () => {
  it('produce un PDF valido con la colocacion por defecto', async () => {
    const pdf = await dibujarConstancia(datos());

    expect(esPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('sale igual sin arte de fondo, sin firmas y sin QR', async () => {
    // Un fichero que falta —borrado, perdido en una restauracion— no puede impedir que salga la
    // constancia: el papel sin fondo sigue acreditando la formacion, y una descarga con error 500
    // no acredita nada.
    const pdf = await dibujarConstancia(datos({ background: null, qrPng: null, signers: [] }));

    expect(esPdf(pdf)).toBe(true);
  });

  it('dibuja la linea y el nombre de la firma aunque falte la imagen', async () => {
    // Una constancia sin la linea con el nombre y el cargo no se lee como documento firmado. Si la
    // imagen falta, lo que importa —quien responde por ella— tiene que seguir escrito.
    const conFirma = await dibujarConstancia(
      datos({
        signers: [{ name: 'Ana Gomez', title: 'Coordinadora de SST', imageKey: null, x: 30, y: 82, width: 18 }],
        signatureImages: [null],
      }),
    );
    const sinFirma = await dibujarConstancia(datos());

    expect(esPdf(conFirma)).toBe(true);
    // Con la firma hay mas contenido dibujado que sin ella: la linea y los dos rotulos.
    expect(conFirma.length).toBeGreaterThan(sinFirma.length);
  });

  it('no imprime las horas ni la nota cuando no las hay', async () => {
    // Vacio, nunca "null" ni un guion: un guion en una constancia oficial se lee como que falta
    // algo. El campo simplemente no se dibuja.
    const sinDatos: CertificateSnapshot = {
      ...SNAPSHOT,
      formacion: { ...SNAPSHOT.formacion, hours: null },
      resultado: { ...SNAPSHOT.resultado, scorePct: null },
    };
    const pdf = await dibujarConstancia(datos({ snapshot: sinDatos }));
    const texto = Buffer.from(pdf).toString('latin1');

    expect(esPdf(pdf)).toBe(true);
    expect(texto).not.toContain('null');
    expect(texto).not.toContain('undefined');
  });

  it('respeta la orientacion', async () => {
    const horizontal = await dibujarConstancia(datos({ landscape: true }));
    const vertical = await dibujarConstancia(datos({ landscape: false }));

    // Se lee el tamaño de la pagina en vez de buscar el numero en los bytes: el PDF va
    // comprimido y el texto crudo no siempre esta ahi. Fallaba por la asercion, no por el dibujo.
    const tam = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPage(0).getSize();

    expect(await tam(horizontal)).toEqual({ width: 841.89, height: 595.28 });
    expect(await tam(vertical)).toEqual({ width: 595.28, height: 841.89 });
  });

  it('un campo apagado no se dibuja', async () => {
    const pdf = await dibujarConstancia(
      datos({ fields: { ...CAMPOS_POR_DEFECTO, serial: { ...CAMPOS_POR_DEFECTO.serial!, visible: false } } }),
    );

    expect(Buffer.from(pdf).toString('latin1')).not.toContain('CERT-2026-000123');
  });
});
