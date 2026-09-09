import { Injectable, Logger } from '@nestjs/common';
import type { AssignmentRule, Prisma } from '@prisma/client';
import { recurrenceSchema, type Recurrence } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService, type TenantPrisma } from '../prisma/prisma.service.js';
import { AudiencesService } from './audiences.service.js';
import {
  computeFirstDueAt,
  cycleOpensAt,
  proximoVencimiento,
  type RondaCumplida,
  type Trigger,
} from './due-date.js';
import { decidirPrimeraRonda, decidirRondaSiguiente } from './next-cycle.js';

export interface EngineSummary {
  audiencesJoined: number;
  audiencesLeft: number;
  created: number;
  cyclesOpened: number;
  overdue: number;
  withdrawn: number;
}

interface CreatedAssignment {
  userId: string;
  targetId: string;
  dueAt: Date | null;
}

const EMPTY_SUMMARY: EngineSummary = {
  audiencesJoined: 0,
  audiencesLeft: 0,
  created: 0,
  cyclesOpened: 0,
  overdue: 0,
  withdrawn: 0,
};

/**
 * MOTOR DE REQUISITOS (Decision #12).
 *
 * Un requisito no es una lista de tareas: es una obligacion VIVA en el tiempo. El motor la
 * traduce a obligaciones concretas por persona y por ronda:
 *
 *   1. quien entro a la audiencia y aun no tiene la obligacion  -> nace la ronda 1
 *   2. quien completo la ronda anterior y el requisito se repite -> nace la ronda N+1
 *      (cuando falta poco para vencer, no el mismo dia)
 *   3. lo que paso de fecha                                      -> queda VENCIDO
 *   4. quien salio de la audiencia                               -> se RETIRA lo pendiente
 *                                                                   (nunca se borra, Decision #11)
 *
 * Es idempotente a proposito: correrlo dos veces no duplica nada (indice unico
 * regla+persona+ronda y `skipDuplicates`). Lo ejecuta el cron y tambien el alta de una persona.
 */
