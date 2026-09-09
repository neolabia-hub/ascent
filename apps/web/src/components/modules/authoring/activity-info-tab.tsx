'use client';

import { Info, Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listCatalog, listPickableUsers, type CatalogRow, type PickableUser } from '@/lib/admin-api';
import { updateActivity, type ActivityDetail, type Modality } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { PersonPicker } from '@/components/ui/person-picker';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/components/providers/session-provider';
import { motivoDelError } from '@/lib/api';

/**
 * FICHA DE LA FORMACION: todo lo que describe QUE se aprende y A QUIEN va dirigido.
 *
 * Esta pantalla existe para responder una pregunta concreta del cliente: "antes llenaba UN
 * formulario por capacitacion; ahora que hay actividades, versiones y convocatorias, donde
 * quedaron mis campos". La respuesta es que se repartieron en dos sitios, y el reparto no es
 * capricho:
 *
 *   AQUI (la actividad, se llena UNA vez y se reutiliza por años):
 *     proceso, responsable, tipo, nombre, descripcion,
 *     modalidad por defecto y norma aplicable.
 *
 *   EN QUIENES (a quien se le exige): cargos, areas, regionales y servicios.
 *     Estuvieron aqui y se quitaron: eran una LISTA DECORATIVA que no obligaba a nadie, y tener
 *     los cargos en dos sitios obligaba a marcarlos dos veces y a que las dos listas se
 *     separaran en cuanto alguien cambiaba una (misma causa que la Decision #59).
 *
 *   EN PROGRAMACION (la convocatoria, cambia cada vez que se dicta):
 *     fecha, intensidad horaria, instructor, ejecutada por, lugar y observaciones.
 *
 * Poner la fecha aqui obligaria a duplicar la formacion entera cada vez que se repite, que es
 * justo el problema que tenia el Excel.
 */
