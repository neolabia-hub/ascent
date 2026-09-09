'use client';

import { useEffect, useState } from 'react';
import { esJornada, type ActivityTypeConfig } from '@/lib/activity-type';
import type { CatalogRow, PickableUser } from '@/lib/admin-api';
import type { Modality } from '@/lib/catalog-api';
import {
  EMPTY_RULE,
  previewProjected,
  type AudienceRule,
  type ExecutedBy,
  type FacetCount,
  type OfferingBody,
  type OfferingDetail,
  type OfferingKind,
  type ProjectedPreview,
} from '@/lib/delivery-api';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { PersonPicker } from '@/components/ui/person-picker';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * EL FORMULARIO DE LA CONVOCATORIA. Uno solo, para los tres sitios donde se programa.
 *
 * Habia DOS formularios distintos para la misma cosa: el de la pestana Programacion pedia
 * instructor, ejecutada por y observaciones y heredaba la modalidad; el del modulo y el del plan
 * no pedian instructor, fijaban "propios" y arrancaban en presencial sin heredar nada. Quien
 * programaba desde el plan no podia poner el instructor **nunca**, porque tampoco existe pantalla
 * de edicion. Dos formularios para una entidad no divergen por descuido: divergen siempre.
 *
 * LO QUE SE PREGUNTA LO DECIDE LA FORMA, y el tipo de formacion propone la forma:
 *
 *   con fecha (sesion o mixta) -> fecha, hora, lugar, instructor, ejecutada por, intensidad, cupo
 *   permanente                 -> nada de eso; a lo sumo, desde cuando y hasta cuando
 *
 * Asi una pildora no pregunta por instructor —no lo tiene— y una capacitacion del plan si. Y si
 * alguien decide dictar una pildora en una sesion presencial, los campos aparecen: manda lo que
 * se eligio, no lo que el tipo suponia.
 */

export interface OfferingFormValue {
  kind: OfferingKind;
  modality: Modality;
  /**
   * Como se cierra la jornada: '' = lo que diga su modalidad (el caso normal), 'true' por lista,
   * 'false' por la plataforma. Texto porque es lo que devuelve un `<select>`; se convierte al
   * guardar, en un solo sitio.
   */
  closesByAttendance: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  windowStart: string;
  windowEnd: string;
  intensityTheoryHours: string;
  intensityPracticeHours: string;
  instructorUserId: string;
  instructorExternalName: string;
  executedBy: ExecutedBy;
  executedByOther: string;
  location: string;
  regionalId: string;
  capacity: string;
  observations: string;
  /** La TAJADA: a que parte de los obligados atiende. Sin facetas = a todos. */
  scope: AudienceRule;
}

/**
 * Quien la imparte. "La empresa" es con gente propia; el resto son terceros, y de un tercero
 * importa CUAL: "la ARL Sura dicto 14 jornadas" es una metrica, "un tercero" no lo es.
 *
 * El ejemplo cambia con la opcion. Un placeholder fijo ("ARL Sura") debajo de "EPS" es ruido que
 * el usuario tiene que descartar mentalmente cada vez.
 */
const EJECUTA: Array<{ value: ExecutedBy; label: string; externa: boolean; ejemplo: string }> = [
  { value: 'PROPIOS', label: 'La empresa, con gente propia', externa: false, ejemplo: '' },
  { value: 'ARL', label: 'La ARL', externa: true, ejemplo: 'ARL Sura' },
  { value: 'EPS', label: 'La EPS', externa: true, ejemplo: 'EPS Sanitas' },
  { value: 'TEMPORALES', label: 'La temporal', externa: true, ejemplo: 'Temporal Activos' },
  { value: 'OTROS', label: 'Otro tercero', externa: true, ejemplo: 'Consultor externo' },
];

export function esExterna(executedBy: ExecutedBy): boolean {
  return EJECUTA.find((row) => row.value === executedBy)?.externa ?? false;
}

