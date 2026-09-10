import { expect, test } from '@playwright/test';
import { TENANT_SLUG, loginAsAdmin, unique } from './helpers';

/**
 * ALCANCE DEL ANALISTA (Decision #54).
 *
 * Lo que se comprueba no es que la tabla `analyst_scopes` guarde: eso ya pasaba, y era justamente
 * el fallo —se guardaba y no la leia ninguna consulta, asi que el analista de SST veia las 52
 * capacitaciones de toda la empresa—. Aqui se entra CON LOS OJOS DEL ANALISTA y se mira que lo
 * ajeno no este.
 *
 * Por eso la prueba crea dos capacitaciones en procesos distintos: una sola no demostraria nada,
 * porque una lista corta puede estar filtrada o simplemente vacia.
 */

const SUYO = 'Seguridad y Salud en el Trabajo';
const AJENO = 'Plan Estrategico de Seguridad Vial';

/** Alta rapida de una capacitacion en un proceso concreto. No hace falta publicarla para verla. */
async function createActivity(page: import('@playwright/test').Page, code: string, name: string, process: string) {
  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(code);
  await page.locator('#a-name').fill(name);
  await page.locator('#a-type').selectOption({ label: 'Induccion general' });
  await page.locator('#a-process').selectOption({ label: process });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });
}

