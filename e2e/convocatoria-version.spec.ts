import { expect, test } from '@playwright/test';
import { agregarEvaluacion, elegirEnCombo, loginAsAdmin, unique } from './helpers';

/**
 * PUBLICAR UNA VERSION NUEVA NO ACTUALIZA SOLO LA CONVOCATORIA — y hasta esta prueba tampoco
 * habia forma de actualizarla.
 *
 * El administrador publicaba la v2 de una formacion, la convocatoria seguia colgada de la v1 ya
 * retirada, y el aprendiz seguia cursando el contenido viejo sin que nada en pantalla lo dijera.
 * La politica de migracion se guardaba al publicar y no la leia nadie.
 *
 * Lo que esta prueba fija:
 *  1. la convocatoria AVISA cuando su formacion tiene una version mas nueva,
 *  2. antes de mover a nadie se ve A CUANTOS mueve y a cuantos no, y
 *  3. al actualizar, la convocatoria pasa a entregar la version nueva y el aviso desaparece.
 */

/** Crea una actividad con una leccion y la deja PUBLICADA en su version 1. */
async function publishedActivity(page: import('@playwright/test').Page, suffix: string, name: string) {
  await page.goto('/lecciones');
  await page.getByRole('button', { name: 'Nueva leccion' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion ${name} ${suffix}`);
  await page.getByRole('button', { name: /Crear/ }).click();
  await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(`VER_${suffix}`);
  await page.locator('#a-name').fill(`${name} ${suffix}`);
  await page.locator('#a-type').selectOption({ label: 'Induccion general' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Contenido', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
  await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
  await page.locator('#c-title').fill('Bienvenida');
  await page.getByRole('radio', { name: /Traer una leccion ya creada|Traer de la biblioteca/ }).click();
  const lessonValue = await page
    .locator('#c-lesson option', { hasText: `Leccion ${name} ${suffix}` })
    .first()
    .getAttribute('value');
  await page.locator('#c-lesson').selectOption(lessonValue as string);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Contenido agregado')).toBeVisible();

  // El tipo de esta formacion pide evaluacion, y desde el 2026-09-04 publicar sin ella se rechaza.
  await agregarEvaluacion(page, `Examen ${name} ${suffix}`);

  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await page.getByRole('button', { name: 'Publicar y congelar' }).click();
  await expect(page.getByText('Version 1 publicada')).toBeVisible();
}

test.describe('La convocatoria y la version vigente', () => {
  test('publicar la v2 avisa en la convocatoria, y actualizarla la pasa a la version nueva', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Version viva ${suffix}`;
    await publishedActivity(page, suffix, 'Version viva');
    const activityUrl = page.url();

    // 1. Convocatoria sobre la v1, publicada.
    await page.goto('/convocatorias');
    await page.getByRole('button', { name: 'Nueva convocatoria' }).click();
    await elegirEnCombo(page, 'o-version', activityName);
    await page.locator('#o-kind').selectOption('EVENT');
    await page.locator('#o-modality').selectOption('PRESENCIAL');
    await page.locator('#o-date').fill('2026-05-12');
    await page.locator('#o-location').fill('Sala de formacion');
    await page.getByRole('button', { name: 'Crear convocatoria' }).click();
    await page.waitForURL('**/convocatorias/**', { timeout: 20_000 });
    const offeringUrl = page.url();

    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Convocatoria publicada')).toBeVisible();

    // Mientras la v1 es la vigente NO hay aviso: un cartel permanente se vuelve invisible.
    await expect(page.getByText(/Hay una version mas nueva/)).toHaveCount(0);

    // 2. Se publica la v2 de la misma formacion.
    await page.goto(activityUrl);
    await page.getByRole('button', { name: 'Editar el contenido' }).click();
    await expect(page.getByText('Version 2 creada en borrador')).toBeVisible();
    await page.getByRole('button', { name: 'Publicar cambios' }).click();
    await page.getByRole('button', { name: 'Publicar y congelar' }).click();
    await expect(page.getByText('Version 2 publicada')).toBeVisible();

    // 3. La convocatoria lo DICE, y dice tambien lo que pasa si se actualiza.
    await page.goto(offeringUrl);
    await expect(page.getByText('Hay una version mas nueva: version 2')).toBeVisible();
    await expect(page.getByText(/sigue entregando la version 1/)).toBeVisible();

    // 4. Antes de mover a nadie se ven las cifras; sin inscritos, todas en cero.
    await page.getByRole('button', { name: 'Actualizar a la version 2' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Pasan a la version 2')).toBeVisible();
    await expect(drawer.getByText(/Ya cerradas/)).toBeVisible();
    await drawer.getByRole('button', { name: 'Actualizar', exact: true }).click();

    // 5. Queda entregando la version nueva y el aviso desaparece: la pantalla no sigue pidiendo
    //    algo que ya se hizo.
    await expect(page.getByText('Convocatoria actualizada a la version 2')).toBeVisible();
    await expect(page.getByText(/version 2 ·/)).toBeVisible();
    await expect(page.getByText(/Hay una version mas nueva/)).toHaveCount(0);
  });
});