@Injectable()
export class RequirementEngineService {
  private readonly logger = new Logger(RequirementEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudiencesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Pasada completa del tenant (cron). */
  async syncTenant(tenantId: string): Promise<EngineSummary> {
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.reevaluateAll(db, tenantId);
    const generated = await this.generate(db, tenantId, {});
    const overdue = await this.markOverdue(db);
    const withdrawn = await this.withdrawLeavers(db);
    return {
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
      overdue,
      withdrawn,
    };
  }

  /**
   * Sincronizacion de UNA persona: es el enganche del alta y del cambio de cargo. Aqui esta el
   * criterio de aceptacion del sprint: al entrar alguien, sus obligaciones nacen solas.
   */
  async syncPerson(tenantId: string, userId: string): Promise<EngineSummary> {
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.syncPerson(db, tenantId, userId);
    const generated = await this.generate(db, tenantId, { userIds: [userId] });
    const withdrawn = await this.withdrawLeavers(db, userId);
    return {
      ...EMPTY_SUMMARY,
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
      withdrawn,
    };
  }

  /**
   * Sincronizacion de un LOTE (carga masiva). Recalcula las audiencias de una pasada en vez de
   * persona por persona: con 300 altas, una consulta por audiencia es mucho mas barato que 300
   * recorridos de todas las audiencias.
   */
  async syncPeople(tenantId: string, userIds: string[]): Promise<EngineSummary> {
    if (userIds.length === 0) return { ...EMPTY_SUMMARY };
    const db = this.prisma.forTenant(tenantId);
    const audienceResult = await this.audiences.reevaluateAll(db, tenantId);
    const generated = await this.generate(db, tenantId, { userIds });
    return {
      ...EMPTY_SUMMARY,
      audiencesJoined: audienceResult.joined,
      audiencesLeft: audienceResult.left,
      created: generated.created,
      cyclesOpened: generated.cyclesOpened,
    };
  }

  /** Igual que `syncPeople` pero sin tumbar el flujo que la llamo si algo falla. */
  async syncPeopleSafely(tenantId: string, userIds: string[]): Promise<void> {
    try {
      await this.syncPeople(tenantId, userIds);
    } catch (error) {
      this.logger.error(`No se pudieron generar las obligaciones del lote (${userIds.length})`, error as Error);
    }
  }

  /** Igual que `syncPerson` pero sin tumbar el flujo que la llamo si algo falla. */
  /**
   * Genera las obligaciones de una persona SIN tumbar la operacion que la creo.
   *
   * Tragarse el error es deliberado: dar de alta a alguien no puede fallar porque el motor falle.
   * Lo que NO puede quedarse dentro es la noticia. Antes la unica huella era una linea de log, que
   * en la practica es no enterarse: la persona quedaba creada, sin obligaciones y sin nada que
   * mirar despues. Ahora queda una fila de auditoria, que es donde se buscan las cosas raras.
   */
  async syncPersonSafely(tenantId: string, userId: string): Promise<void> {
    try {
      await this.syncPerson(tenantId, userId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudieron generar las obligaciones de ${userId}: ${reason}`, error as Error);
      await this.audit
        .record({
          tenantId,
          userId,
          action: 'OBLIGATIONS_SYNC_FAILED',
          resourceType: 'users',
          resourceId: userId,
          newValues: { reason },
        })
        // Si hasta la auditoria falla, no se puede hacer mas que no empeorarlo.
        .catch(() => undefined);
    }
  }

  /** Genera las obligaciones que falten para los requisitos activos. */
  async generate(
    db: TenantPrisma,
    tenantId: string,
    options: { userIds?: string[]; ruleId?: string },
  ): Promise<{ created: number; cyclesOpened: number }> {
    /**
     * Las reglas con disparador PLAN NO se materializan aqui (Decision #76).
     *
     * Guardan A QUIENES se le va a exigir una capacitacion del plan —que es una decision del
     * analista y hay que poder consultarla antes de aprobar— pero no generan nada por su cuenta:
     * las obligaciones nacen una sola vez, al aprobar el renglon, con el vencimiento del mes.
     *
     * Si generaran, pasarian las dos cosas que este producto no puede permitirse: cada persona
     * tendria DOS obligaciones de la misma formacion con dos vencimientos que compiten, y quien
     * ingresara en septiembre entraria en la jornada de marzo, que es exactamente lo que la regla
     * de oro 2 existe para impedir.
     */
    const rules = await db.assignmentRule.findMany({
      where: {
        active: true,
        trigger: { not: 'PLAN' },
        ...(options.ruleId ? { id: options.ruleId } : {}),
        audience: { active: true },
      },
    });

    const created: CreatedAssignment[] = [];
    let cyclesOpened = 0;

    for (const rule of rules) {
      const outcome = await this.generateForRule(db, tenantId, rule, options.userIds);
      created.push(...outcome.created);
      cyclesOpened += outcome.cyclesOpened;
    }

    if (created.length > 0) {
      await this.announce(db, tenantId, created);
    }
    return { created: created.length, cyclesOpened };
  }

  private async generateForRule(
    db: TenantPrisma,
    tenantId: string,
    rule: AssignmentRule,
    userIds?: string[],
  ): Promise<{ created: CreatedAssignment[]; cyclesOpened: number }> {
    const members = await db.audienceMember.findMany({
      where: {
        audienceId: rule.audienceId,
        leftAt: null,
        // "Solo a quien entre desde ahora": el requisito no alcanza a quien ya estaba en la
        // audiencia antes de esa fecha. Es lo que permite estrenar el sistema sin dejarle 116
        // inducciones pendientes a gente que ya las hizo en papel hace años.
        ...(rule.appliesFrom ? { joinedAt: { gte: rule.appliesFrom } } : {}),
        ...(userIds ? { userId: { in: userIds } } : {}),
      },
      select: { userId: true, joinedAt: true, user: { select: { hiredAt: true } } },
    });
    if (members.length === 0) return { created: [], cyclesOpened: 0 };

    const existing = await db.assignment.findMany({
      where: { ruleId: rule.id, userId: { in: members.map((m) => m.userId) } },
      select: {
        userId: true,
        cycleNumber: true,
        status: true,
        dueAt: true,
        completedAt: true,
        validUntilOverride: true,
      },
      orderBy: { cycleNumber: 'asc' },
    });
    const byUser = new Map<string, typeof existing>();
    for (const row of existing) {
      const rows = byUser.get(row.userId) ?? [];
      rows.push(row);
      byUser.set(row.userId, rows);
    }

    const recurrence = this.parseRecurrence(rule.recurrence);
    const now = new Date();

    // Quien no tiene historia con ESTA regla puede tener la formacion hecha por OTRA: es el caso
    // del cambio de cargo cuando la matriz repite una formacion en varios puestos. Se pregunta una
    // sola vez y solo por ellos — en la pasada de rutina esa lista esta vacia y no cuesta ni una
    // consulta. Ver `decidirPrimeraRonda`.
    const sinHistoria = members.filter((m) => !byUser.has(m.userId)).map((m) => m.userId);
    const [yaLaHizo, yaLaDebe] = await Promise.all([
      this.completadaPorOtraRegla(db, rule, sinHistoria),
      this.abiertaPorOtraRegla(db, rule, sinHistoria),
    ]);
    const rows: Prisma.AssignmentCreateManyInput[] = [];
    const created: CreatedAssignment[] = [];
    /** Rondas que cerraron sin hacerse y hay que marcar antes de abrir la siguiente. */
    const aCerrar: Array<{ userId: string; cycleNumber: number }> = [];
    let cyclesOpened = 0;

    /*
      QUIEN ACABA DE INGRESAR NO ENTRA A LA CAMPANA (2026-09-04).

      La reinduccion alcanzaba tambien a quien entro la semana pasada y todavia esta haciendo su
      induccion: se le encimaba la actualizacion del año sobre una induccion a medio hacer. Es
      redundante —**su induccion ES su actualizacion de ese año**— y lo habitual en las empresas es
      dejar fuera del ciclo a quien ingreso dentro de el.

      Sin esto habia que eximir a mano a cada ingreso reciente: ~50 al año en TRANSPRENSA, cada uno
      con su motivo escrito para decir cincuenta veces lo mismo.

      Solo afecta a la PRIMERA ronda de esa persona: quien ya tiene historia con la regla sigue su
      ciclo normal, porque a el la campaña anterior si le toco. Y solo excluye a quien tiene fecha
      de ingreso registrada — sin ella no se puede saber si es reciente, y en la duda se exige, que
      es la direccion que protege el registro.
    */
    const mesesDeGracia = recurrence?.exemptRecentHiresMonths ?? 0;
    const cortePorIngreso =
      mesesDeGracia > 0 ? new Date(new Date(now).setMonth(now.getMonth() - mesesDeGracia)) : null;

    for (const member of members) {
      const history = byUser.get(member.userId) ?? [];

      if (cortePorIngreso && history.length === 0 && member.user.hiredAt && member.user.hiredAt > cortePorIngreso) {
        continue;
      }

      if (history.length === 0) {
        /*
          YA LA DEBE POR OTRA REGLA (`PENDIENTES` 4.1, cerrado el 2026-09-08).

          Una formacion exigida por DOS reglas vivas —solo posible en los tipos de alcance MANUAL,
          donde se puede exigir a un cargo Y a un area que se solapan— le nacia DOS VECES a la misma
          persona: la segunda regla no tiene historia suya y le abria su ronda 1 sin mirar si ya
          debia esa misma formacion por otra parte.

          Lo que se veia: dos filas identicas en sus pendientes, y en el informe de cumplimiento un
          denominador inflado —una persona contada dos veces por la misma formacion— que hace bajar
          el porcentaje sin que nadie haya dejado de hacer nada.

          Se salta la creacion y no se toca la que ya existe: es la mas antigua, puede tener ya una
          inscripcion colgando, y elegir cual sobrevive por la fecha de la regla seria arbitrario.
          Si aquella se retira despues —porque la persona sale de SU audiencia— esta pasada la
          vuelve a crear, que es justo lo que tiene que pasar: la obligacion sigue viva por esta
          regla.
        */
        if (yaLaDebe.has(member.userId)) continue;

        /*
          YA LA HIZO POR OTRA REGLA (2026-09-05).

          Sin esto, quien COMPLETO una formacion y cambia a otro cargo que exige LA MISMA la vuelve
          a deber: la regla del cargo nuevo no tiene historia suya y le abre la ronda 1 como si
          nunca la hubiera hecho. En su pantalla aparece una formacion que hizo el mes pasado, con
          constancia emitida, y no hay nada que se lo explique.

          La decision —no le nace, le nace con SU vencimiento, o le nace como a cualquiera— es
          logica pura y vive en `decidirPrimeraRonda`.
        */
        const primera = decidirPrimeraRonda({
          cumplida: yaLaHizo.get(member.userId) ?? null,
          recurrencia: recurrence,
          ahora: now,
        });
        if (!primera.abrir) continue;
        if (primera.venceEl) {
          rows.push(this.newRow(tenantId, rule, member.userId, 1, primera.venceEl));
          created.push({ userId: member.userId, targetId: rule.targetId, dueAt: primera.venceEl });
          continue;
        }

        const dueAt = computeFirstDueAt(rule.trigger as Trigger, rule.dueDaysAfterTrigger ?? 0, {
          hiredAt: member.user.hiredAt,
          joinedAt: member.joinedAt,
          // La obligacion no puede vencer antes de que existiera la regla que la crea: las
          // audiencias se REUTILIZAN entre formaciones y pueden llevar meses creadas, y sin esto
          // toda la plantilla quedaba obligada con una fecha ya pasada (ver `computeFirstDueAt`).
          ruleCreatedAt: rule.createdAt,
          recurrence,
        });
        rows.push(this.newRow(tenantId, rule, member.userId, 1, dueAt));
        created.push({ userId: member.userId, targetId: rule.targetId, dueAt });
        continue;
      }

      if (!recurrence) continue;

      const last = history[history.length - 1];
      if (!last) continue;

      /*
        LA ANTERIOR NO SE HIZO: LAS TRES SALIDAS (2026-09-03).

        Antes solo habia una —no abrir nada hasta que la anterior quedara CUMPLIDA— y tiene un
        efecto que casi nadie quiere: **quien nunca la hace desaparece del denominador de todos los
        años siguientes**. El peor incumplidor sale de la cuenta y la cobertura del año que viene
        se ve mejor de lo que es. Para una campaña de calendario eso es un indicador que miente.

        Ahora lo decide la empresa, en el tipo de formacion:

          ESPERA   como antes: no nace la siguiente hasta que haga la anterior.
          ACUMULA  nace la siguiente Y la anterior sigue pendiente: debe las dos.
          CIERRA   la anterior se cierra como NO REALIZADA —que SI cuenta como incumplimiento de
                   ese periodo, a diferencia de retirada o eximida— y la siguiente nace para todos.
                   Es como funciona el cumplimiento por calendario: cada campaña es su periodo.
      */
      // TRES COSAS EN UNA LINEA, y ninguna es intercambiable (`proximoVencimiento`):
      //   - si hay PAPEL de un tercero, manda el papel;
      //   - si no, una CAMPANA se cuenta desde el vencimiento del periodo que se cumplio;
      //   - y un ANIVERSARIO desde la fecha en que cada quien la completo.
      const nextDueAt = proximoVencimiento(recurrence, last, now);
      const decision = decidirRondaSiguiente({
        estadoAnterior: last.status,
        politica: recurrence.onExpiry ?? 'ESPERA',
        ventanaAbierta: now >= cycleOpensAt(nextDueAt, recurrence),
      });
      if (!decision.abrir) continue;

      // Se cierra la que quedo sin hacer ANTES de abrir la nueva.
      if (decision.cerrarAnterior) aCerrar.push({ userId: member.userId, cycleNumber: last.cycleNumber });

      rows.push(this.newRow(tenantId, rule, member.userId, last.cycleNumber + 1, nextDueAt));
      created.push({ userId: member.userId, targetId: rule.targetId, dueAt: nextDueAt });
      cyclesOpened += 1;
    }

    if (aCerrar.length > 0) {
      await db.assignment.updateMany({
        where: {
          ruleId: rule.id,
          status: { in: ['PENDING', 'OVERDUE'] },
          OR: aCerrar.map((fila) => ({ userId: fila.userId, cycleNumber: fila.cycleNumber })),
        },
        data: { status: 'EXPIRED_NOT_DONE' },
      });
    }

    if (rows.length > 0) {
      // skipDuplicates + indice unico (regla, persona, ronda): dos ejecuciones simultaneas del
      // cron y del alta no pueden crear la misma obligacion dos veces.
      await db.assignment.createMany({ data: rows, skipDuplicates: true });
    }
    return { created, cyclesOpened };
  }

  /**
   * La ULTIMA vez que cada una de estas personas completo esta misma formacion.
   *
   * Se busca por FORMACION, no por regla: el punto es justamente que la evidencia la dejo otra
   * —el cargo anterior, el plan, una asignacion suelta—. No hace falta excluir la regla actual
   * porque solo se pregunta por quienes no tienen ninguna fila suya.
   *
   * Solo cuenta lo CUMPLIDO. Una eximida o una retirada no son evidencia de que la persona sepa
   * hacer el trabajo: son la explicacion de por que no se le exigio, y esa explicacion pertenece
   * al cargo donde se escribio.
   */
  /**
   * QUIEN YA DEBE ESTA MISMA FORMACION POR OTRA REGLA (o a mano).
   *
   * Se pregunta solo por quienes no tienen historia con ESTA regla: en la pasada de rutina esa lista
   * esta vacia y no cuesta ni una consulta.
   *
   * Cuenta cualquier obligacion VIVA del mismo objetivo, venga de la regla que venga —incluida la
   * asignada a mano, que tiene `ruleId` nulo—: para la persona son la misma formacion pendiente, y
   * de donde salio no cambia que solo se hace una vez.
   */
  private async abiertaPorOtraRegla(
    db: TenantPrisma,
    rule: AssignmentRule,
    userIds: string[],
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const filas = await db.assignment.findMany({
      where: {
        userId: { in: userIds },
        targetType: rule.targetType,
        targetId: rule.targetId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
      },
      select: { userId: true },
    });
    return new Set(filas.map((fila) => fila.userId));
  }

  private async completadaPorOtraRegla(
    db: TenantPrisma,
    rule: AssignmentRule,
    userIds: string[],
  ): Promise<Map<string, RondaCumplida>> {
    if (userIds.length === 0) return new Map();
    const filas = await db.assignment.findMany({
      where: {
        userId: { in: userIds },
        targetType: rule.targetType,
        targetId: rule.targetId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: { userId: true, completedAt: true, dueAt: true, validUntilOverride: true },
      orderBy: { completedAt: 'desc' },
    });
    const ultima = new Map<string, RondaCumplida>();
    for (const fila of filas) {
      if (!ultima.has(fila.userId)) {
        ultima.set(fila.userId, {
          completedAt: fila.completedAt,
          dueAt: fila.dueAt,
          validUntilOverride: fila.validUntilOverride,
        });
      }
    }
    return ultima;
  }

  private newRow(
    tenantId: string,
    rule: AssignmentRule,
    userId: string,
    cycleNumber: number,
    dueAt: Date,
  ): Prisma.AssignmentCreateManyInput {
    return {
      tenantId,
      userId,
      targetType: rule.targetType,
      targetId: rule.targetId,
      source: 'RULE',
      ruleId: rule.id,
      cycleNumber,
      dueAt,
      status: 'PENDING',
    };
  }

  /** Lo que paso de fecha queda VENCIDO: el indicador de cumplimiento no se infla solo. */
  async markOverdue(db: TenantPrisma): Promise<number> {
    const result = await db.assignment.updateMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });
    return result.count;
  }

  /**
   * Quien salio de la audiencia (cambio de cargo, retiro) deja de estar obligado. Lo PENDIENTE
   * se retira con motivo; lo que ya estaba EN CURSO se respeta, porque hay trabajo hecho.
   */
  async withdrawLeavers(db: TenantPrisma, userId?: string): Promise<number> {
    /*
      SOLO LAS REGLAS QUE TIENEN ALGO QUE RETIRAR (2026-09-03).

      Antes se recorrian TODAS las reglas del tenant, activas o no, y por cada una se hacian dos
      consultas. En la base de desarrollo hay 569 reglas —diez de verdad y el resto residuo de las
      corridas de pruebas—, asi que dar de alta a UNA persona costaba mas de mil viajes a la base
      para no hacer nada en 559 de ellos. Medido: 1.680 transacciones por alta.

      Una regla sin obligaciones PENDIENTES ni VENCIDAS no puede retirar ninguna, asi que saltarsela
      no cambia el resultado: se pregunta primero cuales tienen algo, y se recorren solo esas. Con
      una persona son dos o tres; en la pasada global, las que de verdad tengan pendientes.

      No se filtra por regla ACTIVA a proposito: una regla desactivada tambien tiene que retirar lo
      que dejo pendiente, y ese es justo el caso que el bloque de abajo distingue.
    */
    const conPendientes = await db.assignment.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        ruleId: { not: null },
        ...(userId ? { userId } : {}),
      },
      select: { ruleId: true },
      distinct: ['ruleId'],
    });
    const idsConPendientes = conPendientes
      .map((fila) => fila.ruleId)
      .filter((id): id is string => id !== null);
    if (idsConPendientes.length === 0) return 0;

    const rules = await db.assignmentRule.findMany({
      where: { id: { in: idsConPendientes } },
      select: { id: true, audienceId: true, active: true },
    });
    let withdrawn = 0;
    for (const rule of rules) {
      const where = {
        ruleId: rule.id,
        status: { in: ['PENDING' as const, 'OVERDUE' as const] },
        ...(userId ? { userId } : {}),
        ...(rule.active
          ? { user: { audienceMembers: { none: { audienceId: rule.audienceId, leftAt: null } } } }
          : {}),
      };

      // A QUIEN se le retira y DE QUE, antes de retirarlo: hace falta para apagar sus avisos, y
      // despues del update ya no hay forma de saberlo sin volver a adivinar.
      const afectados = await db.assignment.findMany({ where, select: { userId: true, targetId: true } });

      const result = await db.assignment.updateMany({ where, data: { status: 'WITHDRAWN_LEFT_AUDIENCE' } });
      withdrawn += result.count;

      // EL AVISO DE ALGO QUE YA NO SE EXIGE DEJA DE PEDIR ATENCION. Este es exactamente el caso
      // que confundio al cliente: la campaña decia "se te asigno X", X ya no estaba entre sus
      // pendientes, y el aviso seguia sin leer reclamandolo. Se marca leido —no se borra: eso lo
      // hace el ciclo de retencion a los 30 dias— porque mientras tanto es la unica frase que
      // explica por que alguien creyo tener esa formacion.
      /*
        DOS LISTAS, NO UN `OR` DE MIL CLAUSULAS (2026-09-04).

        Esto era `OR: afectados.map(...)`, un par (persona, formacion) por cada obligacion retirada.
        Con un requisito de toda la empresa son MIL PARES en una sola condicion, y Postgres tiene
        que evaluar esa expresion booleana entera.

        MEDIDO con 1.116 personas: **crear el requisito 1,0 s; retirarlo 61,1 s**. Sesenta veces mas
        lento deshacer que hacer, para la operacion inversa — y en la pantalla es un boton apagado
        un minuto, sin nada que explique la espera.

        El `OR` ademas no hacia falta: el bucle va POR REGLA, y todas las obligaciones de una regla
        apuntan a la misma formacion (`newRow` copia `rule.targetId`). Asi que el producto cartesiano
        de las dos listas es exactamente el mismo conjunto, no una aproximacion mas ancha.

        Es la tercera vez que este patron muerde en el proyecto: `syncPerson` con un INSERT por
        audiencia (9,0 s -> 0,4 s) y `withdrawLeavers` recorriendo 569 reglas. Siempre igual —
        algo por fila donde cabe algo por lote.
      */
      if (afectados.length > 0) {
        const personas = [...new Set(afectados.map((fila) => fila.userId))];
        const formaciones = [...new Set(afectados.map((fila) => fila.targetId))];
        await db.notification.updateMany({
          where: {
            channel: 'IN_APP',
            readAt: null,
            referenceType: 'activities',
            recipientUserId: { in: personas },
            referenceId: { in: formaciones },
          },
          data: { readAt: new Date() },
        });
      }
    }
    return withdrawn;
  }

  /**
   * UN aviso por persona con todo lo que le nacio, no uno por obligacion: una carga masiva de
   * 300 personas no puede convertirse en 300 correos por cabeza.
   */
  private async announce(db: TenantPrisma, tenantId: string, created: CreatedAssignment[]): Promise<void> {
    const titleById = await this.resolveTargetTitles(db, [...new Set(created.map((c) => c.targetId))]);
    const byUser = new Map<string, CreatedAssignment[]>();
    for (const item of created) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }

    const users = await db.user.findMany({
      where: { id: { in: [...byUser.keys()] } },
      select: { id: true, email: true },
    });

    // UN SOLO viaje para todos los avisos. Uno por uno costaba una transaccion con `set_config`
    // por persona, y exigir una formacion a toda la empresa se iba a mas de 40 segundos: la
    // pantalla parecia colgada y el resultado solo aparecia al salir y volver.
    await this.notifications.notifyMany(
      tenantId,
      users.map((user) => {
        const items = byUser.get(user.id) ?? [];
        const titles = items.map((i) => titleById.get(i.targetId) ?? 'Actividad formativa').slice(0, 5);
        const extra = items.length > titles.length ? ` y ${items.length - titles.length} mas` : '';
        return {
          eventType: 'ASSIGNMENT_CREATED' as const,
          recipientUserId: user.id,
          recipientEmail: user.email,
          subject: items.length === 1 ? 'Tienes una formacion asignada' : `Tienes ${items.length} formaciones asignadas`,
          body: `Se te asigno: ${titles.join(', ')}${extra}.`,
          // A la FORMACION concreta cuando es UNA. Si el ciclo asigno varias de golpe no hay una
          // sola a la que llevar, y el aviso lleva a Mi formacion, que es donde estan todas.
          referenceType: 'activities',
          referenceId: items.length === 1 ? (items[0]?.targetId ?? null) : null,
        };
      }),
    );
  }

  private async resolveTargetTitles(db: TenantPrisma, targetIds: string[]): Promise<Map<string, string>> {
    const activities = await db.activity.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true },
    });
    return new Map(activities.map((a) => [a.id, a.name]));
  }

  parseRecurrence(raw: Prisma.JsonValue | null): Recurrence | null {
    if (raw === null || raw === undefined) return null;
    const parsed = recurrenceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}
