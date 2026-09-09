'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Grid3x3, Link2, Search, ShieldX, Users } from 'lucide-react';
import { toggleJobTitleMatrix, type JobTitleMatrix } from '@/lib/delivery-api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { motivoDelError } from '@/lib/api';

/**
 * QUE INDUCCION ESPECIFICA LE TOCA A CADA CARGO.
 *
 * ─── LAS FORMAS QUE NO SON, Y POR QUE ───
 *
 * **Rejilla cargo x formacion** (la original). Obliga a mirar en dos ejes para contestar una
 * pregunta que siempre es de uno: nadie se pregunta "¿esta marcado el cruce de conductor con
 * seguridad vial?", se pregunta "¿que tiene que hacer un conductor?". Con cuarenta cargos y treinta
 * inducciones, encontrar el cruce era la mitad del trabajo.
 *
 * **Acordeon**. Un eje, pero esconde: para saber donde faltan hay que abrir cargo por cargo.
 *
 * **Pastillas en la propia fila**. Todo a la vista, pero editar donde se lee obliga a que la fila
 * sea a la vez resumen y formulario: con ocho inducciones la fila crece hasta tres lineas, la
 * lista deja de poder recorrerse de un vistazo, y el `+` abre un desplegable dentro de una fila
 * estrecha donde los nombres largos no caben.
 *
 * ─── LO QUE ES ───
 *
 * **Se LEE en la lista y se EDITA en la ventana.** La lista contesta de un vistazo la pregunta con
 * la que se entra —"¿a que cargos les falta?"—: una fila por cargo, su gente, las dos primeras
 * inducciones por su nombre y el recuento.
 *
 * Al abrir un cargo, una ventana ANCHA con las dos listas **una al lado de la otra**: a la
 * izquierda lo que ya se le exige, a la derecha lo que se le puede exigir, con casilla para marcar
 * varias de una vez y buscador cuando pasan de ocho. Cada columna se desplaza por su cuenta.
 *
 * Una debajo de otra —que fue el primer intento, en un cajon de 480px— obligaba a bajar hasta el
 * final para ver lo que se podia anadir, justo cuando mas falta comparar las dos. Por eso aqui es
 * ventana ancha y no cajon, contra la regla general de "si tiene campos, cajon": es la misma
 * excepcion que el formulario de desempeno con su vista previa al lado — lo que se arma MIRANDO
 * otra cosa necesita las dos a la vez.
 *
 * Y es el espejo de la pestana "Quienes" de la ficha: alli, "esta formacion, ¿a que cargos?";
 * aqui, "este cargo, ¿que formaciones?". Por debajo escriben el mismo requisito.
 */
