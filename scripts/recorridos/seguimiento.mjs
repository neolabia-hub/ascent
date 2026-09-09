// ¿DICE EL SEGUIMIENTO LO MISMO QUE PASO?
//
// ─── POR QUE EXISTE ESTE ARCHIVO (2026-09-04) ───
//
// Los recorridos probaban el MOTOR: que la obligacion nace, que se cierra, que se cumple. Ninguno
// —salvo el de ciclos— miraba lo que el informe cuenta de todo eso. Y ahi estaba el fallo mas caro
// de la semana: el motor escribia NO REALIZADA y el Seguimiento lo leia como "sin empezar", ademas
// de contar 96.246 obligaciones retiradas como pendientes. El motor llevaba un dia correcto y el
// numero que ve el cliente llevaba un dia mintiendo.
//
// La leccion: **un estado no esta terminado cuando el motor lo escribe, sino cuando alguien lo
// lee**. Asi que ahora todos los recorridos cruzan las dos fuentes al terminar.
//
// ─── QUE COMPRUEBA ───
//
// No repite el criterio de estados —eso vive en `execution-state.ts` y tiene sus unitarias—. Cruza
// lo que hay en la BASE (por `/assignments`) contra lo que enseña el INFORME
// (`/reportes/actividades/:id/ejecucion`), que es justo lo que ninguna de las dos capas puede
// comprobar sola.
import { paso, ok, comprobar } from './api.mjs';

/** Obligaciones que ya no se le piden a nadie: no son incumplimiento y no entran al informe. */
const RETIRADAS = new Set(['WITHDRAWN_LEFT_AUDIENCE', 'WITHDRAWN_PLAN_ITEM_CANCELLED']);

/** Lo que el informe TIENE que decir de una obligacion, sabiendo solo su estado. */
const ESTADO_FORZOSO = {
  EXPIRED_NOT_DONE: 'NO_REALIZADA',
  WAIVED: 'EXIMIDA',
};

/**
 * Cruza el informe de una formacion contra sus obligaciones reales.
 *
 * @param admin        cliente de `api.mjs`, ya autenticado
 * @param activityId   la formacion
 * @param opciones.numeroDePaso  con que numero imprimir el paso
 * @param opciones.usuarioId     opcional: ademas comprueba que ESTA persona sale y con que estado
 * @param opciones.estadoEsperado opcional: el estado que se espera de esa persona
 */
