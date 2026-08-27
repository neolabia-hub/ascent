import { expect, test } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 3 (Definition of Done de la entrega de la formacion):
 *
 *  1. una audiencia y un requisito hacen que la obligacion NAZCA sola,
 *  2. al dar de alta a una persona le nace su induccion con vencimiento ANTES de su ingreso,
 *  3. una convocatoria publicada congela sus proyectados, y
 *  4. el plan anual muestra cumplimiento y cobertura, y sigue publicado como historia.
 *
 * Depende del contenido publicado que crea el flujo del Sprint 2: aqui se crea el propio, para
 * que la prueba sea repetible sobre la misma base.
 */

/** Crea una actividad con una leccion y la deja PUBLICADA (requisito para convocarla). */
async function publishedActivity(page: import('@playwright/test').Page, suffix: string, name: string) {
  await page.goto('/lecciones');
  await page.getByRole('button', { name: 'Nueva leccion' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion ${name} ${suffix}`);
  await page.getByRole('button', { name: /Crear/ }).click();
  await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code').fill(`S3_${suffix}`);
  await page.locator('#a-name').fill(`${name} ${suffix}`);
  await page.locator('#a-type').selectOption({ label: 'Induccion general' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
  await page.locator('#c-type').selectOption('LESSON');
  await page.locator('#c-title').fill('Bienvenida');
  const lessonValue = await page
    .locator('#c-lesson option', { hasText: `Leccion ${name} ${suffix}` })
    .first()
    .getAttribute('value');
  await page.locator('#c-lesson').selectOption(lessonValue as string);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Contenido agregado')).toBeVisible();

  await page.getByRole('button', { name: 'Publicar version' }).click();
  await page.getByRole('button', { name: 'Publicar y congelar' }).click();
  await expect(page.getByText('Version 1 publicada')).toBeVisible();
}

test.describe('Sprint 3 — convocatorias, asignaciones y plan', () => {
  test('DoD: la obligacion nace sola al ingresar y vence antes de la fecha de ingreso', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Induccion S3 ${suffix}`;
    await publishedActivity(page, suffix, 'Induccion S3');

    // 1. Audiencia de toda la empresa.
    await page.goto('/asignaciones');
    await page.getByRole('button', { name: 'Audiencias' }).click();
    await page.getByRole('button', { name: 'Nueva audiencia' }).click();
    await page.locator('#a-name').fill(`Toda la empresa ${suffix}`);
    await expect(page.getByText(/Sin filtros, la audiencia es TODA la empresa/)).toBeVisible();
    await page.getByRole('button', { name: 'Crear audiencia' }).click();
    await expect(page.getByText('Audiencia creada')).toBeVisible();

    // 2. Requisito de ingreso: vence UN DIA ANTES de empezar a trabajar (D1072).
    await page.getByRole('button', { name: 'Requisitos' }).click();
    await page.getByRole('button', { name: 'Nuevo requisito' }).click();
    // El texto de la opcion incluye el conteo de personas: se resuelve el value real.
    const audienceValue = await page
      .locator('#r-audience option', { hasText: `Toda la empresa ${suffix}` })
      .first()
      .getAttribute('value');
    expect(audienceValue).toBeTruthy();
    await page.locator('#r-audience').selectOption(audienceValue as string);
    await page.locator('#r-target').selectOption({ label: activityName });
    await page.locator('#r-trigger').selectOption('ON_HIRE');
    await page.locator('#r-due').fill('-1');
    await page.getByRole('button', { name: 'Crear requisito' }).click();
    await expect(page.getByText('Requisito creado')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: activityName }).getByText('1 dia antes')).toBeVisible();

    // 3. Alta de una persona con fecha de ingreso futura.
    await page.goto('/personas');
    await page.getByRole('button', { name: 'Nueva persona' }).first().click();
    await page.locator('#u-doc').fill(`77${suffix}`);
    await page.locator('#u-name').fill(`Persona S3 ${suffix}`);
    await page.locator('#u-email').fill(`s3${suffix}@transprensa.test`);
    await page.locator('#u-job').selectOption({ index: 1 });
    await page.locator('#u-area').selectOption({ index: 1 });
    await page.locator('#u-hired').fill('2026-12-01');
    await page.getByRole('button', { name: 'Crear persona' }).click();
    await expect(page.getByRole('button', { name: 'Entendido' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Entendido' }).click();

    // 4. La obligacion existe sin que nadie la asignara, y vence ANTES del ingreso.
    await page.goto('/asignaciones');
    await page.getByRole('button', { name: 'Obligaciones' }).click();
    await page.getByPlaceholder('Buscar por nombre o documento').fill(`Persona S3 ${suffix}`);
    const row = page.getByRole('row').filter({ hasText: `Persona S3 ${suffix}` }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('Requisito')).toBeVisible();
    await expect(row.getByText('PENDIENTE')).toBeVisible();
    // Ingreso el 1 de diciembre, requisito a un dia antes: vence el 30 de noviembre. La fecha
    // exacta importa: es la evidencia de que la induccion es PREVIA al inicio de labores.
    await expect(row).toContainText('30 de nov');
  });

  test('DoD: publicar la convocatoria congela los proyectados y el plan mide sobre ellos', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Capacitacion S3 ${suffix}`;
    await publishedActivity(page, suffix, 'Capacitacion S3');

    // 1. Convocatoria presencial.
    await page.goto('/convocatorias');
    await page.getByRole('button', { name: 'Nueva convocatoria' }).click();
    await page.locator('#o-version').selectOption({ label: `${activityName} (v1)` });
    await page.locator('#o-kind').selectOption('EVENT');
    await page.locator('#o-modality').selectOption('PRESENCIAL');
    await page.locator('#o-date').fill('2026-03-10');
    await page.locator('#o-location').fill('Auditorio principal');
    await page.getByRole('button', { name: 'Crear convocatoria' }).click();
    await page.waitForURL('**/convocatorias/**', { timeout: 20_000 });
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();

    // 2. Publicar congela los proyectados.
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText(/Proyectados derivados/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Convocatoria publicada')).toBeVisible();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await expect(page.getByText(/Congelados el/)).toBeVisible();

    // 3. Plan anual con esa convocatoria.
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Nuevo plan' }).click();
    await page.locator('#p-year').fill('2026');
    await page.locator('#p-name').fill(`Plan S3 ${suffix}`);
    await page.getByRole('button', { name: 'Crear plan' }).click();
    await page.waitForURL('**/plan/**', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Agregar convocatoria' }).first().click();
    await page.locator('#i-offering').selectOption({ index: 1 });
    await page.locator('#i-month').selectOption('3');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('Renglon agregado')).toBeVisible();

    // 4. Aprobar congela los proyectados del renglon y crea las obligaciones del plan.
    await page.getByRole('button', { name: 'Aprobar plan' }).click();
    await expect(page.getByText('Plan aprobado')).toBeVisible();
    await expect(page.getByText('APROBADO', { exact: true })).toBeVisible();
    await expect(page.getByText('Cumplimiento del programa')).toBeVisible();
    // La cobertura se lee sobre los proyectados CONGELADOS del renglon, no sobre un numero vivo.
    await expect(page.getByText(/capacitados de \d+ proyectados/)).toBeVisible();
    await expect(page.getByText(/ejecutadas de 1 programadas/)).toBeVisible();

    // 5. Aprobado, el plan ya no se edita: sus renglones obligan a personas.
    await expect(page.getByRole('button', { name: 'Agregar convocatoria' })).toHaveCount(0);
  });
});
