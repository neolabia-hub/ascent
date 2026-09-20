import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../src/common/audit.service.js';
import { CLS_TENANT_ID } from '../src/common/request-context.js';
import { SequenceService } from '../src/common/sequence.service.js';
import { CertificatesService } from '../src/certificates/certificates.service.js';
import type { AssignmentsService } from '../src/assignments/assignments.service.js';
import type { AudiencesService } from '../src/assignments/audiences.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProgramsService } from '../src/programs/programs.service.js';
import { ReportsService } from '../src/reports/reports.service.js';

/**
 * PROGRAMAS: LA MATRIZ ENTERA, contra la base de desarrollo (2026-09-15).
 *
 * Las reglas puras ya tienen sus pruebas unitarias (`program-completion.spec.ts`: `evaluarPrograma`,
 * `cicloDePrograma`, `moduloAprobado`). Lo que NO se podia probar ahi es lo que pasa cuando esas
 * reglas se juntan con la base: que se escribe, que NO se escribe, y que pasa en las esquinas —un
 * modulo en dos programas, un programa que cambia de forma despues de que alguien lo completo, una
 * ronda que se abre a medias—.
 *
 * Sustituye a `verificar-constancia-programa.ts`, que cubria solo el escenario B.
 *
 * SE INSTANCIAN LOS SERVICIOS A MANO, sin `Test.createTestingModule`: `tsx` (esbuild) no emite
 * `design:paramtypes`, el metadato del que depende la inyeccion por decoradores, asi que el DI de
 * Nest deja las dependencias en `undefined` SIN lanzar ningun error. Esta anotado en el RUNBOOK.
 * Fuera de aqui no cambia nada: la API real corre compilada con `tsc`.
 *
 * Todo lo que crea lo BORRA al terminar, haya ido bien o mal. Los nombres llevan la firma
 * `E2E<digitos>` pegada, que es lo que reconoce `limpiar-datos-de-prueba.ts` por si algo escapa.
 *
 *   pnpm --filter @neo-pulse/api dev:verificar-programas
 */

const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
const cls = new ClsService(new AsyncLocalStorage());
const prisma = new PrismaService(cls);
const audit = new AuditService(prisma);
const sequence = new SequenceService();
const certificates = new CertificatesService(prisma, sequence, audit);
const programs = new ProgramsService(prisma, certificates, {} as AssignmentsService, {} as AudiencesService);
const reports = new ReportsService(prisma);

const FIRMA = `E2E${Date.now()}`;
let tenantId = '';
const creado = { userIds: [] as string[], activityIds: [] as string[], pathIds: [] as string[], audienceIds: [] as string[] };

let pasadas = 0;
const fallos: string[] = [];

function comprobar(condicion: boolean, mensaje: string): void {
  if (condicion) {
    pasadas += 1;
    console.log(`    ok  ${mensaje}`);
  } else {
    fallos.push(mensaje);
    console.log(`    FALLO  ${mensaje}`);
  }
}

/** El contexto de tenant que necesita `prisma.scoped`. Se re-entra antes de cada llamada real. */
function enTenant(): void {
  cls.enterWith({});
  cls.set(CLS_TENANT_ID, tenantId);
}

// ─────────────────────────────── Montaje ───────────────────────────────

interface Catalogo {
  processId: string;
  jobTitleId: string;
  areaId: string;
  activityTypeId: string;
  roleId: string;
}

async function catalogo(): Promise<Catalogo> {
  const [proceso, cargo, area, tipo, rol] = await Promise.all([
    owner.process.findFirstOrThrow({ where: { tenantId } }),
    owner.jobTitle.findFirstOrThrow({ where: { tenantId } }),
    owner.area.findFirstOrThrow({ where: { tenantId } }),
    owner.activityType.findFirstOrThrow({ where: { tenantId, code: 'INDUCCION_ESPECIFICA' } }),
    owner.role.findFirstOrThrow({ where: { tenantId, code: 'USUARIO' } }),
  ]);
  return { processId: proceso.id, jobTitleId: cargo.id, areaId: area.id, activityTypeId: tipo.id, roleId: rol.id };
}

let secuencia = 0;
function siguiente(): string {
  secuencia += 1;
  return `${FIRMA}${String(secuencia).padStart(3, '0')}`;
}

async function crearUsuario(cat: Catalogo): Promise<string> {
  const doc = siguiente();
  const usuario = await owner.user.create({
    data: {
      tenantId,
      documentNumber: doc,
      fullName: `Usuario ${doc}`,
      email: `${doc.toLowerCase()}@example.test`,
      passwordHash: 'x',
      jobTitleId: cat.jobTitleId,
      areaId: cat.areaId,
      roleId: cat.roleId,
    },
  });
  creado.userIds.push(usuario.id);
  return usuario.id;
}

interface Modulo {
  activityId: string;
  versionId: string;
  offeringId: string;
}

async function crearActividad(cat: Catalogo, horas = 4): Promise<Modulo> {
  const codigo = siguiente();
  const actividad = await owner.activity.create({
    data: {
      tenantId,
      code: codigo,
      name: `Modulo ${codigo}`,
      activityTypeId: cat.activityTypeId,
      processId: cat.processId,
      issuesCertificate: true,
      certificateHours: horas,
    },
  });
  creado.activityIds.push(actividad.id);

  const version = await owner.activityVersion.create({
    data: {
      tenantId,
      activityId: actividad.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      passingScore: 0,
      maxAttempts: 1,
      issuesCertificate: true,
      certificateHours: horas,
    },
  });
  await owner.activity.update({ where: { id: actividad.id }, data: { currentVersionId: version.id } });

  const oferta = await owner.offering.create({
    data: { tenantId, activityVersionId: version.id, code: `${codigo}-OF`, kind: 'PERMANENT', modality: 'VIRTUAL', status: 'PUBLISHED' },
  });

  return { activityId: actividad.id, versionId: version.id, offeringId: oferta.id };
}

async function crearPrograma(publicado = true): Promise<string> {
  const codigo = siguiente();
  const programa = await owner.learningPath.create({
    data: { tenantId, code: codigo, name: `Programa ${codigo}`, status: publicado ? 'PUBLISHED' : 'DRAFT', active: true },
  });
  creado.pathIds.push(programa.id);
  return programa.id;
}

async function agregarModulo(
  pathId: string,
  modulo: Modulo,
  opciones: { isRequired?: boolean; sectionName?: string; minRequiredInSection?: number; displayOrder?: number } = {},
): Promise<void> {
  await owner.pathItem.create({
    data: {
      tenantId,
      pathId,
      itemType: 'ACTIVITY',
      itemId: modulo.activityId,
      isRequired: opciones.isRequired ?? true,
      sectionName: opciones.sectionName ?? null,
      minRequiredInSection: opciones.minRequiredInSection ?? null,
      displayOrder: opciones.displayOrder ?? 0,
    },
  });
}

