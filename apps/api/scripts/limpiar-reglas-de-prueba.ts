import { PrismaClient } from '@prisma/client';

/**
 * Desactiva las reglas de asignacion que dejan atras las corridas de e2e.
 *
 *   pnpm --filter @neo-pulse/api dev:limpiar-reglas
 *
 * ─── EL PROBLEMA ───
 *
 * Cada corrida de la suite crea una audiencia "Toda la empresa <timestamp>" con su regla, y nada
 * las retira al terminar. Se acumulan: a las ochenta y pico, crear una persona pasa de instantaneo
 * a agotar el tiempo de espera, porque el motor de requisitos evalua TODAS las reglas activas
 * contra cada alta. El sintoma no se parece a la causa —fallan pruebas de crear personas, que no
 * tocan asignaciones— y por eso conviene que exista este script y no un comando que alguien tenga
 * que recordar.
 *
 * ─── POR QUE DESACTIVAR Y NO BORRAR ───
 *
 * Una regla borrada se lleva por delante las asignaciones que la citan, y eso son datos de
 * formacion de personas: en este producto, evidencia. Desactivar la saca del motor —que es lo
 * unico que hace falta— y deja la traza intacta.
 *
 * ─── SOLO TOCA LO QUE DEJARON LAS PRUEBAS ───
 *
 * El filtro es el nombre generado por la suite, con su marca de tiempo. Una audiencia que alguien
 * creo a mano y llamo "Toda la empresa" no lo cumple —no lleva numero— y no se toca.
 *
 * Esto es una utilidad de DESARROLLO. En produccion no aplica: alli no corre la suite.
 */
async function main() {
  /*
    CORRE COMO DUENO DE LA BASE DE DATOS (DIRECT_DATABASE_URL), igual que la semilla.

    Con el usuario de la aplicacion no veia NADA: ese usuario esta sujeto a RLS y la politica filtra
    por `app.tenant_id`, que en un script suelto no esta fijado. El resultado era el peor posible —
    "nada que limpiar" con noventa reglas delante— porque un filtro vacio y un conjunto vacio se ven
    igual desde fuera.
  */
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  try {
    const audiencias = await prisma.audience.findMany({
      // El espacio y el numero son lo que distingue lo generado de lo escrito por una persona.
      where: { name: { startsWith: 'Toda la empresa ' } },
      select: { id: true, name: true },
    });

    if (audiencias.length === 0) {
      console.log('Nada que limpiar: no hay audiencias generadas por las pruebas.');
      return;
    }

    const { count } = await prisma.assignmentRule.updateMany({
      where: { active: true, audienceId: { in: audiencias.map((a) => a.id) } },
      data: { active: false },
    });

    const quedan = await prisma.assignmentRule.count({ where: { active: true } });
    console.log(`Desactivadas ${count} regla(s) de ${audiencias.length} audiencia(s) de prueba.`);
    console.log(`Quedan ${quedan} regla(s) activa(s) — esas son las de verdad.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
