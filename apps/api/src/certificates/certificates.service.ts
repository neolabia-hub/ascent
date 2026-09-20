import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service.js';
import { SequenceService } from '../common/sequence.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { vencimientoDe, vigenciaMasCorta } from './certificate-policy.js';
import type { CertificateSnapshot } from './certificate-snapshot.js';

/**
 * EL CODIGO DE VERIFICACION es lo que se teclea en la pantalla publica.
 *
 * 20 caracteres en base32 sin vocales ni caracteres ambiguos: nadie confunde un 0 con una O ni un
 * 1 con una I al copiarlo de un papel impreso, que es exactamente el caso de uso —alguien de
 * recursos humanos de OTRA empresa comprobando una constancia que le entregaron en mano—.
 *
 * NO es correlativo y no se puede adivinar: con un serial correlativo (CERT-2026-000123) bastaria
 * contar hacia arriba para leerse las constancias de toda la plantilla, y ahi hay cedulas y cargos.
 */
const ALFABETO = '23456789BCDFGHJKLMNPQRSTVWXYZ';
const LONGITUD_CODIGO = 20;

function nuevoCodigo(): string {
  const bytes = randomBytes(LONGITUD_CODIGO);
  let salida = '';
  for (let i = 0; i < LONGITUD_CODIGO; i += 1) {
    salida += ALFABETO[(bytes[i] as number) % ALFABETO.length];
  }
  // En grupos de cinco: dictarlo por telefono y copiarlo a mano es la mitad de su vida.
  return (salida.match(/.{1,5}/g) ?? []).join('-');
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Emite la constancia de una ejecucion recien terminada, SI corresponde.
   *
   * ─── SE LLAMA DESDE EL CIERRE, NO DESDE UNA PANTALLA ───
   *
   * La alternativa era un boton "generar constancia" en el panel. Se descarta: dependeria de que
   * alguien se acuerde de pulsarlo por cada persona que termina, y una constancia que no existe el
   * dia que la piden vale lo mismo que no haber capacitado. Nace sola al terminar.
   *
   * ─── ES IDEMPOTENTE, Y HACE FALTA QUE LO SEA ───
   *
   * El completado se evalua mas de una vez: el reproductor reintenta, dos pestanas terminan a la
   * vez, un envio offline llega tarde. La segunda llamada NO emite otra: la restriccion
   * `UNIQUE(tenant_id, enrollment_id)` de la base de datos la rechaza y aqui se traga el error
   * —solo ese— devolviendo la que ya existia. No basta con comprobar antes: entre la comprobacion
   * y la insercion cabe otra peticion.
   *
   * ─── NUNCA TUMBA EL CIERRE ───
   *
   * Si esto falla, la formacion sigue terminada. El registro formativo es el dato legal; la
   * constancia es un papel que se puede volver a emitir. Al reves seria perder lo importante por
   * no poder imprimir lo secundario.
   */
  async emitirPorEjecucion(tenantId: string, enrollmentId: string): Promise<{ id: string } | null> {
    const enrollment = await this.prisma.forTenant(tenantId).enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        user: { include: { jobTitle: { select: { name: true } }, area: { select: { name: true } } } },
        activityVersion: {
          include: {
            activity: { include: { activityType: { select: { name: true } } } },
            responsible: { include: { jobTitle: { select: { name: true } } } },
          },
        },
      },
    });

    if (!enrollment) return null;
    if (!enrollment.activityVersion.issuesCertificate) return null;
    // Solo lo terminado de verdad. Una formacion en curso no acredita nada.
    if (enrollment.status !== 'COMPLETED' && enrollment.status !== 'PASSED') return null;

    const plantilla = await this.plantillaActiva(tenantId);
    if (!plantilla) {
      // No es un fallo del sistema: es que esta empresa todavia no configuro su formato. Se
      // registra para que se vea en el panel, y la formacion queda terminada igual.
      this.logger.warn(`Tenant ${tenantId} sin plantilla de constancia activa; no se emite`);
      return null;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: true },
    });
    const branding = (tenant?.branding ?? {}) as { companyDisplayName?: string; logoKey?: string | null };

    const nota = await this.mejorNota(tenantId, enrollmentId);
    const completadoEn = enrollment.completedAt ?? new Date();

    /*
      LA VIGENCIA SALE DE LA RECURRENCIA DEL REQUISITO, no de un campo que alguien escriba aparte.

      Si una formacion hay que repetirla cada 12 meses, su constancia vale 12 meses: el dia que
      toca repetirla es exactamente el dia en que deja de acreditar. Pedir la vigencia por separado
      seria pedir el mismo dato dos veces y garantizar que algun dia no coincidan — y entonces
      habria un papel diciendo "vigente" sobre algo que el sistema ya reclama vencido.
    */
    /*
      TODAS las reglas vivas, no la primera que devuelva la base (corregido el 2026-09-08).

      Puede haber varias sobre la misma formacion —publicar una induccion crea sola la suya de "toda
      la empresa", y ademas se la puede exigir a un cargo— y con `findFirst` la vigencia dependia del
      orden de las filas: si tocaba la que no tiene recurrencia, la constancia salia SIN vencimiento y
      la persona desaparecia del informe de Vencimientos. Lo destapo `vencimientos.mjs`.
    */
    const requisitos = await this.prisma.forTenant(tenantId).assignmentRule.findMany({
      // `targetId` es la ACTIVIDAD, no la version: el requisito obliga a la formacion, y cambiar de
      // version no crea una obligacion nueva.
      where: { targetType: 'ACTIVITY', targetId: enrollment.activityVersion.activityId, active: true },
      select: { recurrence: true },
    });
    const vigenciaMeses = vigenciaMasCorta(requisitos.map((fila) => fila.recurrence));

    const snapshot: CertificateSnapshot = {
      schemaVersion: 1,
      persona: {
        fullName: enrollment.user.fullName,
        documentType: enrollment.user.documentType,
        documentNumber: enrollment.user.documentNumber,
        jobTitle: enrollment.user.jobTitle?.name ?? null,
        area: enrollment.user.area?.name ?? null,
      },
      formacion: {
        name: enrollment.activityVersion.activity.name,
        code: enrollment.activityVersion.activity.code,
        typeName: enrollment.activityVersion.activity.activityType?.name ?? null,
        versionNumber: enrollment.activityVersion.versionNumber,
        hours: enrollment.activityVersion.certificateHours,
        syllabus: enrollment.activityVersion.syllabusSnapshot,
        responsibleName: enrollment.activityVersion.responsible?.fullName ?? null,
        responsibleJobTitle: enrollment.activityVersion.responsible?.jobTitle?.name ?? null,
      },
      resultado: {
        status: enrollment.status,
        scorePct: nota,
        completedAt: completadoEn.toISOString(),
      },
      empresa: {
        name: tenant?.name ?? '',
        displayName: branding.companyDisplayName || (tenant?.name ?? ''),
        logoKey: branding.logoKey ?? null,
      },
    };

    const year = new Date().getFullYear();

    try {
      const creada = await this.prisma.txForTenant(tenantId, async (tx) => {
        // El numero se reserva DENTRO de la transaccion: si la insercion falla, no se consume.
        const consecutivo = await this.sequence.next(tx, tenantId, 'CERTIFICATE', year);
        return tx.certificate.create({
          data: {
            tenantId,
            userId: enrollment.userId,
            enrollmentId,
            serialNumber: this.sequence.format('CERT', year, consecutivo),
            verificationCode: nuevoCodigo(),
            templateId: plantilla.id,
            templateVersion: plantilla.versionNumber,
            renderSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            /*
              CUANDO DEJA DE ACREDITAR (Decision #111). Se cuenta desde que se COMPLETO y no desde
              que se emite: hoy son la misma fecha, pero dejaran de serlo el dia que se pueda
              emitir a mano una constancia atrasada, y entonces contar desde la impresion
              regalaria meses de vigencia que nadie curso.

              `null` es lo normal y es correcto: una induccion que se hace una vez al entrar
              acredita para siempre que se hizo. Solo vence lo que hay que repetir.
            */
            validUntil: vencimientoDe(completadoEn, vigenciaMeses),
          },
          select: { id: true, serialNumber: true },
        });
      });

      await this.audit.record({
        tenantId,
        userId: enrollment.userId,
        action: 'CERTIFICATE_ISSUED',
        resourceType: 'certificates',
        resourceId: creada.id,
        newValues: { serialNumber: creada.serialNumber, enrollmentId },
      });

      return { id: creada.id };
    } catch (error) {
      // P2002 = choque con el indice unico: ya habia una. Es el camino esperado cuando el cierre
      // se evalua dos veces, no un fallo, y por eso se devuelve la existente en vez de reventar.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const previa = await this.prisma
          .forTenant(tenantId)
          .certificate.findFirst({ where: { enrollmentId }, select: { id: true } });
        return previa ?? null;
      }
      throw error;
    }
  }

  /**
   * Emite la constancia DE UN PROGRAMA completo (2026-09-14, PENDIENTES 11.2).
   *
   * ─── POR QUE ES UN METODO APARTE Y NO UNA VARIANTE DE `emitirPorEjecucion` ───
   *
   * No hay `Enrollment` que la origine: la evidencia de un programa es que TODOS sus modulos
   * obligatorios (y el cupo de los que no lo son) estan aprobados, y eso vive repartido en varias
   * filas de `enrollments`, una por modulo. El snapshot se arma agregando esas filas, no leyendo
   * una sola.
   *
   * ─── EL RENDERIZADOR NO CAMBIA ───
   *
   * `CertificateSnapshot` es generico a proposito (ver el archivo): no sabe ni le importa si viene
   * de una formacion o de un programa. Por eso esto reusa `plantillaActiva`, `SequenceService` y el
   * mismo `CertificateRenderService` para el PDF — la unica diferencia es COMO se arma el snapshot.
   *
   * ─── IDEMPOTENTE, igual que `emitirPorEjecucion` y por la misma razon ───
   *
   * `recalcularProgreso` se llama cada vez que se cierra UN modulo del programa, y el ultimo modulo
   * puede cerrarse por dos caminos a la vez (reintento del reproductor, dos pestañas). La segunda
   * llamada choca con `UNIQUE(tenant_id, path_enrollment_id) WHERE path_enrollment_id IS NOT NULL`
   * y aqui se traga el error, devolviendo la que ya existia.
   *
   * ─── SIN VIGENCIA, A PROPOSITO ───
   *
   * A diferencia de una formacion individual, un programa no cuelga de una `AssignmentRule` propia
   * con su propia recurrencia — la tienen sus modulos, cada uno la suya, y no hay una unica
   * respuesta a "cada cuanto vence el programa entero". `validUntil` queda `null`: el programa
   * acredita que se completo, sin fecha de caducidad propia. Si algun dia un tenant pide programas
   * que caduquen como conjunto, ese es el momento de decidir de donde sale esa fecha — no antes.
   */
  async emitirPorPrograma(tenantId: string, pathEnrollmentId: string): Promise<{ id: string } | null> {
    const inscripcion = await this.prisma.forTenant(tenantId).pathEnrollment.findUnique({
      where: { id: pathEnrollmentId },
      include: {
        path: { include: { items: true } },
      },
    });
    if (!inscripcion) return null;
    if (inscripcion.status !== 'COMPLETED') return null;

    const usuario = await this.prisma.forTenant(tenantId).user.findUnique({
      where: { id: inscripcion.userId },
      include: { jobTitle: { select: { name: true } }, area: { select: { name: true } } },
    });
    if (!usuario) return null;

    const plantilla = await this.plantillaActiva(tenantId);
    if (!plantilla) {
      this.logger.warn(`Tenant ${tenantId} sin plantilla de constancia activa; no se emite (programa)`);
      return null;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: true },
    });
    const branding = (tenant?.branding ?? {}) as { companyDisplayName?: string; logoKey?: string | null };

    const idsDeModulo = inscripcion.path.items.filter((i) => i.itemType === 'ACTIVITY').map((i) => i.itemId);

    /*
      LAS HORAS SON LA SUMA DE LOS MODULOS APROBADOS, no de todos los del programa: un modulo
      optativo que la persona no curso (porque ya cumplia el cupo de su seccion con otros) no
      aporta horas que nadie recibio. Se toma la MEJOR ejecucion por modulo, igual que
      `emitirPorEjecucion` toma la mejor nota: si alguien repitio un modulo, cuenta una vez.
    */
    const ejecuciones = idsDeModulo.length
      ? await this.prisma.forTenant(tenantId).enrollment.findMany({
          where: {
            userId: inscripcion.userId,
            status: { in: ['COMPLETED', 'PASSED'] },
            activityVersion: { activityId: { in: idsDeModulo } },
          },
          include: { activityVersion: { include: { activity: { select: { id: true, name: true } } } } },
          orderBy: { completedAt: 'desc' },
        })
      : [];
    const mejorPorModulo = new Map<string, (typeof ejecuciones)[number]>();
    for (const ejecucion of ejecuciones) {
      const activityId = ejecucion.activityVersion.activityId;
      if (!mejorPorModulo.has(activityId)) mejorPorModulo.set(activityId, ejecucion);
    }
    const horasTotales = [...mejorPorModulo.values()].reduce(
      (suma, e) => suma + (e.activityVersion.certificateHours ?? 0),
      0,
    );
    const temario = [...mejorPorModulo.values()].map((e) => ({ name: e.activityVersion.activity.name }));

    const completadoEn = inscripcion.completedAt ?? new Date();

    const snapshot: CertificateSnapshot = {
      schemaVersion: 1,
      persona: {
        fullName: usuario.fullName,
        documentType: usuario.documentType,
        documentNumber: usuario.documentNumber,
        jobTitle: usuario.jobTitle?.name ?? null,
        area: usuario.area?.name ?? null,
      },
      formacion: {
        name: inscripcion.path.name,
        code: inscripcion.path.code,
        typeName: 'Programa',
        versionNumber: 1,
        hours: horasTotales > 0 ? horasTotales : null,
        syllabus: temario,
        responsibleName: null,
        responsibleJobTitle: null,
      },
      resultado: {
        status: 'COMPLETED',
        scorePct: null,
        completedAt: completadoEn.toISOString(),
      },
      empresa: {
        name: tenant?.name ?? '',
        displayName: branding.companyDisplayName || (tenant?.name ?? ''),
        logoKey: branding.logoKey ?? null,
      },
    };

    const year = new Date().getFullYear();

    try {
      const creada = await this.prisma.txForTenant(tenantId, async (tx) => {
        const consecutivo = await this.sequence.next(tx, tenantId, 'CERTIFICATE', year);
        return tx.certificate.create({
          data: {
            tenantId,
            userId: inscripcion.userId,
            pathEnrollmentId,
            serialNumber: this.sequence.format('CERT', year, consecutivo),
            verificationCode: nuevoCodigo(),
            templateId: plantilla.id,
            templateVersion: plantilla.versionNumber,
            renderSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            validUntil: null,
          },
          select: { id: true, serialNumber: true },
        });
      });

      await this.audit.record({
        tenantId,
        userId: inscripcion.userId,
        action: 'CERTIFICATE_ISSUED',
        resourceType: 'certificates',
        resourceId: creada.id,
        newValues: { serialNumber: creada.serialNumber, pathEnrollmentId },
      });

      return { id: creada.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const previa = await this.prisma
          .forTenant(tenantId)
          .certificate.findFirst({ where: { pathEnrollmentId }, select: { id: true } });
        return previa ?? null;
      }
      throw error;
    }
  }

  /**
   * La constancia que se puede ver, con lo que hace falta para pintarla.
   *
   * `verificationCode` es lo que llega de la pantalla publica: **sin sesion y sin tenant**, asi que
   * la busqueda no puede pasar por RLS —no hay tenant que fijar hasta que se encuentra la fila—.
   * Es seguro porque el codigo es aleatorio de 20 caracteres: no se puede enumerar.
   */
  async porCodigo(verificationCode: string) {
    const certificado = await this.prisma.certificate.findUnique({
      where: { verificationCode: verificationCode.trim().toUpperCase() },
      select: {
        id: true,
        serialNumber: true,
        issuedAt: true,
        validUntil: true,
        revokedAt: true,
        revokedReason: true,
        renderSnapshot: true,
      },
    });
    if (!certificado) throw new NotFoundException({ code: 'CERTIFICATE_NOT_FOUND' });

    const snapshot = certificado.renderSnapshot as unknown as CertificateSnapshot;
    const vencido = certificado.validUntil !== null && certificado.validUntil.getTime() < Date.now();

    /*
      SE DEVUELVE MENOS DE LO QUE SE GUARDA. Esta respuesta es publica: la ve cualquiera que tenga
      el codigo, incluida otra empresa. Va lo que hace falta para confirmar que el papel es
      autentico —quien, que, cuando, cuantas horas— y NO va la cedula completa ni el area ni la
      nota. Quien tiene el papel delante ya los ve; quien no, no tiene por que.

      La cedula se enmascara en vez de omitirse porque sin ella no se puede confirmar que la
      constancia es de la persona que uno tiene delante, que es justo lo que se esta verificando.
    */
    return {
      valido: certificado.revokedAt === null && !vencido,
      estado: certificado.revokedAt !== null ? 'REVOCADA' : vencido ? 'VENCIDA' : 'VIGENTE',
      serialNumber: certificado.serialNumber,
      issuedAt: certificado.issuedAt,
      validUntil: certificado.validUntil,
      revokedReason: certificado.revokedAt !== null ? certificado.revokedReason : null,
      persona: {
        fullName: snapshot.persona.fullName,
        documentNumber: enmascarar(snapshot.persona.documentNumber),
      },
      formacion: {
        name: snapshot.formacion.name,
        hours: snapshot.formacion.hours,
      },
      empresa: { displayName: snapshot.empresa.displayName },
      resultado: { completedAt: snapshot.resultado.completedAt },
    };
  }

  /** Las constancias de una persona, para su propio expediente. */
  async mias(tenantId: string, userId: string) {
    const filas = await this.prisma.forTenant(tenantId).certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        serialNumber: true,
        verificationCode: true,
        issuedAt: true,
        validUntil: true,
        revokedAt: true,
        renderSnapshot: true,
      },
    });
    return filas.map((fila) => {
      const snapshot = fila.renderSnapshot as unknown as CertificateSnapshot;
      return {
        id: fila.id,
        serialNumber: fila.serialNumber,
        verificationCode: fila.verificationCode,
        issuedAt: fila.issuedAt,
        validUntil: fila.validUntil,
        revoked: fila.revokedAt !== null,
        activityName: snapshot.formacion.name,
        hours: snapshot.formacion.hours,
        /**
         * "Programa" o el nombre del tipo de la formacion (Induccion general, Pildora...). Sin
         * esto, una constancia de programa y una de formacion suelta se veian identicas en el
         * expediente: mismo nombre, mismas horas, ningun campo que dijera de cual de las dos
         * viene. Lo pregunto el cliente mirando la lista y no la respuesta era clara.
         */
        typeName: snapshot.formacion.typeName,
      };
    });
  }

  /**
   * REVOCAR, no borrar (Decision #14 y politica de retencion).
   *
   * Una constancia emitida por error se anula; no se hace desaparecer. Borrarla dejaria un hueco
   * en la serie —CERT-2026-000122 y 000124 sin nada en medio— que es exactamente lo que un auditor
   * pregunta. Anulada, la verificacion publica dice "REVOCADA" y con su motivo, que es la respuesta
   * util para quien tiene el papel en la mano.
   *
   * Exige MOTIVO: una revocacion sin explicacion es indefendible seis meses despues.
   */
  async revocar(tenantId: string, actorId: string, id: string, motivo: string) {
    const certificado = await this.prisma.forTenant(tenantId).certificate.findUnique({
      where: { id },
      select: { id: true, revokedAt: true, userId: true, serialNumber: true },
    });
    if (!certificado) throw new NotFoundException({ code: 'CERTIFICATE_NOT_FOUND' });
    if (certificado.revokedAt !== null) return { ok: true as const };

    await this.prisma.forTenant(tenantId).certificate.update({
      where: { id },
      data: { revokedAt: new Date(), revokedBy: actorId, revokedReason: motivo },
    });

    await this.audit.record({
      tenantId,
      userId: actorId,
      action: 'CERTIFICATE_REVOKED',
      resourceType: 'certificates',
      resourceId: id,
      newValues: { serialNumber: certificado.serialNumber, motivo, afectado: certificado.userId },
    });

    return { ok: true as const };
  }

  /** El snapshot completo, para dibujar el PDF. Solo para quien puede verlo. */
  async paraImprimir(tenantId: string, id: string) {
    const certificado = await this.prisma.forTenant(tenantId).certificate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        serialNumber: true,
        verificationCode: true,
        issuedAt: true,
        revokedAt: true,
        renderSnapshot: true,
      },
    });
    if (!certificado) throw new NotFoundException({ code: 'CERTIFICATE_NOT_FOUND' });
    return certificado;
  }

  /**
   * La plantilla que rige hoy en esta empresa.
   *
   * Se coge la ACTIVA mas reciente. Si mañana se activa otra, las ya emitidas no cambian: cada
   * constancia guarda `templateId` y `templateVersion`, asi que se puede reimprimir exactamente
   * como se entrego.
   */
  private async plantillaActiva(tenantId: string) {
    return this.prisma.forTenant(tenantId).certificateTemplate.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, versionNumber: true },
    });
  }

  /**
   * La MEJOR nota de los intentos de esta ejecucion, o `null` si no hubo examen.
   *
   * La mejor y no la ultima: si alguien aprobo con 95 y luego repaso el examen sacando 80 por
   * curiosidad, lo que acredito fue 95. Y `null` no es 0 — imprimir "0%" donde no hubo evaluacion
   * diria que la persona la fallo.
   */
  private async mejorNota(tenantId: string, enrollmentId: string): Promise<number | null> {
    const mejor = await this.prisma.forTenant(tenantId).attempt.findFirst({
      where: { enrollmentId, score: { not: null } },
      orderBy: { score: 'desc' },
      select: { score: true },
    });
    // `Decimal` de Prisma: se pasa a numero aqui y no en la pantalla, para que el snapshot guarde
    // un valor JSON de verdad y no un objeto que al releerlo sea '{"s":1,"e":1,...}'.
    return mejor?.score == null ? null : Number(mejor.score);
  }
}

/** "1102886093" -> "110***6093". Confirma sin publicar el numero entero. */
function enmascarar(documento: string): string {
  if (documento.length <= 6) return '***';
  return `${documento.slice(0, 3)}***${documento.slice(-4)}`;
}

