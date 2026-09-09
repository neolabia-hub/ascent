import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_DOCUMENT, E2E_PASSWORD, TENANT_SLUG, loginAsAdmin, unique } from './helpers';

/**
 * EL ESCANEO DE UN CERTIFICADO SE PUEDE GUARDAR, Y SE PUEDE VOLVER A ABRIR.
 *
 * ─── QUE FALLO, Y COMO SE VEIA ───
 *
 * Lo cazo el cliente el 2026-09-08: adjuntaba el certificado de una persona que ya tenia su
 * formacion cumplida y **el boton no se activaba** —«Guardar 0 correccion(es)»— asi que el archivo
 * subido se perdia al cerrar la lista. La comparacion que decide si hay algo que guardar miraba el
 * numero y la fecha, y no el adjunto.
 *
 * Y la otra mitad: el adjunto **no se podia abrir**. Se enseñaba un visto con el nombre y nada mas,
 * asi que no habia forma de comprobar que se subio la hoja correcta.
 *
 * ─── POR QUE ESTA PRUEBA ES DE PANTALLA Y NO UN RECORRIDO ───
 *
 * Porque el fallo estaba en la PANTALLA: el servidor aceptaba el archivo perfectamente. Un recorrido
 * por HTTP lo habria dado por bueno — de hecho lo daba.
 *
 * El montaje va por API a proposito: lo que se prueba son tres clics, y armar una jornada cumplida a
 * traves de la interfaz costaria dos minutos de prueba para llegar a ellos.
 */

const API = 'http://localhost:3002/v1';

/** Un PNG de un pixel: aqui lo que importa es que haya un archivo, no que se parezca a un papel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function montarJornadaCumplida(request: APIRequestContext, suffix: string) {
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
    config?: { tracksExternalCertificate?: boolean; requiresAssessment?: boolean };
  }>;
  // El que lleve papel de un tercero, elegido por su CONFIGURACION y no por su codigo: eso es
  // parametrizacion del tenant y cambia.
  const tipo = tipos.find(
    (t) => t.active !== false && t.code !== 'MICROLEARNING' && t.config?.tracksExternalCertificate === true,
  );
  expect(tipo, 'hace falta un tipo que lleve certificado de un tercero').toBeTruthy();

  const procesos = (await get('/catalogs/processes')) as Array<{ id: string; active: boolean }>;
  const cargos = (await get('/catalogs/job-titles')) as Array<{ id: string; active: boolean }>;
  const areas = (await get('/catalogs/areas')) as Array<{ id: string; active: boolean }>;

  const actividad = (await post('/activities', {
    code: `ADJ_${suffix}`,
    name: `Con papel adjunto ${suffix}`,
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
    executedBy: 'ARL',
    executedByOther: 'ARL Colmena',
    capacity: 5,
  })) as { id: string };
  await post(`/offerings/${jornada.id}/publish`, { confirm: true });

  const persona = (await post('/users', {
    documentNumber: `55${suffix}`,
    fullName: `Persona adjunto ${suffix}`,
    email: `adj${suffix}@transprensa.test`,
    jobTitleId: cargos.find((c) => c.active)?.id,
    areaId: areas.find((a) => a.active)?.id,
  })) as { id?: string; user?: { id: string } };
  const personaId = persona.id ?? persona.user?.id;

  await post(`/offerings/${jornada.id}/enroll`, { userIds: [personaId] });
  const roster = (await get(`/offerings/${jornada.id}/roster`)) as {
    items: Array<{ id: string; user: { id: string } }>;
  };
  const inscripcion = roster.items.find((fila) => fila.user.id === personaId)?.id;

  // Se cierra CON numero de certificado: el caso del cliente es adjuntar el escaneo despues, cuando
  // el numero ya estaba puesto. Sin numero previo el boton se apaga por otro motivo distinto.
  await post(`/offerings/${jornada.id}/attendance`, {
    heldOn: hoy,
    items: [{ enrollmentId: inscripcion, estado: 'PRESENT', certificate: { number: `ARL-${suffix}` } }],
  });

  return { offeringId: jornada.id, nombre: `Persona adjunto ${suffix}` };
}

test.describe('El escaneo del certificado', () => {
  test('DoD: adjuntarlo cuenta como cambio, se guarda y despues se puede abrir', async ({ page, request }) => {
    const suffix = unique();
    const { offeringId, nombre } = await montarJornadaCumplida(request, suffix);

    await loginAsAdmin(page);
    await page.goto(`/convocatorias/${offeringId}`);

    /*
      EL BOTON SE LLAMA DISTINTO SEGUN QUE HAYA QUE HACER: «Tomar asistencia» cuando queda gente por
      revisar y «Corregir certificados» cuando ya estan todos cerrados, que es el caso de esta prueba.
      Es la misma puerta y lo dice bien; buscarlo por un solo nombre era mio.
    */
    const abrirLista = page.getByRole('button', { name: /Tomar asistencia|Corregir certificados/ });
    await abrirLista.first().click();

    const fila = page.getByRole('row').filter({ hasText: nombre }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });

    // Nada tocado todavia: no hay nada que guardar.
    const guardar = page.getByRole('button', { name: /Guardar \d+ correccion|Dar por cumplida/ });
    await expect(guardar).toBeDisabled();

    // Se adjunta el escaneo. El campo va oculto a proposito —el boton es un clip— y Playwright puede
    // escribir en el igual.
    await fila.locator('input[type="file"]').setInputFiles({
      name: 'certificado.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(fila.getByText('certificado.png')).toBeVisible({ timeout: 20_000 });

    /*
      LO QUE FALLABA: con el archivo subido, el boton seguia apagado y diciendo «0 correccion(es)».
    */
    await expect(page.getByRole('button', { name: /Guardar 1 correccion/ })).toBeEnabled();
    await page.getByRole('button', { name: /Guardar 1 correccion/ }).click();
    await expect(page.getByText(/certificado\(s\) corregido/)).toBeVisible({ timeout: 20_000 });

    // Y LA OTRA MITAD: al reabrir la lista, el adjunto sigue ahi y ademas se puede abrir.
    await abrirLista.first().click();
    const filaOtraVez = page.getByRole('row').filter({ hasText: nombre }).first();
    await expect(filaOtraVez).toBeVisible({ timeout: 20_000 });
    const enlace = filaOtraVez.getByRole('link', { name: /Adjunto|certificado/ });
    await expect(enlace).toBeVisible({ timeout: 20_000 });
    await expect(enlace).toHaveAttribute('href', /media\/file/);
  });
});
