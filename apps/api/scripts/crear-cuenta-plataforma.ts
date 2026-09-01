import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Crea (o reactiva) una cuenta de PLATAFORMA — la del proveedor, no la de un cliente.
 *
 *   pnpm --filter @neo-pulse/api cuenta:plataforma correo@dominio.com "Nombre Apellido"
 *
 * ES UN SCRIPT Y NO UNA PANTALLA, a proposito. Estas cuentas administran a todos los clientes a la
 * vez, asi que el alta no puede estar detras de un formulario que alguien deje abierto: para
 * crearla hay que tener acceso al servidor y a la base de datos, que es exactamente el nivel de
 * privilegio que la cuenta concede. El dia que sean varias personas, el alta la hara otra cuenta
 * de plataforma ya existente desde su propio modulo — nunca un administrador de un cliente.
 *
 * LA CONTRASENA SE GENERA AQUI y se imprime UNA vez. No se acepta por parametro porque acabaria en
 * el historial del terminal, que es el sitio donde nadie se acuerda de que quedo escrita.
 */
async function main() {
  const [email, fullName] = process.argv.slice(2);
  if (!email || !fullName) {
    console.error('Uso: pnpm --filter @neo-pulse/api cuenta:plataforma <correo> "<Nombre Apellido>"');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    // 24 bytes en base64url: 32 caracteres sin ambiguedad de mayusculas ni signos que se pierdan
    // al copiar de un terminal.
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = await prisma.platformUser.upsert({
      where: { email: email.toLowerCase() },
      // Reactivar y reponer contrasena, no fallar: este script es tambien el camino de vuelta si
      // la unica cuenta de plataforma se bloquea o se pierde su contrasena.
      update: { fullName, passwordHash, active: true, failedLoginAttempts: 0, lockedUntil: null },
      create: { email: email.toLowerCase(), fullName, passwordHash },
    });

    // Si se repuso la contrasena, las sesiones abiertas dejan de valer: si sobrevivieran, quien
    // estuviera dentro seguiria dentro siete dias mas pese al cambio.
    const { count } = await prisma.platformSession.deleteMany({ where: { platformUserId: user.id } });

    console.log('\nCuenta de plataforma lista.\n');
    console.log(`  Correo      ${user.email}`);
    console.log(`  Contrasena  ${password}`);
    console.log(`  Ingreso     /plataforma/login`);
    if (count > 0) console.log(`\n  (${count} sesion(es) abierta(s) se cerraron)`);
    console.log('\nGuardala ahora: no se vuelve a mostrar.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
