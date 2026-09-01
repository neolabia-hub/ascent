import { PrismaClient } from '@prisma/client';
import { PREGUNTAS_SATISFACCION } from '@neo-pulse/shared';

/**
 * ESCENARIO DE PRUEBA DE LA ENCUESTA, listo para verlo en pantalla.
 *
 *   pnpm --filter @neo-pulse/api demo:encuesta [cedula]
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
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

const SUFIJO = Date.now().toString(36).toUpperCase().slice(-5);

async function main() {
  const cedula = process.argv[2] ?? '1102886093';

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'transprensa' }, select: { id: true } });
  if (!tenant) throw new Error('No existe el tenant transprensa.');
  const tenantId = tenant.id;

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
  console.log(`  Tipo creado:    Prueba de encuesta ${SUFIJO} (no toca los tipos reales)\n`);
}

main()
  .catch((error: unknown) => {
    console.error('Fallo el escenario de prueba:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
