import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 4 (Definition of Done de la experiencia del aprendiz):
 *
 *   "un auxiliar de bodega completa una pildora desde el celular sin senal estable;
 *    sus preguntas falladas reaparecen a los 2 dias; su racha avanza."
 *
 * Este archivo cubre la primera y la tercera parte de punta a punta: se arma una pildora real
 * desde administracion, se entra a la superficie del aprendiz en un viewport de telefono, se
 * cursa la leccion tarjeta por tarjeta y se comprueba que la formacion queda terminada y la
 * racha avanzo.
 *
 * La SEGUNDA parte —que lo fallado vuelva a los 2 dias— no se puede comprobar en un navegador
 * sin esperar dos dias: vive en `src/engagement/spaced-repetition.spec.ts`, que prueba los
 * escalones 2-7-14-30 con el reloj fijado. Aqui se comprueba lo que si es observable: que la
 * pantalla de repaso dice la verdad cuando hoy no hay nada.
 */

const PHONE = { width: 390, height: 844 };

/** Crea una pildora publicada: leccion de dos tarjetas + actividad MICROLEARNING + version 1. */
async function publishedPill(page: Page, suffix: string, pillName: string): Promise<void> {
  // 1. Leccion con DOS tarjetas: una de lectura y un quiz de refuerzo.
  await page.goto('/lecciones');
  await page.getByRole('button', { name: 'Nueva leccion' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion ${pillName}`);
  await page.getByRole('button', { name: /Crear/ }).click();
  await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
  await page.getByRole('button', { name: 'Texto e imagen' }).click();
  await page.locator('#c-title').fill('Antes de mover la estiba');
  await page.locator('#c-body').fill('Revisa que la carga este centrada y que el pasillo este libre.');

  await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
  await page.getByRole('button', { name: 'Quiz', exact: true }).click();
  await page.locator('#q-question').fill('Que revisas antes de mover la estiba?');
  // Cada opcion es una fila "radio + campo de texto": se llega al campo desde su propio radio,
  // que es lo unico con nombre accesible estable en esa fila.
  const optionText = (position: number) =>
    page.getByRole('radio', { name: `Marcar opcion ${position} como correcta` }).locator('xpath=following-sibling::input[1]');
  await optionText(1).fill('Que la carga este centrada');
  await optionText(2).fill('Nada, se mueve directo');
  await page.getByRole('radio', { name: 'Marcar opcion 1 como correcta' }).check();
  await page.getByRole('button', { name: 'Guardar leccion' }).click();
  await expect(page.getByText('Leccion guardada')).toBeVisible({ timeout: 20_000 });

  // 2. Actividad de tipo Pildora con esa leccion, publicada.
  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code').fill(`S4_${suffix}`);
  await page.locator('#a-name').fill(pillName);
  await page.locator('#a-type').selectOption({ label: 'Pildora' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  // La formacion es una ficha con pestanas: el contenido vive en la suya.
  await page.getByRole('button', { name: 'Contenido', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
  // Paso 1: se elige el TIPO en el selector de tarjetas (autoria reestructurada, 2026-08-27).
  await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
  await page.locator('#c-title').fill('La pildora');
  // Paso 2: se reutiliza una leccion de la biblioteca en vez de crear una nueva.
  await page.getByRole('radio', { name: 'Traer de la biblioteca' }).click();
  const lessonValue = await page
    .locator('#c-lesson option', { hasText: `Leccion ${pillName}` })
    .first()
    .getAttribute('value');
  await page.locator('#c-lesson').selectOption(lessonValue as string);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Contenido agregado')).toBeVisible();

  await page.getByRole('button', { name: 'Publicar version' }).click();
  await page.getByRole('button', { name: 'Publicar y congelar' }).click();
  await expect(page.getByText('Version 1 publicada')).toBeVisible();
}

test.describe('Sprint 4 — experiencia del aprendiz', () => {
  test('DoD: la pildora se cursa desde el telefono y la racha avanza', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const pillName = `Pildora S4 ${suffix}`;
    await publishedPill(page, suffix, pillName);

    // 3. Convocatoria PERMANENTE: es lo que permite que la persona la empiece por su cuenta.
    await page.goto('/convocatorias');
    await page.getByRole('button', { name: 'Nueva convocatoria' }).click();
    await page.locator('#o-version').selectOption({ label: `${pillName} (v1)` });
    await page.locator('#o-kind').selectOption('PERMANENT');
    await page.locator('#o-modality').selectOption('VIRTUAL');
    await page.getByRole('button', { name: 'Crear convocatoria' }).click();
    await page.waitForURL('**/convocatorias/**', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible({ timeout: 20_000 });

    // 4. La obligacion: se asigna a toda el area del usuario de pruebas (Gestion Humana).
    await page.goto('/asignaciones');
    await page.getByRole('button', { name: 'Obligaciones' }).click();
    await page.getByRole('button', { name: 'Asignar formacion' }).click();
    await page.locator('#m-target').selectOption({ label: pillName });
    await page.locator('#m-area').selectOption({ label: 'Gestion Humana' });
    await page.locator('#m-due').fill('2026-12-31');
    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    await expect(page.getByText(/obligaciones creadas/)).toBeVisible({ timeout: 20_000 });

    // ─────────── A partir de aqui, todo ocurre en un telefono ───────────
    await page.setViewportSize(PHONE);

    // 5. Sus pendientes. La pildora esta ahi y se puede empezar sin que nadie lo inscriba.
    await page.goto('/hoy');
    const card = page.locator('article').filter({ hasText: pillName }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button', { name: /Empezar|Continuar/ }).click();
    await page.waitForURL('**/aprender/**', { timeout: 20_000 });
    await expect(page.getByText(pillName)).toBeVisible();

    // 6. El reproductor: dos tarjetas, y el quiz exige responder antes de dejar avanzar.
    // La accion principal va primera en el DOM; las partes de la derecha repiten el rotulo.
    await page.getByRole('button', { name: /Empezar|Continuar/ }).first().click();
    await page.waitForURL('**/contenido/**', { timeout: 20_000 });
    // El titulo tambien aparece en el panel de contenido (oculto en movil): basta el primero.
    await expect(page.getByText('Antes de mover la estiba').first()).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByText('Que revisas antes de mover la estiba?').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Terminar' })).toBeDisabled();
    await page.getByRole('button', { name: 'Que la carga este centrada' }).click();
    await page.getByRole('button', { name: 'Terminar' }).click();

    // 7. Vuelve al indice y la formacion quedo terminada.
    await page.waitForURL(/\/aprender\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByText('Formacion terminada')).toBeVisible({ timeout: 20_000 });

    // 8. La racha avanzo. Se comprueba que NO sea cero en vez de exigir un numero exacto: la
    // racha es del dia, y varias corridas el mismo dia no la inflan (es justo lo que se quiso).
    await page.goto('/perfil');
    await expect(page.getByText('Racha actual')).toBeVisible({ timeout: 20_000 });
    const streak = page.locator('div').filter({ hasText: /^Racha actual/ }).first();
    await expect(streak).not.toContainText(/^Racha actual0/);

    // 9. Y quedo en su historial, que es su hoja de vida formativa.
    await page.goto('/mi-formacion');
    await page.getByRole('tab', { name: 'Historial' }).click();
    await expect(page.getByText(pillName).first()).toBeVisible({ timeout: 20_000 });
  });

  test('la pantalla de repaso dice cuando no hay nada, en vez de quedarse en blanco', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(PHONE);
    await page.goto('/repaso');

    // Una de las dos, nunca una pantalla vacia: o hay preguntas vencidas hoy, o se explica que no.
    const empty = page.getByText('Hoy no tienes repaso');
    const session = page.getByText(/Pregunta 1 de \d+/);
    await expect(empty.or(session)).toBeVisible({ timeout: 20_000 });
  });
});
