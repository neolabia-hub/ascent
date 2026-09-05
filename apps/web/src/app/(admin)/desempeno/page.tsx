'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarRange, ClipboardCheck, Copy, Download, Info, ListChecks, Play, Plus, Square, X } from 'lucide-react';
import {
  ESCALAS,
  descargarConsolidadoXlsx,
  MOTIVOS_SIN_EVALUADOR,
  MOTIVOS_SIN_FORMULARIO,
  abrirCiclo,
  actualizarCompetencia,
  cerrarCiclo,
  crearCiclo,
  crearCompetencia,
  getConsolidado,
  guardarFormulario,
  listCiclos,
  listCompetencias,
  listFormularios,
  type AperturaDeCiclo,
  type Ciclo,
  type Competencia,
  type Consolidado,
  type EscalaCompetencia,
  type Formulario,
} from '@/lib/performance-api';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { ApiError, motivoDelError } from '@/lib/api';
import { Escala } from '@/components/ui/escala';
import { useCan } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * DESEMPENO (Decision #134). Ver `docs/modulos/desempeno.md`.
 *
 * Seccion PROPIA y no una pestana de Formaciones: el cliente pidio que no se mezcle con la
 * capacitacion, y la navegacion es donde primero se mezclan las cosas — un modulo metido bajo
 * "Formaciones" acaba compartiendo filtros, indicadores y, tarde o temprano, tablas.
 *
 * Tres pestanas, tres publicos:
 *
 *   Evaluar        el jefe que califica, y quien se autoevalua. La abre todo el mundo.
 *   Ciclos         Gestion Humana: abrir la campana y ver como va.
 *   Que se evalua  el catalogo: competencias y formularios. Se toca una vez al ano.
 *
 * "Evaluar" va PRIMERA aunque sea la ultima en construirse: es la que abre mas gente y la unica con
 * algo que hacer hoy.
 */
type Pestana = 'ciclos' | 'catalogo';

/**
 * ADMINISTRAR EL DESEMPENO: la campana y lo que se pregunta. CALIFICAR NO ESTA AQUI (Decision #140).
 *
 * ─── POR QUE SE QUITO LA PESTANA "EVALUAR" ───
 *
 * Estaban las MISMAS evaluaciones en dos sitios: aqui y en "Desempeno" del menu del aprendiz. Se
 * habia anadido alli porque un jefe de area normalmente no entra a administracion —sin eso, la
 * mitad de los evaluadores no tenia por donde abrirlas—, y esta se quedo por herencia.
 *
 * Dos puertas a la misma tarea no es una comodidad, es una duda: cada vez que alguien vuelve a
 * calificar tiene que acordarse de por donde entro la vez pasada, y quien explica el sistema tiene
 * que explicar las dos. Ademas dice algo falso del producto: calificar a tu equipo NO es
 * administrar la plataforma, es tu trabajo — lo hace tambien quien no administra nada.
 *
 * Queda una sola: el item "Desempeno" del menu, a un clic con el conmutador de espacio. Aqui
 * quedan las dos cosas que si son de administracion: la campana y el catalogo de lo que se pregunta.
 */
export default function DesempenoPage() {
  const puedeGestionar = useCan()('performance:manage');
  const [pestana, setPestana] = useState<Pestana>('ciclos');

  /*
    SIN PERMISO DE GESTION, ESTA PANTALLA NO TIENE NADA — y se dice a donde ir.

    La barra lateral no filtra por permiso, asi que aqui entra tambien quien administra otras cosas.
    Antes veia la pestana "Evaluar"; al quitarla, lo honesto no es ensenar dos pestanas que
    devuelven 403, sino mandarlo al unico sitio donde si tiene algo que hacer.
  */
  if (!puedeGestionar) {
    return (
      <div>
        <h1 className="font-display text-[28px] font-semibold text-ink-900">Desempeno</h1>
        <EmptyState
          className="mt-6"
          icon={ClipboardCheck}
          title="Esto lo configura Gestion Humana"
          description="Las campanas y las competencias se administran con el permiso de desempeno. Si tienes gente a cargo, tus evaluaciones estan en Desempeno, dentro de tu menu."
          action={
            <Link href="/mi-desempeno">
              <Button>Ir a mis evaluaciones</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold text-ink-900">Desempeno</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        Como lo esta haciendo cada persona en su cargo. No se mezcla con la formacion.
      </p>

      <div className="mb-5 mt-5 inline-flex gap-1 rounded-full bg-paper p-1">
        <Tab id="ciclos" activa={pestana} onSelect={setPestana} icon={CalendarRange} label="Ciclos" />
        <Tab id="catalogo" activa={pestana} onSelect={setPestana} icon={ListChecks} label="Que se evalua" />
      </div>

      {/*
        Y SE DICE DONDE SE CALIFICA. Quitar algo de un sitio sin decir a donde se fue es como se
        genera el correo de "ya no me aparece"; el enlace lo lleva al unico sitio que hay.
      */}
      <p className="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
        <ClipboardCheck className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={1.75} aria-hidden="true" />
        Si tienes gente a cargo, tus evaluaciones estan en
        <Link
          href="/mi-desempeno"
          className="focus-ring rounded font-medium underline decoration-line-strong underline-offset-2"
          style={{ color: 'var(--brand-primary)' }}
        >
          Desempeno
        </Link>
        , en tu menu.
      </p>

      {pestana === 'ciclos' ? <Ciclos /> : null}
      {pestana === 'catalogo' ? <Catalogo /> : null}
    </div>
  );
}

function Tab({
  id,
  activa,
  onSelect,
  label,
  icon: Icon,
}: {
  id: Pestana;
  activa: Pestana;
  onSelect: (id: Pestana) => void;
  label: string;
  icon: typeof ClipboardCheck;
}) {
  const seleccionada = activa === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={seleccionada}
      className={cn(
        'focus-ring flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
        seleccionada ? 'font-medium text-white shadow-btn-flat' : 'text-ink-500 hover:bg-surface hover:text-ink-900',
      )}
      style={seleccionada ? { backgroundColor: 'var(--brand-primary)' } : undefined}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}

// ─────────────────────────────  CICLOS  ─────────────────────────────

function Ciclos() {
  const { showToast } = useToast();
  const [ciclos, setCiclos] = useState<Ciclo[] | null>(null);
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [creando, setCreando] = useState(false);
  const [apertura, setApertura] = useState<{ ciclo: Ciclo; resultado: AperturaDeCiclo } | null>(null);
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = () => {
    void listCiclos()
      .then(setCiclos)
      .catch(() => setCiclos([]));
    void listFormularios()
      .then(setFormularios)
      .catch(() => undefined);
  };
  useEffect(cargar, []);

  const abrir = async (ciclo: Ciclo) => {
    setOcupado(ciclo.id);
    try {
      const resultado = await abrirCiclo(ciclo.id);
      setApertura({ ciclo, resultado });
      cargar();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo abrir el ciclo', description: porQueNoSePudo(error) });
    } finally {
      setOcupado(null);
    }
  };

  const cerrar = async (ciclo: Ciclo) => {
    setOcupado(ciclo.id);
    try {
      await cerrarCiclo(ciclo.id);
      showToast({ kind: 'success', title: 'Ciclo cerrado' });
      cargar();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cerrar', description: motivoDelError(error) });
    } finally {
      setOcupado(null);
    }
  };

  if (!ciclos) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreando(true)} disabled={formularios.length === 0}>
          <Plus size={16} />
          Nuevo ciclo
        </Button>
      </div>

      {formularios.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Primero hay que decir que se evalua"
          description="Un ciclo necesita un formulario: crea las competencias y agrupalas en «Que se evalua»."
        />
      ) : ciclos.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Todavia no hay ciclos"
          description="Un ciclo es la campana: «Desempeno 2026», con sus fechas. Al abrirlo se generan las evaluaciones."
        />
      ) : (
        <div className="space-y-2">
          {ciclos.map((ciclo) => (
            <div key={ciclo.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[15px] font-semibold text-ink-900">{ciclo.name}</p>
                    <EstadoDelCiclo estado={ciclo.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {ciclo.forms.map((cicloForm) => cicloForm.form.name).join(' + ')} ·{' '}
                    {new Date(ciclo.startsAt).toLocaleDateString('es-CO')} al{' '}
                    {new Date(ciclo.endsAt).toLocaleDateString('es-CO')}
                    {ciclo._count.reviews > 0 ? ` · ${ciclo._count.reviews} evaluaciones` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-300">
                    {ciclo.selfEvaluation ? 'Con autoevaluacion' : 'Solo el jefe califica'} ·{' '}
                    {ciclo.visibleToEmployee ? 'la persona ve su resultado' : 'el resultado no se le muestra'} ·{' '}
                    {ciclo.requiresSignature ? 'se firma' : 'sin firma'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {ciclo.status === 'DRAFT' ? (
                    <Button size="sm" loading={ocupado === ciclo.id} onClick={() => void abrir(ciclo)}>
                      <Play size={14} />
                      Abrir
                    </Button>
                  ) : null}
                  {ciclo.status !== 'DRAFT' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void getConsolidado(ciclo.id).then(setConsolidado)}
                    >
                      Ver como va
                    </Button>
                  ) : null}
                  {ciclo.status === 'OPEN' ? (
                    <Button variant="ghost" size="sm" loading={ocupado === ciclo.id} onClick={() => void cerrar(ciclo)}>
                      <Square size={14} />
                      Cerrar
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creando ? (
        <NuevoCiclo
          formularios={formularios}
          onCerrar={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            cargar();
          }}
        />
      ) : null}

      {apertura ? <ResultadoApertura datos={apertura} onCerrar={() => setApertura(null)} /> : null}
      {consolidado ? <VerConsolidado datos={consolidado} onCerrar={() => setConsolidado(null)} /> : null}
    </div>
  );
}

/**
 * POR QUE NO SE PUDO, con nombre.
 *
 * «No se pudo abrir el ciclo» obliga a adivinar entre cinco causas que se arreglan en cinco sitios
 * distintos, y una de ellas —dos formularios peleandose un cargo— puede aparecer DESPUES de crear
 * el ciclo, si alguien le cambio los cargos a un formulario mientras tanto. El servidor manda el
 * motivo; aqui solo se traduce.
 */
function porQueNoSePudo(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const formulario = typeof error.body.form === 'string' ? error.body.form : 'uno de los formularios';

  switch (error.code) {
    case 'JOB_TITLES_OVERLAP':
      return 'Dos formularios del ciclo se reparten el mismo cargo. Se quita ese cargo de uno de los dos en «Que se evalua».';
    case 'TOO_MANY_GENERAL_FORMS':
      return 'El ciclo lleva dos formularios sin cargos, y solo puede haber uno general.';
    case 'CYCLE_WITHOUT_FORMS':
      return 'El ciclo no tiene ningun formulario.';
    case 'FORM_EMPTY':
      return `«${formulario}» no tiene ninguna competencia, asi que no preguntaria nada.`;
    case 'NO_EVALUATIONS':
      return 'No se genero ninguna evaluacion: ningun cargo de la empresa encaja con los formularios elegidos, o nadie tiene responsable de area y el ciclo no lleva autoevaluacion.';
    case 'NO_PEOPLE':
      return 'No hay personas activas a las que evaluar.';
    case 'FORM_NOT_FOUND':
      return 'Uno de los formularios elegidos ya no existe. Vuelve a abrir la ventana.';
    default:
      return undefined;
  }
}

function EstadoDelCiclo({ estado }: { estado: Ciclo['status'] }) {
  if (estado === 'OPEN') return <StatusPill kind="ok" label="ABIERTO" />;
  if (estado === 'CLOSED') return <StatusPill kind="neutral" label="CERRADO" />;
  return <StatusPill kind="info" label="BORRADOR" />;
}

function NuevoCiclo({
  formularios,
  onCerrar,
  onCreado,
}: {
  formularios: Formulario[];
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const { showToast } = useToast();
  const anio = new Date().getFullYear();
  const [form, setForm] = useState({
    name: `Desempeno ${anio}`,
    formIds: formularios[0] ? [formularios[0].id] : [],
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: `${anio}-12-31`,
    selfEvaluation: true,
    visibleToEmployee: true,
    requiresSignature: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [buscaFormulario, setBuscaFormulario] = useState('');
  const elegidos = formularios.filter((formulario) => form.formIds.includes(formulario.id));
  const termino = buscaFormulario.trim().toLowerCase();
  // Lo ya marcado no se esconde nunca al buscar: desaparecer de la lista se lee como desmarcado.
  const visibles = termino
    ? formularios.filter(
        (formulario) =>
          form.formIds.includes(formulario.id) || formulario.name.toLowerCase().includes(termino),
      )
    : formularios;

  const alternar = (id: string) =>
    setForm((actual) => ({
      ...actual,
      formIds: actual.formIds.includes(id)
        ? actual.formIds.filter((otro) => otro !== id)
        : [...actual.formIds, id],
    }));

  /*
    LO QUE HACE IMPOSIBLE REPARTIR, dicho mientras se elige.

    Dos formularios que reclaman el mismo cargo, o dos generales, dejarian a quien le toca cual en
    manos del orden de la consulta. El servidor lo rechaza igual —es el que manda—, pero enterarse
    al pulsar «Crear» es enterarse tarde: aqui se ve al marcar la casilla.
  */
  const cargosRepetidos = elegidos
    .flatMap((formulario) => formulario.jobTitles.map((fila) => fila.jobTitle))
    .filter((cargo, indice, todos) => todos.findIndex((otro) => otro.id === cargo.id) !== indice);
  const generales = elegidos.filter((formulario) => formulario.jobTitles.length === 0);
  const choque =
    cargosRepetidos.length > 0
      ? `Dos formularios se reparten el mismo cargo: ${[...new Set(cargosRepetidos.map((cargo) => cargo.name))].join(', ')}.`
      : generales.length > 1
        ? `Hay ${generales.length} formularios sin cargos, y solo puede haber uno general por campana.`
        : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      await crearCiclo({
        ...form,
        // El dia entero: el ciclo abre al principio y cierra al final de su ultimo dia.
        startsAt: new Date(`${form.startsAt}T00:00:00`).toISOString(),
        endsAt: new Date(`${form.endsAt}T23:59:59`).toISOString(),
      });
      onCreado();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo crear el ciclo', description: porQueNoSePudo(error) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      icon={CalendarRange}
      title="Nuevo ciclo"
      description="La campana del ano. Queda en borrador hasta que la abras."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            loading={guardando}
            disabled={form.name.trim().length < 3 || form.formIds.length === 0 || choque !== null}
            onClick={guardar}
          >
            Crear
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field htmlFor="c-name" label="Nombre" required>
          <Input
            id="c-name"
            value={form.name}
            onChange={(evento) => setForm({ ...form, name: evento.target.value })}
            maxLength={120}
          />
        </Field>
        {/*
          VARIOS FORMULARIOS EN LA MISMA CAMPANA (Decision #139).

          Casillas y no un desplegable: elegir varios de una lista desplegable obliga a abrirla
          tantas veces como formularios lleve la campana, y a acordarse de lo que ya se marco.
        */}
        <Field
          // El rotulo del grupo apunta a la primera casilla: es la unica manera de que "Formularios"
          // sea una etiqueta de verdad y no un texto suelto encima de una lista.
          htmlFor={`c-form-${formularios[0]?.id ?? ''}`}
          label="Formularios"
          required
          hint="Marca todos los que apliquen: cada persona responde el de su cargo, y el que no declara cargos recoge al resto."
        >
          <div className="space-y-3 rounded-xl border border-line p-3">
            {/* Con cuarenta cargos la lista deja de caber: buscador a partir de ocho, como en todo. */}
            {formularios.length > 8 ? (
              <input
                type="search"
                value={buscaFormulario}
                onChange={(evento) => setBuscaFormulario(evento.target.value)}
                placeholder="Buscar un formulario"
                aria-label="Buscar un formulario"
                className="focus-ring h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-300"
              />
            ) : null}
            {visibles.map((formulario) => (
              <label key={formulario.id} className="flex cursor-pointer items-start gap-3">
                <input
                  id={`c-form-${formulario.id}`}
                  type="checkbox"
                  checked={form.formIds.includes(formulario.id)}
                  onChange={() => alternar(formulario.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ink-900">{formulario.name}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                    {formulario.items.length} competencias ·{' '}
                    {formulario.jobTitles.length === 0
                      ? 'general: recoge a quien no encaje en otro'
                      : formulario.jobTitles.map((fila) => fila.jobTitle.name).join(', ')}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        {choque ? (
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              {choque} Asi no se puede repartir: a quien le tocara cual lo decidiria el orden en que
              se guardaron.
            </span>
          </p>
        ) : null}

        {/*
          QUE TRAE CADA FORMULARIO ELEGIDO, aqui mismo.

          Elegir por el nombre obliga a acordarse de que llevaba dentro, y de eso dependen a quien
          se evalua y con que peso. Se ensenan enteros: son listas cortas y deciden la campana del
          ano.
        */}
        {elegidos.map((formulario) => (
          <div key={formulario.id} className="rounded-xl bg-paper p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Lo que pregunta
            </p>
            <p className="mt-1 font-display text-sm font-semibold text-ink-900">{formulario.name}</p>
            <ul className="mt-2 space-y-1">
              {formulario.items.map((item) => (
                <li key={item.competencyId} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-900">{item.competency.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">
                    {ESCALAS[item.competency.scale].label}
                    {item.weight > 1 ? ` · pesa x${item.weight}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">
              {formulario.jobTitles.length === 0
                ? 'Recoge a quien no encaje en ningun otro formulario del ciclo.'
                : `Solo a: ${formulario.jobTitles.map((fila) => fila.jobTitle.name).join(', ')}.`}
            </p>
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="c-desde" label="Abre" required>
            <Input
              id="c-desde"
              type="date"
              value={form.startsAt}
              onChange={(evento) => setForm({ ...form, startsAt: evento.target.value })}
            />
          </Field>
          <Field htmlFor="c-hasta" label="Cierra" required>
            <Input
              id="c-hasta"
              type="date"
              value={form.endsAt}
              onChange={(evento) => setForm({ ...form, endsAt: evento.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2 rounded-xl bg-paper p-4">
          <Casilla
            checked={form.selfEvaluation}
            onChange={(valor) => setForm({ ...form, selfEvaluation: valor })}
            label="La persona tambien se autoevalua"
            hint="Se generan dos evaluaciones por persona: la suya y la de su jefe. Es lo que sostiene la conversacion."
          />
          <Casilla
            checked={form.visibleToEmployee}
            onChange={(valor) => setForm({ ...form, visibleToEmployee: valor })}
            label="La persona ve el resultado de su jefe"
            hint="Solo despues de que el jefe la entregue."
          />
          <Casilla
            checked={form.requiresSignature}
            onChange={(valor) => setForm({ ...form, requiresSignature: valor })}
            label="La persona firma que la conversacion ocurrio"
            hint="Firmar no es estar de acuerdo: es lo que convierte la evaluacion en evidencia."
          />
        </div>
      </div>
    </Modal>
  );
}

function Casilla({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (valor: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(evento) => onChange(evento.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand-primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-ink-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

/**
 * LO QUE PASO AL ABRIR, dicho entero.
 *
 * Abrir en silencio dejando gente fuera es como se descubre en diciembre que media empresa no fue
 * evaluada. Aqui se dice cuantas se generaron y, sobre todo, a quien NO se le pudo asignar jefe y
 * por que — que casi siempre significa que a su area le falta responsable.
 */
function ResultadoApertura({
  datos,
  onCerrar,
}: {
  datos: { ciclo: Ciclo; resultado: AperturaDeCiclo };
  onCerrar: () => void;
}) {
  const contar = (filas: { motivo: string }[]) => {
    const porMotivo = new Map<string, number>();
    for (const fila of filas) porMotivo.set(fila.motivo, (porMotivo.get(fila.motivo) ?? 0) + 1);
    return [...porMotivo.entries()];
  };
  const porMotivo = contar(datos.resultado.sinEvaluador);
  const sinFormulario = contar(datos.resultado.sinFormulario);

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      icon={Play}
      title="Ciclo abierto"
      description={datos.ciclo.name}
      footer={
        <div className="flex justify-end">
          <Button onClick={onCerrar}>Entendido</Button>
        </div>
      }
    >
      <p className="font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
        {datos.resultado.evaluaciones}
      </p>
      <p className="mt-1 text-sm text-ink-500">evaluaciones generadas y avisadas a sus evaluadores</p>

      {datos.resultado.sinEvaluador.length > 0 ? (
        <div className="mt-5 rounded-xl bg-warn-soft px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-warn">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>{datos.resultado.sinEvaluador.length} personas se quedaron sin quien las evalue.</strong> No
              se les invento un evaluador: eso se descubre cuando alguien recibe una evaluacion que no
              le toca.
            </span>
          </p>
          <ul className="mt-3 space-y-1">
            {porMotivo.map(([motivo, cuantas]) => (
              <li key={motivo} className="text-sm text-ink-700">
                <span className="font-semibold tabular-nums">{cuantas}</span>{' '}
                {MOTIVOS_SIN_EVALUADOR[motivo as keyof typeof MOTIVOS_SIN_EVALUADOR]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-700">
            El responsable de cada area se asigna en <strong>Configuracion → Areas</strong>. Al asignarlo,
            el proximo ciclo ya generara sus evaluaciones.
          </p>
        </div>
      ) : null}

      {/*
        Y QUIEN NO ENCAJO EN NINGUN FORMULARIO (Decision #139). Es otra cosa que quedarse sin jefe,
        y se arregla en otro sitio: ahi falta un formulario para ese cargo, o falta el general.
      */}
      {datos.resultado.sinFormulario.length > 0 ? (
        <div className="mt-4 rounded-xl bg-warn-soft px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-warn">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>
                La campana no alcanza a {datos.resultado.sinFormulario.length} personas.
              </strong>{' '}
              Ningun formulario del ciclo cubre su cargo, y no se les puso el primero que habia:
              preguntarle a un conductor por competencias de analista se descubre cuando ya lo
              respondio.
            </span>
          </p>
          <ul className="mt-3 space-y-1">
            {sinFormulario.map(([motivo, cuantas]) => (
              <li key={motivo} className="text-sm text-ink-700">
                <span className="font-semibold tabular-nums">{cuantas}</span>{' '}
                {MOTIVOS_SIN_FORMULARIO[motivo as keyof typeof MOTIVOS_SIN_FORMULARIO]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-700">
            Si la campana era solo para esos cargos, no hay nada que arreglar. Si no, se anade al
            ciclo un formulario que cubra ese cargo, o uno sin cargos que recoja al resto.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function VerConsolidado({ datos, onCerrar }: { datos: Consolidado; onCerrar: () => void }) {
  const { showToast } = useToast();
  const [bajando, setBajando] = useState(false);

  const bajar = async () => {
    setBajando(true);
    try {
      await descargarConsolidadoXlsx(datos.cycle.id, datos.cycle.name);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo generar el Excel', description: motivoDelError(error) });
    } finally {
      setBajando(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      size="lg"
      title={datos.cycle.name}
      icon={ClipboardCheck}
      description={`${datos.cycle.forms.map((cicloForm) => cicloForm.form.name).join(' + ')} · ${datos.entregadas} de ${datos.total} entregadas`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/*
            EL ARCHIVO ENTERO, al lado de la tabla que solo ensena 100 filas. Es lo que se guarda
            como evidencia del ano y lo que pide quien audita: con fecha, completo y filtrable.
          */}
          <Button variant="outline" loading={bajando} onClick={() => void bajar()}>
            <Download size={16} />
            Excel
          </Button>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Cifra valor={datos.entregadas} etiqueta="Entregadas" />
        <Cifra valor={datos.firmadas} etiqueta="Firmadas" />
        <Cifra valor={datos.promedio === null ? '—' : `${datos.promedio}%`} etiqueta="Promedio" />
      </div>

      {/*
        Y LO MISMO, FORMULARIO A FORMULARIO (Decision #139).

        Es para lo que sirve tener varios en una campana: el promedio de conductores y el de
        analistas separados, sin abrir dos ciclos ni sumar a mano. Con un solo formulario no se
        ensena: seria repetir las cifras de arriba.
      */}
      {datos.porFormulario.length > 1 ? (
        <div className="mt-3 overflow-hidden rounded-xl bg-paper">
          {datos.porFormulario.map((formulario) => (
            <div
              key={formulario.cycleFormId}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 last:border-0"
            >
              <span className="min-w-0 text-sm font-medium text-ink-900">{formulario.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-500">
                {formulario.entregadas} de {formulario.total} entregadas ·{' '}
                {formulario.promedio === null ? 'sin nota aun' : `promedio ${formulario.promedio}%`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>Persona</Th>
              <Th>Evalua</Th>
              <Th>Estado</Th>
              <Th className="text-right">Nota</Th>
            </Tr>
          </THead>
          <TBody>
            {datos.items.slice(0, 100).map((fila) => (
              <Tr key={fila.id}>
                <Td>
                  <p className="font-medium text-ink-900">{fila.subjectName ?? '—'}</p>
                  <p className="text-xs text-ink-500">{fila.subjectArea ?? ''}</p>
                </Td>
                <Td>
                  <span className="text-sm text-ink-700">
                    {fila.reviewerRole === 'SELF' ? 'Ella misma' : (fila.evaluatorName ?? '—')}
                  </span>
                </Td>
                <Td>
                  {fila.status === 'SUBMITTED' ? (
                    <StatusPill kind={fila.signedAt ? 'ok' : 'info'} label={fila.signedAt ? 'FIRMADA' : 'ENTREGADA'} />
                  ) : (
                    <StatusPill kind="neutral" label="PENDIENTE" />
                  )}
                </Td>
                <Td className="text-right tabular-nums text-ink-900">
                  {fila.score === null ? '—' : `${Math.round(Number(fila.score))}%`}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      {datos.items.length > 100 ? (
        <p className="mt-3 text-center text-xs text-ink-500">Se muestran 100 de {datos.items.length}.</p>
      ) : null}
    </Modal>
  );
}

function Cifra({ valor, etiqueta }: { valor: number | string; etiqueta: string }) {
  return (
    <div className="rounded-xl bg-paper p-4">
      <p className="font-display text-[26px] font-bold leading-none tabular-nums text-ink-900">{valor}</p>
      <p className="mt-1 text-xs text-ink-500">{etiqueta}</p>
    </div>
  );
}

// ─────────────────────────────  CATALOGO  ─────────────────────────────

/** Competencias y formularios: lo que se toca una vez al ano, antes de abrir el ciclo. */
function Catalogo() {
  const { showToast } = useToast();
  const [competencias, setCompetencias] = useState<Competencia[] | null>(null);
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [editando, setEditando] = useState<Competencia | 'nueva' | null>(null);
  const [armando, setArmando] = useState<Formulario | 'nuevo' | null>(null);

  const cargar = () => {
    void listCompetencias()
      .then(setCompetencias)
      .catch(() => setCompetencias([]));
    void listFormularios()
      .then(setFormularios)
      .catch(() => undefined);
  };
  useEffect(cargar, []);

  if (!competencias) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Competencias</h2>
            <p className="text-sm text-ink-500">Lo que se evalua de una persona. Cada una con su escala.</p>
          </div>
          <Button onClick={() => setEditando('nueva')}>
            <Plus size={16} />
            Nueva competencia
          </Button>
        </div>

        {competencias.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Todavia no hay competencias"
            description="Empieza por lo que de verdad evalua la empresa hoy: si existe un formato en papel, ese formato es la especificacion."
          />
        ) : (
          <div className="card overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Codigo</Th>
                  <Th>Competencia</Th>
                  <Th>Escala</Th>
                  <Th>Estado</Th>
                  <Th className="w-24 text-right">Acciones</Th>
                </Tr>
              </THead>
              <TBody>
                {competencias.map((competencia) => (
                  <Tr key={competencia.id}>
                    <Td className="font-mono text-xs">{competencia.code}</Td>
                    <Td>
                      <p className="font-medium text-ink-900">{competencia.name}</p>
                      {competencia.description ? (
                        <p className="text-xs text-ink-500">{competencia.description}</p>
                      ) : null}
                    </Td>
                    <Td className="text-sm text-ink-700">{ESCALAS[competencia.scale].label}</Td>
                    <Td>
                      <StatusPill
                        kind={competencia.active ? 'ok' : 'neutral'}
                        label={competencia.active ? 'ACTIVA' : 'INACTIVA'}
                      />
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditando(competencia)}>
                        Editar
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Formularios</h2>
            <p className="text-sm text-ink-500">
              Que competencias se preguntan juntas, y con que peso. Un ciclo usa uno.
            </p>
          </div>
          <Button onClick={() => setArmando('nuevo')} disabled={competencias.length === 0}>
            <Plus size={16} />
            Nuevo formulario
          </Button>
        </div>

        {formularios.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-500">
            Todavia no hay formularios. Uno agrupa las competencias que se preguntan en un ciclo.
          </p>
        ) : (
          <div className="space-y-2">
            {formularios.map((formulario) => (
              <div key={formulario.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-semibold text-ink-900">{formulario.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formulario.items.length} competencias ·{' '}
                      {formulario.jobTitles.length === 0
                        ? 'toda la empresa'
                        : `${formulario.jobTitles.length} cargos`}
                      {formulario.base ? ` · hereda de ${formulario.base.name}` : ''}
                      {formulario._count.derivados > 0
                        ? ` · base de ${formulario._count.derivados} formulario${formulario._count.derivados === 1 ? '' : 's'}`
                        : ''}
                      {formulario._count.cycleForms > 0 ? ` · usado por ${formulario._count.cycleForms} ciclos` : ''}
                    </p>
                  </div>
                  {/*
                    EL BOTON SIGUE AHI AUNQUE NO SE PUEDA EDITAR.

                    Antes se deshabilitaba, y eso dejaba sin salida: quien queria cambiar el
                    formulario del ano pasado veia un boton apagado y ningun camino. La regla —lo que
                    ya uso un ciclo no se reescribe— es correcta; esconderla no la explica.

                    Ahora se pulsa, se dice POR QUE no se puede, y se ofrece lo que si se puede:
                    duplicarlo y editar la copia.
                  */}
                  <Button variant="ghost" size="sm" onClick={() => setArmando(formulario)}>
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editando ? (
        <EditarCompetencia
          competencia={editando === 'nueva' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            cargar();
            showToast({ kind: 'success', title: 'Competencia guardada' });
          }}
        />
      ) : null}

      {armando ? (
        <ArmarFormulario
          formulario={armando === 'nuevo' ? null : armando}
          formularios={formularios}
          competencias={competencias.filter((competencia) => competencia.active)}
          onCerrar={() => setArmando(null)}
          onGuardado={() => {
            setArmando(null);
            cargar();
            showToast({ kind: 'success', title: 'Formulario guardado' });
          }}
        />
      ) : null}
    </div>
  );
}

function EditarCompetencia({
  competencia,
  onCerrar,
  onGuardada,
}: {
  competencia: Competencia | null;
  onCerrar: () => void;
  onGuardada: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    code: competencia?.code ?? '',
    name: competencia?.name ?? '',
    description: competencia?.description ?? '',
    scale: (competencia?.scale ?? 'ONE_TO_FIVE') as EscalaCompetencia,
    active: competencia?.active ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        scale: form.scale,
        active: form.active,
      };
      if (competencia) await actualizarCompetencia(competencia.id, cuerpo);
      else await crearCompetencia({ ...cuerpo, code: form.code.trim().toUpperCase() });
      onGuardada();
    } catch (fallo) {
      const codigo = (fallo as { code?: string }).code;
      setError(
        codigo === 'DUPLICATE_CODE'
          ? 'Ya existe una competencia con ese codigo.'
          : codigo === 'SCALE_LOCKED'
            ? 'No se puede cambiar la escala: ya hay evaluaciones respondidas con ella, y un 4 sobre 5 no significa lo mismo que un 4 sobre 10.'
            : 'No se pudo guardar.',
      );
      showToast({ kind: 'danger', title: 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={competencia ? 'Editar competencia' : 'Nueva competencia'}
      icon={ListChecks}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            loading={guardando}
            disabled={form.name.trim().length < 3 || (!competencia && form.code.trim().length < 2)}
            onClick={guardar}
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}

        {competencia ? null : (
          <Field htmlFor="k-code" label="Codigo" required hint="Corto y en mayusculas. No se puede cambiar despues.">
            <Input
              id="k-code"
              value={form.code}
              onChange={(evento) => setForm({ ...form, code: evento.target.value.toUpperCase() })}
              placeholder="SEGURIDAD"
              maxLength={30}
            />
          </Field>
        )}

        <Field htmlFor="k-name" label="Nombre" required>
          <Input
            id="k-name"
            value={form.name}
            onChange={(evento) => setForm({ ...form, name: evento.target.value })}
            placeholder="Cumplimiento de seguridad"
            maxLength={120}
          />
        </Field>

        <Field
          htmlFor="k-desc"
          label="Que se espera"
          hint="Lo lee quien califica, en el momento de calificar. Es lo que hace que dos jefes evaluen parecido."
        >
          <Textarea
            id="k-desc"
            rows={3}
            value={form.description}
            onChange={(evento) => setForm({ ...form, description: evento.target.value })}
            maxLength={500}
          />
        </Field>

        <Field
          htmlFor="k-scale"
          label="Escala"
          hint={
            competencia
              ? 'No se puede cambiar si ya hay evaluaciones respondidas: cambiaria lo que significan.'
              : ESCALAS[form.scale].ayuda
          }
        >
          <Select
            id="k-scale"
            value={form.scale}
            onChange={(evento) => setForm({ ...form, scale: evento.target.value as EscalaCompetencia })}
          >
            {(Object.keys(ESCALAS) as EscalaCompetencia[]).map((escala) => (
              <option key={escala} value={escala}>
                {ESCALAS[escala].label}
              </option>
            ))}
          </Select>
        </Field>

        {competencia ? (
          <Casilla
            checked={form.active}
            onChange={(valor) => setForm({ ...form, active: valor })}
            label="Activa"
            hint="Una competencia inactiva no se puede anadir a formularios nuevos, y sigue viendose en las evaluaciones ya respondidas."
          />
        ) : null}
      </div>
    </Modal>
  );
}

/**
 * ARMAR EL FORMULARIO, CON LA VISTA PREVIA AL LADO (2026-09-02).
 *
 * ─── DOS COLUMNAS, Y LA PREVIA SIEMPRE PUESTA ───
 *
 * Estaba escondida detras de "Ver como lo vera quien califique", y una vista previa que hay que ir
 * a buscar no se mira: se arma el formulario marcando casillas y se descubre como quedo con el
 * ciclo ya abierto. En una ventana ancha cabe entera al lado — se marca una competencia y aparece
 * ahi mismo, que es cuando sirve.
 *
 * ─── "A QUIEN SE LE HACE" SE PREGUNTA, NO SE DEDUCE DE UN VACIO ───
 *
 * Antes, no marcar ningun cargo significaba "toda la empresa". Funcionaba con cinco cargos en
 * pantalla; con cuarenta, la lista se come la ventana y ademas un vacio se lee igual de bien como
 * "todavia no elegi" que como "no aplica a nadie". Ahora se elige primero ENTRE DOS —toda la
 * empresa, o unos cargos— y solo entonces aparece el selector, con buscador cuando hay muchos y
 * con lo elegido arriba como pastillas que se quitan de una en una.
 */
function ArmarFormulario({
  formulario,
  formularios,
  competencias,
  onCerrar,
  onGuardado,
}: {
  formulario: Formulario | null;
  /** Todos los formularios: de ahi salen los que pueden hacer de base. */
  formularios: Formulario[];
  competencias: Competencia[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { showToast } = useToast();
  const [nombre, setNombre] = useState(formulario?.name ?? `Desempeno ${new Date().getFullYear()}`);
  const [pesos, setPesos] = useState<Record<string, number>>(() =>
    Object.fromEntries((formulario?.items ?? []).map((item) => [item.competencyId, item.weight])),
  );
  const [cargos, setCargos] = useState<string[]>(
    () => (formulario?.jobTitles ?? []).map((fila) => fila.jobTitleId),
  );
  // Un formulario guardado sin cargos ES el general; uno nuevo empieza siendo general.
  const [alcance, setAlcance] = useState<'EMPRESA' | 'CARGOS'>(
    (formulario?.jobTitles?.length ?? 0) > 0 ? 'CARGOS' : 'EMPRESA',
  );
  const [buscaCargo, setBuscaCargo] = useState('');
  const [baseId, setBaseId] = useState<string | null>(formulario?.baseFormId ?? null);
  const [cargosDisponibles, setCargosDisponibles] = useState<CatalogRow[]>([]);
  const [guardando, setGuardando] = useState(false);
  const bloqueado = (formulario?._count.cycleForms ?? 0) > 0;
  const [duplicando, setDuplicando] = useState(false);
  const soloLectura = bloqueado && !duplicando;

  useEffect(() => {
    void listCatalog('job-titles')
      .then((filas) => setCargosDisponibles(filas.filter((fila) => fila.active)))
      .catch(() => undefined);
  }, []);

  /*
    QUIEN PUEDE HACER DE BASE: los que no heredan de nadie, y nunca este mismo.

    Un solo nivel a proposito. Y si de ESTE ya cuelgan otros formularios, no puede colgar el: seria
    una cadena, que es lo que no se puede leer de un vistazo ni explicar en la reunion anual.
  */
  const esBaseDeOtros = (formulario?._count.derivados ?? 0) > 0;
  const candidatasABase = formularios.filter(
    (otro) => otro.id !== formulario?.id && otro.baseFormId === null && otro.active,
  );
  const base = baseId ? (formularios.find((otro) => otro.id === baseId) ?? null) : null;
  const heredadas = base?.items ?? [];
  const idsHeredados = new Set(heredadas.map((item) => item.competencyId));

  const elegidas = Object.keys(pesos);
  const elegidos = cargosDisponibles.filter((cargo) => cargos.includes(cargo.id));
  const termino = buscaCargo.trim().toLowerCase();
  const candidatos = cargosDisponibles
    .filter((cargo) => !cargos.includes(cargo.id))
    .filter((cargo) => (termino ? cargo.name.toLowerCase().includes(termino) : true));

  // Elegir "unos cargos" y no marcar ninguno guardaria un formulario general sin querer.
  const faltaElegirCargo = alcance === 'CARGOS' && cargos.length === 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarFormulario(duplicando ? null : (formulario?.id ?? null), {
        name: nombre.trim(),
        active: true,
        items: elegidas.map((competencyId) => ({ competencyId, weight: pesos[competencyId] ?? 1 })),
        jobTitleIds: alcance === 'EMPRESA' ? [] : cargos,
        baseFormId: baseId,
      });
      onGuardado();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar el formulario',
        description: porQueNoSePudo(error),
      });
    } finally {
      setGuardando(false);
    }
  };

  const resumen =
    alcance === 'EMPRESA' ? 'toda la empresa' : `${cargos.length} cargo${cargos.length === 1 ? '' : 's'}`;

  return (
    <Modal
      open
      size="lg"
      icon={ListChecks}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={duplicando ? 'Copia del formulario' : formulario ? 'Editar formulario' : 'Nuevo formulario'}
      description={
        soloLectura
          ? 'Ya lo uso un ciclo, asi que no se puede cambiar. Puedes duplicarlo y editar la copia.'
          : 'Marca las competencias, ajusta cuanto pesa cada una y di a quien se le hace.'
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {elegidas.length + heredadas.length === 0
              ? 'Marca al menos una competencia.'
              : faltaElegirCargo
                ? 'Elige al menos un cargo, o cambialo a toda la empresa.'
                : `${elegidas.length + heredadas.length} competencia${
                    elegidas.length + heredadas.length === 1 ? '' : 's'
                  }${heredadas.length > 0 ? ` (${heredadas.length} comunes)` : ''} en ${resumen}`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCerrar}>
              {soloLectura ? 'Cerrar' : 'Cancelar'}
            </Button>
            {/*
              DUPLICAR SIEMPRE, no solo cuando esta bloqueado (2026-09-02).

              Estaba solo como salida de "este formulario ya lo uso un ciclo". Con cuarenta cargos,
              armar el numero 12 desde cero cuando se parece al 11 es media hora tirada: se duplica
              el parecido y se cambian dos competencias. Es la misma accion, disponible antes de
              necesitarla.
            */}
            {formulario && !duplicando ? (
              <Button
                variant={soloLectura ? 'primary' : 'outline'}
                onClick={() => {
                  setDuplicando(true);
                  setNombre((actual) => `${actual} (copia)`);
                }}
              >
                <Copy size={16} />
                Duplicar
              </Button>
            ) : null}
            {soloLectura ? null : (
              <Button
                loading={guardando}
                disabled={
                  elegidas.length + heredadas.length === 0 || nombre.trim().length < 3 || faltaElegirCargo
                }
                onClick={guardar}
              >
                Guardar
              </Button>
            )}
          </div>
        </div>
      }
    >
      {soloLectura ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm leading-relaxed text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            Este formulario ya lo uso{' '}
            <strong>
              {formulario?._count.cycleForms} ciclo{formulario?._count.cycleForms === 1 ? '' : 's'}
            </strong>
            . Cambiarlo ahora cambiaria la pregunta debajo de respuestas que ya se dieron, asi que
            queda como esta. <strong>Duplicalo</strong> y edita la copia: los ciclos viejos siguen
            diciendo lo que decian, y el proximo usa el nuevo.
          </span>
        </p>
      ) : null}

      {duplicando ? (
        <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm leading-relaxed text-ok">
          Estas editando una <strong>copia</strong>. Al guardar se crea un formulario nuevo y el
          original no se toca.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Field htmlFor="f-name" label="Nombre" required>
            <Input id="f-name" value={nombre} onChange={(evento) => setNombre(evento.target.value)} maxLength={120} />
          </Field>

          {/*
            LAS DOS CAPAS (Decision #141), y en este orden en la pantalla porque es el orden en que
            se responden: primero lo de toda la empresa, despues lo del cargo.

            Con cuarenta cargos, repetir "seguridad" y "trabajo en equipo" dentro de cada formulario
            obliga a editar cuarenta el dia que una cambie —y el que se olvide se evalua distinto
            sin que nadie lo note—. Heredando, se cambia en un sitio y el proximo ciclo lo recoge.
          */}
          <div>
            <Field
              htmlFor="f-base"
              label="Competencias comunes"
              hint={
                esBaseDeOtros
                  ? 'De este formulario ya cuelgan otros, asi que el no puede colgar de ninguno.'
                  : 'Las que se le preguntan a todo el mundo. Se escriben UNA vez y se heredan.'
              }
            >
              <Select
                id="f-base"
                value={baseId ?? ''}
                disabled={soloLectura || esBaseDeOtros}
                onChange={(evento) => setBaseId(evento.target.value || null)}
              >
                <option value="">Ninguna: este formulario lleva solo lo suyo</option>
                {candidatasABase.map((otro) => (
                  <option key={otro.id} value={otro.id}>
                    Heredar de: {otro.name} ({otro.items.length})
                  </option>
                ))}
              </Select>
            </Field>

            {heredadas.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-xl bg-paper p-3">
                {heredadas.map((item) => (
                  <li key={item.competencyId} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink-700">{item.competency.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {ESCALAS[item.competency.scale].label}
                      {item.weight > 1 ? ` · pesa x${item.weight}` : ''}
                    </span>
                  </li>
                ))}
                <li className="pt-1 text-xs leading-relaxed text-ink-500">
                  Se editan en <strong>{base?.name}</strong>. Al cambiarlas ahi, el proximo ciclo las
                  usa en todos los formularios que las heredan.
                </li>
              </ul>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-medium text-ink-900">
              {heredadas.length > 0 ? 'Competencias propias de este cargo' : 'Competencias'}
            </p>
            <p className="mb-2 text-xs text-ink-500">
              El peso multiplica: una competencia con peso 3 arrastra el triple en la nota final.
            </p>
            <ul className="space-y-1.5">
              {/*
                LAS QUE YA VIENEN HEREDADAS NO SE OFRECEN: marcarlas preguntaria dos veces lo mismo
                en la misma evaluacion y contaria doble en la nota. El servidor tambien lo rechaza.
              */}
              {competencias
                .filter((competencia) => !idsHeredados.has(competencia.id))
                .map((competencia) => {
                const marcada = competencia.id in pesos;
                return (
                  <li
                    key={competencia.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-150',
                      marcada ? 'border-transparent bg-primary-soft' : 'border-line',
                    )}
                  >
                    <label className="flex min-w-0 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={(evento) =>
                          setPesos((previo) => {
                            const siguiente = { ...previo };
                            if (evento.target.checked) siguiente[competencia.id] = 1;
                            else delete siguiente[competencia.id];
                            return siguiente;
                          })
                        }
                        className="h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand-primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink-900">{competencia.name}</span>
                        <span className="block text-xs text-ink-500">{ESCALAS[competencia.scale].label}</span>
                      </span>
                    </label>

                    {marcada ? (
                      <label className="flex items-center gap-2 text-xs text-ink-500">
                        Peso
                        <Select
                          value={String(pesos[competencia.id] ?? 1)}
                          onChange={(evento) =>
                            setPesos((previo) => ({ ...previo, [competencia.id]: Number(evento.target.value) }))
                          }
                          className="h-8 w-16"
                        >
                          {[1, 2, 3, 4, 5].map((peso) => (
                            <option key={peso} value={peso}>
                              {peso}
                            </option>
                          ))}
                        </Select>
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-ink-900">A quien se le hace</p>
            <p className="mb-2 text-xs text-ink-500">
              Lo que se le pregunta a un conductor no es lo que se le pregunta a un analista. Dentro
              de una misma campana, cada persona responde el formulario de su cargo.
            </p>

            <div className="inline-flex rounded-full bg-paper p-1">
              <PastillaAlcance activa={alcance === 'EMPRESA'} onClick={() => setAlcance('EMPRESA')}>
                Toda la empresa
              </PastillaAlcance>
              <PastillaAlcance activa={alcance === 'CARGOS'} onClick={() => setAlcance('CARGOS')}>
                Solo algunos cargos
              </PastillaAlcance>
            </div>

            {alcance === 'EMPRESA' ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                Sera el formulario <strong>general</strong> del ciclo: recoge a quien no encaje en
                ningun otro. Solo puede haber uno general por campana.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {elegidos.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {elegidos.map((cargo) => (
                      <button
                        key={cargo.id}
                        type="button"
                        onClick={() => setCargos((previo) => previo.filter((id) => id !== cargo.id))}
                        className="focus-ring flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:[filter:brightness(1.1)]"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {cargo.name}
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-label={`Quitar ${cargo.name}`} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-medium" style={{ color: 'var(--warn)' }}>
                    Todavia no has elegido ningun cargo.
                  </p>
                )}

                {cargosDisponibles.length > 8 ? (
                  <input
                    type="search"
                    value={buscaCargo}
                    onChange={(evento) => setBuscaCargo(evento.target.value)}
                    placeholder="Buscar un cargo"
                    aria-label="Buscar un cargo"
                    className="focus-ring h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-300"
                  />
                ) : null}

                <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                  {candidatos.map((cargo) => (
                    <button
                      key={cargo.id}
                      type="button"
                      onClick={() => setCargos((previo) => [...previo, cargo.id])}
                      className="focus-ring flex items-center gap-1 rounded-full bg-paper px-3 py-1.5 text-xs text-ink-700 transition-colors duration-150 hover:bg-primary-soft hover:text-ink-900"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      {cargo.name}
                    </button>
                  ))}
                  {candidatos.length === 0 ? (
                    <p className="text-xs text-ink-300">
                      {termino ? 'Ningun cargo coincide.' : 'Ya estan todos elegidos.'}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/*
          LA COLUMNA DE LA DERECHA: como lo vera quien califique, sin pulsar nada.

          Se queda pegada arriba al desplazar la lista de competencias: se marca una abajo y se ve
          aparecer arriba. Es lo mismo que hace el editor de examenes, y por el mismo motivo — armar
          es marcar casillas, pero lo que importa es lo que llega a los ojos de quien evalua.
        */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-2xl border border-line bg-paper p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Asi lo vera quien califique
            </p>

            {elegidas.length === 0 && heredadas.length === 0 ? (
              <p className="mt-3 text-sm leading-relaxed text-ink-300">
                Marca una competencia y aparece aqui.
              </p>
            ) : (
              <div className="mt-3 space-y-5">
                {/*
                  LA PREVIA MUESTRA LAS DOS CAPAS JUNTAS Y EN ORDEN, que es exactamente lo que va a
                  ver quien califique: si solo ensenara las propias, se armaria el formulario
                  creyendo que pregunta tres cosas cuando pregunta seis.
                */}
                {[
                  ...heredadas.map((item) => ({
                    competencia: item.competency,
                    peso: item.weight,
                    heredada: true,
                  })),
                  ...elegidas.flatMap((competencyId) => {
                    const competencia = competencias.find((fila) => fila.id === competencyId);
                    return competencia
                      ? [{ competencia, peso: pesos[competencyId] ?? 1, heredada: false }]
                      : [];
                  }),
                ].map(({ competencia, peso, heredada }) => {
                  const competencyId = competencia.id;
                  const tope = ESCALAS[competencia.scale].tope;
                  return (
                    <div key={competencyId}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-display text-sm font-semibold text-ink-900">
                          {competencia.name}
                          {heredada ? (
                            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-300">
                              comun
                            </span>
                          ) : null}
                        </p>
                        {peso > 1 ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                          >
                            x{peso}
                          </span>
                        ) : null}
                      </div>
                      {competencia.description ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{competencia.description}</p>
                      ) : null}
                      {tope === null ? (
                        <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-300">
                          Se responde escribiendo
                        </p>
                      ) : (
                        <div className="mt-2">
                          <Escala
                            max={tope}
                            forma="numbers"
                            valor={null}
                            disabled
                            onPick={() => undefined}
                            extremos={['Muy por debajo', 'Sobresaliente']}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/** Las dos formas de decir a quien se le hace. Misma pastilla que el resto del producto. */
function PastillaAlcance({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
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
