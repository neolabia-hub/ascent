import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VersioningService } from './versioning.service.js';

/**
 * EL TRASPASO ENTRE QUIEN HACE LA FORMACION Y QUIEN LA APRUEBA (2026-09-22).
 *
 * ─── QUE PROBLEMA RESUELVE, QUE NO ES EL QUE PARECE ───
 *
 * El analista **ya no podia publicar**: esa compuerta existe desde el principio (`catalog:publish`
 * no esta en su rol). Lo que no habia era forma de decir *«termine, revisalo»*. El analista
 * acababa su formacion y **nadie se enteraba**: el administrador tenia que adivinar que mirar y
 * cuando, y al aprobar el plan estaria aprobando a ciegas veinte formaciones que nunca abrio.
 *
 * Asi que esto **no es una compuerta** —no impide nada que antes se pudiera hacer— sino el
 * traspaso, que es otra cosa y es la que faltaba. Lo pidio el cliente con estas palabras: *"cuando
 * ellos terminen de crear toda su formacion del plan, un boton de enviar aprobacion para que el
 * admin la revise"*.
 *
 * ─── POR QUE NO SE USO LA BANDEJA DE APROBACIONES QUE YA EXISTE ───
 *
 * `ApprovalsService.requestOrExecute` esta pensada para *«no tienes permiso, pidelo»*: una
 * EXCEPCION. Esto es el flujo normal de trabajo del analista, todos los dias. Mezclarlos dejaria
 * al administrador con una bandeja donde no distingue «este quiere saltarse una regla» de «este
 * termino lo suyo», que son dos cosas que se atienden distinto y con otra urgencia.
 *
 * ─── LOS CUATRO ESTADOS, Y LA REGLA QUE LOS SOSTIENE ───
 *
 *   SIN_ENVIAR → EN_REVISION → APROBADA → (se publica, que es otro acto y otro permiso)
 *                     ↓
 *                 DEVUELTA (con motivo) → vuelve a ser editable → EN_REVISION otra vez
 *
 * **Aprobar no publica.** Son dos actos y dos momentos: «esta bien hecha» no es «sale hoy». El
 * administrador aprueba cuando la reviso, y publica cuando toca —que en una capacitacion del plan
 * puede ser semanas despues, y lo decide el calendario, no la revision.
 */
