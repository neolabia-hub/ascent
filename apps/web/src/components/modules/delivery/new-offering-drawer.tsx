'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { readTypeConfig, type ActivityTypeConfig } from '@/lib/activity-type';
import { listCatalog, listPickableUsers, type PickableUser } from '@/lib/admin-api';
import { listActivities, type ActivityListItem, type Modality } from '@/lib/catalog-api';
import { addPlanItem, createOffering, listPlans, type OfferingDetail } from '@/lib/delivery-api';
import { MONTHS } from '@/lib/format';
import {
  cuerpoDeConvocatoria,
  loQueFaltaEnLaConvocatoria,
  nuevaConvocatoria,
  OfferingForm,
  type OfferingFormCatalogs,
  type OfferingFormValue,
} from '@/components/modules/delivery/offering-form';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Combo } from '@/components/ui/combo';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * CREAR UNA CONVOCATORIA, desde donde haga falta.
 *
 * Vivia dentro de la pantalla de Convocatorias, y por eso planear el ano obligaba a salirse del
 * plan: crear la actividad, publicarla, ir a Convocatorias, crear la jornada y volver al plan a
 * buscarla en un desplegable de cien. Cuatro pantallas para un renglon.
 *
 * Sacado aqui, el plan puede crear la jornada sin moverse. Lo que NO cambia es el modelo: el plan
 * sigue REFERENCIANDO convocatorias, no poseyendolas (regla de oro 3). Crear desde el plan es un
 * atajo de interfaz —se crea la convocatoria y despues se agrega el renglon—, y los indicadores se
 * calculan igual que si se hubiera creado por el otro camino.
 *
 * LOS CAMPOS son los mismos que en la pestana Programacion, porque son el MISMO componente
 * (`OfferingForm`). Antes eran dos formularios distintos y habian divergido: este no pedia
 * instructor ni observaciones, fijaba "ejecutada por: propios" y arrancaba en presencial sin
 * heredar la modalidad de la ficha. Quien programaba desde el plan no podia poner el instructor
 * nunca, porque tampoco existia pantalla de edicion.
 */

interface PublishedVersionOption {
  versionId: string;
  label: string;
  /** El tipo manda: decide si esta convocatoria pregunta por fecha, instructor y lugar. */
  config: ActivityTypeConfig;
  modality: Modality;
  /** Lo que hace falta para ensenarla como fila y no como una linea de texto gris. */
  activityName: string;
  code: string;
  typeName: string;
  typeColor: string | null;
  processName: string;
  versionNumber: number;
  publicada: boolean;
}

/**
 * Las formaciones que se pueden convocar: la version PUBLICADA si la hay, y si no, el BORRADOR.
 *
 * Antes solo se ofrecian las publicadas, y eso obligaba a publicar contenido para poder planear
 * el ano — en enero, cuando el contenido de marzo todavia no existe (Decision #77). La
 * convocatoria puede quedar PROGRAMADA sobre un borrador; lo que no se puede es publicarla, y de
 * eso se encarga el servidor.
 *
 * El borrador se marca en el rotulo. Ofrecerlo sin decirlo seria peor que no ofrecerlo: quien lo
 * elige tiene que saber que esa convocatoria no se va a poder abrir todavia.
 */
function publishedVersions(activities: ActivityListItem[]): PublishedVersionOption[] {
  return activities.flatMap((activity) => {
    const published = activity.versions.find((version) => version.status === 'PUBLISHED');
    const draft = activity.versions.find((version) => version.status === 'DRAFT');
    const usable = published ?? draft;
    return usable
      ? [
          {
            versionId: usable.id,
            label: published
              ? `${activity.name} (v${usable.versionNumber})`
              : `${activity.name} (v${usable.versionNumber} — contenido en borrador)`,
            config: readTypeConfig(activity.activityType.config),
            modality: activity.modality,
            activityName: activity.name,
            code: activity.code,
            typeName: activity.activityType.name,
            typeColor: activity.activityType.colorHex,
            processName: activity.process.name,
            versionNumber: usable.versionNumber,
            publicada: Boolean(published),
          },
        ]
      : [];
  });
}

