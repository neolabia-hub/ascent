import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { CompletionService } from '../learning/completion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { caducaEn, generarCodigo, normalizar, segundosRestantes, vigente } from './codigo-de-sesion.js';
import { cierraPorLista } from './cierre-de-la-jornada.js';

/**
 * LOS MECANISMOS 2 Y 3 DE LA ASISTENCIA (`PENDIENTES` 2.4, CLAUDE.md §3.7).
 *
 * ─── QUE SON, Y QUE SIGUEN SIENDO EL MISMO HECHO ───
 *
 *   2. **QR de sesion**: el instructor proyecta un codigo que rota; cada quien lo escanea con su
 *      telefono y queda su sello de tiempo, no una marca que puso alguien despues de memoria.
 *   3. **Firma en pantalla**: ademas de escanear, se firma con el dedo. Lo que queda es una imagen
 *      atada a esa persona y esa jornada, y con ella el sistema puede generar el ACTA en PDF.
 *
 * Los tres mecanismos escriben en `attendance_records` y solo cambian de `method`. Por eso esto no
 * toca la lista del instructor: cerrar una formacion sigue pasando por el mismo sitio
 * (`completion.cerrarPorAsistencia`), y el informe, la constancia y la obligacion no se enteran de
 * por que puerta entro la marca. Una segunda forma de cerrar formaciones seria una segunda verdad.
 *
 * ─── LAS COMPUERTAS, Y POR QUE ESTAS Y NO OTRAS ───
 *
 *   · La jornada tiene que **cerrarse por lista** y estar publicada. Es la misma condicion que la
 *     lista del instructor (#158): si esta formacion se acredita completando el contenido, escanear
 *     un QR no acredita nada.
 *   · El codigo tiene que estar **vigente**. Sin esto el QR fotografiado vale para siempre y la
 *     evidencia dice lo contrario de lo que paso.
 *   · Y la persona tiene que estar **inscrita en esa jornada**. Quien llega sin convocar existe —y
 *     es normal— pero inscribir a alguien es un acto del instructor, no algo que se haga solo
 *     escaneando: si bastara con el codigo, cualquiera con la foto entraria a la lista de una
 *     jornada a la que no fue convocado, que es justo el agujero que la rotacion viene a cerrar.
 *
 * ─── QUIEN ESCRIBE SOBRE QUIEN ───
 *
 * Siempre sobre **la persona de la sesion**, nunca sobre una que venga en el cuerpo. `attendance:sign`
 * lo tiene todo el mundo; si ademas dejara elegir a quien marcar, seria el permiso del instructor
 * con otro nombre.
 */

const firmaSchema = z.object({
  codigo: z.string().min(1).max(20),
  /** La clave que devolvio `POST /media/firma`. La imagen no viaja por aqui. */
  firmaKey: z.string().min(1).max(500),
});

