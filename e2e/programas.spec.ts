import { expect, test } from '@playwright/test';
import { elegirEnCombo, loginAsAdmin, unique } from './helpers';

/**
 * PROGRAMAS (2026-09-14, PENDIENTES 11.3/11.4): varias formaciones agrupadas bajo un solo
 * paraguas, asignadas a una audiencia en un solo botón — que por debajo exige CADA módulo con el
 * motor de requisitos de siempre, sin un brazo nuevo en el motor (ver
 * `ProgramsService.asignarAudiencia`). Este archivo cubre la interfaz entera de punta a punta: se
 * arman dos módulos reales, se publica el programa, se asigna a un cargo, y se comprueba que el
 * aprendiz de pruebas —que tiene ese cargo— lo ve agrupado en "Mi aprendizaje".
 *
 * Lo que de verdad importa no es que la pantalla diga "guardado": es que la asignación crea un
 * REQUISITO POR MÓDULO de verdad, visible desde la ficha de cada formación (la misma pestaña
 * "Quiénes" que ya prueba `quienes-desde-la-ficha.spec.ts`) — asi se prueba que las dos vias de
 * exigir una formación (suelta y desde un programa) terminan en el mismo sitio.
 */

/** Crea una actividad mínima (sin contenido: no hace falta publicarla para ser módulo de un programa). */
async function crearActividadMinima(
  page: import('@playwright/test').Page,
  name: string,
  code: string,
  tipo = 'Pildora',
): Promise<void> {
  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-type').selectOption({ label: tipo });
  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(code);
  await page.locator('#a-name').fill(name);
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });
}

/**
 * Elige un módulo en el desplegable POR SU VALOR, no por la etiqueta.
 *
 * La etiqueta lleva sufijos que dependen del estado de la formación —«(sin publicar)»— y
 * `selectOption({ label })` exige coincidencia EXACTA, así que emparejar por texto se rompe cada vez
 * que la pantalla añade una pista útil. El valor es el id: no cambia nunca.
 */
async function elegirModulo(page: import('@playwright/test').Page, nombre: string): Promise<void> {
  const opcion = page.locator('#m-activity option').filter({ hasText: nombre }).first();
  await expect(opcion).toHaveCount(1, { timeout: 20_000 });
  const valor = await opcion.getAttribute('value');
  await page.locator('#m-activity').selectOption(valor as string);
}

/** Retira el requisito que quedó vivo en la formación, para no envenenar el cargo de otras pruebas. */
async function retirarDesdeLaFicha(page: import('@playwright/test').Page, activityUrl: string): Promise<void> {
  await page.goto(activityUrl);
  await page.getByRole('tab', { name: 'Quiénes', exact: true }).click();
  const retirar = page.getByRole('button', { name: 'Retirar' }).first();
  await expect(retirar).toBeVisible({ timeout: 20_000 });
  await retirar.click();
  await expect(page.getByText('Todavía no hay ninguna regla')).toBeVisible({ timeout: 20_000 });
}

