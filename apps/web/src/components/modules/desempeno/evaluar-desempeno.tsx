'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, ClipboardCheck, MessageSquarePlus, Search, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import {
  ESCALAS,
  entregarEvaluacion,
  getEvaluacion,
  misEvaluaciones,
  type Evaluacion,
  type EscalaCompetencia,
  type ItemDeFormulario,
} from '@/lib/performance-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Escala as EscalaCompartida, EscalaSiNo } from '@/components/ui/escala';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { motivoDelError } from '@/lib/api';

/**
 * RESPONDER UNA EVALUACION DE DESEMPENO (Decision #134).
 *
 * ─── PARA QUIEN ES ───
 *
 * Para el jefe que califica a su gente, y para quien se autoevalua. Es la pantalla que mas gente va
 * a abrir del modulo, y casi siempre una vez al año: tiene que explicarse sola.
 *
 * ─── SE ENTREGA ENTERA, Y UNA SOLA VEZ ───
 *
 * No hay autoguardado. Calificar a una persona es un texto que se piensa y se corrige mientras se
 * escribe; guardar cada tecla dejaria en el servidor versiones a medias de un juicio sobre alguien,
 * que es justo lo que no debe existir. Al entregar se avisa de que no se puede deshacer, porque es
 * lo que la persona evaluada va a leer y firmar.
 */
export function EvaluarDesempeno() {
  const { showToast } = useToast();
  const [pendientes, setPendientes] = useState<Evaluacion[] | null>(null);
  const [abierta, setAbierta] = useState<Evaluacion | null>(null);
  const [vista, setVista] = useState<'PENDIENTE' | 'ENTREGADA'>('PENDIENTE');
  const [busca, setBusca] = useState('');

  const cargar = () => {
    void misEvaluaciones()
      .then(setPendientes)
      .catch(() => setPendientes([]));
  };

  useEffect(cargar, []);

  if (!pendientes) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (pendientes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No tienes a nadie que calificar"
        description="Cuando se abra un ciclo de desempeno y te toque calificar a alguien, aparecera aqui."
      />
    );
  }

  const porResponder = pendientes.filter((fila) => fila.status !== 'SUBMITTED');
  const entregadas = pendientes.filter((fila) => fila.status === 'SUBMITTED');
  const ciclo = pendientes[0]?.cycle;

  const enVista = vista === 'PENDIENTE' ? porResponder : entregadas;
  const termino = busca.trim().toLowerCase();
  const filtradas = termino
    ? enVista.filter((fila) =>
        [fila.subjectName, fila.subjectJobTitle, fila.subjectArea]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(termino),
      )
    : enVista;

  /*
    AGRUPADAS POR FORMULARIO (Decision #139).

    Un jefe con conductores y analistas responde dos formularios distintos, y responder veinte
    seguidas saltando entre unos y otros obliga a releer las competencias cada vez. Con un solo
    formulario no se agrupa: seria un titulo repetido encima de la lista entera.
  */
  const grupos = agruparPorFormulario(filtradas);

  return (
    <div className="space-y-4">
      {/*
        EL PULSO DE LA CAMPANA, arriba del todo.

        Antes esto empezaba directamente con doscientas filas iguales: no habia forma de saber
        cuanto llevas, cuanto falta ni hasta cuando hay tiempo. Un numero grande y una barra de
        segmentos convierten "206 pendientes" en algo que se mira una vez y se entiende — es lo
        mismo que hace la tarjeta de repaso con las preguntas dibujadas.
      */}
      <Medidor
        hechas={entregadas.length}
        total={pendientes.length}
        cicloNombre={ciclo?.name}
        cierra={ciclo?.endsAt}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-paper p-1">
          <Pastilla activa={vista === 'PENDIENTE'} onClick={() => setVista('PENDIENTE')}>
            Por responder ({porResponder.length})
          </Pastilla>
          <Pastilla activa={vista === 'ENTREGADA'} onClick={() => setVista('ENTREGADA')}>
            Entregadas ({entregadas.length})
          </Pastilla>
        </div>

        {/* El buscador aparece cuando la lista deja de caber en una pantalla, no antes. */}
        {enVista.length > 8 ? (
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar por nombre, cargo o area"
              aria-label="Buscar en tus evaluaciones"
              className="focus-ring h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-300"
            />
          </div>
        ) : null}
      </div>

      {filtradas.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-500">
          {termino
            ? `Nadie coincide con "${busca.trim()}".`
            : vista === 'PENDIENTE'
              ? 'No te queda ninguna por responder.'
              : 'Todavia no has entregado ninguna.'}
        </p>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.nombre ?? 'unico'}>
            {grupos.length > 1 ? (
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                {grupo.nombre} ({grupo.filas.length})
              </h3>
            ) : null}
            <div className="space-y-2">
              {grupo.filas.map((fila) => (
                <Fila key={fila.id} fila={fila} onAbrir={() => void getEvaluacion(fila.id).then(setAbierta)} />
              ))}
            </div>
          </section>
        ))
      )}

      {abierta ? (
        <Formulario
          evaluacion={abierta}
          onCerrar={() => setAbierta(null)}
          onEntregada={() => {
            setAbierta(null);
            cargar();
            showToast({ kind: 'success', title: 'Evaluacion entregada' });
          }}
        />
      ) : null}
    </div>
  );
}

