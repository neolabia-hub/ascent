import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activityTypeConfigSchema, audienceRuleSchema } from '@neo-pulse/shared';
import type {
  AudienceRule,
  CreateAssignmentInput,
  CreateAssignmentRuleInput,
  ListAssignmentsQuery,
  SetActivityRequirementInput,
  ToggleJobTitleMatrixInput,
  UpdateAssignmentRuleInput,
  WaiveAssignmentInput,
} from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildAudienceWhere,
  ELIGIBLE_MEMBER,
  jobTitlesOf,
  ruleReachesEveryone,
} from './audience-rule.js';
import { AudiencesService } from './audiences.service.js';
import { endOfDay, type CalendarDate } from './due-date.js';
import { RequirementEngineService } from './requirement-engine.service.js';

/** Estados en los que la obligacion sigue viva (no se duplica ni se reasigna encima). */
const OPEN_STATUSES: Prisma.EnumAssignmentStatusFilter = { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] };

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly audiences: AudiencesService,
    private readonly engine: RequirementEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────── Requisitos (reglas) ───────────────────────────

  async listRules() {
    const rules = await this.prisma.scoped.assignmentRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        audience: { select: { id: true, name: true, active: true } },
        _count: { select: { assignments: true } },
      },
    });
    const titles = await this.resolveActivityTitles(rules.map((r) => r.targetId));
    return rules.map((rule) => ({
      id: rule.id,
      audience: rule.audience,
      targetType: rule.targetType,
      targetId: rule.targetId,
      targetName: titles.get(rule.targetId) ?? null,
      trigger: rule.trigger,
      dueDaysAfterTrigger: rule.dueDaysAfterTrigger,
      recurrence: rule.recurrence,
      active: rule.active,
      assignmentCount: rule._count.assignments,
      createdAt: rule.createdAt,
    }));
  }

  async createRule(actor: AuthUser, input: CreateAssignmentRuleInput & { appliesFrom?: Date | null; sourcePathId?: string | null }) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertTargetExists(input.targetType, input.targetId);

    const audience = await this.prisma.scoped.audience.findUnique({ where: { id: input.audienceId } });
    if (!audience) throw new NotFoundException({ code: 'AUDIENCE_NOT_FOUND' });

    // DOS REGLAS "para toda la empresa" sobre la misma formacion no anaden a nadie: solo crean
    // una segunda obligacion a cada persona por lo mismo, con dos vencimientos distintos, y el
    // dia que alguien pregunte cual es la buena no habra respuesta. Desde que la induccion
    // general se exige sola al publicar (Decision #69), este choque es facil de provocar.
    if (ruleReachesEveryone(this.audiences.parseRule(audience.rule))) {
      const yaParaTodos = await this.prisma.scoped.assignmentRule.findFirst({
        where: { targetType: input.targetType, targetId: input.targetId, active: true },
        include: { audience: { select: { rule: true } } },
      });
      if (yaParaTodos && ruleReachesEveryone(this.audiences.parseRule(yaParaTodos.audience.rule))) {
        throw new ConflictException({
          code: 'ALREADY_REQUIRED_FOR_ALL',
          message: 'Esta formación ya se le exige a toda la empresa: ajusta el requisito que existe.',
        });
      }
    }

    const duplicate = await this.prisma.scoped.assignmentRule.findFirst({
      where: { audienceId: input.audienceId, targetId: input.targetId, active: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'RULE_ALREADY_EXISTS',
        message: 'Esa audiencia ya tiene este requisito activo.',
      });
    }

    const rule = await this.prisma.scoped.assignmentRule.create({
      data: {
        tenantId,
        audienceId: input.audienceId,
        targetType: input.targetType,
        targetId: input.targetId,
        trigger: input.trigger,
        dueDaysAfterTrigger: input.dueDaysAfterTrigger,
        recurrence: (input.recurrence ?? null) as Prisma.InputJsonValue,
        // "Solo a quien entre desde ahora": se marca con el instante de creacion. Quien ya estaba
        // en la audiencia entro ANTES, asi que el motor no lo alcanza.
        appliesFrom: input.appliesFrom ?? null,
        // De donde salio: el programa que la creo, o null si la declaro alguien sobre la formacion.
        // No se lee todavia en ningun sitio; ver el porque en el esquema.
        sourcePathId: input.sourcePathId ?? null,
        createdBy: actor.id,
      },
    });

    // Un requisito nuevo obliga desde YA a quien ya pertenece a la audiencia.
    const generated = await this.engine.generate(this.prisma.scoped, tenantId, { ruleId: rule.id });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_RULE_CREATED',
      resourceType: 'assignment_rules',
      resourceId: rule.id,
      newValues: { ...input, generated: generated.created },
    });
    return { rule, generated: generated.created };
  }

  async updateRule(actor: AuthUser, id: string, input: UpdateAssignmentRuleInput) {
    const tenantId = this.prisma.currentTenantId;
    const before = await this.prisma.scoped.assignmentRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

    const rule = await this.prisma.scoped.assignmentRule.update({
      where: { id },
      data: {
        dueDaysAfterTrigger: input.dueDaysAfterTrigger,
        recurrence: input.recurrence === undefined ? undefined : ((input.recurrence ?? null) as Prisma.InputJsonValue),
        active: input.active,
      },
    });

    // Retirar el requisito retira lo PENDIENTE (queda con motivo, no se borra).
    if (input.active === false) {
      await this.engine.withdrawLeavers(this.prisma.scoped);
    }
    if (input.active === true) {
      await this.engine.generate(this.prisma.scoped, tenantId, { ruleId: id });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_RULE_UPDATED',
      resourceType: 'assignment_rules',
      resourceId: id,
      oldValues: { dueDaysAfterTrigger: before.dueDaysAfterTrigger, recurrence: before.recurrence, active: before.active },
      newValues: input,
    });
    return rule;
  }

  // ─────────────────────────── Matriz cargo -> actividad ───────────────────────────

  /**
   * LA MATRIZ DE INDUCCIONES: que formacion de puesto le toca a cada cargo.
   *
   * Es el documento que la empresa enseña en una auditoria, y por eso la pantalla se parece a el.
   * Cada casilla encendida es, por debajo, una audiencia de ese cargo y un requisito de ingreso.
   *
   * ─── SOLO LAS QUE SE DECIDEN POR CARGO (2026-09-03) ───
   *
   * Antes cruzaba los cargos con TODAS las formaciones activas. En la base de desarrollo eso
   * daban 5 x 1.606 = 8.030 casillas, y con datos reales seguirian sobrando casi todas: una
   * induccion general es de toda la empresa, una pildora no se exige, y una capacitacion del plan
   * saca sus obligaciones del plan. Cruzarlas con los cargos no solo era ruido — era la puerta por
   * la que se colaba el fallo de abajo. Ahora solo entran las de tipo `BY_JOB_TITLE`.
   *
   * ─── Y SE PINTAN TAMBIEN LAS DE VARIOS CARGOS ───
   *
   * En "Quienes" se pueden marcar tres cargos de una vez, y eso crea UNA audiencia con los tres.
   * La matriz solo reconocia las de un cargo exacto, asi que esa formacion aparecia sin ninguna
   * casilla: decia que no se le exigia a nadie mientras se le exigia a tres cargos. Ahora se
   * pintan las tres, marcadas como COMPARTIDAS — se ven, pero no se apagan de a una desde aqui,
   * porque apagar una tendria que partir una audiencia que otras formaciones tambien usan. Esa se
   * corrige donde se creo.
   */
  async jobTitleMatrix() {
    const [jobTitles, activities, rules, audiences] = await Promise.all([
      this.prisma.scoped.jobTitle.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, jobTitleType: { select: { name: true } } },
      }),
      this.prisma.scoped.activity.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          activityType: { select: { code: true, name: true, colorHex: true, config: true } },
          versions: { where: { status: 'PUBLISHED' }, select: { id: true }, take: 1 },
        },
      }),
      this.prisma.scoped.assignmentRule.findMany({
        where: { active: true, targetType: 'ACTIVITY' },
        include: { _count: { select: { assignments: true } } },
      }),
      this.prisma.scoped.audience.findMany({ where: { active: true } }),
    ]);

    const porCargo = activities.filter((activity) => {
      const config = activityTypeConfigSchema.partial().safeParse(activity.activityType.config ?? {});
      return config.success && config.data.defaultAssignmentMode === 'BY_JOB_TITLE';
    });
    const esDeLaMatriz = new Set(porCargo.map((activity) => activity.id));

    /** Cuanta gente tiene hoy cada cargo: una casilla sin nadie detras no urge igual que una de 400. */
    const plantilla = await this.prisma.scoped.user.groupBy({
      by: ['jobTitleId'],
      where: ELIGIBLE_MEMBER,
      _count: { _all: true },
    });
    const personasPorCargo = new Map(plantilla.map((fila) => [fila.jobTitleId, fila._count._all]));

    const cargosPorAudiencia = new Map<string, string[]>();
    for (const audience of audiences) {
      const cargos = jobTitlesOf(this.audiences.parseRule(audience.rule));
      if (cargos.length > 0) cargosPorAudiencia.set(audience.id, cargos);
    }

    const cells = rules.flatMap((rule) => {
      if (!esDeLaMatriz.has(rule.targetId)) return [];
      const cargos = cargosPorAudiencia.get(rule.audienceId);
      if (!cargos) return [];
      return cargos.map((jobTitleId) => ({
        jobTitleId,
        activityId: rule.targetId,
        ruleId: rule.id,
        trigger: rule.trigger,
        dueDaysAfterTrigger: rule.dueDaysAfterTrigger,
        assignmentCount: rule._count.assignments,
        /** Viene de una audiencia de varios cargos: se ve, pero se corrige en "Quienes". */
        shared: cargos.length > 1,
      }));
    });

    // Requisitos que alcanzan estas formaciones desde audiencias mas amplias —"toda la empresa",
    // "los de Antioquia"—: la matriz no los administra, pero callarlos haria creer que un cargo no
    // tiene nada exigido.
    const broaderRules = rules.filter(
      (rule) => esDeLaMatriz.has(rule.targetId) && !cargosPorAudiencia.has(rule.audienceId),
    ).length;

    return {
      jobTitles: jobTitles.map((jobTitle) => ({ ...jobTitle, people: personasPorCargo.get(jobTitle.id) ?? 0 })),
      activities: porCargo.map(({ versions, activityType, ...activity }) => ({
        ...activity,
        activityType: { code: activityType.code, name: activityType.name, colorHex: activityType.colorHex },
        /** Sin contenido publicado, la obligacion nace y no hay nada que hacer: la pantalla lo avisa. */
        published: versions.length > 0,
      })),
      cells,
      broaderRules,
    };
  }

  /**
   * Encender o apagar una casilla. Es la MISMA operacion que "exigirla" desde la ficha, dicha con
   * dos coordenadas en vez de con un formulario.
   *
   * ─── POR QUE DELEGA, DESDE EL 2026-09-03 ───
   *
   * Antes llamaba a `createRule` por su cuenta, y esa segunda puerta se habia saltado dos reglas
   * que la primera si aplicaba:
   *
   *   1. **La Decision #76.** `setActivityRequirement` fuerza el disparador a PLAN cuando la
   *      formacion es del plan; la matriz mandaba ON_HIRE a pelo. Comprobado contra la base:
   *      marcar una casilla de una capacitacion del plan creaba un requisito que disparaba solo y
   *      **hacia nacer 143 obligaciones de golpe**, que es exactamente lo que esa decision existe
   *      para impedir. Ahora la matriz solo enseña formaciones por cargo, pero la puerta no puede
   *      quedar abierta: una llamada directa a la API no mira lo que la pantalla ofrece.
   *   2. **El plazo.** La ficha manda -1 —D1072 exige que la induccion sea PREVIA al ingreso— y la
   *      pantalla de la matriz mandaba 0. La misma casilla valia una cosa u otra segun por donde
   *      se hubiera creado.
   *
   * Delegar las arregla las dos, y ademas hereda lo que venga despues sin tener que acordarse de
   * copiarlo aqui: es la leccion de `audience-rule.ts` —una definicion, dos derivaciones— aplicada
   * a la escritura.
   */
  async toggleJobTitleMatrix(actor: AuthUser, input: ToggleJobTitleMatrixInput) {
    const jobTitle = await this.prisma.scoped.jobTitle.findUnique({ where: { id: input.jobTitleId } });
    if (!jobTitle) throw new NotFoundException({ code: 'JOB_TITLE_NOT_FOUND' });
    await this.assertTargetExists('ACTIVITY', input.activityId);

    const scope = audienceRuleSchema.parse({ jobTitleIds: [input.jobTitleId] });

    if (!input.enabled) {
      const tenantId = this.prisma.currentTenantId;
      const audience = await this.audiences.findOrCreate(tenantId, scope);
      const existing = await this.prisma.scoped.assignmentRule.findFirst({
        where: { audienceId: audience.id, targetId: input.activityId },
      });
      if (existing?.active) {
        // Retirar una induccion de un cargo es un cambio a la matriz, y de los que mas hay que
        // explicar: alguien dejo de deber una formacion legal. Misma regla que al modificarla.
        if (!input.reason) {
          throw new BadRequestException({
            code: 'REASON_REQUIRED',
            message: 'Dejar de exigirsela a un cargo pide una novedad: queda en el registro.',
          });
        }
        await this.audit.record({
          tenantId,
          userId: actor.id,
          action: 'ACTIVITY_REQUIREMENT_CHANGED',
          resourceType: 'activities',
          resourceId: input.activityId,
          newValues: { audienceId: audience.id, scope, retirada: true, reason: input.reason },
        });
        await this.updateRule(actor, existing.id, { active: false });
      }
      return { enabled: false as const, ruleId: existing?.id ?? null };
    }

    const outcome = await this.setActivityRequirement(actor, {
      activityId: input.activityId,
      scope,
      trigger: 'ON_HIRE',
      dueDaysAfterTrigger: input.dueDaysAfterTrigger,
      everyMonths: null,
      fixedDate: null,
      // La induccion de puesto la deben los que entran Y los que ya estan: es lo que pide
      // TRANSPRENSA, y es lo que hacia esta pantalla desde siempre.
      soloNuevos: false,
      reason: input.reason ?? null,
    });
    return { enabled: true as const, ruleId: outcome.ruleId, generated: outcome.created };
  }

  /*
    Aqui vivia `findOrCreateJobTitleAudience`, que buscaba o creaba la audiencia de UN cargo. Se
    quito al hacer que la matriz delegue en `setActivityRequirement`: era la tercera copia de lo
    que hace `audiences.findOrCreate`, y la unica que no reutilizaba las audiencias creadas desde
    la ficha.
  */

  // ──────────────── Exigirla desde la formacion (una sola operacion) ────────────────

  /**
   * Los requisitos VIVOS de una formacion, dichos como los diria una persona.
   *
   * La pestana Quienes los necesita para poder responder "a quien se le exige esto" sin mandar a
   * nadie a otra pantalla. Se devuelve tambien el alcance en crudo para que el formulario pueda
   * ABRIRSE con lo que ya hay puesto en vez de en blanco.
   */
  async activityRequirements(activityId: string) {
    const rules = await this.prisma.scoped.assignmentRule.findMany({
      where: { targetType: 'ACTIVITY', targetId: activityId, active: true },
      orderBy: { createdAt: 'asc' },
      include: {
        audience: { select: { id: true, name: true, rule: true, active: true } },
        _count: { select: { assignments: true } },
      },
    });

    return Promise.all(
      rules.map(async (rule) => {
        const scope = this.audiences.parseRule(rule.audience.rule);
        return {
          id: rule.id,
          audienceId: rule.audience.id,
          audienceName: rule.audience.name,
          scope,
          reachesEveryone: ruleReachesEveryone(scope),
          trigger: rule.trigger,
          dueDaysAfterTrigger: rule.dueDaysAfterTrigger,
          everyMonths: this.everyMonthsOf(rule.recurrence),
          fixedDate: this.fixedDateOf(rule.recurrence),
          assignmentCount: rule._count.assignments,
          /**
           * SOLO A QUIEN ENTRE DESDE ENTONCES. Cambia por completo como hay que leer la cifra de
           * al lado, y por eso viaja: un requisito con esto puesto alcanza a 471 personas EN LA
           * AUDIENCIA y obliga a CERO hoy, porque todas entraron antes. Decir "alcanza a 471" sin
           * decir esto hace pensar que el sistema esta roto cuando esta haciendo justo lo pedido.
           */
          soloNuevos: rule.appliesFrom !== null,
          /** Cuanta gente alcanza HOY: es la cifra que evita crear un requisito a ciegas. */
          reach: (await this.audiences.preview(scope)).count,
        };
      }),
    );
  }

  /**
   * Exigir una formacion a un grupo, en un solo paso: se busca o se crea la audiencia y se crea
   * (o se pone al dia) el requisito. Nadie tiene que saber que existe la palabra "audiencia".
   *
   * Si ya habia un requisito para ese mismo alcance, se ACTUALIZA en vez de rechazarlo: quien
   * vuelve a la pantalla y cambia el plazo de 30 dias a 15 esta corrigiendo, no creando algo
   * nuevo, y un error de "ya existe" ahi es un callejon sin salida.
   */
  /*
    `origen` NO viaja en el esquema publico, y es deliberado: si estuviera en
    `setActivityRequirementSchema`, cualquier llamada a la API podria declarar que una regla la
    creo un programa. Lo pone quien de verdad lo sabe —`ProgramsService.asignarAudiencia`— y por
    eso es un parametro del servicio, no un campo del cuerpo.
  */
  async setActivityRequirement(actor: AuthUser, input: SetActivityRequirementInput, origen?: { pathId: string }) {
    await this.assertTargetExists('ACTIVITY', input.activityId);

    /*
      UNA CASILLA POR CARGO (2026-09-03).

      Marcar tres cargos de una vez creaba UN requisito con una audiencia de los tres dentro. Se
      guardaba bien y obligaba a quien tenia que obligar, pero dejaba la matriz sin poder
      administrarlos: quitarle la induccion a UNO de los tres exigia rehacer el requisito entero
      marcando los otros dos, y apagarlo se los llevaba a los tres por delante. Una audiencia
      compartida ademas no se puede partir por la espalda: `findOrCreate` la reutiliza entre
      formaciones, asi que partirla aqui cambiaria a quien alcanzan otras.

      Asi que se parte ARRIBA, al declararla: en los tipos por cargo, marcar tres cargos crea tres
      requisitos de un cargo. Para quien lo hace sigue siendo un solo gesto —marca los tres y pulsa
      una vez—; lo que cambia es que cada uno queda independiente, y se enciende y se apaga desde
      cualquiera de las dos puertas. La contrapartida, a la vista: "Lo que se exige hoy" ensena tres
      renglones en vez de uno, que es la verdad.

      Solo cuando el alcance habla SOLO de cargos: "conductores de Antioquia" es un grupo de verdad
      y no tres casillas, y ahi se respeta lo que se marco.
    */
    const config = await this.typeConfigOf(input.activityId);
    if (config.defaultAssignmentMode === 'BY_JOB_TITLE') {
      const cargos = jobTitlesOf(input.scope);
      if (cargos.length > 1) {
        let created = 0;
        let updated = false;
        let ultimo: Awaited<ReturnType<AssignmentsService['aplicarRequisito']>> | null = null;
        for (const jobTitleId of cargos) {
          const uno = await this.aplicarRequisito(
            actor,
            { ...input, scope: audienceRuleSchema.parse({ ...input.scope, jobTitleIds: [jobTitleId] }) },
            origen,
          );
          created += uno.created;
          updated = updated || uno.updated;
          ultimo = uno;
        }
        return {
          ruleId: ultimo?.ruleId ?? '',
          audienceId: ultimo?.audienceId ?? '',
          audienceName: `${cargos.length} cargos`,
          created,
          updated,
        };
      }
    }
    return this.aplicarRequisito(actor, input, origen);
  }

  /** La config del tipo de una formacion, que decide lo que el servidor fuerza. */
  private async typeConfigOf(activityId: string) {
    const tipo = await this.prisma.scoped.activity.findUniqueOrThrow({
      where: { id: activityId },
      select: { activityType: { select: { config: true } } },
    });
    const parsed = activityTypeConfigSchema.partial().safeParse(tipo.activityType.config ?? {});
    return parsed.success ? parsed.data : {};
  }

  /** Exigirla a UN alcance concreto. Lo que antes era el cuerpo entero de `setActivityRequirement`. */
  private async aplicarRequisito(actor: AuthUser, input: SetActivityRequirementInput, origen?: { pathId: string }) {
    const tenantId = this.prisma.currentTenantId;

    /**
     * SI LA FORMACION ES DEL PLAN, LA OBLIGACION LA DISPARA EL PLAN (Decision #76).
     *
     * Lo decide el SERVIDOR y no la pantalla, y se IGNORA lo que mande el cliente: el disparador,
     * el plazo y la recurrencia no son opiniones aqui, son consecuencias del tipo. Si dependiera
     * del formulario, una llamada directa a la API o una pantalla vieja volveria a crear un
     * requisito que dispara solo, y con el las dos obligaciones que este cambio existe para
     * evitar.
     *
     * El plazo se fuerza a 0 y la recurrencia a null porque no significan nada en este caso: una
     * capacitacion del plan vence el ultimo dia del mes que diga su renglon, y la del año que
     * viene es otro plan, no otra ronda de esta.
     */
    const config = await this.typeConfigOf(input.activityId);
    const esDelPlan = config.participatesInPlan === true;
    const trigger = esDelPlan ? ('PLAN' as const) : input.trigger;
    const dueDaysAfterTrigger = esDelPlan ? 0 : input.dueDaysAfterTrigger;

    const audience = await this.findOrCreateAudience(tenantId, input.scope);

    const existing = await this.prisma.scoped.assignmentRule.findFirst({
      where: { audienceId: audience.id, targetId: input.activityId, targetType: 'ACTIVITY' },
    });

    // Dos formas de repetir, y solo una a la vez: "cada N meses desde que la completo" (rodante)
    // o "cada año en esta fecha" (campaña anual, que es como las empresas hacen la reinduccion).
    //
    // `onExpiry` viaja con la recurrencia porque es donde el motor la lee, pero la decide el TIPO:
    // que pasa cuando llega la ronda siguiente y la anterior no se hizo es politica de la empresa.
    const onExpiry = config.defaultOnExpiry ?? 'ESPERA';
    // Igual que `onExpiry`: lo decide el TIPO y viaja con la recurrencia, que es donde el motor lo
    // lee. Quien ingreso hace menos de N meses no entra al ciclo — su induccion es su actualizacion
    // de ese año (ver `exemptRecentHiresMonths` en el esquema del tipo).
    const exemptRecentHiresMonths = config.exemptRecentHiresMonths ?? 0;
    const recurrence = esDelPlan
      ? null
      : input.fixedDate
        ? { fixedDate: input.fixedDate, windowDays: 60, onExpiry, exemptRecentHiresMonths }
        : input.everyMonths
          ? { everyMonths: input.everyMonths, windowDays: 60, onExpiry, exemptRecentHiresMonths }
          : null;

    if (existing) {
      /*
        VOLVER A MANDAR LO MISMO NO ES UN CAMBIO.

        La pestana Quienes abre con los cargos que ya estan marcados, asi que anadir el cuarto
        reenvia tambien los tres de antes. Si cada uno de esos tres contara como modificacion,
        anadir un cargo pediria una novedad por los que no se han tocado — y el usuario acabaria
        escribiendo "sin cambios" para poder pasar, que es como se vacia de sentido un registro de
        auditoria. Idempotente: si no cambia nada, no se toca nada y no se pide nada.
      */
      const igual =
        existing.active &&
        existing.trigger === trigger &&
        (existing.dueDaysAfterTrigger ?? 0) === dueDaysAfterTrigger &&
        JSON.stringify(existing.recurrence ?? null) === JSON.stringify(recurrence ?? null);
      if (igual) {
        return {
          ruleId: existing.id,
          audienceId: audience.id,
          audienceName: audience.name,
          created: 0,
          updated: true as const,
        };
      }

      /*
        LA NOVEDAD, EXIGIDA DONDE DE VERDAD HACE FALTA (2026-09-03).

        Era un asterisco que solo vivia en el navegador: el esquema la acepta vacia, asi que una
        llamada directa a la API —o una pantalla vieja— guardaba sin motivo. Un control de auditoria
        que solo esta en la pantalla no es un control.

        Y se pide SOLO AL CAMBIAR algo que ya estaba, que es lo que la palabra significa. Declarar
        por primera vez que una induccion especifica se le exige a un cargo es MONTAR la matriz, no
        modificarla: en la carga inicial del piloto son decenas de casillas seguidas y no hay
        ninguna novedad que contar —el alta queda igualmente auditada como ASSIGNMENT_RULE_CREATED—.
      */
      /*
        Y SOLO SI ESTA EN VIGOR. Un requisito RETIRADO no se le exige hoy a nadie: la ficha no lo
        enseña y la matriz lo pinta apagado, asi que volver a encenderlo es declarar, no modificar.
        Pedir novedad ahi era pedir explicaciones por cambiar algo que la pantalla dice que no
        existe — lo destapo la comprobacion automatica, que se comio un 400 al marcar tres cargos
        de los que uno se habia retirado en una corrida anterior.
      */
      if (config.defaultAssignmentMode === 'BY_JOB_TITLE' && existing.active && !input.reason) {
        throw new BadRequestException({
          code: 'REASON_REQUIRED',
          message: 'Cambiar lo que ya se le exige a un cargo pide una novedad: queda en el registro.',
        });
      }

      // La novedad se registra contra la FORMACION, no contra la regla: quien audita pregunta
      // "por que esta formacion se le exige a este cargo", y busca por la formacion.
      if (input.reason) {
        await this.audit.record({
          tenantId,
          userId: actor.id,
          action: 'ACTIVITY_REQUIREMENT_CHANGED',
          resourceType: 'activities',
          resourceId: input.activityId,
          newValues: { audienceId: audience.id, scope: input.scope, reason: input.reason },
        });
      }

      let nacidas = 0;
      const rule = await this.updateRule(actor, existing.id, {
        active: true,
        dueDaysAfterTrigger,
        recurrence,
      });
      /*
        EL DISPARADOR no entra en `updateRule` (no se edita desde Asignaciones), pero aqui SI puede
        haber cambiado: pasar de "al ingresar" a "desde ya" es justo lo que hace falta cuando la
        formacion empieza a exigirse a gente que lleva años en la empresa.

        Y AL HACERLO SE LEVANTA EL "SOLO A QUIEN ENTRE DESDE AHORA" (2026-09-03). Ese corte se pone
        solo al publicar una induccion de INGRESO, y significa "a quien lleva siete años no se le
        pide repetir lo que hizo al entrar". En el momento en que alguien cambia el disparador a
        "al entrar al grupo", esta diciendo lo contrario con todas las letras: que ahora se le exige
        a la gente que ya esta. Dejar el corte puesto convertia ese cambio en un boton que no hacia
        nada — se guardaba, no fallaba, y seguian siendo cero personas.
      */
      if (rule.trigger !== trigger) {
        const levantaElCorte = trigger !== 'ON_HIRE' && rule.appliesFrom !== null;
        await this.prisma.scoped.assignmentRule.update({
          where: { id: rule.id },
          data: { trigger, ...(levantaElCorte ? { appliesFrom: null } : {}) },
        });
        /*
          Y SE VUELVE A GENERAR, porque `updateRule` ya paso con el corte todavia puesto.

          Sin esto, quitar el corte no le crearia la obligacion a nadie hasta que el cron nocturno
          pasara por ahi: quien acaba de decir "ahora se le exige a todos" veria cero, se lo
          creeria, y volveria a intentarlo de otra forma.
        */
        if (levantaElCorte) {
          const generado = await this.engine.generate(this.prisma.scoped, tenantId, { ruleId: rule.id });
          nacidas = generado.created;
        }
      }
      return {
        ruleId: rule.id,
        audienceId: audience.id,
        audienceName: audience.name,
        // Las que nacieron al levantar el corte: decir 0 aqui hacia que la pantalla anunciara
        // "nadie nuevo quedo obligado" justo despues de obligar a setecientas personas.
        created: nacidas,
        updated: true as const,
      };
    }

    // Declararla no PIDE novedad, pero si viene se guarda: quien la escribe esta explicando algo.
    if (input.reason) {
      await this.audit.record({
        tenantId,
        userId: actor.id,
        action: 'ACTIVITY_REQUIREMENT_CHANGED',
        resourceType: 'activities',
        resourceId: input.activityId,
        newValues: { audienceId: audience.id, scope: input.scope, reason: input.reason },
      });
    }

    const outcome = await this.createRule(actor, {
      audienceId: audience.id,
      targetType: 'ACTIVITY',
      targetId: input.activityId,
      trigger,
      dueDaysAfterTrigger,
      recurrence,
      // "Solo a quien entre desde ahora" se traduce a la fecha de este momento: quien ya estaba
      // en la audiencia entro antes y no queda obligado.
      appliesFrom: input.soloNuevos ? new Date() : null,
      // Solo al CREAR. Si la regla ya existia, mas arriba se actualiza sin tocar su origen: la
      // declaro alguien sobre la formacion y que un programa la reutilice no cambia ese hecho.
      sourcePathId: origen?.pathId ?? null,
    });
    return {
      ruleId: outcome.rule.id,
      audienceId: audience.id,
      audienceName: audience.name,
      created: outcome.generated,
      updated: false as const,
    };
  }

  /** Retirar un requisito desde la ficha. Lo pendiente queda RETIRADO; lo cumplido no se toca. */
  async retireActivityRequirement(actor: AuthUser, ruleId: string) {
    const rule = await this.prisma.scoped.assignmentRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });
    await this.updateRule(actor, ruleId, { active: false });
    return { ok: true as const };
  }

  /**
   * La audiencia del alcance. Delega en `AudiencesService`, que es donde vive desde que la
   * convocatoria tambien la necesita para declarar su tajada: dos implementaciones crearian
   * audiencias gemelas para el mismo grupo.
   */
  private findOrCreateAudience(tenantId: string, scope: AudienceRule) {
    return this.audiences.findOrCreate(tenantId, scope);
  }

  private fixedDateOf(recurrence: Prisma.JsonValue | null): string | null {
    if (!recurrence || typeof recurrence !== "object" || Array.isArray(recurrence)) return null;
    const value = (recurrence as Record<string, unknown>).fixedDate;
    return typeof value === "string" ? value : null;
  }

  private everyMonthsOf(recurrence: Prisma.JsonValue | null): number | null {
    if (!recurrence || typeof recurrence !== 'object' || Array.isArray(recurrence)) return null;
    const value = (recurrence as Record<string, unknown>).everyMonths;
    return typeof value === 'number' ? value : null;
  }

  // ─────────────────────────── Asignacion manual ───────────────────────────

  /**
   * Asignacion puntual: a personas o a todo un cargo, area o regional (se expande a personas,
   * porque la obligacion siempre es de alguien concreto). No pisa lo que ya esta vivo.
   */
  async createManual(actor: AuthUser, input: CreateAssignmentInput) {
    const tenantId = this.prisma.currentTenantId;
    await this.assertTargetExists(input.targetType, input.targetId);

    // Los CRITERIOS se cruzan (Y), las personas sueltas se SUMAN (O).
    //
    // Antes todo iba en un solo OR, y eso convertia "auxiliares logisticos DE Antioquia" en
    // "todos los auxiliares logisticos del pais MAS todo el mundo de Antioquia": la formacion le
    // caia a cientos de personas que nadie quiso obligar, y quien la creo no tenia forma de
    // notarlo hasta que le llegaran las quejas.
    //
    // Se reutiliza `buildAudienceWhere` en vez de escribir el filtro otra vez: es la misma
    // pregunta que resuelven las audiencias, y dos implementaciones acabarian discrepando
    // (Decision #37).
    const hasCriteria =
      input.jobTitleIds.length > 0 ||
      input.areaIds.length > 0 ||
      input.regionalIds.length > 0 ||
      input.serviceIds.length > 0;

    const reach: Prisma.UserWhereInput[] = [];
    if (hasCriteria) {
      reach.push(
        buildAudienceWhere({
          match: 'ALL',
          jobTitleIds: input.jobTitleIds,
          jobTitleTypeIds: [],
          areaIds: input.areaIds,
          regionalIds: input.regionalIds,
          serviceIds: input.serviceIds,
          employmentTypes: [],
          roadActors: [],
        }),
      );
    }
    if (input.userIds.length > 0) reach.push({ ...ELIGIBLE_MEMBER, id: { in: input.userIds } });

    const candidates = await this.prisma.scoped.user.findMany({
      where: reach.length === 1 ? reach[0] : { OR: reach },
      select: { id: true, email: true },
    });

    const alreadyObliged = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: OPEN_STATUSES,
        userId: { in: candidates.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const skip = new Set(alreadyObliged.map((a) => a.userId));
    const recipients = candidates.filter((user) => !skip.has(user.id));

    const dueAt = input.dueAt ? endOfDay(this.parseDateOnly(input.dueAt)) : null;
    if (recipients.length > 0) {
      await this.prisma.scoped.assignment.createMany({
        data: recipients.map((user) => ({
          tenantId,
          userId: user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          source: 'MANUAL' as const,
          assignedBy: actor.id,
          cycleNumber: 1,
          dueAt,
          status: 'PENDING' as const,
        })),
      });
    }

    const title = (await this.resolveActivityTitles([input.targetId])).get(input.targetId) ?? 'Actividad formativa';
    for (const user of recipients) {
      await this.notifications.notify(tenantId, {
        eventType: 'ASSIGNMENT_CREATED',
        recipientUserId: user.id,
        recipientEmail: user.email,
        subject: 'Tienes una formacion asignada',
        body: `Se te asigno: ${title}.`,
        // A la FORMACION concreta, no al modulo: "tienes una formacion asignada" y aterrizar
        // en una lista de doce es obligar a buscar lo que el aviso acaba de nombrar.
        referenceType: 'activities',
        referenceId: input.targetId,
      });
    }

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: 'ASSIGNMENTS_CREATED_MANUAL',
      resourceType: 'assignments',
      resourceId: input.targetId,
      newValues: { created: recipients.length, skipped: skip.size, dueAt: input.dueAt ?? null },
    });
    return { created: recipients.length, skipped: skip.size };
  }

  async list(query: ListAssignmentsQuery) {
    const where: Prisma.AssignmentWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.overdueOnly === 'true' ? { status: 'OVERDUE' } : {}),
      ...(query.areaId || query.jobTitleId || query.q
        ? {
            user: {
              ...(query.areaId ? { areaId: query.areaId } : {}),
              ...(query.jobTitleId ? { jobTitleId: query.jobTitleId } : {}),
              ...(query.q
                ? {
                    OR: [
                      { fullName: { contains: query.q, mode: 'insensitive' as const } },
                      { documentNumber: { contains: query.q } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.scoped.assignment.count({ where }),
      this.prisma.scoped.assignment.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { assignedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          source: true,
          cycleNumber: true,
          dueAt: true,
          status: true,
          assignedAt: true,
          completedAt: true,
          // HASTA CUANDO VALE DE VERDAD, cuando lo dice el papel de un tercero (Decision #157).
          // Sin esto la pantalla enseñaria el vencimiento que calcula la recurrencia sobre alguien
          // cuyo certificado dice otra fecha — y es la fecha del papel la que manda.
          validUntilOverride: true,
          waivedReason: true,
          user: {
            select: {
              id: true,
              fullName: true,
              documentNumber: true,
              jobTitle: { select: { name: true } },
              area: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const ids = items.map((i) => i.targetId);
    const [titles, tipos, programas] = await Promise.all([
      this.resolveActivityTitles(ids),
      this.resolveActivityTypes(ids),
      this.resolveProgramasDeActividad(ids),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: items.map((item) => ({
        ...item,
        targetName: titles.get(item.targetId) ?? null,
        // El tipo viaja para que el expediente pueda mirar solo una familia —sus inducciones— sin
        // romper el orden cronologico. Ver `resolveActivityTypes`.
        tipo: tipos.get(item.targetId) ?? null,
        // Y de que programa es modulo, si lo es: explica por que esa formacion no tiene papel propio.
        programas: programas.get(item.targetId) ?? [],
      })),
    };
  }

  /** Eximir: la obligacion deja de contar, pero queda con motivo y autor para el auditor. */
  async waive(actor: AuthUser, id: string, input: WaiveAssignmentInput) {
    const assignment = await this.prisma.scoped.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND' });
    if (assignment.status === 'COMPLETED') {
      throw new ConflictException({ code: 'ASSIGNMENT_ALREADY_COMPLETED' });
    }

    const updated = await this.prisma.scoped.assignment.update({
      where: { id },
      data: { status: 'WAIVED', waivedBy: actor.id, waivedReason: input.waivedReason },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'ASSIGNMENT_WAIVED',
      resourceType: 'assignments',
      resourceId: id,
      oldValues: { status: assignment.status },
      newValues: { status: 'WAIVED', waivedReason: input.waivedReason },
    });
    return updated;
  }

  // ─────────────────────────── Apoyo ───────────────────────────

  private async assertTargetExists(targetType: string, targetId: string): Promise<void> {
    if (targetType !== 'ACTIVITY') {
      // Rutas y certificaciones existen en el modelo; su motor llega en sprints posteriores.
      throw new ConflictException({
        code: 'TARGET_TYPE_NOT_SUPPORTED',
        message: 'Por ahora solo se exigen actividades formativas.',
      });
    }
    const activity = await this.prisma.scoped.activity.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
  }

  private async resolveActivityTitles(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const activities = await this.prisma.scoped.activity.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(activities.map((a) => [a.id, a.name]));
  }

  /**
   * EL TIPO DE CADA FORMACION, por su id (2026-09-17).
   *
   * Lo pide el expediente de una persona, para poder mirar **solo sus inducciones** sin perder el
   * orden cronologico. Se devuelve el NOMBRE que el tenant le puso al tipo y no una familia
   * deducida: el modelo no tiene ninguna marca de "esto es una induccion", y adivinarla por el
   * nombre o por el codigo es justo lo que se decidio no hacer (ver `PENDIENTES` 11.7) — los dos
   * son datos del tenant y mentirian en cuanto alguien renombrara algo.
   */
  private async resolveActivityTypes(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const activities = await this.prisma.scoped.activity.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, activityType: { select: { name: true } } },
    });
    return new Map(activities.map((a) => [a.id, a.activityType.name]));
  }

  /**
   * DE QUE PROGRAMAS ES MODULO CADA FORMACION (2026-09-17).
   *
   * Lo pide el expediente de una persona: al recorrer su trayectoria, una formacion suelta y un
   * modulo de un programa se leen igual, y **no son lo mismo** — la del modulo no emite constancia
   * propia mientras el programa este publicado, asi que quien busca su papel y no lo encuentra
   * necesita ver que pertenece a un conjunto y que el papel es el del conjunto.
   *
   * Solo PUBLICADOS: un borrador no compromete a nadie y no suprime nada, asi que nombrarlo aqui
   * seria contar algo que todavia no pasa. Mismo criterio que `esModuloDeUnProgramaPublicado`.
   */
  private async resolveProgramasDeActividad(ids: string[]): Promise<Map<string, string[]>> {
    if (ids.length === 0) return new Map();
    const items = await this.prisma.scoped.pathItem.findMany({
      where: { itemType: 'ACTIVITY', itemId: { in: [...new Set(ids)] }, path: { status: 'PUBLISHED' } },
      select: { itemId: true, path: { select: { name: true } } },
    });
    const porActividad = new Map<string, string[]>();
    for (const item of items) {
      const actual = porActividad.get(item.itemId) ?? [];
      if (!actual.includes(item.path.name)) actual.push(item.path.name);
      porActividad.set(item.itemId, actual);
    }
    return porActividad;
  }

  /** AAAA-MM-DD de la UI a fecha civil, sin pasar por instantes (evita correrla un dia). */
  private parseDateOnly(value: string): CalendarDate {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    return { year, month, day };
  }
}
