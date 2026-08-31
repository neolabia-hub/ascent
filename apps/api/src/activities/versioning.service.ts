import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  activityTypeConfigSchema,
  audienceRuleSchema,
  tenantSettingsSchema,
  type PublishVersionInput,
  type UpdateVersionSettingsInput,
} from '@neo-pulse/shared';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { OfferingsService } from '../offerings/offerings.service.js';
import { loQueExigeElTipo } from './type-requirements.js';

/**
 * MOTOR DE VERSIONADO (Decision #6 — la regla de oro 4 del modelo).
 *
 * Invariantes que este servicio garantiza:
 *  1. Una actividad tiene como maximo UNA version en borrador a la vez.
 *  2. Publicar CONGELA la version: pasa a PUBLISHED, copia por valor los ajustes academicos
 *     resueltos en cascada (tenant -> actividad) y clona en profundidad el contenido editable
 *     (lecciones) para que nadie pueda alterar despues lo que una persona ya curso.
 *  3. Editar lo publicado NO modifica nada: crea la version N+1 en borrador copiando la
 *     publicada, con copias EDITABLES de las lecciones.
 *  4. Los completados quedan intactos siempre; la politica de migracion solo decide que pasa
 *     con quienes van a mitad o no han empezado.
 *
 * Sin esto, la pregunta de auditoria "que examen presento esta persona en marzo" no tiene
 * respuesta, y cambiar la nota minima reprobaria retroactivamente a gente ya aprobada.
 */
