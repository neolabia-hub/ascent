import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_DOCUMENT, E2E_PASSWORD, loginAsAdmin, TENANT_SLUG, unique } from './helpers';

/**
 * A QUIEN SE LE EXIGE LA INDUCCION (2026-09-30), las dos piezas que pidio el cliente:
 *
 *   1. En Configuracion > Tipos de formacion se elige QUIEN decide (sola al publicar, la matriz de
 *      cargos o quien la crea) y, si es sola, A QUIEN alcanza (solo quien ingresa, o la plantilla).
 *   2. En una induccion de ingreso publicada se le puede exigir ADEMAS a un grupo de los que ya
 *      estan, con una regla aparte que no toca la automatica. Y al ajustar esa regla de grupo no se
 *      puede dejar sin nada marcado: vacio seria «toda la empresa» y pisaria la automatica.
 *
 * Todo con un tipo PROPIO de la prueba, para no tocar los de la empresa.
 */

const API = 'http://localhost:3002/v1';

async function api(request: APIRequestContext) {
  const login = await request.post(`${API}/auth/login`, {
    data: { tenantSlug: TENANT_SLUG, identifier: E2E_DOCUMENT, password: E2E_PASSWORD },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  return {
    get: async (ruta: string) => (await request.get(`${API}${ruta}`, { headers })).json(),
    post: async (ruta: string, data: unknown) => (await request.post(`${API}${ruta}`, { headers, data })).json(),
    patch: async (ruta: string, data: unknown) => (await request.patch(`${API}${ruta}`, { headers, data })).json(),
    put: async (ruta: string, data: unknown) => (await request.put(`${API}${ruta}`, { headers, data })).json(),
  };
}

test.describe('Exigencia de la inducción', () => {
  test('Configuración: quién decide y a quién alcanza se eligen en el tipo', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const nombre = `Tipo exigencia E2E${suffix}`;

    await page.goto('/configuracion/tipos-de-formacion');
    await page.getByRole('button', { name: 'Nuevo tipo' }).click();
    await page.locator('#t-code').fill(`E2E_T_${suffix}`);
    await page.locator('#t-name').fill(nombre);
    await page.getByRole('button', { name: 'Crear' }).click();

    const tarjeta = page.locator('section').filter({ hasText: nombre });
    await expect(tarjeta).toBeVisible({ timeout: 20_000 });
    // Un tipo nuevo nace en lo mas conservador: lo decide quien crea la formacion.
    await expect(tarjeta).toContainText('La decide quien la crea');

    await tarjeta.getByRole('button', { name: 'Configurar' }).click();
    const quien = page.getByLabel('Quién decide');
    await expect(quien).toHaveValue('MANUAL');
    // Sin «sola al publicar» no hay nada que preguntar sobre a quien alcanza.
    await expect(page.getByLabel('Al publicar, a quién alcanza')).toHaveCount(0);

    await quien.selectOption('ON_HIRE');
    const alcance = page.getByLabel('Al publicar, a quién alcanza');
    await expect(alcance).toBeVisible({ timeout: 10_000 });
    await expect(alcance).toHaveValue('PLANTILLA');
    await expect(page.getByText('Se exige sola a toda la plantilla al publicar').first()).toBeVisible();

    await alcance.selectOption('INGRESO');
    await expect(page.getByText('Se exige sola a quien ingrese, antes de su primer día').first()).toBeVisible({
      timeout: 10_000,
    });

    // Y se guardo de verdad: sobrevive a recargar.
    await page.getByRole('button', { name: 'Listo' }).click();
    await page.reload();
    await expect(page.locator('section').filter({ hasText: nombre })).toContainText(
      'Se exige sola a quien ingrese, antes de su primer día',
      { timeout: 20_000 },
    );

    // Limpieza: sin formaciones, se puede borrar.
    await page.getByRole('button', { name: `Eliminar ${nombre}` }).click();
    await expect(page.locator('section').filter({ hasText: nombre })).toHaveCount(0, { timeout: 20_000 });
  });

  test('Quiénes: exigirla además a un grupo, sin tocar la regla automática', async ({ page, request }) => {
    const suffix = unique();
    const a = await api(request);

    // Un tipo propio «sola, a quien ingrese», sin examen ni encuesta para poder publicar rapido.
    const tipo = await a.post('/catalogs/activity-types', {
      code: `E2E_G_${suffix}`,
      name: `Ingreso grupo E2E${suffix}`,
      config: {
        requiresAssessment: false,
        requiresSurvey: false,
        issuesCertificate: false,
        defaultOfferingKind: 'PERMANENT',
        defaultAssignmentMode: 'ON_HIRE',
        requiresBeforeHire: true,
      },
    });
    // El grupo: un area propia con una persona que YA estaba antes de publicar.
    const area = await a.post('/catalogs/areas', { code: `E2E_GA_${suffix}`, name: `Area grupo E2E${suffix}` });
    const cargos = (await a.get('/catalogs/job-titles')) as Array<{ id: string; active: boolean }>;
    await a.post('/users', {
      documentNumber: `66${suffix}`.slice(0, 20),
      fullName: `Antigua del grupo E2E${suffix}`,
      jobTitleId: cargos.find((c) => c.active)!.id,
      areaId: area.id,
    });

    const procesos = (await a.get('/catalogs/processes')) as Array<{ id: string; active: boolean }>;
    const ficha = await a.post('/activities', {
      code: `E2E_GF_${suffix}`,
      name: `Induccion grupo E2E${suffix}`,
      activityTypeId: tipo.id,
      processId: procesos.find((p) => p.active)!.id,
      modality: 'VIRTUAL',
    });
    const detalle = await a.get(`/activities/${ficha.id}`);
    const versionId = (detalle.versions as Array<{ id: string; status: string }>).find((v) => v.status === 'DRAFT')!.id;
    const leccion = await a.post('/lessons', { title: `Leccion grupo ${suffix}`, estimatedMinutes: 3 });
    await a.put(`/lessons/${leccion.id}/cards`, {
      cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Hola', body: 'Contenido de prueba.' } }],
    });
    await a.post(`/activities/versions/${versionId}/contents`, {
      type: 'LESSON',
      title: 'Leccion',
      isRequired: true,
      config: { minSeconds: 1 },
      lessonId: leccion.id,
    });
    await a.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });

    await loginAsAdmin(page);
    await page.goto(`/contenido-formativo/${ficha.id}?tab=quienes`);
    await expect(page.getByText('Ya se le exige a toda la empresa')).toBeVisible({ timeout: 20_000 });

    // 1. Plegado: un boton, no un formulario abierto.
    await expect(page.locator('#q-areas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Exigirla además a un grupo' }).click();

    // 2. Sin nada marcado no deja exigir: vacio seria toda la empresa.
    const exigir = page.getByRole('button', { name: 'Exigirla a este grupo' });
    await expect(exigir).toBeDisabled();
    await expect(page.locator('#q-trigger')).toHaveValue('ON_JOIN');

    await page.locator('#q-areas').click();
    await page.getByLabel('Buscar en la lista').fill(`Area grupo E2E${suffix}`);
    await page.getByRole('option', { name: new RegExp(`Area grupo E2E${suffix}`) }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Alcanza a 1 personas hoy.')).toBeVisible({ timeout: 10_000 });
    await exigir.click();
    await expect(page.getByText(/Nacieron 1 obligaciones/)).toBeVisible({ timeout: 20_000 });

    // 3. Dos reglas: la automatica sigue ahi, intacta.
    await expect(page.getByText('2 reglas')).toBeVisible({ timeout: 20_000 });
    const reglas = (await a.get(`/activities/${ficha.id}/requirements`)) as Array<{
      reachesEveryone: boolean;
      soloNuevos: boolean;
      trigger: string;
    }>;
    const automatica = reglas.find((r) => r.reachesEveryone);
    expect(automatica?.soloNuevos).toBe(true);
    expect(automatica?.trigger).toBe('ON_HIRE');

    // 4. Ajustar la del grupo ensena sus campos, y dejarla vacia no se puede guardar.
    const filaGrupo = page.locator('div').filter({ hasText: new RegExp(`Area grupo E2E${suffix}`) }).filter({
      has: page.getByRole('button', { name: 'Ajustar' }),
    });
    await filaGrupo.last().getByRole('button', { name: 'Ajustar' }).click();
    await expect(page.locator('#q-areas')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(`Quitar Area grupo E2E${suffix}`) }).click();
    await expect(page.getByRole('button', { name: 'Guardar el ajuste' })).toBeDisabled();

    // Limpieza: el tipo se desactiva (tiene una formacion, no se puede borrar).
    await a.patch(`/catalogs/activity-types/${tipo.id}`, { active: false });
  });
});
