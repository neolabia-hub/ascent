'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarRange, ClipboardList, Plus, Target, Trash2 } from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import { createPlan, deletePlan, listPlans, type PlanRow, type PlanStatus } from '@/lib/delivery-api';
import { formatDate, monthName } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useCan } from '@/components/providers/session-provider';

/**
 * LOS PLANES, UNO POR ANO.
 *
 * Esto era una tabla de seis columnas —nombre, año, renglones, aprobado, estado, accion— y no
 * respondia la pregunta por la que alguien entra aqui, que no es "¿que planes hay?" sino **"¿como
 * vamos?"**. Para saberlo habia que abrir el plan. Con la Decision #71 la lista es cortisima (una
 * fila por año, y normalmente una o dos), asi que la tabla estaba gastando toda la pantalla en
 * repetir el año en seis celdas.
 *
 * Ahora cada año es una TARJETA que trae sus indicadores ya calculados, y la del año en curso
 * viene en grande: es la que se mira. Los numeros son los mismos que dentro del plan —el servidor
 * los calcula con el alcance de quien pregunta—, asi que no hay dos verdades.
 *
 * Y la meta se lee AL LADO del cumplimiento. Un indicador solo —"62%"— deja al lector sin saber
 * si eso es bueno; con la meta, la tarjeta puede decir "faltan 28 puntos" o "cumplida".
 */

const STATUS: Record<PlanStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  APPROVED: { kind: 'info', label: 'APROBADO' },
  ACTIVE: { kind: 'ok', label: 'EN EJECUCIÓN' },
  CLOSED: { kind: 'neutral', label: 'CERRADO' },
};

/** El rotulo por defecto del plan de un año. Se puede cambiar; ya no identifica al plan. */
function nombrePropuesto(year: number): string {
  return `Plan anual de capacitacion ${year}`;
}

/**
 * Los años que se pueden abrir: dos atras (cargar el plan del año pasado como evidencia) y uno
 * adelante (en noviembre se planea el siguiente). Los que YA tienen plan no se ofrecen, porque
 * hay uno por año y elegirlos solo lleva a un rechazo.
 */
function anosDisponibles(plans: PlanRow[] | null): number[] {
  const enCurso = new Date().getFullYear();
  const ocupados = new Set((plans ?? []).map((plan) => plan.year));
  return [enCurso - 2, enCurso - 1, enCurso, enCurso + 1].filter((year) => !ocupados.has(year));
}

/**
 * EL AÑO QUE PROPONE EL BOTON, que no es «el primero de la lista» (2026-09-22).
 *
 * Lo era, y con el plan de 2026 ya creado el boton decia **«Crear el plan de 2024»** — lo vio el
 * cliente en produccion. Los años pasados estan en la lista a proposito (una empresa que llega a
 * mitad de camino carga el plan del año anterior como evidencia), pero **ofrecerlos de primeras es
 * proponer rellenar el pasado**, que no es lo que va a hacer nadie con el plan del año en curso ya
 * abierto. Lo siguiente que se planea es el año que viene.
 *
 * El orden es: el año EN CURSO si esta libre; si no, el siguiente hacia ADELANTE; y solo si no
 * queda ninguno hacia adelante, el pasado mas RECIENTE. Los demas siguen en el desplegable.
 */
function anoPropuesto(plans: PlanRow[] | null): number | undefined {
  const enCurso = new Date().getFullYear();
  const libres = anosDisponibles(plans);
  if (libres.includes(enCurso)) return enCurso;
  const haciaAdelante = libres.filter((year) => year > enCurso);
  if (haciaAdelante.length > 0) return Math.min(...haciaAdelante);
  const haciaAtras = libres.filter((year) => year < enCurso);
  return haciaAtras.length > 0 ? Math.max(...haciaAtras) : undefined;
}

