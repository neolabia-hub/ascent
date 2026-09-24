import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * CAMPAÑA DE PRIMER INGRESO CON LA CEDULA (2026-09-24). Un solo uso, a mano, en el servidor.
 *
 *   tsx scripts/clave-igual-a-documento.ts --tenant transprensa                  ENSAYO: cuenta y no escribe
 *   tsx scripts/clave-igual-a-documento.ts --tenant transprensa --si             abre la campaña
 *   tsx scripts/clave-igual-a-documento.ts --tenant transprensa --cierre         ENSAYO del cierre
 *   tsx scripts/clave-igual-a-documento.ts --tenant transprensa --cierre --si    cierra la campaña
 *
 *   --solo <documento>   limita todo a UNA persona. Es para probarlo en desarrollo sin cambiarle la
 *                        clave a las cuentas de las pruebas; en el servidor no se usa.
 *
 * ─── POR QUE EXISTE ───
 *
 * El cliente carga 1.200 personas de una vez y no quiere repartir 1.200 claves generadas
 * (`documento + 5 caracteres`). Pidio que, SOLO ESTA VEZ, la clave de todos sea su numero de
 * documento y que al entrar se les obligue a cambiarla. Despues todo sigue como siempre: el
 * generador de claves no se toca, y quien se cree mañana recibe la clave generada de siempre.
 *
 * ─── ABRIR (`--si`) ───
 *
 * A TODA persona activa del tenant **menos a quien tiene rol ADMIN**: clave = su documento, cambio
 * obligatorio al entrar, contador de fallos a cero, y sus sesiones abiertas CERRADAS. Esto ultimo
 * no es un detalle: quien ya estuviera dentro veria la pantalla de cambio pidiendole «la clave
 * actual», teclearia la suya de antes y no le serviria. Cerrandole la sesion entra de nuevo con la
 * cedula y la pantalla le pide justo esa.
 *
 * ─── CERRAR (`--cierre --si`) ───
 *
 * La cedula no es secreta: sale en carnés, planillas y nominas. Mientras la campaña esta abierta,
 * quien conozca la de un compañero puede entrar antes que el y ponerle clave. El cierre acota ese
 * riesgo en el tiempo: a quien, pasado el plazo anunciado, **siga teniendo la cedula como clave**,
 * se le pone una clave aleatoria que nadie conoce. Esa persona entra pidiendo ayuda desde el login
 * («No puedo entrar») y quien administra le restablece la clave desde su ficha, como siempre.
 *
 * Se decide persona por persona COMPROBANDO la clave (argon2.verify contra su documento), no con
 * una marca: asi no hace falta columna nueva, y quien ya la cambio no se toca por ningun motivo.
 *
 * Corre como dueño de la base (DIRECT_DATABASE_URL), igual que `sincronizar-permisos`: `users`
 * esta bajo RLS y un script suelto no tiene tenant fijado.
 */
async function main(): Promise<void> {
  const deVerdad = process.argv.includes('--si');
  const cierre = process.argv.includes('--cierre');
  const slug = process.argv[process.argv.indexOf('--tenant') + 1];
  if (!process.argv.includes('--tenant') || !slug || slug.startsWith('--')) {
    console.error('Falta --tenant <slug>. Ejemplo: --tenant transprensa');
    process.exit(2);
  }

  const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : undefined;

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!tenant) {
      console.error(`No existe el tenant "${slug}".`);
      process.exit(2);
    }

    const todos = await prisma.user.findMany({
      where: { tenantId: tenant.id, deletedAt: null, active: true, ...(solo ? { documentNumber: solo } : {}) },
      select: { id: true, documentNumber: true, passwordHash: true, role: { select: { code: true } } },
    });
    const admins = todos.filter((u) => u.role.code === 'ADMIN');
    const resto = todos.filter((u) => u.role.code !== 'ADMIN');

    console.log(`${tenant.name}: ${todos.length} personas activas.`);
    console.log(`  ${admins.length} con rol ADMIN: NO se tocan.`);

    if (!cierre) {
      console.log(`  ${resto.length} pasarian a tener su documento como clave, con cambio obligatorio y sesiones cerradas.`);
      if (!deVerdad) {
        console.log('\nENSAYO: no se escribio nada. Para aplicarlo, repetir con --si');
        return;
      }
      let hechas = 0;
      for (const u of resto) {
        await prisma.user.update({
          where: { id: u.id },
          data: {
            passwordHash: await argon2.hash(u.documentNumber),
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        await prisma.userSession.deleteMany({ where: { userId: u.id } });
        hechas += 1;
        if (hechas % 100 === 0) console.log(`  ... ${hechas}/${resto.length}`);
      }
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'PASSWORD_CAMPAIGN_OPENED',
          resourceType: 'users',
          newValues: { personas: hechas, adminsExcluidos: admins.length },
        },
      });
      console.log(`\nHECHO: ${hechas} personas entran ahora con su documento y deben cambiar la clave.`);
      return;
    }

    // ─── CIERRE ───
    const conCedula: typeof resto = [];
    let revisadas = 0;
    for (const u of resto) {
      if (await argon2.verify(u.passwordHash, u.documentNumber).catch(() => false)) conCedula.push(u);
      revisadas += 1;
      if (revisadas % 200 === 0) console.log(`  ... revisadas ${revisadas}/${resto.length}`);
    }
    console.log(`  ${resto.length - conCedula.length} ya cambiaron su clave: no se tocan.`);
    console.log(`  ${conCedula.length} siguen con el documento como clave: se les pondria una aleatoria.`);
    if (!deVerdad) {
      console.log('\nENSAYO: no se escribio nada. Para aplicarlo, repetir con --cierre --si');
      return;
    }
    for (const u of conCedula) {
      await prisma.user.update({
        where: { id: u.id },
        // 32 bytes al azar que no se guardan en ningun sitio: nadie puede entrar con ella.
        data: { passwordHash: await argon2.hash(randomBytes(32).toString('base64url')), mustChangePassword: true },
      });
      await prisma.userSession.deleteMany({ where: { userId: u.id } });
    }
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'PASSWORD_CAMPAIGN_CLOSED',
        resourceType: 'users',
        newValues: { personasSinEntrar: conCedula.length },
      },
    });
    console.log(`\nHECHO: ${conCedula.length} personas ya no pueden entrar con el documento; piden ayuda desde el login.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
