import { expect, test } from '@playwright/test';
import { E2E_DOCUMENT, loginAsAdmin } from './helpers';

/**
 * «TUS DATOS» EN EL PERFIL (2026-09-24).
 *
 * La persona ve su ficha completa y cambia SOLO su contacto. Aqui se prueba la pantalla: que lo
 * laboral se ve sin forma de tocarlo, que el contacto se edita y se guarda, y que un dato mal escrito
 * se explica en el propio formulario. El camino por la API —que por esa puerta no se cuela el cargo
 * ni el rol— lo cubre `scripts/recorridos/perfil-propio.mjs`.
 *
 * Toca el TELEFONO y no el correo de la cuenta de pruebas, y lo deja como estaba: el correo es
 * identificador de ingreso y cambiarlo aqui podria dejar a otra prueba sin poder entrar.
 */
test.describe('Perfil: tus datos', () => {
  test('ve su ficha, edita su teléfono y un dato mal escrito se explica', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/perfil');

    const tarjeta = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tus datos' }) });
    await expect(tarjeta).toBeVisible({ timeout: 20_000 });

    // Lo laboral se ve, y no hay campo para cambiarlo.
    await expect(tarjeta.getByText('Documento', { exact: true })).toBeVisible();
    await expect(tarjeta.getByText(E2E_DOCUMENT, { exact: true })).toBeVisible();
    await expect(tarjeta.getByText('Cargo', { exact: true })).toBeVisible();

    const telefonoAntes = (await tarjeta.locator('dt:text-is("Teléfono") + dd').textContent())?.trim() ?? '';

    // Un correo mal escrito: el error se queda en el formulario, en español.
    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await expect(tarjeta.getByRole('textbox')).toHaveCount(2);
    const correoOriginal = await page.locator('#mi-correo').inputValue();
    await page.locator('#mi-correo').fill('no-es-un-correo');
    // El navegador validaria el type=email antes de enviar; se quita para ver la respuesta del servidor.
    await page.locator('#mi-correo').evaluate((el) => el.setAttribute('type', 'text'));
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();
    await expect(tarjeta.getByRole('alert')).toHaveText('Escribe un correo válido');

    // Corrige, cambia el telefono y guarda.
    await page.locator('#mi-correo').fill(correoOriginal);
    await page.locator('#mi-telefono').fill('300 555 0101');
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();
    await expect(tarjeta.locator('dt:text-is("Teléfono") + dd')).toHaveText('300 555 0101', { timeout: 20_000 });

    // Y sobrevive a recargar: se guardo de verdad, no solo en la pantalla.
    await page.reload();
    await expect(tarjeta.locator('dt:text-is("Teléfono") + dd')).toHaveText('300 555 0101', { timeout: 20_000 });

    // Se deja como estaba.
    await tarjeta.getByRole('button', { name: 'Editar' }).click();
    await page.locator('#mi-telefono').fill(telefonoAntes === 'Sin teléfono' ? '' : telefonoAntes);
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();
    await expect(tarjeta.locator('dt:text-is("Teléfono") + dd')).toHaveText(telefonoAntes || 'Sin teléfono', {
      timeout: 20_000,
    });
  });
});