export function ActivityInfoTab({
  activity,
  onSaved,
  canEdit,
}: {
  activity: ActivityDetail;
  onSaved: () => Promise<void>;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const { scopeProcessIds } = useSession();
  const [catalogs, setCatalogs] = useState<{
    processes: CatalogRow[];
    types: CatalogRow[];
    norms: CatalogRow[];
    services: CatalogRow[];
    regionals: CatalogRow[];
    jobTitles: CatalogRow[];
  } | null>(null);
  const [people, setPeople] = useState<PickableUser[]>([]);
  /**
   * EL RESPONSABLE SE COMPORTA COMO EL CONTENIDO (Decision #64): se decide mientras hay un
   * borrador abierto y se congela al publicar. Sin borrador, el campo se ve pero no se toca, y el
   * texto dice la salida —crear una version nueva—, que es la operacion que hay que hacer y que
   * casi nadie sabe que existe. Deshabilitado y explicado, no escondido: quien entra a la ficha
   * tiene que poder VER quien responde.
   */
  const hayBorrador = activity.versions.some((version) => version.status === 'DRAFT');
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: activity.name,
    description: activity.description ?? '',
    processId: activity.process.id,
    activityTypeId: activity.activityType.id,
    responsibleUserId: activity.responsibleUserId ?? '',
    modality: activity.modality,
    normIds: activity.norms.map((row) => row.id),
    /**
     * '' = lo que diga su tipo, que es el caso normal y por eso es el valor de arranque. Se guarda
     * como texto y no como `boolean | null` porque es lo que devuelve un `<select>`, y convertir
     * en un solo sitio —al guardar— evita tener dos representaciones del mismo estado.
     */
    tracksExternalCertificate:
      activity.tracksExternalCertificate === null || activity.tracksExternalCertificate === undefined
        ? ''
        : String(activity.tracksExternalCertificate),
    /** Mismo tratamiento y por lo mismo: '' = lo que diga su tipo. */
    admiteConvalidacion:
      activity.admiteConvalidacion === null || activity.admiteConvalidacion === undefined
        ? ''
        : String(activity.admiteConvalidacion),
  });

  useEffect(() => {
    void Promise.all([
      listCatalog('processes'),
      listCatalog('activity-types'),
      listCatalog('norms'),
      listCatalog('services'),
      listCatalog('regionals'),
      listCatalog('job-titles'),
    ])
      .then(([processes, types, norms, services, regionals, jobTitles]) =>
        setCatalogs({
          processes,
          types,
          norms,
          services,
          regionals,
          jobTitles,
        }),
      )
      .catch((error: unknown) =>
        showToast({
          kind: 'danger',
          title: 'No se pudieron cargar los catalogos',
          description: motivoDelError(error),
        }),
      );

    // `listUsers({ pageSize: 200 })` devolvia 422 SIEMPRE (el servidor topa en 100) y el catch
    // vacio lo escondia: el desplegable salia sin nadie dentro y parecia que no habia personas.
    void listPickableUsers()
      .then(setPeople)
      .catch(() => undefined);
  }, [showToast]);

  /**
   * LO QUE DICE SU TIPO, para poder enseñarlo en la opcion por defecto en vez de mandar a mirarlo.
   * Se lee del tipo ELEGIDO en el formulario y no del que tiene guardado: si alguien esta cambiando
   * el tipo, lo que importa es el que va a quedar.
   */
  const tipoElegido = catalogs?.types.find((t) => t.id === form.activityTypeId);
  const heredadoDelTipo =
    (tipoElegido?.config as Record<string, unknown> | undefined)?.tracksExternalCertificate === true;
  const nombreDelTipo = tipoElegido?.name;

  /*
    '' = NADIE LO HA TOCADO, y entonces vale lo que diga el tipo. Ese vacio no se enseña —el campo
    tiene dos botones, si y no— pero es lo que decide si al guardar viaja `null` (hereda) o un
    booleano (decidido en esta formacion). Ver la nota del campo mas abajo.
  */
  const certExternoEsExplicito = form.tracksExternalCertificate !== '';
  const certExternoVisible = certExternoEsExplicito
    ? form.tracksExternalCertificate
    : heredadoDelTipo
      ? 'true'
      : 'false';

  /*
    Y LO MISMO PARA LA CONVALIDACION, que es OTRA pregunta aunque suene parecida: aquella dice que al
    hacerla AQUI queda ademas un papel de un tercero; esta, que un papel que ya traia de OTRA empresa
    nos vale en lugar de hacerla. Son independientes — la ARL puede dictarla y aun asi exigirse la
    sesion propia.
  */
  const convalidacionHeredada =
    (tipoElegido?.config as Record<string, unknown> | undefined)?.admiteConvalidacion === true;
  const convalidacionEsExplicita = form.admiteConvalidacion !== '';
  const convalidacionVisible = convalidacionEsExplicita
    ? form.admiteConvalidacion
    : convalidacionHeredada
      ? 'true'
      : 'false';

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateActivity(activity.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        processId: form.processId,
        activityTypeId: form.activityTypeId,
        responsibleUserId: form.responsibleUserId || null,
        modality: form.modality,
        normIds: form.normIds,
        tracksExternalCertificate:
          form.tracksExternalCertificate === '' ? null : form.tracksExternalCertificate === 'true',
        admiteConvalidacion: form.admiteConvalidacion === '' ? null : form.admiteConvalidacion === 'true',
      });
      await onSaved();
      showToast({ kind: 'success', title: 'Ficha guardada' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo guardar la ficha',
        description: motivoDelError(error),
      });
    } finally {
      setSaving(false);
    }
  }, [activity.id, form, onSaved, showToast]);

  if (!catalogs) return <Skeleton className="h-96 w-full" />;

  /**
   * Candidatos a responsable: la gente del AREA a la que pertenece el proceso elegido.
   *
   * Un desplegable con las 116 personas de la empresa obliga a saberse de memoria quien lleva
   * SARLAFT. Si el proceso todavia no cuelga de un area —o el area no tiene gente— se ofrecen
   * todas: es mejor una lista larga que una vacia, que es lo que parece un error.
   */
  const areaDelProceso = catalogs.processes.find((row) => row.id === form.processId)?.areaId ?? null;

  /**
   * Los procesos que se ofrecen: los de su alcance, mas el que la formacion ya tiene puesto.
   * `null` = sin acotar; `[]` = acotada a ninguno. Incluir el actual evita que abrir la ficha de
   * una formacion de otro proceso y guardar el telefono le cambie el proceso sin decirlo.
   */
  const procesosOfrecidos = catalogs.processes.filter(
    (row) => row.id === activity.process.id || scopeProcessIds === null || scopeProcessIds.includes(row.id),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Informacion basica</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">Que se aprende y de quien depende. Se llena una vez.</p>

          <div className="space-y-4">
            {/*
              EL ORDEN DE LA FICHA, PUESTO DEL DERECHO (2026-09-07).

              Lo pidio el cliente y tenia razon: se entraba por el PROCESO y el RESPONSABLE, y el
              nombre de la formacion —lo unico que identifica lo que se esta mirando— aparecia a
              media pagina, despues de cinco desplegables. La norma aplicable quedaba la ultima,
              debajo de la descripcion, cuando es de las primeras cosas que se saben de una
              formacion: nace porque una norma la exige.

              Ahora se lee como se piensa: QUE es (nombre y tipo), POR QUE existe (norma), QUE
              dice (descripcion), y solo despues de QUIEN depende y COMO se dicta por defecto.

              El nombre va con el TIPO al lado porque el tipo no es un dato administrativo: decide
              si lleva evaluacion, si entrega constancia y si la acredita un tercero. Los dos
              juntos son la frase que contesta "¿que es esto?".
            */}
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field htmlFor="i-name" label="Nombre de la formacion" required>
                <Input
                  id="i-name"
                  disabled={!canEdit}
                  value={form.name}
                  maxLength={200}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>

              <Field htmlFor="i-type" label="Tipo de formacion" required>
                <Select
                  id="i-type"
                  disabled={!canEdit}
                  value={form.activityTypeId}
                  onChange={(event) => setForm({ ...form, activityTypeId: event.target.value })}
                >
                  {catalogs.types.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                htmlFor="i-process"
                label="Proceso"
                required
                hint="El sistema de gestion que origina la formacion."
              >
                <Select
                  id="i-process"
                  disabled={!canEdit}
                  value={form.processId}
                  onChange={(event) => setForm({ ...form, processId: event.target.value })}
                >
                  {/*
                    Solo los procesos que esta persona puede administrar, mas el que la formacion
                    ya tiene: si la formacion vive en un proceso fuera de su alcance, esconderlo
                    del desplegable haria que guardar la ficha se lo cambiara en silencio.
                  */}
                  {procesosOfrecidos.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} — {row.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                htmlFor="i-responsible"
                label="Responsable"
                hint={
                  hayBorrador
                    ? 'Se hereda del proceso al crear la formacion. Recibe los avisos de incumplimiento, y al publicar queda congelado en la version.'
                    : 'Congelado en la version publicada: es quien respondia cuando se dicto. Para cambiarlo, crea una version nueva.'
                }
              >
                <PersonPicker
                  id="i-responsible"
                  disabled={!canEdit || !hayBorrador}
                  people={people}
                  suggestedAreaId={areaDelProceso}
                  value={form.responsibleUserId || null}
                  onChange={(personId) => setForm({ ...form, responsibleUserId: personId ?? '' })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                              MODALIDAD: AQUI ES EL DEFECTO, EN LA CONVOCATORIA ES LO QUE PASO.
              
                              El cliente pregunto si esta repetida. No lo esta, y el rotulo tenia parte de culpa
                              por no decirlo: son la misma cascada que "la acredita un tercero". Esta siembra
                              cada jornada que se programe —para no repetir el dato cien veces— y ademas decide
                              dos cosas por su cuenta: la modalidad de la jornada PERMANENTE que el sistema crea
                              solo al publicar una formacion de autoservicio, y lo que ve el aprendiz en el
                              reproductor.
              
                              La de la convocatoria es la de ESA sesion, que puede diferir: una formacion virtual
                              que un mes se dicta en salon no deja de ser virtual en su ficha.
                            */}
              <Field
                htmlFor="i-modality"
                label="Modalidad por defecto"
                ayuda="Con la que nace cada convocatoria de esta formacion, para no repetirla cada vez. Cada jornada puede cambiarla: es la de ESA sesion. Y es la que se usa cuando el sistema crea solo la jornada permanente de una formacion de autoservicio."
              >
                <Select
                  id="i-modality"
                  disabled={!canEdit}
                  value={form.modality}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      modality: event.target.value as Modality,
                    })
                  }
                >
                  <option value="VIRTUAL">Virtual</option>
                  <option value="PRESENCIAL">Presencial</option>
                  <option value="HIBRIDA">Hibrida</option>
                </Select>
              </Field>

              {/*
                ¿LA ACREDITA UN TERCERO? POR FORMACION, NO SOLO POR TIPO (2026-09-06).

                Empezo viviendo solo en el tipo y el cliente lo cazo: dentro de "capacitacion del
                plan" conviven la charla de seguridad vial que dicta la ARL y no certifica nada, y
                el curso de alturas que dicta la ARL y si. Preguntarlo solo por clase de formacion
                obliga a elegir mal en la mitad de los casos, y lo que se elige mal se rellena a
                mano o se salta.

                Misma cascada que la constancia y la eficacia (#111, #118): el tipo pone el punto de
                partida y la formacion puede desviarse. Por eso el valor por defecto es "lo que diga
                su tipo" y no un si/no — que obligaria a decidir doscientas veces lo que casi
                siempre ya esta decidido.
              */}
              {/*
                DOS OPCIONES, NO TRES, SIN PERDER LA HERENCIA (2026-09-06).

                Tenia tres —"Lo que diga su tipo (si/no)", "Si", "No"— y la primera confundia: el
                cliente la leia como una tercera respuesta a una pregunta de si o no. *"Que sean dos,
                ya resueltas desde el tipo."*

                Y se puede, porque el valor heredado se sabe AQUI: se enseñan dos botones con la
                respuesta del tipo ya marcada, y mientras nadie los toque el campo **no viaja al
                servidor** —queda `null`, que es lo que significa "hereda"—. El dia que alguien lo
                cambia se guarda explicito, y hay una salida para volver a heredar.

                Asi la pantalla se simplifica y el modelo no pierde nada: la cascada del tipo (#111,
                #118) sigue entera, solo deja de pedirle al usuario que la entienda para contestar.
              */}
              <Field
                htmlFor="i-cert-externo"
                label="La acredita un tercero"
                ayuda="Si emite su propio certificado, la lista de asistencia pedira su numero y su vencimiento, y esa fecha manda. QUIEN lo expide no se dice aqui: sale de cada convocatoria, porque la misma formacion la puede dictar la ARL en marzo y un centro en septiembre."
                hint={
                  certExternoEsExplicito
                    ? 'Decidido en esta formacion, distinto de lo que diga su tipo.'
                    : `Lo que dice su tipo${nombreDelTipo ? ` (${nombreDelTipo})` : ''}.`
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented
                    label="La acredita un tercero"
                    disabled={!canEdit}
                    value={certExternoVisible}
                    onChange={(valor) => setForm({ ...form, tracksExternalCertificate: valor })}
                    options={[
                      { value: 'true', label: 'Si' },
                      { value: 'false', label: 'No' },
                    ]}
                  />
                  {certExternoEsExplicito && canEdit ? (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, tracksExternalCertificate: '' })}
                      className="focus-ring rounded text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
                    >
                      Volver a lo que diga su tipo
                    </button>
                  ) : null}
                </div>
              </Field>

              {/*
                ACEPTAR CERTIFICACION PREVIA — OTRA PREGUNTA, AUNQUE SUENE IGUAL (2026-09-08).

                Va justo debajo de "La acredita un tercero" y es facil confundirlas. La diferencia,
                dicha corta:

                  · ARRIBA: cuando la hagamos AQUI, ademas queda un papel de un tercero.
                  · AQUI:   un papel que ya traia de OTRA empresa nos vale EN LUGAR de hacerla.

                Son independientes. Lo normal es que la ARL dicte la formacion (arriba, si) y que la
                empresa exija igualmente su propia sesion (aqui, no) — hasta que la norma hace el
                papel transferible, como en alturas, y entonces las dos van a si.

                Nace en `false` por el tipo. Aceptar un papel ajeno es la excepcion: una induccion no
                la exime nada, porque enseña los procedimientos de ESTA empresa.
              */}
              <Field
                htmlFor="i-convalida"
                label="Acepta certificacion previa"
                ayuda="De otra empresa, obtenida antes de entrar. Solo tiene sentido cuando la norma hace el papel transferible —alturas, montacargas, espacios confinados—, donde repetir el curso es gastar dos veces en lo mismo. En NO, quien llega certificado la hace igual, que es lo correcto en todo lo que trate sobre procedimientos propios. Y aun en SI, aceptar cada papel concreto sigue siendo una decision de quien lo registra, con su motivo."
                hint={
                  convalidacionEsExplicita
                    ? 'Decidido en esta formacion, distinto de lo que diga su tipo.'
                    : `Lo que dice su tipo${nombreDelTipo ? ` (${nombreDelTipo})` : ''}.`
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented
                    label="Acepta certificacion previa de otra empresa"
                    disabled={!canEdit}
                    value={convalidacionVisible}
                    onChange={(valor) => setForm({ ...form, admiteConvalidacion: valor })}
                    options={[
                      { value: 'true', label: 'Si' },
                      { value: 'false', label: 'No' },
                    ]}
                  />
                  {convalidacionEsExplicita && canEdit ? (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, admiteConvalidacion: '' })}
                      className="focus-ring rounded text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
                    >
                      Volver a lo que diga su tipo
                    </button>
                  ) : null}
                </div>
              </Field>
            </div>

            {/*
              LA NORMA Y LA DESCRIPCION, AL FINAL Y EN ESE ORDEN (2026-09-08).

              Segundo ajuste del orden en dos dias, y el cliente tiene razon en los dos. Primero
              subio el nombre; ahora baja lo demas, por dos motivos distintos:

              · LA NORMA importa menos que el proceso y el responsable. Clasifica —para poder decir
                cuanta formacion tributa a cada norma— pero no decide nada: ni a quien se le exige,
                ni que lleva la formacion. Lo que se consulta a diario va antes.

              · LA DESCRIPCION va la ULTIMA porque es el unico campo GRANDE. Un area de texto de
                tres renglones en medio del formulario parte la retahila de campos cortos en dos y
                obliga a saltarla con la vista para seguir leyendo. Al final no parte nada, y ademas
                puede crecer sin empujar a nadie.

              La regla que deja, para la proxima pantalla: **los campos grandes van al final**, y el
              orden de los cortos lo decide con que frecuencia se miran.
            */}
            {/*
              La norma vive AQUI y no en su propia tarjeta: es un campo mas de la ficha, y un
              contenedor entero para un solo desplegable hacia parecer que decidia algo. No decide:
              clasifica.
            */}
            <Field
              htmlFor="i-norms"
              label="Norma aplicable"
              ayuda="Solo clasifica, para poder decir despues cuanta formacion tributa a cada norma. No decide a quien se le exige."
            >
              <MultiSelect
                id="i-norms"
                disabled={!canEdit}
                placeholder="Ninguna norma seleccionada"
                options={catalogs.norms.map((row) => ({
                  id: row.id,
                  label: row.name,
                }))}
                value={form.normIds}
                onChange={(normIds) => setForm({ ...form, normIds })}
              />
            </Field>

            <Field htmlFor="i-description" label="Descripcion" hint="Lo que vera el colaborador antes de empezar.">
              <Textarea
                id="i-description"
                rows={3}
                maxLength={4000}
                disabled={!canEdit}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
        </section>

        {canEdit ? (
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>
              <Save size={16} />
              Guardar ficha
            </Button>
          </div>
        ) : null}
      </div>

      {/*
        LA AYUDA, guardada detras de un boton.
        Explica algo que se entiende una vez y no hace falta volver a leer, asi que ocupar un
        tercio de la pantalla para siempre le cobra a todo el mundo lo que solo necesita quien
        llega nuevo. Se abre cuando se pide, y se queda abierta mientras dure la sesion.
      */}
      {!helpOpen ? (
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Donde quedo cada dato"
          title="Donde quedo cada dato"
          className="focus-ring h-fit rounded-full border border-line bg-surface p-2.5 text-ink-500 transition-colors duration-150 hover:border-info hover:text-info"
        >
          <Info size={18} strokeWidth={1.75} />
        </button>
      ) : (
        <aside className="card h-fit w-[320px] p-5">
          <div className="flex items-start gap-2">
            <Info size={16} className="mt-0.5 shrink-0 text-info" strokeWidth={1.75} />
            <h3 className="font-display text-sm font-semibold text-ink-900">Donde quedo cada dato</h3>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              aria-label="Ocultar la ayuda"
              className="focus-ring ml-auto -mr-1 -mt-1 rounded p-1 text-ink-500 hover:text-ink-900"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-500">
            El formulario de una sola hoja se partio en dos, y la razon es que la mitad de los datos NO cambian cuando
            la formacion se vuelve a dictar.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-ink-900">Aqui, en la ficha</dt>
              <dd className="text-ink-500">
                Proceso, responsable, tipo, nombre, descripcion, modalidad y norma. Se escribe una vez y sirve para
                siempre.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">En Programacion</dt>
              <dd className="text-ink-500">
                Fecha, intensidad horaria teorica y practica, instructor, ejecutada por, lugar, cupo y observaciones.
                Cambian en cada jornada.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">En Contenido</dt>
              <dd className="text-ink-500">Las lecciones, videos, documentos y la evaluacion.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">En Quienes</dt>
              <dd className="text-ink-500">
                A quienes se les exige: cargos, areas, regionales y servicios, con su plazo. Es el unico sitio donde se
                marca.
              </dd>
            </div>
          </dl>
        </aside>
      )}
    </div>
  );
}