/** Las filas por formulario, en el orden en que vinieron. */
function agruparPorFormulario(filas: Evaluacion[]): { nombre: string; filas: Evaluacion[] }[] {
  const porNombre = new Map<string, Evaluacion[]>();
  for (const fila of filas) {
    const nombre = fila.cycleForm?.form.name ?? 'Sin formulario';
    porNombre.set(nombre, [...(porNombre.get(nombre) ?? []), fila]);
  }
  return [...porNombre.entries()].map(([nombre, suyas]) => ({ nombre, filas: suyas }));
}

/**
 * CUANTO LLEVAS, en una pieza.
 *
 * El numero grande es lo HECHO y no lo que falta: es lo que da ganas de seguir. Debajo, una barra
 * de segmentos —uno por evaluacion— para que doscientas dejen de ser una palabra y sean un tamaño.
 * Es el mismo recurso de la tarjeta de repaso, que dibuja las preguntas en vez de contarlas.
 */
function Medidor({
  hechas,
  total,
  cicloNombre,
  cierra,
}: {
  hechas: number;
  total: number;
  cicloNombre?: string;
  cierra?: string;
}) {
  const faltan = total - hechas;
  const pct = total === 0 ? 0 : Math.round((hechas / total) * 100);
  // Con muchas evaluaciones los segmentos se vuelven pelos: por encima de 60 se dibuja una barra.
  const segmentos = total <= 60;
  const fecha = cierra
    ? new Date(cierra).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
    : null;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/*
          ES TU TRABAJO, NO EL INFORME DE LA EMPRESA.

          El rotulo dice "lo que TE toca calificar" y no el nombre del ciclo, porque puesto arriba y
          en mayusculas ese nombre se leia como una cabecera de reporte — y esto no es un indicador
          de administracion: son las evaluaciones que tienes tu, con tu plazo. Quien no califica a
          nadie no ve esta pieza. El nombre de la campaña baja a la linea de apoyo, que es donde
          sirve: para saber de cual se trata cuando hay dos abiertas.
        */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
            Lo que te toca calificar
          </p>
          <p className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
            {hechas}
            <span className="ml-1.5 text-lg font-medium text-ink-500">de {total}</span>
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {faltan === 0 ? 'Ya las entregaste todas.' : `Te faltan ${faltan}`}
            {cicloNombre ? ` · ${cicloNombre}` : ''}
            {faltan > 0 && fecha ? ` cierra el ${fecha}` : ''}
          </p>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-primary)' }}>
          {pct}%
        </p>
      </div>

      <div className="mt-4 flex gap-[2px]" aria-hidden="true">
        {segmentos ? (
          Array.from({ length: total }, (_, indice) => (
            <span
              key={indice}
              className="h-1.5 flex-1 rounded-full transition-colors duration-150"
              style={{ backgroundColor: indice < hechas ? 'var(--brand-primary)' : 'var(--line)' }}
            />
          ))
        ) : (
          <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--line)' }}>
            <span
              className="block h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }}
            />
          </span>
        )}
      </div>
    </div>
  );
}

function Pastilla({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'focus-ring h-9 rounded-full px-4 text-sm transition-all duration-150',
        activa ? 'bg-surface font-medium text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900',
      )}
    >
      {children}
    </button>
  );
}

/**
 * UNA FILA: quien es, que cargo tiene y en que va.
 *
 * ─── LA PASTILLA DE "PENDIENTE" SE QUITO ───
 *
 * Estaba en las doscientas filas de la lista de pendientes, todas del mismo color de aviso. Un
 * estado que llevan TODOS los elementos de una lista no informa: solo pinta la pantalla de naranja.
 * Lo que dice en que va cada una es la nota cuando ya se entrego, y la flecha cuando falta.
 *
 * ─── LAS INICIALES, Y NO UN ICONO IGUAL EN TODAS ───
 *
 * Se califica a PERSONAS. Veinte filas con el mismo portapapeles son veinte tareas; con las
 * iniciales de cada quien se reconoce a la gente antes de leer el nombre. La propia va en el color
 * secundario de la empresa: es la unica de la lista que no es de otra persona.
 */
