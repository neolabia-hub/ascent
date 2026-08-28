import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * CONTENIDO DE DEMOSTRACION — solo desarrollo.
 *
 * El seed normal (`seed.ts`) deja la empresa lista para operar: catalogos, roles y personas. No
 * crea formacion, y con razon: la formacion la crea el cliente. Pero una base recien sembrada
 * deja la superficie del aprendiz VACIA, y una pantalla vacia no se puede probar ni mostrar.
 *
 * Este script crea lo minimo para recorrer el Sprint 4 de punta a punta:
 *   - una PILDORA de 4 minutos con los cuatro tipos de tarjeta mas usados,
 *   - una INDUCCION con leccion y examen de 4 preguntas (una de cada tipo corregible),
 *   - las convocatorias permanentes que permiten empezarlas por cuenta propia,
 *   - la obligacion de ambas para todas las personas activas,
 *   - y una historia corta y FABRICADA (una formacion completada la semana pasada con dos
 *     preguntas falladas) para que la sesion de repaso tenga algo que mostrar HOY. Sin ella esa
 *     pantalla solo puede ensenar su estado vacio.
 *
 * Es idempotente: si ya existe la pildora de demostracion, no hace nada.
 *
 * Uso: pnpm db:seed:demo
 */

// Como el seed normal: corre con el OWNER (DIRECT_DATABASE_URL), no con el usuario de la app,
// que esta sujeto a RLS y no veria ni escribiria nada sin contexto de empresa.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

