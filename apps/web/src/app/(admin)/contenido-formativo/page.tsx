'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Check, Plus, Search } from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import { consecuenciasDelTipo, readTypeConfig } from '@/lib/activity-type';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { createActivity, listActivities, type ActivitiesPage, type Modality } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityCover } from '@/components/modules/activity-cover';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { TablePagination } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/components/providers/session-provider';

const MODALITY_LABEL: Record<Modality, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HIBRIDA: 'Hibrida',
};

/** Estado que se muestra: manda la version publicada; si no hay, el borrador. */
function versionState(versions: Array<{ status: string; versionNumber: number }>): { kind: StatusPillKind; label: string } {
  const published = versions.find((v) => v.status === 'PUBLISHED');
  if (published) return { kind: 'ok', label: `PUBLICADA v${published.versionNumber}` };
  const draft = versions.find((v) => v.status === 'DRAFT');
  if (draft) return { kind: 'neutral', label: `BORRADOR v${draft.versionNumber}` };
  return { kind: 'neutral', label: 'SIN VERSIÓN' };
}

/** Palabras que no distinguen nada y solo gastan sitio en un codigo. */
const RELLENO = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'PARA', 'A', 'AL', 'CON', 'POR']);

/**
 * Codigo PROPUESTO a partir del nombre. Mayusculas, sin tildes, sin palabras de relleno.
 *
 *   "Manejo defensivo de vehiculos"   -> MANEJO_DEFENSIVO_VEHICULOS
 *   "Sistema de Gestion Integral"     -> SISTEMA_GESTION_INTEGRAL
 *
 * Se quitan "de", "la", "para"... porque sin ellas caben las palabras que de verdad distinguen:
 * antes "Sistema de Gestion Integral" salia SISTEMA_DE_GESTION y se comia justo la que importaba.
 *
 * Sigue siendo una PROPUESTA: si prefieres SGI, lo escribes y no se te vuelve a tocar. Y aqui se
 * puede proponer porque el codigo de una formacion es solo una etiqueta para buscarla; los codigos
 * de los CATALOGOS —areas, procesos, cargos— se escriben a mano a proposito: esos si son la clave
 * con la que casa la carga masiva, y ahi el acierto no puede depender de una heuristica.
 */
function sugerirCodigo(nombre: string): string {
  // OJO con las barras invertidas de estos patrones: estuvieron perdidas y el efecto era sutil y
  // caro. `[^A-Z0-9s]` conserva la letra "s" en vez de los espacios, y `split(/s+/)` parte por la
  // letra "s" en vez de por espacios: el nombre entero salia como UNA palabra, se unia consigo
  // misma y el codigo propuesto quedaba "GESTION DE SERVICIOS" —con espacios—. El servidor exige
  // `^[A-Z0-9_-]+$`, asi que rechazaba la actividad con un generico "revisa los campos" que no
  // apuntaba al campo que fallaba. Se ve al escribir el nombre; no lo ve ninguna prueba, porque
  // todas teclean el codigo a mano.
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const utiles = palabras.filter((palabra) => !RELLENO.has(palabra));
  return (utiles.length > 0 ? utiles : palabras).slice(0, 3).join('_').slice(0, 40);
}

