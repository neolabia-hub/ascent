import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { certificateFieldsSchema, firmanteSchema, CAMPOS_POR_DEFECTO } from '@neo-pulse/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { dibujarConstancia } from './certificate-pdf.js';
import type { CertificateSnapshot } from './certificate-snapshot.js';

/**
 * ARMA EL PDF de una constancia (Decision #112).
 *
 * ─── NO SE GUARDA EL PDF, SE VUELVE A DIBUJAR ───
 *
 * `certificates.pdf_storage_key` existe desde el Sprint 0 y sigue vacio a proposito. Dibujar toma
 * milisegundos y el resultado es IDENTICO siempre, porque todo sale del snapshot congelado: no hay
 * nada que ganar guardando un fichero por persona y formacion —seiscientas personas por veinte
 * formaciones son doce mil PDF— y si hay algo que perder, que es la coherencia el dia que se
 * corrija un fallo de dibujo y la mitad de los papeles guardados sigan con el fallo.
 *
 * Si algun dia hace falta congelar el binario —una firma digital con estampado de tiempo, por
 * ejemplo— la columna ya esta y este es el sitio donde se rellenaria.
 */
@Injectable()
export class CertificateRenderService {
  private readonly logger = new Logger(CertificateRenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** El PDF de una constancia ya emitida. */
  async pdfDeConstancia(tenantId: string, id: string): Promise<{ pdf: Uint8Array; nombreArchivo: string }> {
    const certificado = await this.prisma.forTenant(tenantId).certificate.findUnique({
      where: { id },
      select: {
        serialNumber: true,
        verificationCode: true,
        validUntil: true,
        renderSnapshot: true,
        template: { select: { backgroundKey: true, landscape: true, fields: true, signers: true } },
      },
    });
    if (!certificado) throw new NotFoundException({ code: 'CERTIFICATE_NOT_FOUND' });

    const snapshot = certificado.renderSnapshot as unknown as CertificateSnapshot;
    const pdf = await this.armar({
      snapshot,
      serialNumber: certificado.serialNumber,
      verificationCode: certificado.verificationCode,
      plantilla: certificado.template,
      validUntil: certificado.validUntil,
    });

    // El nombre del fichero descargado importa: acaba en la carpeta de alguien junto a otros
    // cuarenta. Que diga de quien y de que es, no "certificate.pdf".
    const limpio = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
    return { pdf, nombreArchivo: `${limpio(snapshot.persona.fullName)}-${limpio(snapshot.formacion.name)}.pdf` };
  }

  /**
   * VISTA PREVIA de una plantilla, con datos de ejemplo.
   *
   * Es lo que convierte la pantalla de colocacion en algo usable: sin ella, quien disena mueve
   * numeros a ciegas y solo descubre que el nombre queda encima del logo cuando ya se emitieron
   * cuarenta constancias. Los datos son inventados y se nota que lo son —"MARIA FERNANDA
   * RODRIGUEZ GOMEZ" es largo a proposito—: el caso que rompe una colocacion es siempre el nombre
   * mas largo, no el mas corto.
   */
  async vistaPrevia(tenantId: string, templateId: string): Promise<Uint8Array> {
    const plantilla = await this.prisma
      .forTenant(tenantId)
      .certificateTemplate.findUnique({
        where: { id: templateId },
        select: { backgroundKey: true, landscape: true, fields: true, signers: true },
      });
    if (!plantilla) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND' });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    const ejemplo: CertificateSnapshot = {
      schemaVersion: 1,
      persona: {
        fullName: 'MARIA FERNANDA RODRIGUEZ GOMEZ',
        documentType: 'CC',
        documentNumber: '1098765432',
        jobTitle: 'Auxiliar de Bodega',
        area: 'Operaciones',
      },
      formacion: {
        name: 'Trabajo seguro en alturas — nivel avanzado',
        code: 'ALT-AVA',
        typeName: 'Capacitacion del plan',
        versionNumber: 3,
        hours: 8,
        syllabus: {},
        responsibleName: null,
        responsibleJobTitle: null,
      },
      resultado: { status: 'PASSED', scorePct: 95, completedAt: new Date().toISOString() },
      empresa: { name: tenant?.name ?? '', displayName: tenant?.name ?? '', logoKey: null },
    };

    return this.armar({
      snapshot: ejemplo,
      serialNumber: 'CERT-2026-000123',
      verificationCode: 'K7M2P-9XQ4T-BC3JH-N8RVY',
      plantilla,
      // La vista previa inventa un vencimiento para poder colocar ese campo: sin el, quien lo
      // enciende no ve nada que arrastrar y cree que esta roto.
      validUntil: new Date(Date.now() + 365 * 86_400_000),
    });
  }

