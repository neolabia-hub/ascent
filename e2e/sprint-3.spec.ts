import { expect, test } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 3 (Definition of Done de la entrega de la formacion):
 *
 *  1. una audiencia y un requisito hacen que la obligacion NAZCA sola,
 *  2. al dar de alta a una persona le nace su induccion con vencimiento ANTES de su ingreso,
 *  3. una convocatoria publicada congela sus proyectados, y
 *  4. el plan anual muestra cumplimiento y cobertura, y sigue publicado como historia.
 *
 * Depende del contenido publicado que crea el flujo del Sprint 2: aqui se crea el propio, para
 * que la prueba sea repetible sobre la misma base.
 */

/** Crea una actividad con una leccion y la deja PUBLICADA (requisito para convocarla). */
async function publishedActivity(page: import('@playwright/test').Page, suffix: string, name: string) {
  await page.goto('/lecciones');
  await page.getByRole('button', { name: 'Nueva leccion' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion ${name} ${suffix}`);
  await page.getByRole('button', { name: /Crear/ }).click();
  await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code').fill(`S3_${suffix}`);
  await page.locator('#a-name').fill(`${name} ${suffix}`);
  await page.locator('#a-type').selectOption({ label: 'Induccion general' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  // La formacion es una ficha con pestanas: el contenido vive en la suya.
  await page.getByRole('button', { name: 'Contenido', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
  // Paso 1: se elige el TIPO en el selector de tarjetas (autoria reestructurada, 2026-08-27).
  await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
  await page.locator('#c-title').fill('Bienvenida');
  // Paso 2: se reutiliza una leccion de la biblioteca en vez de crear una nueva.
  await page.getByRole('radio', { name: 'Traer de la biblioteca' }).click();
  const lessonValue = await page
    .locator('#c-lesson option', { hasText: `Leccion ${name} ${suffix}` })
    .first()
    .getAttribute('value');
  await page.locator('#c-lesson').selectOption(lessonValue as string);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.getByText('Contenido agregado')).toBeVisible();

  await page.getByRole('button', { name: 'Publicar version' }).click();
  await page.getByRole('button', { name: 'Publicar y congelar' }).click();
  await expect(page.getByText('Version 1 publicada')).toBeVisible();
}

test.describe('Sprint 3 — convocatorias, asignaciones y plan', () => {
  test('DoD: la obligacion nace sola al ingresar y vence antes de la fecha de ingreso', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Induccion S3 ${suffix}`;
    await publishedActivity(page, suffix, 'Induccion S3');

    // 1. Audiencia de toda la empresa.
    await page.goto('/asignaciones');
    await page.getByRole('button', { name: 'Audiencias' }).click();
    await page.getByRole('button', { name: 'Nueva audiencia' }).click();
    await page.locator('#a-name').fill(`Toda la empresa ${suffix}`);
    await expect(page.getByText(/Sin filtros, la audiencia es TODA la empresa/)).toBeVisible();
    await page.getByRole('button', { name: 'Crear audiencia' }).click();
    await expect(page.getByText('Audiencia creada')).toBeVisible();

    // 2. Requisito de ingreso: vence UN DIA ANTES de empezar a trabajar (D1072).
    await page.getByRole('button', { name: 'Requisitos' }).click();
    // Hay dos: el del encabezado y el del estado vacio. Cualquiera sirve.
    await page.getByRole('button', { name: 'Nuevo requisito' }).first().click();
    // El texto de la opcion incluye el conteo de personas: se resuelve el value real.
    const audienceValue = await page
      .locator('#r-audience option', { hasText: `Toda la empresa ${suffix}` })
      .first()
      .getAttribute('value');
    expect(audienceValue).toBeTruthy();
    await page.locator('#r-audience').selectOption(audienceValue as string);
    await page.locator('#r-target').selectOption({ label: activityName });
    await page.locator('#r-trigger').selectOption('ON_HIRE');
    await page.locator('#r-due').fill('-1');
    await page.getByRole('button', { name: 'Crear requisito' }).click();
    await expect(page.getByText('Requisito creado')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: activityName }).getByText('1 dia antes')).toBeVisible();

    // 3. Alta de una persona con fecha de ingreso futura.
    await page.goto('/usuarios');
    await page.getByRole('button', { name: 'Nueva persona' }).first().click();
    await page.locator('#u-doc').fill(`77${suffix}`);
    await page.locator('#u-name').fill(`Persona S3 ${suffix}`);
    await page.locator('#u-email').fill(`s3${suffix}@transprensa.test`);
    await page.locator('#u-job').selectOption({ index: 1 });
    await page.locator('#u-area').selectOption({ index: 1 });
    await page.locator('#u-hired').fill('2026-12-01');
    await page.getByRole('button', { name: 'Crear persona' }).click();
    await expect(page.getByRole('button', { name: 'Entendido' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Entendido' }).click();

    // 4. La obligacion existe sin que nadie la asignara, y vence ANTES del ingreso.
    await page.goto('/asignaciones');
    await page.getByRole('button', { name: 'Obligaciones' }).click();
    await page.getByPlaceholder('Buscar por nombre o documento').fill(`Persona S3 ${suffix}`);
    const row = page.getByRole('row').filter({ hasText: `Persona S3 ${suffix}` }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('Requisito')).toBeVisible();
    await expect(row.getByText('PENDIENTE')).toBeVisible();
    // Ingreso el 1 de diciembre, requisito a un dia antes: vence el 30 de noviembre. La fecha
    // exacta importa: es la evidencia de que la induccion es PREVIA al inicio de labores.
    await expect(row).toContainText('30 de nov');

    // 5. SE RETIRA EL REQUISITO. No es limpieza cosmetica: la audiencia es "toda la empresa", asi
    //    que mientras siga vigente obliga a CADA persona que se cree despues, tambien a las de
    //    otras pruebas. Dejandolo puesto, cada corrida sumaba un requisito eterno: al llegar a 41,
    //    un alta nacia con 41 obligaciones y esta misma prueba empezo a fallar de vez en cuando.
    await page.goto('/asignaciones');
    await page
      .getByRole('row')
      .filter({ hasText: activityName })
      .getByRole('button', { name: 'Retirar' })
      .click();
    await expect(
      page.getByRole('row').filter({ hasText: activityName }).getByText('RETIRADO'),
    ).toBeVisible();
  });

  test('DoD: publicar la convocatoria congela los proyectados y el plan mide sobre ellos', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Capacitacion S3 ${suffix}`;
    await publishedActivity(page, suffix, 'Capacitacion S3');

    // 1. Convocatoria presencial.
    await page.goto('/convocatorias');
    await page.getByRole('button', { name: 'Nueva convocatoria' }).click();
    await page.locator('#o-version').selectOption({ label: `${activityName} (v1)` });
    await page.locator('#o-kind').selectOption('EVENT');
    await page.locator('#o-modality').selectOption('PRESENCIAL');
    await page.locator('#o-date').fill('2026-03-10');
    await page.locator('#o-location').fill('Auditorio principal');
    await page.getByRole('button', { name: 'Crear convocatoria' }).click();
    await page.waitForURL('**/convocatorias/**', { timeout: 20_000 });
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();

    // 2. Publicar congela los proyectados.
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText(/Proyectados derivados/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(page.getByText('Convocatoria publicada')).toBeVisible();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await expect(page.getByText(/Congelados el/)).toBeVisible();

    // 3. Plan anual con esa convocatoria.
    await page.goto('/plan');
    await page.getByRole('button', { name: 'Nuevo plan' }).click();
    await page.locator('#p-year').fill('2026');
    await page.locator('#p-name').fill(`Plan S3 ${suffix}`);
    await page.getByRole('button', { name: 'Crear plan' }).click();
    await page.waitForURL('**/plan/**', { timeout: 20_000 });

    // El plan ofrece DOS caminos: crear la jornada ahi mismo, o enganchar una que ya existe.
    // Este DoD engancha la que se acaba de publicar, asi que usa el segundo.
    await page.getByRole('button', { name: 'Usar una que ya existe' }).first().click();
    // Por NOMBRE y no por indice: el desplegable trae las convocatorias de demostracion primero,
    // asi que un indice fijo planificaba una capacitacion distinta de la que acaba de publicarse.
    const offeringValue = await page
      .locator('#i-offering option', { hasText: activityName })
      .first()
      .getAttribute('value');
    await page.locator('#i-offering').selectOption(offeringValue as string);
    await page.locator('#i-month').selectOption('3');
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('Renglon agregado')).toBeVisible();

    // 4. Aprobar congela los proyectados del renglon y crea las obligaciones del plan.
    await page.getByRole('button', { name: 'Aprobar plan' }).click();
    await expect(page.getByText('Plan aprobado')).toBeVisible();
    await expect(page.getByText('APROBADO', { exact: true })).toBeVisible();
    await expect(page.getByText('Cumplimiento del programa')).toBeVisible();
    // La cobertura se lee sobre los proyectados CONGELADOS del renglon, no sobre un numero vivo.
    await expect(page.getByText(/capacitados de \d+ proyectados/)).toBeVisible();
    await expect(page.getByText(/ejecutadas de 1 programadas/)).toBeVisible();

    // 5. Aprobado, BORRAR sigue prohibido: esos renglones ya obligan a personas reales.
    await expect(page.getByRole('button', { name: 'Quitar' })).toHaveCount(0);

    // ...pero AGREGAR ya no (Decision #55). Si en agosto abren una regional, esa jornada tiene
    // que entrar en el plan del ano; prohibirlo no evitaba el cambio, lo sacaba del sistema.
    await page.getByRole('button', { name: 'Otra jornada de esta capacitacion' }).click();
    await page.locator('#o-month').selectOption('9');
    await page.locator('#o-date').fill('2026-09-15');
    await page.locator('#o-location').fill('Sede Neiva');

    // Y no se agrega a la ligera: sin motivo el boton no deja.
    const agregar = page.getByRole('button', { name: 'Agregar al plan' });
    await expect(agregar).toBeDisabled();
    await page.locator('#o-justification').fill('Se abrio la regional de Neiva en agosto y hay que cubrirla.');
    await agregar.click();
    await expect(page.getByText('Agregada al plan')).toBeVisible();
    await expect(page.getByText(/ejecutadas de 2 programadas/)).toBeVisible();

    // 6. Ajustar los proyectados (regla de oro 3): se congelaron unos y la realidad cambio.
    // El motivo es obligatorio, y el numero nuevo pasa al denominador de la cobertura.
    await page.getByTitle('Ajustar los proyectados (pide motivo)').first().click();
    await page.locator('#pr-count').fill('99');
    const guardar = page.getByRole('button', { name: 'Guardar ajuste' });
    await expect(guardar).toBeDisabled();
    await page.locator('#pr-reason').fill('Ingresaron 7 conductores al area despues de congelar.');
    await guardar.click();
    await expect(page.getByText('Proyectados ajustados')).toBeVisible();
    await expect(page.getByText(/de 99 proyectados/)).toBeVisible();

    // 7. El cronograma mueve una jornada de mes, y eso queda como REPROGRAMADA: el indicador
    //    tiene que distinguir lo que se cumplio en su mes de lo que se movio hasta que cupo.
    await page.getByRole('button', { name: 'Cronograma' }).click();
    const marzo = page.locator(`td[aria-label="Marzo · ${activityName}"]`);
    await expect(marzo.locator('a')).toHaveCount(1);
    await marzo.locator('a').dragTo(page.locator(`td[aria-label="Junio · ${activityName}"]`));
    await expect(page.getByText('Movida a Junio')).toBeVisible();
    await expect(page.locator(`td[aria-label="Junio · ${activityName}"] a`)).toHaveCount(1);
    await expect(marzo.locator('a')).toHaveCount(0);
  });
});

/**
 * CREAR LA CAPACITACION DESDE EL PLAN, ida y vuelta.
 *
 * El plan no puede resolverlo en un cajon: una capacitacion nueva hay que armarla y publicarla
 * antes de poder convocarla. Lo que si tiene que cumplir es no perder a quien la empieza — el
 * fallo que se reporto era exactamente ese: se salia a "Formaciones" y ya no habia camino de
 * vuelta al plan, asi que planear el ano eran cuatro pantallas por renglon.
 */
test('desde el plan se crea una capacitacion nueva y la ficha devuelve al plan', async ({ page }) => {
  await loginAsAdmin(page);
  const suffix = unique();

  await page.goto('/plan');
  await page.getByRole('button', { name: 'Nuevo plan' }).click();
  await page.locator('#p-name').fill(`Plan ida y vuelta ${suffix}`);
  await page.getByRole('button', { name: 'Crear plan' }).click();
  await page.waitForURL('**/plan/**', { timeout: 20_000 });
  const planUrl = new URL(page.url()).pathname;

  // Hay dos botones iguales: el de la cabecera y el del estado vacio. Vale cualquiera.
  await page.getByRole('button', { name: 'Capacitacion nueva' }).first().click();
  await page.waitForURL('**/contenido-formativo?**', { timeout: 20_000 });

  // El cajon llega ABIERTO: quien pulso "capacitacion nueva" ya dijo lo que queria.
  await page.locator('#a-code').fill(`P2P_${suffix}`);
  await page.locator('#a-name').fill(`Capacitacion desde el plan ${suffix}`);
  await page.locator('#a-type').selectOption({ label: 'Capacitacion del plan' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  // Y la ficha ofrece el regreso, que es lo que se estaba perdiendo.
  const back = page.getByRole('link', { name: 'Volver al plan' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${planUrl}$`));
  await expect(page.getByText(`Plan ida y vuelta ${suffix}`)).toBeVisible();
});