export interface NewOfferingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Version fija: "otra jornada de esta misma capacitacion". Cuando viene, el selector se
   * sustituye por el nombre, porque ahi la pregunta ya esta contestada.
   *
   * `config` y `modality` viajan con ella porque son lo que decide QUE CAMPOS se piden. Sin
   * ellos habia que buscar la version en `listActivities({ pageSize: 100 })`, y a partir de la
   * actividad 101 no se encontraba: el formulario se armaba con los valores por defecto y una
   * capacitacion del plan dejaba de pedir fecha, lugar e instructor sin decir nada. Es la misma
   * familia de fallo que el desplegable de convocatorias del plan (ver RUNBOOK, dos veces).
   */
  lockedVersion?: { id: string; label: string; config?: ActivityTypeConfig; modality?: Modality } | null;
  /**
   * Desde el plan: se pide ademas el mes programado del renglon, y **solo se ofrecen
   * capacitaciones DEL PLAN** (Decision #78). Una induccion o una extraordinaria no puede mover
   * los indicadores del plan (regla de oro 2), asi que ofrecerlas es ofrecer un error.
   */
  askPlanMonth?: boolean;
  defaultMonth?: number;
  /**
   * Desde un plan YA APROBADO: se pide el motivo, y sin el no se deja crear (Decision #55).
   * Se pregunta ANTES de crear nada, no despues: si se pidiera al final, una jornada podria
   * quedar creada y sin entrar al plan porque alguien cerro la ventana.
   */
  askJustification?: boolean;
  /**
   * DESDE UNA PANTALLA QUE NO ES EL PLAN (el modulo de Convocatorias): si la formacion elegida es
   * del plan y el plan del ano YA ESTA APROBADO, el cajon pide el motivo y mete el renglon por su
   * cuenta.
   *
   * Existe porque programar tiene que significar lo mismo se entre por donde se entre. Con el plan
   * en BORRADOR el renglon entra solo —lo hace el servidor, Decision #75— pero con el plan aprobado
   * no, y la jornada quedaba fuera del plan: se dicta, la gente asiste, y no cuenta para el
   * cumplimiento de nadie. El plan ya lo resolvia por su lado; las demas pantallas no.
   */
  autoPlan?: boolean;
  /** Se llama con la convocatoria ya creada. El mes viene null si no se pidio. */
  onCreated: (offering: OfferingDetail, plannedMonth: number | null, justification?: string) => Promise<void> | void;
}