function ejemploDe(executedBy: ExecutedBy): string {
  return EJECUTA.find((row) => row.value === executedBy)?.ejemplo ?? '';
}

/** Valores iniciales de una convocatoria nueva: los que el TIPO propone. */
/**
 * QUIEN LA DICTO LA VEZ ANTERIOR, para no volver a teclearlo.
 *
 * Lo pregunto el cliente —*"¿de verdad pasa que la misma formacion la de una ARL en marzo y otra en
 * septiembre?"*— y la respuesta honesta es que pasa, pero es minoria: al cambiar de ARL, al
 * dictarla en dos ciudades con centros distintos, o cuando una sesion la cubre un instructor propio.
 *
 * Por eso el dato sigue viviendo en la CONVOCATORIA y no en la formacion —cuando cambia, cambia ahi—
 * pero se hereda de la ultima: lo normal es repetirlo, y escribirlo cada vez es teclear un dato que
 * el sistema ya tiene tres lineas mas arriba.
 */
export function quienDictoLaAnterior(
  previas: { scheduledDate: string | null; executedBy?: string; executedByOther?: string | null }[],
): { executedBy: string; executedByOther: string } | null {
  const conEjecutor = previas.filter((o) => o.executedBy);
  if (conEjecutor.length === 0) return null;
  // La mas reciente por fecha; las que no tienen fecha van al final.
  const ultima = [...conEjecutor].sort((a, b) => (b.scheduledDate ?? '').localeCompare(a.scheduledDate ?? ''))[0];
  if (!ultima?.executedBy) return null;
  return { executedBy: ultima.executedBy, executedByOther: ultima.executedByOther ?? '' };
}

export function nuevaConvocatoria(
  config: ActivityTypeConfig,
  modality: Modality,
  heredado?: { executedBy: string; executedByOther: string } | null,
): OfferingFormValue {
  const conFecha = esJornada(config);
  return {
    kind: config.defaultOfferingKind,
    modality,
    closesByAttendance: '',
    scheduledDate: '',
    startTime: conFecha ? '08:00' : '',
    endTime: conFecha ? '12:00' : '',
    windowStart: '',
    windowEnd: '',
    intensityTheoryHours: '',
    intensityPracticeHours: '',
    instructorUserId: '',
    instructorExternalName: '',
    // Se hereda de la jornada anterior de esta formacion; 'PROPIOS' solo cuando no hay ninguna.
    executedBy: (heredado?.executedBy as ExecutedBy) ?? 'PROPIOS',
    executedByOther: heredado?.executedByOther ?? '',
    location: '',
    regionalId: '',
    capacity: '',
    observations: '',
    scope: { ...EMPTY_RULE },
  };
}

/** Los valores de una convocatoria que ya existe, para poder ABRIRLA y corregirla. */
export function convocatoriaExistente(offering: OfferingDetail): OfferingFormValue {
  const fecha = (value: string | null): string => (value ? value.slice(0, 10) : '');
  return {
    kind: offering.kind,
    modality: offering.modality,
    closesByAttendance:
      offering.closesByAttendance === null || offering.closesByAttendance === undefined
        ? ''
        : String(offering.closesByAttendance),
    scheduledDate: fecha(offering.scheduledDate),
    startTime: offering.startTime ?? '',
    endTime: offering.endTime ?? '',
    windowStart: fecha(offering.windowStart),
    windowEnd: fecha(offering.windowEnd),
    intensityTheoryHours: offering.intensityTheoryHours === null ? '' : String(offering.intensityTheoryHours),
    intensityPracticeHours: offering.intensityPracticeHours === null ? '' : String(offering.intensityPracticeHours),
    instructorUserId: offering.instructorUserId ?? '',
    instructorExternalName: offering.instructorExternalName ?? '',
    executedBy: offering.executedBy,
    executedByOther: offering.executedByOther ?? '',
    location: offering.location ?? '',
    regionalId: offering.regionalId ?? '',
    capacity: offering.capacity === null ? '' : String(offering.capacity),
    observations: offering.observations ?? '',
    scope: offering.audience?.rule ?? { ...EMPTY_RULE },
  };
}