export default function ContenidoFormativoPage() {
  const router = useRouter();
  const search = useSearchParams();
  /** A donde volver cuando la capacitacion este lista. Lo pone quien manda aqui, p. ej. el plan. */
  const volverA = search.get('volverA');
  const { showToast } = useToast();
  const { scopeProcessIds } = useSession();

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivitiesPage | null>(null);
  const [types, setTypes] = useState<CatalogRow[]>([]);
  const [processes, setProcesses] = useState<CatalogRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(search.get('nueva') === '1');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    codeTouched: false,
    codeOpen: false,
    code: '',
    name: '',
    activityTypeId: '',
    processId: '',
  });

  const load = useCallback(async () => {
    try {
      setData(await listActivities({ q: q || undefined, activityTypeId: typeFilter || undefined, page }));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar el contenido formativo', description: motivoDelError(error) });
    }
  }, [q, typeFilter, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCatalog('activity-types').then((rows) => {
      const activos = rows.filter((row) => row.active);
      setTypes(activos);
      /**
       * EL TIPO VIENE PUESTO CUANDO QUIEN MANDA AQUI YA LO SABE.
       *
       * El plan envia `tipo=PLAN`: quien pulso "capacitacion nueva" dentro del plan de 2026 esta
       * creando una capacitacion DEL PLAN, no hay nada que preguntarle. Sin esto el desplegable
       * abria en blanco y era facil crearla como extraordinaria — que se ve igual en el listado y
       * no cuenta para ningun indicador del plan—.
       */
      const code = search.get('tipo');
      const propuesto = code ? activos.find((row) => row.code === code) : null;
      if (propuesto) setForm((previo) => (previo.activityTypeId ? previo : { ...previo, activityTypeId: propuesto.id }));
    });
    void listCatalog('processes').then((rows) => {
      // SOLO LOS PROCESOS QUE ESTA PERSONA PUEDE USAR.
      //
      // El desplegable enseñaba los 13 de la empresa a quien solo puede crear en el suyo, y el
      // servidor rechazaba el guardado con un generico "revisa los campos" que no decia cual.
      // Ofrecer una opcion que va a fallar es peor que no ofrecerla: el error llega tarde, en
      // otro idioma y sin senalar el campo.
      //
      // OJO: `null` es SIN ACOTAR y `[]` es acotada a NINGUNO. Leer el vacio como "ve todo" —que
      // es como estaba escrito en el primer intento— le abre la empresa entera a quien no tiene
      // nada asignado, y ademas dejaba la lista vacia para el administrador (su alcance es null).
      const activos = rows.filter(
        (row) => row.active && (scopeProcessIds === null || scopeProcessIds.includes(row.id)),
      );
      setProcesses(activos);
      // Si esta persona gestiona UN solo proceso, ese es el suyo y no hay nada que preguntar:
      // se deja puesto. Con varios no se elige por ella, porque acertar la mitad de las veces es
      // peor que no elegir: nadie revisa un campo que ya viene lleno.
      const unico = activos.length === 1 ? activos[0] : null;
      if (unico) setForm((previo) => ({ ...previo, processId: unico.id }));
    });
  }, [scopeProcessIds, search]);

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      // Ni descripcion ni modalidad se piden aqui: la descripcion se escribe mejor con el
      // contenido delante, y la modalidad la decide cada jornada. Pedirlas en el alta es cobrar
      // dos campos por adelantado a cambio de nada.
      const activity = await createActivity({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        activityTypeId: form.activityTypeId,
        processId: form.processId,
      });
      showToast({ kind: 'success', title: 'Actividad creada', description: 'Se abrio su versión 1 en borrador.' });
      // `volverA` se arrastra: quien vino del plan a crear la capacitacion tiene que poder
      // regresar a el cuando la termine, sin acordarse de por donde entro.
      router.push(
        volverA
          ? `/contenido-formativo/${activity.id}?volverA=${encodeURIComponent(volverA)}`
          : `/contenido-formativo/${activity.id}`,
      );
    } catch (error) {
      // Cada motivo, con su frase y senalando el campo. "Revisa los campos" para todo obligaba a
      // adivinar cual: el codigo con un caracter raro, el proceso fuera del alcance y un fallo de
      // red se leian exactamente igual.
      const mensajes: Record<string, string> = {
        DUPLICATE_CODE: 'Ya existe una actividad con ese codigo. Cambialo en "Codigo".',
        VALIDATION_ERROR:
          'El codigo solo admite mayusculas, numeros, guion y guion bajo. Abrelo en "Codigo" y corrigelo.',
        FORBIDDEN: 'No puedes crear formaciones en ese proceso.',
        PROCESS_NOT_FOUND: 'Ese proceso ya no existe o no esta a tu alcance.',
      };
      setFormError(
        error instanceof ApiError
          ? (mensajes[error.code] ?? `No se pudo crear la actividad (${error.code}).`)
          : 'No se pudo crear la actividad: no hubo respuesta del servidor.',
      );
    } finally {
      setCreating(false);
    }
  };

  /** El tipo elegido, para poder ENSENAR lo que implica antes de crear nada. */
  const tipoElegido = types.find((row) => row.id === form.activityTypeId) ?? null;
  const valid = form.code.trim().length >= 2 && form.name.trim().length >= 3 && form.activityTypeId && form.processId;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Contenido formativo</h1>
          <p className="mt-1 text-sm text-ink-500">
            Actividades formativas del catalogo. Cada una guarda sus versiones: publicar congela lo que la gente cursa.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus size={16} />
          Nueva actividad
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o código"
            className="w-72 pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={BookOpen}
            title="Sin actividades todavía"
            description="Crea la primera actividad formativa: una inducción, una capacitación del plan o una píldora."
            action={
              <Button onClick={() => setDrawerOpen(true)}>
                <Plus size={16} />
                Nueva actividad
              </Button>
            }
          />
        </div>
      ) : (
        // Tarjetas y no tabla: una formacion se reconoce por su portada mucho antes que por su
        // fila, y el administrador ve las MISMAS portadas que ve su gente. Una tabla obliga a
        // leer; un catalogo se reconoce.
        <div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((activity, index) => {
              const state = versionState(activity.versions);
              return (
                <Link
                  key={activity.id}
                  href={`/contenido-formativo/${activity.id}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  className="focus-ring animate-card-in block overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-150 ease-pulse hover:shadow-card-hover"
                >
                  <ActivityCover
                    seed={activity.id}
                    colorHex={activity.activityType.colorHex}
                    label={activity.activityType.name}
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink-900">
                        {activity.name}
                      </h3>
                      <StatusPill kind={state.kind} label={state.label} />
                    </div>
                    <p className="mt-2 truncate text-sm text-ink-500">
                      {activity.process.name} · {MODALITY_LABEL[activity.modality]}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-300">{activity.code}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="card mt-4">
            <TablePagination
              from={from}
              to={to}
              total={data.total}
              canPrevious={page > 1}
              canNext={to < data.total}
              onPrevious={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </div>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Nueva actividad formativa"
        description="Se crea con su versión 1 en borrador, lista para armar el contenido."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={creating} disabled={!valid}>
              Crear actividad
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            EL TIPO VA PRIMERO, y no es un campo mas de la lista.

            El tipo decide a quien se le exige, como se dicta y si certifica: preguntarlo al final
            —donde estaba— obliga a rellenar un formulario que todavia no sabe cual es. Y debajo se
            ensena lo que implica, porque la primera senal de que "induccion general" obliga a la
            empresa entera no puede ser que ya la obligo.
          */}
          <Field htmlFor="a-type" label="Tipo de formación" required hint="Decide a quien se le exige y como se dicta.">
            <Select id="a-type" value={form.activityTypeId} onChange={(e) => setForm({ ...form, activityTypeId: e.target.value })}>
              <option value="">Seleccionar...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>

          {tipoElegido ? (
            <ul className="space-y-1.5 rounded-lg border border-line bg-paper px-4 py-3">
              {consecuenciasDelTipo(readTypeConfig(tipoElegido.config)).map((frase) => (
                <li key={frase} className="flex items-start gap-2 text-sm text-ink-700">
                  <Check size={14} className="mt-0.5 shrink-0 text-ok" strokeWidth={2} />
                  {frase}
                </li>
              ))}
            </ul>
          ) : null}

          <Field htmlFor="a-name" label="Nombre" required>
            <Input
              id="a-name"
              value={form.name}
              onChange={(e) =>
                setForm((previo) => ({
                  ...previo,
                  name: e.target.value,
                  // El codigo se PROPONE desde el nombre y se deja editar. Escribirlo a mano era un
                  // paso que nadie sabia como resolver ("¿que pongo aqui?") para un dato que casi
                  // siempre es el nombre en mayusculas. Si ya lo tocaron, no se pisa.
                  code: previo.codeTouched ? previo.code : sugerirCodigo(e.target.value),
                }))
              }
              maxLength={200}
            />
          </Field>

          <Field htmlFor="a-process" label="Proceso" required hint="Sistema de gestion que la origina. De el se hereda el responsable.">
            <Select id="a-process" value={form.processId} onChange={(e) => setForm({ ...form, processId: e.target.value })}>
              <option value="">Seleccionar...</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>

          {/*
            EL CODIGO, PLEGADO. Es obligatorio y no se puede cambiar despues, pero ya viene
            propuesto desde el nombre y casi nadie lo toca: tenerlo abierto le cobra a todo el
            mundo un campo que solo le importa a quien tiene una nomenclatura propia. Se enseña
            siempre cual quedo —plegado no es escondido— y se abre de un clic.
          */}
          {form.codeOpen ? (
            <Field htmlFor="a-code" label="Código" required hint="Identificador corto y estable. No se puede cambiar.">
              <Input
                id="a-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase(), codeTouched: true })}
                placeholder="IND_GENERAL"
                maxLength={40}
              />
            </Field>
          ) : (
            <button
              type="button"
              id="a-code-open"
              onClick={() => setForm({ ...form, codeOpen: true })}
              className="focus-ring flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-sm text-ink-500 transition-colors duration-150 hover:text-ink-900"
            >
              <span>
                Codigo: <span className="font-medium text-ink-700">{form.code || 'se propone del nombre'}</span>
              </span>
              <span className="text-xs">Cambiar</span>
            </button>
          )}

          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