/** Cierra el modulo para esa persona: una inscripcion COMPLETED, que es lo que el programa lee. */
async function aprobar(userId: string, modulo: Modulo): Promise<string> {
  const inscripcion = await owner.enrollment.create({
    data: {
      tenantId,
      offeringId: modulo.offeringId,
      userId,
      activityVersionId: modulo.versionId,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  return inscripcion.id;
}

/** La obligacion que el motor habria creado, en la ronda que se pida. */
async function obligacion(userId: string, modulo: Modulo, cycleNumber: number, status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'WAIVED'): Promise<void> {
  await owner.assignment.create({
    data: {
      tenantId,
      userId,
      targetType: 'ACTIVITY',
      targetId: modulo.activityId,
      source: 'RULE',
      cycleNumber,
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  });
}

async function recalcular(userId: string, pathId: string) {
  enTenant();
  return programs.recalcularProgreso(tenantId, userId, pathId);
}

async function constanciasDePrograma(userId: string): Promise<number> {
  return owner.certificate.count({ where: { tenantId, userId, pathEnrollmentId: { not: null } } });
}

// ─────────────────────────────── Escenarios ───────────────────────────────

/** A. ¿Quien certifica, el modulo o el programa? Es la decision que suprime la constancia individual. */
async function escenarioA(cat: Catalogo): Promise<void> {
  console.log('\nA. La supresion de la constancia individual');

  const sueltaM = await crearActividad(cat);
  enTenant();
  comprobar(
    (await programs.esModuloDeUnProgramaPublicado(sueltaM.activityId)) === false,
    'A1 una formacion que no esta en ningun programa certifica sola',
  );

  const borrador = await crearPrograma(false);
  const enBorradorM = await crearActividad(cat);
  await agregarModulo(borrador, enBorradorM);
  enTenant();
  comprobar(
    (await programs.esModuloDeUnProgramaPublicado(enBorradorM.activityId)) === false,
    'A2 modulo de un programa en BORRADOR sigue certificando solo (un borrador no compromete a nadie)',
  );

  const publicado = await crearPrograma(true);
  const enPublicadoM = await crearActividad(cat);
  await agregarModulo(publicado, enPublicadoM);
  enTenant();
  comprobar(
    (await programs.esModuloDeUnProgramaPublicado(enPublicadoM.activityId)) === true,
    'A3 modulo de un programa PUBLICADO deja de certificar solo',
  );

  // Despublicar devuelve la constancia individual: es la regla escrita en PENDIENTES 11.
  await owner.learningPath.update({ where: { id: publicado }, data: { status: 'DRAFT' } });
  enTenant();
  comprobar(
    (await programs.esModuloDeUnProgramaPublicado(enPublicadoM.activityId)) === false,
    'A4 al despublicar el programa, su modulo vuelve a certificar solo',
  );
  await owner.learningPath.update({ where: { id: publicado }, data: { status: 'PUBLISHED' } });

  // Un modulo en DOS programas: basta que UNO este publicado.
  const segundo = await crearPrograma(false);
  await agregarModulo(segundo, enPublicadoM);
  enTenant();
  comprobar(
    (await programs.esModuloDeUnProgramaPublicado(enPublicadoM.activityId)) === true,
    'A5 modulo en dos programas, uno publicado y otro no: no certifica solo',
  );

}

/** B. El camino normal: a medias no emite, al completar emite una, y repetir no duplica. */
async function escenarioB(cat: Catalogo): Promise<void> {
  console.log('\nB. Completar un programa y su constancia');

  const userId = await crearUsuario(cat);
  const pathId = await crearPrograma();
  const m1 = await crearActividad(cat, 4);
  const m2 = await crearActividad(cat, 6);
  await agregarModulo(pathId, m1, { displayOrder: 0 });
  await agregarModulo(pathId, m2, { displayOrder: 1 });

  const vacio = await recalcular(userId, pathId);
  comprobar(vacio?.completo === false && vacio?.progressPct === 0, 'B1 sin aprobar nada: 0% y no completo');
  comprobar((await constanciasDePrograma(userId)) === 0, 'B2 sin aprobar nada no hay constancia');

  await aprobar(userId, m1);
  const medias = await recalcular(userId, pathId);
  comprobar(medias?.progressPct === 50, `B3 con 1 de 2 modulos: 50% (salio ${medias?.progressPct})`);
  comprobar(medias?.recienCompletado === false, 'B4 con 1 de 2 el programa NO se da por completo');
  comprobar((await constanciasDePrograma(userId)) === 0, 'B5 a medias no se emite constancia de programa');

  await aprobar(userId, m2);
  const completo = await recalcular(userId, pathId);
  comprobar(completo?.completo === true, 'B6 con 2 de 2 el programa completa');
  comprobar(completo?.recienCompletado === true, 'B7 recienCompletado es true justo en el cierre');
  comprobar((await constanciasDePrograma(userId)) === 1, 'B8 al completar se emite UNA constancia de programa');

  const inscripcion = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId, userId }, orderBy: { cycleNumber: 'desc' } });
  const constancia = await owner.certificate.findFirstOrThrow({ where: { pathEnrollmentId: inscripcion.id } });
  comprobar(constancia.enrollmentId === null, 'B9 la constancia del programa no lleva enrollmentId (no es de una jornada)');
  comprobar(constancia.validUntil === null, 'B10 el programa no tiene vigencia propia: validUntil queda null');

  const snapshot = constancia.renderSnapshot as {
    formacion: { name: string; typeName: string; hours: number | null; syllabus: Array<{ name: string }> };
  };
  comprobar(snapshot.formacion.typeName === 'Programa', 'B11 el snapshot dice "Programa" como tipo');
  comprobar(snapshot.formacion.hours === 10, `B12 las horas son la suma de los modulos aprobados, 4+6=10 (salio ${snapshot.formacion.hours})`);
  comprobar(snapshot.formacion.syllabus?.length === 2, 'B13 el snapshot lista sus DOS modulos (el campo "Modulos" de la plantilla)');

  const segunda = await recalcular(userId, pathId);
  comprobar(segunda?.recienCompletado === false, 'B14 un segundo recalculo ya no dice recienCompletado');
  comprobar((await constanciasDePrograma(userId)) === 1, 'B15 un segundo recalculo NO emite una segunda constancia (idempotente)');

  const fechaOriginal = inscripcion.completedAt?.getTime();
  const trasRecalcular = await owner.pathEnrollment.findFirstOrThrow({ where: { id: inscripcion.id } });
  comprobar(trasRecalcular.completedAt?.getTime() === fechaOriginal, 'B16 recalcular no pisa la fecha de cierre que ya tenia');
}

/** C. El caso que pidio el cliente: uno obligatorio si o si, y cupo sobre el resto. */
async function escenarioC(cat: Catalogo): Promise<void> {
  console.log('\nC. Obligatorio + cupo por seccion');

  const pathId = await crearPrograma();
  const obligatorio = await crearActividad(cat);
  const op1 = await crearActividad(cat);
  const op2 = await crearActividad(cat);
  const op3 = await crearActividad(cat);
  await agregarModulo(pathId, obligatorio, { isRequired: true, displayOrder: 0 });
  for (const [i, op] of [op1, op2, op3].entries()) {
    await agregarModulo(pathId, op, { isRequired: false, sectionName: 'opcionales', minRequiredInSection: 2, displayOrder: i + 1 });
  }

  // Primero: los tres opcionales SIN el obligatorio. El cupo esta de sobra y aun asi no completa.
  const sinObligatorio = await crearUsuario(cat);
  for (const op of [op1, op2, op3]) await aprobar(sinObligatorio, op);
  const r1 = await recalcular(sinObligatorio, pathId);
  comprobar(r1?.completo === false, 'C1 los tres opcionales no compensan el obligatorio que falta');
  comprobar(r1?.obligatoriosPendientes.length === 1, 'C2 y el obligatorio aparece como pendiente');
  comprobar((await constanciasDePrograma(sinObligatorio)) === 0, 'C3 sin el obligatorio no hay constancia');

  // Segundo: el obligatorio + DOS opcionales. Completa sin haber hecho el tercero.
  const conCupo = await crearUsuario(cat);
  await aprobar(conCupo, obligatorio);
  await aprobar(conCupo, op1);
  const aMedias = await recalcular(conCupo, pathId);
  comprobar(aMedias?.completo === false, 'C4 con el obligatorio y UN opcional todavia no llega al cupo de 2');

  await aprobar(conCupo, op2);
  const conCuota = await recalcular(conCupo, pathId);
  comprobar(conCuota?.completo === true, 'C5 obligatorio + 2 de 3 opcionales: completa sin hacer el tercero');
  comprobar((await constanciasDePrograma(conCupo)) === 1, 'C6 y emite su constancia');

  const inscripcion = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId, userId: conCupo }, orderBy: { cycleNumber: 'desc' } });
  const constancia = await owner.certificate.findFirstOrThrow({ where: { pathEnrollmentId: inscripcion.id } });
  const snapshot = constancia.renderSnapshot as { formacion: { syllabus: Array<{ name: string }> } };
  comprobar(
    snapshot.formacion.syllabus?.length === 3,
    `C7 la constancia lista los 3 modulos que SI hizo, no los 4 del programa (salieron ${snapshot.formacion.syllabus?.length})`,
  );
}