export async function comprobarSeguimiento(admin, activityId, opciones = {}) {
  const { numeroDePaso = 99, usuarioId = null, estadoEsperado = null } = opciones;
  paso(numeroDePaso, 'EL SEGUIMIENTO: ¿dice el informe lo mismo que paso?');

  /*
    SE PAGINA A 100, QUE ES EL TOPE DEL SERVIDOR.

    Pedir 200 devuelve 422 y `items` llega vacio, asi que la comprobacion pasaba a comparar contra
    CERO y decia que el informe contaba retiradas cuando no era verdad. Es la tercera vez que este
    tope muerde en el proyecto (ver la nota de `listUsers` en la ficha de Quienes): el servidor topa
    en 100 y quien pide mas no recibe menos, recibe un error.
  */
  const obligaciones = [];
  for (let pagina = 1; pagina <= 40; pagina += 1) {
    const r = (await admin.get(`/assignments?targetId=${activityId}&page=${pagina}&pageSize=100`)).cuerpo;
    const items = r?.items ?? [];
    obligaciones.push(...items);
    if (items.length < 100 || obligaciones.length >= (r?.total ?? 0)) break;
  }
  const informe = (await admin.get(`/reportes/actividades/${activityId}/ejecucion`)).cuerpo;
  const filas = informe?.items ?? [];
  const resumen = informe?.resumen ?? {};

  const vivas = obligaciones.filter((a) => !RETIRADAS.has(a.status));
  const retiradas = obligaciones.length - vivas.length;
  console.log(
    `   ... en la base: ${obligaciones.length} obligacion(es) (${retiradas} retirada(s)) · en el informe: ${filas.length} fila(s), total=${resumen.total}`,
  );

  /*
    LO RETIRADO NO ENTRA. Es la Decision #144, y se comprueba aqui porque es donde se nota: si
    alguien vuelve a quitar el filtro, el total del informe se dispara y esta linea lo caza.

    Se compara con `<=` y no con `===` porque el informe ademas excluye a quien ya no trabaja en la
    empresa, y algunos recorridos dejan gente de corridas anteriores.
  */
  comprobar(
    resumen.total <= vivas.length,
    `lo RETIRADO no cuenta: ${retiradas} retirada(s) fuera del informe`,
    `el informe cuenta ${resumen.total} y solo hay ${vivas.length} obligaciones vivas: esta contando retiradas`,
  );
  comprobar(
    filas.length === resumen.total,
    'el resumen cuenta exactamente las filas que enseña',
    `enseña ${filas.length} filas y el resumen dice ${resumen.total}`,
  );

  /*
    LOS DOS ESTADOS TERMINALES QUE NO SE DEDUCEN DE LA INSCRIPCION. Son los que se leian como "sin
    empezar" —que dice justo lo contrario— hasta el 2026-09-04.
  */
  const porId = new Map(obligaciones.map((a) => [a.id, a]));
  const mal = [];
  for (const fila of filas) {
    const obligacion = porId.get(fila.assignmentId);
    const forzoso = obligacion ? ESTADO_FORZOSO[obligacion.status] : null;
    if (forzoso && fila.estado !== forzoso) mal.push(`${obligacion.status} -> "${fila.estado}" (deberia ser "${forzoso}")`);
    if (obligacion && RETIRADAS.has(obligacion.status)) mal.push(`una RETIRADA colada en el informe como "${fila.estado}"`);
  }
  comprobar(
    mal.length === 0,
    'cada estado terminal se lee como lo que es, no como "sin empezar"',
    `mal leidos: ${mal.slice(0, 3).join(' · ')}`,
  );

  /*
    EL AVANCE. Se recalcula aqui con la formula acordada —eximidas fuera del denominador— porque es
    EL numero de la pantalla, y un numero que nadie vuelve a calcular es un numero en el que hay
    que creer.
  */
  const exigibles = (resumen.total ?? 0) - (resumen.eximidas ?? 0);
  const esperado = exigibles <= 0 ? 0 : Math.round(((resumen.terminadas ?? 0) / exigibles) * 100);
  console.log(
    `   ... resumen: terminadas=${resumen.terminadas} atrasadas=${resumen.atrasadas} sinEmpezar=${resumen.sinEmpezar} noRealizadas=${resumen.noRealizadas} eximidas=${resumen.eximidas} esperando=${resumen.esperando} avance=${resumen.avancePct}%`,
  );
  comprobar(
    resumen.avancePct === esperado,
    `el avance cuadra: ${resumen.terminadas}/${exigibles} = ${esperado}%`,
    `el informe dice ${resumen.avancePct}% y la cuenta da ${esperado}%`,
  );

  const suma =
    (resumen.terminadas ?? 0) + (resumen.enCurso ?? 0) + (resumen.sinEmpezar ?? 0) + (resumen.atrasadas ?? 0) +
    (resumen.reprobadas ?? 0) + (resumen.esperando ?? 0) + (resumen.noRealizadas ?? 0) + (resumen.eximidas ?? 0);
  comprobar(
    suma === resumen.total,
    'y los estados suman el total: nadie se queda sin clasificar',
    `los estados suman ${suma} y el total es ${resumen.total}`,
  );

  if (usuarioId) {
    const suyas = filas.filter((f) => f.userId === usuarioId || f.user?.id === usuarioId);
    console.log(`   ... la persona del recorrido sale ${suyas.length} vez/veces: ${suyas.map((f) => f.estado).join(', ') || '—'}`);
    if (estadoEsperado) {
      comprobar(
        suyas.some((f) => f.estado === estadoEsperado),
        `y sale como "${estadoEsperado}", que es lo que hizo`,
        `sale como "${suyas.map((f) => f.estado).join(', ') || 'no sale'}" y deberia ser "${estadoEsperado}"`,
      );
    } else {
      ok(`la persona del recorrido aparece en el informe`);
    }
  }

  return { informe, obligaciones };
}
