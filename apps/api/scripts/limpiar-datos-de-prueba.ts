import { PrismaClient } from '@prisma/client';

/**
 * SACA DEL MOTOR LO QUE DEJAN LOS RECORRIDOS Y LAS DEMOSTRACIONES.
 *
 *   pnpm --filter @neo-pulse/api dev:limpiar-pruebas          enseña que haria, sin tocar nada
 *   pnpm --filter @neo-pulse/api dev:limpiar-pruebas -- --si   lo hace
 *
 * ─── POR QUE HACE FALTA OTRO ADEMAS DE `limpiar-reglas-de-prueba.ts` ───
 *
 * Aquel busca por el nombre de la AUDIENCIA ("Toda la empresa <marca>") y, con razon, **respeta las
 * reglas de formaciones PUBLICADAS**: `findOrCreate` reutiliza audiencias, asi que una induccion
 * real puede acabar colgando de una audiencia con nombre de prueba, y desactivarla dejaria a esa
 * induccion sin regla. Ya paso y lo reporto el cliente.
 *
 * El efecto es que la basura que SI esta publicada se queda. Los recorridos publican —tienen que
 * hacerlo para probar el cierre— asi que cada corrida deja formaciones publicadas con sus reglas
 * vivas. El 2026-09-06 habia 112, y la consecuencia estaba medida: el e2e `sprint-1 · contrasena
 * generada` expiraba en la corrida completa porque crear una persona dispara el motor sobre todas
 * las audiencias vivas. El sintoma no se parece a la causa —falla una prueba de crear personas, que
 * no toca asignaciones— que es justo por lo que esto tiene que ser un script y no algo que alguien
 * recuerde.
 *
 * ─── COMO DISTINGUE LO DE PRUEBA, SIN LA DUDA QUE TENIA EL OTRO ───
 *
 * Por el nombre o el codigo de la FORMACION, no por el de la audiencia. Los recorridos les ponen un
 * sufijo con marca de tiempo —`E2E123456`, `DEMO123456`— y **nadie llama asi a una formacion de
 * verdad**. Por eso aqui no hace falta perdonar a las publicadas: si se llama `Habilitacion
 * montacargas E2E819306`, es basura de una corrida, este publicada o no.
 *
 * El patron exige los DIGITOS. "E2E" suelto podria estar en el nombre de algo real; `E2E` seguido de
 * seis cifras es la firma de un script.
 *
 * ─── POR QUE DESACTIVA Y NO BORRA ───
 *
 * Por lo mismo que el otro, y la razon vale mas aqui: una regla borrada se lleva por delante las
 * asignaciones que la citan, y una formacion borrada, las inscripciones y las constancias. En una
 * base de desarrollo compartida con la que el cliente mira pantallas, un borrado en cascada mal
 * calculado se descubre cuando falta algo que nadie sabe que falta.
 *
 * Desactivar saca del motor, que es LO UNICO que hace falta para el problema medido, y deja la traza
 * entera. Un borrado de verdad por prefijo sigue siendo util para vaciar la base de vez en cuando,
 * pero es otro trabajo y con otro riesgo: no se mezcla con este.
 *
 * Es una utilidad de DESARROLLO. En produccion no aplica: alli no corre la suite.
 */

/** La firma de un script: el prefijo con su marca de tiempo. Nadie nombra asi una formacion. */
const FIRMA = /(E2E|DEMO|DM|AS|CR)\d{5,}/;

/*
  Y LOS NOMBRES QUE LA SUITE SE PONE A SI MISMA (ampliado el 2026-09-07).

  La primera version solo cazaba lo de los recorridos —`... E2E123456`— y dejaba 895 personas de las
  pruebas de Playwright, que se nombran de otra forma. El sintoma fue el de siempre y en otra
  prueba: el cargo "Director de Gestion Humana" acabo alcanzando a 256 personas —ninguna real— y
  guardar la regla tardaba tanto que `quienes-desde-la-ficha` expiraba con el boton girando.

  Cada patron exige el numero final, que es lo que la suite anade para no chocar consigo misma. Sin
  el, "Persona Prueba" a secas podria ser alguien de verdad.
*/
const NOMBRES_DE_PRUEBA = [
  /^Persona S\d+ \d+$/,
  /^Persona Prueba \d+$/,
  /^Importada (Uno|Dos) \d+$/,
  /^Analista Alcance \d+$/,
  /^Caza Obligacion \d+$/,
  /^Sonda SONDA\d+$/,
  /^Medicion Alta \d+$/,
];

