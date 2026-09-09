import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Usuario de pruebas del seed (rol ADMIN, contrasena ya cambiada y politicas aceptadas):
// entra directo al panel, lo que hace el e2e repetible. Ver seedE2EUser en prisma/seed.ts.
export const E2E_DOCUMENT = '888888888';
export const E2E_PASSWORD = 'PruebaE2E2026*';
export const TENANT_SLUG = 'transprensa';

/**
 * Inicia sesion con el usuario de pruebas. En desarrollo no hay subdominios, asi que el tenant
 * se resuelve por query param `?tenant=` (ver src/lib/tenant.ts).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`/login?tenant=${TENANT_SLUG}`);
  /*
    EXACTO, no por parte del texto. `getByLabel` busca por SUBCADENA, y el ojo de "ver la
    contraseña" que hay dentro del campo tambien lleva esa palabra en su etiqueta accesible: sin
    `exact` la busqueda encuentra dos elementos y falla. Lo cazo la suite entera en rojo.
  */
  await page.getByLabel('Cedula o correo', { exact: true }).fill(E2E_DOCUMENT);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/inicio', { timeout: 20_000 });
}

/** Sufijo unico para codigos/documentos, para que el e2e sea repetible sobre la misma base. */
export function unique(): string {
  return String(Date.now()).slice(-8);
}

/**
 * UN PLAN POR ANO (Decision #71), y las pruebas tienen que convivir con eso.
 *
 * Antes cada prueba creaba "Plan S3 <sufijo>" en el año en curso y el sufijo las mantenia
 * separadas: la base de desarrollo acabo con 168 planes de 2026. Ahora el año ES la clave, asi que
 * dos pruebas del mismo año chocan entre si y con el plan de verdad.
 *
 * Cada prueba trabaja en SU año y empieza BORRANDO el suyo. Limpiar al empezar y no solo al
 * terminar es a proposito: una corrida interrumpida deja el plan puesto, y si la limpieza viviera
 * solo al final la siguiente corrida no arrancaria.
 *
 * Los años se CALCULAN desde el actual y no se clavan: el selector del formulario solo ofrece de
 * dos años atras a uno adelante —fuera de eso no hay opcion que elegir—, asi que unas constantes
 * fijas dejarian de existir en el desplegable al cambiar de año. Y el ANO EN CURSO se deja libre a
 * proposito: es el que usa la empresa de verdad.
 */
const ANO_ACTUAL = new Date().getFullYear();
export const ANO_PLAN_DOD = ANO_ACTUAL - 2;
export const ANO_PLAN_DESECHABLE = ANO_ACTUAL - 1;
/**
 * El de "ida y vuelta" va al año SIGUIENTE, no a uno pasado, porque esa prueba comprueba que la
 * ficha de una capacitacion del plan dice en que plan esta: la tarjeta de la ficha solo mira
 * planes del año en curso o posteriores —en 2026 nadie programa dentro de 2024— y con un año
 * pasado diria, con razon, que no hay ningun plan abierto al que agregarla.
 */
export const ANO_PLAN_IDA_Y_VUELTA = ANO_ACTUAL + 1;

/**
 * Borra el plan de ese año si existe. Sirve en borrador, aprobado (pide motivo) y cerrado sin
 * obligaciones (Decision #72).
 *
 * Se localiza por el rotulo accesible del boton —"Eliminar el plan de 2027"— y no por la fila de
 * una tabla: el listado son TARJETAS desde que dejo de ser una tabla, y ese rotulo lleva el año
 * dentro, que es justo lo que hace falta para no borrar el de al lado.
 */
