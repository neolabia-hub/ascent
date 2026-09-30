import { PrismaClient } from '@prisma/client';
import { eliminarFormacionDePrueba } from '../src/activities/eliminar-prueba.js';

/**
 * ELIMINAR UNA FORMACION DE PRUEBA YA USADA, a mano en el servidor (2026-09-30).
 *
 *   tsx scripts/eliminar-formacion-de-prueba.ts --tenant transprensa --codigo VIDEOS3 --motivo "..."        ENSAYO
 *   tsx scripts/eliminar-formacion-de-prueba.ts --tenant transprensa --codigo VIDEOS3 --motivo "..." --si   la elimina
 *
 * Es la MISMA logica que el boton «Eliminar formación de prueba» (`src/activities/eliminar-prueba.ts`):
 * papelera, convocatorias canceladas, lo pendiente eximido y las constancias anuladas con el motivo.
 * Nada se borra. Existe porque «videos3» habia que quitarla de produccion antes de desplegar el boton.
 *
 * Se busca por CODIGO y no por nombre: el codigo es unico y no lleva tildes ni mayusculas dudosas.
 * Corre como dueño de la base (DIRECT_DATABASE_URL), como los demas scripts de mantenimiento.
 */
function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const deVerdad = process.argv.includes('--si');
  const slug = arg('--tenant');
  const codigo = arg('--codigo');
  const motivo = arg('--motivo')?.trim();
  if (!slug || !codigo || !motivo || motivo.length < 15) {
    console.error('Uso: --tenant <slug> --codigo <CODIGO> --motivo "<al menos 15 caracteres>" [--si]');
    process.exit(2);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`No existe el tenant "${slug}"`);
    const activity = await prisma.activity.findFirst({
      where: { tenantId: tenant.id, code: codigo, deletedAt: null },
      select: { id: true, code: true, name: true },
    });
    if (!activity) throw new Error(`No hay ninguna formacion viva con codigo "${codigo}" en ${tenant.name}`);

    const donde = { tenantId: tenant.id };
    const idsInscripciones = (
      await prisma.enrollment.findMany({
        where: { ...donde, offering: { activityVersion: { activityId: activity.id } } },
        select: { id: true },
      })
    ).map((fila) => fila.id);
    const [reglas, abiertas, convocatorias, enCurso, constancias] = await Promise.all([
      prisma.assignmentRule.count({ where: { ...donde, targetId: activity.id, active: true } }),
      prisma.assignment.count({
        where: { ...donde, targetId: activity.id, status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
      }),
      prisma.offering.count({ where: { ...donde, activityVersion: { activityId: activity.id }, status: { not: 'CANCELLED' } } }),
      prisma.enrollment.count({
        where: { ...donde, offering: { activityVersion: { activityId: activity.id } }, status: { in: ['ENROLLED', 'IN_PROGRESS'] } },
      }),
      prisma.certificate.count({ where: { ...donde, revokedAt: null, enrollmentId: { in: idsInscripciones } } }),
    ]);

    console.log(`${tenant.name}: «${activity.name}» (${activity.code})`);
    console.log(`  reglas activas que se apagan:        ${reglas}`);
    console.log(`  obligaciones abiertas que se eximen: ${abiertas}`);
    console.log(`  convocatorias que se cancelan:       ${convocatorias}`);
    console.log(`  inscripciones en curso que se retiran: ${enCurso}`);
    console.log(`  constancias que se anulan:           ${constancias}`);
    console.log(`  motivo: «${motivo}»`);

    if (!deVerdad) {
      console.log('\nENSAYO: no se escribio nada. Para aplicarlo, repetir con --si');
      return;
    }

    const resultado = await prisma.$transaction((tx) =>
      eliminarFormacionDePrueba(tx, { tenantId: tenant.id, activityId: activity.id, actorId: null, motivo }),
    );
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'ACTIVITY_TEST_DELETED',
        resourceType: 'activities',
        resourceId: activity.id,
        oldValues: { code: activity.code, name: activity.name },
        newValues: { motivo, por: 'script de mantenimiento', ...resultado },
      },
    });
    console.log('\nHECHO:', JSON.stringify(resultado));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