/*
  LAS DOS CUENTAS QUE NO SE TOCAN NUNCA, suene a prueba su nombre o no.

  `888888888` es con la que ENTRA la suite de e2e y `999999999` es el administrador real.
  Desactivar la primera dejaria a las veintiuna pruebas sin poder iniciar sesion, y ese fallo
  —"credenciales invalidas" en todas— no se pareceria en nada a haber corrido una limpieza.
*/
const INTOCABLES = new Set(['888888888', '999999999']);

const esPersonaDePrueba = (nombre: string, documento: string) =>
  !INTOCABLES.has(documento) &&
  (FIRMA.test(nombre) || FIRMA.test(documento) || NOMBRES_DE_PRUEBA.some((re) => re.test(nombre)));

async function main() {
  const enSerio = process.argv.includes('--si');

  /*
    CORRE COMO DUENO DE LA BASE (DIRECT_DATABASE_URL), igual que la semilla y que el otro script.
    Con el usuario de la aplicacion no veria NADA: esta sujeto a RLS y la politica filtra por
    `app.tenant_id`, que en un script suelto no esta fijado — y un filtro vacio y un conjunto vacio
    se ven igual desde fuera.
  */
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  try {
    const formaciones = (
      await prisma.activity.findMany({ select: { id: true, code: true, name: true } })
    ).filter((a) => FIRMA.test(a.name) || FIRMA.test(a.code));

    if (formaciones.length === 0) {
      console.log('Nada que limpiar: no hay formaciones con firma de prueba.');
      return;
    }

    const ids = formaciones.map((a) => a.id);
    const reglasVivas = await prisma.assignmentRule.count({ where: { active: true, targetId: { in: ids } } });
    const personas = (
      await prisma.user.findMany({ where: { active: true }, select: { id: true, fullName: true, documentNumber: true } })
    ).filter((u) => esPersonaDePrueba(u.fullName, u.documentNumber));

    console.log(`Formaciones con firma de prueba: ${formaciones.length}`);
    console.log(`  · reglas activas que cuelgan de ellas: ${reglasVivas}`);
    console.log(`  · personas de prueba todavia activas: ${personas.length}`);
    console.log('');
    for (const a of formaciones.slice(0, 8)) console.log(`    ${a.code} — ${a.name}`);
    if (formaciones.length > 8) console.log(`    ... y ${formaciones.length - 8} mas`);
    console.log('');

    if (!enSerio) {
      console.log('Esto ha sido un ENSAYO: no se ha tocado nada.');
      console.log('Para hacerlo: pnpm --filter @neo-pulse/api dev:limpiar-pruebas -- --si');
      return;
    }

    const reglas = await prisma.assignmentRule.updateMany({
      where: { active: true, targetId: { in: ids } },
      data: { active: false },
    });

    /*
      LAS PERSONAS TAMBIEN SE DESACTIVAN, y no es un extra: cada alta y cada cambio de una persona
      vuelve a pasar por el motor. Cientos de personas de mentira activas son cientos de recorridos
      que no le importan a nadie. Desactivar es ademas lo que ya hace la aplicacion con una baja
      —nunca borra— asi que no inventa un estado nuevo.
    */
    const bajas = personas.length
      ? await prisma.user.updateMany({ where: { id: { in: personas.map((u) => u.id) } }, data: { active: false } })
      : { count: 0 };

    const quedan = await prisma.assignmentRule.count({ where: { active: true } });
    console.log(`Desactivadas ${reglas.count} regla(s) de formaciones de prueba.`);
    console.log(`Desactivadas ${bajas.count} persona(s) de prueba.`);
    console.log(`Quedan ${quedan} regla(s) activa(s) en la base.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
