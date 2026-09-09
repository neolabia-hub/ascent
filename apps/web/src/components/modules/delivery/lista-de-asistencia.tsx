'use client';

import { Check, ClipboardList, FileText, Pencil, Search, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  marcarAsistencia,
  type AsistenciaEstado,
  type CertificadoExterno,
  type RosterRow,
} from '@/lib/delivery-api';
import { Adjuntar } from '@/components/ui/adjuntar';
import { Button } from '@/components/ui/button';
import { Ayuda } from '@/components/ui/ayuda';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePaginacion } from '@/components/ui/use-paginacion';
import { useToast } from '@/components/ui/toast';

type FiltroEstado = 'todos' | 'pendientes' | 'asistieron' | 'no-asistieron';

const OPCIONES_FILTRO: ReadonlyArray<SegmentedOption<FiltroEstado>> = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'asistieron', label: 'Asistieron' },
  { value: 'no-asistieron', label: 'No asistieron' },
];

/*
  TRES ICONOS, EL COLOR DE LA EMPRESA, Y 96 PIXELES EN VEZ DE 213 (2026-09-06).

  Este control ha pasado por tres formas en un dia, y las tres razones estan aqui porque la cuarta
  vez que alguien quiera cambiarlo conviene saber que ya se probo:

  1. Era un `<select>`. Costaba dos gestos por persona y no se podia leer la lista de un vistazo.
  2. Paso a tres botones con rotulo y con el color del SIGNIFICADO —verde, ambar, azul—. Se leia de
     maravilla y ocupaba 213 px: con la columna de motivo y las dos del certificado, la tabla se
     estrujaba hasta partir "Auxiliar de Bodega" en cuatro renglones.
  3. Ahora son tres ICONOS, con el color de la empresa. 96 px, un solo gesto, y la columna de al
     lado recupera lo que le sobraba.

  Lo que cuesta un icono es que hay que aprenderlo, y eso se paga una vez: la leyenda vive en el
  icono de informacion de la CABECERA de su columna —ver ahi la nota de por que acabo en ese sitio y
  no en otros dos que se probaron—, y cada boton lleva su globo del raton y su nombre para lectores
  de pantalla. El visto y la equis, ademas, no hay que aprenderlos.

  Y lo que se perdio al dejar el color del significado lo siguen diciendo dos cosas que ya estaban:
  el nombre de quien no asistio sale en gris, y el contador dice "2 de 3 asistieron".
*/
const OPCIONES_ASISTENCIA: ReadonlyArray<SegmentedOption<AsistenciaEstado>> = [
  { value: 'PRESENT', label: 'Asistio', icon: Check },
  { value: 'ABSENT', label: 'No asistio', icon: X },
  { value: 'JUSTIFIED', label: 'Justificada', srLabel: 'Falta justificada', icon: FileText },
];

/**
 * LOS INSCRITOS, Y TOMAR SU ASISTENCIA — UNA SOLA TABLA CON DOS MODOS (Decision #157).
 *
 * ─── POR QUE UNA Y NO DOS ───
 *
 * Habia dos tarjetas con la MISMA gente: "Inscritos" y, al pulsar el boton, otra lista casi igual
 * debajo. Lo noto el cliente —*"¿no es redundante?"*— y tenia razon a medias: la informacion no era
 * la misma (una decia el origen y el estado, la otra pedia la marca), pero **la gente si**, y dos
 * tablas de las mismas personas obligan a mirar dos veces para responder una pregunta.
 *
 * MIRAR enseña quien esta y como consta lo suyo; TOMAR ASISTENCIA, las mismas filas con lo que hay
 * que marcar. **No se pierde ni una columna de las que habia** —persona, cargo, area, origen y
 * estado siguen todas— porque eso era justo lo que no se podia sacrificar al juntarlas.
 *
 * ─── POR QUE HACIA FALTA TOMAR ASISTENCIA ───
 *
 * Hasta el 2026-09-05 una formacion solo se daba por cumplida de UNA forma: la persona entrando a
 * la plataforma y completando el contenido. En una empresa bajo SG-SST buena parte del plan se
 * dicta en salon, y de eso no queda contenido que completar: queda una hoja firmada.
 *
 * ─── DONDE APARECE ───
 *
 * `admiteAsistencia` viene RESUELTO del servidor (`cierre-de-la-jornada.ts`) y esta pantalla no
 * repite la condicion. Cambio dos veces en dos dias, y una condicion que ya cambio dos veces es
 * justo la que no puede vivir en dos sitios.
 *
 * ─── LO QUE SE DECIDIO PARA QUE NO SEA UN TRABAJO DE CHINOS ───
 *
 *   1. Todos empiezan como PRESENTE: en una lista de cuarenta se cambian tres, no se marcan 37.
 *   2. La fecha viene de la JORNADA, no de hoy: se toma asistencia al dia siguiente muchas veces.
 *   3. **Todos asistieron / Nadie asistio** para la lista entera.
 *   4. El EMISOR del certificado sale de quien dicta la jornada; lo unico propio de cada persona es
 *      su NUMERO. Y el vencimiento se pone una vez y se reparte.
 *   5. El motivo de la falta **solo existe en la fila justificada**: primero fue una columna que
 *      salia si habia alguna, y ahora ni eso — es un panel, y la tabla se ahorra la columna.
 *
 * ─── LO QUE PIDIO EL CLIENTE MIRANDO LA PANTALLA (2026-09-06) ───
 *
 * Todo lo de abajo salio de mirar la pantalla con el, y el hilo comun de sus cuatro comentarios es
 * el mismo: **la tabla no puede crecer a lo ancho**. Cada pieza de esta pantalla se gano su sitio.
 *
 *   6. **Tres iconos, no un desplegable ni tres botones con rotulo** (ver `OPCIONES_ASISTENCIA`):
 *      un gesto por persona y 96 px en vez de 213.
 *   7. **Los ya cumplidos se quedan, y se les corrige el papel.** Ver la nota de `corregibles`.
 *   8. **Los que faltan por revisar van primero.** Ver la nota de `ordenadas`.
 *   9. **Buscador a la vista y los filtros plegados** detras de un boton con su cuenta. Ver la nota
 *      de `barraDeFiltro`.
 *  10. **La leyenda y las advertencias, en la cabecera de la columna Asistencia**: no ocupan nada
 *      mientras nadie pregunte. Estuvieron encima de la tabla y al pie antes de acabar ahi.
 */