/** D. Reinduccion como programa: la ronda nueva no pisa la anterior (11.6). */
async function escenarioD(cat: Catalogo): Promise<void> {
  console.log('\nD. Rondas: la reinduccion que vuelve a pedirse');

  const userId = await crearUsuario(cat);
  const pathId = await crearPrograma();
  const m1 = await crearActividad(cat);
  const m2 = await crearActividad(cat);
  await agregarModulo(pathId, m1, { displayOrder: 0 });
  await agregarModulo(pathId, m2, { displayOrder: 1 });

  // Ronda 1: los dos modulos con su obligacion cerrada.
  await aprobar(userId, m1);
  await aprobar(userId, m2);
  await obligacion(userId, m1, 1, 'COMPLETED');
  await obligacion(userId, m2, 1, 'COMPLETED');
  const ronda1 = await recalcular(userId, pathId);
  comprobar(ronda1?.completo === true, 'D1 ronda 1 completa');
  comprobar((await constanciasDePrograma(userId)) === 1, 'D2 ronda 1 emite su constancia');

  const filaRonda1 = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId, userId, cycleNumber: 1 } });
  const constanciaRonda1 = await owner.certificate.findFirstOrThrow({ where: { pathEnrollmentId: filaRonda1.id } });

  // Se abre la ronda 2 de UN SOLO modulo, que es como pasa de verdad: cada modulo tiene su propia
  // ventana y no se abren todos el mismo dia.
  await obligacion(userId, m1, 2, 'PENDING');
  const ronda2Abierta = await recalcular(userId, pathId);
  comprobar(ronda2Abierta?.completo === false, 'D3 al abrirse la ronda 2 de un modulo, el programa deja de estar completo');

  const filaRonda1Despues = await owner.pathEnrollment.findFirstOrThrow({ where: { id: filaRonda1.id } });
  comprobar(filaRonda1Despues.status === 'COMPLETED', 'D4 la fila de la ronda 1 NO se pisa: sigue COMPLETED');
  comprobar(
    filaRonda1Despues.completedAt?.getTime() === filaRonda1.completedAt?.getTime(),
    'D5 y conserva su fecha de cierre original',
  );
  const constanciaSigue = await owner.certificate.findFirst({ where: { id: constanciaRonda1.id } });
  comprobar(constanciaSigue !== null, 'D6 la constancia de la ronda 1 sigue existiendo, intacta');

  const filaRonda2 = await owner.pathEnrollment.findFirst({ where: { pathId, userId, cycleNumber: 2 } });
  comprobar(filaRonda2 !== null, 'D7 se crea una fila NUEVA para la ronda 2, no se reusa la anterior');

  // El segundo modulo todavia esta en su ronda 1 cerrada: cuenta como aprobado porque su ventana
  // no se ha abierto, y por eso los modulos caen en pendientes de uno en uno.
  comprobar(ronda2Abierta?.progressPct === 50, `D8 el modulo cuya ventana no se abrio sigue contando (50%, salio ${ronda2Abierta?.progressPct})`);

  // Se cierra la ronda 2 del primero; el segundo abre la suya y tambien se cierra.
  await owner.assignment.updateMany({ where: { userId, targetId: m1.activityId, cycleNumber: 2 }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await obligacion(userId, m2, 2, 'COMPLETED');
  const ronda2 = await recalcular(userId, pathId);
  comprobar(ronda2?.completo === true, 'D9 con los dos modulos en su ronda 2, el programa vuelve a completar');
  comprobar((await constanciasDePrograma(userId)) === 2, 'D10 y emite una SEGUNDA constancia, distinta de la primera');

  const filaRonda2Final = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId, userId, cycleNumber: 2 } });
  const constanciaRonda2 = await owner.certificate.findFirstOrThrow({ where: { pathEnrollmentId: filaRonda2Final.id } });
  comprobar(constanciaRonda2.id !== constanciaRonda1.id, 'D11 son dos constancias distintas, una por ronda');
  comprobar(constanciaRonda2.serialNumber !== constanciaRonda1.serialNumber, 'D12 con consecutivos distintos');

  const filas = await owner.pathEnrollment.count({ where: { pathId, userId } });
  comprobar(filas === 2, `D13 quedan exactamente DOS filas, una por ronda (hay ${filas})`);
}