const PILL_CODE = 'DEMO_EPP';
const INDUCTION_CODE = 'DEMO_IND';
const FORKLIFT_CODE = 'DEMO_MONTACARGAS';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('SEED demo OMITIDO (NODE_ENV=production)');
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'transprensa' }, select: { id: true } });
  if (!tenant) throw new Error('SEED demo: falta el tenant transprensa. Corre primero pnpm db:seed');
  const tenantId = tenant.id;

  // El aprendiz de demostracion se asegura SIEMPRE, antes de decidir si el contenido ya existe:
  // sin una cuenta con rol Usuario no hay forma de ver la aplicacion como la ve el 80% del
  // personal, y con una cuenta de administrador se ve otra cosa.
  await ensureDemoLearner(tenantId);

  const existing = await prisma.activity.findUnique({
    where: { tenantId_code: { tenantId, code: PILL_CODE } },
    select: { id: true },
  });
  if (existing) {
    // El contenido ya esta; lo unico que puede faltar es la obligacion de quien acaba de nacer.
    const created = await backfillAssignments(tenantId);
    console.log(`SEED demo: el contenido ya existia. Obligaciones nuevas: ${created}`);
    return;
  }

  const [types, processes, users] = await Promise.all([
    prisma.activityType.findMany({ where: { tenantId }, select: { id: true, code: true } }),
    prisma.process.findMany({ where: { tenantId }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { tenantId, active: true, deletedAt: null }, select: { id: true } }),
  ]);
  const typeId = (code: string) => {
    const found = types.find((row) => row.code === code);
    if (!found) throw new Error(`SEED demo: falta el tipo de actividad ${code}`);
    return found.id;
  };
  const processId = (code: string) => {
    const found = processes.find((row) => row.code === code);
    if (!found) throw new Error(`SEED demo: falta el proceso ${code}`);
    return found.id;
  };

  // ───────────────────────── 1. La pildora ─────────────────────────

  const pillLesson = await prisma.lesson.create({
    data: {
      tenantId,
      title: 'Uso del EPP en bodega',
      estimatedMinutes: 4,
      status: 'PUBLISHED',
      cards: {
        create: [
          {
            tenantId,
            cardType: 'TEXT_IMAGE',
            displayOrder: 0,
            payload: {
              cardType: 'TEXT_IMAGE',
              title: 'Tres piezas, siempre',
              body: 'En bodega no se entra sin casco, botas con puntera y chaleco reflectivo.\n\nNo importa si vas de paso ni si es un minuto: el montacargas no te ve, y ese es el punto.',
            },
          },
          {
            tenantId,
            cardType: 'FLIP',
            displayOrder: 1,
            payload: {
              cardType: 'FLIP',
              front: 'Se te rompio la correa del casco a mitad del turno. Que haces?',
              back: 'Lo reportas y pides reemplazo antes de volver a la zona. Un casco que no se sujeta no protege: en una caida se sale antes de que te sirva.',
            },
          },
          {
            tenantId,
            cardType: 'QUIZ',
            displayOrder: 2,
            payload: {
              cardType: 'QUIZ',
              question: 'Vas a cruzar la bodega para entregar un documento. Son 20 metros.',
              options: [
                { id: 'a', text: 'Cruzo rapido, sin equipo' },
                { id: 'b', text: 'Me pongo el equipo completo' },
                { id: 'c', text: 'Solo el chaleco, que es lo que se ve' },
              ],
              correctOptionId: 'b',
              feedbackCorrect: 'Asi es. La distancia no cambia el riesgo.',
              feedbackWrong: 'El equipo completo. La mayoria de los accidentes en bodega pasan en trayectos cortos, justo porque parecen no contar.',
            },
          },
          {
            tenantId,
            cardType: 'FILL_GAP',
            displayOrder: 3,
            payload: {
              cardType: 'FILL_GAP',
              sentence: 'El chaleco ___ sirve para que el operador del montacargas te vea a ___.',
              answers: ['reflectivo', 'tiempo'],
              distractors: ['liviano', 'suerte', 'medias'],
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const pill = await createPublishedActivity({
    tenantId,
    code: PILL_CODE,
    name: 'Uso del EPP en bodega',
    description: 'Cuatro minutos sobre el equipo de proteccion y por que los trayectos cortos son los que accidentan.',
    activityTypeId: typeId('MICROLEARNING'),
    processId: processId('SST'),
    estimatedMinutes: 4,
    contents: [{ type: 'LESSON', title: 'Uso del EPP en bodega', lessonId: pillLesson.id }],
  });

  // ───────────────────────── 2. La induccion con examen ─────────────────────────

  const inductionLesson = await prisma.lesson.create({
    data: {
      tenantId,
      title: 'Bienvenida a Transprensa',
      estimatedMinutes: 6,
      status: 'PUBLISHED',
      cards: {
        create: [
          {
            tenantId,
            cardType: 'TEXT_IMAGE',
            displayOrder: 0,
            payload: {
              cardType: 'TEXT_IMAGE',
              title: 'Que hacemos',
              body: 'Transprensa mueve carga por todo el pais: almacenamiento, masivo y paqueteo.\n\nLo que sostiene el negocio no es el camion: es que lo que sale coincida con lo que llega, y que nadie se lesione en el camino.',
            },
          },
          {
            tenantId,
            cardType: 'TEXT_IMAGE',
            displayOrder: 1,
            payload: {
              cardType: 'TEXT_IMAGE',
              title: 'Reportar no es acusar',
              body: 'Si ves una estiba mal armada, un derrame o a alguien sin equipo, se reporta.\n\nNo hay sancion por reportar. La hay por callar y que pase algo.',
            },
          },
          {
            tenantId,
            cardType: 'FLIP',
            displayOrder: 2,
            payload: {
              cardType: 'FLIP',
              front: 'Cuanto tiempo tienes para reportar un incidente?',
              back: 'El mismo turno. Un incidente reportado tarde ya no se puede investigar: las camaras se sobreescriben y nadie recuerda quien estaba.',
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const category = await prisma.questionCategory.create({
    data: { tenantId, name: 'Induccion general' },
    select: { id: true },
  });

  const questionVersionIds = await createQuestions(tenantId, category.id, [
    {
      qtype: 'SINGLE',
      stem: 'Encuentras un derrame de aceite en el pasillo principal. Que haces primero?',
      options: [
        { id: 'a', text: 'Lo limpio yo mismo y sigo' },
        { id: 'b', text: 'Senalizo la zona y aviso' },
        { id: 'c', text: 'Lo reporto al final del turno' },
      ],
      correct: { optionId: 'b' },
      explanation: 'Primero se evita que alguien se resbale; despues se limpia. Reportarlo al final del turno deja el riesgo activo durante horas.',
    },
    {
      qtype: 'MULTI',
      stem: 'Cuales de estas situaciones se reportan el mismo turno?',
      options: [
        { id: 'a', text: 'Una estiba mal armada' },
        { id: 'b', text: 'Un companero sin casco' },
        { id: 'c', text: 'Un cliente que llamo molesto' },
        { id: 'd', text: 'Un derrame, aunque ya lo hayan limpiado' },
      ],
      correct: { optionIds: ['a', 'b', 'd'], partialCredit: true },
      explanation: 'Todo lo que puede lesionar a alguien. La queja de un cliente se atiende, pero no es un incidente de seguridad.',
    },
    {
      qtype: 'TRUE_FALSE',
      stem: 'Reportar a un companero que trabaja sin equipo de proteccion puede acarrearle una sancion a quien reporta.',
      correct: { value: false },
      explanation: 'Falso, y es importante: si reportar costara algo, nadie reportaria y los accidentes seguirian pasando en silencio.',
    },
    {
      qtype: 'SINGLE',
      stem: 'Cada cuanto se repite la induccion en Transprensa?',
      options: [
        { id: 'a', text: 'Una sola vez, al entrar' },
        { id: 'b', text: 'Cada ano (reinduccion)' },
        { id: 'c', text: 'Solo si cambias de cargo' },
      ],
      correct: { optionId: 'b' },
      explanation: 'La reinduccion anual la exige el Decreto 1072. Cambiar de cargo ademas dispara las inducciones especificas del cargo nuevo.',
    },
  ]);

  const assessment = await prisma.assessment.create({
    data: { tenantId, title: 'Examen de induccion general' },
    select: { id: true },
  });
  const assessmentVersion = await prisma.assessmentVersion.create({
    data: {
      tenantId,
      assessmentId: assessment.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      timeLimitMin: 10,
      gradingPolicy: 'HIGHEST',
      shuffleQuestions: false,
      shuffleOptions: true,
      // Se deja ver la explicacion desde el primer intento (y NO la respuesta correcta): con un
      // banco reutilizado, ensenar la correcta a todo el mundo equivale a publicar el examen.
      reviewPolicy: { showScore: true, showCorrectAnswers: false, showExplanations: true, onlyAfterLastAttempt: false },
      sections: {
        create: [
          { tenantId, mode: 'FIXED', displayOrder: 0, fixedQuestionVersionIds: questionVersionIds },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.assessment.update({ where: { id: assessment.id }, data: { currentVersionId: assessmentVersion.id } });

  const induction = await createPublishedActivity({
    tenantId,
    code: INDUCTION_CODE,
    name: 'Induccion General Corporativa',
    description: 'Quienes somos, como se reporta un incidente y por que la reinduccion es anual.',
    activityTypeId: typeId('INDUCCION_GENERAL'),
    processId: processId('GESTION_HUMANA'),
    estimatedMinutes: 16,
    contents: [
      { type: 'LESSON', title: 'Bienvenida a Transprensa', lessonId: inductionLesson.id },
      { type: 'ASSESSMENT', title: 'Examen de induccion', assessmentVersionId: assessmentVersion.id },
    ],
  });

  // ───────────────────────── 3. Convocatorias y obligaciones ─────────────────────────

  await createPermanentOffering(tenantId, pill.versionId, 'CONV-DEMO-EPP');
  await createPermanentOffering(tenantId, induction.versionId, 'CONV-DEMO-IND');

  await assignToEveryone(tenantId, users, pill.activityId, 15);
  await assignToEveryone(tenantId, users, induction.activityId, 30);

  // ───────────────────────── 4. Una historia corta, para que el repaso tenga que mostrar ─────

  const forkliftLesson = await prisma.lesson.create({
    data: {
      tenantId,
      title: 'Manejo seguro de montacargas',
      estimatedMinutes: 5,
      status: 'PUBLISHED',
      cards: {
        create: [
          {
            tenantId,
            cardType: 'TEXT_IMAGE',
            displayOrder: 0,
            payload: {
              cardType: 'TEXT_IMAGE',
              title: 'La carga tapa la vista',
              body: 'Con la carga levantada no ves el pasillo. Se transita con la horquilla baja y, en pendiente, de reversa.',
            },
          },
        ],
      },
    },
    select: { id: true },
  });
  const forklift = await createPublishedActivity({
    tenantId,
    code: FORKLIFT_CODE,
    name: 'Manejo seguro de montacargas',
    description: 'Pildora de la semana pasada. Existe para que el historial y el repaso no esten vacios.',
    activityTypeId: typeId('MICROLEARNING'),
    processId: processId('SST'),
    estimatedMinutes: 5,
    contents: [{ type: 'LESSON', title: 'Manejo seguro de montacargas', lessonId: forkliftLesson.id }],
  });
  const forkliftOffering = await createPermanentOffering(tenantId, forklift.versionId, 'CONV-DEMO-MONTA');

  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  for (const user of users) {
    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        offeringId: forkliftOffering,
        userId: user.id,
        activityVersionId: forklift.versionId,
        status: 'COMPLETED',
        enrolledAt: lastWeek,
        startedAt: lastWeek,
        completedAt: lastWeek,
        scoreSnapshot: { activityName: 'Manejo seguro de montacargas', versionNumber: 1 },
      },
      select: { id: true },
    });

    // Dos preguntas falladas que ya cumplieron su espera de dos dias: son las que apareceran
    // hoy en la sesion de repaso.
    for (const questionVersionId of questionVersionIds.slice(0, 2)) {
      await prisma.reviewQueueItem.create({
        data: {
          tenantId,
          userId: user.id,
          questionVersionId,
          sourceEnrollmentId: enrollment.id,
          stage: 0,
          dueAt: new Date(Date.now() - 60 * 60 * 1000),
          lapses: 1,
          lastResult: 'FAIL',
        },
      });
    }
  }

  console.log('SEED demo OK:');
  console.log('  - Pildora "Uso del EPP en bodega" (4 tarjetas) pendiente para todos');
  console.log('  - "Induccion General Corporativa" con leccion + examen de 4 preguntas');
  console.log('  - Historial de la semana pasada y 2 preguntas esperando en el repaso de hoy');
}

const LEARNER_DOCUMENT = '111222333';
const LEARNER_PASSWORD = 'Aprendiz2026*';

/**
 * Un auxiliar de bodega con rol USUARIO: un solo permiso, `enrollments:read_own`.
 *
 * Existe porque una cuenta de administrador NO sirve para revisar la experiencia del aprendiz:
 * tiene todos los permisos, entra al panel y ve una aplicacion distinta. Para juzgar si esto
 * funciona en bodega hay que entrar como quien trabaja en bodega.
 *
 * Se deja lista para operar (sin cambio de contrasena forzado y con las politicas aceptadas)
 * para que probar no cueste tres pantallas de tramite.
 */
async function ensureDemoLearner(tenantId: string): Promise<void> {
  const [role, jobTitle, area, regional] = await Promise.all([
    prisma.role.findFirst({ where: { tenantId, code: 'USUARIO' }, select: { id: true } }),
    prisma.jobTitle.findFirst({ where: { tenantId, active: true }, select: { id: true }, orderBy: { name: 'asc' } }),
    prisma.area.findFirst({ where: { tenantId, active: true }, select: { id: true }, orderBy: { name: 'asc' } }),
    prisma.regional.findFirst({ where: { tenantId, active: true }, select: { id: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!role || !jobTitle || !area) throw new Error('SEED demo: faltan rol USUARIO, cargo o area');

  const now = new Date();
  const data = {
    fullName: 'Aprendiz de Pruebas',
    email: 'aprendiz@transprensa.test',
    emailKind: 'CORPORATE' as const,
    jobTitleId: jobTitle.id,
    areaId: area.id,
    regionalId: regional?.id ?? null,
    roleId: role.id,
    employmentType: 'DIRECTO' as const,
    hiredAt: new Date(Date.UTC(2026, 7, 3)),
    active: true,
    mustChangePassword: false,
    habeasDataConsentAt: now,
    habeasDataVersion: '1.0',
    esignAgreementAt: now,
    esignAgreementVersion: '1.0',
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  await prisma.user.upsert({
    where: { tenantId_documentNumber: { tenantId, documentNumber: LEARNER_DOCUMENT } },
    update: { ...data, passwordHash: await argon2.hash(LEARNER_PASSWORD) },
    create: {
      ...data,
      tenantId,
      documentNumber: LEARNER_DOCUMENT,
      passwordHash: await argon2.hash(LEARNER_PASSWORD),
    },
  });
  console.log(`SEED demo aprendiz OK — login: ${LEARNER_DOCUMENT} / ${LEARNER_PASSWORD} (rol Usuario)`);
}

/** Da a quien no la tenga la obligacion de las formaciones de demostracion ya creadas. */
async function backfillAssignments(tenantId: string): Promise<number> {
  const activities = await prisma.activity.findMany({
    where: { tenantId, code: { in: [PILL_CODE, INDUCTION_CODE] } },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { tenantId, active: true, deletedAt: null },
    select: { id: true },
  });
  const already = await prisma.assignment.findMany({
    where: { tenantId, targetType: 'ACTIVITY', targetId: { in: activities.map((row) => row.id) } },
    select: { userId: true, targetId: true },
  });
  const taken = new Set(already.map((row) => `${row.userId}:${row.targetId}`));

  const rows = users.flatMap((user) =>
    activities
      .filter((activity) => !taken.has(`${user.id}:${activity.id}`))
      .map((activity) => ({
        tenantId,
        userId: user.id,
        targetType: 'ACTIVITY' as const,
        targetId: activity.id,
        source: 'MANUAL' as const,
        dueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: 'PENDING' as const,
      })),
  );
  if (rows.length === 0) return 0;
  await prisma.assignment.createMany({ data: rows });
  return rows.length;
}

interface DemoContent {
  type: 'LESSON' | 'ASSESSMENT';
  title: string;
  lessonId?: string;
  assessmentVersionId?: string;
}

/** Crea la actividad y su version 1 ya publicada (equivalente a publicar desde la interfaz). */
async function createPublishedActivity(params: {
  tenantId: string;
  code: string;
  name: string;
  description: string;
  activityTypeId: string;
  processId: string;
  estimatedMinutes: number;
  contents: DemoContent[];
}): Promise<{ activityId: string; versionId: string }> {
  const activity = await prisma.activity.create({
    data: {
      tenantId: params.tenantId,
      code: params.code,
      name: params.name,
      description: params.description,
      activityTypeId: params.activityTypeId,
      processId: params.processId,
      modality: 'VIRTUAL',
    },
    select: { id: true },
  });

  const version = await prisma.activityVersion.create({
    data: {
      tenantId: params.tenantId,
      activityId: activity.id,
      versionNumber: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      // Snapshot de la cascada: Transprensa exige 90 (ver settings del tenant).
      passingScore: 90,
      maxAttempts: 3,
      estimatedMinutes: params.estimatedMinutes,
      syllabusSnapshot: { titulo: params.name, temario: params.contents.map((content) => content.title) },
      contents: {
        create: params.contents.map((content, index) => ({
          tenantId: params.tenantId,
          type: content.type,
          title: content.title,
          displayOrder: index,
          isRequired: true,
          lessonId: content.lessonId ?? null,
          assessmentVersionId: content.assessmentVersionId ?? null,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.activity.update({ where: { id: activity.id }, data: { currentVersionId: version.id } });
  return { activityId: activity.id, versionId: version.id };
}

async function createQuestions(
  tenantId: string,
  categoryId: string,
  items: Array<{
    qtype: 'SINGLE' | 'MULTI' | 'TRUE_FALSE';
    stem: string;
    options?: Array<{ id: string; text: string }>;
    correct: object;
    explanation: string;
  }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const item of items) {
    const question = await prisma.question.create({ data: { tenantId, categoryId }, select: { id: true } });
    const version = await prisma.questionVersion.create({
      data: {
        tenantId,
        questionId: question.id,
        versionNumber: 1,
        qtype: item.qtype,
        stem: item.stem,
        options: item.options ?? [],
        correct: item.correct,
        feedback: { explanation: item.explanation },
        points: 1,
      },
      select: { id: true },
    });
    await prisma.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
    ids.push(version.id);
  }
  return ids;
}

/** Convocatoria permanente sin ventana: disponible siempre, es la que permite el autoservicio. */
async function createPermanentOffering(tenantId: string, activityVersionId: string, code: string): Promise<string> {
  const offering = await prisma.offering.create({
    data: {
      tenantId,
      activityVersionId,
      code,
      kind: 'PERMANENT',
      modality: 'VIRTUAL',
      status: 'PUBLISHED',
      projectedFrozenAt: new Date(),
    },
    select: { id: true },
  });
  return offering.id;
}

async function assignToEveryone(
  tenantId: string,
  users: Array<{ id: string }>,
  activityId: string,
  dueInDays: number,
): Promise<void> {
  const dueAt = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
  await prisma.assignment.createMany({
    data: users.map((user) => ({
      tenantId,
      userId: user.id,
      targetType: 'ACTIVITY' as const,
      targetId: activityId,
      source: 'MANUAL' as const,
      dueAt,
      status: 'PENDING' as const,
    })),
    skipDuplicates: true,
  });
}

main()
  .catch((error: unknown) => {
    console.error('SEED demo FALLO:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
