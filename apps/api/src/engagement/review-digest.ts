/**
 * EL AVISO DE REPASO (`PENDIENTES` 5.1).
 *
 * ─── EL PROBLEMA QUE CIERRA ───
 *
 * El motor de repeticion espaciada existe desde el Sprint 4 (Decision #22) y la pantalla de Repaso
 * ya lo enseña, pero nada avisa cuando algo VUELVE a estar vencido — hay que acordarse de entrar.
 * Es el mismo argumento que ya resolvio el aviso de Vencimientos para quien administra
 * (`expiration-digest.ts`), aplicado esta vez a quien cursa.
 *
 * ─── POR QUE NOMBRA UN TEMA, y no solo un numero ───
 *
 * "Tienes 4 preguntas pendientes" no dice nada que la persona pueda usar. "Tienes 4 preguntas de
 * Seguridad vial pendientes" si: le dice EN QUE anda flojo, que es justo lo que se pidio en
 * `PENDIENTES` 5.1 ("avisar segun lo que cada quien fallo"). El tema con mas preguntas vencidas es
 * el que se nombra; si hay empate, el que tiene la pregunta MAS ANTIGUA esperando, porque esa es la
 * que mas tiempo lleva sin corregirse.
 *
 * Una pregunta sin tema (Decision #84: el tema es opcional) cuenta en el total pero no en el
 * desglose — no se puede nombrar lo que no existe, y eso esta bien.
 *
 * Vive separado del servicio por lo mismo que `expiration-digest.ts`: se puede probar el texto sin
 * base de datos ni reloj.
 */

export interface PreguntaVencida {
  /** `null` si la pregunta no tiene tema asignado (Decision #84: es opcional). */
  tema: string | null;
  dueAt: Date;
}

export interface TemaConCuantas {
  tema: string;
  cuantas: number;
}

export interface ResumenDeRepaso {
  total: number;
  /** Ordenados de mas a menos vencidas. Vacio si todas las preguntas vencidas son sin tema. */
  porTema: TemaConCuantas[];
}

export function resumirParaElAvisoDeRepaso(preguntas: readonly PreguntaVencida[]): ResumenDeRepaso {
  const cuentaPorTema = new Map<string, number>();
  const masAntiguaPorTema = new Map<string, number>();

  for (const pregunta of preguntas) {
    if (!pregunta.tema) continue;
    cuentaPorTema.set(pregunta.tema, (cuentaPorTema.get(pregunta.tema) ?? 0) + 1);
    const antigua = masAntiguaPorTema.get(pregunta.tema);
    const tiempo = pregunta.dueAt.getTime();
    if (antigua === undefined || tiempo < antigua) masAntiguaPorTema.set(pregunta.tema, tiempo);
  }

  const porTema = [...cuentaPorTema.entries()]
    .map(([tema, cuantas]) => ({ tema, cuantas }))
    .sort((a, b) => {
      if (b.cuantas !== a.cuantas) return b.cuantas - a.cuantas;
      // Empate: manda la que lleva mas tiempo esperando.
      return (masAntiguaPorTema.get(a.tema) ?? 0) - (masAntiguaPorTema.get(b.tema) ?? 0);
    });

  return { total: preguntas.length, porTema };
}

function plural(cuantos: number, singular: string, muchos: string): string {
  return `${cuantos} ${cuantos === 1 ? singular : muchos}`;
}

/**
 * EL TEXTO DEL AVISO, o `null` cuando no hay nada que decir (por debajo del umbral del tenant, o
 * sin preguntas vencidas). El umbral se aplica AQUI y no antes: quien llama ya trae el resumen
 * completo, y es esta funcion la que decide si vale la pena interrumpir.
 */
export function redactarAvisoDeRepaso(
  resumen: ResumenDeRepaso,
  minimo: number,
): { subject: string; body: string } | null {
  if (minimo === 0 || resumen.total < minimo) return null;

  const principal = resumen.porTema[0] ?? null;
  const preguntas = plural(resumen.total, 'pregunta', 'preguntas');

  if (!principal) {
    // Todas las vencidas son de preguntas sin tema: se avisa igual, sin fingir un desglose.
    return {
      subject: `${preguntas} esperando repaso`,
      body: `Tienes ${preguntas} esperando repaso. Cinco minutos y quedan al día.`,
    };
  }

  const subject =
    resumen.porTema.length === 1
      ? `${plural(principal.cuantas, 'pregunta', 'preguntas')} de ${principal.tema} esperando repaso`
      : `${preguntas} esperando repaso, la mayoría de ${principal.tema}`;

  return {
    subject,
    body: `Tienes ${preguntas} esperando repaso. Donde más te falla: ${principal.tema} (${principal.cuantas}). Cinco minutos y quedan al día.`,
  };
}