/** E. Las esquinas: lo que pasa cuando el programa cambia de forma o alguien llega a mitad. */
async function escenarioE(cat: Catalogo): Promise<void> {
  console.log('\nE. Esquinas');

  // E1. Un programa sin modulos no revienta al recalcular.
  const vacio = await crearPrograma();
  const usuarioVacio = await crearUsuario(cat);
  const rVacio = await recalcular(usuarioVacio, vacio);
  comprobar(rVacio !== null && rVacio.progressPct === 0, 'E1 recalcular un programa sin modulos no revienta y da 0%');
  comprobar((await constanciasDePrograma(usuarioVacio)) === 0, 'E2 y un programa sin modulos no emite constancia');

  // E3. Un programa que NO existe: devuelve null en vez de lanzar.
  enTenant();
  const inexistente = await programs.recalcularProgreso(tenantId, usuarioVacio, '00000000-0000-0000-0000-000000000000');
  comprobar(inexistente === null, 'E3 recalcular un programa inexistente devuelve null, no lanza');

  // E4/E5. Agregar un modulo a un programa que alguien YA completo.
  const pathId = await crearPrograma();
  const userId = await crearUsuario(cat);
  const m1 = await crearActividad(cat);
  await agregarModulo(pathId, m1, { displayOrder: 0 });
  await aprobar(userId, m1);
  const antes = await recalcular(userId, pathId);
  comprobar(antes?.completo === true, 'E4 con su unico modulo aprobado, el programa completa');
  comprobar((await constanciasDePrograma(userId)) === 1, 'E5 y emite su constancia');

  // Agregar un modulo NO reabre a quien ya lo completo: su ronda esta cerrada y es la evidencia de
  // lo que el programa exigia ese dia. Reabrirla le daria trabajo nuevo sin papel nuevo a cambio,
  // porque el indice unico impide una segunda constancia de la misma ronda.
  const m2 = await crearActividad(cat);
  await agregarModulo(pathId, m2, { displayOrder: 1 });
  const despues = await recalcular(userId, pathId);
  comprobar(despues?.completo === true, 'E6 agregar un modulo NO reabre el programa a quien ya lo habia completado');
  const filaTrasEditar = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId, userId }, orderBy: { cycleNumber: 'desc' } });
  comprobar(filaTrasEditar.status === 'COMPLETED', 'E7 su inscripcion sigue COMPLETED: una ronda cerrada no se pisa');
  comprobar((await constanciasDePrograma(userId)) === 1, 'E8 y conserva su constancia, sin emitir ninguna otra');

  // Quien va A MEDIAS si ve el modulo nuevo: no hay evidencia emitida que proteger.
  const aMedias = await crearUsuario(cat);
  await aprobar(aMedias, m1);
  const enCurso = await recalcular(aMedias, pathId);
  comprobar(enCurso?.completo === false, 'E9 quien iba a medias SI queda sujeto al modulo nuevo');
  comprobar(enCurso?.progressPct === 50, `E10 y su avance lo refleja: 50% (salio ${enCurso?.progressPct})`);
  await aprobar(aMedias, m2);
  const cerrado = await recalcular(aMedias, pathId);
  comprobar(cerrado?.completo === true, 'E11 al aprobar los dos, completa');
  comprobar((await constanciasDePrograma(aMedias)) === 1, 'E12 y recibe su constancia, ya con el programa nuevo');

  // E11. Quitar el modulo que faltaba completa el programa: el cupo se calcula sobre lo que HAY hoy.
  const pathQuitar = await crearPrograma();
  const usuarioQuitar = await crearUsuario(cat);
  const q1 = await crearActividad(cat);
  const q2 = await crearActividad(cat);
  await agregarModulo(pathQuitar, q1, { displayOrder: 0 });
  await agregarModulo(pathQuitar, q2, { displayOrder: 1 });
  await aprobar(usuarioQuitar, q1);
  const conDos = await recalcular(usuarioQuitar, pathQuitar);
  comprobar(conDos?.completo === false, 'E13 con 1 de 2 no completa');
  await owner.pathItem.deleteMany({ where: { pathId: pathQuitar, itemId: q2.activityId } });
  const conUno = await recalcular(usuarioQuitar, pathQuitar);
  comprobar(conUno?.completo === true, 'E14 al quitar el modulo que faltaba, completa: el cupo se mide sobre los modulos de HOY');
  comprobar((await constanciasDePrograma(usuarioQuitar)) === 1, 'E15 y emite su constancia');

  // E14. El mismo modulo en DOS programas publicados: los dos avanzan con una sola aprobacion.
  const pA = await crearPrograma();
  const pB = await crearPrograma();
  const compartido = await crearActividad(cat);
  await agregarModulo(pA, compartido);
  await agregarModulo(pB, compartido);
  const usuarioCompartido = await crearUsuario(cat);
  await aprobar(usuarioCompartido, compartido);
  const rA = await recalcular(usuarioCompartido, pA);
  const rB = await recalcular(usuarioCompartido, pB);
  comprobar(rA?.completo === true && rB?.completo === true, 'E16 un modulo compartido completa LOS DOS programas con una sola aprobacion');
  comprobar((await constanciasDePrograma(usuarioCompartido)) === 2, 'E17 y emite DOS constancias, una por programa');

  // E16. Quien llega con la ronda ya avanzada: su inscripcion nace directamente en esa ronda.
  const pathTarde = await crearPrograma();
  const mTarde = await crearActividad(cat);
  await agregarModulo(pathTarde, mTarde);
  const usuarioTarde = await crearUsuario(cat);
  await obligacion(usuarioTarde, mTarde, 3, 'PENDING');
  await recalcular(usuarioTarde, pathTarde);
  const filaTarde = await owner.pathEnrollment.findFirstOrThrow({ where: { pathId: pathTarde, userId: usuarioTarde } });
  comprobar(filaTarde.cycleNumber === 3, `E18 quien entra con la ronda 3 abierta nace en la ronda 3 (salio ${filaTarde.cycleNumber})`);

  // E17. Una obligacion EXIMIDA no cuenta como aprobada: el cupo se cumple haciendo, no perdonando.
  const pathEximido = await crearPrograma();
  const mEximido = await crearActividad(cat);
  await agregarModulo(pathEximido, mEximido);
  const usuarioEximido = await crearUsuario(cat);
  await aprobar(usuarioEximido, mEximido);
  await owner.assignment.create({
    data: { tenantId, userId: usuarioEximido, targetType: 'ACTIVITY', targetId: mEximido.activityId, source: 'RULE', cycleNumber: 1, status: 'WAIVED' },
  });
  const rEximido = await recalcular(usuarioEximido, pathEximido);
  comprobar(rEximido?.completo === false, 'E19 una obligacion EXIMIDA no completa el programa, aunque haya una inscripcion aprobada antigua');
}

