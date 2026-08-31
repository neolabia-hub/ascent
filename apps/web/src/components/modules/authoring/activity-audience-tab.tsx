'use client';

import { Info, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { quienDecide, type ActivityTypeConfig } from '@/lib/activity-type';
import { listCatalog, listPickableUsers, type CatalogRow, type PickableUser } from '@/lib/admin-api';
import {
  createAssignments,
  EMPTY_RULE,
  listActivityRequirements,
  listAssignments,
  previewAudience,
  retireActivityRequirement,
  setActivityRequirement,
  type ActivityRequirement,
  type AssignmentRow,
  type AudiencePreview,
  type AudienceRule,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { cn } from '@/components/ui/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * QUIENES — a quien se le exige esta formacion, decidido AQUI y no en otra pantalla.
 *
 * Antes esto solo sabia crear obligaciones sueltas (una fila por persona, origen MANUAL). Para
 * lo que de verdad hace falta —"esto lo hacen los conductores, y quien entre de conductor manana
 * tambien"— habia que salir al modulo de Asignaciones, crear una AUDIENCIA con nombre, volver y
 * crear un REQUISITO eligiendola de una lista: dos palabras que no son del negocio y tres
 * pantallas para decir una sola cosa.
 *
 * Ahora la pregunta se hace una vez y el sistema decide por debajo si eso es una audiencia nueva,
 * una que ya existia o la casilla de la matriz por cargo.
 *
 * Y LO QUE SE PREGUNTA DEPENDE DEL TIPO (`activity_types.config`, sembrado en el Sprint 1 y que
 * hasta ahora no leia nadie):
 *
 *   Induccion general / reinduccion  -> es para TODOS: no se ofrece marcar a nadie, porque
 *                                       marcar a mano a 116 personas solo puede salir mal.
 *   Induccion especifica             -> lo dice la matriz de cargos; se edita con novedad.
 *   Plan / extraordinaria / pildora  -> lo decide el analista, y por eso ahi si hay que marcarlo.
 */
export function ActivityAudienceTab({
  activityId,
  activityName,
  typeConfig,
  hayContenidoPublicado,
}: {
  activityId: string;
  activityName: string;
  typeConfig: ActivityTypeConfig;
  /** Sin contenido publicado no se exige nada: obligar a algo que nadie puede hacer es peor. */
  hayContenidoPublicado: boolean;
}) {
  const { showToast } = useToast();
  const decide = quienDecide(typeConfig);
  /**
   * UNA CAPACITACION DEL PLAN NO PREGUNTA CUANDO VENCE NI SI SE REPITE (Decision #76).
   *
   * Los tres campos del plazo no significan nada aqui, y uno de ellos hacia dano:
   *   - "se le exige desde ahora / al ingresar": no cuelga del ingreso ni de entrar a un grupo,
   *     pasa el mes que diga el plan;
   *   - "vence a los N dias": inventaba un vencimiento que COMPETIA con el mes del plan, y de
   *     ahi salia que cada persona acabara con dos obligaciones de la misma formacion;
   *   - "se repite": la del ano que viene es otro plan, no otra ronda de esta.
   *
   * Asi que aqui solo se pregunta A QUIENES, que es la unica decision real. El servidor fuerza
   * el disparador PLAN aunque el formulario mandara otra cosa: no es una preferencia de la
   * pantalla, es una consecuencia del tipo.
   */
  const esDelPlan = typeConfig.participatesInPlan;

  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [requirements, setRequirements] = useState<ActivityRequirement[] | null>(null);
  const [catalogs, setCatalogs] = useState<{
    jobTitles: CatalogRow[];
    areas: CatalogRow[];
    regionals: CatalogRow[];
    services: CatalogRow[];
  } | null>(null);
  const [people, setPeople] = useState<PickableUser[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** El alcance en construccion. La induccion general no necesita facetas: es toda la empresa. */
  const [scope, setScope] = useState<AudienceRule>({ ...EMPTY_RULE });
  const [reach, setReach] = useState<number | null>(null);
  /** Una muestra de a quienes alcanza, para poder ENSENARLOS y no solo contarlos. */
  const [muestra, setMuestra] = useState<AudiencePreview['sample']>([]);
  const [verAlcance, setVerAlcance] = useState(false);
  const [plazo, setPlazo] = useState({
    /** ON_HIRE ancla en la fecha de ingreso; ON_JOIN, en el momento en que se empieza a exigir. */
    trigger: typeConfig.requiresBeforeHire ? ('ON_HIRE' as const) : ('ON_JOIN' as const),
    dias: typeConfig.requiresBeforeHire ? '0' : '30',
    everyMonths: typeConfig.defaultRecurrenceMonths ? String(typeConfig.defaultRecurrenceMonths) : '',
    /** Como se repite: no, cada N meses, o cada ano en una fecha fija (campana anual). */
    modoRepite: (typeConfig.defaultAnnualDate ? 'ANUAL' : typeConfig.defaultRecurrenceMonths ? 'MESES' : 'NO') as
      | 'NO'
      | 'MESES'
      | 'ANUAL',
    fixedDate: typeConfig.defaultAnnualDate ?? '',
  });
  const [novedad, setNovedad] = useState('');
  /** El requisito que se esta corrigiendo, si hay alguno. */
  const [ajustando, setAjustando] = useState<string | null>(null);

  /** Obligaciones sueltas: el atajo para cuando no hay regla que lo cubra. */
  const [manual, setManual] = useState<{ userIds: string[]; dueAt: string }>({ userIds: [], dueAt: '' });

  const load = useCallback(async () => {
    try {
      const [page, reqs] = await Promise.all([
        listAssignments({ targetId: activityId }),
        listActivityRequirements(activityId),
      ]);
      setRows(page.items);
      setTotal(page.total);
      setRequirements(reqs);
    } catch {
      setRows([]);
      setRequirements([]);
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    void Promise.all([
      listCatalog('job-titles'),
      listCatalog('areas'),
      listCatalog('regionals'),
      listCatalog('services'),
    ])
      .then(([jobTitles, areas, regionals, services]) =>
        setCatalogs({
          jobTitles: jobTitles.filter((row) => row.active),
          areas: areas.filter((row) => row.active),
          regionals: regionals.filter((row) => row.active),
          services: services.filter((row) => row.active),
        }),
      )
      .catch(() => undefined);
    // `listUsers({ pageSize: 200 })` devolvia 422 SIEMPRE (el servidor topa en 100) y el catch
    // vacio lo escondia: el selector salia sin nadie dentro y parecia que no habia personas.
    void listPickableUsers()
      .then(setPeople)
      .catch(() => setPeopleError('No se pudo cargar la lista de personas.'));
  }, [load]);

  /**
   * Los cargos que YA tienen esta formacion exigida, para que la induccion especifica se abra con
   * lo que hay puesto y no en blanco. Es la matriz por cargo, vista de lado.
   */
  useEffect(() => {
    if (!requirements || decide !== 'POR_CARGO') return;
    const marcados = [...new Set(requirements.flatMap((requirement) => requirement.scope.jobTitleIds))];
    setScope((previo) => (previo.jobTitleIds.length === 0 ? { ...previo, jobTitleIds: marcados } : previo));
  }, [requirements, decide]);

  /**
   * A cuanta gente alcanza el alcance que se esta armando, ANTES de guardarlo. Sin esta cifra,
   * crear un requisito es firmar a ciegas: la primera senal de que alcanzaba a 116 personas
   * llegaria cuando ya les hubiera llegado el aviso a las 116.
   */
  useEffect(() => {
    const consultar = decide === 'TODOS' ? EMPTY_RULE : scope;
    if (decide !== 'TODOS' && sinMarcar(scope)) {
      setReach(null);
      return;
    }
    void previewAudience(consultar)
      .then((preview) => {
        setReach(preview.count);
        setMuestra(preview.sample);
      })
      .catch(() => setReach(null));
  }, [scope, decide]);



  const exigir = async () => {
    setBusy(true);
    try {
      const result = await setActivityRequirement(activityId, {
        scope: decide === 'TODOS' ? EMPTY_RULE : scope,
        trigger: plazo.trigger,
        dueDaysAfterTrigger: Number(plazo.dias || 0),
        everyMonths: plazo.modoRepite === "MESES" && plazo.everyMonths ? Number(plazo.everyMonths) : null,
        fixedDate: plazo.modoRepite === "ANUAL" && plazo.fixedDate ? plazo.fixedDate : null,
        reason: novedad.trim() || null,
      });
      setNovedad('');
      setAjustando(null);
      await load();
      showToast({
        kind: 'success',
        title: result.updated ? 'Alcance actualizado' : `Se le exige a ${result.audienceName}`,
        /**
         * En una capacitacion del plan NO nace ninguna obligacion aqui, y decir "nadie nuevo quedo
         * obligado" —que es lo que salia— se lee como que algo fallo. No fallo: es que todavia no
         * toca. Nacen al aprobar el plan, y eso es lo que hay que decir.
         */
        description: esDelPlan
          ? reach !== null
            ? `${reach} personas quedan en el alcance. Sus obligaciones nacen al aprobar el plan.`
            : 'Sus obligaciones nacen al aprobar el plan.'
          : result.created > 0
            ? `Nacieron ${result.created} obligaciones para quienes ya estan.`
            : 'Nadie nuevo quedo obligado: los que estan ya la tenian.',
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo guardar a quien se le exige' });
    } finally {
      setBusy(false);
    }
  };


  /**
   * Abrir el panel con lo que ese requisito tiene puesto, para corregirlo.
   *
   * Guardar encima lo ACTUALIZA en vez de crear otro —la audiencia es la misma, y se reconoce por
   * su forma—, asi que cambiar "vence a los 30 dias" por "a los 15" no toca las obligaciones ya
   * vivas: solo cambia la regla de las que nazcan.
   */
  const abrirAjuste = (requirement: ActivityRequirement) => {
    setScope(requirement.scope);
    setPlazo({
      trigger: requirement.trigger === 'ON_HIRE' ? 'ON_HIRE' : 'ON_JOIN',
      dias: String(requirement.dueDaysAfterTrigger),
      modoRepite: requirement.fixedDate ? 'ANUAL' : requirement.everyMonths ? 'MESES' : 'NO',
      everyMonths: requirement.everyMonths ? String(requirement.everyMonths) : '',
      fixedDate: requirement.fixedDate ?? '',
    });
    setAjustando(requirement.id);
  };

  const retirar = async (requirement: ActivityRequirement) => {
    setBusy(true);
    try {
      await retireActivityRequirement(activityId, requirement.id);
      await load();
      showToast({
        kind: 'success',
        title: 'Requisito retirado',
        description: 'Lo pendiente queda retirado; lo que ya se cumplio no se toca.',
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo retirar' });
    } finally {
      setBusy(false);
    }
  };

  const asignarPersonas = async () => {
    setBusy(true);
    try {
      const result = await createAssignments({
        targetId: activityId,
        userIds: manual.userIds,
        dueAt: manual.dueAt || null,
      });
      setManual({ userIds: [], dueAt: '' });
      await load();
      showToast({
        kind: 'success',
        title: `${result.created} obligaciones creadas`,
        description: result.skipped > 0 ? `${result.skipped} ya la tenian pendiente.` : undefined,
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo asignar' });
    } finally {
      setBusy(false);
    }
  };

  const yaEsDeTodos = (requirements ?? []).some((requirement) => requirement.reachesEveryone);
  /** Todas sus reglas obligan solo a quien entre desde ahora: hoy puede no haber NADIE, y esta bien. */
  const soloParaNuevos =
    (requirements ?? []).length > 0 && (requirements ?? []).every((requirement) => requirement.soloNuevos);
  const novedadLista = decide !== 'POR_CARGO' || novedad.trim().length >= 10;
  const puedeExigir =
    !busy && novedadLista && (ajustando !== null || (decide === 'TODOS' ? !yaEsDeTodos : !sinMarcar(scope)));

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">A quien se le exige</h2>

          {!catalogs ? (
            <Skeleton className="mt-4 h-64 w-full" />
          ) : (
            <div className="mt-4 space-y-4">
              {decide === 'TODOS' ? (
                <div className="rounded-lg border border-line bg-paper px-4 py-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck
                      size={16}
                      className={cn('mt-0.5 shrink-0', yaEsDeTodos ? 'text-ok' : 'text-info')}
                      strokeWidth={1.75}
                    />
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {yaEsDeTodos ? 'Ya se le exige a toda la empresa' : 'Es para toda la empresa'}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {yaEsDeTodos
                          ? 'Se aplico sola al publicar: en este tipo de formacion no hay nada que decidir.'
                          : typeConfig.requiresBeforeHire
                            ? 'Es una induccion de INGRESO: al publicar se exigira a quien entre desde ahora. A quien ya lleva tiempo no se le exige, porque no esta ingresando: a esa gente la cubre la reinduccion.'
                            : `Al publicar quedara exigida a ${reach ?? '...'} personas, y a quien entre despues. No hay que marcar a nadie.`}
                      </p>
                      {/*
                        CUANTAS Y QUIENES, antes de publicar. Saber "a todos" no es saber a cuantos:
                        el numero es lo que hace que alguien mire dos veces antes de publicar algo
                        que va a obligar a la empresa entera.
                      */}
                      {!yaEsDeTodos && reach !== null ? (
                        <button
                          type="button"
                          onClick={() => setVerAlcance((visible) => !visible)}
                          className="focus-ring mt-1 rounded text-xs font-medium text-info hover:underline"
                        >
                          {verAlcance ? 'Ocultar quienes son' : `Ver quienes son (${reach})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {/* La lista, si la piden. Nombres, no un numero suelto. */}
                  {verAlcance && muestra.length > 0 ? (
                    <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-line pt-3">
                      {muestra.map((persona) => (
                        <li key={persona.id} className="text-xs text-ink-700">
                          {persona.fullName}
                          <span className="text-ink-500"> · {persona.jobTitle.name}</span>
                        </li>
                      ))}
                      {reach !== null && reach > muestra.length ? (
                        <li className="pt-1 text-xs text-ink-500">y {reach - muestra.length} personas mas.</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {decide === 'POR_CARGO' ? (
                <Field
                  htmlFor="q-jobs"
                  label="Cargos que la deben hacer"
                  hint="Es la matriz de competencia: quien entre con uno de estos cargos la tendra sin que nadie la asigne."
                >
                  <MultiSelect
                    id="q-jobs"
                    placeholder="Ningun cargo"
                    options={catalogs.jobTitles.map((row) => ({
                      id: row.id,
                      label: row.name,
                      hint: row.jobTitleType?.name,
                    }))}
                    value={scope.jobTitleIds}
                    onChange={(jobTitleIds) => setScope({ ...scope, jobTitleIds })}
                  />
                </Field>
              ) : null}

              {decide === 'EL_ANALISTA' ? (
                <>
                  <Field htmlFor="q-jobs" label="A todos los de un cargo">
                    <MultiSelect
                      id="q-jobs"
                      placeholder="Ningun cargo"
                      options={catalogs.jobTitles.map((row) => ({
                        id: row.id,
                        label: row.name,
                        hint: row.jobTitleType?.name,
                      }))}
                      value={scope.jobTitleIds}
                      onChange={(jobTitleIds) => setScope({ ...scope, jobTitleIds })}
                    />
                  </Field>
                  <Field htmlFor="q-areas" label="A toda un area">
                    <MultiSelect
                      id="q-areas"
                      placeholder="Ninguna area"
                      options={catalogs.areas.map((row) => ({ id: row.id, label: row.name }))}
                      value={scope.areaIds}
                      onChange={(areaIds) => setScope({ ...scope, areaIds })}
                    />
                  </Field>
                  <Field htmlFor="q-regionals" label="A una regional">
                    <MultiSelect
                      id="q-regionals"
                      placeholder="Ninguna regional"
                      options={catalogs.regionals.map((row) => ({ id: row.id, label: row.name }))}
                      value={scope.regionalIds}
                      onChange={(regionalIds) => setScope({ ...scope, regionalIds })}
                    />
                  </Field>
                  <Field htmlFor="q-services" label="A un servicio" hint="Solo alcanza a quien lo tenga puesto en su ficha.">
                    <MultiSelect
                      id="q-services"
                      placeholder="Ningun servicio"
                      options={catalogs.services.map((row) => ({ id: row.id, label: row.name }))}
                      value={scope.serviceIds}
                      onChange={(serviceIds) => setScope({ ...scope, serviceIds })}
                    />
                  </Field>
                  {/*
                    Los criterios se CRUZAN. Decirlo aqui y no en una ayuda aparte, porque
                    "cargo: conductor" + "regional: Neiva" son los conductores DE Neiva, y leerlo
                    como "los conductores mas todo Neiva" son cientos de personas obligadas que
                    nadie quiso obligar.
                  */}
                  {contarFacetas(scope) > 1 ? (
                    <p className="text-xs text-ink-500">Se cruzan: hay que cumplir todo lo marcado a la vez.</p>
                  ) : null}
                </>
              ) : null}

              {/*
                EL PLAZO SOLO SE ENSENA DONDE SE DECIDE.

                En una induccion general no se decide: lo pone la norma —antes de empezar a
                trabajar— y el sistema lo aplica solo. Tener los campos ahi, y encima antes de
                publicar, hace creer que hay algo que rellenar y que sin rellenarlo no pasara nada.
                Aparecen solo al pulsar "Ajustar", que es cuando de verdad se estan cambiando.
              */}
              {(decide !== 'TODOS' || ajustando !== null) && !esDelPlan ? (
                <>
              <div className="grid grid-cols-2 gap-3">
                <Field htmlFor="q-trigger" label="Se le exige">
                  <Select
                    id="q-trigger"
                    value={plazo.trigger}
                    onChange={(event) => setPlazo({ ...plazo, trigger: event.target.value as 'ON_HIRE' | 'ON_JOIN' })}
                  >
                    <option value="ON_JOIN">Desde ahora</option>
                    <option value="ON_HIRE">Al ingresar a la empresa</option>
                  </Select>
                </Field>
                <Field htmlFor="q-dias" label="Vence a los" hint="Dias. Negativo = antes.">
                  <Input
                    id="q-dias"
                    type="number"
                    value={plazo.dias}
                    onChange={(event) => setPlazo({ ...plazo, dias: event.target.value })}
                  />
                </Field>
              </div>

              {/*
                LA TRAMPA DEL ANCLAJE, dicha antes de caer en ella. "Al ingresar" cuenta desde la
                fecha de ingreso de cada persona: para quien lleva cuatro anos en la empresa esa
                fecha ya paso, y la obligacion nace VENCIDA. Es lo correcto para la induccion de
                quien entra manana y un desastre para estrenar un requisito con la plantilla
                actual; en pantalla las dos opciones se parecen demasiado como para no avisar.
              */}
              {plazo.trigger === 'ON_HIRE' ? (
                <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                  <Info size={14} className="mt-0.5 shrink-0" strokeWidth={2} />
                  Se cuenta desde la fecha de ingreso de cada persona: quien lleve tiempo en la empresa quedara vencido de
                  entrada. Para estrenarla con la gente que ya esta, usa &quot;desde ahora&quot;.
                </p>
              ) : null}

              {/*
                DOS FORMAS DE REPETIR, y la diferencia se nota al arrancar el sistema.

                "Cada N meses" cuenta desde que cada persona la completo: la fecha de cada uno
                acaba donde caiga. Si se estrena subiendo 116 usuarios el mismo dia, los 116
                vencen el mismo dia, que no se parece a como funciona una empresa.

                "Cada ano en una fecha" es la CAMPANA anual, que es como se hace de verdad la
                reinduccion y como la pregunta el auditor: "¿hicieron la reinduccion de 2026?".
              */}
              <Field htmlFor="q-repite-modo" label="Se repite">
                <Select
                  id="q-repite-modo"
                  value={plazo.modoRepite}
                  onChange={(event) =>
                    setPlazo({
                      ...plazo,
                      modoRepite: event.target.value as 'NO' | 'MESES' | 'ANUAL',
                      everyMonths: event.target.value === 'MESES' ? plazo.everyMonths || '12' : '',
                      fixedDate: event.target.value === 'ANUAL' ? plazo.fixedDate || '03-31' : '',
                    })
                  }
                >
                  <option value="NO">No se repite</option>
                  <option value="ANUAL">Cada ano, en una fecha fija</option>
                  <option value="MESES">Cada N meses desde que la hizo</option>
                </Select>
              </Field>

              {plazo.modoRepite === 'MESES' ? (
                <Field htmlFor="q-repite" label="Cada cuantos meses" hint="Se cuenta desde que cada persona la completo.">
                  <Input
                    id="q-repite"
                    type="number"
                    min={1}
                    value={plazo.everyMonths}
                    onChange={(event) => setPlazo({ ...plazo, everyMonths: event.target.value })}
                  />
                </Field>
              ) : null}

              {plazo.modoRepite === 'ANUAL' ? (
                <Field
                  htmlFor="q-repite-fecha"
                  label="Antes de que fecha, cada ano"
                  hint="Mes y dia. Todos vencen el mismo dia, que es como se hace una campana anual."
                >
                  <Input
                    id="q-repite-fecha"
                    placeholder="03-31"
                    value={plazo.fixedDate}
                    onChange={(event) => setPlazo({ ...plazo, fixedDate: event.target.value })}
                  />
                </Field>
              ) : null}
                </>
              ) : null}

              {/*
                Y EN SU LUGAR, LA RESPUESTA A LA PREGUNTA QUE ESOS CAMPOS DEJAN ABIERTA.
                Quitar tres campos sin decir nada deja a alguien pensando "¿y cuando vence esto?".
                Se contesta antes de que lo pregunte, que es lo unico que hace que quitarlos sea
                una simplificacion y no un hueco.
              */}
              {esDelPlan ? (
                <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                  <Info size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
                  <span>
                    Aqui solo se decide <strong>a quienes</strong>. El vencimiento lo pone el mes en el que quede
                    programada en el plan, y las obligaciones nacen al aprobarlo — no ahora.
                  </span>
                </p>
              ) : null}

              {decide === 'POR_CARGO' ? (
                <Field
                  htmlFor="q-novedad"
                  label="Novedad"
                  required
                  hint="Por que cambia lo que se le exige a este cargo. Queda en el registro."
                >
                  <Textarea
                    id="q-novedad"
                    rows={2}
                    value={novedad}
                    onChange={(event) => setNovedad(event.target.value)}
                    placeholder="Minimo 10 caracteres"
                  />
                </Field>
              ) : null}

              {/*
                En una induccion general NO hay boton de exigir, ni antes ni despues de publicar:
                lo hace el sistema al publicar y era redundante en los dos momentos. Antes de
                publicar, ofrecerlo adelantaria la obligacion a una formacion sin contenido;
                despues, confirmaria lo unico posible. Solo aparece al pulsar "Ajustar".
              */}
              {ajustando !== null || decide !== 'TODOS' ? (
                <Button className="w-full" onClick={() => void exigir()} loading={busy} disabled={!puedeExigir}>
                  <ShieldCheck size={16} />
                  {ajustando !== null ? 'Guardar el ajuste' : 'Guardar a quien se le exige'}
                </Button>
              ) : null}

              {decide !== 'TODOS' && sinMarcar(scope) ? (
                <p className="text-center text-xs text-ink-500">Marca al menos un cargo, area, regional o servicio.</p>
              ) : null}
              {decide !== 'TODOS' && !sinMarcar(scope) && reach !== null ? (
                <p className="text-center text-xs text-ink-500">Alcanza a {reach} personas hoy.</p>
              ) : null}
            </div>
          )}
        </section>

        {/*
          LAS PERSONAS SUELTAS, en segundo plano y a proposito. Es una obligacion sin regla: no
          alcanza a quien entre manana ni vuelve el ano que viene. Sirve para el caso puntual —"a
          estos tres, por la novedad de la semana"— y ponerla al mismo nivel que el requisito
          invita a resolver con ella cosas que deberian ser permanentes.

          En una induccion general NUNCA se ofrece: o ya se exige a todos, o se exigira al
          publicar. Y que aparezca antes de publicar para desaparecer despues es peor que no
          estar: el usuario ve un formulario que cambia solo. Donde SI tiene sentido es en la
          especifica —"Juan no es conductor pero va a manejar el mes que viene"— y en el resto.
        */}
        {decide === 'TODOS' ? null : (
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">O a personas concretas</h2>
          <p className="mb-4 mt-1 text-sm text-ink-500">Obligacion suelta: no alcanza a quien entre despues.</p>
          <div className="space-y-4">
            <Field htmlFor="q-people" label="Personas" hint={peopleError ?? undefined}>
              <MultiSelect
                id="q-people"
                placeholder="Nadie en particular"
                options={people.map((person) => ({
                  id: person.id,
                  label: person.fullName,
                  hint: person.jobTitle?.name ?? undefined,
                }))}
                value={manual.userIds}
                onChange={(userIds) => setManual({ ...manual, userIds })}
              />
            </Field>
            <Field htmlFor="q-due" label="Fecha limite" hint="Vacio: sin fecha, no vence.">
              <Input
                id="q-due"
                type="date"
                value={manual.dueAt}
                onChange={(event) => setManual({ ...manual, dueAt: event.target.value })}
              />
            </Field>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void asignarPersonas()}
              loading={busy}
              disabled={manual.userIds.length === 0}
            >
              <UserPlus size={16} />
              Asignar a estas personas
            </Button>
          </div>
        </section>
        )}
      </div>

      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Lo que se exige hoy</h2>
            {requirements && requirements.length > 0 ? (
              <span className="text-sm text-ink-500">{requirements.length} regla{requirements.length === 1 ? '' : 's'}</span>
            ) : null}
          </div>
          {!requirements ? (
            <Skeleton className="h-24 w-full" />
          ) : requirements.length === 0 ? (
            <div className="card px-5 py-4 text-sm text-ink-500">
              {/*
                El vacio no puede decir lo mismo en los dos casos. En una induccion general lo que
                falta no es que alguien la exija: es publicar el contenido. Decir "todavia no hay
                ninguna regla" ahi hace pensar que hay que hacer algo aqui, y no lo hay.
              */}
              {decide === 'TODOS' && !hayContenidoPublicado
                ? 'Todavia no, porque el contenido no esta publicado. Al publicarlo quedara exigida a toda la empresa, sin que tengas que marcar nada.'
                : 'Todavia no hay ninguna regla. Lo que salga abajo son obligaciones sueltas, que no alcanzan a quien entre despues.'}
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {requirements.map((requirement) => (
                <div key={requirement.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{requirement.audienceName}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {describirRequisito(requirement)}
                      {/*
                        LA CIFRA, dicha segun a quien obliga de VERDAD. Un requisito de "solo a
                        quien entre desde ahora" alcanza a 471 personas en la audiencia y obliga a
                        CERO hoy: ensenar el 471 a secas hace pensar que el sistema esta roto
                        cuando esta haciendo justo lo que se le pidio.
                      */}
                      {requirement.soloNuevos
                        ? ` · solo a quien entre desde ahora (${requirement.assignmentCount} hasta hoy)`
                        : ` · alcanza a ${requirement.reach} personas`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {/*
                      AJUSTAR sin retirar. Cambiar el plazo o la recurrencia de algo que ya se
                      exige no es una novedad: es una correccion. Obligar a retirar y volver a
                      exigir para cambiar "30 dias" por "15" retiraria de paso las obligaciones
                      vivas de todo el mundo, que es un precio absurdo por editar un numero.
                    */}
                    <Button variant="ghost" size="sm" onClick={() => abrirAjuste(requirement)} disabled={busy}>
                      Ajustar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void retirar(requirement)} disabled={busy}>
                      Retirar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Quienes la tienen que hacer</h2>
            {rows ? <span className="text-sm text-ink-500">{total} en total</span> : null}
          </div>

          {!rows ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={Users}
                title={soloParaNuevos ? "Todavia nadie: se exige a quien entre desde ahora" : "Nadie tiene que hacerla todavia"}
                description={
                  soloParaNuevos
                    ? "No es un fallo. Esta formacion se le exige a cada persona que ingrese a partir de ahora, con su fecha de ingreso. A quien ya lleva tiempo no se le exige: a esa gente la cubre la reinduccion. La lista se ira llenando con cada alta."
                    : `"${activityName}" existe, pero no se le exige a nadie. Dilo a la izquierda: quien entre despues la tendra sola.`
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <Table>
                <THead>
                  <Tr>
                    <Th>Persona</Th>
                    <Th>Cargo</Th>
                    <Th>Vence</Th>
                    <Th>Estado</Th>
                    <Th>Origen</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td className="font-medium text-ink-900">{row.user.fullName}</Td>
                      <Td className="text-ink-500">{row.user.jobTitle.name}</Td>
                      <Td className="text-ink-500">{formatDate(row.dueAt)}</Td>
                      <Td>
                        <StatusPill kind={statusKind(row.status)} label={statusLabel(row.status)} />
                      </Td>
                      <Td className="text-ink-500">{sourceLabel(row.source)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Cuantas facetas tiene marcadas el alcance (tambien sirve para avisar de que se cruzan). */
function contarFacetas(scope: AudienceRule): number {
  return [scope.jobTitleIds, scope.areaIds, scope.regionalIds, scope.serviceIds].filter((lista) => lista.length > 0)
    .length;
}

/**
 * Un alcance sin nada marcado es "toda la empresa", que es lo CONTRARIO de lo que quiso decir
 * quien esta marcando cargos. Se bloquea para que esa trampa no este a un clic.
 */
function sinMarcar(scope: AudienceRule): boolean {
  return contarFacetas(scope) === 0;
}

/** El requisito dicho en una linea: cuando vence y si vuelve. */
function describirRequisito(requirement: ActivityRequirement): string {
  /**
   * La del plan no vence por su cuenta ni vuelve: la fecha la pone el mes del renglon y las
   * obligaciones nacen al aprobar el plan (Decision #76). Decir "vence a los 0 dias" seria falso.
   */
  if (requirement.trigger === 'PLAN') {
    return 'el vencimiento lo pone el mes en el plan';
  }
  const dias = requirement.dueDaysAfterTrigger;
  const cuando =
    requirement.trigger === 'ON_HIRE'
      ? dias === 0
        ? 'vence el dia del ingreso'
        : dias < 0
          ? `vence ${Math.abs(dias)} dias antes del ingreso`
          : `vence a los ${dias} dias del ingreso`
      : dias === 0
        ? 'vence el mismo dia'
        : `vence a los ${dias} dias`;
  const repite = requirement.fixedDate
    ? ` · cada ano antes del ${requirement.fixedDate.replace("-", "/")}`
    : requirement.everyMonths
      ? requirement.everyMonths === 12
        ? " · se repite cada ano desde que la hizo"
        : ` · se repite cada ${requirement.everyMonths} meses desde que la hizo`
      : "";
  return `${cuando}${repite}`;
}

function statusKind(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') return 'ok';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PENDING' || status === 'IN_PROGRESS') return 'warn';
  return 'neutral';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDIENTE',
    IN_PROGRESS: 'EN CURSO',
    COMPLETED: 'CUMPLIDA',
    OVERDUE: 'VENCIDA',
    WITHDRAWN_LEFT_AUDIENCE: 'RETIRADA',
    WITHDRAWN_PLAN_ITEM_CANCELLED: 'RENGLON CANCELADO',
    WAIVED: 'EXIMIDA',
  };
  return map[status] ?? status;
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    MANUAL: 'Asignacion directa',
    RULE: 'Requisito',
    PLAN: 'Plan anual',
    STATIC_SNAPSHOT: 'Instantanea',
  };
  return map[source] ?? source;
}
