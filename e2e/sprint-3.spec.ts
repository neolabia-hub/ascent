import { expect, test } from '@playwright/test';
import {
  ANO_PLAN_DESECHABLE,
  ANO_PLAN_DOD,
  ANO_PLAN_IDA_Y_VUELTA,
  agregarEvaluacion,
  crearPlanDelAno,
  elegirEnCombo,
  limpiarPlanDelAno,
  loginAsAdmin,
  unique,
} from './helpers';

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

/**
 * Crea una actividad con una leccion y la deja PUBLICADA.
 *
 * El TIPO se pasa porque las dos pruebas necesitan uno distinto y por razones opuestas:
 *   - la de "nace sola" usa EXTRAORDINARIA para controlar ella misma a quien se le exige;
 *   - la del plan usa CAPACITACION DEL PLAN, porque desde la Decision #78 el plan solo engancha
 *     convocatorias de formaciones que cuentan para el — una extraordinaria no puede mover su
 *     cumplimiento (regla de oro 2), y ofrecerla seria ofrecer un error.
 */
async function publishedActivity(
  page: import('@playwright/test').Page,
  suffix: string,
  name: string,
  tipo = 'Capacitacion extraordinaria',
) {
  await page.goto('/lecciones');
  await page.getByRole('button', { name: 'Nueva leccion' }).click();
  await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion ${name} ${suffix}`);
  await page.getByRole('button', { name: /Crear/ }).click();
  await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(`S3_${suffix}`);
  await page.locator('#a-name').fill(`${name} ${suffix}`);
  // CAPACITACION EXTRAORDINARIA y no induccion general, a proposito: desde la Decision #69, una
  // induccion general se EXIGE SOLA al publicarse, y estas dos pruebas necesitan controlar ellas
  // mismas a quien se le exige —una crea su requisito de ingreso, la otra mide proyectados—. Con
  // una induccion, el requisito automatico se sumaria al suyo y mediria otra cosa. Que se exija
  // sola tiene su propia prueba en `quienes-desde-la-ficha.spec.ts`.
  await page.locator('#a-type').selectOption({ label: tipo });
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

  // El tipo de esta formacion pide evaluacion, y desde el 2026-09-04 publicar sin ella se rechaza.
  await agregarEvaluacion(page, `Examen ${name} ${suffix}`);

  await page.getByRole('button', { name: 'Publicar cambios' }).click();
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
    await page.getByRole('tab', { name: 'Audiencias' }).click();
    await page.getByRole('button', { name: 'Nueva audiencia' }).click();
    await page.locator('#a-name').fill(`Toda la empresa ${suffix}`);
    await expect(page.getByText(/Sin filtros, la audiencia es TODA la empresa/)).toBeVisible();
    await page.getByRole('button', { name: 'Crear audiencia' }).click();
    await expect(page.getByText('Audiencia creada')).toBeVisible();

    // 2. Requisito de ingreso: vence UN DIA ANTES de empezar a trabajar (D1072).
    await page.getByRole('tab', { name: 'Requisitos' }).click();
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
    // 30 s y no los 10 por defecto: crear un requisito de TODA la empresa inserta una obligacion
    // y un aviso por persona en la misma peticion, y la base de desarrollo ya tiene 459. Es la
    // deuda de "el motor recorre persona por persona" asomando; con 116 reales va sobrado.
    await expect(page.getByText('Requisito creado')).toBeVisible({ timeout: 30_000 });
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
    await page.getByRole('tab', { name: 'Obligaciones' }).click();
    await page.getByPlaceholder('Buscar por nombre o documento').fill(`Persona S3 ${suffix}`);
    // Por persona Y FORMACION: una persona nueva recibe TODAS las obligaciones de reglas vivas
    // de la empresa, asi que `.first()` a secas cogia la fila de otra capacitacion y leia su
    // fecha. Con la base de desarrollo llena, ese error aparece solo cuando ya hay ruido.
    const row = page
      .getByRole('row')
      .filter({ hasText: `Persona S3 ${suffix}` })
      .filter({ hasText: activityName })
      .first();
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
    /*
      HAY QUE PEDIR "TODOS" PARA VERLO (2026-09-03).

      La lista de Requisitos ensena por defecto **solo lo VIGENTE**: un requisito retirado no obliga
      a nadie y verlo mezclado con los vivos hace contar mal de un vistazo. Asi que al retirarlo la
      fila desaparece, y esta comprobacion —que no se BORRA, que queda RETIRADO— hay que hacerla
      cambiando el filtro. Es la propia pantalla la que lo sugiere cuando una busqueda no encuentra
      nada: "Prueba con «Todos»: puede estar retirado".
    */
    // 30 s y no los 5 por defecto: retirar un requisito de TODA la empresa retira una obligacion
    // por persona —1.111 en la base de desarrollo— en la misma peticion. Es la misma deuda que ya
    // esta anotada al CREARLO, veinte lineas mas arriba, asomando por el otro lado.
    await expect(page.getByRole('row').filter({ hasText: activityName })).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Todos' }).click();
    // Un registro que el sistema borra solo es un registro en el que no se puede confiar.
    await expect(
      page.getByRole('row').filter({ hasText: activityName }).getByText('RETIRADO'),
    ).toBeVisible({ timeout: 20_000 });
  });

  test('DoD: publicar la convocatoria congela los proyectados y el plan mide sobre ellos', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const activityName = `Capacitacion S3 ${suffix}`;
    // Del PLAN: es lo unico que el plan admite enganchar (Decision #78).
    await publishedActivity(page, suffix, 'Capacitacion S3', 'Capacitacion del plan');

    // 1. Convocatoria presencial.
    await page.goto('/convocatorias');
    await page.getByRole('button', { name: 'Nueva convocatoria' }).click();
    await elegirEnCombo(page, 'o-version', activityName);
    await page.locator('#o-kind').selectOption('EVENT');
    await page.locator('#o-modality').selectOption('PRESENCIAL');
    await page.locator('#o-date').fill(`${ANO_PLAN_DOD}-03-10`);
    await page.locator('#o-location').fill('Auditorio principal');

    /*
      SI HAY UN PLAN APROBADO VIVO, ESTE FORMULARIO PIDE MOTIVO (2026-09-03).

      Desde que programar una jornada de una capacitacion del plan la mete en el plan del ano
      (Decision #75), el cajon pide el "por que" cuando el plan destino ya esta aprobado — agregar
      un renglon crea obligaciones reales y el auditor va a preguntar de donde salio.

      Que aparezca o no depende de si existe un plan aprobado del ano en curso o posterior, es
      decir, del ESTADO de la base, no de esta prueba. Antes fallaba en cuanto otra corrida dejaba
      uno: el boton salia apagado y el error era un timeout, que no se parece a la causa. Se rellena
      si lo pide y se sigue. Que el motivo sea OBLIGATORIO lo comprueba la prueba del plan, mas
      abajo, que si controla el plan que se encuentra.
    */
    const motivo = page.locator('#o-justification');
    if (await motivo.isVisible()) {
      await motivo.fill('Jornada de la prueba de punta a punta: se programa dentro del ano en curso.');
    }

    await page.getByRole('button', { name: /^Crear (convocatoria|y agregar al plan)$/ }).click();
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
    //    El plan se crea DESPUES de la convocatoria a proposito: si existiera antes, la
    //    convocatoria entraria sola (Decision #75) y este paso no probaria el camino de
    //    enganchar una que YA existe, que es la unica via cuando el plan ya esta aprobado.
    // Cada prueba trabaja en SU ano: desde la Decision #71 hay UN plan por ano, asi que dos
    // pruebas sobre el mismo ano se pisarian entre si y con el plan real de la empresa.
    await crearPlanDelAno(page, ANO_PLAN_DOD, `Plan S3 ${suffix}`);

    // El plan ofrece DOS caminos: crear la jornada ahi mismo, o enganchar una que ya existe.
    // Este DoD engancha la que se acaba de publicar, asi que usa el segundo.
    await page.getByRole('button', { name: 'Agregar convocatoria existente' }).first().click();
    // Se BUSCA la convocatoria en vez de recorrer un desplegable: con 253 en la base, la recien
    // publicada quedaba fuera de las primeras 100 y el plan no podia engancharla.
    // Se ELIGE viendola: la lista dice codigo, formacion, tipo, estado y fecha, que es lo que
    // hace falta para saber si es la que uno busca. Y el buscador pregunta al SERVIDOR, no
    // filtra las 100 que quepan (Decision #80).
    await elegirEnCombo(page, 'i-offering', activityName);
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
    await page.getByRole('button', { name: 'Agregar otra convocatoria' }).click();
    await page.locator('#o-month').selectOption('9');
    // El formulario nace con lo que propone el TIPO —una induccion queda disponible, no se cita a
    // una sesion—, asi que aqui se cambia a proposito: esta jornada si tiene fecha y sede.
    await page.locator('#o-kind').selectOption('EVENT');
    // Y a presencial: la modalidad ahora se HEREDA de la ficha (esta formacion es virtual), asi
    // que el lugar solo se pide cuando de verdad hay donde presentarse.
    await page.locator('#o-modality').selectOption('PRESENCIAL');
    await page.locator('#o-date').fill(`${ANO_PLAN_DOD}-09-15`);
    await page.locator('#o-location').fill('Sede Neiva');

    // Y no se agrega a la ligera: sin motivo el boton no deja.
    const agregar = page.getByRole('button', { name: 'Crear y agregar al plan' });
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

    // 8. Y se retira al terminar. Un plan aprobado que sobrevive a la prueba es lo que llenaba la
    //    base de planes fantasma —168 de 2026 llego a haber—, y desde que hay uno por ano ademas
    //    le quita el ano al de al lado. Borrarlo comprueba de paso la otra mitad de la Decision
    //    #62: aprobado pero sin que nadie empezara, se borra revocando sus obligaciones.
    await limpiarPlanDelAno(page, ANO_PLAN_DOD);
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

  const planUrl = await crearPlanDelAno(page, ANO_PLAN_IDA_Y_VUELTA, `Plan ida y vuelta ${suffix}`);

  // Hay dos botones iguales: el de la cabecera y el del estado vacio. Vale cualquiera.
  await page.getByRole('button', { name: 'Crear capacitacion' }).first().click();
  await page.waitForURL('**/contenido-formativo?**', { timeout: 20_000 });

  // El cajon llega ABIERTO: quien pulso "capacitacion nueva" ya dijo lo que queria.
  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(`P2P_${suffix}`);
  await page.locator('#a-name').fill(`Capacitacion desde el plan ${suffix}`);
  await page.locator('#a-type').selectOption({ label: 'Capacitacion del plan' });
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  // LA FICHA DICE QUE TODAVIA NO ESTA EN EL PLAN. Es lo que reporto el cliente: crear una
  // "capacitacion del plan" no la mete en ningun plan, su tipo promete en pantalla que cuenta
  // para los indicadores del plan anual, y no cuenta para nada. Ninguna pantalla lo decia.
  //
  // El ANO no se fija: la tarjeta elige el plan del ano en curso y solo cae al siguiente si el
  // de este no existe o esta cerrado. Cual sea depende de lo que haya en la base —si alguien
  // creo el plan de este ano mientras corre la suite, y esta bien que la ficha apunte a ese—.
  // Clavarlo hacia fallar la prueba por un comportamiento correcto.
  await expect(page.getByText(/^Esta capacitacion no esta en el plan de \d{4}\.$/)).toBeVisible();
  // Sin contenido publicado no se ofrece programarla: solo se convoca lo publicado.
  await expect(page.getByText('Publica el contenido para poder programarla.')).toBeVisible();

  // Y la ficha ofrece el regreso, que es lo que se estaba perdiendo.
  const back = page.getByRole('link', { name: 'Volver al plan' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${planUrl}$`));
  await expect(page.getByText(`Plan ida y vuelta ${suffix}`)).toBeVisible();

  await limpiarPlanDelAno(page, ANO_PLAN_IDA_Y_VUELTA);
});