  private async armar(entrada: {
    snapshot: CertificateSnapshot;
    serialNumber: string;
    verificationCode: string;
    plantilla: { backgroundKey: string | null; landscape: boolean; fields: unknown; signers: unknown } | null;
    validUntil: Date | null;
  }): Promise<Uint8Array> {
    const plantilla = entrada.plantilla;

    /*
      SI LA PLANTILLA TIENE LOS CAMPOS VACIOS, se usan los de por defecto.

      Una plantilla recien creada tiene `{}` y dibujarla asi daria una hoja con el arte y sin el
      nombre de nadie — que parece que el sistema esta roto. Con los de por defecto sale algo
      sensato desde el primer momento y quien disene mueve lo que no le cuadre.
    */
    const parseados = certificateFieldsSchema.safeParse(plantilla?.fields ?? {});
    const campos = parseados.success && Object.keys(parseados.data).length > 0 ? parseados.data : CAMPOS_POR_DEFECTO;

    const firmantes = z.array(firmanteSchema).safeParse(plantilla?.signers ?? []);
    const signers = firmantes.success ? firmantes.data : [];

    const [background, signatureImages, qrPng] = await Promise.all([
      this.leerOptativo(plantilla?.backgroundKey ?? null),
      Promise.all(signers.map((firmante) => this.leerOptativo(firmante.imageKey))),
      this.qrDe(entrada.verificationCode),
    ]);

    return dibujarConstancia({
      snapshot: entrada.snapshot,
      serialNumber: entrada.serialNumber,
      verificationCode: entrada.verificationCode,
      fields: campos,
      signers,
      landscape: plantilla?.landscape ?? true,
      background,
      signatureImages,
      qrPng,
      validUntil: entrada.validUntil,
    });
  }

  /**
   * Lee del almacen sin romper si no esta.
   *
   * Un fichero que falta —lo borraron, se perdio en una restauracion— NO puede impedir que salga
   * la constancia: el papel sin el arte de fondo sigue acreditando la formacion, y una descarga que
   * falla con error 500 no acredita nada. Se registra y se sigue.
   */
  private async leerOptativo(key: string | null): Promise<Buffer | null> {
    if (!key) return null;
    return this.storage.read(key).catch((error: unknown) => {
      this.logger.warn(`No se pudo leer ${key} para la constancia: ${(error as Error).message}`);
      return null;
    });
  }

  /**
   * EL QR APUNTA A LA PANTALLA PUBLICA DE VERIFICACION, no al codigo pelado.
   *
   * Un QR con solo "K7M2P-9XQ4T-..." obliga a quien lo escanea a saber donde meterlo, y no lo
   * sabe: es alguien de otra empresa comprobando un papel que le entregaron. Con la URL completa,
   * escanear y ver el resultado es un gesto.
   */
  private async qrDe(codigo: string): Promise<Buffer | null> {
    const base = process.env.FRONTEND_URL ?? '';
    if (!base) return null;
    try {
      const { toBuffer } = await import('qrcode');
      return await toBuffer(`${base}/verificar/${encodeURIComponent(codigo)}`, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 512,
      });
    } catch (error) {
      this.logger.warn(`No se pudo generar el QR: ${(error as Error).message}`);
      return null;
    }
  }
}
