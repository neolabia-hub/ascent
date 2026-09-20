import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { activityTypeConfigSchema, type AssignProgramInput } from '@neo-pulse/shared';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { AudiencesService } from '../assignments/audiences.service.js';
import type { AuthUser } from '../common/types.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ESTADOS_RETIRADOS } from '../reports/execution-state.js';
import { cicloDePrograma, evaluarPrograma, moduloAprobado, moduloPendiente, type EstadoModulo } from './program-completion.js';

/**
 * PROGRAMAS: varios modulos (formaciones) bajo un solo paraguas, con UNA certificacion para el
 * conjunto (2026-09-14, a peticion del cliente — "programa de induccion general" = un modulo por
 * area, y el certificado prueba que se aprobo la induccion ENTERA, no una de sus partes).
 *
 * REUSA `LearningPath` / `PathItem` / `PathEnrollment`, que existian en el esquema desde el diseño
 * original del dominio (comentario en el propio schema: "F1 lineal; DAG schema-ready") y llevaban
 * DESDE ENTONCES sin una sola linea de codigo que los usara. No se inventa una tabla nueva: se
 * termina de construir la que ya estaba prevista para esto.
 *
 * Un programa es OPCIONAL: una `Activity` que no esta en ningun `PathItem` sigue funcionando
 * exactamente igual que hoy, con su propia certificacion individual. Un plan (`PLAN`), una
 * extraordinaria (`EXTRA`) o una pildora no entran en programas — no porque el modelo lo impida,
 * sino porque agrupar algo que ya certifica por si solo no aporta nada.
 */
