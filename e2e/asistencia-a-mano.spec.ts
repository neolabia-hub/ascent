import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_DOCUMENT, E2E_PASSWORD, TENANT_SLUG, loginAsAdmin, unique } from './helpers';

/**
 * TOMAR LA LISTA A MANO, DESDE LA PANTALLA.
 *
 * ─── POR QUE ESTA PRUEBA ───
 *
 * La pidió el cliente con estas palabras: *«necesito prueba de lista tomada a mano por UI del
 * administrador»*. Y hacía falta: los recorridos por HTTP prueban que el servidor cierra bien las
 * formaciones, pero **la lista se toma con tres iconos por persona**, y lo que se rompe ahí es la
 * pantalla — el estado que no se guarda, el motivo que no se pide, el botón que no se enciende.
 *
 * ─── LO QUE COMPRUEBA ───
 *
 *   1. La lista se abre con todos en «asistió», que es el defecto que ahorra treinta y siete clics.
 *   2. Marcar «no asistió» y «falta justificada» con los iconos.
 *   3. Que la justificación **exija motivo**: el botón dice «Falta el motivo» hasta escribirlo.
 *   4. Que al guardar se cierre solo la de quien asistió.
 *   5. Y que la lista, ya cerrada, diga **cómo** se marcó cada quien.
 */

const API = 'http://localhost:3002/v1';

