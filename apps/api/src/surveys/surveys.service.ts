import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  surveyTemplateSchema,
  surveyResponseSchema,
  type SurveyQuestion,
  PREGUNTAS_EFICACIA,
  PREGUNTAS_SATISFACCION,
} from '@neo-pulse/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calificarEncuesta, loQueFalta } from './survey-grading.js';

@Injectable()
export class SurveysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(kind?: 'SATISFACTION' | 'EFFICACY') {
    return this.prisma.scoped.surveyTemplate.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, name: true, kind: true, questions: true, scheduledDaysAfter: true, active: true, version: true },
    });
  }

  async get(id: string) {
    const plantilla = await this.prisma.scoped.surveyTemplate.findUnique({ where: { id } });
    if (!plantilla) throw new NotFoundException({ code: 'SURVEY_NOT_FOUND' });
    return plantilla;
  }

  /**
   * Crea una plantilla. Si no llegan preguntas, se siembran las de manual segun su clase.
   *
   * Una encuesta nueva NO nace vacia: una pantalla en blanco delante de alguien que no sabe que
   * preguntar produce encuestas de una sola pregunta, y una encuesta de una pregunta no mide nada.
   */
  async create(tenantId: string, actorId: string, body: unknown) {
    const input = surveyTemplateSchema
      .partial({ questions: true })
      .parse(body) as ReturnType<typeof surveyTemplateSchema.parse> & { questions?: SurveyQuestion[] };

    const preguntas =
      input.questions && input.questions.length > 0
        ? input.questions
        : input.kind === 'EFFICACY'
          ? PREGUNTAS_EFICACIA
          : PREGUNTAS_SATISFACCION;

    const plantilla = await this.prisma.scoped.surveyTemplate.create({
      data: {
        tenantId,
        name: input.name,
        kind: input.kind,
        questions: preguntas as unknown as Prisma.InputJsonValue,
        scheduledDaysAfter: this.diasDe(input.kind, input.scheduledDaysAfter),
        active: input.active,
      },
    });
    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'SURVEY_TEMPLATE_CREATED',
      resourceType: 'survey_templates',
      resourceId: plantilla.id,
      newValues: { name: plantilla.name, kind: plantilla.kind },
    });
    return plantilla;
  }

  /**
   * Guarda cambios. **La version sube cuando cambian las PREGUNTAS**, no cuando se corrige el
   * nombre.
   *
   * Cada respuesta guarda con que version se contesto, asi que subirla en cada guardado llenaria el
   * historial de versiones identicas y haria imposible saber cual fue el cambio real. Y al reves:
   * NO subirla al cambiar una pregunta dejaria respuestas viejas apuntando a un texto que nadie
   * leyo — que es exactamente lo que hay que evitar.
   */
  async update(tenantId: string, actorId: string, id: string, body: unknown) {
    const previa = await this.get(id);
    const input = surveyTemplateSchema.parse(body);

    const cambiaronLasPreguntas = JSON.stringify(previa.questions) !== JSON.stringify(input.questions);

    const plantilla = await this.prisma.scoped.surveyTemplate.update({
      where: { id },
      data: {
        name: input.name,
        questions: input.questions as unknown as Prisma.InputJsonValue,
        scheduledDaysAfter: this.diasDe(input.kind, input.scheduledDaysAfter),
        active: input.active,
        ...(cambiaronLasPreguntas && { version: previa.version + 1 }),
      },
    });

    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'SURVEY_TEMPLATE_UPDATED',
      resourceType: 'survey_templates',
      resourceId: id,
      oldValues: { version: previa.version },
      newValues: { version: plantilla.version, cambiaronLasPreguntas },
    });
    return plantilla;
  }

  /**
   * BORRAR solo si nadie la ha respondido y no la usa ninguna formacion.
   *
   * Una encuesta con respuestas no se puede borrar: esas respuestas son la evidencia de que se
   * evaluo la capacitacion, que es justo lo que pide la auditoria. Lo que se hace con una que ya no
   * se usa es desactivarla.
   */
  async remove(tenantId: string, actorId: string, id: string) {
    const [respuestas, usos] = await Promise.all([
      this.prisma.scoped.surveyResponse.count({ where: { surveyTemplateId: id } }),
      this.prisma.scoped.activityContent.count({ where: { surveyTemplateId: id } }),
    ]);
    if (respuestas > 0 || usos > 0) {
      throw new BadRequestException({
        code: 'SURVEY_IN_USE',
        message:
          respuestas > 0
            ? `Ya tiene ${respuestas} respuesta(s). Desactivala en vez de borrarla: son la evidencia de que se evaluo.`
            : `La usan ${usos} formacion(es). Quitala de ellas primero.`,
      });
    }
    await this.prisma.scoped.surveyTemplate.delete({ where: { id } });
    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'SURVEY_TEMPLATE_DELETED',
      resourceType: 'survey_templates',
      resourceId: id,
    });
    return { ok: true as const };
  }

  /** La encuesta que le toca responder a alguien dentro de una formacion. */
  async paraResponder(tenantId: string, userId: string, enrollmentId: string, templateId: string) {
    const [inscripcion, plantilla, yaRespondio] = await Promise.all([
      this.prisma.forTenant(tenantId).enrollment.findUnique({ where: { id: enrollmentId }, select: { userId: true } }),
      this.prisma.forTenant(tenantId).surveyTemplate.findUnique({ where: { id: templateId } }),
      this.prisma
        .forTenant(tenantId)
        .surveyResponse.findFirst({ where: { enrollmentId, surveyTemplateId: templateId, respondentUserId: userId } }),
    ]);

    if (!inscripcion || !plantilla) throw new NotFoundException({ code: 'SURVEY_NOT_FOUND' });
    // Es SU formacion o no es su encuesta. RLS no protege de esto: las dos filas son del mismo
    // tenant, y sin la comprobacion bastaria cambiar el id en la direccion.
    if (inscripcion.userId !== userId) throw new NotFoundException({ code: 'SURVEY_NOT_FOUND' });

    return {
      id: plantilla.id,
      name: plantilla.name,
      kind: plantilla.kind,
      questions: plantilla.questions as unknown as SurveyQuestion[],
      // Ya respondida: la pantalla lo dice en vez de dejar volver a contestar. Se responde UNA vez.
      answered: yaRespondio !== null,
    };
  }

  /**
   * GUARDA UNA RESPUESTA.
   *
   * Congela `templateVersion` para que lo contestado siga explicandose aunque mañana se reescriba
   * una pregunta, y califica en el momento: el veredicto es lo que alimenta el indicador y, en
   * eficacia, lo que dispara un refuerzo.
   */
  async responder(tenantId: string, userId: string, enrollmentId: string, templateId: string, body: unknown) {
    const input = surveyResponseSchema.parse(body);
    const plantilla = await this.prisma.forTenant(tenantId).surveyTemplate.findUnique({ where: { id: templateId } });
    if (!plantilla) throw new NotFoundException({ code: 'SURVEY_NOT_FOUND' });

    const preguntas = plantilla.questions as unknown as SurveyQuestion[];
    const faltan = loQueFalta(preguntas, input.answers);
    if (faltan.length > 0) {
      /*
        SE COMPRUEBA AQUI Y NO SOLO EN LA PANTALLA. Una encuesta a medias guardada como completa es
        peor que una sin responder: cuenta en el denominador del indicador como si se hubiera
        evaluado, y el auditor vera un porcentaje de evaluacion que no es real.
      */
      throw new BadRequestException({
        code: 'SURVEY_INCOMPLETE',
        message: 'Faltan respuestas obligatorias.',
        missing: faltan,
      });
    }

    const existente = await this.prisma
      .forTenant(tenantId)
      .surveyResponse.findFirst({ where: { enrollmentId, surveyTemplateId: templateId, respondentUserId: userId } });
    // Idempotente: reenviar el mismo formulario —el boton pulsado dos veces, un reintento sin
    // señal— no crea una segunda respuesta ni cuenta doble en el indicador.
    if (existente) return { ok: true as const, result: existente.result };

    const result = calificarEncuesta(preguntas, input.answers);

    await this.prisma.forTenant(tenantId).surveyResponse.create({
      data: {
        tenantId,
        surveyTemplateId: templateId,
        templateVersion: plantilla.version,
        enrollmentId,
        respondentUserId: userId,
        answers: input.answers as unknown as Prisma.InputJsonValue,
        result,
      },
    });

    return { ok: true as const, result };
  }

  /**
   * `scheduledDaysAfter` solo tiene sentido en EFICACIA.
   *
   * En satisfaccion se fuerza a `null` en vez de rechazarlo con un error: un valor ahi no rompe
   * nada, no significa nada, y devolver un error por un campo que la pantalla ni siquiera enseña
   * seria un muro sin motivo. Se limpia y ya.
   */
  private diasDe(kind: 'SATISFACTION' | 'EFFICACY', dias: number | null): number | null {
    if (kind !== 'EFFICACY') return null;
    // 30 dias es el defecto del tenant (`efficacyDaysDefault`) y el plazo de manual para medir
    // transferencia: antes de un mes nadie ha tenido ocasion de aplicar nada.
    return dias ?? 30;
  }
}
