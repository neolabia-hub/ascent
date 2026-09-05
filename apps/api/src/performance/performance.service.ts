import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { competencySchema, competencyUpdateSchema, cycleSchema, formSchema, reviewSubmitSchema } from '@neo-pulse/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types.js';
import { libroDeConsolidado } from './performance-xlsx.js';
import {
  calcularNota,
  planificarEvaluaciones,
  problemasDeReparto,
  repartirFormularios,
  type EscalaCompetencia,
  type FormularioDelCiclo,
} from './performance-scoring.js';

/**
 * EVALUACION DE DESEMPENO (Decision #134). Ver `docs/modulos/desempeno.md`.
 *
 * Tres cosas que este servicio NO hace, y son las que definen el modulo:
 *
 *   1. No toca `enrollments`, `assignments` ni `certification_grants`. El cliente pidio que el
 *      desempeno no se mezcle con la capacitacion, y la forma de garantizarlo no es tener cuidado:
 *      es que este archivo no conozca esas tablas.
 *   2. No decide a quien se forma el ano que viene. Una competencia puede APUNTAR a la formacion
 *      que la fortalece, y ahi se queda: convertir una nota baja en una obligacion automatica seria
 *      que el sistema decida algo que decide una persona.
 *   3. No deja leer una evaluacion a quien no le toca. La autorizacion es por IDENTIDAD —el
 *      evaluador asignado, o la persona evaluada— y no solo por permiso.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────  COMPETENCIAS  ─────────────────────────────

  listCompetencies() {
    // Se devuelven TAMBIEN las inactivas: la pantalla las filtra. Una competencia retirada tiene
    // que poder verse para reactivarla, y sigue apareciendo en las evaluaciones ya respondidas.
    return this.prisma.scoped.performanceCompetency.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCompetency(body: unknown, user: AuthUser) {
    const data = competencySchema.parse(body);
    const created = await this.prisma.scoped.performanceCompetency
      .create({
        data: {
          tenantId: this.prisma.currentTenantId,
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          scale: data.scale,
          active: data.active,
          displayOrder: data.displayOrder,
          suggestedActivityId: data.suggestedActivityId ?? null,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({ code: 'DUPLICATE_CODE' });
        }
        throw error;
      });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'PERFORMANCE_COMPETENCY_CREATED',
      resourceType: 'performance_competencies',
      resourceId: created.id,
      newValues: { code: created.code, name: created.name, scale: created.scale },
    });
    return created;
  }

  async updateCompetency(id: string, body: unknown, user: AuthUser) {
    const data = competencyUpdateSchema.parse(body);
    const existing = await this.prisma.scoped.performanceCompetency.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'COMPETENCY_NOT_FOUND' });

    /*
      LA ESCALA NO SE CAMBIA SI YA SE RESPONDIO.

      Un 4 sobre 5 y un 4 sobre 10 son notas distintas. Cambiar la escala de una competencia con
      respuestas guardadas reescribiria en silencio lo que significan esas respuestas, y nadie lo
      notaria: los numeros siguen ahi, pero ya no quieren decir lo mismo.
    */
    if (data.scale !== undefined && data.scale !== existing.scale) {
      const respondidas = await this.prisma.scoped.performanceAnswer.count({ where: { competencyId: id } });
      if (respondidas > 0) {
        throw new ConflictException({ code: 'SCALE_LOCKED', answers: respondidas });
      }
    }

    const updated = await this.prisma.scoped.performanceCompetency.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.scale !== undefined && { scale: data.scale }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        ...(data.suggestedActivityId !== undefined && { suggestedActivityId: data.suggestedActivityId }),
      },
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'PERFORMANCE_COMPETENCY_UPDATED',
      resourceType: 'performance_competencies',
      resourceId: id,
      oldValues: existing,
      newValues: updated,
    });
    return updated;
  }

  // ─────────────────────────────  FORMULARIOS  ─────────────────────────────

  listForms() {
    return this.prisma.scoped.performanceForm.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        items: { include: { competency: true }, orderBy: { displayOrder: 'asc' } },
        jobTitles: { include: { jobTitle: { select: { id: true, name: true } } } },
        // La base con SUS competencias: la pantalla tiene que poder ensenar las heredadas sin
        // pedirlas aparte, y la vista previa las pinta junto a las propias.
        base: {
          select: {
            id: true,
            name: true,
            items: {
              select: { competencyId: true, weight: true, competency: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        _count: { select: { cycleForms: true, derivados: true } },
      },
    });
  }

  async saveForm(id: string | null, body: unknown, user: AuthUser) {
    const data = formSchema.parse(body);
    const tenantId = this.prisma.currentTenantId;

    /*
      UN FORMULARIO EN USO NO SE REESCRIBE.

      En cuanto un ciclo lo abrio, cambiarle las competencias cambiaria la pregunta bajo respuestas
      ya dadas. El ciclo guarda su propia copia congelada (`formSnapshot`) y por eso lo abierto no
      se rompe — pero editar el original haria que el proximo ciclo y el anterior se llamen igual y
      no lo sean. Se duplica y se edita la copia.
    */
    if (id) {
      const enUso = await this.prisma.scoped.performanceCycleForm.count({
        where: { formId: id, cycle: { status: { in: ['OPEN', 'CLOSED'] } } },
      });
      if (enUso > 0) throw new ConflictException({ code: 'FORM_IN_USE', cycles: enUso });
    }

    const competencias = await this.prisma.scoped.performanceCompetency.findMany({
      where: { id: { in: data.items.map((item) => item.competencyId) } },
      select: { id: true },
    });
    if (competencias.length !== data.items.length) {
      throw new BadRequestException({ code: 'COMPETENCY_NOT_FOUND' });
    }

    /*
      LA BASE: UN SOLO NIVEL, Y SIN REPETIR (Decision #141).

      Tres cosas que no pueden pasar y que aqui se cortan:

      - Heredar de si mismo, o de un formulario que a su vez hereda. Una cadena de plantillas es
        imposible de leer en pantalla y de explicar a quien la configura una vez al ano.
      - Ser base Y heredar a la vez: si de este formulario ya cuelgan otros, no puede colgar el.
      - Repetir en el cargo una competencia que ya viene de la base. Se preguntaria dos veces la
        misma cosa en la misma evaluacion, y ademas contaria doble en la nota.
    */
    let base: { id: string; baseFormId: string | null; items: { competencyId: string }[] } | null = null;
    if (data.baseFormId) {
      if (data.baseFormId === id) throw new BadRequestException({ code: 'BASE_IS_ITSELF' });
      base = await this.prisma.scoped.performanceForm.findUnique({
        where: { id: data.baseFormId },
        select: { id: true, baseFormId: true, items: { select: { competencyId: true } } },
      });
      if (!base) throw new BadRequestException({ code: 'BASE_NOT_FOUND' });
      if (base.baseFormId) throw new ConflictException({ code: 'BASE_CHAIN' });

      if (id) {
        const derivados = await this.prisma.scoped.performanceForm.count({ where: { baseFormId: id } });
        if (derivados > 0) throw new ConflictException({ code: 'IS_ALREADY_BASE', forms: derivados });
      }

      const heredadas = new Set(base.items.map((item) => item.competencyId));
      const repetida = data.items.find((item) => heredadas.has(item.competencyId));
      if (repetida) {
        throw new ConflictException({ code: 'COMPETENCY_IN_BASE', competencyId: repetida.competencyId });
      }
    }

    // Se reemplaza la lista entera dentro de UNA transaccion: un formulario a medias —con las
    // competencias viejas borradas y las nuevas sin escribir— no puede existir ni un instante.
    const form = await this.prisma.scoped.$transaction(async (tx) => {
      const guardado = id
        ? await tx.performanceForm.update({
            where: { id },
            data: {
              name: data.name,
              description: data.description ?? null,
              active: data.active,
              baseFormId: data.baseFormId,
            },
          })
        : await tx.performanceForm.create({
            data: {
              tenantId,
              name: data.name,
              description: data.description ?? null,
              active: data.active,
              baseFormId: data.baseFormId,
            },
          });

      await tx.performanceFormItem.deleteMany({ where: { formId: guardado.id } });
      await tx.performanceFormItem.createMany({
        data: data.items.map((item, indice) => ({
          tenantId,
          formId: guardado.id,
          competencyId: item.competencyId,
          weight: item.weight,
          displayOrder: indice,
        })),
      });

      await tx.performanceFormJobTitle.deleteMany({ where: { formId: guardado.id } });
      if (data.jobTitleIds.length > 0) {
        await tx.performanceFormJobTitle.createMany({
          data: data.jobTitleIds.map((jobTitleId) => ({ tenantId, formId: guardado.id, jobTitleId })),
        });
      }

      return guardado;
    });

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: id ? 'PERFORMANCE_FORM_UPDATED' : 'PERFORMANCE_FORM_CREATED',
      resourceType: 'performance_forms',
      resourceId: form.id,
      newValues: { name: form.name, competencias: data.items.length, cargos: data.jobTitleIds.length },
    });
    return form;
  }

  // ─────────────────────────────  CICLOS  ─────────────────────────────

  listCycles() {
    return this.prisma.scoped.performanceCycle.findMany({
      orderBy: { startsAt: 'desc' },
      include: {
        forms: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, formId: true, form: { select: { id: true, name: true } } },
        },
        _count: { select: { reviews: true } },
      },
    });
  }

  /**
   * CREAR LA CAMPANA con sus formularios (Decision #139).
   *
   * El reparto se comprueba AQUI y no solo al abrir: dos formularios que se pelean el mismo cargo
   * es un error de configuracion, y descubrirlo al pulsar «Abrir» es descubrirlo con prisa y con la
   * campana ya anunciada.
   */
  async createCycle(body: unknown, user: AuthUser) {
    const data = cycleSchema.parse(body);
    const tenantId = this.prisma.currentTenantId;
    const formIds = [...new Set(data.formIds)];

    const formularios = await this.prisma.scoped.performanceForm.findMany({
      where: { id: { in: formIds } },
      select: { id: true, name: true, jobTitles: { select: { jobTitleId: true } } },
    });
    if (formularios.length !== formIds.length) throw new BadRequestException({ code: 'FORM_NOT_FOUND' });

    this.exigirRepartoPosible(
      formularios.map((formulario) => ({
        cycleFormId: formulario.id,
        jobTitleIds: formulario.jobTitles.map((fila) => fila.jobTitleId),
      })),
    );

    const created = await this.prisma.scoped.performanceCycle.create({
      data: {
        tenantId,
        name: data.name,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        selfEvaluation: data.selfEvaluation,
        visibleToEmployee: data.visibleToEmployee,
        requiresSignature: data.requiresSignature,
        createdBy: user.id,
        // El orden en que se eligieron: es el que veran el consolidado y la pantalla.
        forms: { create: formIds.map((formId, indice) => ({ tenantId, formId, displayOrder: indice })) },
      },
      include: { forms: { select: { id: true, formId: true } } },
    });

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'PERFORMANCE_CYCLE_CREATED',
      resourceType: 'performance_cycles',
      resourceId: created.id,
      newValues: { name: created.name, formularios: formIds.length },
    });
    return created;
  }

  /**
   * Lo que hace IMPOSIBLE repartir, dicho antes de repartir.
   *
   * Con dos formularios reclamando el mismo cargo, o con dos generales, a quien le toca cual lo
   * decidiria el orden de la consulta. Eso no se resuelve eligiendo uno: se para y se dice cual es
   * el choque, que es lo unico que permite arreglarlo.
   */
  private exigirRepartoPosible(formularios: FormularioDelCiclo[]) {
    const problemas = problemasDeReparto(formularios);
    if (problemas.cargosSolapados.length > 0) {
      throw new ConflictException({ code: 'JOB_TITLES_OVERLAP', jobTitleIds: problemas.cargosSolapados });
    }
    if (problemas.generales > 1) {
      throw new ConflictException({ code: 'TOO_MANY_GENERAL_FORMS', forms: problemas.generales });
    }
  }

  /**
   * ABRIR EL CICLO: congelar LOS formularios y generar las evaluaciones.
   *
   * Es el momento irreversible del modulo, como publicar una version de contenido. A partir de
   * aqui, cambiar un formulario ya no afecta a este ciclo: lo que se pregunto queda escrito.
   *
   * Cada persona recibe el formulario de su cargo (Decision #139), y se devuelven DOS listas de
   * quienes se quedan fuera: a quien no se le pudo asignar jefe y a quien ningun formulario
   * reclama. Abrir en silencio dejando cuarenta personas fuera es como se descubre en diciembre
   * que media empresa no fue evaluada.
   */
  async openCycle(id: string, user: AuthUser) {
    const tenantId = this.prisma.currentTenantId;
    const cycle = await this.prisma.scoped.performanceCycle.findUnique({
      where: { id },
      include: {
        forms: {
          orderBy: { displayOrder: 'asc' },
          include: {
            form: {
              include: {
                items: { include: { competency: true }, orderBy: { displayOrder: 'asc' } },
                jobTitles: { select: { jobTitleId: true } },
                // Las comunes heredadas (Decision #141): entran en la copia congelada delante de
                // las del cargo.
                base: {
                  select: {
                    name: true,
                    items: {
                      select: { competencyId: true, weight: true, competency: true },
                      orderBy: { displayOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!cycle) throw new NotFoundException({ code: 'CYCLE_NOT_FOUND' });
    if (cycle.status !== 'DRAFT') throw new ConflictException({ code: 'CYCLE_ALREADY_OPEN' });
    if (cycle.forms.length === 0) throw new BadRequestException({ code: 'CYCLE_WITHOUT_FORMS' });

    /*
      LAS DOS CAPAS SE JUNTAN AQUI (Decision #141): primero las comunes que hereda, despues las
      suyas. En este orden y no al reves — quien califica lee lo de toda la empresa y luego lo del
      cargo, que es como se explica en la reunion donde se acordaron.

      A partir de esta linea el modulo entero trabaja con UNA lista: la nota, el congelado y la
      pantalla no saben que hubo dos capas, y por eso nada mas tuvo que cambiar.
    */
    const competenciasDe = (cycleForm: (typeof cycle.forms)[number]) => [
      ...(cycleForm.form.base?.items ?? []),
      ...cycleForm.form.items,
    ];

    // Se dice CUAL esta vacio: con varios formularios, "el formulario esta vacio" no basta para
    // saber cual hay que ir a arreglar.
    const vacio = cycle.forms.find((cycleForm) => competenciasDe(cycleForm).length === 0);
    if (vacio) throw new BadRequestException({ code: 'FORM_EMPTY', form: vacio.form.name });

    const delCiclo: FormularioDelCiclo[] = cycle.forms.map((cycleForm) => ({
      cycleFormId: cycleForm.id,
      jobTitleIds: cycleForm.form.jobTitles.map((fila) => fila.jobTitleId),
    }));
    // Los cargos pueden haber cambiado entre crear el ciclo y abrirlo: se comprueba otra vez.
    this.exigirRepartoPosible(delCiclo);

    /*
      SE MIRA A TODA LA EMPRESA, y a quien no cubre ningun formulario se le dice.

      Filtrar de entrada por los cargos declarados seria mas corto y dejaria fuera EN SILENCIO a
      quien no encaje — que es exactamente como se descubre en diciembre que a los conductores nadie
      los evaluo porque nadie hizo su formulario. Se reparte sobre toda la plantilla y lo que queda
      fuera se cuenta. Si la campana era a proposito solo para unos cargos, el aviso sobra y no
      estorba; si fue un olvido, es la unica ocasion de verlo.
    */
    const personas = await this.prisma.scoped.user.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, areaId: true, jobTitleId: true },
    });
    if (personas.length === 0) throw new BadRequestException({ code: 'NO_PEOPLE' });

    const { asignaciones, sinFormulario } = repartirFormularios(
      personas.map((persona) => ({ userId: persona.id, jobTitleId: persona.jobTitleId })),
      delCiclo,
    );

    const areas = await this.prisma.scoped.area.findMany({
      where: { responsibleUserId: { not: null } },
      select: { id: true, responsibleUserId: true },
    });
    const responsablePorArea = new Map(
      areas.map((area) => [area.id, area.responsibleUserId as string]),
    );

    const { evaluaciones, sinEvaluador } = planificarEvaluaciones(
      personas.flatMap((persona) => {
        const cycleFormId = asignaciones.get(persona.id);
        // Quien no encajo en ningun formulario ya esta contado en sinFormulario: no se le fabrica
        // una evaluacion con el primero que hubiera a mano.
        return cycleFormId
          ? [{ userId: persona.id, areaId: persona.areaId, jobTitleId: persona.jobTitleId, cycleFormId }]
          : [];
      }),
      responsablePorArea,
      { autoevaluacion: cycle.selfEvaluation },
    );

    /*
      ABRIR UNA CAMPANA QUE NO GENERA NADA NO ES ABRIRLA.

      Pasa cuando ningun cargo de la empresa encaja con los formularios elegidos, o cuando nadie
      tiene responsable de area y el ciclo no lleva autoevaluacion. Abrir es irreversible: dejarlo
      pasar convierte un error de configuracion en una campana vacia que ya no se puede corregir.
    */
    if (evaluaciones.length === 0) {
      throw new BadRequestException({
        code: 'NO_EVALUATIONS',
        sinFormulario: sinFormulario.length,
        sinEvaluador: sinEvaluador.length,
      });
    }

    // La copia congelada de CADA formulario: lo que se pregunto en este ciclo, con sus escalas y
    // sus pesos. Una por formulario, porque en la misma campana conviven varios.
    const congelados = cycle.forms.map((cycleForm) => ({
      cycleFormId: cycleForm.id,
      formSnapshot: {
        formId: cycleForm.form.id,
        name: cycleForm.form.name,
        items: competenciasDe(cycleForm).map((item) => ({
          competencyId: item.competencyId,
          name: item.competency.name,
          description: item.competency.description,
          scale: item.competency.scale,
          weight: item.weight,
        })),
      },
    }));

    await this.prisma.scoped.$transaction(async (tx) => {
      for (const congelado of congelados) {
        await tx.performanceCycleForm.update({
          where: { id: congelado.cycleFormId },
          data: { formSnapshot: congelado.formSnapshot as unknown as Prisma.InputJsonValue },
        });
      }
      await tx.performanceCycle.update({
        where: { id },
        data: { status: 'OPEN', openedAt: new Date() },
      });
      await tx.performanceReview.createMany({
        data: evaluaciones.map((evaluacion) => ({
          tenantId,
          cycleId: id,
          cycleFormId: evaluacion.cycleFormId,
          subjectUserId: evaluacion.subjectUserId,
          evaluatorUserId: evaluacion.evaluatorUserId,
          reviewerRole: evaluacion.reviewerRole,
        })),
        skipDuplicates: true,
      });
    });

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'PERFORMANCE_CYCLE_OPENED',
      resourceType: 'performance_cycles',
      resourceId: id,
      newValues: {
        evaluaciones: evaluaciones.length,
        formularios: congelados.length,
        sinEvaluador: sinEvaluador.length,
        sinFormulario: sinFormulario.length,
      },
    });

    // Se avisa a cada evaluador UNA vez, no una por evaluacion: un jefe con veinte personas a cargo
    // recibiria veinte correos identicos y dejaria de leerlos.
    const evaluadores = [...new Set(evaluaciones.map((e) => e.evaluatorUserId))];
    const cuantas = new Map<string, number>();
    for (const evaluacion of evaluaciones) {
      cuantas.set(evaluacion.evaluatorUserId, (cuantas.get(evaluacion.evaluatorUserId) ?? 0) + 1);
    }
    const gente = await this.prisma.scoped.user.findMany({
      where: { id: { in: evaluadores } },
      select: { id: true, email: true },
    });
    for (const quien of gente) {
      const total = cuantas.get(quien.id) ?? 0;
      await this.notifications.notify(tenantId, {
        eventType: 'PERFORMANCE_CYCLE_OPENED',
        recipientUserId: quien.id,
        recipientEmail: quien.email,
        subject: `${cycle.name}: tienes ${total} evaluacion${total === 1 ? '' : 'es'} por responder`,
        body: `El ciclo ${cycle.name} esta abierto hasta el ${cycle.endsAt.toLocaleDateString('es-CO')}.`,
        referenceType: 'performance_cycles',
        referenceId: id,
      });
    }

    return { evaluaciones: evaluaciones.length, sinEvaluador, sinFormulario };
  }

  async closeCycle(id: string, user: AuthUser) {
    const cycle = await this.prisma.scoped.performanceCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException({ code: 'CYCLE_NOT_FOUND' });
    if (cycle.status !== 'OPEN') throw new ConflictException({ code: 'CYCLE_NOT_OPEN' });

    // Cerrar NO borra lo que quedo sin responder: queda como estaba, y el consolidado lo dice. Un
    // ciclo con quince evaluaciones sin entregar es informacion sobre como fue la campana.
    const updated = await this.prisma.scoped.performanceCycle.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'PERFORMANCE_CYCLE_CLOSED',
      resourceType: 'performance_cycles',
      resourceId: id,
    });
    return updated;
  }

  // ─────────────────────────────  EVALUAR  ─────────────────────────────

  /** Lo que me toca responder a mi. Es la pantalla de quien califica. */
  async myReviews(user: AuthUser) {
    const reviews = await this.prisma.scoped.performanceReview.findMany({
      where: { evaluatorUserId: user.id, cycle: { status: 'OPEN' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        cycle: { select: { id: true, name: true, endsAt: true } },
        // El nombre del formulario, que con varios en la misma campana es lo que distingue una
        // evaluacion de otra en la lista de un jefe con gente de dos cargos.
        cycleForm: { select: { id: true, form: { select: { name: true } } } },
      },
    });
    return this.conNombres(reviews);
  }

  /** Lo mio: como me evaluaron. Solo lo que el ciclo permite ver. */
  async aboutMe(user: AuthUser) {
    const reviews = await this.prisma.scoped.performanceReview.findMany({
      where: {
        subjectUserId: user.id,
        status: 'SUBMITTED',
        // Si el ciclo dice que no se muestra, no se muestra — ni siquiera la propia.
        OR: [{ cycle: { visibleToEmployee: true } }, { reviewerRole: 'SELF' }],
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        cycle: { select: { id: true, name: true, requiresSignature: true } },
        // De aqui salen las preguntas al leer lo propio: la copia congelada del formulario que le
        // toco a esta persona.
        cycleForm: { select: { id: true, formSnapshot: true, form: { select: { name: true } } } },
        answers: true,
      },
    });
    return this.conNombres(reviews);
  }

  /**
   * UNA evaluacion, para responderla o para leerla.
   *
   * La autorizacion es por IDENTIDAD y no solo por permiso: se abre si eres el evaluador asignado,
   * si eres la persona evaluada (y el ciclo lo permite), o si tienes `performance:read_all`. Un
   * permiso de "ver evaluaciones" a secas dejaria a cualquiera con el rol leyendo lo que su jefe
   * escribio sobre otra persona.
   */
  async getReview(id: string, user: AuthUser) {
    const review = await this.prisma.scoped.performanceReview.findUnique({
      where: { id },
      include: {
        cycle: true,
        cycleForm: { select: { id: true, formSnapshot: true, form: { select: { name: true } } } },
        answers: true,
      },
    });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND' });

    const esEvaluador = review.evaluatorUserId === user.id;
    const esEvaluado = review.subjectUserId === user.id;
    const puedeVerTodo = user.hasPermission('performance:read_all');
    if (!esEvaluador && !puedeVerTodo && !(esEvaluado && review.cycle.visibleToEmployee)) {
      throw new ForbiddenException({ code: 'NOT_YOURS' });
    }
    // Quien es evaluado no ve la evaluacion de su jefe antes de que la entregue.
    if (esEvaluado && !esEvaluador && !puedeVerTodo && review.status !== 'SUBMITTED') {
      throw new ForbiddenException({ code: 'NOT_SUBMITTED_YET' });
    }

    const [nombres] = await Promise.all([this.conNombres([review])]);
    return nombres[0];
  }

  /**
   * ENTREGAR una evaluacion. Se manda entera y se calcula la nota aqui.
   *
   * Una vez entregada no se reabre: es lo que la persona evaluada va a leer y firmar. Corregir
   * despues, sin que se note, convertiria la evidencia en algo que no se puede citar.
   */
  async submitReview(id: string, body: unknown, user: AuthUser) {
    const data = reviewSubmitSchema.parse(body);
    const review = await this.prisma.scoped.performanceReview.findUnique({
      where: { id },
      include: { cycle: true, cycleForm: true },
    });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND' });
    if (review.evaluatorUserId !== user.id) throw new ForbiddenException({ code: 'NOT_YOURS' });
    if (review.cycle.status !== 'OPEN') throw new ConflictException({ code: 'CYCLE_NOT_OPEN' });
    if (review.status === 'SUBMITTED') throw new ConflictException({ code: 'ALREADY_SUBMITTED' });

    // La copia congelada sale del formulario QUE LE TOCO A ESTA PERSONA, no del ciclo: en la misma
    // campana el conductor y el analista responden formularios distintos.
    const snapshot = review.cycleForm.formSnapshot as unknown as {
      items: { competencyId: string; name: string; scale: EscalaCompetencia; weight: number }[];
    } | null;
    if (!snapshot) throw new ConflictException({ code: 'CYCLE_WITHOUT_FORM' });

    const porCompetencia = new Map(snapshot.items.map((item) => [item.competencyId, item]));
    const respuestas = data.answers.filter((respuesta) => porCompetencia.has(respuesta.competencyId));
    if (respuestas.length === 0) throw new BadRequestException({ code: 'ANSWERS_NOT_IN_FORM' });

    const nota = calcularNota(
      respuestas.map((respuesta) => {
        const item = porCompetencia.get(respuesta.competencyId);
        return {
          escala: item?.scale ?? 'TEXT_ONLY',
          valor: respuesta.value,
          peso: item?.weight ?? 1,
        };
      }),
    );

    const tenantId = this.prisma.currentTenantId;
    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.performanceAnswer.deleteMany({ where: { reviewId: id } });
      await tx.performanceAnswer.createMany({
        data: respuestas.map((respuesta) => ({
          tenantId,
          reviewId: id,
          competencyId: respuesta.competencyId,
          // El nombre se guarda con la respuesta: la competencia puede renombrarse, y lo que se
          // respondio tiene que poder leerse dentro de cinco anos tal como se pregunto.
          competencyName: porCompetencia.get(respuesta.competencyId)?.name ?? 'Competencia',
          value: respuesta.value,
          comment: respuesta.comment ?? null,
        })),
      });
      await tx.performanceReview.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          score: nota === null ? null : new Prisma.Decimal(nota),
          comment: data.comment ?? null,
        },
      });
    });

    await this.audit.record({
      tenantId,
      userId: user.id,
      action: 'PERFORMANCE_REVIEW_SUBMITTED',
      resourceType: 'performance_reviews',
      resourceId: id,
      newValues: { score: nota, reviewerRole: review.reviewerRole },
    });

    // Se avisa a la persona evaluada solo si el ciclo dice que puede verla, y nunca de su propia
    // autoevaluacion: recibir un correo por algo que uno acaba de escribir es ruido.
    if (review.cycle.visibleToEmployee && review.reviewerRole === 'MANAGER') {
      const evaluado = await this.prisma.scoped.user.findUnique({
        where: { id: review.subjectUserId },
        select: { id: true, email: true },
      });
      if (evaluado) {
        await this.notifications.notify(tenantId, {
          eventType: 'PERFORMANCE_REVIEW_SUBMITTED',
          recipientUserId: evaluado.id,
          recipientEmail: evaluado.email,
          subject: `Tu evaluacion de ${review.cycle.name} ya esta lista`,
          body: 'Puedes leerla en tu perfil.',
          referenceType: 'performance_reviews',
          referenceId: id,
        });
      }
    }

    return { ok: true as const, score: nota };
  }

  /**
   * FIRMAR: la persona reconoce que la conversacion ocurrio.
   *
   * No es "estoy de acuerdo" y por eso no hay boton de rechazar. Es lo que convierte la evaluacion
   * en evidencia: la misma logica de la firma electronica que ya se usa en formacion.
   */
  async signReview(id: string, user: AuthUser, ip: string | null) {
    const review = await this.prisma.scoped.performanceReview.findUnique({
      where: { id },
      include: { cycle: true },
    });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND' });
    if (review.subjectUserId !== user.id) throw new ForbiddenException({ code: 'NOT_YOURS' });
    if (review.status !== 'SUBMITTED') throw new ConflictException({ code: 'NOT_SUBMITTED_YET' });
    if (review.signedAt) return { ok: true as const, signedAt: review.signedAt };

    const updated = await this.prisma.scoped.performanceReview.update({
      where: { id },
      data: { signedAt: new Date(), signedIp: ip },
    });

    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: user.id,
      action: 'PERFORMANCE_REVIEW_SIGNED',
      resourceType: 'performance_reviews',
      resourceId: id,
      newValues: { signedAt: updated.signedAt },
    });
    return { ok: true as const, signedAt: updated.signedAt };
  }

  /**
   * El consolidado de un ciclo, para quien lo gestiona.
   *
   * Va ENTERO y POR FORMULARIO (Decision #139). Tener el de conductores y el de analistas en la
   * misma campana existe justamente para poder mirar las dos cosas: la campana completa, y cada
   * grupo por separado sin sumar a mano. La nota se puede promediar entre formularios distintos
   * porque esta normalizada a 100 — un 4 sobre 5 y un "cumple" valen 80 y 100 en las dos.
   */
  async cycleSummary(id: string) {
    const cycle = await this.prisma.scoped.performanceCycle.findUnique({
      where: { id },
      include: {
        forms: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, formId: true, form: { select: { id: true, name: true } } },
        },
      },
    });
    if (!cycle) throw new NotFoundException({ code: 'CYCLE_NOT_FOUND' });

    const reviews = await this.prisma.scoped.performanceReview.findMany({
      where: { cycleId: id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      cycle,
      ...resumirEvaluaciones(reviews),
      porFormulario: cycle.forms.map((cycleForm) => ({
        cycleFormId: cycleForm.id,
        name: cycleForm.form.name,
        ...resumirEvaluaciones(reviews.filter((review) => review.cycleFormId === cycleForm.id)),
      })),
      items: await this.conNombres(reviews),
    };
  }

  /**
   * EL CONSOLIDADO EN EXCEL: lo mismo que ensena la pantalla, entero.
   *
   * La pantalla se queda en 100 filas porque nadie lee 900 en una ventana; el archivo va completo,
   * que es lo que se guarda como evidencia del ano. Las filas salen del MISMO metodo que pinta la
   * pantalla —no de una consulta paralela—: un informe que no cuadra con lo que se acaba de mirar
   * destruye la confianza en los dos a la vez.
   */
  async cycleSummaryXlsx(id: string): Promise<{ archivo: Buffer; nombre: string }> {
    const datos = await this.cycleSummary(id);
    const tenant = await this.prisma.scoped.tenant.findUnique({
      where: { id: this.prisma.currentTenantId },
      select: { name: true },
    });

    const porNombreDeFormulario = new Map(
      datos.cycle.forms.map((cycleForm) => [cycleForm.id, cycleForm.form.name]),
    );

    const archivo = await libroDeConsolidado(
      {
        empresa: tenant?.name ?? 'NEO PULSE',
        cicloNombre: datos.cycle.name,
        generadoEn: new Date(),
        abre: datos.cycle.startsAt,
        cierra: datos.cycle.endsAt,
        estado: ESTADO_DE_CICLO[datos.cycle.status] ?? datos.cycle.status,
      },
      datos.porFormulario,
      datos.items.map((item) => ({
        subjectName: item.subjectName,
        subjectJobTitle: item.subjectJobTitle,
        subjectArea: item.subjectArea,
        formulario: porNombreDeFormulario.get(item.cycleFormId) ?? null,
        evaluatorName: item.evaluatorName,
        esAutoevaluacion: item.reviewerRole === 'SELF',
        entregada: item.status === 'SUBMITTED',
        score: item.score === null ? null : Number(item.score),
        firmadaEn: item.signedAt,
      })),
    );

    // El nombre lleva el ciclo y la fecha: dos descargas del mismo ciclo en semanas distintas no
    // pueden llamarse igual en la carpeta de quien audita.
    const fecha = new Date().toISOString().slice(0, 10);
    const limpio = datos.cycle.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return { archivo, nombre: `desempeno-${limpio}-${fecha}.xlsx` };
  }

  /**
   * Los nombres de las personas, en un viaje.
   *
   * `performance_reviews` guarda ids y no expone relacion hacia `users` —igual que
   * `certification_grants`— asi que se resuelven aparte. Una consulta por fila serian doscientas
   * para pintar una lista.
   */
  private async conNombres<T extends { subjectUserId: string; evaluatorUserId: string }>(reviews: T[]) {
    const ids = [...new Set(reviews.flatMap((review) => [review.subjectUserId, review.evaluatorUserId]))];
    const gente = await this.prisma.scoped.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, jobTitle: { select: { name: true } }, area: { select: { name: true } } },
    });
    const porId = new Map(gente.map((persona) => [persona.id, persona]));

    return reviews.map((review) => ({
      ...review,
      subjectName: porId.get(review.subjectUserId)?.fullName ?? null,
      subjectJobTitle: porId.get(review.subjectUserId)?.jobTitle?.name ?? null,
      subjectArea: porId.get(review.subjectUserId)?.area?.name ?? null,
      evaluatorName: porId.get(review.evaluatorUserId)?.fullName ?? null,
    }));
  }
}

/**
 * LAS CUATRO CIFRAS de un monton de evaluaciones.
 *
 * Fuera de la clase porque no consulta nada, y en un solo sitio porque se usa para la campana
 * entera y para cada formulario: contarlas dos veces con dos codigos es como acaban sin cuadrar.
 */
/** Como se dice cada estado de ciclo en un archivo que lee alguien de fuera. */
const ESTADO_DE_CICLO: Record<string, string> = {
  DRAFT: 'Borrador',
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
};

function resumirEvaluaciones(reviews: { status: string; score: Prisma.Decimal | null; signedAt: Date | null }[]) {
  const entregadas = reviews.filter((review) => review.status === 'SUBMITTED');
  const conNota = entregadas.filter((review) => review.score !== null);

  return {
    total: reviews.length,
    entregadas: entregadas.length,
    firmadas: reviews.filter((review) => review.signedAt !== null).length,
    promedio:
      conNota.length === 0
        ? null
        : Math.round((conNota.reduce((suma, review) => suma + Number(review.score), 0) / conNota.length) * 10) / 10,
  };
}