/**
 * Cómo quedó marcada cada persona. Los tres mecanismos escriben en la misma tabla y solo cambian de
 * método (CLAUDE.md §3.7); esto es lo que traduce el dato a la palabra que se lee.
 */
const COMO_SE_MARCO: Record<'INSTRUCTOR' | 'QR' | 'SIGNATURE', string> = {
  INSTRUCTOR: 'Marcada en la lista',
  QR: 'Escaneó el código',
  SIGNATURE: 'Firmó en pantalla',
};

export function ListaDeAsistencia({
  offeringId,
  roster,
  admiteAsistencia,
  puedeInscribir,
  pideCertificado,
  quienLaDicto,
  fechaDeLaJornada,
  onHecho,
}: {
  offeringId: string;
  roster: RosterRow[];
  /** Resuelto por el servidor: si esta jornada se cierra con lista o con la plataforma. */
  admiteAsistencia: boolean;
  /** Para el mensaje de la lista vacia: si ya se puede convocar o todavia hay que publicar. */
  puedeInscribir: boolean;
  pideCertificado: boolean;
  /** Quien la dicta ("ARL Sura"): el emisor por defecto, para no teclearlo por cabeza. */
  quienLaDicto: string;
  fechaDeLaJornada: string | null;
  onHecho: () => void;
}) {
  const { showToast } = useToast();
  const [tomando, setTomando] = useState(false);
  const [busy, setBusy] = useState(false);
  // La fecha de la JORNADA, no la de hoy: se toma asistencia al dia siguiente mas veces de las que
  // se toma en el salon, y fechar el cumplimiento el dia que se teclea es fecharlo mal.
  const [heldOn, setHeldOn] = useState(() => (fechaDeLaJornada ?? new Date().toISOString()).slice(0, 10));

  const [estados, setEstados] = useState<Record<string, AsistenciaEstado>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [papeles, setPapeles] = useState<Record<string, CertificadoExterno>>({});
  const [vencePorLote, setVencePorLote] = useState('');
  /*
    EL ACTA DE LA JORNADA, y los nombres de los archivos adjuntos.

    El acta es UNA por jornada —la hoja con las cuarenta firmas— y por eso vive aqui y no en la fila
    de nadie. Trocearla por persona seria inventar un documento que no existe. El papel de un
    tercero, en cambio, SI es de cada quien y va en su fila.

    Los nombres se guardan aparte de las claves porque el servidor solo devuelve la clave: sin el
    nombre, el boton diria "Adjunto" a secas y quien sube dos papeles seguidos no sabria cual es cual.
  */
  const [acta, setActa] = useState<{ key: string; nombre: string } | null>(null);
  const [nombresDePapel, setNombresDePapel] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  // '' = sin acotar. Por cargo y por area, que son las otras dos columnas de la tabla y la forma
  // en que de verdad se busca a alguien cuando la jornada junta a cuarenta de tres areas.
  const [filtroCargo, setFiltroCargo] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  /** A que fila hay que llevarle el foco al abrir su panel de motivo. */
  const [enfocarMotivo, setEnfocarMotivo] = useState<string | null>(null);

  /** Quien todavia no tiene su formacion cerrada: son los que hay que marcar. */
  const porRevisar = useMemo(() => roster.filter((fila) => !fila.completedAt), [roster]);
  /** Y quien ya la tiene. Ya no desaparecen de la lista (punto 7). */
  const yaCumplidas = useMemo(() => roster.filter((fila) => fila.completedAt), [roster]);

  /*
    QUE SE LE PUEDE CORREGIR A ALGUIEN YA CUMPLIDO, Y QUE NO (punto 7, decidido el 2026-09-06).

    SU PAPEL, SI. Llego el certificado quince dias despues de la jornada, o el numero estaba mal.
    El servidor ya estaba listo para esto: `cerrarPorAsistencia` ve que la inscripcion ya esta
    cerrada y entonces NO reabre nada, NO vuelve a cerrar la obligacion, NO emite una segunda
    constancia y NO repite el evento de aprendizaje. Solo escribe los campos del certificado.

    SU ASISTENCIA, NO. Mandar AUSENTE a alguien ya cumplido no pasa por esa funcion: escribiria
    "no asistio" en `attendance_records` y le dejaria la formacion CUMPLIDA y la constancia
    EMITIDA. El acta diria una cosa y el expediente la contraria. Una pantalla no puede ofrecer un
    cambio que no ocurre, asi que aqui su estado es texto. Deshacerlo de verdad es ANULAR
    —reabrir, revocar la constancia y devolver la obligacion—, que es otra cosa y no existe aun.

    Y solo a quien consta por ASISTENCIA. A quien cerro en la plataforma no se le tocan estos
    campos: mandarlo escribiria una marca diciendo que estuvo en un salon donde no estuvo.
  */
  const corregibles = useMemo(
    () => (pideCertificado ? yaCumplidas.filter((fila) => fila.attendanceStatus === 'PRESENT') : []),
    [pideCertificado, yaCumplidas],
  );

  /** El papel tal y como esta GUARDADO: contra esto se decide si de verdad hubo correccion. */
  function papelGuardado(fila: RosterRow): CertificadoExterno {
    return {
      number: fila.extCertNumber ?? '',
      validUntil: fila.extCertValidUntil ? fila.extCertValidUntil.slice(0, 10) : '',
      // El escaneo tambien se siembra: sin esto, reabrir la lista enseñaba el boton de adjuntar
      // como si no hubiera nada subido, y quien lo mirara volveria a subirlo.
      ...(fila.extCertFileKey ? { fileKey: fila.extCertFileKey } : {}),
    };
  }

  /*
    AL ABRIR SE SIEMBRA CON LO QUE YA CONSTA, no con los valores por defecto.

    Antes se entraba siempre con todo el mundo en "Asistio", y a quien ya se habia marcado AUSENTE
    en una pasada anterior la pantalla le decia lo contrario de lo guardado; al guardar sin tocar
    nada se le cambiaba la marca sin que nadie lo pidiera.

    La siembra va en esta funcion y no en un `useState` inicial porque `roster` se recarga despues
    de cada guardado: un inicializador solo corre la primera vez y la segunda pasada abriria con
    datos viejos.
  */
  function abrirToma() {
    setEstados(Object.fromEntries(porRevisar.map((fila) => [fila.id, fila.attendanceStatus ?? 'PRESENT'])));
    setMotivos(
      Object.fromEntries(
        porRevisar.filter((fila) => fila.attendanceNote).map((fila) => [fila.id, fila.attendanceNote ?? '']),
      ),
    );
    setPapeles(Object.fromEntries(corregibles.map((fila) => [fila.id, papelGuardado(fila)])));
    setActa(null);
    setNombresDePapel({});
    setBusca('');
    setFiltro('todos');
    setFiltroCargo('');
    setFiltroArea('');
    setTomando(true);
  }

  const estadoDe = (id: string): AsistenciaEstado => estados[id] ?? 'PRESENT';
  const papel = (id: string): CertificadoExterno => papeles[id] ?? { number: '' };
  const presentes = porRevisar.filter((fila) => estadoDe(fila.id) === 'PRESENT').length;

  /** Una justificacion sin motivo no justifica nada: cinco caracteres es el minimo del servidor. */
  const motivoIncompleto = (id: string) =>
    estadoDe(id) === 'JUSTIFIED' && (motivos[id] ?? '').trim().length < 5;
  const faltaMotivo = porRevisar.some((fila) => motivoIncompleto(fila.id));

  /**
   * Los ya cumplidos a los que se les toco el papel: es lo unico suyo que viaja al servidor.
   *
   * EL ESCANEO CUENTA COMO CAMBIO (corregido el 2026-09-08, lo cazo el cliente). Se comparaban solo
   * el numero y la fecha, asi que adjuntar el certificado de alguien que ya tenia su numero puesto no
   * era "una correccion": el boton se quedaba en «Guardar 0 correccion(es)», deshabilitado, y el
   * archivo subido se perdia al cerrar la lista. Un adjunto que no se puede guardar es peor que no
   * poder adjuntarlo.
   */
  const correcciones = corregibles.filter((fila) => {
    const antes = papelGuardado(fila);
    const ahora = papel(fila.id);
    return (
      (ahora.number ?? '').trim() !== antes.number ||
      (ahora.validUntil ?? '') !== antes.validUntil ||
      (ahora.fileKey ?? null) !== (antes.fileKey ?? null)
    );
  });

  /*
    Y SI HAY PAPEL SIN NUMERO, SE DICE. El servidor exige el numero —un certificado sin numero no se
    puede rastrear— asi que adjuntar el escaneo y dejar el numero en blanco no se puede guardar. Lo
    que no vale es un boton apagado sin explicacion: quien acaba de subir el archivo no tiene forma
    de adivinar que le falta.
  */
  const papelSinNumero = [...porRevisar, ...corregibles].some((fila) => {
    const p = papel(fila.id);
    return Boolean(p.fileKey ?? p.validUntil) && !(p.number ?? '').trim();
  });

  function todos(estado: AsistenciaEstado) {
    setEstados(Object.fromEntries(porRevisar.map((fila) => [fila.id, estado])));
  }

  /**
   * La misma fecha de vencimiento para todos: es individual en el modelo —cada certificado es de una
   * persona— pero en la practica es la misma para toda la jornada. Escribirla veinte veces es
   * teclear veinte veces el mismo dato, y a la decima alguien pone otro año.
   */
  function repartirVencimiento() {
    if (!vencePorLote) return;
    setPapeles((previos) =>
      Object.fromEntries(
        porRevisar.map((fila) => [fila.id, { ...(previos[fila.id] ?? { number: '' }), validUntil: vencePorLote }]),
      ),
    );
  }

  async function guardar() {
    setBusy(true);
    try {
      /*
        SE MANDA LA LISTA ENTERA, NO LA FILTRADA.

        El filtro y el buscador son para MIRAR. Si al guardar se mandara solo lo visible, buscar a
        una persona antes de pulsar el boton dejaria a las otras treinta y nueve sin marcar, y eso
        se descubriria semanas despues en una auditoria. Filtrar no puede cambiar lo que se guarda.
      */
      const resultado = await marcarAsistencia(offeringId, {
        heldOn,
        ...(acta ? { attendanceSheetKey: acta.key } : {}),
        items: [
          ...porRevisar.map((fila) => {
            const estado = estadoDe(fila.id);
            const p = papel(fila.id);
            const tienePapel = pideCertificado && estado === 'PRESENT' && p.number.trim();
            return {
              enrollmentId: fila.id,
              estado,
              ...(estado === 'JUSTIFIED' ? { motivo: (motivos[fila.id] ?? '').trim() } : {}),
              ...(tienePapel
                ? {
                    certificate: {
                      number: p.number.trim(),
                      ...(p.validUntil ? { validUntil: p.validUntil } : {}),
                      ...(p.fileKey ? { fileKey: p.fileKey } : {}),
                    },
                  }
                : {}),
            };
          }),
          // Los ya cumplidos van con PRESENT —que es lo que YA consta de ellos, no un cambio— y
          // solo si se les toco el papel. El servidor ve la inscripcion cerrada y escribe
          // unicamente el certificado. Ver la nota de `corregibles`.
          ...correcciones.map((fila) => {
            const p = papel(fila.id);
            return {
              enrollmentId: fila.id,
              estado: 'PRESENT' as AsistenciaEstado,
              certificate: {
                number: p.number.trim(),
                ...(p.validUntil ? { validUntil: p.validUntil } : {}),
                ...(p.fileKey ? { fileKey: p.fileKey } : {}),
              },
            };
          }),
        ],
      });
      const corregidas = correcciones.length;
      showToast({
        kind: 'success',
        title:
          porRevisar.length > 0
            ? `${resultado.cerradas} formacion(es) dada(s) por cumplida(s)`
            : `${corregidas} certificado(s) corregido(s)`,
        description: [
          resultado.ausentes > 0
            ? `${resultado.ausentes} no asistieron (${resultado.justificados} con justificacion) y la siguen debiendo.`
            : porRevisar.length > 0
              ? 'Asistieron todos los convocados.'
              : '',
          porRevisar.length > 0 && corregidas > 0 ? `Y ${corregidas} certificado(s) corregido(s).` : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      setTomando(false);
      onHecho();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar la asistencia',
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  /** COMO CONSTA lo suyo, que dice mas que "completada": por asistencia o por la plataforma. */
  const comoConsta = (fila: RosterRow): { kind: StatusPillKind; label: string } => {
    if (fila.completedAt) {
      return { kind: 'ok', label: fila.attendanceStatus === 'PRESENT' ? 'ASISTIO' : 'EN PLATAFORMA' };
    }
    if (fila.attendanceStatus === 'JUSTIFIED') return { kind: 'info', label: 'FALTA JUSTIFICADA' };
    if (fila.attendanceStatus === 'ABSENT') return { kind: 'warn', label: 'NO ASISTIO' };
    return { kind: 'neutral', label: 'INSCRITO' };
  };

  /*
    LOS QUE FALTAN POR REVISAR, PRIMERO (punto 8).

    Con veinte ya cerrados arriba, encontrar a los tres que faltan es el trabajo. Dentro de cada
    grupo se respeta el orden que trae el servidor, que es el que la persona acaba de ver en
    "Inscritos": reordenar tambien por dentro obligaria a buscar a cada quien otra vez.
  */
  const ordenadas = useMemo(() => [...porRevisar, ...yaCumplidas], [porRevisar, yaCumplidas]);

  /** El filtro de estado, el mismo en los dos modos: es la misma pregunta en los dos. */
  function cumpleFiltro(fila: RosterRow): boolean {
    if (filtro === 'todos') return true;
    if (filtro === 'pendientes') return !fila.completedAt;
    const estado = fila.completedAt ? 'PRESENT' : tomando ? estadoDe(fila.id) : fila.attendanceStatus;
    if (filtro === 'asistieron') return estado === 'PRESENT';
    return estado === 'ABSENT' || estado === 'JUSTIFIED';
  }

  function filtrar(filas: RosterRow[]): RosterRow[] {
    const q = busca.trim().toLowerCase();
    return filas.filter(
      (fila) =>
        cumpleFiltro(fila) &&
        (filtroCargo === '' || fila.user.jobTitle.name === filtroCargo) &&
        (filtroArea === '' || fila.user.area.name === filtroArea) &&
        (q === '' ||
          fila.user.fullName.toLowerCase().includes(q) ||
          fila.user.documentNumber.toLowerCase().includes(q)),
    );
  }

  const filtradasTomando = filtrar(ordenadas);
  const filtradasMirando = filtrar(roster);

  /*
    PAGINAS DE QUINCE. La mecanica es de `usePaginacion`, compartida con el resto de las tablas.

    Aqui importa una cosa que en las demas no: **paginar es MIRAR**. `guardar` manda `porRevisar`
    ENTERO y no lo visible — si mandara la pagina, tomar asistencia a cuarenta personas dejaria a
    veinticinco sin marcar y el fallo apareceria semanas despues en una auditoria. Y "Todos
    asistieron" marca la lista completa por lo mismo. Ver la nota de `guardar`.
  */
  const { visibles: visiblesTomando, paginador: paginadorTomando } = usePaginacion(filtradasTomando);
  const { visibles: visiblesMirando, paginador: paginadorMirando } = usePaginacion(filtradasMirando);

  /*
    LOS FILTROS SE ENSENAN SOLOS CUANDO SIRVEN, Y NO ANTES.

    Los cargos y las areas salen de la LISTA, no del catalogo de la empresa: ofrecer los treinta
    cargos del tenant en una jornada donde hay dos es ofrecer veintiocho filtros que dejan la tabla
    vacia. Y si en esta jornada solo hay un cargo, su filtro no aparece — un desplegable con una
    sola opcion no filtra nada, solo ocupa sitio.

    Por eso no hay un numero magico de personas a partir del cual sale la barra: sale cuando hay mas
    de una persona, y cada filtro decide por su cuenta si aporta.
  */
  const cargos = useMemo(
    () => [...new Set(roster.map((fila) => fila.user.jobTitle.name))].sort((a, b) => a.localeCompare(b)),
    [roster],
  );
  const areas = useMemo(
    () => [...new Set(roster.map((fila) => fila.user.area.name))].sort((a, b) => a.localeCompare(b)),
    [roster],
  );
  const hayQueFiltrar = roster.length > 1;

  const puedeAbrir = admiteAsistencia && (porRevisar.length > 0 || corregibles.length > 0);
  const hayAlgoQueGuardar = porRevisar.length > 0 || correcciones.length > 0;

  /** Cuantos filtros hay puestos. Es lo que va en la pastilla del boton. */
  const filtrosPuestos = (filtro !== 'todos' ? 1 : 0) + (filtroCargo ? 1 : 0) + (filtroArea ? 1 : 0);

  function limpiarFiltros() {
    setFiltro('todos');
    setFiltroCargo('');
    setFiltroArea('');
  }

  /*
    UNA SOLA FILA: BUSCAR Y TRES DESPLEGABLES IGUALES (2026-09-06).

    ─── LOS TRES INTENTOS QUE HUBO ANTES ───

      1. Buscador + pastillas de estado + dos desplegables, todo desplegado. Demasiada herramienta
         encima de una tabla que casi siempre se mira sin filtrar.
      2. Buscador + un boton "Filtros" que abria una caja con borde propio debajo. El cliente:
         *"no se ven bien"* — dos rectangulos con dos bordes para una sola herramienta.
      3. La misma caja, ya sin borde, dentro de la franja. Seguian siendo dos alturas y un boton
         que abre y cierra para llegar a tres controles.

    ─── Y LA QUE SE QUEDA ───

    Una fila. Buscador, y a su lado los tres filtros como TRES DESPLEGABLES DEL MISMO ALTO Y LA
    MISMA FORMA. Fuera el boton que ocultaba: ocultar tres controles detras de un cuarto solo tiene
    sentido cuando son muchos, y son tres.

    El estado deja de ser un grupo de pastillas y pasa a desplegable por eso mismo — no porque las
    pastillas estuvieran mal, sino porque **cuatro pastillas al lado de dos desplegables son dos
    lenguajes para la misma clase de decision**. Tres controles iguales se leen de un vistazo como
    "aqui se acota la lista"; uno distinto obliga a mirar cada uno.

    Y cada filtro sigue decidiendo por su cuenta si aparece: el de cargo no sale si en esta jornada
    todos tienen el mismo, el de area igual. Un desplegable con una sola opcion no filtra nada.
  */
  function barraDeFiltro(total: number, mostrados: number) {
    if (!hayQueFiltrar) return null;
    return (
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line bg-paper px-5 py-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <Input
            className="h-9 rounded-lg pl-9"
            placeholder="Buscar por nombre o documento"
            aria-label="Buscar por nombre o documento"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select
          className="h-9 w-[10.5rem] rounded-lg"
          aria-label="Filtrar por estado"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as FiltroEstado)}
        >
          {OPCIONES_FILTRO.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </Select>
        {cargos.length > 1 ? (
          <Select
            className="h-9 w-[11rem] rounded-lg"
            aria-label="Filtrar por cargo"
            value={filtroCargo}
            onChange={(e) => setFiltroCargo(e.target.value)}
          >
            <option value="">Todos los cargos</option>
            {cargos.map((cargo) => (
              <option key={cargo} value={cargo}>
                {cargo}
              </option>
            ))}
          </Select>
        ) : null}
        {areas.length > 1 ? (
          <Select
            className="h-9 w-[11rem] rounded-lg"
            aria-label="Filtrar por area"
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
          >
            <option value="">Todas las areas</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </Select>
        ) : null}
        {filtrosPuestos > 0 ? (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="focus-ring h-9 rounded-lg px-2 text-sm text-ink-500 transition-colors duration-150 hover:text-ink-900"
          >
            Limpiar
          </button>
        ) : null}
        {/*
          EL RECUENTO CIERRA LA FILA POR LA DERECHA. Con los filtros plegados hacia falta para que
          una tabla corta no se leyera como una tabla vacia; con ellos a la vista sigue haciendo
          falta, porque el buscador puede estar escrito y no se mira al teclear, se mira despues.
        */}
        <span className="ml-auto text-sm text-ink-500">
          {mostrados === total ? `${total} en la lista` : `${mostrados} de ${total}`}
        </span>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink-900">Inscritos</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {roster.length} persona{roster.length === 1 ? '' : 's'}
            {admiteAsistencia && porRevisar.length > 0 ? ` · ${porRevisar.length} por revisar` : ''}
            {admiteAsistencia && porRevisar.length === 0 && roster.length > 0 ? ' · asistencia tomada' : ''}
          </p>
        </div>
        {puedeAbrir ? (
          <Button variant={tomando ? 'ghost' : 'primary'} onClick={() => (tomando ? setTomando(false) : abrirToma())}>
            {tomando ? 'Cancelar' : porRevisar.length > 0 ? 'Tomar asistencia' : 'Corregir certificados'}
          </Button>
        ) : null}
      </div>

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nadie inscrito todavia"
          description={
            puedeInscribir
              ? 'Inscribe a quienes ya tienen la obligacion de esta actividad en la sede de la convocatoria.'
              : 'Publica la convocatoria para poder inscribir personas.'
          }
        />
      ) : null}

      {/* ── MODO TOMAR ASISTENCIA ─────────────────────────────────────────────────────────────── */}
      {tomando ? (
        <div className="border-t border-line">
          {/*
            LA BARRA DE HERRAMIENTAS DE LA TOMA — TRES FRANJAS, REORGANIZADA ENTERA (2026-09-06).

            ─── QUE PASABA ───

            Este sector habia crecido a parches: la fecha con su explicacion larga debajo, los dos
            botones de lote en otro sitio, un parrafo de cuatro renglones sobre el certificado, y el
            buscador estirado de lado a lado. Cuatro bloques con cuatro fondos y cuatro alturas para
            una sola herramienta. El cliente: *"que se vea bien y util para el usuario"*.

            ─── COMO SE ORDENA ───

            Un solo fondo `paper`, de la cabecera a la tabla, partido en tres franjas por una linea.
            Cada franja contesta UNA pregunta, y estan en el orden en que se contestan:

              1. LA JORNADA   ¿que dia fue, y asistieron todos? — la fecha, y las dos acciones que
                              marcan la lista entera. Es lo primero que se toca y por eso va arriba.
              2. EL PAPEL     ¿que pongo en las columnas del certificado? — solo si la formacion lo
                              lleva. La franja entera desaparece cuando no aplica.
              3. BUSCAR       ¿donde esta fulano? — buscador y filtros. Va pegado a la tabla porque
                              es lo unico de aqui que actua sobre las filas de abajo.

            A la derecha de cada franja va lo que cierra su pregunta: el recuento y los botones de
            lote arriba, quien expide el papel en medio, el recuento de filtradas abajo. Ninguna
            franja se queda con la mitad derecha vacia, que era lo que obligaba al buscador a
            estirarse para llenarla — y estirado tampoco se veia bien.

            Las explicaciones largas —las tres— viven en su icono de informacion. Es la regla que
            pidio el cliente para toda la aplicacion: nada de textos largos a la vista.
          */}
          <div className="bg-paper">
            {porRevisar.length > 0 ? (
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 py-3">
                <Field
                  htmlFor="asist-fecha"
                  label="Se dicto el"
                  ayuda="El dia de la sesion, no el dia en que se teclea: se toma asistencia al dia siguiente muchas veces. Queda como fecha de cumplimiento de todos los que asistieron."
                >
                  <Input
                    id="asist-fecha"
                    type="date"
                    className="h-9 w-[10.5rem] rounded-lg"
                    value={heldOn}
                    onChange={(e) => setHeldOn(e.target.value)}
                  />
                </Field>

                {/*
                  EL ACTA FIRMADA, AL LADO DE LA FECHA (2026-09-08).

                  Es de la JORNADA y no de nadie en particular: la hoja que circula por el salon y
                  vuelve con cuarenta firmas. Por eso vive aqui arriba y no en una columna — una
                  columna obligaria a subir el mismo archivo cuarenta veces.

                  Y es OPCIONAL a proposito. La lista marcada YA es evidencia —queda quien marco,
                  cuando y con que metodo— asi que exigir el escaneo para poder cerrar dejaria
                  jornadas sin cerrar esperando a que alguien pase por el escaner. El acta es lo que
                  un auditor pide cuando quiere ver la firma; el registro es lo que hace que la
                  formacion cuente.
                */}
                <div className="pb-1.5">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Acta firmada</span>
                  <Adjuntar
                    etiqueta="el acta firmada de esta jornada"
                    valor={acta?.key}
                    nombre={acta?.nombre}
                    onSubido={(e) => setActa({ key: e.key, nombre: e.originalName })}
                    onQuitar={() => setActa(null)}
                  />
                </div>
                {/*
                  LAS DOS ACCIONES DE LOTE, A LA DERECHA Y CON RELIEVE.

                  Estaban a media fila, en `ghost` —texto plano sin caja— y no se leian como
                  botones: parecian dos rotulos al lado de la fecha. Son la accion que ahorra
                  treinta y siete clics en una lista de cuarenta, asi que tienen que verse.

                  `outline` y no `primary`: el boton principal de esta tarjeta es "Dar por cumplida
                  a N", abajo, y dos primarios compitiendo no dejan destacar a ninguno. El tinte de
                  la marca al pasar por encima lo pidio el cliente senalando "Convocar", que es como
                  responde el resto del producto.
                */}
                <div className="ml-auto flex items-center gap-2">
                  <p className="mr-1 text-sm text-ink-500">
                    <strong className="font-medium text-ink-900">{presentes}</strong> de {porRevisar.length} asistieron
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:border-primary/30 hover:bg-primary-soft hover:text-ink-900"
                    onClick={() => todos('PRESENT')}
                  >
                    Todos asistieron
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:border-primary/30 hover:bg-primary-soft hover:text-ink-900"
                    onClick={() => todos('ABSENT')}
                  >
                    Nadie asistio
                  </Button>
                </div>
              </div>
            ) : null}

            {pideCertificado ? (
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line px-5 py-3">
                {porRevisar.length > 0 ? (
                  <>
                    <Field
                      htmlFor="asist-vence-lote"
                      label="El certificado vence el"
                      ayuda="Lo que dice el papel, que puede ser dentro de años y no el dia de la sesion. Esa fecha MANDA sobre la que calcularia el sistema por la recurrencia: es la que decide cuando vuelve a deberse la formacion."
                    >
                      {/*
                        UN CERTIFICADO NO PUEDE VENCER ANTES DE LA SESION QUE LO ORIGINA.

                        Son tres campos de fecha en la misma pantalla —cuando se dicto, cuando vence
                        el papel de todos, cuando vence el de cada quien— y nada impedia teclear un
                        vencimiento anterior a la jornada. Eso entra a la base como una habilitacion
                        caducada el dia que se emite, y el informe de Vencimientos la saca en rojo
                        sin que nadie sepa de donde salio.

                        El tope no sustituye a la compuerta del servidor (`offerings.service.ts`):
                        evita el error mas comun, que es equivocarse de año al teclear.
                      */}
                      <Input
                        id="asist-vence-lote"
                        type="date"
                        className="h-9 w-[10.5rem] rounded-lg"
                        min={heldOn}
                        value={vencePorLote}
                        onChange={(e) => setVencePorLote(e.target.value)}
                      />
                    </Field>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-0.5 hover:border-primary/30 hover:bg-primary-soft hover:text-ink-900"
                      onClick={repartirVencimiento}
                      disabled={!vencePorLote}
                    >
                      Ponérselo a todos
                    </Button>
                  </>
                ) : null}
                {/*
                  QUIEN LO EXPIDE, EN UN RENGLON. Eran cuatro, y mientras se teclea solo hacen falta
                  dos cosas: que el emisor sale solo, y que el numero puede llegar despues. El resto
                  esta en el icono.
                */}
                <p className="ml-auto flex max-w-lg items-start gap-2 pb-1.5 text-xs text-ink-500">
                  <ClipboardList size={14} className="mt-0.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>
                    Lo expide <strong className="font-medium text-ink-700">{quienLaDicto}</strong>: solo hay que
                    escribir el numero.
                  </span>
                  <Ayuda sobre="el certificado de un tercero">
                    El emisor lo pone el sistema desde quien dicta esta jornada, asi que no hay que teclearlo por
                    persona. Si el papel todavia no ha llegado, deja el numero en blanco y cierra la formacion igual:
                    se puede añadir despues desde esta misma lista, y entonces su vencimiento pasa a la obligacion.
                  </Ayuda>
                </p>
              </div>
            ) : null}

            {barraDeFiltro(ordenadas.length, filtradasTomando.length)}
          </div>

          <div className="overflow-x-auto border-t border-line">
            <Table>
              <THead>
                <Tr>
                  {/*
                    ANCHOS FIJOS, Y NO POR ESTETICA (2026-09-08).

                    Sin ellos el navegador reparte el ancho segun el contenido de cada FILA: la que
                    tiene numero de certificado y clip empuja hacia un lado, la que tiene la pildora
                    del motivo hacia el otro, y las columnas se mueven de fila en fila. Con tres
                    personas ya se nota; con cuarenta, la tabla deja de leerse como una tabla.
                  */}
                  <Th className="w-[24%]">Nombre</Th>
                  <Th className="w-[18%]">Cargo y area</Th>
                  {/*
                    TODO LO QUE HAY QUE SABER DE ESTA COLUMNA, EN SU CABECERA (2026-09-06).

                    Tercer sitio y definitivo. La leyenda estuvo encima de la tabla —partia la
                    pantalla justo donde empieza el trabajo— y despues al pie, junto a la
                    advertencia de que quien no asistio la sigue debiendo. El cliente lo dijo asi:
                    *"no se ve bien"*, y tenia razon de fondo: son dos notas de naturaleza distinta
                    pegadas, una dice QUE SIGNIFICA cada icono y la otra QUE PASA con quien no vino.

                    Van las dos aqui porque las dos contestan la misma pregunta —"¿que estoy
                    marcando en esta columna?"— y esta es su cabecera, que es donde se busca. Y
                    sobre todo: **no ocupan nada mientras nadie pregunte**, que era el problema de
                    los dos intentos anteriores.
                  */}
                  <Th className={pideCertificado ? 'w-[26%]' : 'w-[58%]'}>
                    <span className="inline-flex items-center gap-1.5">
                      Asistencia
                      <Ayuda sobre="la columna Asistencia">
                        <span className="block font-medium text-ink-900">Que significa cada boton</span>
                        <span className="mt-1.5 block">
                          {OPCIONES_ASISTENCIA.map((opcion) => (
                            <span key={opcion.value} className="mt-1 flex items-center gap-2">
                              {opcion.icon ? (
                                <opcion.icon
                                  className="h-3.5 w-3.5 shrink-0 text-ink-700"
                                  strokeWidth={2.25}
                                  aria-hidden="true"
                                />
                              ) : null}
                              {opcion.srLabel ?? opcion.label}
                            </span>
                          ))}
                        </span>
                        <span className="mt-2.5 block border-t border-line pt-2.5">
                          Quien no asistio <strong className="font-medium text-ink-900">sigue debiendo</strong> la
                          formacion, aunque la falta este justificada: ira a la siguiente jornada.
                        </span>
                        {corregibles.length > 0 ? (
                          <span className="mt-2 block">
                            De quien ya cumplio solo se corrige el certificado:{' '}
                            <strong className="font-medium text-ink-900">lo cumplido no se deshace desde aqui</strong>.
                          </span>
                        ) : null}
                      </Ayuda>
                    </span>
                  </Th>
                  {pideCertificado ? <Th className="w-[18%]">No. de certificado</Th> : null}
                  {pideCertificado ? <Th className="w-[14%]">Vence</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {visiblesTomando.map((fila) => {
                  const cerrada = Boolean(fila.completedAt);
                  const estado = estadoDe(fila.id);
                  // A quien ya cumplio solo se le tocan los campos del papel, y solo si consta por
                  // asistencia. Ver la nota de `corregibles`.
                  const editaPapel = pideCertificado && (cerrada ? fila.attendanceStatus === 'PRESENT' : estado === 'PRESENT');
                  const pill = comoConsta(fila);
                  return (
                    <Tr key={fila.id} className={cn('align-top', cerrada && 'bg-paper/60')}>
                      {/*
                        SIN PARTIR PALABRAS, Y QUE RUEDE A LO ANCHO SI NO CABE.

                        Con las seis columnas puestas —motivo y las dos del certificado— el navegador
                        estrujaba estas dos hasta dejar "Auxiliar de Bodega" en cuatro renglones de
                        una palabra, y una fila de cuatro renglones deja de leerse como una fila. El
                        contenedor ya tiene `overflow-x-auto`: preferimos rodar a lo ancho, que se
                        entiende, antes que un texto roto que parece un fallo.
                      */}
                      <Td className="whitespace-nowrap py-3">
                        <div className={!cerrada && estado !== 'PRESENT' ? 'text-ink-500' : 'font-medium text-ink-900'}>
                          {fila.user.fullName}
                        </div>
                        <div className="font-mono text-xs text-ink-500">{fila.user.documentNumber}</div>
                      </Td>
                      <Td className="whitespace-nowrap py-3 text-sm text-ink-700">
                        {fila.user.jobTitle.name}
                        <div className="text-xs text-ink-500">{fila.user.area.name}</div>
                      </Td>
                      <Td className="py-3">
                        {cerrada ? (
                          <div>
                            <StatusPill kind={pill.kind} label={pill.label} />
                            <div className="mt-0.5 text-xs text-ink-500">Ya cumplida</div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1.5">
                            <Segmented
                              label={`Asistencia de ${fila.user.fullName}`}
                              size="sm"
                              value={estado}
                              onChange={(nuevo) => setEstados({ ...estados, [fila.id]: nuevo })}
                              options={OPCIONES_ASISTENCIA}
                            />
                            {/*
                              EL MOTIVO, EN UN PANEL Y NO EN UNA COLUMNA (2026-09-06).

                              Tenia columna propia, ancha, que solo se llenaba en las dos o tres
                              filas justificadas de cuarenta: el resto era hueco, y ese hueco
                              empujaba las columnas del certificado fuera de la pantalla.

                              Ahora es un boton que sale SOLO en la fila justificada, justo al lado
                              de su marca, y abre un panel para escribir. La tabla pierde una
                              columna entera y el motivo gana sitio para escribirse de verdad.

                              El boton se pinta en rojo mientras falta, que es lo que sustituye a
                              ver el campo vacio: con el texto plegado hay que decir por fuera que
                              algo esta sin llenar, o el boton de guardar se queda apagado sin que
                              se entienda por que.
                            */}
                            {estado === 'JUSTIFIED' ? (
                              <Popover
                                etiqueta={`Motivo de la falta de ${fila.user.fullName}`}
                                ancho="w-80"
                                onAbrir={() => setEnfocarMotivo(fila.id)}
                                boton={(abierta) => (
                                  <span
                                    className={cn(
                                      'inline-flex h-7 max-w-[13rem] items-center gap-1.5 truncate rounded-md border px-2 text-xs transition-colors duration-150',
                                      motivoIncompleto(fila.id)
                                        ? 'border-danger/40 bg-danger-soft text-danger'
                                        : 'border-line-strong bg-surface text-ink-700 hover:bg-paper',
                                      abierta && 'border-line-strong bg-paper',
                                    )}
                                  >
                                    {/*
                                      EL TEXTO ESCRITO, A LA VISTA Y TRUNCADO.

                                      Es lo que le faltaba al panel para ser mejor que la columna que
                                      sustituye. Sin esto habia que abrir uno por uno para repasar
                                      los motivos antes de guardar, que es justo el momento en que se
                                      quieren leer todos de un tiron. Con la previsualizacion se leen
                                      sin abrir nada, y el ancho sigue siendo el de dos o tres filas
                                      de cuarenta en vez de una columna para todas.
                                    */}
                                    {motivoIncompleto(fila.id) ? (
                                      'Falta el motivo'
                                    ) : (
                                      <>
                                        <Pencil className="h-3 w-3 shrink-0 text-ink-500" strokeWidth={2} aria-hidden="true" />
                                        <span className="truncate">{motivos[fila.id]}</span>
                                      </>
                                    )}
                                  </span>
                                )}
                              >
                                <label
                                  htmlFor={`motivo-${fila.id}`}
                                  className="block text-[13px] font-medium text-ink-700"
                                >
                                  Motivo de la falta
                                </label>
                                <p className="mt-0.5 text-xs text-ink-500">
                                  Por que no asistio: incapacidad, vacaciones, comision. Queda en el acta.
                                </p>
                                <Textarea
                                  id={`motivo-${fila.id}`}
                                  className="mt-2 w-full"
                                  rows={3}
                                  autoFocus={enfocarMotivo === fila.id}
                                  placeholder="Incapacidad medica del 4 al 8 de septiembre"
                                  value={motivos[fila.id] ?? ''}
                                  onChange={(e) => setMotivos({ ...motivos, [fila.id]: e.target.value })}
                                />
                                {motivoIncompleto(fila.id) ? (
                                  <p className="mt-1.5 text-xs text-danger">
                                    Escribe al menos cinco caracteres: una justificacion sin motivo no justifica nada.
                                  </p>
                                ) : null}
                              </Popover>
                            ) : null}
                          </div>
                        )}
                      </Td>
                      {pideCertificado ? (
                        <Td>
                          {/*
                            EL NUMERO Y SU PAPEL, EN LA MISMA CELDA (2026-09-08).

                            Uno debajo del otro y no en dos columnas: una columna mas para un clip
                            es la misma pelea contra el ancho que ya costo la leyenda, el motivo y
                            el selector. Y van juntos porque son el mismo dato — el numero DEL
                            papel que se adjunta.

                            El escaneo es opcional aunque haya numero: el certificado llega antes
                            por correo que en papel, y bloquear el cierre hasta tener el PDF seria
                            retrasar la formacion por el tramite.
                          */}
                          {!editaPapel ? (
                            <span
                              className="text-sm text-ink-300"
                              title={
                                cerrada
                                  ? 'Consta cumplida sin lista de asistencia: el papel se registra desde su ficha'
                                  : 'Solo se registra el certificado de quien asistio'
                              }
                            >
                              —
                            </span>
                          ) : null}
                          {editaPapel ? (
                            <div className="space-y-1.5">
                              <Input
                                className="w-[10rem]"
                                placeholder="Opcional"
                                aria-label={`Numero de certificado de ${fila.user.fullName}`}
                                value={papel(fila.id).number}
                                onChange={(e) =>
                                  setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), number: e.target.value } })
                                }
                              />
                              <Adjuntar
                                etiqueta={`el certificado de ${fila.user.fullName}`}
                                valor={papel(fila.id).fileKey}
                                nombre={nombresDePapel[fila.id]}
                                onSubido={(ev) => {
                                  setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), fileKey: ev.key } });
                                  setNombresDePapel({ ...nombresDePapel, [fila.id]: ev.originalName });
                                }}
                                onQuitar={() => {
                                  const { fileKey: _, ...resto } = papel(fila.id);
                                  setPapeles({ ...papeles, [fila.id]: resto });
                                }}
                              />
                            </div>
                          ) : null}
                        </Td>
                      ) : null}
                      {pideCertificado ? (
                        <Td>
                          {editaPapel ? (
                            <Input
                              type="date"
                              className="w-[10.5rem]"
                              min={heldOn}
                              aria-label={`Vence el certificado de ${fila.user.fullName}`}
                              value={papel(fila.id).validUntil ?? ''}
                              onChange={(e) =>
                                setPapeles({ ...papeles, [fila.id]: { ...papel(fila.id), validUntil: e.target.value } })
                              }
                            />
                          ) : null}
                        </Td>
                      ) : null}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            {paginadorTomando}
            {filtradasTomando.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-500">
                Ninguna persona coincide con la busqueda. Quita el filtro para ver las {ordenadas.length} personas.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setTomando(false)}>
                Cancelar
              </Button>
              <Button
                onClick={guardar}
                loading={busy}
                disabled={faltaMotivo || papelSinNumero || !hayAlgoQueGuardar}
              >
                {faltaMotivo
                  ? 'Falta el motivo'
                  : papelSinNumero
                    ? 'Falta el número del certificado'
                    : porRevisar.length > 0
                      ? `Dar por cumplida a ${presentes}`
                      : `Guardar ${correcciones.length} correccion(es)`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── MODO MIRAR: todo lo que ensenaba "Inscritos", mas como consta ─────────────────────── */}
      {!tomando && roster.length > 0 ? (
        <>
          {barraDeFiltro(roster.length, filtradasMirando.length)}
          <div className="overflow-x-auto border-t border-line">
            <Table>
              <THead>
                <Tr>
                  <Th>Nombre</Th>
                  <Th>Cargo</Th>
                  <Th>Area</Th>
                  <Th>Origen</Th>
                  <Th>Como consta</Th>
                  {pideCertificado ? <Th>Certificado</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {visiblesMirando.map((fila) => {
                  const pill = comoConsta(fila);
                  return (
                    <Tr key={fila.id}>
                      <Td>
                        <div className="font-medium text-ink-900">{fila.user.fullName}</div>
                        <div className="font-mono text-xs text-ink-500">{fila.user.documentNumber}</div>
                      </Td>
                      <Td className="text-ink-700">{fila.user.jobTitle.name}</Td>
                      <Td className="text-ink-500">{fila.user.area.name}</Td>
                      <Td className="text-ink-500">{fila.assignmentId ? 'Obligacion' : 'Inscripcion directa'}</Td>
                      <Td>
                        <StatusPill kind={pill.kind} label={pill.label} />
                        {/*
                          POR QUÉ PUERTA ENTRÓ LA MARCA (2026-09-08).

                          El servidor lo guarda desde el Sprint 5 —`attendance_records.method`— y
                          ninguna pantalla lo enseñaba. Para el cumplimiento da igual: una formación
                          cumplida lo está se marcara por lista, por QR o con firma, y eso es
                          deliberado. Pero para quien revisa la evidencia **no** da igual: «lo marcó
                          el instructor» y «lo escaneó ella misma a las 8:14» son dos cosas distintas
                          delante de un auditor, y hasta hoy había que abrir el acta para verlo.
                        */}
                        {fila.attendanceMethod ? (
                          <div className="mt-0.5 text-xs text-ink-500">{COMO_SE_MARCO[fila.attendanceMethod]}</div>
                        ) : null}
                        {fila.attendanceNote ? (
                          <div className="mt-0.5 text-xs text-ink-500">{fila.attendanceNote}</div>
                        ) : null}
                      </Td>
                      {pideCertificado ? (
                        <Td className="text-ink-700">
                          {fila.extCertNumber ? (
                            <>
                              <div>{fila.extCertNumber}</div>
                              <div className="text-xs text-ink-500">
                                {fila.extCertIssuer}
                                {fila.extCertValidUntil ? ` · vence ${fila.extCertValidUntil.slice(0, 10)}` : ''}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </Td>
                      ) : null}
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            {paginadorMirando}
            {filtradasMirando.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-500">
                Ninguna persona coincide con la busqueda. Quita el filtro para ver las {roster.length} personas.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