test.describe('Programas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('crear, agregar módulos, publicar, asignar a un cargo y verlo agrupado como aprendiz', async ({ page }) => {
    const suffix = unique();
    // La firma "E2E<digitos>" PEGADA, sin espacio: es lo que reconoce `limpiar-datos-de-prueba.ts`
    // (variable `FIRMA`) para recoger formaciones Y programas de prueba solos. "Modulo A E2E123"
    // no la cumpliria (el espacio rompe el patron) y estas dos actividades y el programa se
    // quedarian en la base para siempre.
    const nombreA = `Modulo A E2E${suffix}`;
    const nombreB = `Modulo B E2E${suffix}`;

    await crearActividadMinima(page, nombreA, `E2E${suffix}A`);
    const urlModuloA = page.url();
    await crearActividadMinima(page, nombreB, `E2E${suffix}B`);
    const urlModuloB = page.url();

    // ─────────────────────────── Crear el programa ───────────────────────────
    await page.goto('/programas');
    await page.getByRole('button', { name: 'Nuevo programa' }).click();
    await page.locator('#p-name').fill(`Programa E2E${suffix}`);
    await page.getByRole('button', { name: 'Crear programa' }).click();
    await page.waitForURL('**/programas/**', { timeout: 20_000 });
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();

    // ─────────────────────────── Agregar los dos módulos ───────────────────────────
    await elegirModulo(page, nombreA);
    await page.getByRole('button', { name: 'Agregar módulo' }).click();
    await expect(page.getByText('Módulo agregado')).toBeVisible({ timeout: 20_000 });

    await elegirModulo(page, nombreB);
    await page.getByRole('button', { name: 'Agregar módulo' }).click();
    await expect(page.getByText('Módulo agregado')).toBeVisible({ timeout: 20_000 });

    await expect(page.getByText(nombreA, { exact: true })).toBeVisible();
    await expect(page.getByText(nombreB, { exact: true })).toBeVisible();

    // Antes de publicar, el panel de asignar dice explícitamente que no se puede todavía: un
    // borrador no es un compromiso con nadie.
    await expect(page.getByText(/Publica el programa primero/)).toBeVisible();

    // ─────────────────────────── Publicar ───────────────────────────
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Programa publicado')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('PUBLICADO', { exact: true })).toBeVisible();

    // ─────────────────────────── Asignar a un cargo ───────────────────────────
    // El mismo cargo del usuario de pruebas que usa `quienes-desde-la-ficha.spec.ts`: asi la
    // obligacion nace de verdad y se puede comprobar del lado del aprendiz.
    await elegirEnCombo(page, 'a-jobs', 'Director de Gestion Humana');
    await expect(page.getByText(/Alcanza a \d+ personas hoy/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Asignar programa' }).click();
    await expect(page.getByText(/Programa exigido a \d+ personas/)).toBeVisible({ timeout: 20_000 });
    // "2 módulos" y no un requisito unico de tipo PATH: la asignacion delega en el motor de
    // requisitos de siempre, una vez por modulo.
    await expect(page.getByText(/2 módulos, \d+ obligacion(es)? nueva/)).toBeVisible({ timeout: 20_000 });

    // ─────────────────────────── La ficha de un módulo, en la propia lista ───────────────────────────
    /*
      El renglón dice lo que se compara entre módulos —orden, nombre, si es obligatorio, a quién
      alcanza RESUMIDO— y nada más; los nombres completos de las audiencias y las acciones sobre ese
      módulo viven en su ficha, que se despliega sin salir de la lista (2026-09-16). Aquí se prueban
      las dos mitades: que el reparto por módulo aparece tras asignar —la lista se recarga sola— y
      que las acciones siguen estando, una capa más adentro.
    */
    const abrirFicha = page.getByRole('button', { name: `Ver la ficha de ${nombreA}` });
    await expect(abrirFicha).toBeVisible({ timeout: 20_000 });
    await abrirFicha.click();
    await expect(page.getByRole('heading', { name: 'A quién se le exige' })).toBeVisible();
    // Y se cierra: solo hay una abierta cada vez, para que la lista no se vuelva un muro.
    await page.getByRole('button', { name: `Cerrar la ficha de ${nombreA}` }).click();
    await expect(page.getByRole('heading', { name: 'A quién se le exige' })).toBeHidden();

    /*
      CADA CLIC, UN SOLO DESTINO. El chevron despliega y nada mas; el NOMBRE es el enlace a la
      formacion; editar y quitar son sus propios botones. Se prueban los tres porque el riesgo de
      este renglon es justo que dos de ellos se solapen — que fue lo que el cliente vio venir.
    */
    await expect(page.getByRole('link', { name: nombreA })).toHaveAttribute('href', /\/contenido-formativo\//);
    await expect(page.getByRole('button', { name: `Editar ${nombreA}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Quitar ${nombreA} del programa` })).toBeVisible();

    // ─────────────────────────── Verlo desde la ficha de CADA modulo ───────────────────────────
    // La prueba de que no es un requisito de tipo PATH inventado: cada formacion lo ve como CUALQUIER
    // otro requisito suyo, en su propia pestaña "Quienes" — la misma que prueba
    // `quienes-desde-la-ficha.spec.ts` para el camino de una formacion suelta.
    await page.goto(urlModuloA);
    await page.getByRole('tab', { name: 'Quiénes', exact: true }).click();
    // El titulo de la regla, no la tabla de obligados: esa lista trae anos de personas de otras
    // corridas que tienen el mismo cargo, y "Director de Gestion Humana" a secas ahi sale docenas
    // de veces.
    await expect(page.getByText('Cargo: Director de Gestion Humana')).toBeVisible({ timeout: 20_000 });

    // ─────────────────────────── Verlo AGRUPADO como aprendiz ───────────────────────────
    await page.goto('/mi-formacion');
    await page.getByRole('tab', { name: /Programas/ }).click();
    // Escopado a SU tarjeta: puede haber otros programas reales de 2 modulos en la misma base
    // (compartida con quien mira pantallas), y "0 de 2 módulos aprobados" a secas les pega igual.
    //
    // La tarjeta es un ENLACE entero a `/programa/[id]`, no un `article`: se pulsa completa, asi
    // que el elemento que la envuelve es el `<a>`. Pedirla como `article` la dejaba sin encontrar
    // aunque estuviera en pantalla — corregido el 2026-09-15.
    const tarjeta = page.locator('a[href^="/programa/"]', { hasText: `Programa E2E${suffix}` });
    await expect(tarjeta).toBeVisible({ timeout: 20_000 });
    await expect(tarjeta.getByText(nombreA, { exact: true })).toBeVisible();
    await expect(tarjeta.getByText(nombreB, { exact: true })).toBeVisible();
    await expect(tarjeta.getByText('0 de 2 módulos aprobados')).toBeVisible();

    // ─────────────────────────── Limpieza: retirar los dos requisitos ───────────────────────────
    // Igual que hace `quienes-desde-la-ficha.spec.ts` con el mismo cargo: un requisito vivo aqui
    // obligaria a cada persona que otra prueba cree despues con "Director de Gestion Humana".
    await retirarDesdeLaFicha(page, urlModuloA);
    await retirarDesdeLaFicha(page, urlModuloB);
  });

  test('un programa de Inducción general avisa de que no hace falta asignarlo', async ({ page }) => {
    /*
      PENDIENTES 11.7. El cliente quiere un programa que agrupe VARIAS formaciones de tipo Inducción
      general como obligatorias al entrar. Cada una de esas YA se exige sola a toda la empresa al
      publicarse (`aplicarExigenciaAutomatica`), así que el botón de "Asignar a una audiencia" no
      hace falta — y sin decirlo queda a adivinar.

      El módulo NO se publica a propósito: publicar una inducción general en la base de desarrollo
      crearía su regla de toda la empresa y con ella miles de obligaciones. Sin publicar, el aviso
      igual aparece —lo decide el TIPO, no el estado— y dice que todavía no tiene su regla activa,
      que es la verdad.
    */
    const suffix = unique();
    const nombre = `Induccion modulo E2E${suffix}`;

    await crearActividadMinima(page, nombre, `E2E${suffix}I`, 'Induccion general');

    await page.goto('/programas');
    await page.getByRole('button', { name: 'Nuevo programa' }).click();
    await page.locator('#p-name').fill(`Programa induccion E2E${suffix}`);
    await page.getByRole('button', { name: 'Crear programa' }).click();
    await page.waitForURL('**/programas/**', { timeout: 20_000 });

    await elegirModulo(page, nombre);
    await page.getByRole('button', { name: 'Agregar módulo' }).click();
    await expect(page.getByText('Módulo agregado')).toBeVisible({ timeout: 20_000 });

    // En borrador el panel ni siquiera se muestra, así que el aviso tampoco: se publica primero.
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Programa publicado')).toBeVisible({ timeout: 20_000 });

    // Lo accionable se ve de una: una linea, sin desplegar nada.
    await expect(page.getByText(/Este programa no necesita asignarse/)).toBeVisible({ timeout: 20_000 });

    // El porque vive detras de "Por qué": son seis lineas de contexto que se leen una vez y
    // estorban las demas, asi que no ocupan el panel de forma permanente.
    await page.getByRole('button', { name: 'Por qué' }).click();
    // El matiz que evita la lectura equivocada de "se asigna sola a toda la empresa": alcanza a
    // quien INGRESE, no a la plantilla que ya está dentro.
    await expect(page.getByText(/alcanza a quien ingrese, no a quien ya está en la empresa/)).toBeVisible();
    // Y todavía sin regla activa, porque el módulo no se publicó.
    await expect(page.getByText(/0 de 1 con su regla ya activa/)).toBeVisible();
  });

  test('un programa sin módulos no se puede publicar', async ({ page }) => {
    const suffix = unique();

    await page.goto('/programas');
    await page.getByRole('button', { name: 'Nuevo programa' }).click();
    await page.locator('#p-name').fill(`Programa vacio E2E${suffix}`);
    await page.getByRole('button', { name: 'Crear programa' }).click();
    await page.waitForURL('**/programas/**', { timeout: 20_000 });

    await expect(page.getByText('Sin módulos todavía')).toBeVisible();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('No se pudo publicar')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
  });
});
