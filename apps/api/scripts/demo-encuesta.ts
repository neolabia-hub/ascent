import { PrismaClient } from '@prisma/client';
import { PREGUNTAS_SATISFACCION } from '@neo-pulse/shared';

/**
 * ESCENARIO DE PRUEBA DE LA ENCUESTA, listo para verlo en pantalla.
 *
 *   pnpm --filter @neo-pulse/api demo:encuesta [cedula]
 *   pnpm --filter @neo-pulse/api demo:encuesta --limpiar    borra TODO lo que haya dejado
 *
 * Deja montado el camino completo: una encuesta activa, un tipo que la pide, una formacion de ese
 * tipo con una leccion y la encuesta enganchada, una convocatoria permanente para poder entrar sin
 * que nadie convoque, y la obligacion asignada.
 *
 * ─── POR QUE UN SCRIPT Y NO "hazlo por la interfaz" ───
 *
 * Son once pasos en cinco pantallas. Para COMPROBAR que la encuesta funciona no hace falta
 * recorrerlos: hace falta llegar a la pantalla del aprendiz. Montar el escenario a mano cada vez
 * que se quiere mirar algo es lo que hace que al final no se mire.
 *
 * Corre como DUENO de la base de datos (DIRECT_DATABASE_URL) porque el usuario de la aplicacion
 * esta sujeto a RLS y un script suelto no tiene `app.tenant_id` fijado: veria cero filas y diria
 * que no hay nada, que es el peor fallo posible — un filtro vacio y un conjunto vacio se ven igual.
 *
 * ─── POR QUE SE LIMPIA SOLO (2026-09-04) ───
 *
 * El escenario se montaba y no se recogia. El TIPO que crea aparece en Configuracion -> Tipos de
 * formacion como uno mas, y ahi ya no se distingue de los seis reales: el cliente se topo con
 * "Prueba de encuesta W6PWX" el 2026-09-01, intento borrarlo y no pudo —sus propias formaciones lo
 * referencian— y ademas eligio ese tipo para una formacion suya, porque estaba en la lista.
 *
 * Un escenario de prueba que ensucia la CONFIGURACION del cliente no es gratis. `--limpiar` borra
 * todos los que este script haya dejado (por el prefijo `PRUEBA_ENCUESTA_`), con lo que cuelga de
 * ellos. No toca la encuesta: esa se reutiliza y puede ser la de verdad.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

const SUFIJO = Date.now().toString(36).toUpperCase().slice(-5);

/**
 * Recoge TODO lo que este script haya dejado, de esta corrida y de las anteriores.
 *
 * Se busca por el prefijo del codigo del TIPO, no por el sufijo de una corrida: lo que estorba en
 * la configuracion del cliente es la acumulacion, y quien limpia no sabe cuantas veces se corrio.
 *
 * Se borra de dentro hacia fuera porque las claves ajenas son RESTRICT a proposito (una formacion
 * publicada no se borra por accidente). Arrastra tambien las formaciones que NO creo el script pero
 * que alguien puso en ese tipo, que es el caso real: el tipo estaba en la lista y se eligio.
 */
