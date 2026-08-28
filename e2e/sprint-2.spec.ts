import { expect, test } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 2 (Definition of Done del catalogo formativo):
 * crear una actividad con leccion y evaluacion, publicarla, y comprobar que lo publicado
 * queda congelado y que editarlo nace como una version nueva sin tocar la anterior.
 */

test.describe('Sprint 2 — catalogo formativo', () => {
  test('banco de preguntas: crear categoria y pregunta, y revisarla crea una version nueva', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/evaluaciones');

    const suffix = unique();
    const categoryName = `Categoria E2E ${suffix}`;

    await page.getByRole('button', { name: 'Nueva categoria' }).click();
    await page.locator('#cat-name').fill(categoryName);
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page.getByText('Categoria creada')).toBeVisible();

    await page.getByRole('button', { name: 'Nueva pregunta' }).click();
    await page.locator('#q-stem').fill(`Pregunta E2E ${suffix}: que se hace ante un derrame?`);
    await page.locator('input[placeholder="Opcion A"]').fill('Contener y avisar');
    await page.locator('input[placeholder="Opcion B"]').fill('Seguir trabajando');
    await page.getByRole('button', { name: 'Crear pregunta' }).click();
    await expect(page.getByText('Pregunta creada')).toBeVisible();

    // Editar una pregunta NO la modifica: nace la version 2.
    const row = page.getByRole('row').filter({ hasText: `Pregunta E2E ${suffix}` });
    await expect(row.getByText('V1')).toBeVisible();
    await row.getByRole('button', { name: 'Editar' }).click();
    await page.locator('#q-stem').fill(`Pregunta E2E ${suffix}: enunciado corregido`);
    await page.getByRole('button', { name: 'Guardar como version nueva' }).click();
    await expect(page.getByText('Pregunta revisada')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: `Pregunta E2E ${suffix}` }).getByText('V2')).toBeVisible();
  });

  test('DoD: publicar congela la version y editarla crea la v2 sin tocar la v1', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();

    // 1. Leccion con dos tarjetas.
    await page.goto('/lecciones');
    await page.getByRole('button', { name: 'Nueva leccion' }).click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(`Bienvenida E2E ${suffix}`);
    await page.getByRole('button', { name: /Crear/ }).click();
    await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

    // 2. Actividad formativa.
    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    await page.locator('#a-code').fill(`E2E_${suffix}`);
    await page.locator('#a-name').fill(`Induccion E2E ${suffix}`);
    await page.locator('#a-type').selectOption({ label: 'Induccion general' });
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

    // 3. Contenido: una leccion. La formacion es una ficha con pestanas; el contenido vive en la
    // suya (reestructuracion de la autoria, 2026-08-27).
    await page.getByRole('button', { name: 'Contenido', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
    // Paso 1: se elige el TIPO en el selector de tarjetas (autoria reestructurada, 2026-08-27).
    await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
    await page.locator('#c-title').fill('Bienvenida');
    // Se resuelve el value real de la opcion: `label` no admite expresiones regulares y el
    // texto incluye el conteo de tarjetas.
    // Paso 2: se reutiliza una leccion de la biblioteca en vez de crear una nueva.
    await page.getByRole('radio', { name: 'Traer de la biblioteca' }).click();
    const lessonValue = await page
      .locator('#c-lesson option', { hasText: `Bienvenida E2E ${suffix}` })
      .first()
      .getAttribute('value');
    expect(lessonValue).toBeTruthy();
    await page.locator('#c-lesson').selectOption(lessonValue as string);
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('Contenido agregado')).toBeVisible();

    // 4. Publicar: congela.
    await page.getByRole('button', { name: 'Publicar version' }).click();
    await expect(page.getByText(/Publicar congela el contenido/)).toBeVisible();
    await page.getByRole('button', { name: 'Publicar y congelar' }).click();
    await expect(page.getByText('Version 1 publicada')).toBeVisible();

    // 5. La version publicada es inmutable: ya no se puede agregar contenido.
    // El rotulo cambio al reestructurar la ficha ("publicada e inmutable"): se afirma el concepto.
    await expect(page.getByText(/inmutable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar contenido' })).toHaveCount(0);

    // 6. Editar lo publicado crea la version 2 en borrador.
    await page.getByRole('button', { name: 'Nueva version' }).click();
    await expect(page.getByText('Version 2 creada en borrador')).toBeVisible();

    // El historial de versiones vive en su pestana desde la reestructuracion de la autoria.
    await page.getByRole('button', { name: 'Versiones', exact: true }).click();
    await expect(page.getByText('Version 2').first()).toBeVisible();

    // 7. La version 1 sigue publicada y con su contenido intacto.
    await page.getByText('Version 1', { exact: true }).click();
    await page.getByRole('button', { name: 'Contenido', exact: true }).click();
    await expect(page.getByText(/inmutable/)).toBeVisible();
    await expect(page.getByText('Bienvenida')).toBeVisible();
  });
});