@Injectable()
export class VersioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // Publicar una induccion general la EXIGE sola (Decision #69): el requisito lo crea quien
    // sabe hacerlo, no una copia de su logica aqui.
    private readonly assignments: AssignmentsService,
    // Publicar pone al dia las convocatorias permanentes (ver `ponerAlDiaLasPermanentes`).
    private readonly offerings: OfferingsService,
    // Publicar CONGELA una copia de cada evaluacion (Decision #87), igual que hace con las
    // lecciones. Lo hace quien sabe: aqui solo se pide la copia.
    private readonly assessments: AssessmentsService,
  ) {}

  /** Version en borrador de una actividad (si existe). */
  async findDraft(activityId: string) {
    return this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'DRAFT' },
      include: { contents: { orderBy: { displayOrder: 'asc' } } },
    });
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.scoped.activityVersion.findUnique({
      where: { id: versionId },
      include: {
        contents: {
          orderBy: { displayOrder: 'asc' },
          include: {
            lesson: { select: { id: true, title: true, estimatedMinutes: true, status: true, _count: { select: { cards: true } } } },
            contentPackage: { select: { id: true, kind: true, originalName: true, sizeBytes: true, storageKey: true } },
            assessment: {
              select: {
                id: true,
                title: true,
                status: true,
                passingScore: true,
                maxAttempts: true,
                sourceId: true,
                _count: { select: { sections: true } },
              },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException({ code: 'VERSION_NOT_FOUND' });
    return version;
  }

  /**
   * Crea la version 1 en borrador. Se llama al crear la actividad; los ajustes academicos
   * arrancan con el default del tenant y quedan editables hasta publicar.
   */
  async createInitialDraft(tx: Prisma.TransactionClient, tenantId: string, activityId: string) {
    const defaults = await this.tenantDefaults(tx, tenantId);
    return tx.activityVersion.create({
      data: {
        tenantId,
        activityId,
        versionNumber: 1,
        status: 'DRAFT',
        passingScore: defaults.passingScore,
        maxAttempts: defaults.maxAttempts,
        retryWaitHours: defaults.retryWaitHours,
      },
    });
  }

  /** Ajustes academicos del borrador (solo mientras esta en borrador). */
  async updateDraftSettings(actor: AuthUser, versionId: string, input: UpdateVersionSettingsInput) {
    const version = await this.assertDraft(versionId);
    const updated = await this.prisma.scoped.activityVersion.update({
      where: { id: version.id },
      data: {
        passingScore: input.passingScore,
        maxAttempts: input.maxAttempts,
        retryWaitHours: input.retryWaitHours,
        estimatedMinutes: input.estimatedMinutes,
      },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'VERSION_SETTINGS_UPDATED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      oldValues: { passingScore: version.passingScore, maxAttempts: version.maxAttempts },
      newValues: input,
    });
    return updated;
  }

  /**
   * PUBLICA el borrador. Operacion irreversible y transaccional:
   *  - clona las lecciones referenciadas (copias PUBLISHED e inmutables),
   *  - publica las versiones de evaluacion en borrador que use,
   *  - congela el temario (para constancias) y los ajustes academicos,
   *  - retira la version publicada anterior y apunta la actividad a la nueva.
   */
  async publish(actor: AuthUser, versionId: string, input: PublishVersionInput) {
    const tenantId = this.prisma.currentTenantId;
    const draft = await this.assertDraft(versionId);

    const contents = await this.prisma.scoped.activityContent.findMany({
      where: { activityVersionId: draft.id },
      orderBy: { displayOrder: 'asc' },
    });
    if (contents.length === 0) {
      throw new BadRequestException({ code: 'VERSION_EMPTY', message: 'La version necesita al menos un contenido.' });
    }
    const incomplete = contents.filter((c) => !this.isContentComplete(c));
    if (incomplete.length > 0) {
      throw new BadRequestException({
        code: 'CONTENT_INCOMPLETE',
        message: 'Hay contenidos sin material asignado.',
        items: incomplete.map((c) => ({ id: c.id, title: c.title, type: c.type })),
      });
    }

    /**
     * LO QUE EL TIPO EXIGE: se DICE y queda registrado, pero no se bloquea (Decision #74).
     *
     * `activity_types.config` trae `requiresAssessment` y `requiresSurvey` desde el Sprint 1 y no
     * los leia NADIE: una "Capacitacion del plan" —que los tiene los dos en true— se publicaba con
     * un video y nada mas, y ninguna pantalla decia una palabra. Es la misma familia que
     * `participatesInPlan` y `defaultAssignmentMode`: config que la interfaz promete y el motor
     * ignora. El precio se paga tarde: sin examen no hay nota que ensenarle a un auditor.
     *
     * Y AUN ASI NO SE BLOQUEA, por dos razones concretas y no por prudencia:
     *
     *   1. **El tenant todavia no puede cambiar ese config desde la interfaz** (esta pendiente).
     *      Bloquear una regla que nadie puede ajustar deja encerrado a quien no la comparta, sin
     *      salida y sin nadie a quien pedirsela.
     *   2. **Ni una sola de las 19 pruebas de punta a punta anade evaluacion**, y ocho publican
     *      tipos que la piden. Eso no es un descuido de las pruebas: es la senal de que la regla
     *      no esta acordada con el cliente todavia. Convertirla en muro seria imponerla.
     *
     * Lo que SI estaba roto es el silencio, y eso se cierra: la pantalla lo dice antes de pulsar y
     * aqui queda en la AUDITORIA. El dia que alguien pregunte por que esa capacitacion del plan no
     * tiene examen, la respuesta existe con fecha y con nombre.
     *
     * Se convierte en compuerta el dia que el config del tipo se edite desde la interfaz.
     */
    const conTipo = await this.prisma.scoped.activityVersion.findUniqueOrThrow({
      where: { id: draft.id },
      select: { activity: { select: { activityType: { select: { config: true } } } } },
    });
    const avisosDelTipo = loQueExigeElTipo(conTipo.activity.activityType.config, contents);

    const published = await this.prisma.tx(async (tx) => {
      // 1. Congelar el contenido editable: la version publicada apunta a copias inmutables.
      for (const content of contents) {
        if (content.type === 'LESSON' && content.lessonId) {
          const frozenLessonId = await this.cloneLesson(tx, tenantId, content.lessonId, 'PUBLISHED');
          await tx.activityContent.update({ where: { id: content.id }, data: { lessonId: frozenLessonId } });
        }
        /*
          LA EVALUACION SE CONGELA EN UNA COPIA (Decision #87), igual que la leccion de arriba.

          Antes esto PROMOVIA la version borrador de la evaluacion a publicada. Eso ataba dos
          escaleras de versiones que nadie mantenia sincronizadas: publicar despues una version
          nueva de la evaluacion retiraba esta, el contenido seguia apuntandole, y el examen
          dejaba de poder abrirse para todo el mundo.
        */
        if (content.type === 'ASSESSMENT' && content.assessmentId) {
          const congelada = await this.assessments.clonarParaPublicar(tx, tenantId, content.assessmentId);
          await tx.activityContent.update({ where: { id: content.id }, data: { assessmentId: congelada } });
        }
      }

      // 2. Temario por VALOR para las constancias (renombrar la actividad no altera el historico).
      //
      // Y con el, LO QUE LA CONSTANCIA IMPRIME de la ficha: el nombre, el proceso y la NORMA que
      // aplicaba el dia que se publico. La ficha no esta versionada —cambiar un nombre no puede
      // costar una version— pero eso deja un hueco que solo se ve tarde: alguien se capacita en
      // enero, en marzo cambia la norma aplicable, y la constancia de enero saldria citando una
      // norma que ese dia no aplicaba. Es el mismo patron con el que ya se congela quien responde
      // (Decision #64): no se versiona la ficha, se copia por valor lo que la evidencia necesita.
      const ficha = await tx.activity.findUniqueOrThrow({
        where: { id: draft.activityId },
        select: {
          name: true,
          process: { select: { code: true, name: true } },
          norms: { select: { norm: { select: { code: true, name: true } } } },
        },
      });
      const frozenContents = await tx.activityContent.findMany({
        where: { activityVersionId: draft.id },
        orderBy: { displayOrder: 'asc' },
        include: { lesson: { select: { title: true, estimatedMinutes: true } } },
      });
      const syllabus = {
        publishedAt: new Date().toISOString(),
        activityName: ficha.name,
        process: ficha.process,
        norms: ficha.norms.map((row) => row.norm),
        items: frozenContents.map((c) => ({
          order: c.displayOrder,
          type: c.type,
          title: c.title,
          isRequired: c.isRequired,
          estimatedMinutes: c.lesson?.estimatedMinutes ?? null,
        })),
      };

      // 3. Publicar y retirar la anterior.
      const previous = await tx.activityVersion.findFirst({
        where: { activityId: draft.activityId, status: 'PUBLISHED' },
      });
      if (previous) {
        await tx.activityVersion.update({ where: { id: previous.id }, data: { status: 'RETIRED' } });
      }
      // 4. QUIEN RESPONDE, congelado igual que el temario (Decision #64). La actividad sigue
      //    teniendo su responsable vigente —es a quien hay que avisar hoy—, pero la version
      //    publicada guarda el de ESTE momento: la constancia y el auditor preguntan por el de
      //    entonces, y cambiar el responsable manana no puede reescribir lo que ya se dicto.
      const owner = await tx.activity.findUnique({
        where: { id: draft.activityId },
        select: { responsibleUserId: true },
      });
      const result = await tx.activityVersion.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: actor.id,
          migrationPolicy: input.migrationPolicy,
          syllabusSnapshot: syllabus,
          responsibleUserId: owner?.responsibleUserId ?? null,
        },
      });
      await tx.activity.update({ where: { id: draft.activityId }, data: { currentVersionId: result.id } });
      return { result, previousId: previous?.id ?? null };
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_PUBLISHED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      newValues: {
        versionNumber: draft.versionNumber,
        migrationPolicy: input.migrationPolicy,
        retiredVersionId: published.previousId,
        responsibleUserId: published.result.responsibleUserId,
        // Lo que su tipo pedia y esta version no trae. Vacio casi siempre; cuando no lo esta, es
        // la unica traza de que se publico sabiendolo (Decision #74).
        ...(avisosDelTipo.length > 0 ? { publicadaSinLoQuePideElTipo: avisosDelTipo } : {}),
      },
    });

    // SE EXIGE SOLA, y se decide AQUI y no en la pantalla (Decision #69).
    //
    // El primer intento lo hacia el navegador al abrir la pestana Quienes, y eso dejaba el mismo
    // agujero que queria tapar: si alguien publica y se va, no pasa nada. Una induccion general
    // que no se le exige a nadie no la nota NADIE hasta la auditoria, y depender de que alguien
    // visite una pantalla es depender de que se acuerde.
    //
    // Publicar es el momento correcto: antes, el contenido no existe y obligar a 116 personas a
    // algo que nadie puede hacer es peor que no obligarlas.
    await this.aplicarExigenciaAutomatica(actor, draft.activityId);

    // Y las convocatorias PERMANENTES pasan a esta version: no hay nadie citado a quien mover
    // por sorpresa, y dejarlas ancladas hace que quien entre manana curse lo viejo. Las de FECHA
    // no se tocan: ahi si hay gente citada y actualizarlas es un acto aparte.
    await this.offerings.ponerAlDiaLasPermanentes(actor, draft.activityId, versionId);

    // Y si el tipo dice que se hace "disponible siempre", se ABRE sola: sin convocatoria nadie
    // puede empezarla, y en una permanente no hay fecha, lugar, instructor ni cupo que decidir.
    // Era el ultimo paso del ciclo que seguia dependiendo de que alguien se acordara.
    await this.abrirlaSiElTipoLoDice(actor, draft.activityId, versionId);

    return published.result;
  }

  /**
   * Cuando el TIPO dice que la audiencia es toda la empresa —induccion general, reinduccion— no
   * hay ninguna decision que tomar, asi que el requisito se crea solo. Con el plazo que dice el
   * propio tipo: si exige estar hecha antes de empezar a trabajar, ancla en el ingreso; si no,
   * cuenta desde ahora.
   *

  /**
   * Abre la formacion si su tipo se hace "disponible siempre". Mira el config aqui y no arriba
   * para no arrastrar variables de la transaccion de publicar: esto pasa DESPUES y no puede
   * tumbarla.
   */
  private async abrirlaSiElTipoLoDice(actor: AuthUser, activityId: string, versionId: string): Promise<void> {
    const activity = await this.prisma.scoped.activity.findUnique({
      where: { id: activityId },
      select: { modality: true, activityType: { select: { config: true } } },
    });
    if (!activity) return;
    const config = activityTypeConfigSchema.partial().safeParse(activity.activityType.config ?? {});
    if (!config.success || config.data.defaultOfferingKind !== 'PERMANENT') return;
    await this.offerings.abrirlaSiEsDisponible(actor, activityId, versionId, activity.modality);
  }

  /**
   * Cuando el TIPO dice que la audiencia es toda la empresa —induccion general, reinduccion— no
   * hay ninguna decision que tomar, asi que el requisito se crea solo. Con el plazo que dice el
   * propio tipo: si exige estar hecha antes de empezar a trabajar, ancla en el ingreso; si no,
   * cuenta desde ahora.
   *
   * Es seguro por la GRACIA de `due-date.ts` (Decision #70): a quien lleva anos en la empresa la
   * obligacion no le nace vencida, le nace con 30 dias. Sin eso, esto habria estrenado cada
   * induccion con la plantilla entera en rojo.
   *
   * No pisa nada: si ya hay un requisito activo para esa formacion, no toca nada. Y si falla, no
   * tumba la publicacion —el contenido ya esta congelado, que es lo importante— pero deja rastro
   * en la auditoria, que es donde se buscan las cosas raras.
   */
  private async aplicarExigenciaAutomatica(actor: AuthUser, activityId: string): Promise<void> {
    try {
      const activity = await this.prisma.scoped.activity.findUnique({
        where: { id: activityId },
        select: { activityType: { select: { config: true } } },
      });
      const config = activityTypeConfigSchema.partial().safeParse(activity?.activityType.config ?? {});
      if (!config.success || config.data.defaultAssignmentMode !== 'ON_HIRE') return;

      const yaExige = await this.prisma.scoped.assignmentRule.findFirst({
        where: { targetType: 'ACTIVITY', targetId: activityId, active: true },
        select: { id: true },
      });
      if (yaExige) return;

      // A QUIEN ALCANZA, y por que NO se pregunta.
      //
      // Una INDUCCION es parte del ingreso: quien lleva siete anos en la empresa no esta
      // ingresando, asi que no se le exige —y si se le exigiera, se le pediria repetir algo que
      // ya hizo el dia que entro—. Una REINDUCCION es al reves: es la obligacion anual de todos,
      // y dejar fuera a la plantilla actual la vaciaria de sentido.
      //
      // Las dos respuestas las da el propio tipo. Preguntarlo al publicar era pedirle al usuario
      // que decidiera algo que el sistema ya sabe, y cada pregunta que sobra es una en la que se
      // puede acertar mal.
      const esInduccionDeIngreso = config.data.requiresBeforeHire === true;

      await this.assignments.setActivityRequirement(actor, {
        activityId,
        scope: audienceRuleSchema.parse({}),
        trigger: esInduccionDeIngreso ? 'ON_HIRE' : 'ON_JOIN',
        // -1 y no 0: D1072 art. 2.2.4.6.11 exige que la induccion sea PREVIA al inicio de
        // labores. "El mismo dia" no es previa.
        dueDaysAfterTrigger: esInduccionDeIngreso ? -1 : 30,
        // La campana anual manda: es una obligacion de calendario, no un aniversario por persona.
        everyMonths: config.data.defaultAnnualDate ? null : (config.data.defaultRecurrenceMonths ?? null),
        fixedDate: config.data.defaultAnnualDate ?? null,
        soloNuevos: esInduccionDeIngreso,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.audit
        .record({
          tenantId: this.prisma.currentTenantId,
          userId: actor.id,
          action: 'AUTO_REQUIREMENT_FAILED',
          resourceType: 'activities',
          resourceId: activityId,
          newValues: { reason },
        })
        .catch(() => undefined);
    }
  }

  /**
   * Crea la version N+1 en BORRADOR a partir de la publicada (copy-on-edit). La publicada NO
   * se toca: sigue siendo lo que vieron quienes ya la cursaron.
   */
  async createNextDraft(actor: AuthUser, activityId: string) {
    const tenantId = this.prisma.currentTenantId;

    const existingDraft = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'DRAFT' },
      select: { id: true, versionNumber: true },
    });
    if (existingDraft) {
      throw new ConflictException({
        code: 'DRAFT_ALREADY_EXISTS',
        message: 'Ya hay una version en borrador. Editala o descartala antes de crear otra.',
        versionId: existingDraft.id,
        versionNumber: existingDraft.versionNumber,
      });
    }

    const source = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId, status: 'PUBLISHED' },
      include: {
        contents: {
          orderBy: { displayOrder: 'asc' },
          // `sourceId` dice si la evaluacion del contenido es la COPIA congelada: la version nueva
          // tiene que volver a apuntar a la EDITABLE para poder tocarse (Decision #87).
          include: { assessment: { select: { sourceId: true } } },
        },
      },
    });
    if (!source) throw new NotFoundException({ code: 'NO_PUBLISHED_VERSION' });

    const last = await this.prisma.scoped.activityVersion.findFirst({
      where: { activityId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const draft = await this.prisma.tx(async (tx) => {
      const created = await tx.activityVersion.create({
        data: {
          tenantId,
          activityId,
          versionNumber: (last?.versionNumber ?? source.versionNumber) + 1,
          status: 'DRAFT',
          passingScore: source.passingScore,
          maxAttempts: source.maxAttempts,
          retryWaitHours: source.retryWaitHours,
          estimatedMinutes: source.estimatedMinutes,
          migrationPolicy: source.migrationPolicy,
        },
      });

      for (const content of source.contents) {
        // Las lecciones de la version publicada son inmutables: se clonan como EDITABLES.
        const lessonId =
          content.type === 'LESSON' && content.lessonId
            ? await this.cloneLesson(tx, tenantId, content.lessonId, 'DRAFT')
            : content.lessonId;

        await tx.activityContent.create({
          data: {
            tenantId,
            activityVersionId: created.id,
            type: content.type,
            title: content.title,
            description: content.description,
            displayOrder: content.displayOrder,
            isRequired: content.isRequired,
            config: content.config as Prisma.InputJsonValue,
            lessonId,
            contentPackageId: content.contentPackageId, // los paquetes ya son inmutables
            // La evaluacion vuelve a ser la EDITABLE: una version en borrador tiene que poder
            // tocarse, y la copia congelada de la publicada no se toca (`sourceId` la delata).
            assessmentId: content.assessment?.sourceId ?? content.assessmentId,
            surveyTemplateId: content.surveyTemplateId,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'VERSION_DRAFT_CREATED',
      resourceType: 'activity_versions',
      resourceId: draft.id,
      newValues: { fromVersionId: source.id, versionNumber: draft.versionNumber },
    });
    return draft;
  }

  /** Descarta un borrador (nunca una version publicada). */
  async discardDraft(actor: AuthUser, versionId: string) {
    const draft = await this.assertDraft(versionId);
    const count = await this.prisma.scoped.activityVersion.count({ where: { activityId: draft.activityId } });
    if (count === 1) {
      throw new ConflictException({
        code: 'LAST_VERSION',
        message: 'No se puede descartar la unica version. Elimina o desactiva la actividad.',
      });
    }
    await this.prisma.tx(async (tx) => {
      await tx.activityContent.deleteMany({ where: { activityVersionId: draft.id } });
      await tx.activityVersion.delete({ where: { id: draft.id } });
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'VERSION_DRAFT_DISCARDED',
      resourceType: 'activity_versions',
      resourceId: versionId,
      oldValues: { versionNumber: draft.versionNumber },
    });
    return { ok: true as const };
  }

  /** Lanza si la version no existe o no esta en borrador (protege la inmutabilidad). */
  async assertDraft(versionId: string) {
    const version = await this.prisma.scoped.activityVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ code: 'VERSION_NOT_FOUND' });
    if (version.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'VERSION_NOT_EDITABLE',
        message: 'Esta version esta publicada y no se puede modificar. Crea una version nueva.',
        status: version.status,
      });
    }
    return version;
  }

  /** Copia profunda de una leccion (con sus tarjetas) en el estado pedido. */
  private async cloneLesson(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lessonId: string,
    status: 'DRAFT' | 'PUBLISHED',
  ): Promise<string> {
    const source = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { cards: { orderBy: { displayOrder: 'asc' } } },
    });
    const clone = await tx.lesson.create({
      data: {
        tenantId,
        title: source.title,
        estimatedMinutes: source.estimatedMinutes,
        status,
        createdBy: source.createdBy,
      },
    });
    if (source.cards.length > 0) {
      await tx.lessonCard.createMany({
        data: source.cards.map((card) => ({
          tenantId,
          lessonId: clone.id,
          cardType: card.cardType,
          displayOrder: card.displayOrder,
          payload: card.payload as Prisma.InputJsonValue,
          mediaKey: card.mediaKey,
        })),
      });
    }
    return clone.id;
  }

  /** Un contenido esta completo cuando tiene asignado el material que su tipo exige. */
  private isContentComplete(content: {
    type: string;
    lessonId: string | null;
    contentPackageId: string | null;
    assessmentId: string | null;
    surveyTemplateId: string | null;
    config: Prisma.JsonValue;
  }): boolean {
    const config = (content.config ?? {}) as { externalUrl?: string; href?: string };
    switch (content.type) {
      case 'LESSON':
        return Boolean(content.lessonId);
      case 'VIDEO':
        return Boolean(content.contentPackageId) || Boolean(config.externalUrl);
      case 'PRESENTATION':
      case 'DOCUMENT':
      case 'SCORM':
        return Boolean(content.contentPackageId);
      case 'ASSESSMENT':
        return Boolean(content.assessmentId);
      case 'SURVEY':
        return Boolean(content.surveyTemplateId);
      case 'LINK':
        return Boolean(config.href);
      default:
        return false;
    }
  }

  /** Defaults academicos del tenant (cascada nivel 1). */
  private async tenantDefaults(tx: Prisma.TransactionClient, tenantId: string) {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const settings = tenantSettingsSchema.parse(tenant.settings ?? {});
    return {
      passingScore: settings.passingScoreDefault,
      maxAttempts: settings.maxAttemptsDefault,
      retryWaitHours: settings.retryWaitHours,
    };
  }
}
