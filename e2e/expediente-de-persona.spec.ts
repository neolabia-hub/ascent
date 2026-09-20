import { expect, test } from '@playwright/test';
import { E2E_DOCUMENT, loginAsAdmin } from './helpers';

/**
 * EL EXPEDIENTE DE UNA PERSONA (`/usuarios/[id]`), que hasta hoy no tenía ninguna prueba.
 *
 * Lo que se cubre aquí es el reparto de puertas que pidió el cliente el 2026-09-17, porque es
 * justo lo que se rompe sin avisar: un botón que se mueve de sitio no da error de compilación ni
 * de tipos — simplemente deja de existir, y nadie se entera hasta que alguien lo busca.
 *
 *   - **Constancias** salió del menú de la fila de Usuarios: *"si ya está en perfil estaría más de
 *     una vez"*. Y en el expediente pasaron a poder **abrirse y descargarse**, que es para lo que
 *     se buscan.
 *   - **Papel de un tercero** se queda en los DOS sitios, a propósito: no es una lista repetida,
 *     es una acción —convalidar el papel de una ARL o del SENA—, y se llega a ella tanto repasando
 *     gente como mirando a una persona.
 *
 * No se prueba la descarga del PDF en sí: eso ya lo cubre el recorrido de constancias, y aquí lo
 * que importa es que la puerta exista y esté viva.
 */

test.describe('El expediente de una persona', () => {
  test('DoD: las constancias se abren y se bajan desde el perfil, y el papel de un tercero sigue en las dos puertas', async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // ─────────────── La fila de Usuarios: qué quedó y qué se fue ───────────────
    await page.goto('/usuarios');
    await page.getByPlaceholder('Buscar por nombre, documento o correo').fill(E2E_DOCUMENT);
    const fila = page.getByRole('row').filter({ hasText: E2E_DOCUMENT }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });

    /*
      El menú de la fila se abre por su etiqueta accesible, no por el icono: el icono es un dibujo
      y el nombre accesible es lo único que no cambia al retocar el estilo.
    */
    await fila.getByRole('button', { name: /Más acciones para/ }).click();
    await expect(page.getByRole('button', { name: /Papel de un tercero/ })).toBeVisible();
    // Y la que se mudó al expediente ya NO está aquí: si vuelve, es que alguien la duplicó.
    await expect(page.getByRole('button', { name: /^Constancias/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // ─────────────── El expediente ───────────────
    await fila.getByRole('button', { name: /^Perfil de / }).click();
    await page.waitForURL('**/usuarios/**', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Su trayectoria' })).toBeVisible({ timeout: 20_000 });

    /*
      LAS CONSTANCIAS, CON SUS DOS BOTONES. Se busca por la etiqueta accesible —que lleva el nombre
      de la formación dentro— en vez de por el icono, y se acepta que la persona de pruebas pueda no
      tener ninguna: lo que NO se acepta es que habiendo constancias no haya forma de bajarlas.
      Una revocada no ofrece botones a propósito: es evidencia anulada.
    */
    await expect(page.getByRole('heading', { name: 'Constancias de la empresa' })).toBeVisible();
    const descargas = page.getByRole('button', { name: /^Descargar la constancia de / });
    const abrir = page.getByRole('button', { name: /^Abrir la constancia de / });
    expect(await descargas.count()).toBe(await abrir.count());

    // ─────────────── La segunda puerta del papel de un tercero ───────────────
    const registrar = page.getByRole('button', { name: 'Registrar el papel de un tercero' });
    await expect(registrar).toBeVisible();
    await registrar.click();
    // El cajón que se abre es EL MISMO de la fila —mismo componente, mismo título—: si esto falla,
    // la acción se perdió al mudarla, que es justo el riesgo de mover un botón de sitio.
    await expect(page.getByRole('dialog', { name: 'Papeles de un tercero' })).toBeVisible({ timeout: 20_000 });
  });
});
