import { expect, test } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 1 (Definition of Done): un administrador entra, configura un catalogo,
 * crea una persona con contrasena generada y carga usuarios masivamente desde archivo.
 *
 * Este archivo CRECE sprint a sprint hasta cubrir el flujo maestro completo del producto
 * (ver CLAUDE.md 10.5 Estrategia de calidad).
 */

test.describe('Sprint 1 — administracion del tenant', () => {
  test('acceso: sesion, marca del tenant y navegacion del panel', async ({ page }) => {
    await loginAsAdmin(page);

    // El panel carga con el nombre del tenant y el saludo, que depende de la hora.
    //
    // SE MIRA LA BARRA DE ARRIBA Y NO EL TITULO (2026-09-09): Inicio dejo de saludar —lo decia dos
    // veces en la misma pantalla— y su titulo dice ahora el estado del dia, que cambia con los
    // datos. Lo estable es el saludo de la barra, que sale en todas las pantallas.
    //
    // Y LA TILDE VA EN LA PRUEBA: la pantalla dice "Buenos días" desde la pasada de tildes y esta
    // espera se quedo pidiendo "Buenos dias". No la cazo ninguna herramienta porque las dos leen
    // CADENAS y esto es una EXPRESION REGULAR. Es el hueco que tenian, y ya esta tapado.
    await expect(page.locator('header')).toContainText(/Buenos días|Buenas tardes|Buenas noches/);
    await expect(page.locator('aside')).toContainText('TRANSPRENSA');

    // Navegacion a las secciones del sprint.
    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();

    await page.getByRole('link', { name: 'Configuración' }).click();
    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  });

  test('catalogos: crear una regional, verla en la tabla y desactivarla', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/configuracion');

    await page.getByRole('button', { name: 'Regionales' }).click();
    await expect(page.getByRole('heading', { name: 'Regionales' })).toBeVisible();

    const suffix = unique();
    const code = `E2E_${suffix}`;
    const name = `Regional Prueba ${suffix}`;

    await page.getByRole('button', { name: 'Nueva regional' }).click();
    await page.getByLabel('Código').fill(code);
    await page.getByLabel('Nombre').fill(name);
    await page.getByRole('button', { name: 'Crear' }).click();

    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('ACTIVO');

    // Baja logica: se desactiva, no se borra (los registros historicos la referencian).
    await row.getByRole('button', { name: 'Desactivar' }).click();
    await expect(row).toContainText('INACTIVO');
  });

  test('personas: crear una y recibir la contrasena generada una sola vez', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/usuarios');

    const suffix = unique();
    const document = `77${suffix}`;

    // Se localiza por id (estable): los campos obligatorios llevan un asterisco en el label,
    // asi que el texto accesible no es exactamente el rotulo.
    await page.getByRole('button', { name: 'Nueva persona' }).click();
    await page.locator('#u-doc').fill(document);
    await page.locator('#u-name').fill(`Persona Prueba ${suffix}`);
    await page.locator('#u-email').fill(`persona.${suffix}@prueba.test`);
    await page.locator('#u-job').selectOption({ label: 'Conductor' });
    await page.locator('#u-area').selectOption({ label: 'Logistica' });
    await page.getByRole('button', { name: 'Crear persona' }).click();

    // La credencial se muestra UNA vez, con el patron cedula + caracteres.
    const credential = page.getByRole('dialog').filter({ hasText: 'Contraseña generada' });
    await expect(credential).toBeVisible();
    await expect(credential).toContainText(document);
    await expect(credential.locator('p.font-mono').last()).toContainText(new RegExp(`^${document}.{5,}$`));
    await credential.getByRole('button', { name: 'Entendido' }).click();

    // Y la persona aparece en el listado al buscarla.
    await page.getByPlaceholder('Buscar por nombre, documento o correo').fill(document);
    await expect(page.getByRole('cell', { name: document })).toBeVisible();
  });

  test('carga masiva: las filas validas entran aunque otra falle', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/usuarios');

    const suffix = unique();
    const csv = [
      'documento;nombre_completo;correo;telefono;cargo;area;regional;fecha_ingreso;vinculacion',
      `55${suffix};Importada Uno ${suffix};uno.${suffix}@prueba.test;3001112233;CONDUCTOR;LOGISTICA;;2026-09-01;DIRECTO`,
      `56${suffix};Importada Dos ${suffix};dos.${suffix}@prueba.test;;AUX_BODEGA;LOGISTICA;;;TEMPORAL`,
      `57${suffix};Fila Con Error;correo-que-no-sirve;;CARGO_INEXISTENTE;LOGISTICA;;;DIRECTO`,
    ].join('\n');

    await page.getByRole('button', { name: 'Importar' }).click();
    await page.getByLabel('Archivo').setInputFiles({
      name: 'usuarios-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });

    const drawer = page.getByRole('dialog').filter({ hasText: 'Importar personas' });
    await expect(drawer.getByText('2 CREADAS')).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByText('1 CON ERROR')).toBeVisible();
    // El reporte dice QUE fila fallo y por que (requisito de usabilidad del sprint).
    await expect(drawer).toContainText('correo');
  });

  test('preferencias: la nota minima del tenant se guarda y persiste', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/configuracion/preferencias');

    /*
      POR EL ID DEL CAMPO, no por su rotulo.

      Se cayo dos veces el 2026-09-08 al repasar Preferencias: primero porque el rotulo se acentuo
      —es texto que se VE— y despues porque al ponerle su ⓘ, el boton de ayuda se llama «Ver la
      explicacion de <rotulo>» y buscar por rotulo encontraba dos elementos. El id no depende de
      como se llame el campo mañana.
    */
    const field = page.locator('#pref-score');
    await expect(field).toHaveValue('90'); // valor exigido por Transprensa (seed)

    await field.fill('85');
    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.getByText('Preferencias guardadas')).toBeVisible();

    await page.reload();
    await expect(page.locator('#pref-score')).toHaveValue('85');

    // Se restaura el valor real del cliente para no dejar la base alterada.
    await page.locator('#pref-score').fill('90');
    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.getByText('Preferencias guardadas')).toBeVisible();
  });
});
