import { expect, test } from '@playwright/test';
import { loginAsAdmin, unique } from './helpers';

/**
 * A QUIEN SE LE EXIGE, dicho desde la formacion y sin salir de ella.
 *
 * Cubre el camino que antes obligaba a recorrer tres pantallas y a aprenderse dos palabras que
 * no son del negocio (audiencia, requisito): ahora se marcan los cargos en la ficha y el sistema
 * decide por debajo si eso es una audiencia nueva o una que ya existia.
 *
 * Lo que de verdad se comprueba es que la regla OBLIGA: no basta con que la pantalla diga que se
 * guardo, tienen que aparecer las personas de ese cargo en "quienes la tienen que hacer".
 */
test.describe('Quienes, desde la ficha de la formacion', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('exigir una induccion especifica a un cargo obliga a quienes lo tienen', async ({ page }) => {
    const suffix = unique();

    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();

    // EL TIPO VA PRIMERO y cambia el resto: al elegirlo, la pantalla dice lo que implica antes
    // de crear nada.
    await page.locator('#a-type').selectOption({ label: 'Induccion especifica' });
    await expect(page.getByText('Se le exige a los cargos que la tengan en su matriz.')).toBeVisible();

    await page.locator('#a-code-open').click();
    await page.locator('#a-code').fill(`QUI_${suffix}`);
    await page.locator('#a-name').fill(`Manejo de cargas ${suffix}`);
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Quienes', exact: true }).click();

    // La induccion especifica pregunta por CARGOS y nada mas: no ofrece areas ni regionales,
    // porque en este tipo quien decide es la matriz de competencia.
    await expect(page.locator('#q-jobs')).toBeVisible();
    await expect(page.locator('#q-areas')).toHaveCount(0);

    await page.locator('#q-jobs').click();
    // Se elige el cargo del usuario de pruebas (Director de Gestion Humana): un cargo sin nadie
    // dentro guardaria la regla y no probaria lo unico que importa, que la obligacion NACE.
    await page.getByRole('option', { name: /Director de Gestion Humana/ }).click();
    await page.keyboard.press('Escape');

    // Y exige NOVEDAD: cambiar lo que se le exige a un cargo es algo que alguien tendra que
    // explicar en una auditoria.
    const guardar = page.getByRole('button', { name: 'Guardar a quien se le exige' });
    await expect(guardar).toBeDisabled();
    await page.locator('#q-novedad').fill('Se agrega por la matriz de competencia del cargo.');
    await expect(guardar).toBeEnabled();
    await guardar.click();

    // La regla queda dicha en una linea, con a cuanta gente alcanza.
    await expect(page.getByText(/alcanza a \d+ personas/).first()).toBeVisible({ timeout: 20_000 });

    // Y lo que de verdad importa: hay FILAS de obligacion, nacidas de la regla y no a mano.
    const obligaciones = page.locator('tbody tr').filter({ hasText: 'Requisito' });
    await expect(obligaciones.first()).toBeVisible({ timeout: 20_000 });

    // SE RETIRA AL TERMINAR, y no es limpieza cosmetica: mientras el requisito siga vigente
    // obliga a CADA persona que se cree despues con ese cargo, incluidas las de otras pruebas.
    // Dejarlo puesto hizo fallar a sprint-3, que crea una persona con este mismo cargo y esperaba
    // encontrarle una sola obligacion. Es la misma leccion que ya estaba escrita alli.
    await page.getByRole('button', { name: 'Retirar' }).first().click();
    await expect(page.getByText('Todavia no hay ninguna regla')).toBeVisible({ timeout: 20_000 });
    // La obligacion no se BORRA: queda RETIRADA. Un registro que el sistema borra solo es un
    // registro en el que no se puede confiar.
    await expect(obligaciones.first()).toContainText('RETIRADA', { timeout: 20_000 });
  });

  test('la induccion general no deja marcar a nadie: es de toda la empresa', async ({ page }) => {
    const suffix = unique();

    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    await page.locator('#a-type').selectOption({ label: 'Induccion general' });
    await page.locator('#a-code-open').click();
    await page.locator('#a-code').fill(`QUG_${suffix}`);
    await page.locator('#a-name').fill(`Induccion corporativa ${suffix}`);
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Quienes', exact: true }).click();

    // No hay listas que marcar: marcar a mano a la empresa entera solo puede salir mal.
    await expect(page.getByText('Es para toda la empresa')).toBeVisible();
    await expect(page.locator('#q-jobs')).toHaveCount(0);

    // Y todavia NO se exige: sin contenido publicado no se obliga a nadie. Ademas, siendo una
    // induccion de INGRESO, la pantalla dice a quien alcanzara —a los que entren, no a los que
    // ya estan— para que nadie se entere despues.
    await expect(page.getByText(/se exigira a quien entre desde ahora/)).toBeVisible();
  });

  test('publicar una induccion general la EXIGE sola, sin que nadie pulse nada', async ({ page }) => {
    const suffix = unique();

    // Una leccion para que la version tenga contenido y se pueda publicar.
    await page.goto('/lecciones');
    await page.getByRole('button', { name: 'Nueva leccion' }).click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(`Leccion auto ${suffix}`);
    await page.getByRole('button', { name: /Crear/ }).click();
    await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    await page.locator('#a-type').selectOption({ label: 'Induccion general' });
    await page.locator('#a-code-open').click();
    await page.locator('#a-code').fill(`AUTO_${suffix}`);
    await page.locator('#a-name').fill(`Induccion automatica ${suffix}`);
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Contenido', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
    await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
    await page.locator('#c-title').fill('Bienvenida');
    // Se reutiliza la leccion de la biblioteca, igual que en sprint-3.
    await page.getByRole('radio', { name: 'Traer de la biblioteca' }).click();
    const lessonValue = await page
      .locator('#c-lesson option', { hasText: `Leccion auto ${suffix}` })
      .first()
      .getAttribute('value');
    await page.locator('#c-lesson').selectOption(lessonValue as string);
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('Contenido agregado')).toBeVisible({ timeout: 20_000 });

    // PUBLICAR es el acto que la exige. Nadie pulsa nada mas.
    await page.getByRole('button', { name: /Publicar cambios/ }).click();
    await page.getByRole('button', { name: 'Publicar y congelar' }).click();
    await expect(page.getByText('Version 1 publicada')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Quienes', exact: true }).click();
    await expect(page.getByText('Ya se le exige a toda la empresa')).toBeVisible({ timeout: 20_000 });
    // Y el boton de confirmar lo obvio ya no esta: lo que queda es retirarla.
    await expect(page.getByRole('button', { name: 'Exigirla a toda la empresa' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retirar' }).first()).toBeVisible();

    // Se retira al terminar: si no, obliga a cada persona que otra prueba cree despues.
    await page.getByRole('button', { name: 'Retirar' }).first().click();
    await expect(page.getByText('Todavia no hay ninguna regla')).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * UNA CAPACITACION DEL PLAN NO PREGUNTA CUANDO VENCE (Decision #76).
 *
 * Es la prueba de que quitar tres campos no dejo un hueco. Lo que se comprueba no es que la
 * pantalla se vea distinta —eso seria cosmetica— sino las dos consecuencias que importan:
 *
 *   1. no se pregunta el plazo ni la recurrencia, porque no significan nada aqui: una capacitacion
 *      del plan vence el ultimo dia del mes que diga su renglon, y la del ano que viene es otro
 *      plan, no otra ronda de esta;
 *   2. y **no nace ninguna obligacion al guardar**. Antes nacia una por persona, y despues el plan
 *      creaba OTRA al aprobarse: cada quien acababa con dos obligaciones de la misma formacion,
 *      con dos vencimientos que competian.
 */
test('la capacitacion del plan solo pregunta a quienes: ni plazo, ni recurrencia, ni obligaciones', async ({
  page,
}) => {
  await loginAsAdmin(page);
  const suffix = unique();

  await page.goto('/contenido-formativo');
  await page.getByRole('button', { name: 'Nueva actividad' }).click();
  await page.locator('#a-type').selectOption({ label: 'Capacitacion del plan' });
  await expect(page.getByText('Cuenta para los indicadores del plan anual.')).toBeVisible();

  await page.locator('#a-code-open').click();
  await page.locator('#a-code').fill(`PLA_${suffix}`);
  await page.locator('#a-name').fill(`Capacitacion del plan ${suffix}`);
  await page.locator('#a-process').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Quienes', exact: true }).click();

  // 1. El alcance SI se pregunta: en el plan, a quienes lo decide el analista.
  await expect(page.locator('#q-jobs')).toBeVisible();

  // Y el plazo, el disparador y la recurrencia NO estan. No basta con que esten ocultos por CSS:
  // si el campo existe, el formulario lo manda y el usuario cree que hace algo.
  await expect(page.locator('#q-trigger')).toHaveCount(0);
  await expect(page.locator('#q-dias')).toHaveCount(0);
  await expect(page.locator('#q-repite-modo')).toHaveCount(0);

  // En su lugar se dice de donde sale la fecha, que es la pregunta que esos campos dejan abierta.
  await expect(page.getByText(/El vencimiento lo pone el mes/)).toBeVisible();

  await page.locator('#q-jobs').click();
  await page.getByRole('option', { name: /Director de Gestion Humana/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Guardar a quien se le exige' }).click();

  // 2. Lo que de verdad importa: se guardo el alcance y NO nacio ninguna obligacion.
  await expect(page.getByText(/quedan en el alcance/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('el vencimiento lo pone el mes en el plan').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('tbody tr').filter({ hasText: 'Requisito' })).toHaveCount(0);

  // Se retira al terminar: un requisito vivo de una prueba envenena a las siguientes.
  await page.getByRole('button', { name: 'Retirar' }).first().click();
  await expect(page.getByText('Todavia no hay ninguna regla')).toBeVisible({ timeout: 20_000 });
});
