import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  SEED_ROLE_PERMISSIONS,
  type PermissionCode,
} from '../../../packages/shared/src/constants/permissions.js';

/**
 * PONE AL DIA EL CATALOGO DE PERMISOS SIN TOCAR NADA MAS.
 *
 *   pnpm --filter @neo-pulse/api dev:sincronizar-permisos           enseña que falta
 *   pnpm --filter @neo-pulse/api dev:sincronizar-permisos -- --si    lo aplica
 *
 * ─── POR QUE NO SIRVE `db:seed` ───
 *
 * El seed es idempotente para lo que el crea, pero **reemplaza el juego completo de permisos de cada
 * rol** con el de la semilla y ademas repasa catalogos y tipos de formacion — y ahi esta el problema
 * conocido: ya borro una vez la parametrizacion que el cliente habia hecho en los tipos (ver el
 * RUNBOOK). Correr el seed entero para agregar UN permiso es apagar la casa para cambiar una bombilla.
 *
 * Esto solo AÑADE: crea los permisos del catalogo que falten y se los concede a los roles semilla que
 * deberian tenerlos. **No quita ninguno**, asi que un permiso que el administrador le dio a un rol a
 * mano sobrevive — que es justo lo que el seed no respeta.
 *
 * Hace falta cada vez que se agrega un codigo a `PERMISSIONS`: el guard evalua codigos, pero la
 * concesion vive en la base, y sin ella el permiso nuevo no lo tiene nadie.
 */
async function main(): Promise<void> {
  const deVerdad = process.argv.includes('--si');
  /*
    CORRE COMO DUEÑO DE LA BASE (DIRECT_DATABASE_URL), igual que la semilla y que los dos scripts de
    limpieza. roles y role_permissions estan bajo RLS y filtran por app.tenant_id, que en un
    script suelto no esta fijado: con el rol de la aplicacion esto veria CERO roles y diria, tan
    tranquilo, que todos tienen lo que les toca.
  */
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

  try {
    const existentes = new Set(
      (await prisma.permission.findMany({ select: { code: true } })).map((fila) => fila.code),
    );
    const faltan = PERMISSIONS.filter((code) => !existentes.has(code));

    console.log(
      faltan.length === 0
        ? 'Catalogo de permisos al dia.'
        : `Faltan ${faltan.length} en el catalogo: ${faltan.join(', ')}`,
    );

    if (deVerdad) {
      for (const code of faltan) {
        await prisma.permission.create({
          data: {
            code,
            category: code.split(':')[0] ?? 'general',
            description: `Permiso ${code}`,
          },
        });
      }
    }

    const permisos = await prisma.permission.findMany({ select: { id: true, code: true } });
    const idPorCodigo = new Map(permisos.map((fila) => [fila.code, fila.id]));
    // EN ENSAYO se cuentan tambien los que se acaban de listar como faltantes: si no, el ensayo
    // diria 'los roles ya tienen lo que les toca' justo cuando falta conceder el permiso nuevo, que
    // es la unica pregunta que se le hace.
    if (!deVerdad) for (const code of faltan) idPorCodigo.set(code, 'ENSAYO');

    // Los roles de TODOS los tenants: un permiso nuevo hace falta en cada empresa, no solo en la
    // primera. Se buscan por su codigo de rol semilla; los roles que el tenant creo por su cuenta no
    // se tocan — lo que un administrador arma es suyo.
    const roles = await prisma.role.findMany({
      where: { code: { in: Object.keys(SEED_ROLE_PERMISSIONS) } },
      select: { id: true, code: true, tenantId: true },
    });

    let concedidos = 0;
    for (const rol of roles) {
      const deberia = SEED_ROLE_PERMISSIONS[rol.code] ?? [];
      const tiene = new Set(
        (
          await prisma.rolePermission.findMany({
            where: { roleId: rol.id },
            select: { permission: { select: { code: true } } },
          })
        ).map((fila) => fila.permission.code),
      );

      for (const code of deberia as readonly PermissionCode[]) {
        if (tiene.has(code)) continue;
        const permissionId = idPorCodigo.get(code);
        if (!permissionId) continue;
        concedidos += 1;
        console.log(`  ${rol.code} (${rol.tenantId.slice(0, 8)}) <- ${code}`);
        if (deVerdad) {
          await prisma.rolePermission.create({
            data: { roleId: rol.id, permissionId, tenantId: rol.tenantId },
          });
        }
      }
    }

    console.log(
      concedidos === 0
        ? 'Los roles semilla ya tienen lo que les toca.'
        : deVerdad
          ? `${concedidos} concesion(es) creadas.`
          : `${concedidos} concesion(es) por crear. Corre con -- --si para aplicarlas.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
