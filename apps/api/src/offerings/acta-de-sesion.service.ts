import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { dibujarActa, textoParaHuella, type FilaDelActa } from './acta-pdf.js';

/**
 * GENERAR EL ACTA DE UNA JORNADA (mecanismo 3, `PENDIENTES` 2.4).
 *
 * ─── POR QUE SE GUARDA Y NO SE DIBUJA AL VUELO ───
 *
 * Un acta es un documento con fecha: dice lo que se sabia el dia que se genero. Dibujarla cada vez
 * que alguien la abre daria un papel distinto cada mes —alguien corrigio una asistencia, alguien
 * cambio de cargo— y entonces el acta que se entrego en marzo no seria la que se ve hoy. Por eso se
 * guarda el PDF y su huella, y volver a generarla crea otra fila: **el historico no se pisa**.
 *
 * ─── LA HUELLA ───
 *
 * SHA-256 sobre lo que el acta AFIRMA —quien, cuando, y quien asistio con que estado y firma— y no
 * sobre los bytes del PDF, que cambian con la fecha de generacion. Asi dos actas del mismo contenido
 * tienen la misma huella, y se puede decir "este papel es el que genero el sistema" sin confiar en
 * el papel.
 */
@Injectable()
export class ActaDeSesionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async generar(actor: AuthUser, offeringId: string) {
    const tenantId = this.prisma.currentTenantId;

    const offering = await this.prisma.scoped.offering.findUnique({
      where: { id: offeringId },
      select: {
        id: true,
        code: true,
        status: true,
        scheduledDate: true,
        location: true,
        executedBy: true,
        executedByOther: true,
        intensityTheoryHours: true,
        intensityPracticeHours: true,
        instructorUserId: true,
        activityVersion: { select: { activity: { select: { name: true } } } },
      },
    });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    if (offering.status === 'DRAFT' || offering.status === 'CANCELLED') {
      throw new ConflictException({
        code: 'OFFERING_NOT_ATTENDABLE',
        message: 'Una jornada en borrador o cancelada no tiene acta: no hay sesión que documentar.',
      });
    }

    const [marcas, tenant, quienGenera, instructor] = await Promise.all([
      this.prisma.scoped.attendanceRecord.findMany({
        where: { offeringId },
        select: { userId: true, status: true, method: true, checkedAt: true, signatureKey: true },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.scoped.user.findUnique({ where: { id: actor.id }, select: { fullName: true } }),
      offering.instructorUserId
        ? this.prisma.scoped.user.findUnique({
            where: { id: offering.instructorUserId },
            select: { fullName: true },
          })
        : Promise.resolve(null),
    ]);

    if (marcas.length === 0) {
      throw new ConflictException({
        code: 'ATTENDANCE_EMPTY',
        message: 'Todavía no hay ninguna asistencia marcada: un acta vacia no documenta nada.',
      });
    }

    const gente = await this.prisma.scoped.user.findMany({
      where: { id: { in: marcas.map((fila) => fila.userId) } },
      select: { id: true, fullName: true, documentNumber: true, jobTitle: { select: { name: true } } },
    });
    const porId = new Map(gente.map((fila) => [fila.id, fila]));

    const filas: FilaDelActa[] = [];
    for (const marca of marcas) {
      const quien = porId.get(marca.userId);
      if (!quien) continue;
      filas.push({
        nombre: quien.fullName,
        documento: quien.documentNumber,
        cargo: quien.jobTitle?.name ?? null,
        estado: marca.status,
        metodo: marca.method,
        marcadaA: enBogota(marca.checkedAt),
        // Se lee del almacen aqui y no dentro del dibujo: quien dibuja no consulta nada, que es lo
        // que permite probar el acta entera sin infraestructura.
        firma: marca.signatureKey ? await this.leerFirma(marca.signatureKey) : null,
      });
    }
    // Por nombre: es como se lee una lista de asistencia y como se busca a alguien en ella.
    filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const base = {
      empresa: tenant?.name ?? 'Ascent',
      formacion: offering.activityVersion.activity.name,
      jornada: offering.code,
      fecha: offering.scheduledDate ? enBogota(offering.scheduledDate).slice(0, 10) : 'sin fecha',
      lugar: offering.location,
      instructor: instructor?.fullName ?? offering.executedByOther ?? offering.executedBy ?? null,
      intensidad: intensidadDe(offering.intensityTheoryHours, offering.intensityPracticeHours),
      filas,
    };
    const huella = createHash('sha256').update(textoParaHuella(base)).digest('hex');

    const ahora = new Date();
    const pdf = await dibujarActa({
      ...base,
      huella,
      generadaEl: enBogota(ahora),
      generadaPor: quienGenera?.fullName ?? 'la plataforma',
    });

    const storageKey = this.storage.buildKey(tenantId, 'actas', `acta-${offering.code}.pdf`);
    await this.storage.put(storageKey, Buffer.from(pdf), 'application/pdf');

    const acta = await this.prisma.scoped.sessionAct.create({
      data: { tenantId, offeringId, pdfStorageKey: storageKey, contentHash: huella, generatedBy: actor.id },
      select: { id: true, generatedAt: true, contentHash: true, pdfStorageKey: true },
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'SESSION_ACT_GENERATED',
      resourceType: 'offerings',
      resourceId: offeringId,
      newValues: { actaId: acta.id, huella, personas: filas.length, firmadas: filas.filter((f) => f.firma).length },
    });

    return {
      id: acta.id,
      generadaEl: acta.generatedAt,
      huella: acta.contentHash,
      url: this.storage.signPath(acta.pdfStorageKey),
      personas: filas.length,
      firmadas: filas.filter((fila) => fila.firma).length,
    };
  }

  /** Las actas de una jornada, la mas reciente primero. Volver a generarla NO pisa la anterior. */
  async deLaJornada(offeringId: string) {
    const actas = await this.prisma.scoped.sessionAct.findMany({
      where: { offeringId },
      orderBy: { generatedAt: 'desc' },
      select: { id: true, generatedAt: true, contentHash: true, pdfStorageKey: true, generatedBy: true },
    });
    return actas.map((acta) => ({
      id: acta.id,
      generadaEl: acta.generatedAt,
      huella: acta.contentHash,
      url: this.storage.signPath(acta.pdfStorageKey),
    }));
  }

  /** Una firma ilegible no puede tumbar el acta: la fila sale sin ella, que es la verdad. */
  private async leerFirma(key: string): Promise<Buffer | null> {
    try {
      return await this.storage.read(key);
    } catch {
      return null;
    }
  }
}

/** Hora de Bogota, que es la del salon donde se firmo. */
function enBogota(fecha: Date): string {
  return new Date(fecha.getTime() - 5 * 3600000).toISOString().replace('T', ' ').slice(0, 16);
}

function intensidadDe(teoria: unknown, practica: unknown): string | null {
  const horas = Number(teoria ?? 0) + Number(practica ?? 0);
  return horas > 0 ? `${horas} hora${horas === 1 ? '' : 's'}` : null;
}