/** Lo que se manda al servidor. Lo que no aplica a la forma elegida viaja como null, no vacio. */
export function cuerpoDeConvocatoria(value: OfferingFormValue, activityVersionId?: string): OfferingBody {
  const conFecha = value.kind !== 'PERMANENT';
  const permanente = value.kind !== 'EVENT';
  const numero = (texto: string): number | null => (texto.trim() === '' ? null : Number(texto));
  const marcado = tieneFacetas(value.scope);
  return {
    ...(activityVersionId ? { activityVersionId } : {}),
    kind: value.kind,
    modality: value.modality,
    closesByAttendance: value.closesByAttendance === '' ? null : value.closesByAttendance === 'true',
    scheduledDate: conFecha && value.scheduledDate ? value.scheduledDate : null,
    startTime: conFecha && value.startTime ? value.startTime : null,
    endTime: conFecha && value.endTime ? value.endTime : null,
    windowStart: permanente && value.windowStart ? value.windowStart : null,
    windowEnd: permanente && value.windowEnd ? value.windowEnd : null,
    intensityTheoryHours: conFecha ? numero(value.intensityTheoryHours) : null,
    intensityPracticeHours: conFecha ? numero(value.intensityPracticeHours) : null,
    instructorUserId: conFecha && value.instructorUserId ? value.instructorUserId : null,
    instructorExternalName:
      conFecha && esExterna(value.executedBy) && value.instructorExternalName.trim()
        ? value.instructorExternalName.trim()
        : null,
    executedBy: conFecha ? value.executedBy : 'PROPIOS',
    executedByOther:
      conFecha && esExterna(value.executedBy) && value.executedByOther.trim() ? value.executedByOther.trim() : null,
    location: conFecha && value.location.trim() ? value.location.trim() : null,
    regionalId: value.regionalId || null,
    capacity: conFecha ? numero(value.capacity) : null,
    observations: value.observations.trim() || null,
    audienceScope: marcado ? value.scope : null,
  };
}

function tieneFacetas(scope: AudienceRule): boolean {
  return (
    scope.jobTitleIds.length > 0 ||
    scope.areaIds.length > 0 ||
    scope.regionalIds.length > 0 ||
    scope.serviceIds.length > 0
  );
}

/** Lo que falta para poder guardar, dicho en la pantalla y no al recibir un 422. */
export function loQueFaltaEnLaConvocatoria(value: OfferingFormValue): string[] {
  const falta: string[] = [];
  const conFecha = value.kind !== 'PERMANENT';
  if (conFecha && !value.scheduledDate) falta.push('La sesion necesita fecha.');
  if (conFecha && value.modality !== 'VIRTUAL' && !value.location.trim()) {
    falta.push('Indica el lugar: una sesion presencial sin lugar no se puede convocar.');
  }
  if (conFecha && value.startTime && value.endTime && value.startTime >= value.endTime) {
    falta.push('La hora de fin debe ser posterior a la de inicio.');
  }
  if (value.windowStart && value.windowEnd && value.windowStart > value.windowEnd) {
    falta.push('La ventana se cierra antes de abrirse.');
  }
  if (conFecha && esExterna(value.executedBy) && !value.executedByOther.trim()) {
    falta.push('Indica quien la dicta: "la ARL" sin decir cual no se puede medir despues.');
  }
  return falta;
}

export interface OfferingFormCatalogs {
  regionals: CatalogRow[];
  jobTitles: CatalogRow[];
  areas: CatalogRow[];
  services: CatalogRow[];
}