async function limpiar(tenantId: string): Promise<void> {
  const tipos = await prisma.activityType.findMany({
    where: { tenantId, code: { startsWith: 'PRUEBA_ENCUESTA_' } },
    select: { id: true, name: true },
  });
  if (tipos.length === 0) {
    console.log('\nNo hay nada que limpiar: ningun tipo de prueba en la base.\n');
    return;
  }

  const tipoIds = tipos.map((t) => t.id);
  const actividades = await prisma.activity.findMany({
    where: { activityTypeId: { in: tipoIds } },
    select: { id: true, name: true },
  });
  const actIds = actividades.map((a) => a.id);
  const versiones = await prisma.activityVersion.findMany({ where: { activityId: { in: actIds } }, select: { id: true } });
  const verIds = versiones.map((v) => v.id);
  const convocatorias = await prisma.offering.findMany({ where: { activityVersionId: { in: verIds } }, select: { id: true } });
  const offIds = convocatorias.map((o) => o.id);
  const inscripciones = await prisma.enrollment.findMany({
    where: { OR: [{ offeringId: { in: offIds } }, { activityVersionId: { in: verIds } }] },
    select: { id: true },
  });
  const enrIds = inscripciones.map((e) => e.id);

  await prisma.$transaction([
    prisma.learningEvent.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.surveyResponse.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.certificate.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.efficacySchedule.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.activityProgress.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.attempt.deleteMany({ where: { enrollmentId: { in: enrIds } } }),
    prisma.enrollment.deleteMany({ where: { id: { in: enrIds } } }),
    prisma.attendanceRecord.deleteMany({ where: { offeringId: { in: offIds } } }),
    prisma.sessionAct.deleteMany({ where: { offeringId: { in: offIds } } }),
    prisma.planItem.deleteMany({ where: { offeringId: { in: offIds } } }),
    prisma.offering.deleteMany({ where: { id: { in: offIds } } }),
    prisma.assignment.deleteMany({ where: { targetId: { in: actIds } } }),
    prisma.assignmentRule.deleteMany({ where: { targetId: { in: actIds } } }),
    prisma.activityContent.deleteMany({ where: { activityVersionId: { in: verIds } } }),
    prisma.activity.updateMany({ where: { id: { in: actIds } }, data: { currentVersionId: null } }),
    prisma.activityVersion.deleteMany({ where: { id: { in: verIds } } }),
    prisma.activity.deleteMany({ where: { id: { in: actIds } } }),
    prisma.activityType.deleteMany({ where: { id: { in: tipoIds } } }),
  ]);

  console.log(`\nLimpiado: ${tipos.length} tipo(s) de prueba y ${actividades.length} formacion(es).`);
  for (const a of actividades) console.log(`  - ${a.name}`);
  console.log('');
}