/** F. Lo que ve el aprendiz tiene que decir lo MISMO que decide la constancia. */
async function escenarioF(cat: Catalogo): Promise<void> {
  console.log('\nF. La vista del aprendiz coincide con el motor');

  const userId = await crearUsuario(cat);
  const pathId = await crearPrograma();
  const m1 = await crearActividad(cat);
  const m2 = await crearActividad(cat);
  await agregarModulo(pathId, m1, { displayOrder: 0 });
  await agregarModulo(pathId, m2, { displayOrder: 1 });

  await aprobar(userId, m1);
  await aprobar(userId, m2);
  await obligacion(userId, m1, 1, 'COMPLETED');
  await obligacion(userId, m2, 1, 'COMPLETED');
  await recalcular(userId, pathId);

  enTenant();
  const mios = await programs.misProgramas(userId);
  const suyo = mios.find((p) => p.id === pathId);
  comprobar(suyo !== undefined, 'F1 el programa publicado aparece en la vista del aprendiz');
  comprobar(suyo?.estado === 'COMPLETED', 'F2 con el estado COMPLETED que dejo el motor');
  comprobar(suyo?.modulos.every((m) => m.aprobado) === true, 'F3 y sus dos modulos con el visto');

  // Se abre la ronda 2 de un modulo: el aprendiz tiene que ver que ese vuelve a deberse.
  await obligacion(userId, m1, 2, 'PENDING');
  await recalcular(userId, pathId);
  enTenant();
  const trasRonda2 = (await programs.misProgramas(userId)).find((p) => p.id === pathId);
  const moduloReabierto = trasRonda2?.modulos.find((m) => m.actividad?.id === m1.activityId);
  const moduloIntacto = trasRonda2?.modulos.find((m) => m.actividad?.id === m2.activityId);
  comprobar(moduloReabierto?.aprobado === false, 'F4 el modulo cuya ronda 2 se abrio PIERDE el visto en la vista del aprendiz');
  comprobar(moduloIntacto?.aprobado === true, 'F5 y el que no ha abierto la suya lo conserva');
  comprobar(trasRonda2?.estado !== 'COMPLETED', 'F6 el programa deja de verse completo');

  /*
    UN PROGRAMA SE VE SOLO SI SE LE EXIGE. Antes se listaban TODOS los publicados, obligado o no, y
    a quien nadie le habia pedido nada se le llenaba "Mi aprendizaje" de programas ajenos.
  */
  const ajeno = await crearPrograma();
  const mAjeno = await crearActividad(cat);
  await agregarModulo(ajeno, mAjeno);
  enTenant();
  comprobar(
    (await programs.misProgramas(userId)).every((p) => p.id !== ajeno),
    'F8 un programa publicado que NO se le exige no aparece en su pantalla',
  );

  // Basta una obligacion de UN modulo para que el programa entero se vea.
  const otroUsuario = await crearUsuario(cat);
  await obligacion(otroUsuario, mAjeno, 1, 'PENDING');
  enTenant();
  comprobar(
    (await programs.misProgramas(otroUsuario)).some((p) => p.id === ajeno),
    'F9 con una obligacion de un solo modulo, el programa entero si se ve',
  );

  // Y retirarle la regla no le borra de la pantalla algo que ya empezo.
  const retirado = await crearPrograma();
  const mRetirado2 = await crearActividad(cat);
  await agregarModulo(retirado, mRetirado2);
  const usuarioConAvance = await crearUsuario(cat);
  await aprobar(usuarioConAvance, mRetirado2);
  await recalcular(usuarioConAvance, retirado);
  await owner.assignment.create({
    data: {
      tenantId,
      userId: usuarioConAvance,
      targetType: 'ACTIVITY',
      targetId: mRetirado2.activityId,
      source: 'RULE',
      cycleNumber: 1,
      status: 'WITHDRAWN_LEFT_AUDIENCE',
    },
  });
  enTenant();
  comprobar(
    (await programs.misProgramas(usuarioConAvance)).some((p) => p.id === retirado),
    'F10 a quien ya tiene avance no se le borra de la pantalla aunque le retiren la regla',
  );

  // Un programa en BORRADOR no se le ensena a nadie.
  const borrador = await crearPrograma(false);
  await agregarModulo(borrador, m1);
  enTenant();
  const conBorrador = await programs.misProgramas(userId);
  comprobar(conBorrador.every((p) => p.id !== borrador), 'F11 un programa en BORRADOR no aparece en la vista del aprendiz');
}

/**
 * G. El cupo se configura DESDE EL PROGRAMA, con el grupo ya armado.
 *
 * Es la unica parte que usa los metodos del SERVICIO (`agregarModulo`, `quitarModulo`,
 * `fijarMinimoDeGrupo`) en vez de escribir `pathItem` a mano: lo que se prueba es justamente lo que
 * esos metodos mantienen.
 */
async function escenarioG(cat: Catalogo): Promise<void> {
  console.log('\nG. El cupo se configura desde el programa, no desde cada modulo');

  const pathId = await crearPrograma(false);
  const obligatorio = await crearActividad(cat);
  enTenant();
  await programs.agregarModulo(pathId, { activityId: obligatorio.activityId, isRequired: true });

  // Agregar un modulo al cupo NO pregunta cuantos hacen falta: el defecto es exigirlos todos.
  const op1 = await crearActividad(cat);
  enTenant();
  await programs.agregarModulo(pathId, { activityId: op1.activityId, isRequired: false, sectionName: 'opcionales' });
  enTenant();
  let detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.minimo === 1, `G1 un grupo recien creado exige todos sus modulos (salio ${detalle.secciones[0]?.minimo})`);

  // Crece a 7. Mientras nadie baje el cupo, el minimo sigue al total: "todos" sigue siendo "todos".
  for (let i = 0; i < 6; i += 1) {
    const op = await crearActividad(cat);
    enTenant();
    await programs.agregarModulo(pathId, { activityId: op.activityId, isRequired: false, sectionName: 'opcionales' });
  }
  enTenant();
  detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.total === 7, 'G2 el grupo llega a 7 modulos');
  comprobar(detalle.secciones[0]?.minimo === 7, `G3 y sin configurar nada sigue exigiendolos todos (salio ${detalle.secciones[0]?.minimo})`);

  // AHORA se declara el cupo, una sola vez, con los 7 delante: "hacen falta 6".
  enTenant();
  await programs.fijarMinimoDeGrupo(pathId, 'opcionales', 6);
  enTenant();
  detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.minimo === 6, 'G4 se declara "hacen falta 6" desde el programa');
  comprobar(detalle.secciones[0]?.puedePerder === 1, 'G5 que es lo mismo que decir "puede perder 1"');

  const todos = await owner.pathItem.findMany({ where: { pathId, sectionName: 'opcionales' }, select: { minRequiredInSection: true } });
  comprobar(
    todos.every((item) => item.minRequiredInSection === 6),
    'G6 los 7 modulos guardan el MISMO minimo: ninguno puede quedar desincronizado',
  );

  // Un modulo mas NO relaja el cupo declarado: 6 sigue siendo 6, ahora sobre 8.
  const extra = await crearActividad(cat);
  enTenant();
  await programs.agregarModulo(pathId, { activityId: extra.activityId, isRequired: false, sectionName: 'opcionales' });
  enTenant();
  detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.minimo === 6, `G7 agregar un modulo no cambia el cupo declarado: sigue en 6 (salio ${detalle.secciones[0]?.minimo})`);
  comprobar(detalle.secciones[0]?.puedePerder === 2, 'G8 y por tanto ahora puede perder 2 de 8');

  // Quitar modulos tampoco lo cambia, MIENTRAS quepa. Si el grupo baja del minimo, se recorta para
  // que no quede un cupo imposible de cumplir.
  const items = await owner.pathItem.findMany({ where: { pathId, sectionName: 'opcionales' }, orderBy: { displayOrder: 'desc' } });
  enTenant();
  await programs.quitarModulo(pathId, items[0].id);
  enTenant();
  detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.minimo === 6, `G9 al quitar uno el cupo declarado se respeta: 6 de 7 (salio ${detalle.secciones[0]?.minimo})`);

  for (const item of items.slice(1, 3)) {
    enTenant();
    await programs.quitarModulo(pathId, item.id);
  }
  enTenant();
  detalle = await programs.obtener(pathId);
  comprobar(detalle.secciones[0]?.total === 5, 'G10 el grupo baja a 5 modulos');
  comprobar(detalle.secciones[0]?.minimo === 5, `G11 y el cupo se recorta a 5: pedir 6 de 5 seria imposible (salio ${detalle.secciones[0]?.minimo})`);

  enTenant();
  await programs.publicar(pathId);
  comprobar(true, 'G12 el programa publica: el cupo nunca queda pidiendo mas modulos de los que hay');

  // Y no se acepta un cupo fuera de rango.
  let rechazado = false;
  try {
    enTenant();
    await programs.fijarMinimoDeGrupo(pathId, 'opcionales', 99);
  } catch {
    rechazado = true;
  }
  comprobar(rechazado, 'G13 pedir un minimo mayor que el grupo se rechaza en el servidor, no solo en la pantalla');
}

/**
 * H. NADA SE PUEDE DEJAR SIN HACER, contra la base: un modulo con la obligacion viva bloquea el
 * programa aunque el cupo ya de los numeros, y eximirlo es la salida de quien no pudo presentarse.
 */