export function NewOfferingDrawer({
  open,
  onOpenChange,
  lockedVersion = null,
  askPlanMonth = false,
  defaultMonth,
  askJustification = false,
  autoPlan = false,
  onCreated,
}: NewOfferingDrawerProps) {
  const [justification, setJustification] = useState('');
  /** El plan del ano si ya esta APROBADO. Solo se busca cuando `autoPlan`. */
  const [planAprobado, setPlanAprobado] = useState<{ id: string; year: number } | null>(null);
  const [versions, setVersions] = useState<PublishedVersionOption[]>([]);
  const [people, setPeople] = useState<PickableUser[]>([]);
  const [catalogs, setCatalogs] = useState<OfferingFormCatalogs>({
    regionals: [],
    jobTitles: [],
    areas: [],
    services: [],
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activityVersionId, setActivityVersionId] = useState('');
  const [plannedMonth, setPlannedMonth] = useState(String(defaultMonth ?? new Date().getMonth() + 1));
  /**
   * ¿Lo toco alguien? Mientras no, el mes del plan SIGUE a la fecha de la jornada.
   *
   * Preguntar las dos cosas a la vez es preguntar dos veces lo mismo: se teclea "15 de
   * septiembre" y el desplegable se queda en enero, asi que una jornada de septiembre entraba al
   * plan como de enero y el cronograma la pintaba en la columna equivocada. Nadie relee un campo
   * que ya viene lleno.
   *
   * Y aun asi el mes NO desaparece del formulario, porque los dos datos no son el mismo:
   *   - la FECHA es cuando se dicta,
   *   - el MES del plan es contra que mes se mide el cumplimiento, y se queda quieto.
   * Es lo que permite distinguir "se hizo en su mes" de "se movio" (RESCHEDULED). Si el mes se
   * derivara siempre de la fecha, correr una jornada de marzo a junio reescribiria el plan en
   * silencio y el cumplimiento saldria perfecto todos los anos.
   *
   * Ademas hay jornadas SIN fecha —las permanentes, que es como se dicta casi todo el
   * autoservicio—: ahi se propone desde "disponible desde" y, si tampoco la hay, no hay nada de
   * donde sacarlo y la eleccion es de verdad del analista.
   */
  const [monthTouched, setMonthTouched] = useState(false);
  const [form, setForm] = useState<OfferingFormValue>(() => nuevaConvocatoria(readTypeConfig(null), 'VIRTUAL'));

  // Se recarga al ABRIR y no al montar: entre una apertura y otra puede haberse publicado una
  // version nueva, y un desplegable desactualizado hace pensar que la actividad no existe.
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setJustification('');
    setActivityVersionId(lockedVersion?.id ?? '');
    setPlannedMonth(String(defaultMonth ?? new Date().getMonth() + 1));
    setMonthTouched(false);
    // El plan del ano, si esta APROBADO: es el unico caso en que el renglon no entra solo.
    if (autoPlan) {
      void listPlans()
        .then((filas) => {
          const enCurso = new Date().getFullYear();
          const vivos = filas.filter((row) => row.status !== 'CLOSED' && row.status !== 'DRAFT');
          const elegido =
            vivos.find((row) => row.year === enCurso) ??
            vivos.filter((row) => row.year > enCurso).sort((a, b) => a.year - b.year)[0] ??
            null;
          setPlanAprobado(elegido ? { id: elegido.id, year: elegido.year } : null);
        })
        .catch(() => setPlanAprobado(null));
    }
    void listActivities({ pageSize: 100 }).then((result) => setVersions(publishedVersions(result.items)));
    void listPickableUsers().then(setPeople).catch(() => undefined);
    void Promise.all([
      listCatalog('regionals'),
      listCatalog('job-titles'),
      listCatalog('areas'),
      listCatalog('services'),
    ])
      .then(([regionals, jobTitles, areas, services]) =>
        setCatalogs({
          regionals: regionals.filter((row) => row.active),
          jobTitles: jobTitles.filter((row) => row.active),
          areas: areas.filter((row) => row.active),
          services: services.filter((row) => row.active),
        }),
      )
      .catch(() => undefined);
  }, [open, lockedVersion?.id, defaultMonth]);

  /**
   * Al elegir la formacion, el formulario se REARMA con lo que su tipo propone: una pildora no
   * nace con fecha ni instructor, y una capacitacion del plan si. Sin esto, el formulario abria
   * siempre en "evento presencial", que es lo que hacia antes y era falso la mitad de las veces.
   */
  const elegida =
    // Lo que trae `lockedVersion` MANDA sobre lo que se encuentre en la lista: la lista viene
    // recortada a 100 actividades y ahi es donde se perdia el tipo.
    lockedVersion?.config
      ? {
          versionId: lockedVersion.id,
          label: lockedVersion.label,
          config: lockedVersion.config,
          modality: lockedVersion.modality ?? 'VIRTUAL',
        }
      : (versions.find((version) => version.versionId === activityVersionId) ?? null);
  // `open` entra en las dependencias porque con la version fija el id no cambia entre una
  // apertura y la siguiente: sin el, la segunda jornada nacia con lo tecleado en la primera.
  useEffect(() => {
    if (!open || !elegida) return;
    setForm(nuevaConvocatoria(elegida.config, elegida.modality));
  }, [elegida?.versionId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  /** De donde sale el mes propuesto: la fecha de la sesion, o el inicio de la ventana. */
  const fechaAncla = form.kind === 'PERMANENT' ? form.windowStart : form.scheduledDate || form.windowStart;
  useEffect(() => {
    if (!askPlanMonth || monthTouched || !fechaAncla) return;
    // Las fechas del formulario son 'YYYY-MM-DD': se parte el texto en vez de construir un Date,
    // que interpretaria la cadena como UTC y en Colombia devolveria el mes anterior el dia 1.
    const mes = Number(fechaAncla.split('-')[1]);
    if (mes >= 1 && mes <= 12) setPlannedMonth(String(mes));
  }, [fechaAncla, askPlanMonth, monthTouched]);

  /**
   * Lo que se puede convocar desde AQUI. Desde el plan se acota a las capacitaciones del plan
   * (Decision #78); desde Convocatorias o desde la ficha, cualquiera.
   */
  const elegibles = askPlanMonth ? versions.filter((version) => version.config.participatesInPlan) : versions;

  /*
    ¿HAY QUE PEDIR EL MOTIVO DEL PLAN? Solo si esta pantalla lo gestiona (`autoPlan`), la formacion
    elegida es del plan, y el plan del ano ya esta APROBADO. Con el plan en borrador el renglon
    entra solo y pedir un motivo por cada jornada del ano seria ruido.
  */
  const entraAlPlanAprobado = autoPlan && planAprobado !== null && elegida?.config.participatesInPlan === true;
  const pideMotivo = askJustification || entraAlPlanAprobado;

  const falta = loQueFaltaEnLaConvocatoria(form);
  const valid =
    Boolean(activityVersionId) &&
    falta.length === 0 &&
    // El servidor exige 10 caracteres; el boton se apaga aqui para no enterarse al enviar.
    (!pideMotivo || justification.trim().length >= 10);

  const submit = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const offering = await createOffering(cuerpoDeConvocatoria(form, activityVersionId));
      /*
        EL RENGLON, cuando esta pantalla lo gestiona y el plan ya esta aprobado. Va ANTES de avisar
        al padre para que "creada y agregada al plan" sea cierto cuando se diga.
      */
      if (entraAlPlanAprobado && planAprobado) {
        await addPlanItem(planAprobado.id, {
          offeringId: offering.id,
          plannedMonth: Number(plannedMonth),
          justification: justification.trim(),
        });
      }
      await onCreated(offering, askPlanMonth ? Number(plannedMonth) : null, pideMotivo ? justification.trim() : undefined);
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'No se pudo crear la convocatoria');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={lockedVersion ? 'Otra convocatoria de esta capacitacion' : 'Nueva convocatoria'}
      description={
        askPlanMonth
          ? 'Se crea en borrador y entra al plan como renglon. Al publicarla se congelan los proyectados.'
          : 'Queda en borrador. Al publicarla se congelan los proyectados y se puede convocar gente.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={creating} disabled={!valid}>
            {askPlanMonth ? 'Crear y agregar al plan' : 'Crear convocatoria'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {pideMotivo ? (
          <Field
            htmlFor="o-justification"
            label={
              planAprobado
                ? `Por que se agrega al plan ${planAprobado.year}, que ya esta aprobado`
                : 'Por que se agrega al plan aprobado'
            }
            required
            hint="Queda en la auditoria junto al renglon. Ejemplo: se abrio la regional de Neiva en agosto."
          >
            <Textarea
              id="o-justification"
              rows={2}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        ) : null}

        {lockedVersion ? (
          <div className="rounded-lg border border-line bg-paper px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Capacitacion</p>
            <p className="mt-0.5 text-sm font-medium text-ink-900">{lockedVersion.label}</p>
          </div>
        ) : (
          <Field
            htmlFor="o-version"
            label="Formacion"
            required
            hint={
              askPlanMonth
                ? 'Solo capacitaciones del plan: una induccion o una extraordinaria no cuenta para sus indicadores.'
                : 'Se puede programar aunque el contenido siga en borrador; publicarla exige publicarlo antes.'
            }
          >
            <Combo
              id="o-version"
              placeholder="Elegir la formacion..."
              searchPlaceholder="Buscar por nombre o codigo..."
              value={activityVersionId}
              onChange={setActivityVersionId}
              emptyLabel={
                askPlanMonth ? 'No hay capacitaciones del plan' : 'Todavia no hay formaciones'
              }
              emptyHint={
                askPlanMonth
                  ? 'Su tipo tiene que ser "Capacitacion del plan" para que cuente en el cumplimiento y la cobertura.'
                  : 'Crea una formacion y agregale contenido; despues vuelve aqui para programarla.'
              }
              options={elegibles.map((version) => ({
                id: version.versionId,
                code: version.code,
                label: version.activityName,
                chip: { label: version.typeName, colorHex: version.typeColor },
                badge: version.publicada
                  ? { label: `V${version.versionNumber}`, tone: 'info' as const }
                  : { label: 'SIN PUBLICAR', tone: 'warn' as const },
                meta: version.processName,
              }))}
            />
          </Field>
        )}

        {askPlanMonth ? (
          <Field
            htmlFor="o-month"
            label="Mes programado"
            required
            hint={
              fechaAncla && !monthTouched
                ? 'Tomado de la fecha de la jornada. Es el mes contra el que se mide el cumplimiento, y se queda quieto aunque despues se reprograme.'
                : 'El mes contra el que se mide el cumplimiento del plan, aunque la fecha exacta cambie despues.'
            }
          >
            <Select
              id="o-month"
              value={plannedMonth}
              onChange={(event) => {
                setMonthTouched(true);
                setPlannedMonth(event.target.value);
              }}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <OfferingForm
          value={form}
          onChange={setForm}
          catalogs={catalogs}
          people={people}
          activityVersionId={activityVersionId || null}
        />

        {falta.length > 0 ? (
          <ul className="space-y-1 rounded-md bg-warn-soft px-3 py-2">
            {falta.map((linea) => (
              <li key={linea} className="text-sm text-warn">
                {linea}
              </li>
            ))}
          </ul>
        ) : null}

        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
      </div>
    </Drawer>
  );
}