@Injectable()
export class RevisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly versioning: VersioningService,
  ) {}

  /** La version con lo justo para decidir, y su formacion para poder nombrarla en los avisos. */
  private async cargar(versionId: string) {
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        versionNumber: true,
        submittedBy: true,
        activity: { select: { id: true, name: true } },
      },
    });
    if (!version) throw new NotFoundException({ code: 'VERSION_NOT_FOUND' });
    return version;
  }

  /**
   * EL ANALISTA LA DA POR TERMINADA.
   *
   * Comprueba **lo mismo que comprueba publicar** (`comprobarQueEstaLista`): sin contenidos, con
   * contenidos a medias o sin lo que el tipo exige, no se manda. Si «enviar a revision» fuera mas
   * permisivo que publicar, el administrador recibiria formaciones que no se pueden publicar y lo
   * descubriria al intentarlo, con quien las mando ya en otra cosa.
   */
  async enviarARevision(actor: AuthUser, versionId: string) {
    const tenantId = this.prisma.currentTenantId;
    const version = await this.cargar(versionId);

    if (version.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'VERSION_NOT_DRAFT',
        message: 'Esta versión ya está publicada o retirada: no hay nada que revisar.',
      });
    }
    if (version.reviewStatus === 'EN_REVISION') {
      throw new ConflictException({
        code: 'YA_EN_REVISION',
        message: 'Esta formación ya está esperando revisión.',
      });
    }
    /*
      APROBADA no llega aqui casi nunca: tocar una aprobada la devuelve sola a SIN_ENVIAR
      (`assertDraft`). Si llega, es que se pulso «enviar» sin haber cambiado nada, y volver a
      mandar lo que ya esta aprobado solo hace perder el tiempo a quien lo reviso.
    */
    if (version.reviewStatus === 'APROBADA') {
      throw new ConflictException({
        code: 'YA_APROBADA',
        message: 'Esta formación ya está aprobada y no ha cambiado desde entonces.',
      });
    }

    // Las mismas tres compuertas que publicar. Lanza con su codigo y su lista si algo falta.
    await this.versioning.comprobarQueEstaLista(versionId);

    const actualizada = await this.prisma.scoped.activityVersion.update({
      where: { id: version.id },
      data: { reviewStatus: 'EN_REVISION', submittedBy: actor.id, submittedAt: new Date() },
      select: { id: true, reviewStatus: true, submittedAt: true },
    });

    /*
      SE AVISA A QUIEN PUEDE DECIDIR, no «a los administradores». El permiso es lo que define quien
      revisa; el nombre del rol no (Decision #19): mañana un cliente llama al suyo «Coordinador
      HSE» y un `rol === 'ADMIN'` deja de funcionar sin que nadie se entere.
    */
    await this.notifications.notifyByPermission(tenantId, 'catalog:publish', {
      eventType: 'FORMACION_EN_REVISION',
      subject: `Formación lista para revisar: ${version.activity.name}`,
      body: `${actor.email ?? 'Un analista'} terminó la versión ${version.versionNumber} de «${version.activity.name}» y la envió a revisión.`,
      referenceType: 'activities',
      referenceId: version.activity.id,
      channels: ['IN_APP'],
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_SUBMITTED_FOR_REVIEW',
      resourceType: 'activity_versions',
      resourceId: version.id,
      newValues: { activityId: version.activity.id, versionNumber: version.versionNumber },
    });

    return actualizada;
  }

  /**
   * EL ADMINISTRADOR LA APRUEBA. No la publica: ver la nota de la cabecera.
   *
   * Exige `catalog:publish` en el controlador — quien decide si algo sale es quien puede sacarlo.
   */
  async aprobar(actor: AuthUser, versionId: string) {
    const tenantId = this.prisma.currentTenantId;
    const version = await this.cargar(versionId);

    if (version.reviewStatus !== 'EN_REVISION') {
      throw new ConflictException({
        code: 'NO_ESTA_EN_REVISION',
        message: 'Esta formación no está esperando revisión.',
      });
    }

    const actualizada = await this.prisma.scoped.activityVersion.update({
      where: { id: version.id },
      data: { reviewStatus: 'APROBADA', reviewedBy: actor.id, reviewedAt: new Date() },
      select: { id: true, reviewStatus: true, reviewedAt: true },
    });

    await this.avisarAQuienLaMando(tenantId, version, {
      subject: `Aprobada: ${version.activity.name}`,
      body: `Tu formación «${version.activity.name}» (versión ${version.versionNumber}) fue revisada y aprobada. La publicación la hace quien administra el catálogo.`,
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_REVIEW_APPROVED',
      resourceType: 'activity_versions',
      resourceId: version.id,
      newValues: { activityId: version.activity.id, versionNumber: version.versionNumber },
    });

    return actualizada;
  }

  /**
   * EL ADMINISTRADOR PIDE CAMBIOS, y el motivo es OBLIGATORIO.
   *
   * Devolver sin decir por que convierte la revision en un muro: quien la escribio vuelve a
   * mandarla igual, o adivina. El minimo de longitud es el mismo criterio que ya usa la
   * convalidacion de un papel ajeno: quince caracteres no son una frase util, pero si impiden el
   * «no» de un solo caracter.
   */
  async devolver(actor: AuthUser, versionId: string, motivo: string) {
    const tenantId = this.prisma.currentTenantId;
    const limpio = motivo.trim();
    if (limpio.length < 15) {
      throw new BadRequestException({
        code: 'MOTIVO_REQUERIDO',
        message: 'Escribe qué hay que corregir. Quien la hizo necesita saberlo para arreglarla.',
      });
    }

    const version = await this.cargar(versionId);
    if (version.reviewStatus !== 'EN_REVISION') {
      throw new ConflictException({
        code: 'NO_ESTA_EN_REVISION',
        message: 'Esta formación no está esperando revisión.',
      });
    }

    const actualizada = await this.prisma.scoped.activityVersion.update({
      where: { id: version.id },
      data: { reviewStatus: 'DEVUELTA', reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: limpio },
      select: { id: true, reviewStatus: true, reviewNote: true },
    });

    await this.avisarAQuienLaMando(tenantId, version, {
      subject: `Devuelta para corregir: ${version.activity.name}`,
      body: `Tu formación «${version.activity.name}» (versión ${version.versionNumber}) volvió a borrador. Motivo: ${limpio}`,
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_REVIEW_RETURNED',
      resourceType: 'activity_versions',
      resourceId: version.id,
      newValues: { activityId: version.activity.id, versionNumber: version.versionNumber, motivo: limpio },
    });

    return actualizada;
  }

  /**
   * El aviso va a QUIEN LA MANDO, no «al analista» en abstracto: puede haber varios, y el que la
   * escribio es el unico que sabe que corregir. Si no consta —una version enviada antes de que
   * esto existiera— no se avisa a nadie en vez de avisar a quien no toca.
   */
  private async avisarAQuienLaMando(
    tenantId: string,
    version: { submittedBy: string | null; activity: { id: string } },
    aviso: { subject: string; body: string },
  ): Promise<void> {
    if (!version.submittedBy) return;
    await this.notifications.notifyMany(tenantId, [
      {
        eventType: 'FORMACION_REVISADA',
        recipientUserId: version.submittedBy,
        subject: aviso.subject,
        body: aviso.body,
        referenceType: 'activities',
        referenceId: version.activity.id,
        channels: ['IN_APP'],
      },
    ]);
  }
}
