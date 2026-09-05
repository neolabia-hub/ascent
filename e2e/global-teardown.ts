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
  try {
    execSync('pnpm --filter @neo-pulse/api dev:limpiar-reglas', { stdio: 'inherit' });
  } catch (error) {
    // Que la limpieza falle NO puede tumbar una suite verde: el resultado de las pruebas ya se
    // decidio antes de llegar aqui. Se avisa y se sigue.
    console.warn('No se pudo limpiar las reglas de prueba. Ejecutalo a mano si el alta de personas se pone lenta.');
    console.warn(error instanceof Error ? error.message : error);
  }
}
