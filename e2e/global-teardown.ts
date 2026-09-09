import { execSync } from 'node:child_process';

/**
 * LA SUITE RECOGE LO QUE ENSUCIA.
 *
 * ─── EL PROBLEMA QUE CIERRA ───
 *
 * Cada corrida crea audiencias "Toda la empresa <marca de tiempo>" con su regla, y nada las
 * retiraba. Se acumulaban: pasadas ochenta y pico, crear una persona dejaba de ser instantaneo y la
 * prueba expiraba, porque el motor de requisitos evalua TODAS las reglas activas contra cada alta.
 *
 * Lo peor no era la lentitud sino el diagnostico: fallaba una prueba de ALTA DE PERSONAS, que no
 * toca asignaciones, y el sintoma no se parecia en nada a la causa. Justo antes de un despliegue,
 * una suite que falla por su propia basura entrena a mirar para otro lado, y ese es el dia en que
 * el fallo de verdad pasa por flaky.
 *
 * Existia el paliativo —`pnpm --filter @neo-pulse/api dev:limpiar-reglas`— y habia que acordarse.
 *
 * ─── Y POR QUE HACEN FALTA LOS DOS SCRIPTS (2026-09-07) ───
 *
 * El primero busca por el nombre de la AUDIENCIA y, con razon, **respeta las reglas de formaciones
 * PUBLICADAS**: `findOrCreate` reutiliza audiencias, asi que una induccion real puede acabar
 * colgando de una con nombre de prueba, y desactivarla la dejaria sin regla. Ya paso una vez.
 *
 * El efecto secundario es que la basura que SI esta publicada se queda — y las corridas publican,
 * porque hay que publicar para probar el cierre. Con las PERSONAS pasaba lo mismo: la suite se
 * nombra a si misma ("Persona S3 ...", "Importada Uno ...") y nada las retiraba nunca.
 *
 * Lo medido el 2026-09-07: **910 personas activas y 906 de mentira**. El cargo "Director de Gestion
 * Humana" alcanzaba a 256 personas —ninguna real— y guardar su regla tardaba tanto que
 * `quienes-desde-la-ficha` expiraba con el boton girando. La suite bajo a 18 de 21, y el fallo
 * saltaba de una prueba a otra segun la corrida, que es exactamente lo que hace que parezca flaky y
 * que se mire para otro lado.
 *
 * Tras limpiar: **21 de 21** — comprobado ademas contra el codigo SIN los cambios de la sesion,
 * para descartar que fuera una regresion. Por eso ahora corren LOS DOS: cada uno ve una mitad.
 *
 * ─── POR QUE LLAMA AL SCRIPT Y NO REPITE SU CODIGO ───
 *
 * El script sabe dos cosas que costaron: que hay que conectarse como DUENO de la base (el usuario
 * de la aplicacion esta sujeto a RLS y desde un script suelto no ve NADA, que se lee igual que "no
 * hay nada que limpiar"), y que las reglas se DESACTIVAN en vez de borrarse, porque borrarlas se
 * lleva por delante asignaciones, que en este producto son evidencia. Copiarlo aqui seria tener dos
 * sitios donde acordarse de las dos cosas.
 *
 * Se ejecuta con el cwd de `apps/api` para que herede su `.env`, que es de donde sale la conexion
 * de dueno.
 */
export default function globalTeardown(): void {
  const limpiezas = [
    ['las reglas de las audiencias generadas', 'pnpm --filter @neo-pulse/api dev:limpiar-reglas'],
    ['las formaciones y personas de prueba', 'pnpm --filter @neo-pulse/api dev:limpiar-pruebas -- --si'],
  ] as const;

  for (const [que, comando] of limpiezas) {
    try {
      execSync(comando, { stdio: 'inherit' });
    } catch (error) {
      /*
        Que la limpieza falle NO puede tumbar una suite verde: el resultado de las pruebas ya se
        decidio antes de llegar aqui, y confundir "no pude recoger" con "algo esta roto" es la forma
        mas rapida de que se deje de mirar el rojo.

        Y no se corta el bucle: que falle una no es motivo para saltarse la otra, porque cada una
        limpia una mitad distinta y la que quede sin correr es la que hara fallar la proxima suite.
      */
      console.warn(`No se pudo limpiar ${que}. Ejecutalo a mano si las pruebas empiezan a expirar.`);
      console.warn(`  ${comando}`);
      console.warn(error instanceof Error ? error.message : error);
    }
  }
}