export function MatrizDeInducciones({ matrix, onChanged }: { matrix: JobTitleMatrix; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState('');
  /** El cargo abierto en la ventana. */
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Lo marcado en la ventana, todavia sin guardar. */
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [buscaEnVentana, setBuscaEnVentana] = useState('');
  const [retirando, setRetirando] = useState<{ jobTitleId: string; activityId: string; obligados: number } | null>(null);
  const [novedad, setNovedad] = useState('');

  const porCargo = useMemo(() => {
    const mapa = new Map<string, JobTitleMatrix['cells']>();
    for (const celda of matrix.cells) {
      const lista = mapa.get(celda.jobTitleId) ?? [];
      lista.push(celda);
      mapa.set(celda.jobTitleId, lista);
    }
    return mapa;
  }, [matrix.cells]);

  const actividadDe = (activityId: string) => matrix.activities.find((a) => a.id === activityId);
  const cargoDe = (jobTitleId: string | null) => matrix.jobTitles.find((c) => c.id === jobTitleId);

  const busqueda = filtro.trim().toLowerCase();
  const cargos = busqueda
    ? matrix.jobTitles.filter(
        (cargo) =>
          cargo.name.toLowerCase().includes(busqueda) || cargo.jobTitleType.name.toLowerCase().includes(busqueda),
      )
    : matrix.jobTitles;

  /** La cifra con la que se entra: cuantos puestos no tienen nada exigido. */
  const sinNinguna = matrix.jobTitles.filter((cargo) => !porCargo.has(cargo.id)).length;

  const cambiar = async (jobTitleId: string, activityId: string, enabled: boolean, reason?: string) => {
    const resultado = await toggleJobTitleMatrix({ jobTitleId, activityId, enabled, reason: reason ?? null });
    return resultado.generated ?? 0;
  };

  /** Guardar lo marcado: una llamada por induccion, un solo aviso al final. */
  const exigirMarcadas = async () => {
    if (!abierto || marcadas.length === 0) return;
    setBusy(true);
    try {
      let nacidas = 0;
      for (const activityId of marcadas) nacidas += await cambiar(abierto, activityId, true);
      await onChanged();
      setMarcadas([]);
      showToast({
        kind: 'success',
        title: `${marcadas.length} ${marcadas.length === 1 ? 'induccion anadida' : 'inducciones anadidas'} a ${cargoDe(abierto)?.name ?? 'el cargo'}`,
        description: nacidas
          ? `Nacieron ${nacidas} obligaciones para quienes ya tienen el cargo.`
          : 'Todavia no obligan a nadie: nadie tiene ese cargo hoy.',
      });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  const retirar = async () => {
    if (!retirando) return;
    const casilla = retirando;
    const motivo = novedad.trim();
    setRetirando(null);
    setBusy(true);
    try {
      await cambiar(casilla.jobTitleId, casilla.activityId, false, motivo);
      await onChanged();
      showToast({
        kind: 'success',
        title: 'Retirada de ese cargo',
        description: 'Lo pendiente queda retirado; lo que ya se cumplio no se toca.',
      });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo retirar', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  if (matrix.jobTitles.length === 0 || matrix.activities.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Grid3x3}
          title={matrix.activities.length === 0 ? 'Todavia no hay inducciones especificas' : 'Faltan cargos'}
          description={
            matrix.activities.length === 0
              ? 'Aqui se declara que induccion de puesto le toca a cada cargo. Crea la primera formacion de tipo "Induccion especifica" desde Formaciones.'
              : 'Crea al menos un cargo en Configuracion.'
          }
        />
      </div>
    );
  }

  const cargoAbierto = cargoDe(abierto);
  const suyasAbierto = abierto ? (porCargo.get(abierto) ?? []) : [];
  const disponibles = matrix.activities.filter((a) => !suyasAbierto.some((c) => c.activityId === a.id));
  const buscaVentana = buscaEnVentana.trim().toLowerCase();
  const disponiblesFiltradas = buscaVentana
    ? disponibles.filter((a) => a.name.toLowerCase().includes(buscaVentana))
    : disponibles;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <Input
            className="pl-9"
            placeholder="Buscar un cargo"
            aria-label="Buscar un cargo"
            value={filtro}
            onChange={(event) => setFiltro(event.target.value)}
          />
        </div>
        <p className="text-sm text-ink-500">
          {sinNinguna === 0 ? (
            'Todos los cargos tienen su induccion.'
          ) : (
            <>
              <span className="font-medium text-ink-900">{sinNinguna}</span>{' '}
              {sinNinguna === 1 ? 'cargo sin ninguna induccion' : 'cargos sin ninguna induccion'}
            </>
          )}
          {matrix.broaderRules > 0 ? (
            <span title="Requisitos sobre un area, una regional o toda la empresa. No son de un cargo, así que se ven en la ficha de cada formación.">
              {' '}
              · {matrix.broaderRules} sobre grupos mas amplios
            </span>
          ) : null}
        </p>
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {cargos.map((cargo) => {
          const suyas = porCargo.get(cargo.id) ?? [];
          return (
            <button
              key={cargo.id}
              type="button"
              onClick={() => {
                setAbierto(cargo.id);
                setMarcadas([]);
                setBuscaEnVentana('');
              }}
              className="focus-ring flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{cargo.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} strokeWidth={2} />
                    {cargo.people}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{cargo.jobTitleType.name}</span>
                </span>
              </span>

              {/*
                LO QUE SE LE EXIGE, RESUMIDO. Los nombres de las dos primeras y "+N" cuando hay mas:
                un recuento suelto ("3 inducciones") no deja reconocer si falta LA que importa, y la
                lista entera convierte la fila en un parrafo.
              */}
              <span className="hidden min-w-0 max-w-[45%] flex-1 truncate text-sm text-ink-500 sm:block">
                {suyas.length === 0
                  ? '—'
                  : suyas
                      .slice(0, 2)
                      .map((c) => actividadDe(c.activityId)?.name ?? '')
                      .join(' · ') + (suyas.length > 2 ? ` · +${suyas.length - 2}` : '')}
              </span>

              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                  suyas.length > 0 ? 'text-white' : 'bg-paper text-ink-500',
                )}
                style={suyas.length > 0 ? { backgroundColor: 'var(--brand-primary)' } : undefined}
              >
                {suyas.length === 0 ? 'Ninguna' : suyas.length}
              </span>
              <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-ink-500" />
            </button>
          );
        })}

        {cargos.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-500">Ningún cargo se llama así.</p>
        ) : null}
      </div>

      {/*
        LAS DOS LISTAS, UNA AL LADO DE LA OTRA (2026-09-03).

        Estaban una debajo de otra en el cajon de 480px, y con quince inducciones eso obliga a bajar
        hasta el final para ver lo que se puede anadir — justo cuando mas falta comparar las dos. En
        dos columnas se ven a la vez: a la izquierda lo que ya se le exige, a la derecha lo que se le
        puede exigir, y cada una con su propio desplazamiento.

        Por eso es VENTANA ancha y no cajon, contra la regla general de "si tiene campos, cajon": es
        la misma excepcion que ya existe para el formulario de desempeno con su vista previa al lado
        —lo que se arma MIRANDO otra cosa necesita las dos a la vez—, y para eso esta el tamano `lg`.
      */}
      <Modal
        size="lg"
        open={abierto !== null}
        onOpenChange={(open) => {
          if (!open) setAbierto(null);
        }}
        icon={Users}
        title={cargoAbierto?.name ?? ''}
        description={
          cargoAbierto
            ? `${cargoAbierto.people} ${cargoAbierto.people === 1 ? 'persona' : 'personas'} · ${cargoAbierto.jobTitleType.name}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAbierto(null)} disabled={busy}>
              Cerrar
            </Button>
            <Button onClick={() => void exigirMarcadas()} loading={busy} disabled={marcadas.length === 0}>
              {marcadas.length === 0
                ? 'Exigir'
                : `Exigir ${marcadas.length} ${marcadas.length === 1 ? 'induccion' : 'inducciones'}`}
            </Button>
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex min-w-0 flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">Se le exige</h3>
            {suyasAbierto.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Ninguna inducción de puesto todavía.</p>
            ) : (
              // Cada columna se desplaza por su cuenta: si la ventana entera se desplazara, mirar
              // el final de una lista escondería el principio de la otra, que es lo que se venia a
              // arreglar.
              <ul className="mt-2 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {suyasAbierto.map((celda) => {
                  const actividad = actividadDe(celda.activityId);
                  return (
                    <li
                      key={celda.activityId}
                      className="flex items-start gap-3 rounded-lg border border-line bg-paper px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink-900">{actividad?.name ?? 'Formacion'}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                          <span>
                            {celda.assignmentCount === 0
                              ? 'Nadie obligado todavia'
                              : `${celda.assignmentCount} ${celda.assignmentCount === 1 ? 'persona obligada' : 'personas obligadas'}`}
                          </span>
                          {/*
                            SIN CONTENIDO PUBLICADO ES UN DATO, NO UNA ALARMA. Declarar el perfil
                            del cargo antes de tener el contenido es como se arma un piloto: pasa en
                            la mitad de las filas al empezar, y pintar media pantalla de naranja con
                            triangulos de advertencia por algo normal es la forma mas rapida de que
                            nadie mire los avisos que si importan. Se dice, en gris, y ya.
                          */}
                          {actividad && !actividad.published ? <span>Sin contenido publicado</span> : null}
                          {celda.shared ? (
                            <span className="inline-flex items-center gap-1 text-info">
                              <Link2 size={12} strokeWidth={2} />
                              Declarada para varios cargos
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || celda.shared}
                        title={
                          celda.shared
                            ? 'Viene de un requisito de varios cargos: se retira desde la ficha de la formacion.'
                            : undefined
                        }
                        onClick={() => {
                          setNovedad('');
                          setRetirando({
                            jobTitleId: celda.jobTitleId,
                            activityId: celda.activityId,
                            obligados: celda.assignmentCount,
                          });
                        }}
                      >
                        <ShieldX size={15} style={{ color: 'var(--brand-primary)' }} />
                        Retirar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex min-w-0 flex-col md:border-l md:border-line md:pl-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">Se le puede exigir</h3>
              {marcadas.length > 0 ? (
                <span className="text-xs text-ink-500">{marcadas.length} marcadas</span>
              ) : null}
            </div>

            {disponibles.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Ya se le exigen todas las inducciones especificas que hay.</p>
            ) : (
              <>
                {/* El buscador aparece cuando de verdad hace falta, no antes. */}
                {disponibles.length > 8 ? (
                  <div className="relative mt-2">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
                    />
                    <Input
                      className="pl-9"
                      placeholder="Buscar una inducción"
                      aria-label="Buscar una inducción"
                      value={buscaEnVentana}
                      onChange={(event) => setBuscaEnVentana(event.target.value)}
                    />
                  </div>
                ) : null}

                <ul
                  className={cn(
                    'mt-2 space-y-1 overflow-y-auto pr-1',
                    // Deja sitio al buscador cuando esta, para que las dos columnas acaben a la
                    // misma altura y el pie de la ventana no baile.
                    disponibles.length > 8 ? 'max-h-[44vh]' : 'max-h-[52vh]',
                  )}
                >
                  {disponiblesFiltradas.map((activity) => {
                    const marcada = marcadas.includes(activity.id);
                    return (
                      <li key={activity.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                            marcada ? 'border-transparent bg-primary-soft' : 'border-line hover:bg-paper',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="focus-ring mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong"
                            checked={marcada}
                            disabled={busy}
                            onChange={(event) =>
                              setMarcadas((previas) =>
                                event.target.checked
                                  ? [...previas, activity.id]
                                  : previas.filter((id) => id !== activity.id),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ink-900">{activity.name}</span>
                            {!activity.published ? (
                              <span className="mt-0.5 block text-xs text-ink-500">
                                Sin contenido publicado: la obligacion nace y todavia no hay nada que hacer
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {disponiblesFiltradas.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-500">Ninguna se llama así.</p>
                ) : null}
              </>
            )}

            {marcadas.length > 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-500">
                Al guardar, la obligacion nace <strong className="font-medium text-ink-700">en el acto</strong> para
                quien ya tiene el cargo, y a quien entre despues le nacera sola.
              </p>
            ) : null}
          </section>
        </div>
      </Modal>

      {/*
        RETIRAR SE CONFIRMA, ANADIR NO. No es simetrico a proposito: anadir crea algo que se puede
        retirar, y retirar QUITA obligaciones vivas de gente concreta. Y como es un cambio a algo
        que ya existia, el servidor pide la novedad — la misma regla que en la ficha.
      */}
      <Modal
        open={retirando !== null}
        onOpenChange={(open) => {
          if (!open) setRetirando(null);
        }}
        icon={AlertTriangle}
        title="Dejar de exigirsela a este cargo"
        description={
          retirando
            ? `${cargoDe(retirando.jobTitleId)?.name ?? ''} · ${actividadDe(retirando.activityId)?.name ?? ''}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRetirando(null)} disabled={busy}>
              Volver
            </Button>
            <Button variant="danger" loading={busy} disabled={novedad.trim().length < 10} onClick={() => void retirar()}>
              Retirar la induccion
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-500">
            {retirando && retirando.obligados > 0
              ? `Lo pendiente de ${retirando.obligados} ${retirando.obligados === 1 ? 'persona' : 'personas'} queda retirado. Lo que ya se cumplio no se toca, y sus constancias siguen valiendo.`
              : 'Todavia no obliga a nadie, asi que no se retira ninguna obligacion.'}
          </p>
          <Field
            htmlFor="matriz-novedad"
            label="Novedad"
            required
            hint="Por que deja de exigirsele a este cargo. Queda en el registro de auditoria."
          >
            <Textarea
              id="matriz-novedad"
              rows={2}
              maxLength={500}
              autoFocus
              value={novedad}
              onChange={(event) => setNovedad(event.target.value)}
              placeholder="Mínimo 10 caracteres"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