@Injectable()
export class AsistenciaEnSalaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * ABRIR (O ROTAR) EL CODIGO DE LA SESION.
   *
   * Devuelve el QR ya dibujado como imagen: la pantalla no tiene que saber generar codigos de
   * barras, y asi el mismo dato sirve para proyectarlo y para dictarlo en voz alta.
   *
   * Si el codigo de la jornada sigue vigente se DEVUELVE EL MISMO en vez de emitir otro: abrir dos
   * veces la pantalla —o que el instructor recargue— no puede invalidar el que la gente esta
   * escaneando en ese momento.
   */
  async abrirSesion(actor: AuthUser, offeringId: string, ahora = new Date()) {
    const offering = await this.exigirJornadaQueTomaLista(offeringId);

    let codigo = offering.sessionCode;
    let caduca = offering.sessionCodeExpiresAt;

    if (!codigo || !vigente(caduca, ahora)) {
      codigo = generarCodigo();
      caduca = caducaEn(ahora);
      await this.prisma.scoped.offering.update({
        where: { id: offeringId },
        data: { sessionCode: codigo, sessionCodeExpiresAt: caduca },
      });
      await this.audit.record({
        tenantId: this.prisma.currentTenantId,
        userId: actor.id,
        action: 'OFFERING_SESSION_CODE_OPENED',
        resourceType: 'offerings',
        resourceId: offeringId,
        newValues: { expiresAt: caduca.toISOString() },
      });
    }

    return {
      codigo,
      expiraEn: caduca,
      segundos: segundosRestantes(caduca, ahora),
      /*
        EL QR LLEVA LA DIRECCION COMPLETA y no solo el codigo: escanear con la camara del telefono
        tiene que ABRIR la pantalla, no enseñar seis letras que despues hay que teclear en algun
        sitio. Quien no pueda escanear las teclea, que para eso el codigo se puede dictar.
      */
      qr: await toDataURL(`${process.env.FRONTEND_URL ?? 'http://localhost:3200'}/asistencia/${codigo}`, {
        margin: 1,
        width: 512,
      }),
    };
  }

  /** Cerrar la sesion a mano: el codigo deja de servir aunque no haya caducado. */
  async cerrarSesion(actor: AuthUser, offeringId: string) {
    await this.exigirJornadaQueTomaLista(offeringId);
    await this.prisma.scoped.offering.update({
      where: { id: offeringId },
      data: { sessionCode: null, sessionCodeExpiresAt: null },
    });
    await this.audit.record({
      tenantId: this.prisma.currentTenantId,
      userId: actor.id,
      action: 'OFFERING_SESSION_CODE_CLOSED',
      resourceType: 'offerings',
      resourceId: offeringId,
    });
    return { ok: true as const };
  }

  /**
   * QUE JORNADA ES ESTE CODIGO — antes de marcar nada.
   *
   * La pantalla del aprendiz lo pregunta al abrirse para poder decir a que se esta apuntando: marcar
   * asistencia a ciegas y enterarse despues por un mensaje de exito es como se firma lo que no se
   * ha leido.
   */
  async jornadaDelCodigo(codigo: string, ahora = new Date()) {
    const offering = await this.buscarPorCodigo(codigo, ahora);
    return {
      offeringId: offering.id,
      code: offering.code,
      formacion: offering.activityVersion.activity.name,
      fecha: offering.scheduledDate,
      lugar: offering.location,
      segundos: segundosRestantes(offering.sessionCodeExpiresAt, ahora),
    };
  }

  /**
   * SI YA ESTOY MARCADO EN ESTA JORNADA.
   *
   * La pantalla lo pregunta para no ofrecer dos veces lo mismo: a quien ya escaneo se le ofrece
   * firmar, y a quien ya firmo no se le ofrece nada — solo se le dice que quedo.
   */
  async loMio(actor: AuthUser, codigo: string, ahora = new Date()) {
    const offering = await this.buscarPorCodigo(codigo, ahora);
    const marca = await this.prisma.scoped.attendanceRecord.findUnique({
      where: { offeringId_userId: { offeringId: offering.id, userId: actor.id } },
      select: { status: true, method: true, checkedAt: true, signatureKey: true },
    });
    return {
      marcada: Boolean(marca),
      estado: marca?.status ?? null,
      metodo: marca?.method ?? null,
      cuando: marca?.checkedAt ?? null,
      firmada: Boolean(marca?.signatureKey),
    };
  }

  /** MECANISMO 2: escaneo el QR y quedo presente, con mi sello de tiempo. */
  async registrarme(actor: AuthUser, codigo: string, ahora = new Date()) {
    const offering = await this.buscarPorCodigo(codigo, ahora);
    return this.marcarme(actor, offering.id, 'QR', null, ahora);
  }

  /** MECANISMO 3: ademas firmo, y la firma queda atada a mi asistencia de esta jornada. */
  async firmar(actor: AuthUser, body: unknown, ahora = new Date()) {
    const input = firmaSchema.parse(body);
    const offering = await this.buscarPorCodigo(input.codigo, ahora);
    return this.marcarme(actor, offering.id, 'SIGNATURE', input.firmaKey, ahora);
  }

  /**
   * LO QUE HACEN LOS DOS POR DEBAJO, que es lo mismo salvo el metodo y la firma.
   *
   * `upsert` sobre (jornada, persona) como la lista del instructor: alguien que escanea y despues
   * firma no crea dos filas, actualiza la suya. Y firmar despues de escanear SUBE el metodo a
   * SIGNATURE —es mas evidencia, no menos— mientras que volver a escanear tras haber firmado no lo
   * baja: la firma ya existe y borrar el metodo que la explica dejaria una imagen huerfana.
   */
  private async marcarme(
    actor: AuthUser,
    offeringId: string,
    metodo: 'QR' | 'SIGNATURE',
    firmaKey: string | null,
    ahora: Date,
  ) {
    const tenantId = this.prisma.currentTenantId;

    const inscripcion = await this.prisma.scoped.enrollment.findFirst({
      where: { offeringId, userId: actor.id },
      select: { id: true, status: true },
    });
    if (!inscripcion) {
      throw new ConflictException({
        code: 'NOT_ENROLLED',
        message:
          'No estas en la lista de esta jornada. Pideselo a quien la esta dictando: inscribirte es un acto suyo, no algo que se resuelva escaneando.',
      });
    }

    const previa = await this.prisma.scoped.attendanceRecord.findUnique({
      where: { offeringId_userId: { offeringId, userId: actor.id } },
      select: { method: true, signatureKey: true },
    });
    const metodoFinal = previa?.method === 'SIGNATURE' && metodo === 'QR' ? 'SIGNATURE' : metodo;

    await this.prisma.scoped.attendanceRecord.upsert({
      where: { offeringId_userId: { offeringId, userId: actor.id } },
      create: {
        tenantId,
        offeringId,
        userId: actor.id,
        status: 'PRESENT',
        method: metodoFinal,
        checkedAt: ahora,
        // `markedBy` queda NULO a proposito: nadie la marco. Escribir el propio id diria que esta
        // persona se marco a si misma como si fuera un instructor, y la columna existe justo para
        // distinguir quien tomo la lista.
        markedBy: null,
        signatureKey: firmaKey,
      },
      update: {
        status: 'PRESENT',
        method: metodoFinal,
        checkedAt: ahora,
        markedBy: null,
        ...(firmaKey ? { signatureKey: firmaKey } : {}),
      },
    });

    /*
      Y SE CIERRA POR EL MISMO SITIO QUE LA LISTA DEL INSTRUCTOR.

      Aqui no se pasa certificado: el papel de un tercero lo registra quien toma la lista o quien
      abre la ficha de la persona (2.1 y 2.2). Escaneando un QR nadie teclea el numero de su
      certificado de alturas.
    */
    const resultado = await this.completion.cerrarPorAsistencia(this.prisma.scoped, tenantId, {
      enrollmentId: inscripcion.id,
      attendedAt: ahora,
      certificado: null,
    });

    await this.audit.record({
      tenantId,
      userId: actor.id,
      action: metodoFinal === 'SIGNATURE' ? 'ATTENDANCE_SIGNED' : 'ATTENDANCE_SELF_CHECKED',
      resourceType: 'offerings',
      resourceId: offeringId,
      newValues: { method: metodoFinal, checkedAt: ahora.toISOString(), firmada: Boolean(firmaKey) },
    });

    return {
      ok: true as const,
      metodo: metodoFinal,
      cerrada: resultado.closed,
      firmada: Boolean(firmaKey ?? previa?.signatureKey),
    };
  }

  /**
   * LA JORNADA DE UN CODIGO VIGENTE.
   *
   * El mensaje distingue el codigo que NO EXISTE del que CADUCO, y no es un detalle: son dos cosas
   * distintas para quien esta delante. Uno se arregla mirando bien la pantalla; el otro, esperando
   * tres segundos a que rote. Decir "codigo invalido" a los dos manda a la gente a preguntarle al
   * instructor por algo que se resuelve solo.
   */
  private async buscarPorCodigo(codigo: string, ahora: Date) {
    const limpio = normalizar(codigo);
    const offering = await this.prisma.scoped.offering.findFirst({
      where: { sessionCode: limpio },
      select: {
        id: true,
        code: true,
        status: true,
        kind: true,
        modality: true,
        closesByAttendance: true,
        scheduledDate: true,
        location: true,
        sessionCodeExpiresAt: true,
        activityVersion: { select: { activity: { select: { name: true } } } },
      },
    });
    if (!offering) {
      throw new NotFoundException({
        code: 'SESSION_CODE_NOT_FOUND',
        message: 'Ese código no es de ninguna jornada abierta. Revisa que lo hayas escrito bien.',
      });
    }
    if (!vigente(offering.sessionCodeExpiresAt, ahora)) {
      throw new ConflictException({
        code: 'SESSION_CODE_EXPIRED',
        message: 'Ese código ya caducó. El de la pantalla cambia cada minuto y medio: mira el nuevo.',
      });
    }
    return offering;
  }

  /** Las condiciones de la jornada, iguales que las de la lista del instructor (#158). */
  private async exigirJornadaQueTomaLista(offeringId: string) {
    const offering = await this.prisma.scoped.offering.findUnique({
      where: { id: offeringId },
      select: {
        id: true,
        status: true,
        kind: true,
        modality: true,
        closesByAttendance: true,
        sessionCode: true,
        sessionCodeExpiresAt: true,
      },
    });
    if (!offering) throw new NotFoundException({ code: 'OFFERING_NOT_FOUND' });
    if (offering.status === 'DRAFT' || offering.status === 'CANCELLED') {
      throw new ConflictException({ code: 'OFFERING_NOT_ATTENDABLE', status: offering.status });
    }
    if (!cierraPorLista(offering)) {
      throw new ConflictException({
        code: 'OFFERING_NOT_ATTENDABLE',
        message:
          'Esta jornada no se cierra con lista: se acredita con lo que cada persona complete en la plataforma.',
      });
    }
    return offering;
  }
}