test.describe('Alcance del analista', () => {
  test('DoD: el analista con alcance en un proceso no ve las capacitaciones de otro', async ({ page, browser }) => {
    // Recorre el alta de dos capacitaciones, un usuario, su alcance y un primer ingreso completo:
    // es larga a proposito, porque el limite solo se demuestra entrando con los ojos del analista.
    test.setTimeout(180_000);
    const suffix = unique();
    const suyo = `Alcance SUYO ${suffix}`;
    const ajeno = `Alcance AJENO ${suffix}`;
    const document = `66${suffix}`;

    await loginAsAdmin(page);
    await createActivity(page, `ALC_S_${suffix}`, suyo, SUYO);
    await createActivity(page, `ALC_A_${suffix}`, ajeno, AJENO);

    // --- El administrador, que no tiene alcance, sigue viendo las dos.
    await page.goto('/contenido-formativo');
    await page.getByPlaceholder('Buscar por nombre o código').fill(`Alcance`);
    await expect(page.getByText(suyo)).toBeVisible();
    await expect(page.getByText(ajeno)).toBeVisible();

    // --- Alta del analista. La contrasena se muestra UNA vez: hay que leerla aqui.
    await page.goto('/usuarios');
    await page.getByRole('button', { name: 'Nueva persona' }).click();
    await page.locator('#u-doc').fill(document);
    await page.locator('#u-name').fill(`Analista Alcance ${suffix}`);
    await page.locator('#u-email').fill(`analista.${suffix}@prueba.test`);
    await page.locator('#u-job').selectOption({ label: 'Conductor' });
    await page.locator('#u-area').selectOption({ label: 'Logistica' });
    await page.locator('#u-role').selectOption({ label: 'Analista' });

    // GESTIONA: el alcance se da AQUI, al crear, sin tener que ir despues a otro cajon.
    // Solo sale porque el rol elegido concede permisos de gestion; con "Usuario" no aparece.
    await expect(page.getByText('Toda la empresa', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: /Solo estas areas y procesos/ }).check();

    // Al acotar, la pantalla SUGIERE su area marcandola. Este analista gestiona un proceso
    // suelto y nada de su area, asi que la sugerencia se quita: es una propuesta, no una
    // decision, y la prueba comprueba justo que se puede deshacer.
    await page.locator('#u-scope-areas').click();
    await page.getByRole('listbox').getByRole('option', { name: /^Logistica/ }).click();
    // Un clic NEUTRO cierra el desplegable. Tiene que ser ARRIBA del control: la lista se abre
    // hacia abajo y tapa todo lo que hay debajo, incluida la etiqueta del siguiente campo.
    await page.getByText('Areas completas').click();
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await page.locator('#u-scope-processes').click();
    await page.getByRole('listbox').getByRole('option', { name: SUYO, exact: true }).click();
    /*
      SE CIERRA CON UN CLIC NEUTRO, ni volviendo a pulsar el control ni con Escape.

      Con una sola opcion marcada, el chip ocupa el ancho del control y su aspa de quitar cae
      JUSTO en el centro — que es donde Playwright pulsa—. El resultado era que el clic para
      cerrar quitaba la seleccion y dejaba la lista abierta: la prueba fallaba con el desplegable
      abierto y sin nada marcado, que parecia que el clic en la opcion no habia funcionado.

      Y ESCAPE TAMPOCO: lo escucha tambien el cajon, asi que cierra el formulario entero y la
      prueba se quedaba esperando un control que ya no existia. Un clic en un rotulo inerte de
      dentro del cajon es un clic FUERA del desplegable, que es lo que lo cierra sin tocar nada.

      La trampa del aspa existe tambien para una persona y esta anotada como pendiente.
    */
    await page.getByText('Areas completas').click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    // Y la seleccion SIGUE puesta: es lo que la prueba vino a comprobar.
    await expect(page.locator('#u-scope-processes')).toContainText(SUYO);

    await page.getByRole('button', { name: 'Crear persona' }).click();

    const credential = page.getByRole('dialog').filter({ hasText: 'Contraseña generada' });
    await expect(credential).toBeVisible();
    const temporaryPassword = (await credential.locator('p.font-mono').last().innerText()).trim();
    await credential.getByRole('button', { name: 'Entendido' }).click();

    // --- El cajon de permisos ENSENA el alcance que se dio al crear, no una hoja en blanco.
    // Es donde se ajusta despues, cuando hay novedades, y tiene que decir la verdad de hoy.
    // Las acciones secundarias viven detras del boton de tres puntos desde el 2026-09-09: siete
    // iconos por fila no se leian. Se despliegan pulsandolo, igual que lo hace una persona.
    await page.getByRole('button', { name: `Más acciones para Analista Alcance ${suffix}` }).click();
    await page.getByRole('button', { name: `Permisos de Analista Alcance ${suffix}` }).click();
    const drawer = page.getByRole('dialog').filter({ hasText: 'Alcance' });
    await expect(drawer.getByText('Acotado a 1 proceso', { exact: false })).toBeVisible();
    // El cajon de permisos MUESTRA el alcance —cambia el significado de los permisos de abajo—
    // pero ya NO lo edita: un dato, un editor. Se cambia en la ficha, y el cajon lo dice.
    await expect(drawer.getByText(SUYO, { exact: false }).first()).toBeVisible();
    await expect(drawer.getByText('Editar persona', { exact: false })).toBeVisible();
    await drawer.getByRole('button', { name: 'Cancelar' }).click();

    // --- Y ahora se entra COMO EL, que es lo unico que demuestra algo.
    const context = await browser.newContext();
    const analyst = await context.newPage();
    await analyst.goto(`/login?tenant=${TENANT_SLUG}`);
    await analyst.getByLabel('Cedula o correo').fill(document);
    await analyst.getByLabel('Contraseña').fill(temporaryPassword);
    await analyst.getByRole('button', { name: 'Ingresar' }).click();

    // Primer ingreso: la plataforma obliga a cambiar la contrasena antes de nada.
    await analyst.waitForURL('**/cambiar-contrasena', { timeout: 20_000 });
    const nueva = `Alcance2026*${suffix}`;
    await analyst.locator('#currentPassword').fill(temporaryPassword);
    await analyst.locator('#newPassword').fill(nueva);
    await analyst.locator('#confirmPassword').fill(nueva);
    await analyst.getByRole('button', { name: /Cambiar|Guardar/ }).click();
    await analyst.waitForURL((url) => !url.pathname.includes('cambiar-contrasena'), { timeout: 20_000 });

    // Y por la activacion: habeas data (Ley 1581) y acuerdo de firma electronica (Dec. 2364).
    // Un alta nueva SIEMPRE pasa por aqui, asi que forma parte de "entrar como el".
    const activation = analyst.getByRole('button', { name: 'Activar mi cuenta' });
    if (await activation.isVisible().catch(() => false)) {
      for (const box of await analyst.locator('input[type="checkbox"]').all()) await box.check();
      await activation.click();
    }
    await analyst.waitForURL('**/inicio', { timeout: 20_000 });

    await analyst.goto('/contenido-formativo');
    await analyst.getByPlaceholder('Buscar por nombre o código').fill('Alcance');
    await expect(analyst.getByText(suyo)).toBeVisible();
    // LA asercion de la prueba: lo de PESV no esta, ni buscandolo por su nombre.
    await expect(analyst.getByText(ajeno)).toHaveCount(0);

    await context.close();
  });
});