async function main() {
  const limpieza = process.argv.includes('--limpiar');
  const cedula = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '1102886093';

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'transprensa' }, select: { id: true } });
  if (!tenant) throw new Error('No existe el tenant transprensa.');
  const tenantId = tenant.id;

  if (limpieza) return limpiar(tenantId);

  const persona = await prisma.user.findFirst({
    where: { tenantId, documentNumber: cedula, deletedAt: null },
    select: { id: true, fullName: true },
  });
  if (!persona) throw new Error(`No hay ninguna persona con cedula ${cedula}.`);

  const proceso = await prisma.process.findFirst({ where: { tenantId }, select: { id: true } });
  if (!proceso) throw new Error('El tenant no tiene procesos.');

  // 1. La encuesta. Se reutiliza la que ya exista y este activa: el objetivo es probar el camino,
  //    no llenar la lista de encuestas identicas cada vez que se corre esto.
  const encuesta =
    (await prisma.surveyTemplate.findFirst({
      where: { tenantId, kind: 'SATISFACTION', active: true },
      select: { id: true, name: true },
    })) ??
    (await prisma.surveyTemplate.create({
      data: {
        tenantId,
        kind: 'SATISFACTION',
        name: 'Satisfaccion de la formacion',
        questions: PREGUNTAS_SATISFACCION as never,
        active: true,
      },
      select: { id: true, name: true },
    }));

  // 2. Un tipo PROPIO para la prueba, para no tocar la configuracion real de la empresa. Sin
  //    evaluacion: asi se llega a la encuesta en dos clics y se comprueba lo que se quiere
  //    comprobar, que es la encuesta.
  const tipo = await prisma.activityType.create({
    data: {
      tenantId,
      code: `PRUEBA_ENCUESTA_${SUFIJO}`,
      name: `Prueba de encuesta ${SUFIJO}`,
      colorHex: '#7c3aed',
      displayOrder: 99,
      config: {
        requiresAssessment: false,
        requiresSurvey: true,
        surveyTemplateId: encuesta.id,
        issuesCertificate: false,
        requiresEfficacy: false,
        isMicro: false,
      },
    },
    select: { id: true },
  });

  // 3. Una leccion de dos tarjetas: lo minimo para que haya algo antes de la encuesta.
  const leccion = await prisma.lesson.create({
    data: {
      tenantId,
      title: `Leccion de prueba ${SUFIJO}`,
      status: 'PUBLISHED',
      estimatedMinutes: 2,
      cards: {
        create: [
          {
            tenantId,
            displayOrder: 0,
            cardType: 'TEXT_IMAGE',
            payload: { title: 'Primera tarjeta', body: 'Avanza para llegar a la encuesta.' },
          },
          {
            tenantId,
            displayOrder: 1,
            cardType: 'TEXT_IMAGE',
            payload: { title: 'Segunda tarjeta', body: 'Al terminar aparece la encuesta.' },
          },
        ],
      },
    },
    select: { id: true },
  });

  // 4. La formacion con su version 1 ya publicada, y la ENCUESTA como ultima pieza — que es
  //    exactamente lo que hace el enganche automatico al publicar desde la interfaz.
  const actividad = await prisma.activity.create({
    data: {
      tenantId,
      code: `ENC_${SUFIJO}`,
      name: `Prueba de encuesta ${SUFIJO}`,
      description: 'Formacion de prueba: dos tarjetas y la encuesta al final.',
      activityTypeId: tipo.id,
      processId: proceso.id,
      modality: 'VIRTUAL',
    },
    select: { id: true },
  });

  const version = await prisma.activityVersion.create({
    data: {
      tenantId,
      activityId: actividad.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      passingScore: 90,
      maxAttempts: 3,
      estimatedMinutes: 3,
      syllabusSnapshot: { titulo: `Prueba de encuesta ${SUFIJO}`, temario: ['Leccion', 'Encuesta'] },
      contents: {
        create: [
          { tenantId, type: 'LESSON', title: 'Leccion de prueba', displayOrder: 0, isRequired: true, lessonId: leccion.id },
          {
            tenantId,
            type: 'SURVEY',
            title: encuesta.name,
            displayOrder: 1,
            // NO requerida, igual que el enganche automatico: si lo fuera, quien no opina se queda
            // con la formacion sin terminar y sin constancia.
            isRequired: false,
            surveyTemplateId: encuesta.id,
          },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.activity.update({ where: { id: actividad.id }, data: { currentVersionId: version.id } });

  // 5. Convocatoria PERMANENTE: es lo que permite entrar sin que nadie convoque. Sin ella la
  //    formacion sale como "esperando convocatoria" y no se puede abrir.
  await prisma.offering.create({
    data: {
      tenantId,
      activityVersionId: version.id,
      code: `CONV_ENC_${SUFIJO}`,
      kind: 'PERMANENT',
      modality: 'VIRTUAL',
      status: 'PUBLISHED',
      projectedFrozenAt: new Date(),
    },
  });

  // 6. La obligacion, para que aparezca en /hoy.
  await prisma.assignment.create({
    data: {
      tenantId,
      userId: persona.id,
      targetType: 'ACTIVITY',
      targetId: actividad.id,
      source: 'MANUAL',
      dueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
    },
  });

  console.log('\nListo. Para verlo:\n');
  console.log(`  1. Entra como ${persona.fullName} (cedula ${cedula})`);
  console.log('  2. Ve a /hoy y abre "Prueba de encuesta ' + SUFIJO + '"');
  console.log('  3. Pasa las dos tarjetas');
  console.log('  4. La encuesta sale como ultima parte\n');
  console.log(`  Encuesta usada: ${encuesta.name}`);
  console.log(`  Tipo creado:    Prueba de encuesta ${SUFIJO} (no toca los tipos reales)`);
  console.log('  Para recogerlo: pnpm --filter @neo-pulse/api demo:encuesta --limpiar\n');
}

main()
  .catch((error: unknown) => {
    console.error('Fallo el escenario de prueba:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
