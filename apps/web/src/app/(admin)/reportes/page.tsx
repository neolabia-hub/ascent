'use client';

import { Activity, ArrowLeft, Award, CalendarClock, Download, PieChart, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ESTADOS,
  descargarEjecucionDeActividadXlsx,
  descargarEjecucionGeneralXlsx,
  getEjecucionDeActividad,
  getEjecucionGeneral,
  type EstadoEjecucion,
  type FilaGeneral,
  type FilaPersona,
  type ResumenEjecucion,
  conteoPorEstado,
} from '@/lib/reports-api';
import { descargarPdf } from '@/lib/certificates-api';
import { BarraEjecucion, ChipEstado } from '@/components/modules/admin/barra-ejecucion';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useCan } from '@/components/providers/session-provider';
import { Analitica } from '@/components/modules/admin/analitica';
import { Vencimientos } from '@/components/modules/admin/vencimientos';
import { motivoDelError } from '@/lib/api';
import { usePaginacion } from '@/components/ui/use-paginacion';

/**
 * SEGUIMIENTO DE LA EJECUCION (Decision #122).
 *
 * ─── EL HUECO QUE CIERRA ───
 *
 * Habia porcentajes —cumplimiento y cobertura del plan— y **ninguna forma de abrirlos**. Quien
 * administra veia "62%" y no podia contestar lo unico que sigue: *"el 38%, ¿quienes son?"*. Sin eso
 * el indicador no sirve para actuar: no se sabe a quien llamar, ni siquiera si hay a quien llamar.
 *
 * ─── DOS NIVELES, Y EL SEGUNDO ES EL QUE IMPORTA ───
 *
 * Arriba, todas las formaciones con obligaciones vivas, ordenadas **por lo que hay que mirar** y no
 * alfabeticamente. Dentro, persona por persona: en que va, cuantos intentos, que nota, si respondio
 * la encuesta y si tiene constancia.
 *
 * ─── LA DISTINCION QUE LO JUSTIFICA TODO ───
 *
 * "Atrasada" y "esperando convocatoria" parecen lo mismo en un porcentaje y son opuestas:
 *
 *   ATRASADA   la persona pudo entrar y no entro   ->  hay a quien llamar.
 *   ESPERANDO  nadie la convoco                    ->  no hay a quien llamar; falta programar.
 *
 * Confundirlas hace perseguir a gente que no hizo nada mal, y deja sin hacer lo unico que habria
 * arreglado el numero.
 */
/**
 * TRES PREGUNTAS, TRES PESTANAS.
 *
 *   EJECUCION     "¿como va esta formacion y quien la ha hecho?"  -> para ir detras de alguien.
 *   ANALITICA     "¿donde esta el problema?"                       -> para decidir donde mirar.
 *   VENCIMIENTOS  "¿que se me viene encima?"                       -> para programar el año.
 *
 * Son tres publicos y tres momentos distintos, y por eso son pestanas y no filtros de una misma
 * pantalla: quien entra a decidir no quiere pasar antes por una lista de doscientas formaciones.
 */
type Pestana = 'ejecucion' | 'analitica' | 'vencimientos';

export default function ReportesPage() {
  /*
    LA PESTAÑA SE PUEDE PEDIR POR LA DIRECCION (2026-09-08).

    Inicio dice «3 acreditaciones vencidas» y su enlace tiene que llevar A ESO, no a la pantalla de
    Seguimiento con la pestaña de Ejecucion y doscientas formaciones delante. Un numero que obliga a
    buscar dos veces lo que ya te dijeron es un numero que nadie pulsa.
  */
  const search = useSearchParams();
  const pedida = search.get('vista');
  const [pestana, setPestana] = useState<Pestana>(
    pedida === 'vencimientos' || pedida === 'analitica' ? pedida : 'ejecucion',
  );

  return (
    <div>
      <h1 className="font-display text-[28px] font-semibold text-ink-900">Seguimiento</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        Como va la ejecucion, donde esta el problema y que se vence.
      </p>

      <div className="mt-5 mb-5 inline-flex gap-1 rounded-full bg-paper p-1">
        <TabSeguimiento id="ejecucion" activa={pestana} onSelect={setPestana} icon={Activity} label="Ejecucion" />
        <TabSeguimiento id="analitica" activa={pestana} onSelect={setPestana} icon={PieChart} label="Analitica" />
        <TabSeguimiento
          id="vencimientos"
          activa={pestana}
          onSelect={setPestana}
          icon={CalendarClock}
          label="Vencimientos"
        />
      </div>

      {pestana === 'ejecucion' ? <VistaEjecucion /> : null}
      {pestana === 'analitica' ? <Analitica /> : null}
      {pestana === 'vencimientos' ? <Vencimientos /> : null}
    </div>
  );
}