/**
 * BORRAR Y CORREGIR EL PLAN.
 *
 * Hasta ahora un plan no se podia tirar de ninguna forma, y eso convertia cada ensayo en un
 * renglon permanente del listado. La frontera nueva no es el estado del plan sino si alguien
 * EMPEZO: aqui se cubre el borrador —que nunca obligo a nadie— de punta a punta, incluida la
 * correccion de la cabecera, que existia en la API y no la llamaba ninguna pantalla.
 */
test('un plan en borrador se corrige y se elimina desde el listado', async ({ page }) => {
  await loginAsAdmin(page);
  const suffix = unique();
  const nombre = `Plan desechable ${suffix}`;
  const corregido = `Plan corregido ${suffix}`;

  await crearPlanDelAno(page, ANO_PLAN_DESECHABLE, nombre);

  // 1. Corregir la cabecera. En borrador se puede cambiar hasta el ano, y sin pedir motivo.
  await page.getByRole('button', { name: 'Editar' }).click();
  await page.locator('#e-name').fill(corregido);
  await page.locator('#e-objective').fill('Objetivo escrito despues de crear el plan.');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Plan actualizado')).toBeVisible();
  await expect(page.getByRole('heading', { name: corregido })).toBeVisible();

  // 2. Eliminarlo desde el LISTADO, que es donde estorban los planes de prueba.
  await page.goto('/plan');
  await expect(page.getByText(corregido)).toBeVisible();
  // El rotulo del boton lleva el ANO, que es lo que identifica al plan desde la Decision #71.
  await page.getByRole('button', { name: `Eliminar el plan de ${ANO_PLAN_DESECHABLE}` }).click();
  // En borrador el cajon no pide motivo: nunca obligo a nadie.
  await expect(page.getByText('Esta en borrador: nunca obligo a nadie', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar el plan' }).click();
  await expect(page.getByText('Plan eliminado')).toBeVisible();
  await expect(page.getByText(corregido)).toHaveCount(0);
});