function Fila({ fila, onAbrir }: { fila: Evaluacion; onAbrir: () => void }) {
  const propia = fila.reviewerRole === 'SELF';
  const entregada = fila.status === 'SUBMITTED';
  const nombre = propia ? 'Tu autoevaluacion' : (fila.subjectName ?? 'Evaluacion');

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="focus-ring card flex w-full items-center gap-3 p-3.5 text-left transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
        style={
          propia
            ? { backgroundColor: 'var(--brand-accent-soft)', color: 'var(--brand-accent)' }
            : { backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }
        }
        aria-hidden="true"
      >
        {propia ? <UserRound className="h-5 w-5" strokeWidth={1.75} /> : iniciales(fila.subjectName)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] font-semibold text-ink-900">{nombre}</span>
        <span className="block truncate text-xs text-ink-500">
          {[fila.subjectJobTitle, fila.subjectArea].filter(Boolean).join(' · ')}
        </span>
      </span>

      {entregada ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-display text-lg font-bold tabular-nums text-ink-900">
            {fila.score === null ? '—' : `${Math.round(Number(fila.score))}%`}
          </span>
          <Check className="h-4 w-4" strokeWidth={2.5} style={{ color: 'var(--ok)' }} aria-label="Entregada" />
        </span>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Dos letras: la del nombre y la del apellido.
 *
 * Solo cuentan las palabras que EMPIEZAN POR LETRA. En la base hay gente cargada como "Persona S3
 * 73203529" y tomar la ultima palabra daba iniciales como "P7", que no son iniciales de nadie. Con
 * una sola palabra util se usan sus dos primeras letras.
 */
function iniciales(nombre: string | null): string {
  const partes = (nombre ?? '')
    .trim()
    .split(/\s+/)
    .filter((parte) => /^\p{L}/u.test(parte));
  if (partes.length === 0) return '?';
  if (partes.length === 1) return (partes[0] ?? '').slice(0, 2).toUpperCase();
  return `${partes[0]?.[0] ?? ''}${partes[partes.length - 1]?.[0] ?? ''}`.toUpperCase();
}
/** El formulario de una evaluacion, con las competencias que congelo el ciclo. */
function Formulario({
  evaluacion,
  onCerrar,
  onEntregada,
}: {
  evaluacion: Evaluacion;
  onCerrar: () => void;
  onEntregada: () => void;
}) {
  const { showToast } = useToast();
  const soloLectura = evaluacion.status === 'SUBMITTED';

  /*
    LAS COMPETENCIAS SALEN DE LA COPIA CONGELADA DEL CICLO, no del catalogo de hoy. Si alguien
    renombro o retiro una competencia despues de abrir el ciclo, esta evaluacion sigue preguntando
    lo que preguntaba — que es lo unico que permite compararla con las demas del mismo año.

    Ya entregada, se leen las RESPUESTAS: llevan el nombre con el que se pregunto.
  */
  const items: ItemDeFormulario[] = useMemo(() => {
    const congelado = evaluacion.cycleForm?.formSnapshot?.items;
    if (congelado && congelado.length > 0) return congelado;

    /*
      SIN COPIA CONGELADA se cae a las respuestas ya dadas, que llevan el nombre con el que se
      pregunto. Solo puede pasar en evaluaciones de un ciclo abierto antes de que existiera el
      congelado; se muestran como texto para no inventarse una escala que quiza no era esa.
    */
    return (evaluacion.answers ?? []).map((respuesta) => ({
      competencyId: respuesta.competencyId,
      name: respuesta.competencyName,
      description: null,
      scale: 'TEXT_ONLY' as EscalaCompetencia,
      weight: 1,
    }));
  }, [evaluacion]);

  const [valores, setValores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      (evaluacion.answers ?? []).map((respuesta) => [respuesta.competencyId, respuesta.value]),
    ),
  );
  const [comentarios, setComentarios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (evaluacion.answers ?? []).map((respuesta) => [respuesta.competencyId, respuesta.comment ?? '']),
    ),
  );
  const [general, setGeneral] = useState(evaluacion.comment ?? '');
  const [comentando, setComentando] = useState<Record<string, boolean>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Las de solo texto no cuentan para "esta completa": no tienen nota que faltar.
  const calificables = items.filter((item) => item.scale !== 'TEXT_ONLY').length;
  const faltan = items.filter(
    (item) => item.scale !== 'TEXT_ONLY' && (valores[item.competencyId] ?? null) === null,
  ).length;
  // Lo que se lleva respondido, para que el boton de entregar lo ensene.
  const avance = calificables === 0 ? 100 : Math.round(((calificables - faltan) / calificables) * 100);

  const entregar = async () => {
    setGuardando(true);
    try {
      await entregarEvaluacion(evaluacion.id, {
        answers: items.map((item) => ({
          competencyId: item.competencyId,
          value: item.scale === 'TEXT_ONLY' ? null : (valores[item.competencyId] ?? null),
          comment: comentarios[item.competencyId]?.trim() || null,
        })),
        comment: general.trim() || null,
      });
      onEntregada();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo entregar', description: motivoDelError(error) });
    } finally {
      setGuardando(false);
      setConfirmando(false);
    }
  };

  /*
    LA CONFIRMACION NO ES OTRA VENTANA (2026-09-02).

    Estaba como segundo modal encima del primero: dos velos difuminados apilados, dos cajas con
    esquinas redondeadas una sobre otra, y la de abajo asomando por los lados. Se veia como un error
    de la pantalla, no como una advertencia.

    Ahora es un PASO de la MISMA ventana: cambia el titulo, el icono, el contenido y los botones. La
    pieza no se duplica, el fondo no se oscurece dos veces, y la sensacion es la correcta — no te
    abrieron algo nuevo, te estan pidiendo que confirmes lo que ya tenias delante.
  */
  return (
    <>
      <Modal
        open
        onOpenChange={(abierto) => {
          if (!abierto) onCerrar();
        }}
        icon={confirmando ? ShieldCheck : evaluacion.reviewerRole === 'SELF' ? UserRound : ClipboardCheck}
        title={
          confirmando
            ? 'Entregar la evaluacion'
            : evaluacion.reviewerRole === 'SELF'
              ? 'Tu autoevaluacion'
              : (evaluacion.subjectName ?? 'Evaluacion')
        }
        description={
          confirmando
            ? evaluacion.reviewerRole === 'SELF'
              ? 'Tu autoevaluacion'
              : (evaluacion.subjectName ?? undefined)
            : soloLectura
              ? 'Ya entregada. Se muestra tal como quedo.'
              : // Con varios formularios en la misma campaña, cual se esta respondiendo deja de ser
                // obvio: un jefe con conductores y analistas abre dos formularios distintos.
                [evaluacion.subjectJobTitle, evaluacion.subjectArea, evaluacion.cycleForm?.form.name]
                  .filter(Boolean)
                  .join(' · ') || undefined
        }
        footer={
          confirmando ? (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                Volver
              </Button>
              <Button onClick={entregar} loading={guardando} glow>
                Entregar la evaluacion
              </Button>
            </div>
          ) : (
          soloLectura ? (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onCerrar}>
                Cerrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-500">
                {faltan === 0
                  ? 'Todas respondidas'
                  : `Faltan ${faltan} de ${calificables} por calificar`}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCerrar}>
                  Cancelar
                </Button>
                {/*
                  EL BOTON ES SU PROPIO MEDIDOR (`meterPct`), la pieza que ya usa el reproductor.

                  Un boton apagado con un "faltan 2" en gris a tres centimetros obliga a mirar dos
                  sitios para saber lo mismo. Relleno, la accion ENSENA cuanto falta para poder
                  hacerse y se abre con un latido al llegar al final: es la microinteraccion de la
                  marca puesta donde de verdad hay un avance que contar.
                */}
                <Button meterPct={avance} glow onClick={() => setConfirmando(true)}>
                  Entregar
                </Button>
              </div>
            </div>
          )
          )
        }
      >
        {confirmando ? (
          <>
            <div className="rounded-xl bg-warn-soft px-4 py-3.5">
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-warn">
                <TriangleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
                <span>
                  Una vez entregada <strong>no se puede corregir</strong>.
                </span>
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Es lo que la persona va a leer y firmar. Corregirla despues, sin que se note,
              convertiria la evidencia en algo que no se puede citar.
            </p>
          </>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-500">Este ciclo no tiene competencias que responder.</p>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <div
                key={item.competencyId}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors duration-150"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-[15px] font-semibold text-ink-900">{item.name}</p>
                  {item.weight > 1 ? (
                    // El peso se DICE, y como pastilla: si una competencia vale el triple, quien
                    // califica tiene derecho a verlo antes de marcar, no a encontrarlo en gris.
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                    >
                      pesa x{item.weight}
                    </span>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">{item.description}</p>
                ) : null}

                {/*
                  LA DE SOLO TEXTO DICE QUE ES DE SOLO TEXTO, y con la MISMA letra que la
                  descripcion de la competencia y la del comentario general: es una frase que
                  explica, no un rotulo de seccion. Las mayusculas con tracking son para titular un
                  bloque; dentro de una tarjeta donde ya hay una linea de apoyo en gris, meter una
                  segunda con otra letra son dos voces diciendo lo mismo.
                */}
                {item.scale === 'TEXT_ONLY' ? (
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Se responde escribiendo. No suma a la nota.
                  </p>
                ) : (
                  <Escala
                    escala={item.scale}
                    valor={valores[item.competencyId] ?? null}
                    soloLectura={soloLectura}
                    onCambiar={(valor) => setValores((previo) => ({ ...previo, [item.competencyId]: valor }))}
                  />
                )}

                {/*
                  EL COMENTARIO SE PIDE, NO SE IMPONE.

                  Una caja de texto abierta bajo cada competencia triplicaba el alto de la ventana y
                  convertia una tarea de marcar cinco numeros en un formulario de redaccion. Es
                  opcional de verdad: aparece al pedirlo, y se queda abierta si ya tiene algo
                  escrito. En las de solo texto no hay nada que marcar, asi que va siempre abierta.
                */}
                {item.scale === 'TEXT_ONLY' || comentando[item.competencyId] || comentarios[item.competencyId] ? (
                  <Textarea
                    rows={2}
                    className="mt-3"
                    autoFocus={comentando[item.competencyId] === true}
                    disabled={soloLectura}
                    placeholder={item.scale === 'TEXT_ONLY' ? 'Escribe aqui' : 'Que sustenta esa nota'}
                    value={comentarios[item.competencyId] ?? ''}
                    onChange={(evento) =>
                      setComentarios((previo) => ({ ...previo, [item.competencyId]: evento.target.value }))
                    }
                  />
                ) : soloLectura ? null : (
                  <button
                    type="button"
                    onClick={() => setComentando((previo) => ({ ...previo, [item.competencyId]: true }))}
                    className="focus-ring mt-3 flex items-center gap-1.5 rounded-lg text-xs font-medium text-ink-500 transition-colors duration-150 hover:text-ink-900"
                  >
                    <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Anadir comentario
                  </button>
                )}
              </div>
            ))}

            {/*
              El comentario general va en LA MISMA TARJETA que las competencias. Al ponerlas a ellas
              en tarjeta y dejarlo a el suelto, parecia de otra pantalla — y es una respuesta mas.
            */}
            {soloLectura && !general.trim() ? null : (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-display text-[15px] font-semibold text-ink-900">Comentario general</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  Opcional. Lo que no cabe en una competencia.
                </p>
                <Textarea
                  rows={3}
                  className="mt-3"
                  disabled={soloLectura}
                  placeholder="Escribe aqui"
                  value={general}
                  onChange={(evento) => setGeneral(evento.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * LA ESCALA: la MISMA del cuestionario de encuestas (`ui/escala.tsx`).
 *
 * Botones grandes, todas las opciones a la vista y los extremos escritos. Es lo que ya funcionaba
 * en el telefono, y tener dos formas de "elegir un numero" en el mismo producto solo garantiza que
 * un dia se sientan distintas.
 *
 * CON NUMEROS Y NO CON CARAS, y esa es la unica diferencia deliberada. Las caras son perfectas para
 * medir satisfaccion; para calificar el desempeno de una persona convierten un juicio profesional
 * en un emoticono, y quien lo lea dentro de un año merece "3 de 5" y no una carita.
 */
function Escala({
  escala,
  valor,
  soloLectura,
  onCambiar,
}: {
  escala: EscalaCompetencia;
  valor: number | null;
  soloLectura: boolean;
  onCambiar: (valor: number) => void;
}) {
  const info = ESCALAS[escala];
  if (info.tope === null) return null;

  if (escala === 'YES_NO') {
    return (
      <div className="mt-2">
        <EscalaSiNo
          valor={valor === null ? null : valor === 1}
          disabled={soloLectura}
          onPick={(cumple) => onCambiar(cumple ? 1 : 0)}
        />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <EscalaCompartida
        max={info.tope}
        forma="numbers"
        valor={valor}
        disabled={soloLectura}
        onPick={onCambiar}
        extremos={['Muy por debajo', 'Sobresaliente']}
      />
    </div>
  );
}
