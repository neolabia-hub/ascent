import { expect, test } from '@playwright/test';
import { agregarEvaluacion, loginAsAdmin, unique } from './helpers';

/**
 * E2E del Sprint 2 (Definition of Done del catalogo formativo):
 * crear una actividad con leccion y evaluacion, publicarla, y comprobar que lo publicado
 * queda congelado y que editarlo nace como una version nueva sin tocar la anterior.
 */

test.describe('Sprint 2 — catalogo formativo', () => {
  /**
   * EL BANCO SIGUE EXISTIENDO, PERO YA NO ES UN SITIO AL QUE IR (Decision #84).
   *
   * Antes esta prueba entraba a la pestana "Banco de preguntas", creaba una categoria y una
   * pregunta. Esa pestana se retiro: nadie entra al modulo queriendo administrar un banco, y
   * exigir una categoria antes de la primera pregunta era un peaje.
   *
   * Lo que el banco de verdad garantiza sigue en pie y es lo que se prueba aqui: una pregunta
   * escrita DENTRO de una evaluacion queda guardada y se puede REUTILIZAR en otra.
   */
  test('una pregunta escrita en una evaluacion queda guardada y se reutiliza en otra', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();
    const enunciado = `Cada cuanto se inspecciona el arnes ${suffix}?`;

    // 1. Primera evaluacion: se escribe la pregunta ahi mismo.
    await page.goto('/evaluaciones');
    await page.getByRole('button', { name: 'Nueva evaluacion' }).first().click();
    await page.locator('#as-title').fill(`Origen E2E ${suffix}`);
    await page.getByRole('button', { name: 'Crear y empezar' }).click();
    await page.waitForURL('**/evaluaciones/**', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.getByRole('button', { name: 'Escribir pregunta' }).click();
    await page.getByLabel('Enunciado de la pregunta').fill(enunciado);
    await page.getByLabel('Texto de la opcion A').fill('Cada seis meses');
    await page.getByLabel('Texto de la opcion B').fill('Nunca');
    await page.getByRole('button', { name: 'Marcar la opcion A como correcta' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Evaluacion guardada')).toBeVisible({ timeout: 20_000 });

    // 2. Segunda evaluacion: la misma pregunta se trae del banco, sin volver a escribirla.
    await page.goto('/evaluaciones');
    await page.getByRole('button', { name: 'Nueva evaluacion' }).first().click();
    await page.locator('#as-title').fill(`Destino E2E ${suffix}`);
    await page.getByRole('button', { name: 'Crear y empezar' }).click();
    await page.waitForURL('**/evaluaciones/**', { timeout: 20_000 });

    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await page.getByRole('button', { name: /Traer una ya escrita|Reutilizar una/ }).click();
    await page.getByLabel('Buscar en el banco').fill(`arnes ${suffix}`);

    // Se VE entera antes de meterla: es lo que una lista de enunciados en un cajon no permitia.
    const enElBanco = page.getByRole('button').filter({ hasText: enunciado });
    await expect(enElBanco).toBeVisible({ timeout: 20_000 });
    await enElBanco.click();

    // Ya esta en la secuencia de ESTA evaluacion, sin haberla reescrito.
    await expect(page.getByRole('navigation').getByText(enunciado)).toBeVisible();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Evaluacion guardada')).toBeVisible({ timeout: 20_000 });
  });


  test('DoD: publicar congela la version y editarla crea la v2 sin tocar la v1', async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = unique();

    // 1. Leccion con dos tarjetas.
    await page.goto('/lecciones');
    await page.getByRole('button', { name: 'Nueva leccion' }).click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(`Bienvenida E2E ${suffix}`);
    await page.getByRole('button', { name: /Crear/ }).click();
    await page.waitForURL('**/lecciones/**', { timeout: 20_000 });

    // 2. Actividad formativa.
    await page.goto('/contenido-formativo');
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    await page.locator('#a-code-open').click();
    await page.locator('#a-code').fill(`E2E_${suffix}`);
    await page.locator('#a-name').fill(`Induccion E2E ${suffix}`);
    await page.locator('#a-type').selectOption({ label: 'Induccion general' });
    await page.locator('#a-process').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Crear actividad' }).click();
    await page.waitForURL('**/contenido-formativo/**', { timeout: 20_000 });

    // 3. Contenido: una leccion. La formacion es una ficha con pestanas; el contenido vive en la
    // suya (reestructuracion de la autoria, 2026-08-27).
    await page.getByRole('button', { name: 'Contenido', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar contenido' }).first().click();
    // Paso 1: se elige el TIPO en el selector de tarjetas (autoria reestructurada, 2026-08-27).
    await page.getByRole('button', { name: 'Leccion en tarjetas' }).click();
    await page.locator('#c-title').fill('Bienvenida');
    // Se resuelve el value real de la opcion: `label` no admite expresiones regulares y el
    // texto incluye el conteo de tarjetas.
    // Paso 2: se reutiliza una leccion de la biblioteca en vez de crear una nueva.
    await page.getByRole('radio', { name: /Traer una leccion ya creada|Traer de la biblioteca/ }).click();
    const lessonValue = await page
      .locator('#c-lesson option', { hasText: `Bienvenida E2E ${suffix}` })
      .first()
      .getAttribute('value');
    expect(lessonValue).toBeTruthy();
    await page.locator('#c-lesson').selectOption(lessonValue as string);
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('Contenido agregado')).toBeVisible();

    // El tipo de esta formacion pide evaluacion, y desde el 2026-09-04 publicar sin ella se rechaza.
    await agregarEvaluacion(page, `Examen S2 ${suffix}`);

    // 4. Publicar: congela.
    await page.getByRole('button', { name: 'Publicar cambios' }).click();
    await expect(page.getByText(/Publicar congela el contenido/)).toBeVisible();
    await page.getByRole('button', { name: 'Publicar y congelar' }).click();
    await expect(page.getByText('Version 1 publicada')).toBeVisible();

    // 5. La version publicada es inmutable: ya no se puede agregar contenido.
    // El rotulo cambio al reestructurar la ficha ("publicada e inmutable"): se afirma el concepto.
    await expect(page.getByText(/inmutable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar contenido' })).toHaveCount(0);

    // 6. Editar lo publicado crea la version 2 en borrador.
    await page.getByRole('button', { name: 'Editar el contenido' }).click();
    await expect(page.getByText('Version 2 creada en borrador')).toBeVisible();

    // El historial de versiones vive en su pestana desde la reestructuracion de la autoria.
    await page.getByRole('button', { name: 'Versiones', exact: true }).click();
    await expect(page.getByText('Version 2').first()).toBeVisible();

    // 7. La version 1 sigue publicada y con su contenido intacto.
    await page.getByText('Version 1', { exact: true }).click();
    await page.getByRole('button', { name: 'Contenido', exact: true }).click();
    await expect(page.getByText(/inmutable/)).toBeVisible();
    await expect(page.getByText('Bienvenida')).toBeVisible();
  });
});

/**
 * ARMAR UNA EVALUACION DESDE CERO, con el rail y el lienzo (Decision #84).
 *
 * Fija tres cosas que antes eran imposibles desde la interfaz:
 *
 *   - escribir la pregunta EN EL LIENZO, con la forma que tendra para quien la responda, sin un
 *     solo cajon lateral en el camino;
 *   - marcar la correcta pulsando su marca de 40 px, no un radio de 13;
 *   - poner una pregunta de COMPLETAR HUECOS (Decision #86), que es la que el cliente pidio y la
 *     que demuestra que el examen ya no es solo opcion multiple.
 *
 * Y comprueba la VISTA DEL EMPLEADO, que es lo unico que deja verificar antes de publicar que el
 * examen se entiende: usa el mismo componente que el reproductor real, asi que si se rompe aqui
 * se rompio tambien para quien lo rinde.
 */
test('una evaluacion se arma en el lienzo, con huecos, y se ve como la vera el empleado', async ({ page }) => {
  await loginAsAdmin(page);
  const suffix = unique();

  await page.goto('/evaluaciones');
  await page.getByRole('button', { name: 'Nueva evaluacion' }).first().click();
  await page.locator('#as-title').fill(`Examen E2E ${suffix}`);
  await page.getByRole('button', { name: 'Crear y empezar' }).click();

  // Crear una evaluacion lleva a SU pantalla, no abre un cajon encima de la lista.
  await page.waitForURL('**/evaluaciones/**', { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: `Examen E2E ${suffix}` })).toBeVisible();

  /*
    NO HAY "BORRADOR v1" NI "PUBLICAR" (Decision #87). La evaluacion dejo de tener versiones
    propias: se edita siempre, y lo que la pone en manos de la gente es publicar la FORMACION que
    la lleva. Sin preguntas no hay nada que guardar.
  */
  await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();

  // ── 1. Una de seleccion unica, escrita en el lienzo ──
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Escribir pregunta' }).click();
  await page.getByLabel('Enunciado de la pregunta').fill(`Ante un derrame ${suffix}, que se hace primero?`);
  await page.getByLabel('Texto de la opcion A').fill('Contener y avisar');
  await page.getByLabel('Texto de la opcion B').fill('Seguir trabajando');
  await page.getByRole('button', { name: 'Marcar la opcion A como correcta' }).click();

  // El rail la muestra ya, con su tipo y su puntaje, sin tener que guardar para verla.
  const rail = page.getByRole('navigation');
  await expect(rail.getByText(`Ante un derrame ${suffix}, que se hace primero?`)).toBeVisible();
  await expect(rail.getByText(/Seleccion unica · 1 pto/)).toBeVisible();

  // ── 2. Una de COMPLETAR HUECOS (Decision #86) ──
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Escribir pregunta' }).click();
  await page.locator('#ap-tipo').selectOption('FILL_BLANK');
  await page.getByLabel('Enunciado de la pregunta').fill(`El arnes ${suffix} se inspecciona cada {{1}}.`);
  await page.getByLabel('Respuesta 1 valida para el hueco 1').fill('seis meses');

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Evaluacion guardada')).toBeVisible({ timeout: 20_000 });

  // ── 3. LA VISTA DEL EMPLEADO: el mismo componente que el reproductor real ──
  await page.getByRole('button', { name: 'Vista del empleado' }).click();
  await expect(page.getByText('Pregunta 1 de 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ante un derrame/ })).toBeVisible();
  // La letra de la opcion: es lo que hace descubrible el atajo de teclado.
  await expect(page.getByRole('button', { name: /Contener y avisar/ })).toBeVisible();

  // El hueco se abre DENTRO de la frase, no como un campo suelto debajo.
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByLabel('Hueco 1')).toBeVisible();

  // ── 4. Al volver a abrirla, las dos preguntas siguen ahi y en su orden ──
  await page.reload();
  const railTrasRecargar = page.getByRole('navigation');
  await expect(railTrasRecargar.getByText(`Ante un derrame ${suffix}, que se hace primero?`)).toBeVisible({
    timeout: 20_000,
  });
  await expect(railTrasRecargar.getByText(/El arnes .* se inspecciona cada/)).toBeVisible();
});