async function escenarioH(cat: Catalogo): Promise<void> {
  console.log('\nH. Un modulo sin hacer bloquea el programa, aunque el cupo salga');

  const pathId = await crearPrograma();
  const userId = await crearUsuario(cat);
  const modulos: Modulo[] = [];
  for (let i = 0; i < 3; i += 1) {
    const m = await crearActividad(cat);
    modulos.push(m);
    await agregarModulo(pathId, m, { isRequired: false, sectionName: 'S', minRequiredInSection: 2, displayOrder: i });
  }

  // Los tres EXIGIDOS, que es lo que hace "Asignar a una audiencia". Dos aprobados: el cupo (2 de 3)
  // ya esta cumplido, pero el tercero sigue debiendose.
  for (const m of modulos) await obligacion(userId, m, 1, 'PENDING');
  for (const m of modulos.slice(0, 2)) {
    await aprobar(userId, m);
    await owner.assignment.updateMany({ where: { userId, targetId: m.activityId }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }
  const conPendiente = await recalcular(userId, pathId);
  comprobar(conPendiente?.completo === false, 'H1 con el cupo cumplido pero un modulo SIN TOCAR, el programa NO completa');
  comprobar(conPendiente?.sinResolver.length === 1, 'H2 y ese modulo sale listado como sin resolver');
  comprobar((await constanciasDePrograma(userId)) === 0, 'H3 no se emite constancia dejando algo sin hacer');

  // EXIMIR el tercero: la salida de quien no pudo presentarse. Resuelve sin aprobar.
  await owner.assignment.updateMany({ where: { userId, targetId: modulos[2].activityId }, data: { status: 'WAIVED' } });
  const trasEximir = await recalcular(userId, pathId);
  comprobar(trasEximir?.completo === true, 'H4 al EXIMIR el que faltaba, el programa completa: el cupo lo perdona');
  comprobar(trasEximir?.sinResolver.length === 0, 'H5 y ya no queda nada sin resolver');
  comprobar((await constanciasDePrograma(userId)) === 1, 'H6 y emite su constancia');

  // Eximir de MAS de lo que el cupo perdona no completa: eximir no es aprobar.
  const pathEstricto = await crearPrograma();
  const usuarioEstricto = await crearUsuario(cat);
  const estrictos: Modulo[] = [];
  for (let i = 0; i < 3; i += 1) {
    const m = await crearActividad(cat);
    estrictos.push(m);
    await agregarModulo(pathEstricto, m, { isRequired: false, sectionName: 'S', minRequiredInSection: 2, displayOrder: i });
  }
  await aprobar(usuarioEstricto, estrictos[0]);
  await obligacion(usuarioEstricto, estrictos[0], 1, 'COMPLETED');
  for (const m of estrictos.slice(1)) {
    await owner.assignment.create({
      data: { tenantId, userId: usuarioEstricto, targetType: 'ACTIVITY', targetId: m.activityId, source: 'RULE', cycleNumber: 1, status: 'WAIVED' },
    });
  }
  const eximidoDeMas = await recalcular(usuarioEstricto, pathEstricto);
  comprobar(eximidoDeMas?.sinResolver.length === 0, 'H7 con dos eximidos no queda nada sin resolver');
  comprobar(eximidoDeMas?.completo === false, 'H8 pero el programa NO completa: eximir resuelve, no aprueba');
  comprobar((await constanciasDePrograma(usuarioEstricto)) === 0, 'H9 y por tanto no hay constancia');
}

/**
 * I. EL INFORME DE PROGRAMAS EN SEGUIMIENTO: que cuente lo que dice contar (2026-09-16).
 *
 * Lo que mas importa aqui es el CUELLO DE BOTELLA, que es la unica columna accionable: si senala el
 * modulo equivocado, el informe manda a programar la jornada que no era.
 */
async function escenarioI(cat: Catalogo): Promise<void> {
  console.log('\nI. El informe "Cómo va cada programa"');

  const pathId = await crearPrograma();
  const m1 = await crearActividad(cat);
  const m2 = await crearActividad(cat);
  await agregarModulo(pathId, m1, { displayOrder: 0 });
  await agregarModulo(pathId, m2, { displayOrder: 1 });

  // Cuatro personas con el programa exigido: una lo termina, tres se quedan a medias por el MISMO
  // modulo (m2), que es justo lo que el informe tiene que senalar.
  const completo = await crearUsuario(cat);
  for (const m of [m1, m2]) {
    await aprobar(completo, m);
    await obligacion(completo, m, 1, 'COMPLETED');
  }
  await recalcular(completo, pathId);

  const aMedias: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const u = await crearUsuario(cat);
    aMedias.push(u);
    await aprobar(u, m1);
    await obligacion(u, m1, 1, 'COMPLETED');
    await obligacion(u, m2, 1, 'PENDING');
    await recalcular(u, pathId);
  }

  enTenant();
  const informe = await reports.programas();
  const fila = informe.find((f) => f.id === pathId);

  comprobar(fila !== undefined, 'I1 el programa publicado aparece en el informe');
  comprobar(fila?.alcanzados === 4, `I2 cuenta a las 4 personas a las que se le exige (salio ${fila?.alcanzados})`);
  comprobar(fila?.completos === 1, `I3 una completa (salio ${fila?.completos})`);
  comprobar(fila?.enCurso === 3, `I4 tres en curso (salio ${fila?.enCurso})`);
  comprobar(fila?.cumplimientoPct === 25, `I5 cumplimiento 1 de 4 = 25% (salio ${fila?.cumplimientoPct})`);
  comprobar(fila?.modulos === 2, 'I6 dice cuantos modulos tiene');
  comprobar(
    fila?.cuelloDeBotella?.activityId === m2.activityId,
    'I7 EL CUELLO DE BOTELLA senala el modulo que frena a mas gente, no otro',
  );
  comprobar(fila?.cuelloDeBotella?.personas === 3, `I8 y dice a cuantas (salio ${fila?.cuelloDeBotella?.personas})`);

  // Quien ya completo NO cuenta como frenado: si contara, el cuello de botella subiria con cada
  // persona que termina, que es lo contrario de lo que el numero significa.
  comprobar(
    (fila?.cuelloDeBotella?.personas ?? 0) < (fila?.alcanzados ?? 0),
    'I9 quien ya termino no suma al cuello de botella',
  );

  comprobar(fila?.aFaltaDeUno === 3, `I11 las 3 que van 1 de 2 salen como "a falta de 1" (salio ${fila?.aFaltaDeUno})`);
  comprobar(fila?.sinEmpezar === 0, `I12 ninguna esta sin empezar: todas aprobaron algo (salio ${fila?.sinEmpezar})`);
  comprobar(
    fila?.cuelloDeBotella?.sinHacer === 3 && fila?.cuelloDeBotella?.reprobados === 0,
    'I13 y el cuello de botella dice que es por NO HABERLO HECHO, no por reprobarlo',
  );

  // Quien no ha tocado NADA cuenta como sin empezar, y NO como "a falta de 1" aunque solo le falte
  // uno: esa cifra existe para senalar a quien esta a punto, no a quien no ha entrado.
  const pathSolo = await crearPrograma();
  const mSolo = await crearActividad(cat);
  await agregarModulo(pathSolo, mSolo);
  const usuarioSolo = await crearUsuario(cat);
  await obligacion(usuarioSolo, mSolo, 1, 'PENDING');
  await recalcular(usuarioSolo, pathSolo);
  enTenant();
  const filaSolo = (await reports.programas()).find((f) => f.id === pathSolo);
  comprobar(filaSolo?.sinEmpezar === 1, 'I14 quien no ha tocado nada cuenta como sin empezar');
  comprobar(filaSolo?.aFaltaDeUno === 0, 'I15 y NO como "a falta de 1": las dos cifras no se solapan');

  // Un modulo INTENTADO y no aprobado se cuenta como reprobado, no como sin hacer: son dos
  // problemas opuestos y mandan a hacer cosas distintas.
  const pathFallado = await crearPrograma();
  const mFallado = await crearActividad(cat);
  await agregarModulo(pathFallado, mFallado);
  const usuarioFallado = await crearUsuario(cat);
  await obligacion(usuarioFallado, mFallado, 1, 'OVERDUE');
  await owner.enrollment.create({
    data: {
      tenantId,
      offeringId: mFallado.offeringId,
      userId: usuarioFallado,
      activityVersionId: mFallado.versionId,
      status: 'FAILED',
    },
  });
  enTenant();
  const filaFallado = (await reports.programas()).find((f) => f.id === pathFallado);
  comprobar(
    filaFallado?.cuelloDeBotella?.reprobados === 1 && filaFallado?.cuelloDeBotella?.sinHacer === 0,
    'I16 un modulo INTENTADO y no aprobado cuenta como reprobado, no como sin hacer',
  );

  // Y el detalle: quienes son y que les falta.
  enTenant();
  const detalle = await reports.programaDetalle(pathId);
  comprobar(detalle?.personas.length === 4, `I17 el detalle lista a las 4 personas (salio ${detalle?.personas.length})`);
  comprobar(detalle?.personas[0]?.completo === false, 'I18 los que faltan van PRIMERO: la lista es para perseguir');
  comprobar(detalle?.personas[3]?.completo === true, 'I19 y el que ya termino, al final');
  comprobar(detalle?.personas[0]?.faltan.length === 1, 'I20 dice exactamente que modulo le falta');
  comprobar(detalle?.personas[0]?.faltan[0]?.intentado === false, 'I21 y si lo intento o no');

  /*
    LAS OBLIGACIONES RETIRADAS NO CUENTAN. Es el fallo que este informe tuvo el primer dia: en el
    tenant de dev, 170 de las 172 "alcanzadas" eran de gente que habia salido de la audiencia, y el
    cuello de botella decia "166 sin hacer" sobre personas a las que nadie les exige nada.
  */
  const pathRetirado = await crearPrograma();
  const mRetirado = await crearActividad(cat);
  await agregarModulo(pathRetirado, mRetirado);
  const usuarioActivo = await crearUsuario(cat);
  const usuarioFuera = await crearUsuario(cat);
  await obligacion(usuarioActivo, mRetirado, 1, 'PENDING');
  await owner.assignment.create({
    data: {
      tenantId,
      userId: usuarioFuera,
      targetType: 'ACTIVITY',
      targetId: mRetirado.activityId,
      source: 'RULE',
      cycleNumber: 1,
      status: 'WITHDRAWN_LEFT_AUDIENCE',
    },
  });
  enTenant();
  const filaRetirado = (await reports.programas()).find((f) => f.id === pathRetirado);
  comprobar(filaRetirado?.alcanzados === 1, `I23 quien salio de la audiencia NO cuenta como alcanzado (salio ${filaRetirado?.alcanzados})`);
  comprobar(
    filaRetirado?.cuelloDeBotella?.personas === 1,
    `I24 ni suma al cuello de botella: no se le exige nada (salio ${filaRetirado?.cuelloDeBotella?.personas})`,
  );
  enTenant();
  const detalleRetirado = await reports.programaDetalle(pathRetirado);
  comprobar(detalleRetirado?.personas.length === 1, 'I25 y tampoco sale en la lista de a quien perseguir');

  // Una EXIMIDA si sigue exigida, pero no frena: esta resuelta y el cupo la absorbe.
  const pathEximido = await crearPrograma();
  const mEximido = await crearActividad(cat);
  await agregarModulo(pathEximido, mEximido);
  const usuarioEximido = await crearUsuario(cat);
  await obligacion(usuarioEximido, mEximido, 1, 'WAIVED');
  enTenant();
  const filaEximido = (await reports.programas()).find((f) => f.id === pathEximido);
  comprobar(filaEximido?.alcanzados === 1, 'I26 una eximida SI cuenta como alcanzada: el programa le aplica');
  comprobar(filaEximido?.cuelloDeBotella === null, 'I27 pero no frena a nadie: esta resuelta');

  /*
    A QUIEN SE LE EXIGE, VISTO DESDE EL PROGRAMA. Antes habia que entrar formacion por formacion, y
    en las que se asignan solas no habia forma de verlo desde ningun sitio.
  */
  const pathObligados = await crearPrograma();
  const o1 = await crearActividad(cat);
  const o2 = await crearActividad(cat);
  await agregarModulo(pathObligados, o1, { displayOrder: 0 });
  await agregarModulo(pathObligados, o2, { displayOrder: 1 });
  const audiencia = await owner.audience.create({
    data: { tenantId, name: `Conductores ${siguiente()}`, rule: {}, active: true },
  });
  creado.audienceIds.push(audiencia.id);
  for (const m of [o1, o2]) {
    await owner.assignmentRule.create({
      data: {
        tenantId,
        audienceId: audiencia.id,
        targetType: 'ACTIVITY',
        targetId: m.activityId,
        trigger: 'ON_HIRE',
        dueDaysAfterTrigger: -1,
        active: true,
      },
    });
  }
  enTenant();
  const conObligados = await programs.obtener(pathObligados);
  comprobar(conObligados.obligados.length === 1, 'I29 las reglas se agrupan por AUDIENCIA, no una fila por modulo');
  comprobar(conObligados.obligados[0]?.modulos === 2, 'I30 y dice en cuantos modulos del programa aplica');
  comprobar(conObligados.obligados[0]?.trigger === 'ON_HIRE', 'I31 con su disparador, que es lo que decide a quien alcanza');

  // Una audiencia que alcanza SOLO a parte de los modulos: es la senal de una regla a medias.
  const o3 = await crearActividad(cat);
  await agregarModulo(pathObligados, o3, { displayOrder: 2 });
  enTenant();
  const aMediasObligados = await programs.obtener(pathObligados);
  comprobar(
    aMediasObligados.obligados[0]?.modulos === 2 && aMediasObligados.items.length === 3,
    'I32 y se ve cuando una audiencia alcanza solo parte del programa (2 de 3): regla a medias',
  );

  /*
    LA MISMA VERDAD LEIDA AL REVES: quien cubre CADA modulo. `obligados` responde "¿a quien se le
    exige?"; `items[].audiencias` responde, mirando un modulo, "¿y este, a quien?". Salen de una
    sola lectura de las reglas, asi que la comprobacion que importa es que NO puedan discrepar: la
    suma de modulos por audiencia tiene que cuadrar con lo agrupado.
  */
  const conCobertura = aMediasObligados;
  const cubiertos = conCobertura.items.filter((i) => i.audiencias.length > 0);
  comprobar(cubiertos.length === 2, `I35 cada modulo dice a quien alcanza (salieron ${cubiertos.length} de 3 cubiertos)`);
  comprobar(
    conCobertura.items.find((i) => i.itemId === o3.activityId)?.audiencias.length === 0,
    'I36 y el que no alcanza a nadie sale con la lista vacia, no omitido',
  );
  const nombreAudiencia = conCobertura.obligados[0]?.name;
  comprobar(
    cubiertos.every((i) => i.audiencias.length === 1 && i.audiencias[0] === nombreAudiencia),
    'I37 con el MISMO nombre que la vista agrupada: las dos lecturas no pueden discrepar',
  );
  comprobar(
    cubiertos.length === conCobertura.obligados[0]?.modulos,
    'I38 y cuadran las cuentas: los modulos cubiertos son los que dice la audiencia',
  );

  /*
    ─── Y LA CUENTA QUE DECIDE SI EL PROGRAMA FUNCIONA: POR PERSONA (2026-09-16) ───

    El aviso de la ficha comparaba AUDIENCIAS ("ninguna alcanza los N modulos") y eso da falsas
    alarmas: dos audiencias distintas pueden alcanzar a la misma gente. Lo que describe un daño real
    es **cuanta gente tiene exigido ALGUNO de los modulos pero no TODOS** — esa pierde la individual
    (la apaga publicar el programa) y nunca completa el conjunto. Ver `ProgramsService.contarPorPersona`.

    Se monta a proposito el caso que enseña la diferencia: el programa tiene 3 modulos, una persona
    con los 3 y otra con solo 1.
  */
  const conLosTres = await crearUsuario(cat);
  const soloUnModulo = await crearUsuario(cat);
  const retiradoDelPrograma = await crearUsuario(cat);
  for (const m of [o1, o2, o3]) await obligacion(conLosTres, m, 1, 'PENDING');
  await obligacion(soloUnModulo, o1, 1, 'PENDING');
  await owner.assignment.create({
    data: {
      tenantId,
      userId: retiradoDelPrograma,
      targetType: 'ACTIVITY',
      targetId: o1.activityId,
      source: 'RULE',
      cycleNumber: 1,
      status: 'WITHDRAWN_LEFT_AUDIENCE',
    },
  });
  enTenant();
  const cobertura = await programs.obtener(pathObligados);
  comprobar(
    cobertura.conTodos === 1,
    `I39 cuenta a quien tiene exigidos TODOS los modulos (salio ${cobertura.conTodos})`,
  );
  comprobar(
    cobertura.afectados === 1,
    `I40 y aparte, a quien tiene ALGUNO pero no todos: esos no completaran (salio ${cobertura.afectados})`,
  );
  comprobar(
    (await programs.impactoDePublicar(pathObligados)).afectados === cobertura.afectados,
    'I41 el aviso de publicar usa exactamente la misma cuenta que la ficha: no pueden discrepar',
  );

  /*
    SIN PUBLICAR NO LA PUEDE HACER NADIE. Un modulo en borrador bloquea el programa entero, y desde
    la ficha no habia forma de verlo — era la explicacion de "¿por que no se le exige a nadie?".
  */
  const pathPublicacion = await crearPrograma();
  const mPublicada = await crearActividad(cat);
  const mBorrador = await crearActividad(cat);
  // `crearActividad` deja la actividad publicada (le pone `currentVersionId`); esta se despublica.
  await owner.activity.update({ where: { id: mBorrador.activityId }, data: { currentVersionId: null } });
  await agregarModulo(pathPublicacion, mPublicada, { displayOrder: 0 });
  await agregarModulo(pathPublicacion, mBorrador, { displayOrder: 1 });
  enTenant();
  const conBorradores = await programs.obtener(pathPublicacion);
  const publicada = conBorradores.items.find((i) => i.itemId === mPublicada.activityId);
  const enBorrador = conBorradores.items.find((i) => i.itemId === mBorrador.activityId);
  comprobar(publicada?.publicada === true, 'I33 un modulo publicado se marca como publicado');
  comprobar(enBorrador?.publicada === false, 'I34 y uno en borrador se marca como SIN publicar');

  // Un programa en BORRADOR no es un compromiso con nadie: no sale en el informe.
  const borrador = await crearPrograma(false);
  const mb = await crearActividad(cat);
  await agregarModulo(borrador, mb);
  enTenant();
  comprobar(
    (await reports.programas()).every((f) => f.id !== borrador),
    'I28 un programa en BORRADOR no aparece en el informe',
  );
}

// ─────────────────────────────── Limpieza ───────────────────────────────

async function limpiar(): Promise<void> {
  if (!tenantId) return;
  if (creado.userIds.length) {
    await owner.certificate.deleteMany({ where: { userId: { in: creado.userIds } } });
    await owner.pathEnrollment.deleteMany({ where: { userId: { in: creado.userIds } } });
    await owner.assignment.deleteMany({ where: { userId: { in: creado.userIds } } });
    await owner.enrollment.deleteMany({ where: { userId: { in: creado.userIds } } });
  }
  if (creado.pathIds.length) {
    await owner.pathItem.deleteMany({ where: { pathId: { in: creado.pathIds } } });
    await owner.pathEnrollment.deleteMany({ where: { pathId: { in: creado.pathIds } } });
    await owner.learningPath.deleteMany({ where: { id: { in: creado.pathIds } } });
  }
  if (creado.activityIds.length) {
    // Las REGLAS antes que las actividades: una regla apunta a la actividad y la deja sin borrar.
    // Y la audiencia despues de sus reglas, por la misma razon. Sin esto, cada corrida del script
    // dejaria reglas vivas en la base de desarrollo — que es justo lo que ensucia la suite e2e.
    await owner.assignmentRule.deleteMany({ where: { targetType: 'ACTIVITY', targetId: { in: creado.activityIds } } });
    await owner.offering.deleteMany({ where: { activityVersion: { activityId: { in: creado.activityIds } } } });
    await owner.activity.updateMany({ where: { id: { in: creado.activityIds } }, data: { currentVersionId: null } });
    await owner.activityVersion.deleteMany({ where: { activityId: { in: creado.activityIds } } });
    await owner.activity.deleteMany({ where: { id: { in: creado.activityIds } } });
  }
  if (creado.userIds.length) await owner.user.deleteMany({ where: { id: { in: creado.userIds } } });
  if (creado.audienceIds.length) await owner.audience.deleteMany({ where: { id: { in: creado.audienceIds } } });
}

async function main(): Promise<void> {
  await prisma.$connect();
  try {
    const tenant = await owner.tenant.findFirstOrThrow({ where: { slug: 'transprensa' } });
    tenantId = tenant.id;
    const cat = await catalogo();

    console.log(`PROGRAMAS — matriz completa contra la base de dev (firma ${FIRMA})`);
    await escenarioA(cat);
    await escenarioB(cat);
    await escenarioC(cat);
    await escenarioD(cat);
    await escenarioE(cat);
    await escenarioF(cat);
    await escenarioG(cat);
    await escenarioH(cat);
    await escenarioI(cat);

    console.log(`\n${pasadas} comprobacion(es) en verde, ${fallos.length} fallo(s).`);
    if (fallos.length) {
      for (const fallo of fallos) console.log(`  - ${fallo}`);
    }
  } finally {
    await limpiar();
    await prisma.$disconnect();
    await owner.$disconnect();
  }
  if (fallos.length) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await limpiar().catch(() => undefined);
  process.exit(1);
});