export async function limpiarPlanDelAno(page: Page, year: number): Promise<void> {
  await page.goto('/plan');
  /**
   * Se espera a que la LISTA llegue, y se espera por una señal POSITIVA.
   *
   * Dos intentos fallaron antes, y los dos por la misma razon de fondo:
   *   - esperar el TITULO no espera nada: es estatico y esta desde el primer render;
   *   - esperar a que el esqueleto DESAPAREZCA acierta igual cuando todavia no ha llegado a
   *     aparecer, que es lo que pasa justo despues de `goto`.
   * En los dos casos se contaban los botones con la lista vacia, se concluia "no hay plan de 2024
   * que borrar", y el fallo salia dos pasos despues —el desplegable sin la opcion 2024— en un
   * sitio que no tenia la culpa.
   *
   * `aria-busy="false"` sobre un contenedor que esta SIEMPRE no tiene ese problema: solo puede ser
   * cierto cuando la respuesta ya llego.
   */
  await page
    .locator('[role="region"][aria-label="Planes de capacitacion"][aria-busy="false"]')
    .waitFor({ timeout: 20_000 });

  const borrar = page.getByRole('button', { name: `Eliminar el plan de ${year}` });
  if ((await borrar.count()) === 0) return;

  await borrar.first().click();
  const motivo = page.locator('#d-reason');
  // El cajon solo pide motivo si el plan ya estaba aprobado: en borrador no obligo a nadie.
  if (await motivo.isVisible().catch(() => false)) {
    await motivo.fill('Limpieza de la corrida anterior de las pruebas automatizadas.');
  }
  await page.getByRole('button', { name: 'Eliminar el plan' }).click();
  await page.getByText('Plan eliminado').waitFor({ timeout: 20_000 });
}

/**
 * Deja creado y abierto el plan de ese año, partiendo de cero. Devuelve su ruta.
 *
 * El boton lleva el año en el texto ("Crear el plan de 2026") porque propone el primer año libre,
 * asi que se busca por prefijo. Y el año se ELIGE en un selector: escribirlo dejo de ser posible
 * cuando dejo de tener sentido teclear 2062.
 */
export async function crearPlanDelAno(page: Page, year: number, nombre: string): Promise<string> {
  await limpiarPlanDelAno(page, year);
  await page
    .getByRole('button', { name: /^Crear el plan de/ })
    .first()
    .click();
  await page.locator('#p-year').selectOption(String(year));
  await page.locator('#p-name').fill(nombre);
  await page.getByRole('button', { name: 'Crear plan' }).click();
  await page.waitForURL('**/plan/**', { timeout: 20_000 });
  return new URL(page.url()).pathname;
}

/**
 * Elegir una opcion en un `Combo` (`components/ui/combo.tsx`).
 *
 * No es un `<select>`: es un boton que abre una lista, con buscador cuando la lista es larga o
 * cuando se pregunta al servidor. Se escribe el termino a proposito en vez de recorrer la lista —
 * es lo que hace de verdad una persona, y ademas ejercita la busqueda.
 */
export async function elegirEnCombo(page: Page, comboId: string, nombre: string): Promise<void> {
  await page.locator(`#${comboId}`).click();
  const buscador = page.getByRole('textbox', { name: /Buscar/ });
  if (await buscador.isVisible().catch(() => false)) {
    await buscador.fill(nombre);
  }
  await page.getByRole('option', { name: new RegExp(nombre) }).first().click();
}

/**
 * AGREGA UNA EVALUACION al borrador abierto, desde la pestana Contenido.
 *
 * ─── POR QUE EXISTE (2026-09-04) ───
 *
 * Desde que publicar sin lo que el tipo pide se RECHAZA (Decision #74, cerrada), los tres
 * `publishedActivity` de la suite dejaron de poder publicar: los tipos que usan —induccion general,
 * capacitacion del plan, extraordinaria— piden evaluacion, y ninguno la anadia.
 *
 * Eso no era un descuido de las pruebas: era la señal, escrita en su dia, de que la regla no estaba
 * acordada. Ahora lo esta, y las pruebas se ponen al dia.
 *
 * Usa el ATAJO del cajon —un bloque de N preguntas al azar del banco— porque aqui la evaluacion no
 * es lo que se prueba: es el requisito para poder publicar. Quien quiera probar el constructor de
 * preguntas tiene `sprint-2.spec.ts`.
 */
export async function agregarEvaluacion(page: import('@playwright/test').Page, titulo: string) {
  await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
  await page.getByRole('button', { name: 'Evaluación' }).click();
  await page.locator('#c-title').fill(titulo);
  // El banco por defecto: el primero con preguntas. Sin categorias no hay examen posible, y eso lo
  // cubre la semilla.
  await page.locator('#c-category').selectOption({ index: 0 });
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Contenido agregado')).toBeVisible({ timeout: 20_000 });
}