@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
    private readonly assignments: AssignmentsService,
    private readonly audiences: AudiencesService,
  ) {}

  /**
   * ¿ESTA FORMACION CERTIFICA SOLA, O SU CERTIFICADO ES EL DEL PROGRAMA? (2026-09-14)
   *
   * Si una `Activity` es modulo de un programa PUBLICADO, su constancia individual **no se emite**
   * — la usa `CompletionService` justo antes de llamar a `certificates.emitirPorEjecucion`. La
   * evidencia que vale es UNA: la del programa completo. Emitir las dos confundiria al auditor con
   * dos papeles que dicen cosas parecidas y ninguno dice "esto es lo que cuenta".
   *
   * SOLO PROGRAMAS PUBLICADOS suprimen la individual, a proposito: mientras un programa esta en
   * borrador no es un compromiso con nadie, y una formacion que hoy no pertenece a nada visible no
   * puede quedarse sin su certificado porque alguien la agrego a un borrador que quiza no se
   * publique nunca.
   *
   * ─── SE PROBO A PREGUNTARLO **POR PERSONA**, Y SE DESHIZO EL MISMO DIA (2026-09-16) ───
   *
   * Queda escrito porque la idea vuelve sola al leer esto, y la respuesta no es obvia.
   *
   * El caso que la motivo: una formacion que ya se le exigia a la audiencia A entra como modulo de
   * un programa que se exige a B. A quien esta en A se le sigue exigiendo esa formacion y NO el
   * resto de modulos, asi que nunca completa el programa: la hace, no recibe la individual
   * —suprimida— y tampoco la del programa. Se queda **sin ningun papel**. La version por persona lo
   * arreglaba emitiendo la individual a quien se le exigen ALGUNOS modulos pero no TODOS.
   *
   * **Se deshizo por su precio, no por su idea.** Traia un modo de fallo NUEVO: las reglas de un
   * programa se crean modulo a modulo, asi que durante ese rato cualquiera cae en "algunos" y se
   * lleva su individual; si despues completa el programa, acaba con dos constancias del mismo
   * esfuerzo. Cambiar una perdida de evidencia por una DUPLICACION de evidencia, en el camino que
   * emite los papeles y que se consulta en CADA cierre de formacion, no es una mejora.
   *
   * Y sobre todo: **el caso de partida requiere una mala configuracion**. Al armar un programa con
   * formaciones que ya se exigian, lo normal es que la audiencia del programa sea la misma que ya
   * tenian —ahi no se pierde nada—; el daño solo aparece si son disjuntas a proposito, que es justo
   * lo que el cliente descarto: *"ese caso de que una formacion individual y por programa este, no
   * creo que pase"*. Su induccion general es UN programa para toda la empresa, y las especificas se
   * quedan como formaciones sueltas con su constancia individual.
   *
   * Asi que la proteccion vive donde no cuesta nada: **la ficha del modulo avisa en ambar** cuando
   * una audiencia suya no alcanza al resto del programa, y dice lo que eso implica. Si algun dia el
   * caso aparece de verdad en un tenant, el arreglo correcto no es este parche sino que
   * `AssignmentRule` sepa DE DONDE viene la obligacion — con eso, "los modulos que el PROGRAMA me
   * exige" se pregunta sin adivinar.
   */
  async esModuloDeUnProgramaPublicado(activityId: string): Promise<boolean> {
    const item = await this.prisma.scoped.pathItem.findFirst({
      where: { itemType: 'ACTIVITY', itemId: activityId, path: { status: 'PUBLISHED' } },
      select: { id: true },
    });
    return item !== null;
  }

  /**
   * ¿DE QUE PROGRAMAS ES MODULO ESTA FORMACION? (2026-09-16)
   *
   * Desde la ficha de una formacion no habia forma de saberlo, y tiene una consecuencia que
   * sorprende: **si es modulo de un programa publicado, deja de emitir constancia individual**.
   * Quien no sabe que esta en un programa no entiende por que su formacion dejo de certificar.
   *
   * Devuelve tambien los programas en BORRADOR, porque tener el modulo ahi metido es informacion
   * util aunque todavia no suprima nada: es lo que va a pasar cuando se publique.
   */
  async programasDeFormacion(activityId: string) {
    const items = await this.prisma.scoped.pathItem.findMany({
      where: { itemType: 'ACTIVITY', itemId: activityId },
      select: { path: { select: { id: true, name: true, status: true } } },
    });
    return items
      .map((item) => item.path)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // ─────────────────────────────── CRUD del programa ───────────────────────────────

  async crear(tenantId: string, data: { code: string; name: string; description?: string | null }) {
    return this.prisma.scoped.learningPath.create({
      data: { tenantId, code: data.code, name: data.name, description: data.description ?? null, status: 'DRAFT', active: true },
    });
  }

  async listar() {
    const programas = await this.prisma.scoped.learningPath.findMany({
      orderBy: { name: 'asc' },
      include: { items: { select: { id: true } } },
    });
    return programas.map((p) => ({ ...p, totalModulos: p.items.length, items: undefined }));
  }

  async obtener(id: string) {
    const programa = await this.prisma.scoped.learningPath.findUnique({
      where: { id },
      include: { items: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!programa) throw new NotFoundException({ code: 'PROGRAM_NOT_FOUND' });

    // El nombre de cada modulo se resuelve aparte: PathItem guarda solo el id (puede apuntar a
    // una Activity o, a futuro, a otro Path) y no tiene sentido duplicar el nombre por valor aqui
    // — a diferencia de una constancia, esto NO es evidencia inmutable, es solo la lista de hoy.
    const idsDeActividad = programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId);
    const actividades = idsDeActividad.length
      ? await this.prisma.scoped.activity.findMany({
          where: { id: { in: idsDeActividad } },
          select: { id: true, name: true, currentVersionId: true, activityType: { select: { name: true, config: true } } },
        })
      : [];
    const actividadPorId = new Map(actividades.map((a) => [a.id, a]));

    // ¿ESTE MODULO YA SE EXIGE SOLO? (2026-09-15, PENDIENTES 11.7)
    //
    // `aplicarExigenciaAutomatica` (versioning.service.ts) crea la regla de "toda la empresa" al
    // PUBLICAR una formacion cuyo tipo dice `defaultAssignmentMode: 'ON_HIRE'` — induccion general,
    // reinduccion. Un programa hecho de esos modulos no necesita el boton de asignar, y sin decirlo
    // queda a adivinar. Se mira el CONFIG del tipo y no su `code`: el codigo es dato del tenant y
    // se puede renombrar, el config es lo que el motor lee de verdad.
    //
    // `requiresBeforeHire` se devuelve aparte porque cambia A QUIEN alcanza: con el, la regla nace
    // `soloNuevos` y NO toca a la plantilla actual — que es justo lo que alguien daria por hecho al
    // leer "se asigna sola a toda la empresa".
    const reglasActivas = idsDeActividad.length
      ? await this.prisma.scoped.assignmentRule.findMany({
          where: { targetType: 'ACTIVITY', targetId: { in: idsDeActividad }, active: true },
          select: {
            targetId: true,
            recurrence: true,
            trigger: true,
            appliesFrom: true,
            audience: { select: { id: true, name: true } },
          },
        })
      : [];
    const yaExigidos = new Set(reglasActivas.map((r) => r.targetId));

    /*
      "SIN REGLA" Y "REGLA RETIRADA" NO SON LO MISMO (2026-09-16).
      *
      La etiqueta decia "sin regla activa" en los dos casos, y esconden situaciones opuestas:
      **nunca la tuvo** —algo no funciono al publicar, o todavia no se ha publicado— frente a **se la
      quitaron**, que es un acto deliberado de alguien. Lo destapo una induccion general publicada
      que salia "sin regla activa": la regla estaba ahi, creada el mismo dia al publicarla, y
      retirada despues. Decirlo igual manda a buscar el problema al sitio equivocado.
    */
    const conReglaRetirada = idsDeActividad.length
      ? await this.prisma.scoped.assignmentRule.findMany({
          where: { targetType: 'ACTIVITY', targetId: { in: idsDeActividad }, active: false },
          select: { targetId: true },
        })
      : [];
    const retiradas = new Set(conReglaRetirada.map((r) => r.targetId));

    // LA FECHA DE CAMPAÑA DE CADA MODULO (2026-09-15). Un programa de Reinduccion se comporta como
    // UNA campana anual —"todo antes del 31 de marzo"— no porque el programa tenga una fecha propia,
    // que no la tiene, sino porque sus modulos COMPARTEN la del tipo (`defaultAnnualDate`). Eso no
    // se veia en ningun sitio, asi que tampoco se veia cuando alguien rompia la coincidencia sin
    // querer. Se devuelve por modulo y la pantalla decide que decir.
    const fechaDeCampanaPorActividad = new Map<string, string>();
    for (const regla of reglasActivas) {
      const recurrencia = regla.recurrence as { fixedDate?: string } | null;
      if (recurrencia?.fixedDate) fechaDeCampanaPorActividad.set(regla.targetId, recurrencia.fixedDate);
    }

    // El cupo, dicho como se declara: "de N, puede perder M". La pantalla no deberia volver a
    // derivarlo — seria la segunda copia de la misma cuenta.
    const seccionPorNombre = new Map<string, { total: number; minimo: number; puedePerder: number }>();
    for (const item of programa.items) {
      if (item.isRequired || !item.sectionName) continue;
      const actual = seccionPorNombre.get(item.sectionName) ?? { total: 0, minimo: item.minRequiredInSection ?? 0, puedePerder: 0 };
      actual.total += 1;
      seccionPorNombre.set(item.sectionName, actual);
    }
    for (const seccion of seccionPorNombre.values()) seccion.puedePerder = Math.max(0, seccion.total - seccion.minimo);

    /*
      A QUIEN SE LE EXIGE ESTE PROGRAMA, visto DESDE el programa (2026-09-16).
      *
      Antes habia que entrar formacion por formacion a su pestaña "Quienes" para averiguarlo, y en
      un programa de ocho modulos eso son ocho viajes. Peor aun en los que se asignan SOLOS —
      induccion general, reinduccion—: la pantalla decia "no necesita asignarse" y no habia forma de
      ver a quien habia alcanzado esa regla automatica. El cliente lo pidio asi: *"que salgan los
      obligados desde el programa, aunque no se asignen desde ahi"*.

      Se agrupa por AUDIENCIA, no por modulo: lo que se quiere leer es "a los Conductores", no ocho
      renglones repitiendo lo mismo. Y se dice en cuantos modulos aplica, porque una audiencia que
      alcanza solo a 3 de 8 es una regla a medias — normalmente un error de configuracion.
    */
    const porAudiencia = new Map<string, { id: string; name: string; modulos: number; trigger: string; soloNuevos: boolean }>();
    for (const regla of reglasActivas) {
      const actual = porAudiencia.get(regla.audience.id) ?? {
        id: regla.audience.id,
        name: regla.audience.name,
        modulos: 0,
        trigger: regla.trigger as string,
        soloNuevos: regla.appliesFrom !== null,
      };
      actual.modulos += 1;
      porAudiencia.set(regla.audience.id, actual);
    }

    /*
      Y LA MISMA VERDAD, LEIDA AL REVES: QUIEN CUBRE CADA MODULO (2026-09-16).

      El agrupado por audiencia responde "¿a quien se le exige?"; no responde "¿y este modulo, a
      quien?". La pantalla lo decia con un "(solo 2 de 5)" colgado del nombre de la audiencia, que
      avisa de que faltan tres pero **no dice cuales** — y con cinco modulos y dos audiencias eso es
      un crucigrama. El cliente lo pidio del derecho: *"lo importante es saber por modulo, ejemplo
      induccion general cubre toda la empresa o lo que sea que seleccionaron"*.

      Son los MISMOS datos que `obligados`, invertidos. No se calcula nada nuevo ni se consulta otra
      vez: una sola lectura de `reglasActivas` alimenta las dos vistas, asi que no pueden discrepar.
    */
    const audienciasPorActividad = new Map<string, string[]>();
    for (const regla of reglasActivas) {
      const actual = audienciasPorActividad.get(regla.targetId) ?? [];
      // Dos reglas distintas pueden apuntar a la misma audiencia (una por cada trigger, por
      // ejemplo): el nombre se dice una vez.
      if (!actual.includes(regla.audience.name)) actual.push(regla.audience.name);
      audienciasPorActividad.set(regla.targetId, actual);
    }

    /*
      Y LA CUENTA QUE DE VERDAD DICE SI ESTE PROGRAMA FUNCIONA: **por persona**, no por audiencia.
      Ver `contarPorPersona` para el porque — en corto: dos audiencias distintas pueden alcanzar a
      la misma gente, y avisar por la forma en vez de por el efecto da falsas alarmas.
    */
    const cobertura = await this.contarPorPersona([
      ...new Set(programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId)),
    ]);

    return {
      ...programa,
      secciones: [...seccionPorNombre].map(([name, datos]) => ({ name, ...datos })),
      obligados: [...porAudiencia.values()].sort((a, b) => b.modulos - a.modulos),
      /** A cuantos se les exige ALGUNO de los modulos pero no todos: no completaran el programa. */
      afectados: cobertura.afectados,
      /** A cuantos se les exigen TODOS: esos si lo completaran y tendran la constancia del conjunto. */
      conTodos: cobertura.conTodos,
      items: programa.items.map((item) => {
        const actividad = item.itemType === 'ACTIVITY' ? (actividadPorId.get(item.itemId) ?? null) : null;
        const config = activityTypeConfigSchema.partial().safeParse(actividad?.activityType.config ?? {});
        const tipo = config.success ? config.data : {};
        return {
          ...item,
          actividad: actividad ? { id: actividad.id, name: actividad.name, activityType: { name: actividad.activityType.name } } : null,
          exigenciaAutomatica: tipo.defaultAssignmentMode === 'ON_HIRE',
          soloAlIngresar: tipo.requiresBeforeHire === true,
          yaExigido: yaExigidos.has(item.itemId),
          /** Quien tiene que hacer ESTE modulo, por nombre. Vacio = no se le exige a nadie. */
          audiencias: audienciasPorActividad.get(item.itemId) ?? [],
          /** Tuvo regla y se la quitaron. Distinto de no haberla tenido nunca. */
          reglaRetirada: !yaExigidos.has(item.itemId) && retiradas.has(item.itemId),
          /*
            SIN PUBLICAR NO LA PUEDE HACER NADIE (2026-09-16).
            *
            Un modulo en borrador **bloquea el programa entero**: nadie puede cursarlo, asi que el
            conjunto nunca completa. Y en los tipos que se exigen solos, sin publicar **tampoco
            existe la regla** — el aviso de "ya se exigen solos" promete algo que todavia no ha
            pasado. Desde la ficha del programa no habia forma de verlo, y era la explicacion de
            "¿por que no se le exige a nadie?".
          */
          publicada: actividad?.currentVersionId !== null && actividad?.currentVersionId !== undefined,
          fechaDeCampana: fechaDeCampanaPorActividad.get(item.itemId) ?? null,
        };
      }),
    };
  }

  async actualizar(id: string, data: { name?: string; description?: string | null; active?: boolean }) {
    await this.existeOFalla(id);
    return this.prisma.scoped.learningPath.update({ where: { id }, data });
  }

  /** Publicar es lo que lo hace visible para el aprendiz. Antes de eso, solo existe para el admin. */
  async publicar(id: string) {
    const programa = await this.existeOFalla(id);
    if (programa.items.length === 0) {
      throw new BadRequestException({ code: 'PROGRAM_EMPTY', message: 'Un programa sin modulos no se puede publicar' });
    }
    this.validarSecciones(programa.items);
    return this.prisma.scoped.learningPath.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  async despublicar(id: string) {
    await this.existeOFalla(id);
    return this.prisma.scoped.learningPath.update({ where: { id }, data: { status: 'DRAFT' } });
  }

  // ─────────────────────────────── Asignar a una audiencia ───────────────────────────────

  /**
   * EXIGIR EL PROGRAMA ENTERO A UN GRUPO, en un solo boton (2026-09-14, PENDIENTES 11.3).
   *
   * ─── LA RECOMENDACION QUE SE LE DIO AL CLIENTE, APLICADA ───
   *
   * No se inventa un requisito de tipo PATH en el motor de asignacion — `AssignmentTargetType.PATH`
   * sigue existiendo en el esquema y sin usar, a proposito. Asignar un programa es asignar CADA UNO
   * de sus modulos con el MISMO alcance, reusando `AssignmentsService.setActivityRequirement` tal
   * cual lo usa la ficha de una formacion suelta: misma audiencia (se busca o se crea una sola vez
   * por `findOrCreate`, asi que las N llamadas comparten audiencia y no crean N gemelas), mismo
   * disparador, misma recurrencia.
   *
   * ─── POR QUE NO CONSTRUIR EL BRAZO PATH DEL MOTOR ───
   *
   * Construirlo exigiria enseñarle al motor de requisitos (`RequirementEngineService`) a
   * materializar UN PathEnrollment y, para cada modulo, el enrollment que ya haria falta de todas
   * formas — es decir, reimplementar por dentro exactamente lo que `setActivityRequirement` ya hace
   * bien, con el riesgo de que las dos vias de asignar una formacion (la suelta y la de programa)
   * diverjan con el tiempo. Delegar es mas codigo en este metodo pero MENOS SUPERFICIE nueva que
   * pueda desincronizarse.
   *
   * ─── SOLO PROGRAMAS PUBLICADOS, con al menos un modulo ───
   *
   * Asignar un borrador obligaria a gente a algo que todavia puede cambiar de forma.
   */
  async asignarAudiencia(actor: AuthUser, programId: string, input: AssignProgramInput) {
    const programa = await this.existeOFalla(programId);
    if (programa.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: 'PROGRAM_NOT_PUBLISHED',
        message: 'Solo se puede asignar un programa publicado',
      });
    }
    const idsDeActividad = programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId);
    if (idsDeActividad.length === 0) {
      throw new BadRequestException({ code: 'PROGRAM_EMPTY', message: 'Este programa no tiene modulos' });
    }

    const porModulo: Array<{ activityId: string; ruleId: string; created: number; updated: boolean }> = [];
    for (const activityId of idsDeActividad) {
      const outcome = await this.assignments.setActivityRequirement(
        actor,
        {
          activityId,
          scope: input.scope,
          trigger: input.trigger,
          dueDaysAfterTrigger: input.dueDaysAfterTrigger,
          everyMonths: input.everyMonths,
          fixedDate: input.fixedDate,
          soloNuevos: input.soloNuevos,
          reason: input.reason ?? null,
        },
        /*
          DE DONDE SALE LA REGLA (2026-09-16). Se apunta que la creo ESTE programa. Hoy nadie lo
          lee y no cambia nada; se guarda porque es lo unico de todo esto que **no se puede
          reconstruir despues**: sin este dato, una regla creada aqui y una creada a mano sobre la
          formacion son la misma fila para siempre. Ver `AssignmentRule.sourcePathId`.
        */
        { pathId: programId },
      );
      porModulo.push({ activityId, ruleId: outcome.ruleId, created: outcome.created, updated: outcome.updated });
    }

    // La misma cifra que ve quien exige una formacion suelta: cuanta gente alcanza la audiencia
    // HOY, para que el boton no se pulse a ciegas.
    const reach = (await this.audiences.preview(input.scope)).count;

    return {
      modulos: porModulo.length,
      reach,
      // Suma de obligaciones nacidas EN CADA MODULO, no personas distintas: la misma persona
      // cuenta una vez por modulo, porque debe cada uno por separado.
      obligacionesCreadas: porModulo.reduce((suma, r) => suma + r.created, 0),
      porModulo,
    };
  }

  /**
   * ¿A QUIEN LE CUESTA PUBLICAR ESTE PROGRAMA? (2026-09-16)
   *
   * Publicar no es solo "ya se ve": es el acto que **apaga la constancia individual** de todos sus
   * modulos (`esModuloDeUnProgramaPublicado`). Y eso hasta hoy pasaba en silencio.
   *
   * El caso que lo motiva no necesita ninguna mala configuracion — lo planteo el cliente y es el
   * mas normal del mundo: un programa de inducciones generales —que se exigen solas a toda la
   * empresa— al que se le añade una pildora que ya tenia SU regla para cien personas. Publicarlo
   * deja a la plantilla entera asi:
   *
   *   - las cien: deben los tres modulos, completan, y reciben la constancia DEL PROGRAMA;
   *   - los demas: deben solo las dos inducciones, nadie les exige la pildora, **nunca completan el
   *     programa** — y sus inducciones ya no emiten constancia individual. **Se quedan sin ningun
   *     papel**, habiendo hecho la formacion.
   *
   * La firma de esa gente es exacta y se puede contar antes de publicar: **se le exige ALGUNO de
   * los modulos, pero no TODOS**. Ni cero (a esa no le afecta el programa) ni todos (esa lo
   * completara y tendra su constancia).
   *
   * No bloquea nada: es un numero para que la decision se tome sabiendola. Se calcula aqui y no en
   * `getProgram` porque recorre las obligaciones de todos los modulos, y eso no se puede pagar en
   * cada carga de la pantalla — se pide una vez, al pulsar Publicar.
   */
  async impactoDePublicar(programId: string) {
    const programa = await this.existeOFalla(programId);
    const idsDeActividad = [
      ...new Set(programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId)),
    ];
    return this.contarPorPersona(idsDeActividad);
  }

  /**
   * A CUANTA GENTE LE FALTA ALGO, CONTADO POR PERSONA (2026-09-16).
   *
   * ─── POR QUE NO BASTA MIRAR LAS AUDIENCIAS ───
   *
   * La ficha avisaba comparando AUDIENCIAS: "ninguna alcanza los N modulos". Y eso **da falsas
   * alarmas**, porque dos audiencias distintas pueden alcanzar exactamente a la misma gente. El
   * cliente dio con el caso: *"una pildora si puede ser para todos"* — y es cierto: `jobTitleId` y
   * `areaId` son obligatorios en toda persona, asi que marcarle TODOS los cargos la deja alcanzando
   * a la plantilla entera. Esa pildora, junto a unas inducciones generales exigidas a "Toda la
   * empresa", forma un programa **perfectamente sano** en el que nadie se queda fuera... y la
   * comparacion por audiencias gritaba igual, porque son dos audiencias con nombres distintos.
   *
   * Un aviso que salta sobre algo que esta bien enseña a ignorarlo. Asi que se cuenta lo unico que
   * describe un daño de verdad: **personas a las que se les exige ALGUNO de los modulos pero no
   * TODOS**. Esas pierden la constancia individual de lo que si hacen —la apaga publicar el
   * programa— y nunca completaran el conjunto, asi que se quedan sin ningun papel.
   *
   * Ni cero (a esa el programa no le afecta) ni todos (esa lo completara y tendra su constancia).
   */
  private async contarPorPersona(idsDeActividad: string[]) {
    if (idsDeActividad.length === 0) return { modulos: 0, afectados: 0, conTodos: 0 };

    // Las RETIRADAS no cuentan: a quien salio de la audiencia ya no se le exige ese modulo. Misma
    // lista que usa el informe, para que dos pantallas no den numeros distintos.
    const exigidos = await this.prisma.scoped.assignment.findMany({
      where: {
        targetType: 'ACTIVITY',
        targetId: { in: idsDeActividad },
        status: { notIn: [...ESTADOS_RETIRADOS] },
      },
      select: { userId: true, targetId: true },
      distinct: ['userId', 'targetId'],
    });

    const modulosPorPersona = new Map<string, number>();
    for (const fila of exigidos) {
      modulosPorPersona.set(fila.userId, (modulosPorPersona.get(fila.userId) ?? 0) + 1);
    }

    let afectados = 0;
    let conTodos = 0;
    for (const cuantos of modulosPorPersona.values()) {
      if (cuantos === idsDeActividad.length) conTodos += 1;
      else afectados += 1;
    }
    return { modulos: idsDeActividad.length, afectados, conTodos };
  }

  // ─────────────────────────────── Modulos ───────────────────────────────

  /**
   * Agrega un modulo. `sectionName` SOLO tiene sentido cuando `isRequired` es `false` — un modulo
   * obligatorio no pertenece a ningun cupo (ver `program-completion.ts`). Se limpia aqui para que
   * no queden datos contradictorios.
   *
   * El cupo del grupo se declara con `minRequiredInSection` y se propaga a todos sus modulos — ver
   * `fijarMinimo`.
   */
  async agregarModulo(
    programId: string,
    data: { activityId: string; isRequired: boolean; sectionName?: string | null; minRequiredInSection?: number | null },
  ) {
    await this.existeOFalla(programId);

    const actividad = await this.prisma.scoped.activity.findUnique({ where: { id: data.activityId }, select: { id: true } });
    if (!actividad) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });

    const yaEsta = await this.prisma.scoped.pathItem.findFirst({
      where: { pathId: programId, itemType: 'ACTIVITY', itemId: data.activityId },
      select: { id: true },
    });
    if (yaEsta) throw new BadRequestException({ code: 'MODULE_ALREADY_IN_PROGRAM' });

    const ultimo = await this.prisma.scoped.pathItem.findFirst({ where: { pathId: programId }, orderBy: { displayOrder: 'desc' } });
    const sectionName = data.isRequired ? null : (data.sectionName ?? null);

    if (!data.isRequired && !sectionName) {
      throw new BadRequestException({
        code: 'SECTION_REQUIRED',
        message: 'Un modulo no obligatorio necesita una sección',
      });
    }

    // Como estaba el grupo ANTES de meterle este modulo. El cupo no se pregunta aqui: se configura
    // desde el programa, con el grupo ya armado (`fijarMinimoDeGrupo`).
    const grupoAntes = sectionName ? await this.estadoDelGrupo(programId, sectionName) : null;

    const creado = await this.prisma.scoped.pathItem.create({
      data: {
        tenantId: this.prisma.currentTenantId,
        pathId: programId,
        itemType: 'ACTIVITY',
        itemId: data.activityId,
        isRequired: data.isRequired,
        sectionName,
        // Lo pone `ajustarSeccion` justo debajo, contando los modulos que la seccion tiene YA.
        minRequiredInSection: null,
        displayOrder: (ultimo?.displayOrder ?? -1) + 1,
      },
    });

    if (sectionName && grupoAntes) await this.fijarMinimo(programId, sectionName, this.minimoTrasElCambio(grupoAntes, grupoAntes.total + 1));
    return this.prisma.scoped.pathItem.findFirstOrThrow({ where: { id: creado.id } });
  }

  async actualizarModulo(
    programId: string,
    itemId: string,
    data: { isRequired?: boolean; sectionName?: string | null; minRequiredInSection?: number | null },
  ) {
    const item = await this.prisma.scoped.pathItem.findFirst({ where: { id: itemId, pathId: programId } });
    if (!item) throw new NotFoundException({ code: 'MODULE_NOT_FOUND' });

    const isRequired = data.isRequired ?? item.isRequired;
    const sectionName = isRequired ? null : (data.sectionName ?? item.sectionName);

    if (!isRequired && !sectionName) {
      throw new BadRequestException({ code: 'SECTION_REQUIRED', message: 'Un modulo no obligatorio necesita una sección' });
    }

    // Los dos grupos se leen ANTES de mover el modulo: el que deja y el que recibe.
    const origenAntes = item.sectionName ? await this.estadoDelGrupo(programId, item.sectionName) : null;
    const destinoAntes = sectionName && sectionName !== item.sectionName ? await this.estadoDelGrupo(programId, sectionName) : null;

    await this.prisma.scoped.pathItem.update({
      where: { id: itemId },
      data: { isRequired, sectionName, ...(isRequired ? { minRequiredInSection: null } : {}) },
    });

    // El grupo que DEJA tambien se recalcula: si un modulo se vuelve obligatorio o se muda de
    // grupo, el de origen se queda con uno menos y su minimo tiene que bajar con el.
    if (origenAntes && item.sectionName && item.sectionName !== sectionName) {
      await this.fijarMinimo(programId, item.sectionName, this.minimoTrasElCambio(origenAntes, origenAntes.total - 1));
    }
    if (destinoAntes && sectionName) {
      await this.fijarMinimo(programId, sectionName, this.minimoTrasElCambio(destinoAntes, destinoAntes.total + 1));
    }
    return this.prisma.scoped.pathItem.findFirstOrThrow({ where: { id: itemId } });
  }

  async quitarModulo(programId: string, itemId: string) {
    const item = await this.prisma.scoped.pathItem.findFirst({ where: { id: itemId, pathId: programId } });
    if (!item) throw new NotFoundException({ code: 'MODULE_NOT_FOUND' });
    const grupoAntes = item.sectionName ? await this.estadoDelGrupo(programId, item.sectionName) : null;
    await this.prisma.scoped.pathItem.delete({ where: { id: itemId } });
    if (grupoAntes && item.sectionName) {
      await this.fijarMinimo(programId, item.sectionName, this.minimoTrasElCambio(grupoAntes, grupoAntes.total - 1));
    }
  }

  /**
   * EL ORDEN, tal como el admin lo dejo (2026-09-15). `PathItem.displayOrder` ya existia —lo lee
   * el aprendiz al pintar la lista— pero nada lo dejaba cambiar despues de agregar el modulo.
   *
   * Recibe la lista COMPLETA de ids en el orden final, no un "subir/bajar" con delta: el cliente
   * ya sabe el orden que quiere (lo acaba de mostrar en pantalla), y mandarlo entero evita que dos
   * "subir" seguidos en la misma sesion se pisen por una condicion de carrera.
   */
  async reordenarModulos(programId: string, itemIdsEnOrden: string[]) {
    const items = await this.prisma.scoped.pathItem.findMany({ where: { pathId: programId }, select: { id: true } });
    const idsActuales = new Set(items.map((i) => i.id));
    if (itemIdsEnOrden.length !== items.length || itemIdsEnOrden.some((id) => !idsActuales.has(id))) {
      throw new BadRequestException({ code: 'INVALID_ORDER', message: 'La lista no coincide con los modulos del programa' });
    }
    await this.prisma.tx(async (tx) => {
      await Promise.all(
        itemIdsEnOrden.map((itemId, displayOrder) => tx.pathItem.update({ where: { id: itemId }, data: { displayOrder } })),
      );
    });
  }

  /**
   * EL CUPO SE DECLARA COMO "CUANTOS PUEDE PERDER", no como "cuantos hacen falta" (2026-09-15).
   *
   * ─── POR QUE SE DIO LA VUELTA ───
   *
   * El cliente lo corrigio con una frase que lo dice todo: *"nadie se puede saltar nada; debe ser
   * que de esos 7, si pierde 1 no importa, pasa"*. Y tenia razon en las dos mitades:
   *
   *   - **No es "puede no hacerlo", es "puede perderlo".** Todos cursan los 7 modulos. Lo que el
   *     cupo permite es REPROBAR uno y aun asi completar el programa. Preguntar por el minimo
   *     aprobado describia la misma regla desde un sitio donde nadie la piensa.
   *
   *   - **Y el minimo dependia de un total que todavia no existia.** Una seccion se arma de uno en
   *     uno: al agregar el primer modulo no hay 7, hay 1, asi que escribir "6" ahi obligaba a la
   *     pantalla a avisar de una imposibilidad que era solo ir en orden. "Puede perder 1" es cierto
   *     desde el primer modulo y sigue siendolo con los siete.
   *
   * ─── COMO SE GUARDA, SIN TOCAR EL ESQUEMA ───
   *
   * `PathItem.minRequiredInSection` sigue siendo la verdad que lee el motor (`evaluarPrograma` no
   * cambia). Lo que cambia es quien lo calcula: `minimo = total - puedePerder`, recalculado en CADA
   * escritura que altere el tamano de la seccion — agregar, editar, mudar de seccion o quitar. Asi
   * "puede perder 1" se mantiene invariante mientras la seccion crece, que es la promesa que se le
   * hizo a quien lo declaro.
   *
   * `puedePerder` no se guarda en ninguna columna nueva: se DEDUCE de lo que ya hay
   * (`total_anterior - minimo_anterior`) y solo se pasa explicito cuando alguien lo declara. Una
   * columna mas seria un segundo sitio donde la misma verdad puede quedar desincronizada.
   *
   * El minimo nunca baja de 1: una seccion que no exige nada no es un cupo, es ruido.
   */
  /**
   * EL CUPO SE CONFIGURA DESDE EL PROGRAMA, no desde el formulario de un modulo (2026-09-15).
   *
   * Es una regla del GRUPO —"de estos 7 hacen falta 6"— asi que preguntarla al agregar un modulo la
   * ponia en el sitio equivocado dos veces: obligaba a decidirla antes de tener los modulos
   * delante, y dejaba que un formulario de UNO cambiara la regla de todos. Aqui se declara una vez,
   * con el grupo ya armado y a la vista.
   */
  async fijarMinimoDeGrupo(programId: string, sectionName: string, minimo: number) {
    await this.existeOFalla(programId);
    const total = await this.prisma.scoped.pathItem.count({
      where: { pathId: programId, sectionName, isRequired: false },
    });
    if (total === 0) throw new NotFoundException({ code: 'SECTION_NOT_FOUND' });
    if (minimo < 1 || minimo > total) {
      throw new BadRequestException({
        code: 'SECTION_MINIMUM_OUT_OF_RANGE',
        message: `El mínimo tiene que estar entre 1 y ${total}`,
      });
    }
    await this.fijarMinimo(programId, sectionName, minimo);
    return this.obtener(programId);
  }

  /** Lo que el grupo era ANTES de tocarlo: cuantos modulos tenia y cuanto exigia. */
  private async estadoDelGrupo(programId: string, sectionName: string): Promise<{ total: number; minimo: number | null }> {
    const items = await this.prisma.scoped.pathItem.findMany({
      where: { pathId: programId, sectionName, isRequired: false },
      select: { minRequiredInSection: true },
    });
    const declarado = items.find((item) => item.minRequiredInSection !== null)?.minRequiredInSection ?? null;
    return { total: items.length, minimo: declarado };
  }

  /**
   * EL MINIMO DESPUES DE QUE EL GRUPO CAMBIE DE TAMANO.
   *
   * Un grupo recien creado exige TODOS sus modulos: es el defecto estricto, no perdona nada todavia
   * y se lee igual que si fueran obligatorios — o sea, no sorprende a nadie. Mientras nadie lo baje,
   * sigue el tamano del grupo: agregar un modulo a "hacen falta 3 de 3" deja "4 de 4".
   *
   * En cuanto alguien lo BAJA (minimo < total), ese numero es una decision y se respeta tal cual:
   * "hacen falta 6" quiere decir 6, se agreguen o se quiten modulos despues. Solo se recorta si el
   * grupo se queda con menos modulos que el minimo, porque entonces seria imposible de cumplir.
   */
  private minimoTrasElCambio(antes: { total: number; minimo: number | null }, totalAhora: number): number {
    if (antes.minimo === null || antes.minimo >= antes.total) return Math.max(1, totalAhora);
    return Math.min(Math.max(1, antes.minimo), Math.max(1, totalAhora));
  }

  /**
   * TODOS LOS MODULOS DEL GRUPO GUARDAN EL MISMO MINIMO.
   *
   * El umbral es del GRUPO, no del modulo (ver `program-completion.ts`), pero el esquema lo guarda
   * pegado a cada fila porque no hay tabla de grupos. En vez de dejar que se desincronicen y fallar
   * tarde, se propaga en cada escritura que toque el grupo.
   *
   * El minimo declarado **no se recalcula** cuando el grupo cambia de tamano: "hacen falta 6" quiere
   * decir 6, se agreguen o se quiten modulos. Si al quitar uno el grupo se queda con 6 y el minimo
   * sigue en 6, el cupo deja de perdonar nada — es la lectura literal de lo que se declaro, y la
   * pantalla lo dice en voz alta ("de 6 módulos hacen falta 6: hay que aprobarlos todos") en vez de
   * ajustarlo por su cuenta.
   */
  private async fijarMinimo(programId: string, sectionName: string, minimo: number) {
    const total = await this.prisma.scoped.pathItem.count({
      where: { pathId: programId, sectionName, isRequired: false },
    });
    if (total === 0) return;
    await this.prisma.scoped.pathItem.updateMany({
      where: { pathId: programId, sectionName, isRequired: false },
      data: { minRequiredInSection: Math.max(1, minimo) },
    });
  }

  /** Antes de publicar: ninguna seccion puede pedir mas modulos de los que tiene. */
  private validarSecciones(items: Array<{ isRequired: boolean; sectionName: string | null; minRequiredInSection: number | null }>) {
    const porSeccion = new Map<string, { total: number; minimo: number }>();
    for (const item of items) {
      if (item.isRequired || !item.sectionName) continue;
      const actual = porSeccion.get(item.sectionName) ?? { total: 0, minimo: item.minRequiredInSection ?? 0 };
      actual.total += 1;
      porSeccion.set(item.sectionName, actual);
    }
    for (const [seccion, { total, minimo }] of porSeccion) {
      if (minimo > total) {
        throw new BadRequestException({
          code: 'SECTION_MINIMUM_UNREACHABLE',
          message: `La sección "${seccion}" pide ${minimo} pero solo tiene ${total} módulos`,
        });
      }
    }
  }

  private async existeOFalla(id: string) {
    const programa = await this.prisma.scoped.learningPath.findUnique({ where: { id }, include: { items: true } });
    if (!programa) throw new NotFoundException({ code: 'PROGRAM_NOT_FOUND' });
    return programa;
  }

  // ─────────────────────────────── Progreso del aprendiz ───────────────────────────────

  /**
   * SE LLAMA CADA VEZ QUE UNA FORMACION SE CIERRA (`CompletionService`), no en un cron: el
   * progreso de un programa tiene que reflejar el ultimo cierre al instante, igual que la
   * certificacion individual ya lo hace. Si la actividad no es modulo de ningun programa, no hace
   * nada — la inmensa mayoria de las formaciones no lo son.
   */
  async alCompletarActividad(tenantId: string, userId: string, activityId: string): Promise<void> {
    const modulos = await this.prisma.scoped.pathItem.findMany({
      where: { itemType: 'ACTIVITY', itemId: activityId },
      select: { pathId: true },
    });
    const programIds = [...new Set(modulos.map((m) => m.pathId))];
    for (const programId of programIds) {
      await this.recalcularProgreso(tenantId, userId, programId).catch(() => undefined);
    }
  }

  /**
   * Recalcula el avance de UNA persona en UN programa, y cierra el `PathEnrollment` si completo.
   *
   * ─── POR RONDA, no solo "alguna vez aprobado" (2026-09-15) ───
   *
   * Un modulo que viene de una `AssignmentRule` con recurrencia (Reinduccion, tipicamente) se
   * vuelve a deber: la `Assignment` de esa persona para esa actividad abre una `cycleNumber` nueva
   * y vuelve a PENDING (`RequirementEngineService`). Si aqui se siguiera preguntando "¿alguna vez
   * aprobo esta actividad?" (via `Enrollment`), el programa se veria completo PARA SIEMPRE desde la
   * primera vuelta, aunque la persona debiera ya la ronda 2 — la constancia conjunta nunca se
   * volveria a emitir. Por eso el estado de cada modulo sale de su `Assignment` MAS RECIENTE, no de
   * su historial de aprobaciones: es la misma fuente que ya usa el motor para decidir si a esa
   * persona le toca o no le toca.
   *
   * Un modulo que NUNCA paso por el motor (ningun `AssignmentRule` lo alcanzo — se aprobo por otra
   * via, o el programa no tiene asignacion propia) no tiene `Assignment` que consultar; para esos
   * se conserva el camino de siempre ("¿hay un `Enrollment` aprobado?"), que no distingue rondas
   * porque esos modulos tampoco las tienen.
   */
  async recalcularProgreso(tenantId: string, userId: string, programId: string) {
    const programa = await this.prisma.scoped.learningPath.findUnique({ where: { id: programId }, include: { items: true } });
    if (!programa) return null;

    const idsDeActividad = programa.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId);
    const [aprobadas, asignaciones, existente] = await Promise.all([
      idsDeActividad.length
        ? this.prisma.scoped.enrollment.findMany({
            where: { userId, status: { in: ['COMPLETED', 'PASSED'] }, activityVersion: { activityId: { in: idsDeActividad } } },
            select: { activityVersion: { select: { activityId: true } } },
          })
        : [],
      idsDeActividad.length
        ? this.prisma.scoped.assignment.findMany({
            where: { userId, targetType: 'ACTIVITY', targetId: { in: idsDeActividad } },
            orderBy: { cycleNumber: 'desc' },
            select: { targetId: true, cycleNumber: true, status: true },
          })
        : [],
      this.prisma.scoped.pathEnrollment.findFirst({ where: { pathId: programId, userId }, orderBy: { cycleNumber: 'desc' } }),
    ]);
    const aprobadasSet = new Set(aprobadas.map((e) => e.activityVersion.activityId));

    // Ordenado por cycleNumber desc: la primera fila que se ve por actividad ES la ronda vigente.
    const rondaVigentePorActividad = new Map<string, { cycleNumber: number; status: string }>();
    for (const asignacion of asignaciones) {
      if (!rondaVigentePorActividad.has(asignacion.targetId)) {
        rondaVigentePorActividad.set(asignacion.targetId, { cycleNumber: asignacion.cycleNumber, status: asignacion.status });
      }
    }

    const cicloInscripcion = existente?.cycleNumber ?? 1;
    const cicloPrograma = cicloDePrograma(
      cicloInscripcion,
      [...rondaVigentePorActividad.values()].map((r) => r.cycleNumber),
    );

    const estados: EstadoModulo[] = programa.items.map((item) => {
      if (item.itemType !== 'ACTIVITY') {
        return { itemId: item.id, isRequired: item.isRequired, sectionName: item.sectionName, aprobado: false, pendiente: false };
      }
      const ronda = rondaVigentePorActividad.get(item.itemId);
      return {
        itemId: item.id,
        isRequired: item.isRequired,
        sectionName: item.sectionName,
        aprobado: moduloAprobado({ ronda, aprobadoAlgunaVez: aprobadasSet.has(item.itemId) }),
        pendiente: moduloPendiente(ronda),
      };
    });
    const minimoPorSeccion: Record<string, number> = {};
    for (const item of programa.items) {
      if (!item.isRequired && item.sectionName && item.minRequiredInSection) minimoPorSeccion[item.sectionName] = item.minRequiredInSection;
    }

    const evaluacion = evaluarPrograma(estados, minimoPorSeccion);
    const totalModulos = programa.items.length;

    /*
      UN PROGRAMA SIN MODULOS NO COMPLETA A NADIE (2026-09-15).

      `evaluarPrograma([])` devuelve `completo: true`, y como funcion pura es lo correcto: no queda
      ninguna condicion sin cumplir. Pero aqui abajo eso emite una CONSTANCIA, y una constancia de
      un programa vacio no acredita nada — es un papel que dice que alguien completo la nada.

      `publicar()` impide publicar un programa sin modulos, asi que no se llega por ahi. Se llega
      QUITANDOLE los modulos a uno ya publicado, que nada impide y es una operacion normal mientras
      se reorganiza un programa. Por eso el guardarrail vive aqui, donde se decide el papel, y no en
      la regla pura.
    */
    const resultado = totalModulos === 0 ? { ...evaluacion, completo: false } : evaluacion;
    const progressPct = totalModulos === 0 ? 0 : Math.round((estados.filter((e) => e.aprobado).length / totalModulos) * 100);

    // Es una ronda NUEVA (algun modulo ya abrio ciclo por encima del que tenia la inscripcion): no
    // se pisa la fila de la ronda anterior —ya cerrada, es la evidencia de esa vuelta— se crea una
    // fila aparte, igual que `CertificationGrant` ("una fila por ronda, inmutable").
    const esRondaNueva = cicloPrograma > cicloInscripcion;
    const yaEstabaCompleto = !esRondaNueva && existente?.status === 'COMPLETED';

    /*
      UNA RONDA COMPLETADA NO SE REABRE (2026-09-15).

      Reorganizar un programa —agregarle un modulo, cambiar un cupo— es normal, y antes eso devolvia
      a `ENROLLED` a TODO el que ya lo hubiera completado. El resultado dejaba a esa persona en el
      peor sitio posible: tenia que hacer trabajo nuevo y **no recibia papel nuevo por el**, porque
      el indice unico por inscripcion impide una segunda constancia de la misma ronda. Su unica
      evidencia seguia describiendo el programa viejo.

      La regla es la que ya estaba escrita en el esquema y no se estaba respetando aqui: "una fila
      por ronda, INMUTABLE". Una ronda cerrada es evidencia de lo que el programa exigia ese dia, y
      no se pisa. Lo que abre trabajo nuevo es una RONDA nueva, que crea su propia fila.

      Quien va a medias SI ve el modulo nuevo: no hay ninguna evidencia emitida que proteger, y su
      programa todavia no acredita nada.

      Si algun dia hace falta que un cambio de programa obligue a recertificar, la via correcta no es
      reabrir la fila: es versionar el programa, como ya se versiona una `Activity` (copy-on-edit).
    */
    if (yaEstabaCompleto && existente) {
      return { ...resultado, completo: true, progressPct: existente.progressPct, recienCompletado: false };
    }

    const inscripcion = esRondaNueva
      ? await this.prisma.scoped.pathEnrollment.create({
          data: {
            tenantId,
            pathId: programId,
            userId,
            cycleNumber: cicloPrograma,
            status: resultado.completo ? 'COMPLETED' : 'ENROLLED',
            progressPct,
            completedAt: resultado.completo ? new Date() : null,
          },
        })
      : await this.prisma.scoped.pathEnrollment.upsert({
          where: { pathId_userId_cycleNumber: { pathId: programId, userId, cycleNumber: cicloPrograma } },
          create: {
            tenantId,
            pathId: programId,
            userId,
            cycleNumber: cicloPrograma,
            status: resultado.completo ? 'COMPLETED' : 'ENROLLED',
            progressPct,
            completedAt: resultado.completo ? new Date() : null,
          },
          update: {
            status: resultado.completo ? 'COMPLETED' : 'ENROLLED',
            progressPct,
            // No se pisa una fecha de cierre que ya existia: si alguien retomo un modulo y lo volvio a
            // aprobar, sigue completo desde la primera vez que lo consiguio, no desde hoy.
            ...(resultado.completo && !yaEstabaCompleto ? { completedAt: new Date() } : {}),
          },
        });

    const recienCompletado = resultado.completo && !yaEstabaCompleto;

    /*
      LA CONSTANCIA DEL PROGRAMA nace aqui, en el mismo sitio que decide que el programa se acaba
      de completar — igual que `CertificatesService.emitirPorEjecucion` nace del cierre de una
      formacion y no de un boton. NUNCA tumba el recalculo: si la emision falla, el progreso queda
      igual de correcto y el papel se puede reintentar (es idempotente por `pathEnrollmentId`).
    */
    if (recienCompletado) {
      await this.certificates.emitirPorPrograma(tenantId, inscripcion.id).catch((error: unknown) => {
        this.logger.error(`No se pudo emitir la constancia del programa ${programId} para ${userId}`, error);
      });
    }

    return { ...resultado, progressPct, recienCompletado };
  }

  /**
   * Lo que ve EL APRENDIZ: sus programas, con el avance de cada modulo.
   *
   * Mismo criterio "por ronda vigente" que `recalcularProgreso` (ver la nota alli): sin esto, un
   * modulo de Reinduccion que ya se debe de nuevo seguiria apareciendo con el visto verde de la
   * ronda pasada, y el aprendiz no tendria forma de saber que le toca otra vez.
   */
  async misProgramas(userId: string) {
    const publicados = await this.prisma.scoped.learningPath.findMany({
      where: { status: 'PUBLISHED', active: true },
      include: { items: { orderBy: { displayOrder: 'asc' } } },
    });

    const idsDeActividad = [...new Set(publicados.flatMap((p) => p.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId)))];
    const [actividades, aprobadas, asignaciones, inscripciones] = await Promise.all([
      idsDeActividad.length
        ? this.prisma.scoped.activity.findMany({ where: { id: { in: idsDeActividad } }, select: { id: true, name: true, coverKey: true } })
        : [],
      idsDeActividad.length
        ? this.prisma.scoped.enrollment.findMany({
            where: { userId, status: { in: ['COMPLETED', 'PASSED'] }, activityVersion: { activityId: { in: idsDeActividad } } },
            select: { activityVersion: { select: { activityId: true } } },
          })
        : [],
      idsDeActividad.length
        ? this.prisma.scoped.assignment.findMany({
            where: { userId, targetType: 'ACTIVITY', targetId: { in: idsDeActividad } },
            orderBy: { cycleNumber: 'desc' },
            select: { targetId: true, cycleNumber: true, status: true },
          })
        : [],
      this.prisma.scoped.pathEnrollment.findMany({
        where: { userId, pathId: { in: publicados.map((p) => p.id) } },
        orderBy: { cycleNumber: 'desc' },
      }),
    ]);
    const actividadPorId = new Map(actividades.map((a) => [a.id, a]));
    const aprobadasSet = new Set(aprobadas.map((e) => e.activityVersion.activityId));
    const rondaVigentePorActividad = new Map<string, { cycleNumber: number; status: string }>();
    for (const asignacion of asignaciones) {
      if (!rondaVigentePorActividad.has(asignacion.targetId)) {
        rondaVigentePorActividad.set(asignacion.targetId, { cycleNumber: asignacion.cycleNumber, status: asignacion.status });
      }
    }
    // Ordenadas por cycleNumber desc: la primera fila por pathId ES la inscripcion de la ronda vigente.
    const inscripcionPorPath = new Map<string, (typeof inscripciones)[number]>();
    for (const inscripcion of inscripciones) {
      if (!inscripcionPorPath.has(inscripcion.pathId)) inscripcionPorPath.set(inscripcion.pathId, inscripcion);
    }

    /*
      UN PROGRAMA SE VE SOLO SI SE LE EXIGE (2026-09-16).

      Antes se listaban TODOS los publicados, obligado o no, y eso le llenaba "Mi aprendizaje" a
      quien nadie le habia pedido nada: la Induccion de Conductores le aparecia a Contabilidad, sin
      forma de distinguirla de lo que si debe. Publicar no es asignar — un programa publicado es un
      compromiso con QUIEN LO TIENE EXIGIDO, no con toda la empresa.

      Se ve si tiene obligacion VIVA o cerrada de algun modulo (retirada no cuenta: salio de la
      audiencia), o si ya tiene avance — para que a nadie se le desaparezca de la pantalla algo que
      ya empezo, ni siquiera si despues se le retiro la regla.

      Si algun dia hace falta un programa ABIERTO, al que cualquiera se apunte por su cuenta, es un
      campo en `LearningPath` y una condicion mas aqui. No se adelanta: hoy seria una opcion mas que
      explicar sin un caso que la pida.
    */
    const conObligacion = new Set<string>();
    for (const asignacion of asignaciones) {
      if (asignacion.status.startsWith('WITHDRAWN')) continue;
      for (const programa of publicados) {
        if (programa.items.some((i) => i.itemType === 'ACTIVITY' && i.itemId === asignacion.targetId)) {
          conObligacion.add(programa.id);
        }
      }
    }
    const visibles = publicados.filter((p) => conObligacion.has(p.id) || inscripcionPorPath.has(p.id));

    return visibles.map((programa) => {
      const inscripcion = inscripcionPorPath.get(programa.id);
      return {
        id: programa.id,
        code: programa.code,
        name: programa.name,
        description: programa.description,
        estado: inscripcion?.status ?? 'ENROLLED',
        progressPct: inscripcion?.progressPct ?? 0,
        completedAt: inscripcion?.completedAt ?? null,
        modulos: programa.items.map((item) => {
          const aprobado =
            item.itemType === 'ACTIVITY' &&
            moduloAprobado({
              ronda: rondaVigentePorActividad.get(item.itemId),
              aprobadoAlgunaVez: aprobadasSet.has(item.itemId),
            });
          return {
            id: item.id,
            isRequired: item.isRequired,
            sectionName: item.sectionName,
            actividad: item.itemType === 'ACTIVITY' ? (actividadPorId.get(item.itemId) ?? null) : null,
            aprobado,
          };
        }),
      };
    });
  }
}