function TabSeguimiento({
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
  icon: typeof Activity;
}) {
  const seleccionada = activa === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={seleccionada}
      className={cn(
        'focus-ring flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
        // La activa lleva el color de la empresa: una pastilla blanca sobre carril gris claro se
        // distinguia solo por una sombra de un pixel, y en una pantalla clara eso no se ve.
        seleccionada ? 'font-medium text-white shadow-btn-flat' : 'text-ink-500 hover:bg-surface hover:text-ink-900',
      )}
      style={seleccionada ? { backgroundColor: 'var(--brand-primary)' } : undefined}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}

function VistaEjecucion() {
  const router = useRouter();
  const search = useSearchParams();
  const { showToast } = useToast();
  // El boton solo para quien puede exportar: el servidor lo exige, y un boton que siempre responde
  // 403 es peor que no tenerlo.
  const puedeExportar = useCan()('reports:export');
  /** El plan enlaza una formacion concreta: `/reportes?formacion=<id>`. */
  const formacionPedida = search.get('formacion');

  const [datos, setDatos] = useState<{ items: FilaGeneral[]; resumen: ResumenEjecucion } | null>(null);
  const [abierta, setAbierta] = useState<FilaGeneral | null>(null);
  const [busqueda, setBusqueda] = useState('');
  /** El estado por el que se esta mirando. `null` = todas. */
  const [filtro, setFiltro] = useState<EstadoEjecucion | null>(null);
  const [bajando, setBajando] = useState(false);

  /*
    LO QUE SE DESCARGA ES LO QUE SE ESTA MIRANDO —el mismo filtro de estado—, pero NO la busqueda
    por texto: esa es una forma de encontrar algo en pantalla, no un criterio del informe. Un
    archivo con las tres formaciones que contienen "altura" no es un informe de nada.
  */
  const exportar = async () => {
    setBajando(true);
    try {
      await descargarEjecucionGeneralXlsx(filtro);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo generar el archivo', description: motivoDelError(error) });
    } finally {
      setBajando(false);
    }
  };

  useEffect(() => {
    void getEjecucionGeneral()
      .then(setDatos)
      .catch(() => setDatos({ items: [], resumen: vacio() }));
  }, []);

  /*
    EL ENLACE DEL PLAN ABRE LA FORMACION, no la lista entera.

    Llegar desde "Como va" con `?formacion=<id>` y tener que buscarla a mano entre doscientas es el
    enlace incumpliendo lo que promete. Se aplica UNA sola vez —de ahi el ref— para que cerrar el
    detalle devuelva a la lista en lugar de reabrirlo, y el parametro se retira de la URL para que
    recargar no resucite lo que se acaba de cerrar.

    Si la formacion no esta en la lista NO se abre nada y se dice por que: sin obligaciones vivas no
    hay ejecucion que seguir, y dejar la lista entera sin explicacion se lee como un enlace roto.
  */
  const enlaceAplicado = useRef(false);
  useEffect(() => {
    if (enlaceAplicado.current || !formacionPedida || !datos) return;
    enlaceAplicado.current = true;
    const fila = datos.items.find((f) => f.activityId === formacionPedida);
    if (fila) setAbierta(fila);
    else {
      showToast({
        kind: 'info',
        title: 'Esa formacion todavia no tiene seguimiento',
        description: 'Nadie la tiene asignada aun, asi que no hay ejecucion que mostrar.',
      });
    }
    router.replace('/reportes', { scroll: false });
  }, [formacionPedida, datos, router, showToast]);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (datos?.items ?? []).filter((fila) => {
      /*
        AL PULSAR UN ESTADO, SOLO LAS FORMACIONES QUE LO TIENEN.

        "12 atrasadas" no sirve de nada si despues hay que recorrer doscientas filas buscando en
        cuales estan. Pulsar el chip deja las que tienen al menos una, y dentro de cada una el mismo
        chip lleva a los nombres. Del numero a la persona en dos clics.
      */
      if (filtro && conteoPorEstado(fila.resumen)[filtro] === 0) return false;
      if (!texto) return true;
      return (
        fila.activityName.toLowerCase().includes(texto) ||
        (fila.typeName ?? '').toLowerCase().includes(texto) ||
        (fila.processName ?? '').toLowerCase().includes(texto)
      );
    });
  }, [datos, busqueda, filtro]);

  // El filtro VIAJA al detalle: quien pulso "atrasadas" y entra a una formacion viene a ver esas
  // mismas, no la lista entera. Tener que volver a filtrar dentro seria repetir el gesto.
  if (abierta) return <DetalleFormacion fila={abierta} inicial={filtro} onCerrar={() => setAbierta(null)} />;

  if (!datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (datos.items.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Todavia no hay nada que seguir"
        description="Cuando se asignen obligaciones de formacion, aqui se vera como va cada una y quien la ha hecho."
      />
    );
  }

  return (
    <div>
      {/*
        EL EXCEL ES LO QUE SE LLEVA EL AUDITOR. Va arriba y no escondido en un menu: es la accion por
        la que se abre esta pantalla el dia de la auditoria.
      */}
      {puedeExportar ? (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={exportar} loading={bajando}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Exportar a Excel
          </Button>
        </div>
      ) : null}

      {/*
        EL RESUMEN DE TODO, arriba. Es la respuesta a "¿como vamos?" antes de mirar nada mas, y la
        barra hace visible de que esta hecho ese numero: no es lo mismo un 60% con el resto atrasado
        que un 60% con el resto esperando convocatoria.
      */}
      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* Que universo es: no es el del plan, que tiene sus propios indicadores. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Obligaciones cumplidas
            </p>
            <p className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
              {datos.resumen.avancePct}%
            </p>
          </div>
          <p className="text-sm text-ink-500">
            {datos.resumen.terminadas} de {datos.resumen.total} en toda la formacion viva
          </p>
        </div>
        <div className="mt-4">
          <BarraEjecucion resumen={datos.resumen} onFiltrar={setFiltro} activo={filtro} />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">
          {filtro ? `Con ${ESTADOS[filtro].label.toLowerCase()}` : 'Por formacion'}
          <span className="ml-2 text-sm font-normal text-ink-500">{filtradas.length}</span>
        </h2>
        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            placeholder="Buscar formacion, tipo o proceso"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/*
        ORDENADAS POR LO QUE HAY QUE MIRAR —primero lo atrasado, despues lo que espera convocatoria—
        y no alfabeticamente. Con doscientas formaciones, una lista alfabetica obliga a recorrerla
        entera para encontrar el problema, y entonces no se recorre.
      */}
      <div className="mt-3 space-y-2">
        {filtradas.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-300">Ninguna coincide con la busqueda.</p>
        ) : (
          filtradas.map((fila) => (
            <button
              key={fila.activityId}
              type="button"
              onClick={() => setAbierta(fila)}
              className="focus-ring w-full rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: fila.typeColor ?? 'var(--brand-primary)' }}
                    />
                    <p className="truncate font-display text-[15px] font-semibold text-ink-900">{fila.activityName}</p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {[fila.typeName, fila.processName].filter(Boolean).join(' · ')}
                  </p>
                </div>
              <div className="shrink-0 text-right">
                  {/*
                    EL NUMERO GRANDE ES SIEMPRE EL AVANCE, tambien con un filtro puesto.

                    Antes cambiaba de significado —con "Atrasadas" pasaba a ser cuantas atrasadas— y
                    eso obliga a releer la tarjeta cada vez para saber que se esta mirando: el mismo
                    sitio, el mismo tamaño y dos magnitudes distintas. El % queda de ancla estable y
                    el conteo del estado va al lado, mas pequeño y con su color, que es donde el ojo
                    lo busca cuando ya sabe que filtro puso.
                  */}
                  <div className="flex items-baseline justify-end gap-2">
                    {filtro ? (
                      <span
                        className="whitespace-nowrap text-sm font-semibold tabular-nums"
                        style={{ color: ESTADOS[filtro].punto }}
                      >
                        {conteoPorEstado(fila.resumen)[filtro]} {ESTADOS[filtro].label.toLowerCase()}
                      </span>
                    ) : null}
                    <p className="font-display text-lg font-bold leading-none tabular-nums text-ink-900">
                      {fila.resumen.avancePct}%
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {fila.resumen.terminadas}/{fila.resumen.total}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <BarraEjecucion resumen={fila.resumen} compacta />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DetalleFormacion({
  fila,
  inicial,
  onCerrar,
}: {
  fila: FilaGeneral;
  inicial: EstadoEjecucion | null;
  onCerrar: () => void;
}) {
  const { showToast } = useToast();
  const puedeExportar = useCan()('reports:export');
  const [datos, setDatos] = useState<{ items: FilaPersona[]; resumen: ResumenEjecucion } | null>(null);
  const [filtro, setFiltro] = useState<EstadoEjecucion | null>(inicial);
  const [busqueda, setBusqueda] = useState('');
  const [bajando, setBajando] = useState(false);

  const exportar = async () => {
    setBajando(true);
    try {
      await descargarEjecucionDeActividadXlsx(fila.activityId, fila.activityName, filtro);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo generar el archivo', description: motivoDelError(error) });
    } finally {
      setBajando(false);
    }
  };

  useEffect(() => {
    void getEjecucionDeActividad(fila.activityId)
      .then(setDatos)
      .catch(() => setDatos({ items: [], resumen: vacio() }));
  }, [fila.activityId]);

  const personas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (datos?.items ?? []).filter((persona) => {
      if (filtro && persona.estado !== filtro) return false;
      if (!texto) return true;
      return (
        persona.fullName.toLowerCase().includes(texto) ||
        persona.documentNumber.includes(texto) ||
        (persona.area ?? '').toLowerCase().includes(texto)
      );
    });
  }, [datos, filtro, busqueda]);

  const { visibles: personasVisibles, paginador: paginadorPersonas } = usePaginacion(personas);

  return (
    <div>
      <button onClick={onCerrar} className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Seguimiento
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold text-ink-900">{fila.activityName}</h1>
          <p className="mt-1 text-sm text-ink-500">{[fila.typeName, fila.processName].filter(Boolean).join(' · ')}</p>
        </div>
        {/* La lista nominal: cedula, area, estado, nota y constancia. Es la evidencia de la carpeta. */}
        {puedeExportar ? (
          <Button variant="ghost" onClick={exportar} loading={bajando}>
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Exportar a Excel
          </Button>
        ) : null}
      </div>

      {!datos ? (
        <Skeleton className="mt-6 h-64 w-full rounded-xl" />
      ) : (
        <>
          {/* Los chips filtran la tabla: es la forma de pasar del numero a la gente en un clic. */}
          <section className="card mt-6 p-5">
            <BarraEjecucion resumen={datos.resumen} onFiltrar={setFiltro} activo={filtro} />
          </section>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">
              {personas.length} de {datos.items.length} personas
              {filtro ? ` · ${ESTADOS[filtro].label}` : ''}
            </p>
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre, cedula o area"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div className="card mt-3 overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Nombre</Th>
                  <Th>Area</Th>
                  <Th>Estado</Th>
                  <Th>Vence</Th>
                  <Th>Intentos</Th>
                  <Th>Nota</Th>
                  <Th>Encuesta</Th>
                  <Th>Constancia</Th>
                </Tr>
              </THead>
              <TBody>
                {personas.length === 0 ? (
                  <Tr>
                    <Td colSpan={8}>
                      <p className="py-8 text-center text-sm text-ink-300">Nadie en este filtro.</p>
                    </Td>
                  </Tr>
                ) : (
                  personasVisibles.map((persona) => <FilaPersonaTabla key={persona.assignmentId} persona={persona} />)
                )}
              </TBody>
            </Table>
            {paginadorPersonas}
          </div>
        </>
      )}
    </div>
  );
}

function FilaPersonaTabla({ persona }: { persona: FilaPersona }) {
  const [bajando, setBajando] = useState(false);

  return (
    <Tr>
      <Td>
        <p className="font-medium text-ink-900">{persona.fullName}</p>
        <p className="text-xs tabular-nums text-ink-500">{persona.documentNumber}</p>
      </Td>
      <Td>
        <p className="text-sm text-ink-700">{persona.area ?? '—'}</p>
        <p className="text-xs text-ink-500">{persona.jobTitle ?? ''}</p>
      </Td>
      <Td>
        <ChipEstado estado={persona.estado} />
      </Td>
      <Td>
        {/*
          A quien NO puede entrar no se le enseña fecha limite: es la misma acusacion absurda que se
          corrigio en la pantalla del aprendiz —reclamar un plazo a quien nunca pudo empezar—.
        */}
        <span className={cn('text-sm', persona.estado === 'ATRASADA' ? 'font-medium text-warn' : 'text-ink-700')}>
          {persona.estado === 'ESPERANDO' || !persona.dueAt
            ? '—'
            : new Date(persona.dueAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })}
        </span>
      </Td>
      <Td>
        <span className="text-sm tabular-nums text-ink-700">{persona.intentos > 0 ? persona.intentos : '—'}</span>
      </Td>
      <Td>
        {/* `null` no es cero: es que no hubo examen. Un 0% diria que lo fallo entero. */}
        <span className="text-sm font-medium tabular-nums text-ink-900">
          {persona.mejorNota === null ? '—' : `${Math.round(persona.mejorNota)}%`}
        </span>
      </Td>
      <Td>
        {!persona.respondioEncuesta ? (
          <span className="text-sm text-ink-300">—</span>
        ) : (
          <span
            className={cn(
              'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
              persona.encuesta === 'NEGATIVE' ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok',
            )}
          >
            {persona.encuesta === 'NEGATIVE' ? 'Negativa' : persona.encuesta === 'NA' ? 'Respondida' : 'Positiva'}
          </span>
        )}
      </Td>
      <Td>
        {persona.certificadoId ? (
          <Button
            variant="ghost"
            size="sm"
            loading={bajando}
            aria-label={`Descargar la constancia de ${persona.fullName}`}
            onClick={async () => {
              setBajando(true);
              try {
                await descargarPdf(`/certificates/${persona.certificadoId}/pdf`, `${persona.fullName}.pdf`);
              } finally {
                setBajando(false);
              }
            }}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        ) : persona.estado === 'TERMINADA' ? (
          // Terminada y sin constancia no es un error: esta formacion puede no acreditar. Se dice
          // con un icono apagado en vez de con un hueco, que se leeria como que falta algo.
          <span title="Esta formacion no entrega constancia">
            <Award className="h-4 w-4 text-ink-300" strokeWidth={1.75} aria-hidden="true" />
          </span>
        ) : (
          <span className="text-sm text-ink-300">—</span>
        )}
      </Td>
    </Tr>
  );
}

function vacio(): ResumenEjecucion {
  return {
    total: 0, terminadas: 0, enCurso: 0, sinEmpezar: 0, atrasadas: 0,
    reprobadas: 0, esperando: 0, noRealizadas: 0, eximidas: 0, avancePct: 0,
  };
}