export default function PlanPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Se pide LO MISMO que al editar. El alta preguntaba año, nombre y objetivo, y la meta y el
   * alcance —que son parte del documento que revisa el auditor— habia que acordarse de anadirlos
   * despues desde "Editar". Un campo que solo existe en una de las dos pantallas se queda vacio.
   */
  const [form, setForm] = useState({
    year: String(new Date().getFullYear()),
    name: nombrePropuesto(new Date().getFullYear()),
    nameTouched: false,
    objective: '',
    goalPct: '90',
    scope: '',
  });
  /**
   * Borrar desde el LISTADO y no solo desde la ficha: los planes que estorban son los de prueba,
   * y son varios. Obligar a entrar en cada uno para tirarlo es la friccion que hizo que nadie los
   * limpiara nunca.
   */
  const can = useCan();
  const canDelete = can('plans:approve');
  const [target, setTarget] = useState<PlanRow | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setPlans(await listPlans());
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los planes', description: motivoDelError(error) });
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Al abrir el cajon se propone el mismo año que anuncia el boton: ver `anoPropuesto`. */
  const abrirNuevo = () => {
    const year = anoPropuesto(plans);
    if (year === undefined) {
      showToast({ kind: 'info', title: 'Todos los años a la vista ya tienen su plan' });
      return;
    }
    setForm({
      year: String(year),
      name: nombrePropuesto(year),
      nameTouched: false,
      objective: '',
      goalPct: '90',
      scope: '',
    });
    setOpen(true);
  };

  const create = async () => {
    setBusy(true);
    try {
      const plan = await createPlan({
        year: Number(form.year),
        name: form.name.trim(),
        objective: form.objective.trim() || null,
        goalPct: form.goalPct.trim() ? Number(form.goalPct) : null,
        scope: form.scope.trim() || null,
      });
      showToast({ kind: 'success', title: 'Plan creado', description: 'Agrega los renglones y después apruebalo.' });
      router.push(`/plan/${plan.id}`);
    } catch (error) {
      // "Ya existe el plan de 2026" no es un fallo del que haya que salir: es que ya esta hecho.
      // El servidor devuelve CUAL, asi que se abre en vez de dejar a alguien probando nombres.
      if (error instanceof ApiError && error.code === 'PLAN_YEAR_TAKEN') {
        const existente = plans?.find((row) => row.year === Number(form.year));
        showToast({ kind: 'info', title: error.message });
        if (existente) router.push(`/plan/${existente.id}`);
        await load();
        return;
      }
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo crear el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const result = await deletePlan(target.id, reason.trim() ? { justification: reason.trim() } : {});
      showToast({
        kind: 'success',
        title: 'Plan eliminado',
        description:
          result.revokedAssignments > 0 ? `Se revocaron ${result.revokedAssignments} obligaciones suyas.` : undefined,
      });
      setTarget(null);
      await load();
    } catch (error) {
      // El servidor explica POR QUE no se puede ("ya hay N personas que empezaron"): esa frase es
      // la respuesta, no un error tecnico que haya que traducir a "algo salio mal".
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo eliminar el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  const libres = anosDisponibles(plans);
  const enCurso = new Date().getFullYear();
  const propuesto = anoPropuesto(plans);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Plan de capacitación</h1>
          {/*
            LO QUE HACE EL PLAN, EN DOS FRASES (reescrito el 2026-09-07).

            Tenia una tercera —"los planes de SST, PESV o BASC no son planes aparte: son la vista por
            proceso de este"— que el cliente marco como **falsa**. Era una afirmacion sobre como
            trabaja SU empresa colada en el rotulo de una pantalla, y encima en el sitio donde nadie
            la va a leer con espiritu critico.

            La regla que deja: aqui se dice QUE HACE la pantalla, no como deberia organizarse el
            trabajo de nadie.
          */}
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Un plan por año, con su meta y sus indicadores. Al aprobarlo se congelan los proyectados y nacen las
            obligaciones de quienes lo tienen que cumplir.
          </p>
        </div>
        {/*
          NO se ofrece hasta saber que anos estan libres. Mientras la lista viaja, `libres` los da
          todos por libres, asi que el boton proponia un año ya ocupado y —peor— si alguien abria
          el cajon en ese medio segundo, las opciones del desplegable CAMBIABAN debajo de su mano
          al llegar la respuesta.
        */}
        {plans !== null && propuesto !== undefined ? (
          <Button onClick={abrirNuevo}>
            <Plus size={16} />
            {`Crear el plan de ${propuesto}`}
          </Button>
        ) : null}
      </div>

      {/*
        La lista se anuncia como una REGION que dice si esta ocupada. No es adorno: quien usa
        lector de pantalla oye que hay algo cargando en vez de encontrarse una pagina muda, y de
        paso existe un punto exacto donde esperar. Con solo el esqueleto no bastaba —comprobar que
        "ya no esta" acierta igual cuando todavia no ha llegado a estar—, y por eso el atributo va
        en un contenedor que esta SIEMPRE.
      */}
      <div role="region" aria-label="Planes de capacitación" aria-busy={plans === null}>
      {!plans ? (
        <Skeleton className="h-64 w-full" />
      ) : plans.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={`Todavia no existe el plan de ${enCurso}`}
            description="El plan del año es donde se programa lo que se va a dictar y de donde salen el cumplimiento y la cobertura que revisa el auditor."
            action={
              <Button onClick={abrirNuevo}>
                <Plus size={16} />
                Crear el plan de {enCurso}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              destacado={plan.year === enCurso}
              canDelete={canDelete}
              onDelete={() => {
                setReason('');
                setTarget(plan);
              }}
            />
          ))}
        </div>
      )}
      </div>

      <Drawer
        open={target !== null}
        onOpenChange={(next) => (next ? null : setTarget(null))}
        title={target ? `Eliminar el plan de ${target.year}` : 'Eliminar el plan'}
        description="Desaparece el plan con todos sus renglones. Las capacitaciones y convocatorias que referencia NO se tocan."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={destroy}
              loading={busy}
              disabled={target !== null && target.status !== 'DRAFT' && reason.trim().length < 10}
            >
              <Trash2 size={16} />
              Eliminar el plan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {target && target.status !== 'DRAFT' ? (
            <>
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                Este plan ya fue aprobado: si creo obligaciones, se revocan y desaparecen de la bandeja de esas personas.
                Si alguna ya empezo su formacion, no se podra borrar — ese avance es suyo.
              </p>
              <Field
                htmlFor="d-reason"
                label="Por que se elimina"
                required
                hint="Queda en la auditoria: hubo personas a las que ya se les anuncio esta formación."
              >
                <Textarea
                  id="d-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Mínimo 10 caracteres"
                />
              </Field>
            </>
          ) : (
            <p className="text-sm text-ink-700">Esta en borrador: nunca obligo a nadie, así que se borra sin consecuencias.</p>
          )}
        </div>
      </Drawer>

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Nuevo plan de capacitación"
        description="Hay un plan por año. Queda en borrador: puedes armar sus renglones antes de aprobarlo."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={busy} disabled={form.name.trim().length < 3}>
              Crear plan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            EL ANO SE ELIGE, no se teclea. Es lo que identifica al plan, solo hay un punado de
            valores posibles y los que ya tienen plan no son opciones: escribirlo a mano permitia
            teclear 2062 sin que nada lo notara, y proponia un año ocupado para rechazarlo despues.
          */}
          <Field htmlFor="p-year" label="Año" required hint="Es lo que identifica al plan: hay uno por año.">
            <Select
              id="p-year"
              value={form.year}
              onChange={(event) => {
                const year = event.target.value;
                // El nombre sigue al año mientras nadie lo haya tocado: cambiar 2026 por 2027 y
                // dejar puesto "Plan anual de capacitacion 2026" es un error que nadie relee.
                setForm({
                  ...form,
                  year,
                  name: form.nameTouched ? form.name : nombrePropuesto(Number(year)),
                });
              }}
            >
              {libres.map((year) => (
                <option key={year} value={year}>
                  {year}
                  {year === enCurso ? ' (en curso)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="p-name" label="Nombre" hint="Solo el rotulo. Lo que identifica al plan es el año.">
            <Input
              id="p-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value, nameTouched: true })}
              placeholder={nombrePropuesto(Number(form.year) || enCurso)}
              maxLength={160}
            />
          </Field>

          {/*
            LA META ES UN NUMERO, no un parrafo. Antes "Metas" era texto libre y por eso el plan
            ensenaba "62% de cumplimiento" sin nada contra que compararlo: con la meta puesta, el
            indicador puede decir si se llega o no, que es lo que pregunta el auditor.
          */}
          <Field
            htmlFor="p-goal"
            label="Meta de cumplimiento (%)"
            hint="Cuanto del programa se compromete la empresa a ejecutar este año. Lo habitual es 90."
          >
            <Input
              id="p-goal"
              type="number"
              min={1}
              max={100}
              value={form.goalPct}
              onChange={(event) => setForm({ ...form, goalPct: event.target.value })}
            />
          </Field>

          <Field htmlFor="p-objective" label="Objetivo">
            <Textarea
              id="p-objective"
              rows={3}
              maxLength={4000}
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
            />
          </Field>

          <Field htmlFor="p-scope" label="Alcance">
            <Textarea
              id="p-scope"
              rows={3}
              maxLength={4000}
              value={form.scope}
              onChange={(event) => setForm({ ...form, scope: event.target.value })}
            />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}

/**
 * Una tarjeta por año. La del año en curso viene DESTACADA: es la que se mira, y las de los otros
 * años estan por consulta.
 *
 * La tarjeta entera es un enlace al plan. No hay boton "Abrir": con una accion principal, tener
 * ademas un boton que hace lo mismo solo reparte la atencion.
 */
function PlanCard({
  plan,
  destacado,
  canDelete,
  onDelete,
}: {
  plan: PlanRow;
  destacado: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { metrics } = plan;
  const vacio = plan.itemCount === 0;
  const meta = plan.goalPct;
  // Puntos que faltan para la meta. Se dice en PUNTOS y no en porcentaje del porcentaje: "faltan
  // 28 puntos" se entiende; "falta el 31% de la meta" hay que pararse a pensarlo.
  const faltan = meta !== null ? Math.max(0, meta - metrics.compliancePct) : null;

  const mesActual = new Date().getMonth() + 1;
  const esteMes = metrics.byMonth.find((mes) => mes.month === mesActual);

  return (
    <div className={cn('card card-hover relative overflow-hidden', destacado && 'ring-1 ring-ink-900/10')}>
      {/* `pr-14` deja libre la esquina donde vive el boton de borrar: si el texto pasara por
          debajo, borrar seria un clic a ciegas sobre el nombre del plan. */}
      <Link href={`/plan/${plan.id}`} className="focus-ring block p-5 pr-14">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
          {/* Identidad: el ANO manda, porque es lo que identifica al plan. */}
          <div className="min-w-[13rem] flex-1">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'font-display font-bold tabular-nums text-ink-900',
                  destacado ? 'text-[40px] leading-none' : 'text-[28px] leading-none',
                )}
              >
                {plan.year}
              </span>
              <StatusPill kind={STATUS[plan.status].kind} label={STATUS[plan.status].label} />
            </div>
            <p className="mt-1.5 text-sm font-medium text-ink-900">{plan.name}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {plan.itemCount === 0
                ? 'Sin renglones todavía'
                : `${plan.itemCount} ${plan.itemCount === 1 ? 'jornada programada' : 'jornadas programadas'}`}
              {plan.approvedAt ? ` · aprobado el ${formatDate(plan.approvedAt)}` : ''}
            </p>
          </div>

          {vacio ? (
            <p className="flex-1 self-center text-sm text-ink-500">
              Todavia no tiene nada programado, asi que aun no hay indicadores. Entra y agrega la primera jornada.
            </p>
          ) : (
            <>
              {/* Cumplimiento contra la meta: el indicador del item 1.2.1 de la Res. 0312. */}
              <div className="flex items-center gap-3.5">
                <ProgressRing value={metrics.compliancePct} size={destacado ? 72 : 56} />
                <div className="text-sm">
                  <p className="font-medium text-ink-900">Cumplimiento</p>
                  <p className="text-xs text-ink-500">
                    {metrics.executed} de {metrics.programmed} ejecutadas
                  </p>
                  {meta !== null && faltan !== null ? (
                    <p
                      className={cn(
                        'mt-1 inline-flex items-center gap-1 text-xs font-medium',
                        faltan === 0 ? 'text-ok' : 'text-ink-700',
                      )}
                    >
                      <Target size={12} strokeWidth={2} />
                      {faltan === 0 ? `Meta del ${meta}% cumplida` : `Meta ${meta}% · faltan ${faltan.toFixed(1)} puntos`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-500">Sin meta definida</p>
                  )}
                </div>
              </div>

              {/* Cobertura: a cuanta gente llego de la que tenia que llegar. */}
              <div className="text-sm">
                <p className="font-medium text-ink-900">Cobertura</p>
                <p className="font-display text-[22px] font-bold tabular-nums text-ink-900">{metrics.coveragePct}%</p>
                <p className="text-xs text-ink-500">
                  {metrics.trained} capacitados de {metrics.projected} proyectados
                </p>
              </div>

              {/* Lo unico que cambia semana a semana, y por eso vale la pena decirlo aqui. */}
              <div className="text-sm">
                <p className="inline-flex items-center gap-1.5 font-medium text-ink-900">
                  <CalendarRange size={14} strokeWidth={1.75} />
                  {monthName(mesActual)}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {esteMes
                    ? `${esteMes.executed} de ${esteMes.programmed} ${esteMes.programmed === 1 ? 'jornada' : 'jornadas'} de este mes`
                    : 'Sin jornadas este mes'}
                </p>
                {metrics.cancelled > 0 ? (
                  <p className="mt-0.5 text-xs text-ink-500">
                    {metrics.cancelled} {metrics.cancelled === 1 ? 'cancelada' : 'canceladas'}, fuera del indicador
                  </p>
                ) : null}
              </div>
            </>
          )}

          <div className="self-center pt-6 text-ink-500">
            <ArrowRight size={18} strokeWidth={1.75} />
          </div>
        </div>
      </Link>

      {/* Fuera del enlace: un boton dentro de un <Link> no se puede pulsar sin abrir el plan. */}
      {canDelete && plan.status !== 'CLOSED' ? (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-3 top-3 text-danger"
          aria-label={`Eliminar el plan de ${plan.year}`}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </Button>
      ) : null}
    </div>
  );
}
