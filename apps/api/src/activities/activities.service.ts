import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateActivityInput,
  CreateContentInput,
  ListActivitiesQuery,
  UpdateActivityInput,
  UpdateContentInput,
} from '@neo-pulse/shared';
import {
  assertScopeAllows,
  assertTipoPermitido,
  processScopeWhere,
  scopeAllows,
  tipoScopeWhere,
} from '../common/analyst-scope.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertResponsibleChangeAllowed } from './responsible-rules.js';
import { VersioningService } from './versioning.service.js';

const ACTIVITY_LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  modality: true,
  active: true,
  updatedAt: true,
  // El `config` viaja tambien en el listado: el formulario de convocatoria necesita saber, ANTES
  // de pintarse, si la formacion elegida se dicta en jornada o queda disponible.
  activityType: { select: { id: true, code: true, name: true, colorHex: true, config: true } },
  process: { select: { id: true, code: true, name: true } },
  currentVersionId: true,
  versions: {
    // `reviewStatus`: la pastilla «En revision» se ve ya en el listado, que es donde el
    // administrador mira primero cuando le avisan de que hay algo esperando (2026-09-22).
    select: { id: true, versionNumber: true, status: true, publishedAt: true, reviewStatus: true },
    orderBy: { versionNumber: 'desc' as const },
  },
} satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly versioning: VersioningService,
  ) {}

  async list(actor: AuthUser, query: ListActivitiesQuery) {
    const where: Prisma.ActivityWhereInput = {
      deletedAt: null,
      ...(query.active ? { active: query.active === 'true' } : {}),
      // El analista ve SU proceso; el admin (sin alcance) ve todo. Ver common/analyst-scope.ts.
      ...processScopeWhere(actor.scopeProcessIds, query.processId),
      /*
        Y SOLO LOS TIPOS QUE LE TOCAN (2026-09-22). El filtro que pide la pantalla se cruza con el
        alcance en vez de sustituirlo: si alguien pide un tipo que no es suyo, la respuesta correcta
        es una lista vacia —no lo suyo, que seria mentirle, ni un 403, que le confirma que ese tipo
        existe—. Mismo criterio que `processScopeWhere`.
      */
      ...tipoScopeWhere(actor.scopeActivityTypeIds, query.activityTypeId),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { code: { contains: query.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.scoped.activity.count({ where }),
      this.prisma.scoped.activity.findMany({
        where,
        select: ACTIVITY_LIST_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async getById(actor: AuthUser, id: string) {
    const activity = await this.prisma.scoped.activity.findFirst({
      where: { id, deletedAt: null },
      include: {
        activityType: { select: { id: true, code: true, name: true, colorHex: true, config: true } },
        process: { select: { id: true, code: true, name: true } },
        norms: { select: { norm: { select: { id: true, code: true, name: true } } } },
        services: { select: { service: { select: { id: true, code: true, name: true } } } },
        regionals: { select: { regional: { select: { id: true, code: true, name: true } } } },
        jobTitles: { select: { jobTitle: { select: { id: true, code: true, name: true } } } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            // El traspaso entero (2026-09-22): en que punto esta, quien la mando, quien decidio y
            // por que. La ficha tiene que poder decirlo sin una segunda peticion.
            reviewStatus: true,
            submittedBy: true,
            submittedAt: true,
            reviewedBy: true,
            reviewedAt: true,
            reviewNote: true,
            passingScore: true,
            maxAttempts: true,
            estimatedMinutes: true,
            _count: { select: { contents: true } },
          },
        },
      },
    });
    // 404 y no 403: sobre un id concreto, un 403 confirma que esa capacitacion existe.
    if (!activity || !scopeAllows(actor.scopeProcessIds, activity.processId)) {
      throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    }
    return {
      ...activity,
      norms: activity.norms.map((n) => n.norm),
      services: activity.services.map((s) => s.service),
      regionals: activity.regionals.map((r) => r.regional),
      jobTitles: activity.jobTitles.map((j) => j.jobTitle),
    };
  }

  /** Crea la actividad y su version 1 en borrador, en una sola transaccion. */
  async create(actor: AuthUser, input: CreateActivityInput) {
    assertScopeAllows(actor.scopeProcessIds, input.processId);
    assertTipoPermitido(actor.scopeActivityTypeIds, input.activityTypeId);
    const tenantId = this.prisma.currentTenantId;

    // Si no se dice quien responde, responde el del PROCESO. Es un paso menos al crear y ademas
    // la respuesta correcta casi siempre: quien lleva SARLAFT responde por sus capacitaciones.
    // Se guarda el valor, no la referencia: cambiar el responsable del proceso mañana no debe
    // reescribir en silencio quien respondia por lo que ya existe.
    let responsibleUserId = input.responsibleUserId ?? null;
    if (!responsibleUserId) {
      const process = await this.prisma.scoped.process.findUnique({
        where: { id: input.processId },
        select: { responsibleUserId: true },
      });
      responsibleUserId = process?.responsibleUserId ?? null;
    }

    const activity = await this.prisma
      .tx(async (tx) => {
        const created = await tx.activity.create({
          data: {
            tenantId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            activityTypeId: input.activityTypeId,
            processId: input.processId,
            responsibleUserId,
            modality: input.modality,
            tags: input.tags,
            // `undefined` = no vino, y entonces la columna queda NULL = "lo que diga su tipo", que
            // es el caso normal. El esquema lo aceptaba y este `data` lo ignoraba en silencio:
            // crear una formacion diciendo que la acredita un tercero no guardaba nada.
            tracksExternalCertificate: input.tracksExternalCertificate,
            admiteConvalidacion: input.admiteConvalidacion,
            // LAS HORAS QUE ACREDITA (2026-09-17). Mismo caso que el de arriba, y peor: la columna
            // existia, la version la copiaba al publicar y la constancia la imprimia — pero nadie la
            // escribia nunca, asi que TODA constancia salia sin horas. Ver `createActivitySchema`.
            certificateHours: input.certificateHours ?? null,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        });
        await this.replaceScope(tx, tenantId, created.id, input);
        await this.versioning.createInitialDraft(tx, tenantId, created.id);
        return created;
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'DUPLICATE_CODE' });
        }
        throw error;
      });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ACTIVITY_CREATED',
      resourceType: 'activities',
      resourceId: activity.id,
      newValues: { code: input.code, name: input.name },
    });
    return this.getById(actor, activity.id);
  }

  /** Datos de cabecera de la actividad (nombre, alcance). No toca versiones ni contenido. */
  async update(actor: AuthUser, id: string, input: UpdateActivityInput) {
    const tenantId = this.prisma.currentTenantId;
    const before = await this.prisma.scoped.activity.findFirst({ where: { id, deletedAt: null } });
    if (!before || !scopeAllows(actor.scopeProcessIds, before.processId)) {
      throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    }
    if (input.processId) assertScopeAllows(actor.scopeProcessIds, input.processId);

    // EL RESPONSABLE SE COMPORTA COMO EL CONTENIDO (Decision #64): se decide en borrador y se
    // congela al publicar. Con una version publicada y ningun borrador abierto, cambiarlo
    // reescribiria quien respondia por algo que ya se dicto y ya se certifico.
    const openDraft = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId: id, status: 'DRAFT' },
      select: { id: true },
    });
    assertResponsibleChangeAllowed({
      current: before.responsibleUserId,
      requested: input.responsibleUserId,
      hasOpenDraft: openDraft !== null,
    });

    await this.prisma.tx(async (tx) => {
      await tx.activity.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          activityTypeId: input.activityTypeId,
          processId: input.processId,
          responsibleUserId: input.responsibleUserId,
          modality: input.modality,
          tags: input.tags,
          active: input.active,
          /*
            ¿LA ACREDITA UN TERCERO? (Decision #157, ampliada el 2026-09-06)

            `undefined` = no viene en el PATCH y Prisma no toca la columna; `null` = "lo que diga su
            tipo", que es un valor con significado y hay que poder volver a el. Por eso viaja
            `nullable` en el zod y no se colapsa a booleano.

            NO se congela en la version, al reves que `issuesCertificate`: aquello queda estampado en
            un papel que hay que poder explicar dentro de dos años, y esto solo decide que campos
            pide la lista de asistencia el dia de la jornada.
          */
          tracksExternalCertificate: input.tracksExternalCertificate,
          admiteConvalidacion: input.admiteConvalidacion,
          /*
            LAS HORAS SÍ SE CONGELAN, pero al PUBLICAR, no aquí. Aquí se guarda el valor vigente de
            la ficha; `versioning.service.ts` lo copia a la versión el día que se publica, y desde
            ahí la constancia lo repite intacto. Cambiarlo hoy no reescribe ningún papel ya emitido,
            que es lo correcto: una constancia acredita lo que la formación era ese día.
          */
          certificateHours: input.certificateHours,
          // La PORTADA no se congela con la version (Decision #88): una foto no es evidencia, asi
          // que cambiarla no puede costar publicar la formacion de nuevo.
          coverKey: input.coverKey,
          updatedBy: actor.id,
        },
      });
      await this.replaceScope(tx, tenantId, id, input);
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ACTIVITY_UPDATED',
      resourceType: 'activities',
      resourceId: id,
      oldValues: { name: before.name, modality: before.modality, active: before.active },
      newValues: input,
    });
    return this.getById(actor, id);
  }

  /** Baja logica: el historico formativo debe sobrevivir (retencion 20 años, Decision #16). */
  async softDelete(actor: AuthUser, id: string) {
    const activity = await this.prisma.scoped.activity.findFirst({ where: { id, deletedAt: null } });
    if (!activity || !scopeAllows(actor.scopeProcessIds, activity.processId)) {
      throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    }

    const offerings = await this.prisma.scoped.offering.count({
      where: { activityVersion: { activityId: id } },
    });
    if (offerings > 0) {
      throw new ConflictException({
        code: 'ACTIVITY_IN_USE',
        message: 'La actividad tiene convocatorias. Desactivala en lugar de eliminarla.',
      });
    }

    await this.prisma.scoped.activity.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, updatedBy: actor.id },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ACTIVITY_DELETED',
      resourceType: 'activities',
      resourceId: id,
      oldValues: { code: activity.code, name: activity.name },
    });
    return { ok: true as const };
  }

  // ─────────────────────── Contenidos de la version en borrador ───────────────────────

  async addContent(actor: AuthUser, versionId: string, input: CreateContentInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.versioning.assertDraft(versionId);

    /*
      LA ENCUESTA SE QUEDA LA ULTIMA (2026-09-03).

      La encuesta de satisfaccion se anade sola al crear la version, ANTES de que exista ningun
      contenido, y se le ponia `displayOrder: 999` con la intencion de dejarla al final. Pero el
      contenido nuevo se numeraba con "el mayor + 1", y el mayor era justamente ese 999: la
      leccion quedaba en 1000 y el examen en 1001, **por detras de la encuesta**. Resultado: la
      formacion empezaba preguntando que te parecio algo que todavia no habias visto.

      Se detecto con el recorrido de punta a punta (`scripts/recorridos/`): la version publicada
      llegaba al aprendiz como SURVEY, LESSON, ASSESSMENT.

      El arreglo es que el numero nuevo salga del ultimo contenido QUE NO SEA ENCUESTA, y que la
      encuesta se empuje detras. Asi se sostiene sola por muchos contenidos que se anadan.
    */
    const last = await this.prisma.scoped.activityContent.findFirst({
      where: { activityVersionId: versionId, type: { not: 'SURVEY' } },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    const orden = (last?.displayOrder ?? -1) + 1;

    if (input.type !== 'SURVEY') {
      await this.prisma.scoped.activityContent.updateMany({
        where: { activityVersionId: versionId, type: 'SURVEY' },
        data: { displayOrder: orden + 1 },
      });
    }

    const content = await this.prisma.scoped.activityContent.create({
      data: {
        tenantId,
        activityVersionId: versionId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        displayOrder: orden,
        isRequired: input.isRequired,
        config: input.config as Prisma.InputJsonValue,
        lessonId: input.lessonId ?? null,
        contentPackageId: input.contentPackageId ?? null,
        assessmentId: input.assessmentId ?? null,
        surveyTemplateId: input.surveyTemplateId ?? null,
      },
    });
    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'CONTENT_ADDED',
      resourceType: 'activity_contents',
      resourceId: content.id,
      newValues: { versionId, type: input.type, title: input.title },
    });
    return content;
  }

  async updateContent(actor: AuthUser, contentId: string, input: UpdateContentInput) {
    const content = await this.prisma.scoped.activityContent.findUnique({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
    await this.versioning.assertDraft(content.activityVersionId);

    const updated = await this.prisma.scoped.activityContent.update({
      where: { id: contentId },
      data: {
        title: input.title,
        description: input.description,
        isRequired: input.isRequired,
        config: input.config as Prisma.InputJsonValue | undefined,
        lessonId: input.lessonId,
        contentPackageId: input.contentPackageId,
        assessmentId: input.assessmentId,
        surveyTemplateId: input.surveyTemplateId,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENT_UPDATED',
      resourceType: 'activity_contents',
      resourceId: contentId,
      oldValues: { title: content.title },
      newValues: input,
    });
    return updated;
  }

  async removeContent(actor: AuthUser, contentId: string) {
    const content = await this.prisma.scoped.activityContent.findUnique({ where: { id: contentId } });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });
    await this.versioning.assertDraft(content.activityVersionId);

    await this.prisma.tx(async (tx) => {
      await tx.activityContent.delete({ where: { id: contentId } });
      // Renumerar para que el orden no quede con huecos.
      const rest = await tx.activityContent.findMany({
        where: { activityVersionId: content.activityVersionId },
        orderBy: { displayOrder: 'asc' },
        select: { id: true },
      });
      for (const [index, item] of rest.entries()) {
        await tx.activityContent.update({ where: { id: item.id }, data: { displayOrder: index } });
      }
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENT_REMOVED',
      resourceType: 'activity_contents',
      resourceId: contentId,
      oldValues: { title: content.title, type: content.type },
    });
    return { ok: true as const };
  }

  async reorderContents(actor: AuthUser, versionId: string, orderedIds: string[]) {
    await this.versioning.assertDraft(versionId);
    const current = await this.prisma.scoped.activityContent.findMany({
      where: { activityVersionId: versionId },
      select: { id: true },
    });
    const currentIds = new Set(current.map((c) => c.id));
    const sameSize = currentIds.size === orderedIds.length;
    const allBelong = orderedIds.every((id) => currentIds.has(id));
    if (!sameSize || !allBelong) {
      throw new ConflictException({
        code: 'REORDER_MISMATCH',
        message: 'La lista debe contener exactamente los contenidos de esta versión.',
      });
    }

    await this.prisma.tx(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx.activityContent.update({ where: { id }, data: { displayOrder: index } });
      }
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'CONTENTS_REORDERED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      newValues: { orderedIds },
    });
    return { ok: true as const };
  }

  /** Reemplaza las relaciones N:M de alcance solo cuando el input las trae. */
  private async replaceScope(
    tx: Prisma.TransactionClient,
    tenantId: string,
    activityId: string,
    input: Partial<Pick<CreateActivityInput, 'normIds' | 'serviceIds' | 'regionalIds' | 'jobTitleIds'>>,
  ): Promise<void> {
    if (input.normIds) {
      await tx.activityNorm.deleteMany({ where: { activityId } });
      if (input.normIds.length > 0) {
        await tx.activityNorm.createMany({ data: input.normIds.map((normId) => ({ tenantId, activityId, normId })) });
      }
    }
    if (input.serviceIds) {
      await tx.activityService.deleteMany({ where: { activityId } });
      if (input.serviceIds.length > 0) {
        await tx.activityService.createMany({
          data: input.serviceIds.map((serviceId) => ({ tenantId, activityId, serviceId })),
        });
      }
    }
    if (input.regionalIds) {
      await tx.activityRegional.deleteMany({ where: { activityId } });
      if (input.regionalIds.length > 0) {
        await tx.activityRegional.createMany({
          data: input.regionalIds.map((regionalId) => ({ tenantId, activityId, regionalId })),
        });
      }
    }
    if (input.jobTitleIds) {
      await tx.activityJobTitle.deleteMany({ where: { activityId } });
      if (input.jobTitleIds.length > 0) {
        await tx.activityJobTitle.createMany({
          data: input.jobTitleIds.map((jobTitleId) => ({ tenantId, activityId, jobTitleId })),
        });
      }
    }
  }
}
