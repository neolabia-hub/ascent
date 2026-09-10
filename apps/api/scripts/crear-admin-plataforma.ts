/**
 * CREAR LA PRIMERA CUENTA DE PLATAFORMA.
 *
 * ─── EL HUECO QUE TAPA (2026-09-09, encontrado al desplegar) ───
 *
 * El módulo de plataforma sabía autenticar, refrescar sesiones y bloquear cuentas… pero **nadie
 * podía crear la primera**. No había semilla, ni script, ni endpoint: en la máquina de producción
 * `platform_users` estaba vacía y `/plataforma` era una puerta sin llave.
 *
 * Se notó por un camino largo: el cliente vació el contacto de soporte de su empresa esperando que
 * saliera el de la plataforma, y no salió ninguno — porque los datos de la plataforma se configuran
 * en `/plataforma`, donde no se podía entrar.
 *
 * ─── POR QUÉ UN SCRIPT Y NO UNA SEMILLA ───
 *
 * Una cuenta con acceso a TODAS las empresas no se crea sola al desplegar. Se crea cuando una
 * persona decide crearla, con su nombre y su correo, y **la contraseña se enseña una sola vez**.
 * Una cuenta de plataforma sembrada con contraseña conocida es una puerta abierta en cada
 * instalación del producto.
 *
 * ─── USO ───
 *
 *   pnpm --filter @neo-pulse/api plataforma:crear-admin -- --email=soporte@ascentio.app --nombre="Soporte Ascent"
 *
 * Genera una contraseña fuerte, la imprime UNA vez y no vuelve a mostrarla. Si la cuenta ya existe
 * no la toca: para cambiar la contraseña está `--reset`, que la vuelve a generar.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function argumento(nombre: string): string | null {
  const encontrado = process.argv.find((valor) => valor.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.slice(nombre.length + 3) : null;
}

/**
 * Contraseña de 24 caracteres en base64url: ~144 bits de entropía real. No se compone con palabras
 * ni con patrones "amables" —esta no la teclea nadie de memoria, se pega desde el gestor— y por eso
 * se puede permitir ser incómoda.
 */
function contrasenaFuerte(): string {
  return randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
  const email = argumento('email')?.trim().toLowerCase();
  const nombre = argumento('nombre')?.trim();
  const reset = process.argv.includes('--reset');

  if (!email || !email.includes('@')) {
    throw new Error('Falta --email=persona@dominio (es con lo que se entra a /plataforma)');
  }
  if (!nombre && !reset) {
    throw new Error('Falta --nombre="Como se llama quien va a entrar"');
  }

  const existente = await prisma.platformUser.findUnique({ where: { email }, select: { id: true } });

  if (existente && !reset) {
    console.log(`Ya existe una cuenta de plataforma con ${email}. Para cambiarle la contraseña: --reset`);
    return;
  }

  const contrasena = contrasenaFuerte();
  const passwordHash = await argon2.hash(contrasena);

  if (existente) {
    /*
      Al restablecer se ponen a cero los intentos fallidos y el bloqueo: si se llegó aquí es porque
      alguien perdió el acceso, y dejarle la cuenta bloqueada con la contraseña nueva sería no
      haberla restablecido.
    */
    await prisma.platformUser.update({
      where: { id: existente.id },
      data: { passwordHash, active: true, failedLoginAttempts: 0, lockedUntil: null },
    });
  } else {
    await prisma.platformUser.create({
      data: { email, fullName: nombre as string, passwordHash, active: true },
    });
  }

  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Cuenta de plataforma ${existente ? 'restablecida' : 'creada'}`);
  console.log('');
  console.log(`  Entra en:    /plataforma/login`);
  console.log(`  Correo:      ${email}`);
  console.log(`  Contraseña:  ${contrasena}`);
  console.log('');
  console.log('  Esta contraseña NO se vuelve a mostrar. Guárdala en tu gestor ahora.');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
}

main()
  .catch((error) => {
    console.error(`[crear-admin-plataforma] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
