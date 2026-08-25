import { PrismaClient } from '@prisma/client';

/**
 * Verificacion de aislamiento RLS (Decision #17). Crea un tenant B efimero con el OWNER,
 * y comprueba con el rol de APP que:
 *   1. Con app.tenant_id = A no se ven filas de B.
 *   2. Sin app.tenant_id no se ve NINGUNA fila de tablas con tenant_id.
 * Sale con codigo 1 si el aislamiento falla. Uso: pnpm db:verify-rls (tras migrate + rls + seed).
 */
const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const EPHEMERAL_SLUG = 'rls-verify-tenant-b';
const EPHEMERAL_CODE = 'RLS_VERIFY_AREA_B';

async function main(): Promise<void> {
  const tenantA = await owner.tenant.findUnique({ where: { slug: 'transprensa' } });
  if (!tenantA) throw new Error('Seed no aplicado: falta el tenant transprensa');

  // Tenant B efimero + un area suya (via owner, sin RLS).
  const tenantB = await owner.tenant.upsert({
    where: { slug: EPHEMERAL_SLUG },
    create: { name: 'Tenant B (verificacion RLS)', slug: EPHEMERAL_SLUG, active: false },
    update: {},
  });
  await owner.area.upsert({
    where: { tenantId_code: { tenantId: tenantB.id, code: EPHEMERAL_CODE } },
    create: { tenantId: tenantB.id, name: 'Area B', code: EPHEMERAL_CODE },
    update: {},
  });

  let failures = 0;

  // 1) Contexto de tenant A: las filas de B deben ser invisibles.
  const crossTenant = await app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA.id}, TRUE)`;
    return tx.area.findMany({ where: { code: EPHEMERAL_CODE } });
  });
  if (crossTenant.length > 0) {
    console.error('FALLA: con contexto de tenant A se ven areas del tenant B');
    failures++;
  } else {
    console.log('OK: contexto tenant A no ve filas del tenant B');
  }

  // 2) Sin contexto: cero filas en tablas con tenant_id.
  const noContext = await app.area.findMany({ take: 1 });
  if (noContext.length > 0) {
    console.error('FALLA: sin app.tenant_id se leen filas de areas');
    failures++;
  } else {
    console.log('OK: sin contexto de tenant no se lee ninguna fila');
  }

  // 3) Escritura cruzada: insertar con tenant_id de B bajo contexto A debe fallar (WITH CHECK).
  const writeBlocked = await app
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantA.id}, TRUE)`;
      await tx.area.create({ data: { tenantId: tenantB.id, name: 'Intrusa', code: 'RLS_VERIFY_INTRUSA' } });
      return false; // si llego aqui, la escritura cruzada paso: FALLA
    })
    .catch(() => true);
  if (!writeBlocked) {
    console.error('FALLA: se pudo escribir una fila del tenant B bajo contexto A');
    failures++;
  } else {
    console.log('OK: escritura cruzada de tenant bloqueada (WITH CHECK)');
  }

  // Limpieza del tenant efimero.
  await owner.area.deleteMany({ where: { tenantId: tenantB.id } });
  await owner.tenant.delete({ where: { id: tenantB.id } });

  if (failures > 0) {
    console.error(`VERIFICACION RLS: ${failures} falla(s)`);
    process.exitCode = 1;
  } else {
    console.log('VERIFICACION RLS: aislamiento correcto');
  }
}

main()
  .catch((error) => {
    console.error('verify-rls fallo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await owner.$disconnect();
    await app.$disconnect();
  });
