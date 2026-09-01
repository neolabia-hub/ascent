import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { tenantSettingsSchema, type ProgressInput } from '@neo-pulse/shared';
import { EngagementService } from '../engagement/engagement.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CompletionService } from './completion.service.js';
import { meetsCompletion, mergeProgressData, readLastCard, resolveMinWatchPct } from './progress-rules.js';

/**
 * EL REPRODUCTOR: lo que ve y hace la persona mientras cursa.
 *
 * Dos reglas que no se negocian:
 *  1. **Todo lo mio es solo mio.** Cada operacion comprueba que la ejecucion pertenece a quien
 *     la pide. El aislamiento por empresa (RLS) no basta: dentro de la misma empresa, el
 *     progreso de otra persona tampoco se toca.
 *  2. **El avance no retrocede.** El telefono puede reenviar progreso viejo al recuperar senal;
 *     el servidor se queda con el mayor porcentaje y acumula el tiempo. Repetir un envio nunca
 *     puede empeorar el estado de alguien.
 */
@Injectable()
export class PlayerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly engagement: EngagementService,
  ) {}

  /** La ejecucion con sus piezas en orden y lo que la persona ya lleva de cada una. */
  async openEnrollment(actor: AuthUser, enrollmentId: string) {
    const enrollment = await this.requireOwn(actor, enrollmentId);

    const [contents, progress, attempts] = await Promise.all([
      this.prisma.scoped.activityContent.findMany({
        where: { activityVersionId: enrollment.activityVersionId },
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          displayOrder: true,
          isRequired: true,
          config: true,
          lessonId: true,
          assessmentId: true,
          surveyTemplateId: true,
          // Lo justo para que el indice diga de que tamano es cada parte ANTES de abrirla:
          // "8 tarjetas", "11 diapositivas". Un indice que solo lista titulos obliga a entrar
          // para saber en que se esta metiendo uno.
          lesson: { select: { estimatedMinutes: true, _count: { select: { cards: true } } } },
          contentPackage: {
            select: { kind: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true, manifest: true },
          },
        },
      }),
      this.prisma.scoped.activityProgress.findMany({ where: { enrollmentId } }),
      this.prisma.scoped.attempt.findMany({
        where: { enrollmentId },
        orderBy: { attemptNumber: 'asc' },
        select: { id: true, assessmentId: true, attemptNumber: true, status: true, score: true, passed: true },
      }),
    ]);

    const progressByContent = new Map(progress.map((row) => [row.activityContentId, row]));
    const passed = new Set(attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.assessmentId));

    return {
      enrollment: {
        id: enrollment.id,
        status: enrollment.status,
        blockedAt: enrollment.blockedAt,
        blockedReason: enrollment.blockedReason,
        activityId: enrollment.activityVersion.activity.id,
        activityName: enrollment.activityVersion.activity.name,
        activityDescription: enrollment.activityVersion.activity.description,
        activityType: enrollment.activityVersion.activity.activityType,
        activityModality: enrollment.activityVersion.activity.modality,
        processName: enrollment.activityVersion.activity.process.name,
        normNames: enrollment.activityVersion.activity.norms.map((row) => row.norm.name),
        versionNumber: enrollment.activityVersion.versionNumber,
        passingScore: enrollment.activityVersion.passingScore,
        estimatedMinutes: enrollment.activityVersion.estimatedMinutes,
      },
      contents: contents.map((content) => {
        const own = progressByContent.get(content.id);
        const slides = (content.contentPackage?.manifest as { slides?: unknown[] } | null)?.slides;
        return {
          id: content.id,
          type: content.type,
          title: content.title,
          description: content.description,
          isRequired: content.isRequired,
          config: content.config,
          hasLesson: content.lessonId !== null,
          assessmentId: content.assessmentId,
          surveyTemplateId: content.surveyTemplateId,
          /**
           * EL TAMANO DE LA PIEZA, en la unidad de cada tipo.
           *
           * No se inventan minutos donde no los hay: de un video subido no se conoce la duracion
           * hasta reproducirlo, y poner un numero redondo seria mentirle a quien decide si le da
           * tiempo antes de entrar al turno. Se dice lo que se sabe: tarjetas, diapositivas o los
           * minutos estimados que escribio quien armo la leccion.
           */
          size: {
            cards: content.lesson?._count.cards ?? null,
            slides: Array.isArray(slides) ? slides.length : null,
            minutes: content.lesson?.estimatedMinutes ?? null,
          },
          /**
           * El archivo, cuando la pieza ES un archivo. Lo usa la pestana de material de apoyo
           * para ofrecer el documento sin sacar a nadie del reproductor.
           */
          file: content.contentPackage
            ? {
                storageKey: content.contentPackage.storageKey,
                originalName: content.contentPackage.originalName,
                mimeType: content.contentPackage.mimeType,
                sizeBytes: content.contentPackage.sizeBytes,
              }
            : null,
          status:
            content.type === 'ASSESSMENT' && content.assessmentId && passed.has(content.assessmentId)
              ? 'COMPLETED'
              : (own?.status ?? 'NOT_STARTED'),
          pct: own?.pct ?? 0,
          lastCardIndex: readLastCard(own?.data),
        };
      }),
      attempts,
    };
  }

  /** El material de una pieza. Las tarjetas de una leccion se sirven ya listas para el player. */
  async getContent(actor: AuthUser, contentId: string) {
    const content = await this.prisma.scoped.activityContent.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        config: true,
        lessonId: true,
        contentPackageId: true,
        assessmentId: true,
        // La encuesta se responde DENTRO del reproductor, como una pieza mas (Decision #116).
        surveyTemplateId: true,
        activityVersionId: true,
      },
    });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });

    // Se exige tener una ejecucion abierta de ESA version: no se puede leer contenido suelto.
    const enrollment = await this.prisma.scoped.enrollment.findFirst({
      where: { userId: actor.id, activityVersionId: content.activityVersionId },
      select: { id: true },
    });
    if (!enrollment) throw new ForbiddenException({ code: 'NOT_ENROLLED' });

    const lesson = content.lessonId
      ? await this.prisma.scoped.lesson.findUnique({
          where: { id: content.lessonId },
          select: {
            id: true,
            title: true,
            estimatedMinutes: true,
            cards: {
              orderBy: { displayOrder: 'asc' },
              select: { id: true, cardType: true, payload: true, mediaKey: true },
            },
          },
        })
      : null;

    const documentPackage = content.contentPackageId
      ? await this.prisma.scoped.contentPackage.findUnique({
          where: { id: content.contentPackageId },
          // `manifest` trae las diapositivas de una presentacion ya convertida: sin el, el
          // reproductor no sabria que imagenes pedir ni cuantas son.
          select: {
            id: true,
            kind: true,
            storageKey: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            manifest: true,
          },
        })
      : null;

    /*
     * El minimo de reproduccion YA RESUELTO. Lo calcula el servidor y no el reproductor porque la
     * cascada (formacion -> empresa -> plataforma) tiene que dar el mismo numero en los dos sitios:
     * si la pantalla dijera 90 y la regla exigiera 100, la persona veria el boton abrirse y el
     * servidor no le daria la pieza por vista.
     */
    const minWatchPct = resolveMinWatchPct(content.config, await this.minWatchDefault());

    return { content, enrollmentId: enrollment.id, lesson, package: documentPackage, minWatchPct };
  }

  /**
   * Guarda el avance de una pieza. Acumulativo e idempotente: es el endpoint que mas veces va a
   * recibir envios repetidos desde un telefono que recupera senal.
   */
  async saveProgress(actor: AuthUser, contentId: string, input: ProgressInput) {
    const tenantId = this.prisma.currentTenantId;
    const content = await this.prisma.scoped.activityContent.findUnique({
      where: { id: contentId },
      select: { id: true, type: true, isRequired: true, activityVersionId: true, config: true },
    });
    if (!content) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND' });

    const enrollment = await this.prisma.scoped.enrollment.findFirst({
      where: { userId: actor.id, activityVersionId: content.activityVersionId },
      select: { id: true, status: true },
    });
    if (!enrollment) throw new ForbiddenException({ code: 'NOT_ENROLLED' });

    const existing = await this.prisma.scoped.activityProgress.findUnique({
      where: { enrollmentId_activityContentId: { enrollmentId: enrollment.id, activityContentId: contentId } },
    });

    const pct = Math.max(existing?.pct ?? 0, input.pct);
    const timeSpentS = (existing?.timeSpentS ?? 0) + input.secondsSpent;
    const wasCompleted = existing?.status === 'COMPLETED';
    const completed = meetsCompletion(content.type, content.config, pct, timeSpentS, await this.minWatchDefault());
    const now = new Date();

    await this.prisma.scoped.activityProgress.upsert({
      where: { enrollmentId_activityContentId: { enrollmentId: enrollment.id, activityContentId: contentId } },
      create: {
        tenantId,
        enrollmentId: enrollment.id,
        activityContentId: contentId,
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        pct,
        timeSpentS,
        firstAt: now,
        lastAt: now,
        data: mergeProgressData(null, input) as unknown as Prisma.InputJsonValue,
      },
      update: {
        status: completed ? 'COMPLETED' : 'IN_PROGRESS',
        pct,
        timeSpentS,
        lastAt: now,
        data: mergeProgressData(existing?.data ?? null, input) as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.scoped.learningEvent.create({
      data: {
        tenantId,
        userId: actor.id,
        enrollmentId: enrollment.id,
        verb: completed && !wasCompleted ? 'COMPLETED' : 'PROGRESSED',
        objectType: 'activity_contents',
        objectId: contentId,
        result: { pct, timeSpentS, ...(input.evidence ? { evidence: input.evidence } : {}) } as Prisma.InputJsonValue,
      },
    });

    // La racha se mueve solo la PRIMERA vez que se completa una leccion, y solo con lecciones.
    let streak = null;
    if (completed && !wasCompleted && content.type === 'LESSON') {
      streak = await this.engagement.awardLessonCompleted(this.prisma.scoped, tenantId, actor.id, contentId);
    }

    const outcome = await this.completion.evaluate(enrollment.id);
    return { pct, timeSpentS, completed, streak, enrollment: outcome };
  }

  /**
   * El minimo de reproduccion que exige LA EMPRESA cuando la formacion no dice otra cosa.
   *
   * Se lee en cada guardado en vez de cachearse: es una consulta por clave primaria y cambiarlo
   * tiene que surtir efecto ya. Si alguien sube el minimo del 80 al 100 un lunes, no puede seguir
   * dando videos por vistos al 80 hasta que caduque un cache.
   */
  private async minWatchDefault(): Promise<number> {
    const tenant = await this.prisma.scoped.tenant.findUniqueOrThrow({
      where: { id: this.prisma.currentTenantId },
      select: { settings: true },
    });
    return tenantSettingsSchema.parse(tenant.settings ?? {}).minWatchPctDefault;
  }

  /** Ninguna operacion del reproductor toca la ejecucion de otra persona. */
  private async requireOwn(actor: AuthUser, enrollmentId: string) {
    const enrollment = await this.prisma.scoped.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        blockedAt: true,
        blockedReason: true,
        activityVersionId: true,
        activityVersion: {
          select: {
            versionNumber: true,
            passingScore: true,
            estimatedMinutes: true,
            // La identidad de la actividad viaja para que la portada de la ficha sea LA MISMA que
            // la del catalogo: si cada pantalla dibujara la suya, la persona no reconoceria que
            // esta entrando a lo que acaba de pulsar.
            activity: {
              select: {
                id: true,
                name: true,
                description: true,
                modality: true,
                activityType: { select: { code: true, name: true, colorHex: true } },
          coverKey: true,
                // El proceso y la norma son lo que hace de esto EVIDENCIA y no un video suelto.
                // El colaborador tenia derecho a verlo y no lo tenia en ninguna pantalla.
                process: { select: { name: true } },
                norms: { select: { norm: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!enrollment) throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND' });
    if (enrollment.userId !== actor.id) throw new ForbiddenException({ code: 'NOT_YOUR_ENROLLMENT' });
    return enrollment;
  }
}