export function OfferingForm({
  value,
  onChange,
  catalogs,
  people,
  /** Area sugerida para el instructor: la del proceso de la formacion, como en el responsable. */
  suggestedAreaId = null,
  /** Publicada: solo se corrige la logistica. La fecha y la tajada mueven indicadores. */
  soloLogistica = false,
  /** La version que se va a convocar: sin ella no se pueden previsualizar los proyectados. */
  activityVersionId = null,
}: {
  value: OfferingFormValue;
  onChange: (value: OfferingFormValue) => void;
  catalogs: OfferingFormCatalogs;
  people: PickableUser[];
  suggestedAreaId?: string | null;
  soloLogistica?: boolean;
  activityVersionId?: string | null;
}) {
  /** La tajada arranca plegada: en la mayoria de las jornadas no se toca. */
  const [tajadaAbierta, setTajadaAbierta] = useState(tieneFacetas(value.scope));

  /**
   * A CUANTOS OBLIGADOS ALCANZA EL CORTE, mientras se marca.
   *
   * Los selectores decian a QUE se acota —"Conductores de Antioquia"— y no a CUANTOS, que es
   * la pregunta que se hace quien esta partiendo el reparto: si esta jornada atiende a 8 o a
   * 80 decide si cabe en una sesion. Enterarse despues de publicar, cuando el numero ya quedo
   * congelado, es la peor forma de descubrir que el corte estaba mal.
   *
   * ANTES CONTABA LO QUE NO ERA (2026-09-03). Preguntaba a cuanta gente DE LA EMPRESA encajaba
   * con las facetas, asi que con los campos vacios —el caso normal— decia la plantilla entera:
   * "cubre a 773 personas" en una formacion que obliga a nueve. Lo que se congela al publicar son
   * los OBLIGADOS que caen dentro, y eso es lo que se pregunta ahora, al mismo servicio que
   * congela. La frase de debajo ya lo decia bien; el numero de arriba la desmentia.
   *
   * Es una CONSULTA, no una decision: no crea ninguna obligacion ni toca nada.
   */
  const [proyectados, setProyectados] = useState<ProjectedPreview | null>(null);
  useEffect(() => {
    if (!activityVersionId) {
      setProyectados(null);
      return;
    }
    let cancelado = false;
    // Se espera un momento: marcar tres cargos seguidos no puede ser tres consultas.
    const timer = setTimeout(() => {
      void previewProjected({
        activityVersionId,
        scope: value.scope,
        regionalId: value.regionalId || null,
      })
        .then((preview) => {
          if (!cancelado) setProyectados(preview);
        })
        .catch(() => {
          if (!cancelado) setProyectados(null);
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [value.scope, value.regionalId, activityVersionId]);

  /**
   * LOS SELECTORES, ACOTADOS A LO QUE HAY DENTRO.
   *
   * Ofrecer los cuarenta cargos del catalogo en una formacion que obliga a tres invita a cortar
   * por uno que da cero, y ese error solo se ve despues de publicar. Se enseña lo que existe
   * ENTRE LOS OBLIGADOS, con cuantos hay de cada uno.
   *
   * Si todavia no hay ningun obligado —o no se sabe que version es— se enseña el catalogo
   * entero: acotar antes de que nazcan las obligaciones es legitimo, y una lista vacia seria un
   * callejon sin salida.
   */
  const opcionesDe = (filas: CatalogRow[], presentes: FacetCount[] | undefined) => {
    if (!presentes || presentes.length === 0) {
      return filas.map((fila) => ({ id: fila.id, label: fila.name }));
    }
    const cuantos = new Map(presentes.map((faceta) => [faceta.id, faceta.count]));
    return filas
      .filter((fila) => cuantos.has(fila.id))
      .map((fila) => ({ id: fila.id, label: fila.name, hint: `${cuantos.get(fila.id)} obligados` }));
  };
  const set = (parcial: Partial<OfferingFormValue>) => onChange({ ...value, ...parcial });
  const conFecha = value.kind !== 'PERMANENT';
  const permanente = value.kind !== 'EVENT';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          htmlFor="o-kind"
          label="Como se hace"
          required
          hint={
            value.kind === "PERMANENT"
              ? "Entra sola cuando pueda. No pide fecha, lugar ni quien la imparte."
              : "Hay que citarla: pide fecha, lugar, quien la imparte y cupo."
          }
        >
          <Select
            id="o-kind"
            disabled={soloLogistica}
            value={value.kind}
            onChange={(event) => set({ kind: event.target.value as OfferingKind })}
          >
            <option value="PERMANENT">Disponible siempre</option>
            <option value="EVENT">Sesión con fecha</option>
            <option value="HYBRID">Sesión + disponible</option>
          </Select>
        </Field>
        <Field htmlFor="o-modality" label="Modalidad" required hint="Viene de la ficha; cada jornada puede cambiarla.">
          <Select
            id="o-modality"
            disabled={soloLogistica}
            value={value.modality}
            onChange={(event) => set({ modality: event.target.value as Modality })}
          >
            <option value="PRESENCIAL">Presencial</option>
            <option value="VIRTUAL">Virtual</option>
            <option value="HIBRIDA">Hibrida</option>
          </Select>
        </Field>
      </div>

      {/*
        COMO SE REGISTRA QUE LA HICIERON — SE PREGUNTA, NO SE ADIVINA (2026-09-06, rehecho el 08).

        ─── POR QUE SE PREGUNTA ───

        La regla derivada cambio dos veces en dos dias, las dos por un caso real que la anterior no
        cubria: una capacitacion del plan con fecha pero virtual y con contenido (no lleva lista) y
        una que dicta la ARL por videollamada en vivo (si la lleva, y es virtual). La respuesta
        depende de como se dicto ESA sesion, y eso solo lo sabe quien la esta programando.

        ─── POR QUE LA MODALIDAD SUGIERE Y NO DECIDE ───

        Lo pregunto el cliente y la respuesta esta arriba: son dos hechos distintos. La modalidad es
        LOGISTICA —donde va la gente— y esto es EVIDENCIA —que queda escrito de que la hizo—. Se
        parecen tanto que invitan a deducir uno del otro, y por eso se intento dos veces y fallo dos
        veces. Sugerir sin decidir deja pasar los dos casos raros sin obligar a pensarlo en los
        cuarenta normales.

        ─── TRES OPCIONES, Y CADA UNA DICE LO QUE ES ───

        Estuvieron a punto de ser dos. Se volvio atras el 2026-09-08 porque el cliente pregunto lo
        unico que importaba: *"¿donde queda la opcion de registro automatico por contenido?"*. Con
        dos, la heredada y la automatica se pisaban en el mismo boton y no se veia cual era cual.

        Ahora son tres y ninguna esconde nada:

          · la HEREDADA dice a que resuelve —"lo que sugiere su modalidad: lista de asistencia"—,
            que es lo que le faltaba a "lo que diga su modalidad": no decia QUE decia.
          · "Con lista de asistencia": alguien la toma en la sesion.
          · "Al completar el contenido": no hay nada que marcar. La plataforma lo anota sola cuando
            la persona termina el temario y, si su tipo los pide, la evaluacion y la encuesta.

        Se dice "al completar el contenido" y no "automatico" a secas por lo mismo: "automatico" no
        dice QUE lo dispara, y lo que la gente necesita saber es que se cierra sola al terminar.
      */}
      {value.kind !== 'PERMANENT' ? (
        <Field
          htmlFor="o-cierre"
          label="Como se registra"
          ayuda="Que queda escrito de que la persona la hizo. Con LISTA, alguien la toma en la sesión y esa marca es la que cierra la formación. AL COMPLETAR EL CONTENIDO no hay nada que marcar: la plataforma la cierra sola cuando la persona termina el temario y, si su tipo los pide, la evaluación y la encuesta. Lo sugiere la modalidad, pero manda lo que se elija aquí."
        >
          <Select
            id="o-cierre"
            disabled={soloLogistica}
            value={value.closesByAttendance}
            onChange={(event) => set({ closesByAttendance: event.target.value })}
          >
            <option value="">
              {value.modality === 'VIRTUAL'
                ? 'Lo que sugiere su modalidad: al completar el contenido'
                : 'Lo que sugiere su modalidad: con lista de asistencia'}
            </option>
            <option value="true">Con lista de asistencia</option>
            <option value="false">Al completar el contenido</option>
          </Select>
        </Field>
      ) : null}

      {conFecha ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field htmlFor="o-date" label="Fecha" required>
              <Input
                id="o-date"
                type="date"
                disabled={soloLogistica}
                value={value.scheduledDate}
                onChange={(event) => set({ scheduledDate: event.target.value })}
              />
            </Field>
            <Field htmlFor="o-start" label="Inicio">
              <Input id="o-start" type="time" value={value.startTime} onChange={(event) => set({ startTime: event.target.value })} />
            </Field>
            <Field htmlFor="o-end" label="Fin">
              <Input id="o-end" type="time" value={value.endTime} onChange={(event) => set({ endTime: event.target.value })} />
            </Field>
          </div>

          {value.modality !== 'VIRTUAL' ? (
            <Field
              htmlFor="o-location"
              label="Lugar"
              required
              hint="La dirección de ESTA jornada, no la regional. Va impresa en el acta."
            >
              <Input
                id="o-location"
                value={value.location}
                maxLength={200}
                onChange={(event) => set({ location: event.target.value })}
                placeholder="Auditorio principal, sede Norte"
              />
            </Field>
          ) : null}

          <Field htmlFor="o-executed" label="Quien la imparte" required>
            <Select
              id="o-executed"
              value={value.executedBy}
              onChange={(event) =>
                set({ executedBy: event.target.value as ExecutedBy, executedByOther: '', instructorExternalName: '' })
              }
            >
              {EJECUTA.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </Field>

          {esExterna(value.executedBy) ? (
            <>
              {/*
                DOS DATOS DISTINTOS de un tercero: la ENTIDAD, que es la que se mide —"la ARL Sura
                dicto 14 jornadas"—, y la PERSONA que vino a dictarla, que es la que firma el acta.
                Antes solo habia texto libre para "otros" y se perdian los dos.
              */}
              <Field htmlFor="o-executed-other" label="¿Cual?" required hint="La entidad. Queda para medir por proveedor.">
                <Input
                  id="o-executed-other"
                  value={value.executedByOther}
                  maxLength={160}
                  onChange={(event) => set({ executedByOther: event.target.value })}
                  placeholder={ejemploDe(value.executedBy)}
                />
              </Field>
              <Field
                htmlFor="o-instructor-external"
                label="Quien vino a dictarla"
                hint="La persona del tercero. Va en el acta; dejalo vacio si todavía no se sabe."
              >
                <Input
                  id="o-instructor-external"
                  value={value.instructorExternalName}
                  maxLength={160}
                  onChange={(event) => set({ instructorExternalName: event.target.value })}
                  placeholder="Nombre y apellido"
                />
              </Field>
            </>
          ) : (
            // La persona propia se elige como el responsable del proceso: sugiriendo su area,
            // porque un desplegable con las 116 obliga a saberse de memoria quien dicta que.
            <Field htmlFor="o-instructor" label="Quien la dicta" hint="Personas de la empresa. Recibe el aviso al publicarla.">
              <PersonPicker
                id="o-instructor"
                people={people}
                suggestedAreaId={suggestedAreaId}
                value={value.instructorUserId || null}
                onChange={(personId) => set({ instructorUserId: personId ?? '' })}
              />
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field htmlFor="o-theory" label="Horas teóricas" hint="El desglose lo exige el PESV.">
              <Input
                id="o-theory"
                type="number"
                min={0}
                step="0.5"
                value={value.intensityTheoryHours}
                onChange={(event) => set({ intensityTheoryHours: event.target.value })}
              />
            </Field>
            <Field htmlFor="o-practice" label="Horas prácticas">
              <Input
                id="o-practice"
                type="number"
                min={0}
                step="0.5"
                value={value.intensityPracticeHours}
                onChange={(event) => set({ intensityPracticeHours: event.target.value })}
              />
            </Field>
            <Field htmlFor="o-capacity" label="Cupo" hint="Vacio: sin tope.">
              <Input
                id="o-capacity"
                type="number"
                min={1}
                value={value.capacity}
                onChange={(event) => set({ capacity: event.target.value })}
              />
            </Field>
          </div>
        </>
      ) : null}

      {permanente ? (
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="o-wstart" label="Disponible desde" hint="Vacio: desde ya.">
            <Input
              id="o-wstart"
              type="date"
              disabled={soloLogistica}
              value={value.windowStart}
              onChange={(event) => set({ windowStart: event.target.value })}
            />
          </Field>
          <Field htmlFor="o-wend" label="Disponible hasta" hint="Vacio: sin cierre.">
            <Input
              id="o-wend"
              type="date"
              disabled={soloLogistica}
              value={value.windowEnd}
              onChange={(event) => set({ windowEnd: event.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {/*
        LA SEDE ES SOLO LOGISTICA: donde se dicta. No decide a quien atiende —eso esta abajo, en el
        alcance especifico—, y no se marca alli sola: automarcar la regional obligaba a acordarse
        de desmarcarla en las jornadas nacionales, que es peor que marcarla las pocas veces que
        hace falta acotar.
      */}
      <Field htmlFor="o-regional" label="Donde se dicta (sede)" hint="Solo logistica: la dirección de la jornada.">
        <Select
          id="o-regional"
          disabled={soloLogistica}
          value={value.regionalId}
          onChange={(event) => set({ regionalId: event.target.value })}
        >
          <option value="">Sin sede definida</option>
          {catalogs.regionals.map((regional) => (
            <option key={regional.id} value={regional.id}>
              {regional.name}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        LA TAJADA, PLEGADA. Cuatro selectores mas en un formulario que ya es largo asustan, y en la
        inmensa mayoria de los casos no se tocan: la jornada atiende a todos los obligados, o a los
        de la sede que ya se eligio arriba. Se enseña en una linea lo que hace ahora mismo y se
        abre solo cuando de verdad hay que partir el reparto.

        Ademas resuelve la confusion de "dos regionales": arriba se elige la sede, y esa misma
        regional se propone aqui sin que haya que elegirla otra vez.
      */}
      <div className="rounded-lg border border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Alcance especifico</p>
            <p className="mt-0.5 text-sm text-ink-500">{resumenDeTajada(value.scope, catalogs)}</p>
            {proyectados !== null ? (
              <p className="mt-0.5 text-xs text-ink-500">{loQueProyecta(proyectados)}</p>
            ) : null}
          </div>
          {!soloLogistica ? (
            <button
              type="button"
              onClick={() => setTajadaAbierta((abierta) => !abierta)}
              className="focus-ring shrink-0 rounded text-sm font-medium text-info hover:underline"
            >
              {tajadaAbierta ? 'Listo' : 'Acotar'}
            </button>
          ) : null}
        </div>

        {tajadaAbierta ? (
          <fieldset className="mt-4 space-y-3" disabled={soloLogistica}>
          <Field htmlFor="o-scope-jobs" label="Cargos">
            <MultiSelect
              id="o-scope-jobs"
              placeholder="Todos"
              disabled={soloLogistica}
              options={opcionesDe(catalogs.jobTitles, proyectados?.facets.jobTitles)}
              value={value.scope.jobTitleIds}
              onChange={(jobTitleIds) => set({ scope: { ...value.scope, jobTitleIds } })}
            />
          </Field>
          <Field htmlFor="o-scope-areas" label="Areas">
            <MultiSelect
              id="o-scope-areas"
              placeholder="Todas"
              disabled={soloLogistica}
              options={opcionesDe(catalogs.areas, proyectados?.facets.areas)}
              value={value.scope.areaIds}
              onChange={(areaIds) => set({ scope: { ...value.scope, areaIds } })}
            />
          </Field>
          <Field htmlFor="o-scope-regionals" label="Regionales a las que atiende">
            <MultiSelect
              id="o-scope-regionals"
              placeholder="Todas"
              disabled={soloLogistica}
              options={opcionesDe(catalogs.regionals, proyectados?.facets.regionals)}
              value={value.scope.regionalIds}
              onChange={(regionalIds) => set({ scope: { ...value.scope, regionalIds } })}
            />
          </Field>
          {/*
            SERVICIOS. Faltaba, y es una faceta real del negocio: hay formaciones que solo aplican
            a una linea de servicio (almacenamiento, masivo, paqueteo). Solo alcanza a quien lo
            tenga puesto en su ficha: no se adivina.
          */}
          <Field htmlFor="o-scope-services" label="Servicios" hint="Solo alcanza a quien lo tenga puesto en su ficha.">
            <MultiSelect
              id="o-scope-services"
              placeholder="Todos"
              disabled={soloLogistica}
              options={opcionesDe(catalogs.services, proyectados?.facets.services)}
              value={value.scope.serviceIds}
              onChange={(serviceIds) => set({ scope: { ...value.scope, serviceIds } })}
            />
          </Field>
          </fieldset>
        ) : null}
      </div>

      <Field htmlFor="o-observations" label="Observaciones">
        <Textarea
          id="o-observations"
          rows={2}
          maxLength={4000}
          value={value.observations}
          onChange={(event) => set({ observations: event.target.value })}
        />
      </Field>
    </div>
  );
}

/**
 * EL NUMERO QUE SE VA A CONGELAR, dicho contra que se lee.
 *
 * "Cubre a 12" no informa: doce ¿de cuantos? Doce de doce es la jornada entera; doce de doscientos
 * es un corte que hay que revisar. Por eso se dicen los dos, y cuando no hay corte se dice el
 * total una sola vez, que es lo mismo sin la aritmetica.
 */
function loQueProyecta(preview: ProjectedPreview): string {
  if (preview.source === 'NONE') {
    return 'Nadie esta obligado a esta formacion todavia: se exige en "Quienes". Al publicar habra que ajustar los proyectados con justificacion.';
  }
  const gente = (n: number) => `${n} ${n === 1 ? 'persona obligada' : 'personas obligadas'}`;
  const origen =
    preview.source === 'RULES' ? ' (por ahora, las que alcanzan los requisitos: aun no han nacido las obligaciones)' : '';
  if (preview.count === preview.total) return `Proyecta ${gente(preview.total)}${origen}.`;
  return `Proyecta ${preview.count} de las ${gente(preview.total)}${origen}.`;
}

/** Lo que hace la tajada AHORA, en una linea, para no tener que abrirla para saberlo. */
function resumenDeTajada(scope: AudienceRule, catalogs: OfferingFormCatalogs): string {
  const nombres = (ids: string[], filas: CatalogRow[]): string[] =>
    ids.map((id) => filas.find((fila) => fila.id === id)?.name ?? '?');
  const partes = [
    ...nombres(scope.jobTitleIds, catalogs.jobTitles),
    ...nombres(scope.areaIds, catalogs.areas),
    ...nombres(scope.regionalIds, catalogs.regionals),
    ...nombres(scope.serviceIds, catalogs.services),
  ];
  if (partes.length === 0) return "Atiende a todos los obligados de esta formacion.";
  if (partes.length <= 3) return `Solo a ${partes.join(' · ')}.`;
  return `Solo a ${partes.slice(0, 3).join(' · ')} y ${partes.length - 3} mas.`;
}
