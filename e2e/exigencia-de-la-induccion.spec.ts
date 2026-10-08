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

// La API de las pruebas: la propia (3002) o la de dev si se corre contra ella (E2E_API_URL).
const API = process.env.E2E_API_URL ?? 'http://localhost:3002/v1';

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
    del: async (ruta: string) => request.delete(`${API}${ruta}`, { headers }),
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
    await expect(page.getByText('Se exige sola a quien ingrese, con 8 días desde su ingreso').first()).toBeVisible({
      timeout: 10_000,
    });

    // Y se guardo de verdad: sobrevive a recargar.
    await page.getByRole('button', { name: 'Listo' }).click();
    await page.reload();
    await expect(page.locator('section').filter({ hasText: nombre })).toContainText(
      'Se exige sola a quien ingrese, con 8 días desde su ingreso',
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

  /*
    LA REINDUCCION, IGUAL QUE LA INDUCCION GENERAL (2026-10-06, pedido del cliente): publicada,
    ofrece «Exigirla además a un grupo» y «O a personas concretas». Antes no salian, con el
    argumento de que ya alcanza a toda la empresa.

    Se prueba cambiando de reglas, que es donde se rompe: retirar la automatica, exigirla a un
    grupo, darsela a una persona suelta, ajustar la del grupo, eximir, y volver a encender la de
    toda la empresa sin que a nadie le nazca la obligacion dos veces.
  */
  test('Reinducción: grupo y personas concretas, cambiando de reglas, ajustar y eximir', async ({ page, request }) => {
    test.setTimeout(240_000);
    const suffix = unique();
    const a = await api(request);

    // Un tipo propio «sola, a toda la plantilla» y de campaña anual: lo que es una reinduccion.
    const tipo = await a.post('/catalogs/activity-types', {
      code: `E2E_R_${suffix}`,
      name: `Reinduccion grupo E2E${suffix}`,
      config: {
        requiresAssessment: false,
        requiresSurvey: false,
        issuesCertificate: false,
        defaultOfferingKind: 'PERMANENT',
        defaultAssignmentMode: 'ON_HIRE',
        requiresBeforeHire: false,
        defaultAnnualDate: '03-31',
      },
    });
    const area = await a.post('/catalogs/areas', { code: `E2E_RA_${suffix}`, name: `Area reinduccion E2E${suffix}` });
    const cargos = (await a.get('/catalogs/job-titles')) as Array<{ id: string; active: boolean }>;
    const cargoId = cargos.find((c) => c.active)!.id;
    const { user: delGrupo } = await a.post('/users', {
      documentNumber: `67${suffix}`.slice(0, 20),
      fullName: `Grupal de reinduccion E2E${suffix}`,
      jobTitleId: cargoId,
      areaId: area.id,
    });
    // Fuera del grupo: en otra area cualquiera (el area es obligatoria al crear a la persona).
    const areas = (await a.get('/catalogs/areas')) as Array<{ id: string; active: boolean }>;
    const { user: suelta } = await a.post('/users', {
      documentNumber: `68${suffix}`.slice(0, 20),
      fullName: `Suelta de reinduccion E2E${suffix}`,
      jobTitleId: cargoId,
      areaId: areas.find((fila) => fila.active && fila.id !== area.id)!.id,
    });

    const procesos = (await a.get('/catalogs/processes')) as Array<{ id: string; active: boolean }>;
    const ficha = await a.post('/activities', {
      code: `E2E_RF_${suffix}`,
      name: `Reinduccion grupo E2E${suffix}`,
      activityTypeId: tipo.id,
      processId: procesos.find((p) => p.active)!.id,
      modality: 'VIRTUAL',
    });
    const detalle = await a.get(`/activities/${ficha.id}`);
    const versionId = (detalle.versions as Array<{ id: string; status: string }>).find((v) => v.status === 'DRAFT')!.id;
    const leccion = await a.post('/lessons', { title: `Leccion reinduccion ${suffix}`, estimatedMinutes: 3 });
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

    type Regla = { id: string; reachesEveryone: boolean; dueDaysAfterTrigger: number; fixedDate: string | null };
    const reglas = async () => (await a.get(`/activities/${ficha.id}/requirements`)) as Regla[];
    /** Las obligaciones VIVAS de una persona en esta formacion: nunca debe haber mas de una. */
    const vivasDe = async (userId: string) => {
      const pagina = (await a.get(`/assignments?targetId=${ficha.id}&userId=${userId}`)) as {
        items: Array<{ status: string }>;
      };
      return pagina.items.filter((fila) => ['PENDING', 'OVERDUE', 'IN_PROGRESS'].includes(fila.status)).length;
    };

    try {
      await a.post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });

      await loginAsAdmin(page);
      await page.goto(`/contenido-formativo/${ficha.id}?tab=quienes`);
      await expect(page.getByText('Ya se le exige a toda la empresa')).toBeVisible({ timeout: 30_000 });

      // 1. Las dos puertas estan, igual que en la induccion general.
      const botonGrupo = page.getByRole('button', { name: 'Exigirla además a un grupo' });
      await expect(botonGrupo).toBeVisible();
      await expect(page.getByRole('heading', { name: 'O a personas concretas' })).toBeVisible();
      expect(await vivasDe(delGrupo.id)).toBe(1);

      // 2. Se retira la automatica: lo pendiente de todos queda retirado.
      await page.getByRole('button', { name: 'Retirar' }).click();
      await expect(page.getByText('La regla automática está retirada')).toBeVisible({ timeout: 60_000 });
      expect(await vivasDe(delGrupo.id)).toBe(0);

      // 3. A un grupo: nace con la campaña del tipo y «desde ahora», y alcanza solo al grupo.
      await botonGrupo.click();
      await expect(page.getByText('Además, a un grupo', { exact: true })).toBeVisible();
      const exigir = page.getByRole('button', { name: 'Exigirla a este grupo' });
      await expect(exigir).toBeDisabled();
      // En una campaña la fecha la pone el calendario: no se pregunta «se le exige» ni «vence a los».
      await expect(page.locator('#q-repite-modo')).toHaveValue('ANUAL');
      await expect(page.locator('#q-trigger')).toHaveCount(0);
      await expect(page.locator('#q-dias')).toHaveCount(0);
      await page.locator('#q-areas').click();
      await page.getByLabel('Buscar en la lista').fill(`Area reinduccion E2E${suffix}`);
      await page.getByRole('option', { name: new RegExp(`Area reinduccion E2E${suffix}`) }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByText('Alcanza a 1 personas hoy.')).toBeVisible({ timeout: 10_000 });
      await exigir.click();
      await expect(page.getByText('1 regla', { exact: true })).toBeVisible({ timeout: 30_000 });
      expect(await vivasDe(delGrupo.id)).toBe(1);
      expect(await vivasDe(suelta.id)).toBe(0);

      // 4. A una persona concreta, por su cedula.
      await page.locator('#q-people').click();
      await page.getByLabel('Buscar en la lista').fill(`68${suffix}`);
      await page.getByRole('option', { name: new RegExp(`Suelta de reinduccion E2E${suffix}`) }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Asignar a estas personas' }).click();
      await expect(page.getByText('1 obligaciones creadas')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('1 regla + 1 suelta')).toBeVisible({ timeout: 20_000 });
      expect(await vivasDe(suelta.id)).toBe(1);

      // 5. Ajustar la del grupo: cambia la fecha de la campaña y se guarda sobre la MISMA regla.
      await page.getByRole('button', { name: 'Ajustar' }).click();
      await expect(page.locator('#q-areas')).toBeVisible();
      await page.locator('#q-repite-fecha-mes').selectOption({ index: 5 });
      await page.getByRole('button', { name: 'Guardar el ajuste' }).click();
      await expect(page.getByText('Alcance actualizado')).toBeVisible({ timeout: 20_000 });
      const trasAjustar = await reglas();
      expect(trasAjustar).toHaveLength(1);
      expect(trasAjustar[0]?.fixedDate).toMatch(/^06-/);
      expect(await vivasDe(delGrupo.id)).toBe(1);

      // 6. Eximir a la persona suelta, con motivo.
      const filaSuelta = page.getByRole('row').filter({ hasText: `Suelta de reinduccion E2E${suffix}` });
      await filaSuelta.getByRole('button', { name: 'Eximir' }).click();
      await page.locator('#eximir-motivo').fill('Prueba automatizada: se exime para comprobar el registro.');
      await page.getByRole('button', { name: 'Eximir a Suelta' }).click();
      await expect(page.getByText('Obligación eximida')).toBeVisible({ timeout: 20_000 });
      expect(await vivasDe(suelta.id)).toBe(0);

      // 7. Se vuelve a exigir a toda la empresa: dos reglas vivas y UNA sola obligacion por persona.
      await page.getByRole('button', { name: 'Volver a exigirla a toda la empresa' }).click();
      await expect(page.getByText('Ya se le exige a toda la empresa')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('2 reglas')).toBeVisible({ timeout: 20_000 });
      expect(await vivasDe(delGrupo.id)).toBe(1);
      // Las dos puertas siguen ahi con la automatica encendida.
      await expect(botonGrupo).toBeVisible();
      await expect(page.getByRole('heading', { name: 'O a personas concretas' })).toBeVisible();

      // 8. Y si ahora se retira la del grupo, la de toda la empresa la sigue exigiendo: una, no cero.
      const delGrupoRegla = (await reglas()).find((regla) => !regla.reachesEveryone)!;
      await a.del(`/activities/${ficha.id}/requirements/${delGrupoRegla.id}`);
      expect(await vivasDe(delGrupo.id)).toBe(1);
    } finally {
      // Limpieza: sin reglas vivas (obligan a la plantilla entera) y el tipo desactivado.
      for (const regla of await reglas()) await a.del(`/activities/${ficha.id}/requirements/${regla.id}`);
      await a.patch(`/catalogs/activity-types/${tipo.id}`, { active: false });
    }
  });

  /*
    LA REINDUCCION AUTOMATICA (2026-10-06): en el tipo se elige que vuelva «cada N meses desde la
    fecha de ingreso», con la antelacion a la vista. La campaña de fecha fija sigue como alternativa.
    Que el motor lo cumple lo prueba el recorrido `reinduccion-por-ingreso.mjs`; aqui, la pantalla.
  */
  test('Configuración: la reinducción vuelve sola desde la fecha de ingreso, o por fecha fija', async ({ page, request }) => {
    const suffix = unique();
    const a = await api(request);
    const nombre = `Tipo por ingreso E2E${suffix}`;
    const tipo = await a.post('/catalogs/activity-types', {
      code: `E2E_TI_${suffix}`,
      name: nombre,
      config: {
        requiresAssessment: false,
        requiresSurvey: false,
        issuesCertificate: false,
        defaultAssignmentMode: 'ON_HIRE',
        requiresBeforeHire: false,
        defaultAnnualDate: '03-31',
      },
    });
    const leerTipo = async () =>
      ((await a.get('/catalogs/activity-types')) as Array<{ id: string; config: Record<string, unknown> }>).find(
        (fila) => fila.id === tipo.id,
      )!.config;

    try {
      await loginAsAdmin(page);
      await page.goto('/configuracion/tipos-de-formacion');
      const tarjeta = page.locator('section').filter({ hasText: nombre });
      await expect(tarjeta).toContainText('Cada año antes del 31 de marzo', { timeout: 20_000 });
      await tarjeta.getByRole('button', { name: 'Configurar' }).click();

      const modo = page.locator(`#t-modo-${tipo.id}`);
      await expect(modo).toHaveValue('ANUAL');
      // En una campaña la fecha la pone el calendario: el plazo en dias no se pregunta.
      await expect(page.locator(`#t-alcance-${tipo.id}`)).toBeVisible();
      await expect(page.locator(`#t-plazo-${tipo.id}`)).toHaveCount(0);
      // La antelacion ya se ve: eran 60 dias fijos que ninguna pantalla decia.
      await expect(page.locator(`#t-ventana-${tipo.id}`)).toHaveValue('60');

      await modo.selectOption('INGRESO');
      await expect(page.getByText('Cada 12 meses desde la fecha de ingreso de cada persona').first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator(`#t-meses-${tipo.id}`)).toHaveValue('12');
      // Por ingreso no hay «recien ingresados» que excluir: a nadie le toca antes de sus N meses.
      await expect(page.locator(`#t-recien-${tipo.id}`)).toHaveCount(0);
      // Ni «a quien alcanza» ni plazo: alcanza a todos, a cada quien cuando le toca.
      await expect(page.locator(`#t-alcance-${tipo.id}`)).toHaveCount(0);
      await expect(page.locator(`#t-plazo-${tipo.id}`)).toHaveCount(0);
      await expect(page.getByText(/Se exige sola: a quien ya cumplió los meses, al publicar/).first()).toBeVisible();
      // Los dias de gracia se ven y se cambian en el tipo.
      await expect(page.locator(`#t-gracia-${tipo.id}`)).toHaveValue('30');

      await page.locator(`#t-ventana-${tipo.id}`).fill('45');
      await page.locator(`#t-ventana-${tipo.id}`).blur();
      await expect
        .poll(async () => (await leerTipo()).defaultWindowDays, { timeout: 10_000 })
        .toBe(45);
      const guardado = await leerTipo();
      expect(guardado.defaultRecurrenceAnchor).toBe('HIRE');
      expect(guardado.defaultRecurrenceMonths).toBe(12);
      expect(guardado.defaultAnnualDate).toBeNull();

      // Con el tipo por ingreso, Quiénes dice quien no tiene fecha de ingreso y lleva a Usuarios filtrado.
      const sinFecha = await a.post('/users', {
        documentNumber: `69${suffix}`.slice(0, 20),
        fullName: `Sin fecha de ingreso E2E${suffix}`,
        jobTitleId: ((await a.get('/catalogs/job-titles')) as Array<{ id: string; active: boolean }>).find((c) => c.active)!.id,
        areaId: ((await a.get('/catalogs/areas')) as Array<{ id: string; active: boolean }>).find((c) => c.active)!.id,
      });
      expect(sinFecha.user.hiredAt).toBeNull();
      const procesos = (await a.get('/catalogs/processes')) as Array<{ id: string; active: boolean }>;
      const ficha = await a.post('/activities', {
        code: `E2E_TIF_${suffix}`,
        name: `Reinduccion por ingreso E2E${suffix}`,
        activityTypeId: tipo.id,
        processId: procesos.find((p) => p.active)!.id,
        modality: 'VIRTUAL',
      });
      await page.goto(`/contenido-formativo/${ficha.id}?tab=quienes`);
      await expect(page.getByText(/quien ya cumplió los meses/).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/personas? activas? sin fecha de ingreso/)).toBeVisible({ timeout: 20_000 });
      await page.getByRole('link', { name: 'Ver en Usuarios' }).click();
      await page.waitForURL('**/usuarios?sinIngreso=1', { timeout: 20_000 });
      await expect(page.getByLabel('Fecha de ingreso', { exact: true })).toHaveValue('SIN', { timeout: 20_000 });
      await page.getByPlaceholder('Buscar por nombre, documento o correo').fill(`69${suffix}`);
      await expect(page.getByText(`Sin fecha de ingreso E2E${suffix}`).first()).toBeVisible({ timeout: 20_000 });
      // Limpieza de la ficha: en borrador y sin uso, se puede borrar; el tipo queda libre.
      await a.del(`/activities/${ficha.id}`);
      await page.goto('/configuracion/tipos-de-formacion');
      await page.locator('section').filter({ hasText: nombre }).getByRole('button', { name: 'Configurar' }).click();

      // Y la alternativa sigue ahi: volver a la fecha fija para todos.
      await modo.selectOption('ANUAL');
      await expect(page.locator(`#t-fecha-${tipo.id}-mes`)).toBeVisible({ timeout: 10_000 });
      await expect.poll(async () => (await leerTipo()).defaultAnnualDate, { timeout: 10_000 }).toBe('03-31');
    } finally {
      await a.del(`/catalogs/activity-types/${tipo.id}`);
    }
  });
});