async function montarJornadaSinMarcar(request: APIRequestContext, suffix: string) {
  const login = await request.post(`${API}/auth/login`, {
    data: { tenantSlug: TENANT_SLUG, identifier: E2E_DOCUMENT, password: E2E_PASSWORD },
  });
  const { accessToken } = (await login.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  const get = async (ruta: string) => (await request.get(`${API}${ruta}`, { headers: auth })).json();
  const post = async (ruta: string, data: unknown) =>
    (await request.post(`${API}${ruta}`, { headers: auth, data })).json();

  const tipos = (await get('/catalogs/activity-types')) as Array<{
    id: string;
    code: string;
    active?: boolean;
    config?: { participatesInPlan?: boolean; requiresAssessment?: boolean; tracksExternalCertificate?: boolean };
  }>;
  // Uno que NO lleve papel de un tercero: aquí se prueba la lista, no el certificado, y las dos
  // columnas de más solo añadirían ruido a los selectores.
  const tipo = tipos.find(
    (t) =>
      t.active !== false &&
      t.code !== 'MICROLEARNING' &&
      t.config?.participatesInPlan !== true &&
      t.config?.tracksExternalCertificate !== true,
  );
  expect(tipo, 'hace falta un tipo fuera del plan y sin papel de tercero').toBeTruthy();

  const procesos = (await get('/catalogs/processes')) as Array<{ id: string; active: boolean }>;
  const cargos = (await get('/catalogs/job-titles')) as Array<{ id: string; active: boolean }>;
  const areas = (await get('/catalogs/areas')) as Array<{ id: string; active: boolean }>;

  const actividad = (await post('/activities', {
    code: `MANO_${suffix}`,
    name: `Lista a mano ${suffix}`,
    activityTypeId: tipo?.id,
    processId: procesos.find((p) => p.active)?.id,
    modality: 'PRESENCIAL',
  })) as { id: string };
  const ficha = (await get(`/activities/${actividad.id}`)) as { versions: Array<{ id: string; status: string }> };
  const versionId = ficha.versions.find((v) => v.status === 'DRAFT')?.id as string;

  const leccion = (await post('/lessons', { title: `Leccion ${suffix}`, estimatedMinutes: 5 })) as { id: string };
  await request.put(`${API}/lessons/${leccion.id}/cards`, {
    headers: auth,
    data: { cards: [{ payload: { cardType: 'TEXT_IMAGE', title: 'Antes', body: 'Revision.' } }] },
  });
  await post(`/activities/versions/${versionId}/contents`, {
    type: 'LESSON',
    title: 'Contenido',
    isRequired: true,
    config: { minSeconds: 1 },
    lessonId: leccion.id,
  });
  if (tipo?.config?.requiresAssessment !== false) {
    const pregunta = (await post('/questions', {
      payload: {
        qtype: 'SINGLE',
        stem: 'Antes de operar...',
        options: [
          { id: 'a', text: 'Se revisa' },
          { id: 'b', text: 'Se arranca' },
        ],
        correctOptionId: 'a',
        points: 1,
      },
    })) as { id: string };
    const examen = (await post('/assessments', { title: `Examen ${suffix}` })) as { id: string };
    await request.patch(`${API}/assessments/${examen.id}`, {
      headers: auth,
      data: { passingScore: 80, maxAttempts: 3, sections: [{ mode: 'FIXED', questionIds: [pregunta.id] }] },
    });
    await post(`/activities/versions/${versionId}/contents`, {
      type: 'ASSESSMENT',
      title: 'Examen',
      isRequired: true,
      config: {},
      assessmentId: examen.id,
    });
  }
  await post(`/activities/versions/${versionId}/publish`, { migrationPolicy: 'MOVE_NOT_STARTED', confirm: true });

  const hoy = new Date().toISOString().slice(0, 10);
  const jornada = (await post('/offerings', {
    activityVersionId: versionId,
    kind: 'EVENT',
    modality: 'PRESENCIAL',
    scheduledDate: hoy,
    startTime: '08:00',
    endTime: '12:00',
    location: `Salon ${suffix}`,
    capacity: 5,
  })) as { id: string };
  await post(`/offerings/${jornada.id}/publish`, { confirm: true });

  const gente: string[] = [];
  for (const [indice, etiqueta] of ['Fue a la jornada', 'Se quedo sin ir'].entries()) {
    const persona = (await post('/users', {
      documentNumber: `66${suffix}${indice}`,
      fullName: `${etiqueta} ${suffix}`,
      email: `mano${indice}${suffix}@transprensa.test`,
      jobTitleId: cargos.find((c) => c.active)?.id,
      areaId: areas.find((a) => a.active)?.id,
    })) as { id?: string; user?: { id: string } };
    gente.push((persona.id ?? persona.user?.id) as string);
  }
  await post(`/offerings/${jornada.id}/enroll`, { userIds: gente });

  return {
    offeringId: jornada.id,
    asiste: `Fue a la jornada ${suffix}`,
    falta: `Se quedo sin ir ${suffix}`,
  };
}

test.describe('La lista de asistencia, tomada a mano', () => {
  test('DoD: el administrador la marca con los iconos, el motivo se exige y solo se cierra la de quien asistio', async ({
    page,
    request,
  }) => {
    const suffix = unique();
    const { offeringId, asiste, falta } = await montarJornadaSinMarcar(request, suffix);

    await loginAsAdmin(page);
    await page.goto(`/convocatorias/${offeringId}`);
    await page.getByRole('button', { name: 'Tomar asistencia' }).first().click();

    const filaAsiste = page.getByRole('row').filter({ hasText: asiste }).first();
    const filaFalta = page.getByRole('row').filter({ hasText: falta }).first();
    await expect(filaAsiste).toBeVisible({ timeout: 20_000 });

    // 1. TODOS EMPIEZAN EN «ASISTIO»: en una lista de cuarenta se cambian tres, no treinta y siete.
    await expect(page.getByRole('button', { name: /Dar por cumplida a 2/ })).toBeVisible();

    // 2. A quien no fue se le marca la falta con su icono.
    await filaFalta.getByRole('radio', { name: 'No asistio' }).click();
    await expect(page.getByRole('button', { name: /Dar por cumplida a 1/ })).toBeVisible();

    // 3. Y la falta JUSTIFICADA exige motivo: el boton lo dice hasta que se escribe.
    await filaFalta.getByRole('radio', { name: 'Falta justificada' }).click();
    await expect(page.getByRole('button', { name: 'Falta el motivo' })).toBeDisabled();

    // El disparador del panel lleva por nombre accesible la etiqueta del Popover —«Motivo de la
    // falta de …»—, no el texto que se ve dentro. Es lo correcto para un lector de pantalla.
    await filaFalta.getByRole('button', { name: /Motivo de la falta de/ }).click();
    await page.getByRole('textbox', { name: 'Motivo de la falta' }).fill('Incapacidad medica del 4 al 8');
    await page.keyboard.press('Escape');

    // 4. Con el motivo escrito se puede guardar, y solo se cierra la de quien asistio.
    const guardar = page.getByRole('button', { name: /Dar por cumplida a 1/ });
    await expect(guardar).toBeEnabled();
    await guardar.click();
    await expect(page.getByText(/formacion\(es\) dada\(s\) por cumplida\(s\)/)).toBeVisible({ timeout: 20_000 });

    // 5. Y la lista ya cerrada dice COMO se marco cada quien.
    await expect(page.getByRole('row').filter({ hasText: asiste }).first()).toContainText('Marcada en la lista');
    await expect(page.getByRole('row').filter({ hasText: falta }).first()).toContainText(
      'Incapacidad medica del 4 al 8',
    );
  });
});
