import { expect, test } from '@playwright/test';
import { E2E_DOCUMENT, loginAsAdmin, unique } from './helpers';

/**
 * BUSCAR PERSONAS POR CEDULA, EN TODOS LOS SELECTORES (2026-09-30).
 *
 * Con 1.001 personas cargadas el cliente pidio poder encontrar a cualquiera por su documento —el
 * nombre se repite, la cedula no— y elegir a varias de golpe. Aqui se recorren las tres piezas que
 * eligen personas y las situaciones que pueden salir mal:
 *
 *   - el selector MULTIPLE (personas concretas de una formacion): buscar, pegar una lista con
 *     cedulas que no existen, marcar las encontradas, y que una busqueda por NOMBRE de dos palabras
 *     no se confunda con una lista;
 *   - el selector de UNA persona (responsable de un area): encontrar por cedula;
 *   - el buscador general de la barra: encontrar por cedula a alguien que no esta entre las 50
 *     primeras, y aterrizar en SU ficha.
 */

const ADMIN_DOC = '999999999';

test.describe('Buscar personas por cédula', () => {
  test('selector múltiple: busca por cédula, pega una lista y marca las encontradas', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();

    // Una capacitacion del plan: su pestaña Quienes tiene «O a personas concretas».
    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    await page.locator('#a-type').selectOption({ label: 'Capacitacion del plan' });
    await page.locator('#a-code-open').click();
    await page.locator('#a-code').fill(`CED_${suffix}`);
    await page.locator('#a-name').fill(`Buscar por cedula E2E${suffix}`);
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });
    await page.getByRole('tab', { name: 'Quiénes', exact: true }).click();

    await page.locator('#q-people').click();
    const buscador = page.getByLabel('Buscar en la lista');
    await expect(buscador).toBeFocused();

    // 1. Una cedula suelta encuentra a su persona, y la fila la ensena.
    await buscador.fill(E2E_DOCUMENT);
    const opciones = page.getByRole('option');
    await expect(opciones).toHaveCount(1);
    await expect(opciones.first()).toContainText('Usuario Pruebas Automatizadas');
    await expect(opciones.first()).toContainText(E2E_DOCUMENT);

    // 2. Un nombre de dos palabras es una BUSQUEDA, no una lista de dos.
    await buscador.fill('Usuario Pruebas');
    await expect(page.getByText(/encontradas/)).toHaveCount(0);
    await expect(opciones.filter({ hasText: 'Usuario Pruebas Automatizadas' })).toHaveCount(1);

    // 3. Una lista pegada con una cedula que no existe: dice cuantas y cuales faltan.
    await buscador.fill(`${E2E_DOCUMENT}, ${ADMIN_DOC}, 123456789012`);
    await expect(page.getByText('2 de 3 encontradas')).toBeVisible();
    await expect(page.getByText('no están: 123456789012')).toBeVisible();

    // 4. Una columna copiada de Excel (saltos de linea) se lee igual, no como un numero pegado.
    await buscador.fill('');
    await buscador.evaluate((el, texto) => {
      const datos = new DataTransfer();
      datos.setData('text', texto);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }));
    }, `${E2E_DOCUMENT}\r\n${ADMIN_DOC}\r\n`);
    await expect(page.getByText('2 de 2 encontradas')).toBeVisible();

    // 5. Marcar las encontradas deja las dos elegidas.
    await page.getByRole('button', { name: 'Marcar las 2 encontradas' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Quitar Usuario Pruebas Automatizadas' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Quitar NEO PULSE' })).toHaveCount(1);

    // 6. Nada coincide: se dice, en vez de una lista vacia.
    await page.locator('#q-people').click();
    await page.getByLabel('Buscar en la lista').fill('zzzz-nadie-se-llama-asi');
    await expect(page.getByText('Nada coincide con «zzzz-nadie-se-llama-asi»')).toBeVisible();
  });

  test('selector de una persona: encuentra al responsable por su cédula', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/configuracion');
    await page.getByRole('button', { name: 'Nueva area' }).click();
    await page.locator('#cat-responsibleUserId').click();
    await page.getByPlaceholder('Buscar por nombre, cédula, cargo o área').fill(ADMIN_DOC);
    // Dentro de la lista del selector: la pagina tiene ademas desplegables de filtro con sus opciones.
    const opciones = page.getByRole('listbox').getByRole('option');
    await expect(opciones).toHaveCount(1);
    await expect(opciones.first()).toContainText('NEO PULSE');
    await expect(opciones.first()).toContainText(ADMIN_DOC);
  });

  test('buscador general: encuentra por cédula y lleva a la ficha de la persona', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/inicio');
    await page.getByRole('button', { name: /Buscar/ }).first().click();
    const buscar = page.getByPlaceholder(/nombre o cédula/);
    // Otra persona y no la cuenta de pruebas: esa es la que tiene la sesion, y su nombre sale tambien
    // en el menu de usuario de la barra.
    await buscar.fill(ADMIN_DOC);
    const persona = page.getByRole('dialog', { name: 'Buscar' }).getByRole('button', { name: /NEO PULSE/ });
    await expect(persona).toBeVisible({ timeout: 10_000 });
    await persona.click();
    await page.waitForURL(/\/usuarios\/[0-9a-f-]{36}/, { timeout: 20_000 });
  });
});
