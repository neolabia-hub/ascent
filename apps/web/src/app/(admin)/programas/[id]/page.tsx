'use client';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, motivoDelError } from '@/lib/api';
import { listActivities, type ActivityListItem } from '@/lib/catalog-api';
import { listCatalog, nombreConRama, type CatalogRow } from '@/lib/admin-api';
import { EMPTY_RULE, previewAudience, type AudienceRule } from '@/lib/delivery-api';
import {
  addModule,
  assignProgram,
  getProgram,
  publishProgram,
  removeModule,
  reorderModules,
  setSectionMinimum,
  unpublishProgram,
  updateModule,
  updateProgram,
  impactoDePublicar,
  type AssignProgramResult,
  type ImpactoDePublicar,
  type ProgramDetail,
  type ProgramModule,
  type ProgramSection,
} from '@/lib/programs-api';
import { monthName } from '@/lib/format';

/** Valor centinela del desplegable de grupos: no es un nombre, abre el campo de escribir uno. */
const GRUPO_NUEVO = '__grupo-nuevo__';

/**
 * ¿ESTE PROGRAMA ESTÁ FUNCIONANDO, Y SI NO, QUÉ FALTA? (2026-09-16)
 *
 * El único sitio que contesta esa pregunta. Antes eran cinco avisos repartidos por la pantalla, y
 * juntos no se leían. Aquí van **en orden de lo que bloquea antes**, porque publicar sin módulos no
 * tiene sentido y exigir algo que nadie puede cursar es peor que no exigirlo.
 *
 * Lo que NO va aquí: **qué módulo** concreto está mal. Eso vive en la lista de abajo, que es donde
 * se actúa sobre él. Aquí se dice cuántos y por qué importa.
 */
function EstadoDelPrograma({
  programa,
  sinPublicar,
  campanaUnica,
  campanaDispar,
  fechasDeCampana,
}: {
  programa: ProgramDetail;
  sinPublicar: number;
  campanaUnica: string | null;
  campanaDispar: boolean;
  fechasDeCampana: string[];
}) {
  const problemas: Array<{ texto: ReactNode; grave: boolean }> = [];

  if (programa.items.length === 0) {
    problemas.push({ texto: <>Todavía no tiene módulos. Agrega al menos uno para poder publicarlo.</>, grave: true });
  } else if (sinPublicar > 0) {
    problemas.push({
      texto: (
        <>
          <strong className="font-medium">
            {sinPublicar === 1 ? '1 módulo sin publicar' : `${sinPublicar} módulos sin publicar`}
          </strong>
          : nadie puede cursarlos, así que el programa no puede completarse. Ábrelos desde la lista de abajo.
        </>
      ),
      grave: true,
    });
  }

  /*
    NADIE SE COMPLETA UN PROGRAMA A MEDIAS (2026-09-16).

    Esta comprobacion faltaba, y el bloque llego a decir "Funcionando" sobre un programa que **nadie
    podia completar**: sus dos inducciones se exigian a toda la empresa y su pildora no se le exigia
    a nadie. Con la regla de que nada puede quedar pendiente, un modulo que no se le exige a alguien
    tampoco lo bloquea — pero tampoco lo cursa, asi que el conjunto no se cierra para nadie.

    Se cuenta por MODULO y no por audiencia porque es como se arregla: hay que ir a ese modulo.
  */
  const sinRegla = programa.items.filter((item) => !item.yaExigido).length;

  if (programa.status !== 'PUBLISHED') {
    problemas.push({ texto: <>El programa está en borrador: todavía no lo ve nadie.</>, grave: false });
  } else if (programa.obligados.length === 0) {
    problemas.push({
      texto: (
        <>
          <strong className="font-medium">Nadie está obligado todavía</strong>
          {sinPublicar > 0
            ? ': en los módulos que se exigen solos, la regla nace al publicarlos.'
            : ': asígnalo a una audiencia, o publica los módulos que se exigen solos.'}
        </>
      ),
      grave: false,
    });
  } else if (sinRegla > 0) {
    problemas.push({
      texto: (
        <>
          <strong className="font-medium">
            {sinRegla === 1 ? '1 módulo no se le exige a nadie' : `${sinRegla} módulos no se exigen a nadie`}
          </strong>
          : quien no {sinRegla === 1 ? 'lo tenga' : 'los tenga'} no podrá completar el programa. {sinRegla === 1 ? 'Está' : 'Están'}{' '}
          marcado{sinRegla === 1 ? '' : 's'} abajo en la lista.
        </>
      ),
      grave: true,
    });
  } else if (programa.afectados > 0) {
    /*
      A CUÁNTA GENTE LE FALTA ALGO — CONTADO POR PERSONA (2026-09-16, tercera versión del mismo aviso).

      Las dos versiones anteriores comparaban AUDIENCIAS: "ninguna alcanza los N módulos". Y estaban
      mal por dos motivos distintos, que el cliente encontró uno detrás de otro.

      Primero no se entendía: decía la situación sin decir la regla que la convierte en problema —que
      un programa se completa aprobándolos TODOS (`evaluarPrograma`), se le haya exigido a esa persona
      o no—.

      Y después resultó que además **daba falsas alarmas**: *"una píldora sí puede ser para todos"*.
      Es cierto — `jobTitleId` y `areaId` son obligatorios en toda persona, así que una píldora
      marcada a todos los cargos alcanza a la plantilla entera. Junto a unas inducciones generales
      exigidas a "Toda la empresa" forma un programa perfectamente sano en el que nadie se queda
      fuera... y la comparación por audiencias gritaba igual, porque son dos audiencias con nombres
      distintos. Un aviso que salta sobre algo que está bien enseña a ignorar los avisos.

      Así que ahora se cuenta lo único que describe un daño real: **personas a las que se les exige
      alguno de los módulos pero no todos**. Y se dice con el número, que es lo accionable.
    */
    problemas.push({
      texto: (
        <>
          <strong className="font-medium">
            A {programa.afectados.toLocaleString('es-CO')}{' '}
            {programa.afectados === 1 ? 'persona le falta' : 'personas les falta'} algún módulo por exigir
          </strong>
          : se les exige parte del programa pero no los {programa.items.length}, así que no podrán completarlo. Y como
          sus módulos pertenecen a un programa publicado, tampoco reciben la constancia individual de lo que sí hacen.
        </>
      ),
      grave: true,
    });
  }

  if (campanaDispar) {
    problemas.push({
      texto: (
        <>
          Sus módulos vencen en <strong className="font-medium">fechas distintas</strong> (
          {fechasDeCampana.map((fecha) => textoDeCampana(fecha)).join(' · ')}), así que caen por separado en vez de como
          una sola campaña.
        </>
      ),
      grave: false,
    });
  }

  if (problemas.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
        {/* EN PERSONAS, NO EN NOMBRES DE AUDIENCIA (2026-09-16). Antes listaba las audiencias que
            alcanzaban el programa entero, y con dos audiencias que entre ellas cubren a la misma
            gente esa lista salía vacía sobre un programa que funciona. El número de personas que
            de verdad pueden completarlo no tiene esa trampa, y es lo que se quiere saber. */}
        <span>
          Funcionando: sus {programa.items.length} módulos publicados, y {programa.conTodos.toLocaleString('es-CO')}{' '}
          {programa.conTodos === 1 ? 'persona lo tiene' : 'personas lo tienen'} exigido entero.
          {campanaUnica ? ` Vence antes del ${textoDeCampana(campanaUnica)} de cada año.` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="card space-y-2 p-4">
      <h3 className="text-sm font-semibold text-ink-900">Qué falta para que funcione</h3>
      <ul className="space-y-1.5">
        {problemas.map((problema, indice) => (
          <li key={indice} className="flex items-start gap-2 text-sm text-ink-700">
            <span
              aria-hidden="true"
              className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', problema.grave ? 'bg-warn' : 'bg-ink-300')}
            />
            <span>{problema.texto}</span>
          </li>
        ))}
      </ul>
      {/*
        EL PIE "SE LE EXIGE A …" SE QUITÓ (2026-09-16).

        Repetía, sumada, la misma lista que ya dice cada módulo en su renglón — y sumada es peor: no
        distingue quién tiene qué, que es la pregunta real. El cliente lo dijo así: *"esto ya está de
        más si cada uno dice quiénes tiene de obligación"*. Lo que quedaba de útil —el reparto módulo
        a módulo— está abajo, en la lista, y ahí se puede actuar sobre él.
      */}
    </div>
  );
}

/**
 * LA LISTA NO SE LLENA DE NOMBRES (2026-09-16).
 *
 * Una formación extraordinaria puede exigirse a diez cargos, y volcar los diez en el renglón
 * convierte la lista de módulos en un muro. El cliente lo dijo así: *"si una extraordinaria cubre
 * muchos cargos se van a listar todos, esa lista se crecería mucho… esa lista no debe llenarse de
 * tanta información"*.
 *
 * Dos nombres caben y se leen; a partir de tres se cuenta. Los nombres completos no se pierden:
 * viven en la ficha que se despliega al abrir el módulo, que es donde se va a buscarlos.
 */
function resumenDeAudiencias(audiencias: string[]): string {
  if (audiencias.length <= 2) return audiencias.join(' · ');
  return `${audiencias[0]} y ${audiencias.length - 1} más`;
}

/** Un dato de la ficha desplegada: etiqueta arriba, valor debajo. */
function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-700">{valor}</dd>
    </div>
  );
}

/*
  UN CUPO PERDONA REPROBAR; NO PERDONA NO HACERLO (2026-09-17).

  Se dice entero cada vez, porque la palabra "cupo" invita a leer «elige cuáles haces» y es lo
  contrario. El cliente lo corrigió así: *"la persona no elige grupo... puede perder cualquiera, pero
  tiene que cursar todo. El obligatorio es de aprobar, no de cursar"*.

  El motor ya funcionaba exactamente así —`evaluarPrograma` bloquea mientras quede un módulo con su
  obligación VIVA, aunque el cupo dé los números—. Lo que fallaba era la pantalla, que lo sugería al
  revés llamando "opcionales" al grupo.
*/
function significadoDelCupo(seccion: ProgramSection): string {
  const cuenta = `${seccion.minimo} de ${seccion.total} ${seccion.total === 1 ? 'módulo' : 'módulos'}`;
  if (seccion.puedePerder <= 0)
    return `Se cursan todos, y hay que aprobar ${cuenta}: todos. Reprobar uno impide completar el programa.`;
  return `Se cursan todos —ninguno se puede saltar—, y hay que aprobar ${cuenta}: reprobar ${seccion.puedePerder} no impide completarlo.`;
}

/** "03-31" -> "31 de marzo". La fecha de campaña se guarda sin año: se repite todos los años. */
function textoDeCampana(mesDia: string): string {
  const [mes, dia] = mesDia.split('-');
  return `${Number(dia)} de ${monthName(Number(mes)).toLowerCase()}`;
}

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MesDia } from '@/components/ui/mes-dia';
import { Modal } from '@/components/ui/modal';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/** Igual que en la ficha de una formación: la palabra que nombra como se repite. */
const COMO_SE_REPITE: Record<'NO' | 'MESES' | 'ANUAL', string> = {
  NO: 'Se hace una vez y no vuelve.',
  ANUAL: 'CAMPAÑA: todos vencen el mismo día, sea cuando sea que lo completaran.',
  MESES: 'ANIVERSARIO: cada persona vence en su propia fecha, contada desde que lo completó.',
};

function contarFacetas(scope: AudienceRule): number {
  return [scope.jobTitleIds, scope.areaIds, scope.regionalIds, scope.serviceIds].filter((lista) => lista.length > 0)
    .length;
}
function sinMarcar(scope: AudienceRule): boolean {
  return contarFacetas(scope) === 0;
}

/**
 * FICHA DE UN PROGRAMA (2026-09-14/15, PENDIENTES 11.4): módulos —agregar, editar, reordenar—,
 * publicar, y "asignar a una audiencia" (11.3), que por debajo exige CADA módulo con el mismo
 * alcance, reusando el motor de requisitos de siempre. Ver `ProgramsService.asignarAudiencia`.
 */
export default function ProgramaDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { showToast } = useToast();

  const [programa, setPrograma] = useState<ProgramDetail | null>(null);
  const [actividades, setActividades] = useState<ActivityListItem[] | null>(null);
  const [catalogs, setCatalogs] = useState<{
    jobTitles: CatalogRow[];
    areas: CatalogRow[];
    regionals: CatalogRow[];
    services: CatalogRow[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPrograma(await getProgram(id));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar el programa', description: motivoDelError(error) });
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listActivities({ pageSize: 100 })
      .then((result) => setActividades(result.items))
      .catch(() => setActividades([]));
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
  }, []);

  // ─────────────────────────── Descripción ───────────────────────────

  const [editandoDescripcion, setEditandoDescripcion] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const abrirEdicionDescripcion = () => {
    setDescripcion(programa?.description ?? '');
    setEditandoDescripcion(true);
  };
  const guardarDescripcion = async () => {
    setBusy(true);
    try {
      await updateProgram(id, { description: descripcion.trim() || null });
      setEditandoDescripcion(false);
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar la descripción', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────── Módulos ───────────────────────────

  const [moduloForm, setModuloForm] = useState<{
    editingId: string | null;
    activityId: string;
    isRequired: boolean;
    sectionName: string;
    /** "De este grupo, cuántos puede perder". Solo se pregunta al CREAR el grupo. */
    maxFallos: string;
  }>({ editingId: null, activityId: '', isRequired: true, sectionName: '', maxFallos: '1' });
  const [moduloError, setModuloError] = useState<string | null>(null);
  /** Lo enciende quien necesita DOS reglas de cupo distintas. Apagado, el grupo no se pregunta. */
  const [separarEnGrupos, setSepararEnGrupos] = useState(false);
  /** Escribir un nombre nuevo en vez de elegir uno de los grupos que ya existen. */
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  /** Lo tecleado en cada casilla de cupo, mientras no se guarda. */
  const [minimos, setMinimos] = useState<Record<string, string>>({});
  /** Qué regla tiene su explicación abierta, si alguna. */
  const [detalleCupo, setDetalleCupo] = useState<string | null>(null);
  /** Qué módulo tiene su ficha desplegada, si alguno. Uno cada vez: la lista no se convierte en muro. */
  const [moduloAbierto, setModuloAbierto] = useState<string | null>(null);

  const guardarMinimo = async (sectionName: string) => {
    setBusy(true);
    try {
      await setSectionMinimum(id, sectionName, Number(minimos[sectionName]));
      setMinimos((actual) => {
        const siguiente = { ...actual };
        delete siguiente[sectionName];
        return siguiente;
      });
      await load();
      showToast({ kind: 'success', title: 'Cupo actualizado' });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cambiar el cupo', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  const abrirEdicionModulo = (item: ProgramModule) => {
    setModuloForm({
      editingId: item.id,
      activityId: item.itemId,
      isRequired: item.isRequired,
      sectionName: item.sectionName ?? '',
      maxFallos: String(programa?.secciones.find((s) => s.name === item.sectionName)?.puedePerder ?? 1),
    });
    setModuloError(null);
  };
  const cancelarEdicionModulo = () => {
    setModuloForm({ editingId: null, activityId: '', isRequired: true, sectionName: '', maxFallos: '1' });
    setModuloError(null);
    setCreandoGrupo(false);
  };

  const guardarModulo = async () => {
    setBusy(true);
    setModuloError(null);
    try {
      const grupo = grupoEfectivo;
      // El numero solo viaja cuando se esta CREANDO el grupo. Si el grupo ya existe, su cupo ya
      // esta declarado y mandarlo otra vez seria dejar que un formulario de UN modulo cambie la
      // regla de todos sin pedirlo.
      const existe = programa?.secciones.some((s) => s.name === grupo) ?? false;
      const declaraCupo = grupo.length > 0 && (!existe || moduloForm.editingId !== null);
      const cuerpo = {
        isRequired: moduloForm.isRequired,
        sectionName: moduloForm.isRequired ? null : grupo || null,
        maxFallosEnSeccion: moduloForm.isRequired || !declaraCupo ? null : Number(moduloForm.maxFallos || 0),
      };
      if (moduloForm.editingId) {
        await updateModule(id, moduloForm.editingId, cuerpo);
      } else {
        await addModule(id, { activityId: moduloForm.activityId, ...cuerpo });
      }
      cancelarEdicionModulo();
      await load();
      showToast({ kind: 'success', title: moduloForm.editingId ? 'Módulo actualizado' : 'Módulo agregado' });
    } catch (error) {
      const mensajes: Record<string, string> = {
        MODULE_ALREADY_IN_PROGRAM: 'Esa formación ya es un módulo de este programa.',
        SECTION_REQUIRED: 'Un módulo con cupo necesita un grupo y un mínimo mayor a 0.',
        ACTIVITY_NOT_FOUND: 'Esa formación ya no existe.',
      };
      setModuloError(
        error instanceof ApiError ? (mensajes[error.code] ?? `No se pudo guardar (${error.code}).`) : 'No se pudo guardar.',
      );
    } finally {
      setBusy(false);
    }
  };

  const quitarModulo = async (item: ProgramModule) => {
    setBusy(true);
    try {
      await removeModule(id, item.id);
      await load();
      showToast({ kind: 'success', title: 'Módulo quitado' });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo quitar el módulo', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  /** Sube o baja un módulo: se manda el orden completo — el servidor no adivina un delta. */
  const moverModulo = async (indice: number, direccion: -1 | 1) => {
    if (!programa) return;
    const destino = indice + direccion;
    if (destino < 0 || destino >= programa.items.length) return;
    const orden = programa.items.map((item) => item.id);
    [orden[indice], orden[destino]] = [orden[destino] as string, orden[indice] as string];
    setBusy(true);
    try {
      await reorderModules(id, orden);
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo reordenar', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  // ─────────────────────────── Publicar ───────────────────────────

  /*
    PUBLICAR AVISA A QUIEN DEJA SIN PAPEL (2026-09-16).

    Publicar no es solo "ya se ve": es el acto que **apaga la constancia individual** de todos los
    módulos. Y pasaba en silencio.

    El caso no necesita ninguna mala configuración, lo planteó el cliente y es el más normal: un
    programa de inducciones generales —que se exigen solas a toda la empresa— más una píldora que ya
    tenía SU regla para cien personas. Al publicar, esas cien completan y reciben la constancia del
    conjunto; **el resto de la plantilla** hace las inducciones, nunca completa el programa —nadie le
    exige la píldora— y ya no recibe la individual. Se queda sin nada, habiendo hecho la formación.

    No se bloquea: es un número para decidir sabiéndolo. Y se pide SOLO al pulsar Publicar, porque
    recorre las obligaciones de todos los módulos y eso no se paga en cada carga de la pantalla.
  */
  const [impacto, setImpacto] = useState<ImpactoDePublicar | null>(null);
  const [comprobandoImpacto, setComprobandoImpacto] = useState(false);

  const publicarOdespublicar = async () => {
    if (!programa) return;
    setImpacto(null);
    setBusy(true);
    try {
      if (programa.status === 'PUBLISHED') {
        await unpublishProgram(id);
        showToast({ kind: 'success', title: 'Programa vuelto a borrador', description: 'Deja de ser visible y de poder asignarse hasta publicarlo de nuevo.' });
      } else {
        await publishProgram(id);
        showToast({ kind: 'success', title: 'Programa publicado', description: 'Ya se puede exigir y el aprendiz lo verá agrupado.' });
      }
      await load();
    } catch (error) {
      const mensajes: Record<string, string> = {
        PROGRAM_EMPTY: 'Un programa sin módulos no se puede publicar.',
      };
      showToast({
        kind: 'danger',
        title: 'No se pudo publicar',
        description: error instanceof ApiError ? (mensajes[error.code] ?? motivoDelError(error)) : motivoDelError(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const pedirPublicar = async () => {
    if (!programa) return;
    // Despublicar no le quita el papel a nadie —se lo devuelve—, así que no se pregunta.
    if (programa.status === 'PUBLISHED') return publicarOdespublicar();
    setComprobandoImpacto(true);
    try {
      const resultado = await impactoDePublicar(id);
      if (resultado.afectados > 0) {
        setImpacto(resultado);
        return;
      }
    } catch {
      // Si no se puede calcular, no se secuestra la publicación: se sigue como siempre.
    } finally {
      setComprobandoImpacto(false);
    }
    await publicarOdespublicar();
  };

  // ─────────────────────────── Asignar a una audiencia (11.3) ───────────────────────────

  const [scope, setScope] = useState<AudienceRule>({ ...EMPTY_RULE });
  const [reach, setReach] = useState<number | null>(null);
  const [plazo, setPlazo] = useState({
    trigger: 'ON_JOIN' as 'ON_HIRE' | 'ON_JOIN',
    dias: '30',
    everyMonths: '',
    modoRepite: 'NO' as 'NO' | 'MESES' | 'ANUAL',
    fixedDate: '',
  });
  const [reason, setReason] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [resultado, setResultado] = useState<AssignProgramResult | null>(null);
  const [verInfoAsignar, setVerInfoAsignar] = useState(false);
  const [verDetalleAutomatico, setVerDetalleAutomatico] = useState(false);
  /** Abrir el formulario en un programa que no lo necesita. Se decide a proposito, no por inercia. */
  const [asignarDeTodasFormas, setAsignarDeTodasFormas] = useState(false);

  useEffect(() => {
    if (sinMarcar(scope)) {
      setReach(null);
      return;
    }
    void previewAudience(scope)
      .then((preview) => setReach(preview.count))
      .catch(() => setReach(null));
  }, [scope]);

  const asignar = async () => {
    setAsignando(true);
    setResultado(null);
    try {
      const result = await assignProgram(id, {
        scope,
        trigger: plazo.trigger,
        dueDaysAfterTrigger: Number(plazo.dias || 0),
        everyMonths: plazo.modoRepite === 'MESES' && plazo.everyMonths ? Number(plazo.everyMonths) : null,
        fixedDate: plazo.modoRepite === 'ANUAL' && plazo.fixedDate ? plazo.fixedDate : null,
        reason: reason.trim() || null,
      });
      setResultado(result);
      /*
        Y SE RECARGA (2026-09-16). Asignar crea la regla de cada módulo, así que cambia justo lo que
        la lista de arriba está enseñando: a quién alcanza cada uno, y con ello el bloque de estado.
        Sin esto, se asignaba el programa y la pantalla seguía diciendo "no se le exige a nadie"
        hasta recargar a mano — se lee como que no funcionó.
      */
      await load();
      showToast({
        kind: 'success',
        title: `Programa exigido a ${result.reach} personas`,
        description: `${result.modulos} módulos, ${result.obligacionesCreadas} obligaciones nuevas.`,
      });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo asignar el programa', description: motivoDelError(error) });
    } finally {
      setAsignando(false);
    }
  };

  if (!programa || !actividades || !catalogs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  /*
    EL GRUPO POR DEFECTO. Con cero o un grupo en el programa, el nombre no se pregunta: se hereda el
    que hay, o se crea "con cupo". Solo aparece en pantalla si el programa YA tiene dos grupos
    —entonces hay que elegir— o si alguien pulsa "separar en grupos".
  */
  const GRUPO_POR_DEFECTO = 'con cupo';
  const mostrarGrupos = programa.secciones.length > 1 || separarEnGrupos;
  const grupoEfectivo = mostrarGrupos ? moduloForm.sectionName.trim() : (programa.secciones[0]?.name ?? GRUPO_POR_DEFECTO);

  const idsYaEnPrograma = new Set(programa.items.map((item) => item.itemId));
  const disponibles = actividades.filter((a) => !idsYaEnPrograma.has(a.id) || moduloForm.editingId);
  const puedeGuardarModulo =
    !busy &&
    (moduloForm.editingId !== null || moduloForm.activityId !== '') &&
    // El grupo casi siempre viene puesto solo; solo falta cuando alguien separa en grupos y deja el
    // nombre en blanco. Cero es una respuesta válida al cupo ("hay que aprobarlos todos").
    (moduloForm.isRequired || (grupoEfectivo.length > 0 && Number(moduloForm.maxFallos) >= 0));
  const puedeAsignar = !asignando && !sinMarcar(scope);

  // Modulos que su propio tipo ya exige a toda la empresa al publicarse (PENDIENTES 11.7).
  const automaticos = programa.items.filter((item) => item.exigenciaAutomatica);
  const todosAutomaticos = programa.items.length > 0 && automaticos.length === programa.items.length;
  const automaticosYaExigidos = automaticos.filter((item) => item.yaExigido).length;
  const algunoSoloAlIngresar = automaticos.some((item) => item.soloAlIngresar);
  /** Módulos en borrador: nadie puede hacerlos, así que el programa no puede completarse. */
  const sinPublicar = programa.items.filter((item) => !item.publicada).length;

  /** El grupo que el formulario tiene escrito, si YA existe. */
  const seccionDelFormulario = programa.secciones.find((s) => s.name === grupoEfectivo) ?? null;

  /*
    ¿ESTE PROGRAMA SE COMPORTA COMO UNA CAMPAÑA ANUAL? (2026-09-15)

    Un programa NO tiene fecha de vencimiento propia. Una reinducción armada como programa se
    comporta como una sola campaña —"todo antes del 31 de marzo"— solo porque sus módulos COMPARTEN
    la fecha que trae su tipo. Eso no se veía en ninguna parte, así que tampoco se veía el día que
    alguien rompía la coincidencia sin querer y los módulos empezaban a vencer por separado.
  */
  const conCampana = programa.items.filter((item) => item.fechaDeCampana);
  const fechasDeCampana = [...new Set(conCampana.map((item) => item.fechaDeCampana as string))];
  const campanaUnica =
    conCampana.length === programa.items.length && fechasDeCampana.length === 1 ? (fechasDeCampana[0] ?? null) : null;
  const campanaDispar = fechasDeCampana.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{programa.name}</h1>
            <StatusPill kind={programa.status === 'PUBLISHED' ? 'ok' : 'neutral'} label={programa.status === 'PUBLISHED' ? 'PUBLICADO' : 'BORRADOR'} />
          </div>
          {editandoDescripcion ? (
            <div className="mt-2 max-w-xl space-y-2">
              <Textarea
                autoFocus
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Lo que ve el aprendiz antes de saber qué módulos trae."
                maxLength={500}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void guardarDescripcion()} loading={busy}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditandoDescripcion(false)} disabled={busy}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={abrirEdicionDescripcion}
              className="focus-ring group mt-1 flex max-w-xl items-start gap-1.5 rounded text-left text-sm text-ink-500 transition-colors duration-150 hover:text-ink-700"
            >
              <span>{programa.description || 'Agregar una descripción…'}</span>
              <Pencil size={12} className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            </button>
          )}
        </div>
        <Button
          variant={programa.status === 'PUBLISHED' ? 'outline' : 'primary'}
          onClick={() => void pedirPublicar()}
          loading={busy || comprobandoImpacto}
        >
          {programa.status === 'PUBLISHED' ? (
            <>
              <RotateCcw size={16} />
              Volver a borrador
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              Publicar
            </>
          )}
        </Button>
      </div>

      {/*
        LO QUE PUBLICAR LE CUESTA A ALGUIEN. Solo aparece si hay a quien le cueste: un aviso que sale
        siempre se aprende a cerrar sin leer. Dice el número, dice por qué pasa, y dice la salida —
        que es una frase corta y es la regla práctica de armar un programa.
      */}
      <Modal
        open={impacto !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setImpacto(null);
        }}
        icon={Users}
        title="Publicar dejaría gente sin constancia"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImpacto(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void publicarOdespublicar()} loading={busy}>
              Publicar igualmente
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-ink-700">
          <p>
            A <strong className="font-medium">{impacto?.afectados.toLocaleString('es-CO')} personas</strong> se les exige
            alguno de los {impacto?.modulos} módulos, pero <strong className="font-medium">no todos</strong>.
          </p>
          <p>
            Al publicar, esas formaciones <strong className="font-medium">dejan de emitir constancia individual</strong>{' '}
            —la que vale pasa a ser la del programa completo—. Pero esa gente nunca podrá completar el programa, porque
            hay módulos que no se le exigen. Así que se quedarían{' '}
            <strong className="font-medium">sin ningún papel</strong>, habiendo hecho la formación.
          </p>
          {impacto && impacto.conTodos > 0 ? (
            <p className="text-ink-500">
              A {impacto.conTodos.toLocaleString('es-CO')} sí se les exigen los {impacto.modulos}: esas lo completarán y
              tendrán la constancia del conjunto.
            </p>
          ) : null}
          {/*
            EL CONSEJO DEPENDE DE LA MEZCLA, y darlo mal sería peor que callarse (2026-09-16).

            La primera versión decía "usa Asignar programa y listo". El cliente lo corrigió: *"pero
            eso aplicaría solo para las que no son asignaciones automáticas"*. Y es exacto — son dos
            alcances que el producto NO deja igualar:

              - un tipo automático (inducción general, reinducción) nace exigido a TODA LA EMPRESA al
                publicar la formación, y eso no se puede quitar;
              - una formación de audiencia marcada obliga a marcar al menos un cargo, área, regional
                o servicio, tanto en su ficha como en "Asignar programa": el alcance vacío está
                bloqueado a propósito, para que nadie obligue a la plantilla entera sin querer.

            Así que en un programa MEZCLADO no hay forma de alinearlos, y el consejo no puede ser
            "asígnalo": es no mezclar. Cuando todos los módulos son de audiencia marcada, sí basta con
            asignar el programa entero.
          */}
          <div className="rounded-md bg-paper px-3 py-2">
            <strong className="font-medium">Cómo se evita:</strong>{' '}
            {automaticos.length > 0 && automaticos.length < programa.items.length ? (
              <>
                este programa <strong className="font-medium">mezcla</strong> {automaticos.length}{' '}
                {automaticos.length === 1 ? 'módulo que se exige solo' : 'módulos que se exigen solos'} a toda la empresa
                con {programa.items.length - automaticos.length} de audiencia marcada, y esos dos alcances{' '}
                <strong className="font-medium">no se pueden igualar</strong>: una formación de audiencia marcada no puede
                exigirse a toda la empresa. Lo sano es no mezclarlos — los de toda la empresa en un programa, y los de
                audiencia marcada en otro.
              </>
            ) : (
              <>
                que los módulos se le exijan a la misma gente. Lo más simple es no exigirlos uno a uno desde su ficha,
                sino usar <strong className="font-medium">Asignar programa</strong>, que los exige todos a la vez a la
                misma audiencia.
              </>
            )}
          </div>
        </div>
      </Modal>

      {/*
        `minmax(0,1fr)` y no `1fr` (2026-09-15). `1fr` es en realidad `minmax(auto, 1fr)`, y ese
        `auto` es el ancho MINIMO DEL CONTENIDO: el desplegable de formaciones trae nombres muy
        largos, asi que la primera columna se negaba a encoger, las dos columnas sumaban mas que la
        rejilla y el panel de "Asignar" quedaba empujado fuera y recortado por la derecha. Se veia
        como "hay que moverse a un lado para leerlo".
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ─────────────────────────── Módulos ─────────────────────────── */}
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink-900">Módulos</h2>

          {/*
            UN SOLO BLOQUE DE ESTADO, y no cinco avisos sueltos (2026-09-16).

            Esta pantalla habia acumulado cinco cajas distintas —modulos sin publicar, sin regla
            activa, a quien se le exige, la campaña anual, "no se le exige a nadie"— cada una
            justificada por si sola y juntas ilegibles. El cliente lo dijo asi: *"todo es muy
            confuso, que no se pierdan las personas que administran"*.

            Quien abre un programa tiene UNA pregunta: **¿esto está funcionando, y si no, qué me
            falta?**. Asi que hay un solo sitio que la contesta, ordenado por lo que bloquea antes,
            y el detalle —QUE modulo concreto— se queda en la lista de abajo, que es donde se actua.
          */}
          <EstadoDelPrograma
            programa={programa}
            sinPublicar={sinPublicar}
            campanaUnica={campanaUnica}
            campanaDispar={campanaDispar}
            fechasDeCampana={fechasDeCampana}
          />

          {/* El cupo de cada grupo, de un vistazo: en la lista de módulos solo se ve a qué grupo
              pertenece cada uno, no qué exige el grupo. */}
          {/*
            EL CUPO SE CONFIGURA AQUI, con el grupo delante — no en el formulario de cada módulo.
            Es una regla del programa ("de estos 7 hacen falta 6"), y además es un número que no se
            puede decidir hasta que los módulos están puestos.
          */}
          {programa.secciones.length > 0 ? (
            <div className="card divide-y divide-line p-0">
              <div className="px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-900">Regla de aprobación</h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  Los módulos obligatorios hay que aprobarlos siempre. Esto es lo que se pide del resto.
                </p>
              </div>
              {programa.secciones.map((seccion) => {
                const tecleado = minimos[seccion.name] ?? String(seccion.minimo);
                const sinGuardar = tecleado !== String(seccion.minimo);
                return (
                  /*
                    COLUMNAS DE ANCHO FIJO, no una frase que fluye (2026-09-15). Con dos reglas, el
                    texto de la derecha cambia de largo entre filas —"puede perder 1" frente a
                    "todos"— y eso movia la casilla de una fila respecto a la otra. Un formulario en
                    el que el mismo campo baila de sitio segun lo que diga su vecino se lee como roto.
                  */
                  <div key={seccion.name} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-sm text-ink-700">
                    {/* Con un solo cupo no se nombra: nombrarlo obligaría a explicar qué es el nombre. */}
                    <span className="flex min-w-0 items-center"><span className="truncate">
                      {/* El total ya va pegado a la casilla ("de 7"): repetirlo aquí sobraba. */}
                      {programa.secciones.length > 1 ? (
                        <strong className="font-medium text-ink-900">{seccion.name}</strong>
                      ) : (
                        'Módulos con cupo'
                      )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-ink-500">Aprobar</span>
                      <Input
                        type="number"
                        min={1}
                        max={seccion.total}
                        aria-label={`Mínimo aprobado${programa.secciones.length > 1 ? ` del grupo ${seccion.name}` : ''}`}
                        className="h-8 w-16 text-center"
                        value={tecleado}
                        onChange={(e) => setMinimos({ ...minimos, [seccion.name]: e.target.value })}
                      />
                      {/* "de 2" pegado a la casilla: el numero solo no dice nada sin su total, y asi
                          se lee "Aprobar 1 de 2" de corrido. Lo que implica lo explica el icono.
                          Sin ancho fijo: reservarlo dejaba un hueco visible antes del icono. */}
                      <span className="whitespace-nowrap text-xs tabular-nums text-ink-500">de {seccion.total}</span>
                      <span className="relative flex">
                        <button
                          type="button"
                          aria-label={`Qué significa: ${significadoDelCupo(seccion)}`}
                          title={significadoDelCupo(seccion)}
                          onClick={() => setDetalleCupo((actual) => (actual === seccion.name ? null : seccion.name))}
                          className="focus-ring flex h-7 w-7 items-center justify-center rounded-full text-ink-300 transition-colors duration-150 hover:text-ink-500"
                        >
                          <Info size={15} strokeWidth={2} />
                        </button>
                        {detalleCupo === seccion.name ? (
                          <span className="absolute right-0 top-8 z-10 w-64 rounded-lg border border-line bg-surface p-3 text-left text-xs leading-relaxed text-ink-700 shadow-card-hover">
                            {significadoDelCupo(seccion)}
                          </span>
                        ) : null}
                      </span>
                      {/* Guardar aparece SOLO cuando hay algo que guardar, y sin hueco reservado:
                          la fila que se esta editando se ensancha un momento, que es la unica que
                          se esta mirando. Reservarle sitio dejaba un vacio en todas las demas. */}
                      {sinGuardar ? (
                        <Button size="sm" onClick={() => void guardarMinimo(seccion.name)} loading={busy}>
                          Guardar
                        </Button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* La campaña dispar se avisa UNA vez, arriba, con el resto del estado. Esta segunda caja
              decía lo mismo con otras palabras tres centímetros más abajo (2026-09-16). */}

          {programa.items.length === 0 ? (
            <div className="card">
              <EmptyState icon={Layers} title="Sin módulos todavía" description="Agrega al menos una formación para poder publicar el programa." />
            </div>
          ) : (
            /*
              CADA MÓDULO SE ABRE; EL RENGLÓN NO CARGA CON TODO (2026-09-16).

              El renglón traía la lista entera de audiencias y cinco botones —abrir, subir, bajar,
              editar, quitar—, y con eso dejaba de ser una lista para ser cinco fichas apiladas. El
              cliente señaló las dos cosas a la vez: *"si una extraordinaria cubre muchos cargos esa
              lista se crecería mucho"* y *"ya tiene muchos botones"*.

              Se parte en dos alturas, y el criterio de qué va en cada una es **cada cuánto se
              necesita**:

              - **Siempre visible**: lo que se compara entre módulos de un vistazo —orden, nombre,
                si es obligatorio, a quién alcanza (resumido) y lo que está mal—. Más reordenar, que
                es la única acción que se hace mirando la lista entera y no un módulo.
              - **Al abrirlo**: lo de UN módulo —las audiencias con nombre y apellido, su tipo, su
                campaña— y las acciones que ya son sobre él: abrir la formación, editar, quitar.

              Se despliega DENTRO de la lista, no en una ventana: es información de contexto, y
              sacarla a un diálogo obligaría a cerrarla para comparar con el módulo de al lado, que
              es exactamente lo que se está haciendo cuando se abre.
            */
            <div className="card divide-y divide-line">
              {programa.items.map((item, indice) => {
                const abierto = moduloAbierto === item.id;
                /** Lo que está mal en este módulo. Va en el renglón cerrado: es el motivo de abrirlo. */
                const marca = !item.publicada
                  ? 'sin publicar'
                  : /* "Se la quitaron" y "nunca la tuvo" mandan a buscar el problema a sitios
                       distintos, así que no se dicen igual. */
                    !item.yaExigido && item.reglaRetirada
                    ? 'regla retirada'
                    : !item.yaExigido
                      ? 'no se le exige a nadie'
                      : null;
                return (
                  <div key={item.id} style={{ animationDelay: `${Math.min(indice, 8) * 25}ms` }} className="animate-card-in">
                    {/*
                      CADA CLIC, UN SOLO DESTINO (2026-09-16).

                      El cliente pidió primero que *"al presionar el nombre del módulo abra la
                      formación"* y acto seguido vio el problema él mismo: *"o no sé si mejor dejar el
                      botón de abrir, porque al dar en el nombre se confunda con desplegar"*.

                      Tenía razón, y la primera versión de esto lo tenía: el nombre abría la formación
                      y el resto del renglón desplegaba la ficha. Dos resultados distintos a pocos
                      píxeles, sin ninguna frontera visible que avise de dónde acaba uno y empieza el
                      otro. Eso no se aprende: se falla.

                      Así que no se reparte un renglón entre dos acciones. Cada una tiene su control:

                      - **El chevron despliega.** Es su icono de siempre, es un botón de verdad —con
                        `aria-expanded`, alcanzable con el teclado— y no hace nada más.
                      - **El nombre abre la formación.** Es la convención de cualquier lista, y se
                        anuncia al pasar por encima: subrayado y el icono de "esto lleva a otro sitio".
                      - **El renglón en sí no hace nada.** Pulsar en el hueco no dispara sorpresas.

                      Y abrir la formación sigue estando además en el menú, para quien la busque ahí.
                    */}
                    <div className="flex items-center gap-1 pr-2 transition-colors duration-150 hover:bg-paper">
                      <button
                        type="button"
                        onClick={() => setModuloAbierto(abierto ? null : item.id)}
                        aria-expanded={abierto}
                        /*
                          NOMBRE PROPIO, y no el que se calcularía solo. El renglón lleva dentro las
                          marcas de estado, y una de ellas es "sin publicar": sin esta etiqueta, el
                          nombre accesible del control contiene la palabra "publicar" y choca con el
                          botón de Publicar de la cabecera —para quien navega con lector de pantalla
                          y para las pruebas, que buscan por ese nombre—.
                        */
                        aria-label={`${abierto ? 'Cerrar' : 'Ver'} la ficha de ${item.actividad?.name ?? 'este módulo'}`}
                        title={abierto ? 'Cerrar la ficha' : 'Ver a quién se le exige y sus datos'}
                        className="focus-ring ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-300 transition-colors duration-150 hover:bg-surface hover:text-ink-700"
                      >
                        <ChevronRight
                          size={15}
                          aria-hidden="true"
                          className={cn('transition-transform duration-150', abierto && 'rotate-90')}
                        />
                      </button>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[11px] font-semibold tabular-nums text-ink-500">
                        {indice + 1}
                      </span>
                      <div className="min-w-0 flex-1 py-3 pl-2">
                        {item.actividad ? (
                          <a
                            href={`/contenido-formativo/${item.actividad.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir la formación"
                            /* `inline-flex` y no `flex`: en bloque, el enlace ocuparía el ancho
                               entero y un clic en el hueco a la derecha del nombre abriría una
                               pestaña sin que nadie apuntara ahí. Así solo es enlace el texto. */
                            className="focus-ring group inline-flex max-w-full items-center gap-1.5 rounded text-sm font-medium text-ink-900"
                          >
                            {/* SIN SUBRAYADO (2026-09-16, *"quita la línea del nombre, no se ve bien
                                cuando se abre el módulo"*). La raya cruzaba justo por donde el
                                renglón abierto ya dibuja su propio borde, y las dos juntas ensuciaban
                                la cabecera de la ficha. Lo que anuncia el enlace se queda: el icono,
                                que además se oscurece al acercarse. */}
                            <span className="min-w-0 truncate transition-colors duration-150 group-hover:text-primary">
                              {item.actividad.name}
                            </span>
                            {/* El icono está SIEMPRE, muy tenue. Al quitarse el menú, este enlace es
                                la única puerta a la formación: si solo apareciera al pasar por
                                encima, quien no pase el ratón no sabría que existe. */}
                            <ExternalLink
                              size={12}
                              strokeWidth={2}
                              aria-hidden="true"
                              className="shrink-0 text-ink-300 transition-colors duration-150 group-hover:text-ink-700"
                            />
                          </a>
                        ) : (
                          <span className="block truncate text-sm font-medium text-ink-900">(formación eliminada)</span>
                        )}
                        <span className="block min-w-0">
                          {/*
                            EL TIPO Y EL "A QUIÉN" VAN LOS DOS, EN LÍNEAS DISTINTAS (2026-09-16).

                            El cliente lo planteó como una disyuntiva —*"¿el tipo de formación o el
                            quiénes?"*— y no lo es: responden a preguntas distintas y las dos se hacen
                            mirando la lista. El **tipo** dice qué clase de módulo es, y con él cómo se
                            comporta (si se exige solo, si vence por campaña); el **a quién** es lo que
                            cambia de un módulo a otro y lo que hace que el programa se cierre o no.

                            Lo que sí hay que separar es el PESO. El tipo es una etiqueta corta y
                            estable, así que va con el resto de datos del módulo; el "a quién" crece y
                            se resume, así que va debajo, más pequeño y con su icono — se lee cuando se
                            está buscando eso, y no estorba cuando se está buscando otra cosa.
                          */}
                          <span className="mt-0.5 block truncate text-sm text-ink-500">
                            {item.actividad?.activityType.name ? `${item.actividad.activityType.name} · ` : ''}
                            {item.isRequired ? 'Obligatorio' : `Grupo "${item.sectionName}"`}
                            {marca ? <span className="ml-2 text-warn">· {marca}</span> : null}
                          </span>
                          {item.audiencias.length > 0 ? (
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                              <Users size={12} className="shrink-0" strokeWidth={2} aria-hidden="true" />
                              <span className="truncate">{resumenDeAudiencias(item.audiencias)}</span>
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {/* Reordenar se queda fuera: es lo único que se hace mirando la lista entera,
                          y meterlo en la ficha obligaría a abrir dos módulos para intercambiarlos. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Subir ${item.actividad?.name ?? 'el módulo'}`}
                        onClick={() => void moverModulo(indice, -1)}
                        disabled={busy || indice === 0}
                      >
                        <ArrowUp size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Bajar ${item.actividad?.name ?? 'el módulo'}`}
                        onClick={() => void moverModulo(indice, 1)}
                        disabled={busy || indice === programa.items.length - 1}
                      >
                        <ArrowDown size={14} />
                      </Button>
                      {/*
                        SIN MENÚ: LAS DOS ACCIONES, A LA VISTA (2026-09-16).

                        Llegó a haber un menú `⋯` con abrir / editar / quitar, y se deshizo por donde
                        se deshacen estas cosas: al sacar "Quitar" fuera —lo pidió el cliente— al menú
                        le quedaba **un solo elemento propio**, porque "Abrir la formación" ya es el
                        nombre del módulo. Un menú que esconde un botón no esconde nada: añade un clic.

                        Así que las dos acciones de un módulo van visibles y en icono —sin la palabra
                        "Editar", que era la que ensanchaba el renglón—, y la tercera es el nombre. El
                        renglón queda con cinco controles, todos pequeños y sin texto: desplegar,
                        subir, bajar, editar, quitar.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${item.actividad?.name ?? 'el módulo'}`}
                        title="Editar: si es obligatorio o de qué grupo"
                        onClick={() => abrirEdicionModulo(item)}
                        disabled={busy}
                      >
                        <Pencil size={14} />
                      </Button>
                      {/*
                        QUITAR SE QUEDA FUERA DEL MENÚ (2026-09-16, decisión del cliente: *"deja el
                        botón de eliminar fuera"*).

                        Estaba dentro por prudencia —es lo único que no se deshace— y la prudencia se
                        volvió estorbo: armando un programa se quitan módulos a menudo, y esconder eso
                        detrás de un menú convierte lo frecuente en una búsqueda. Sigue siendo el único
                        control del renglón que se pinta en rojo al acercarse, que es lo que de verdad
                        evita el clic distraído — mucho más que un menú de por medio.
                      */}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar ${item.actividad?.name ?? 'el módulo'} del programa`}
                        title="Quitar del programa"
                        onClick={() => void quitarModulo(item)}
                        disabled={busy}
                        className="text-ink-500 hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>

                    {abierto ? (
                      <div className="animate-card-in space-y-3 border-t border-line bg-paper px-4 py-3">
                        {/*
                          QUIÉN TIENE QUE HACER ESTE MÓDULO. La pregunta que de verdad se hace quien
                          administra no es "¿a cuántos módulos llega esta audiencia?" sino, mirando un
                          módulo, **"¿y este, a quién?"**. Antes había que salir a la ficha de la
                          formación, pestaña "Quienes", y volver — un viaje por módulo.

                          En fichas y no en una frase con comas: con ocho cargos, una frase corrida no
                          se lee, y aquí ya no hay que ahorrar sitio.
                        */}
                        <div>
                          <h4 className="text-xs font-semibold text-ink-900">A quién se le exige</h4>
                          {item.audiencias.length > 0 ? (
                            <>
                              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {item.audiencias.map((nombre) => {
                                  // Una audiencia que no llega a TODOS los módulos: quien esté solo
                                  // en ella tendrá este módulo y no el resto.
                                  // Solo se marca si de verdad hay gente a la que le falta algo. Una audiencia
                                  // que cubre parte del programa NO es un problema por si sola: otra puede
                                  // alcanzar a la misma gente en el resto de modulos. Lo dice `afectados`,
                                  // que cuenta personas; ver `ProgramsService.contarPorPersona`.
                                  const soloAqui =
                                    programa.afectados > 0 &&
                                    (programa.obligados.find((o) => o.name === nombre)?.modulos ?? 0) <
                                      programa.items.length;
                                  return (
                                    <li
                                      key={nombre}
                                      className={cn(
                                        'rounded-full border px-2.5 py-1 text-xs',
                                        soloAqui
                                          ? 'border-warn/40 bg-warn-soft text-warn'
                                          : 'border-line bg-surface text-ink-700',
                                      )}
                                    >
                                      {nombre}
                                    </li>
                                  );
                                })}
                              </ul>
                              {/*
                                LA AUDIENCIA QUE NO ALCANZA AL RESTO DEL PROGRAMA (2026-09-16).

                                El caso que el cliente planteó: una formación que ya se le exigía a un
                                cargo, metida como módulo de un programa que se exige a otro. Agregar el
                                módulo no toca su regla vieja, así que ese cargo sigue debiendo esta
                                formación y no los demás módulos.

                                **Este aviso ES la protección.** Se estudió arreglarlo por debajo
                                —emitir la constancia individual a quien el programa no le aplica— y se
                                descartó por meter un fallo peor: constancias duplicadas. Ver el porqué
                                entero en `ProgramsService.esModuloDeUnProgramaPublicado`. Así que lo
                                único que impide que esto pase inadvertido es lo que se lee aquí, y por
                                eso dice la consecuencia completa, incluida la que duele.
                              */}
                              {programa.afectados > 0 &&
                              item.audiencias.some(
                                (nombre) =>
                                  (programa.obligados.find((o) => o.name === nombre)?.modulos ?? 0) <
                                  programa.items.length,
                              ) ? (
                                <p className="mt-2 text-xs leading-relaxed text-warn">
                                  Lo marcado en ámbar{' '}
                                  <strong className="font-medium">no alcanza al resto del programa</strong>: quien esté
                                  solo ahí deberá este módulo y no los demás, así que nunca lo completará — y, como este
                                  módulo pertenece a un programa publicado, tampoco recibirá la constancia individual de
                                  esta formación. Si no es lo que querías, dale a esa gente el programa entero, o saca
                                  este módulo del programa.
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-1 text-xs text-warn">
                              A nadie todavía. Mientras siga así, nadie puede completar el programa: este módulo le
                              faltaría a cualquiera.
                            </p>
                          )}
                          {/*
                            LA REGLA AUTOMÁTICA QUE TODAVÍA NO EXISTE (2026-09-16).

                            El cliente se topó con esto y preguntó lo correcto: *"¿por qué sale un
                            cargo en 'se le exige' si es Inducción general?"*. Y visto desde la ficha
                            era ilegible: arriba decía un cargo, abajo "Se exige sola: a toda la
                            empresa", y las dos cosas parecían contradecirse.

                            No se contradicen, pero faltaba la pieza que las une: la exigencia
                            automática **nace al publicar la formación** (`aplicarExigenciaAutomatica`,
                            `versioning.service.ts`). En borrador no existe, así que lo único que se ve
                            es lo que alguien exigió a mano —normalmente el propio botón de asignar el
                            programa, que exige TODOS los módulos por igual—. Dicho así se entiende de
                            una, y sin ello se lee como un fallo.
                          */}
                          {item.exigenciaAutomatica && !item.publicada ? (
                            <p className="mt-2 text-xs leading-relaxed text-ink-500">
                              Eso es lo que hay <strong className="font-medium">hoy</strong>. Al ser{' '}
                              {item.actividad?.activityType.name
                                ? `de tipo ${item.actividad.activityType.name}`
                                : 'de un tipo que se exige solo'}
                              , al publicar la formación nacerá además su regla{' '}
                              {item.soloAlIngresar ? 'para quien ingrese a la empresa' : 'de toda la empresa'} — mientras
                              siga en borrador, esa regla no existe.
                            </p>
                          ) : null}
                        </div>

                        {/* El tipo de formación NO se repite aquí: ya está en el renglón, siempre
                            visible. Repetirlo al abrir es lo que se acaba de quitar arriba. */}
                        <dl className="grid gap-x-6 gap-y-2 border-t border-line pt-3 text-xs sm:grid-cols-2">
                          <Dato
                            label="Cuenta como"
                            valor={
                              item.isRequired
                                ? 'Obligatorio: hay que aprobarlo siempre'
                                : `Cupo del grupo "${item.sectionName}"`
                            }
                          />
                          <Dato
                            label="Estado"
                            valor={item.publicada ? 'Publicada' : 'Sin publicar: todavía no la puede cursar nadie'}
                          />
                          {item.fechaDeCampana ? (
                            <Dato label="Vence cada año" valor={`Antes del ${textoDeCampana(item.fechaDeCampana)}`} />
                          ) : null}
                          {/* Solo si está PUBLICADA: ahí esta línea explica por qué "Toda la empresa"
                              aparece arriba sin que nadie la pusiera. En borrador lo cuenta el párrafo
                              de arriba, y decirlo dos veces era parte de lo que confundía. */}
                          {item.exigenciaAutomatica && item.publicada ? (
                            <Dato
                              label="Se exige sola"
                              valor={
                                item.soloAlIngresar
                                  ? 'Su tipo la exige a quien ingrese a la empresa'
                                  : 'Su tipo la exige a toda la empresa'
                              }
                            />
                          ) : null}
                        </dl>

                        {/* Aquí NO van las acciones: viven en el menú del renglón, donde se alcanzan
                            sin desplegar nada. Esta ficha es para leer, no para actuar. */}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-display text-sm font-semibold text-ink-900">
              {moduloForm.editingId ? 'Editar módulo' : 'Agregar módulo'}
            </h3>
            <div className="mt-4 space-y-4">
              {!moduloForm.editingId ? (
                <Field htmlFor="m-activity" label="Formación" required>
                  <Select
                    id="m-activity"
                    value={moduloForm.activityId}
                    onChange={(e) => setModuloForm({ ...moduloForm, activityId: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {/* SE DICE ANTES DE ELEGIRLA, no después: agregar un borrador deja el programa
                        sin poder completarse, y enterarse al ver la lista ya es tarde. */}
                    {disponibles.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.currentVersionId ? '' : '  (sin publicar)'}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-sm text-ink-500">
                  {programa.items.find((i) => i.id === moduloForm.editingId)?.actividad?.name}
                </p>
              )}

              <Field
                htmlFor="m-required"
                label="¿Hay que aprobarlo sí o sí?"
                hint="Todos los módulos SE CURSAN. Esto decide si además hay que APROBARLO siempre, o si reprobarlo lo perdona un cupo."
              >
                <Select
                  id="m-required"
                  value={moduloForm.isRequired ? 'SI' : 'NO'}
                  onChange={(e) => setModuloForm({ ...moduloForm, isRequired: e.target.value === 'SI' })}
                >
                  <option value="SI">Sí — obligatorio: reprobarlo impide completar el programa</option>
                  <option value="NO">No — se cursa igual, pero reprobarlo lo perdona el cupo</option>
                </Select>
              </Field>

              {!moduloForm.isRequired ? (
                <>
                  {/*
                    EL GRUPO NO SE PREGUNTA SALVO QUE HAGA FALTA (2026-09-15).

                    Un grupo solo sirve para tener DOS reglas de cupo distintas en el mismo programa
                    ("de los 4 de Seguridad puede perder 1" y "de los 5 de Operación puede perder
                    2"). Con una sola regla —lo normal— pedir que alguien invente un nombre es
                    trabajo para nada, y el cliente lo dijo asi: *"¿por qué tiene que haber un
                    grupo?"*. Por debajo sigue existiendo, porque el modelo lo necesita; arriba no
                    aparece hasta que alguien pide el segundo.
                  */}
                  {/*
                    LAS REGLAS QUE YA EXISTEN SE ELIGEN, NO SE ESCRIBEN (2026-09-15). Con un campo de
                    texto y una lista de sugerencias, unirse a un grupo existente dependia de teclear
                    su nombre EXACTO: una tilde o una mayuscula de diferencia creaba un grupo nuevo
                    —con su propia regla— sin que nada avisara. Escribir queda para lo unico que lo
                    necesita: crear uno que todavia no existe.
                  */}
                  {mostrarGrupos ? (
                    <Field
                      htmlFor="m-section"
                      label="Grupo"
                      required
                      hint="Los módulos del mismo grupo comparten la misma regla de aprobación."
                    >
                      {creandoGrupo ? (
                        <div className="space-y-2">
                          <Input
                            id="m-section"
                            placeholder="Nombre del grupo nuevo"
                            value={moduloForm.sectionName}
                            onChange={(e) => setModuloForm({ ...moduloForm, sectionName: e.target.value })}
                          />
                          {programa.secciones.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCreandoGrupo(false);
                                setModuloForm({ ...moduloForm, sectionName: '' });
                              }}
                              className="focus-ring rounded text-xs text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
                            >
                              Elegir uno que ya existe
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <Select
                          id="m-section"
                          value={moduloForm.sectionName}
                          onChange={(e) => {
                            if (e.target.value === GRUPO_NUEVO) {
                              setCreandoGrupo(true);
                              setModuloForm({ ...moduloForm, sectionName: '' });
                              return;
                            }
                            setModuloForm({ ...moduloForm, sectionName: e.target.value });
                          }}
                        >
                          <option value="">Seleccionar...</option>
                          {programa.secciones.map((seccion) => (
                            <option key={seccion.name} value={seccion.name}>
                              {seccion.name} — aprobar {seccion.minimo} de {seccion.total}
                            </option>
                          ))}
                          <option value={GRUPO_NUEVO}>Crear un grupo nuevo...</option>
                        </Select>
                      )}
                    </Field>
                  ) : null}

                  {/*
                    EL NUMERO SE PIDE UNA SOLA VEZ, al crear el grupo. Es del GRUPO, no del módulo:
                    volver a pedirlo en cada módulo dejaba que un formulario de uno cambiara la regla
                    de todos sin avisar. Si el grupo ya existe, aquí solo se recuerda lo que exige.
                  */}
                  {/*
                    AQUI NO SE PREGUNTA CUANTOS HACEN FALTA (2026-09-15). Ese numero es del GRUPO, no
                    del módulo, y sobre todo NO SE PUEDE SABER TODAVIA: al agregar el primero nadie
                    sabe si al final serán cinco o nueve. Se configura arriba, con el grupo ya armado.
                  */}
                  <p className="flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-sm text-ink-700">
                    <Info size={15} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={2} />
                    <span>
                      {seccionDelFormulario
                        ? `Se suma a los ${seccionDelFormulario.total} que ya cuentan para el cupo. Cuántos hacen falta se ajusta arriba, en la lista.`
                        : 'Cuántos hacen falta se ajusta arriba, en la lista, cuando estén todos puestos.'}
                    </span>
                  </p>

                  {/* La puerta a la segunda regla, para quien la necesite. No se quita nada: se
                      guarda hasta que haga falta. */}
                  {/* Se enciende y se apaga: abrirlo por curiosidad no deberia dejar el formulario
                      pidiendo un nombre de grupo para siempre. Solo se puede volver atrás mientras
                      el programa tenga un único grupo; con dos, el nombre hace falta de verdad. */}
                  {programa.secciones.length > 1 ? null : separarEnGrupos ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSepararEnGrupos(false);
                        setModuloForm({ ...moduloForm, sectionName: '' });
                      }}
                      className="focus-ring rounded text-left text-xs text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
                    >
                      Volver a un solo grupo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSepararEnGrupos(true);
                        // Si todavia no hay ningun grupo, no hay nada que elegir: se escribe.
                        const existe = programa.secciones.some((s) => s.name === grupoEfectivo);
                        setCreandoGrupo(!existe);
                        setModuloForm({ ...moduloForm, sectionName: existe ? grupoEfectivo : '' });
                      }}
                      className="focus-ring rounded text-left text-xs text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
                    >
                      ¿Necesitas dos cupos distintos en este programa? Separar en grupos
                    </button>
                  )}
                </>
              ) : null}

              {moduloError ? (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                  {moduloError}
                </p>
              ) : null}

              <div className="flex gap-2">
                {moduloForm.editingId ? (
                  <Button variant="ghost" onClick={cancelarEdicionModulo} disabled={busy}>
                    Cancelar
                  </Button>
                ) : null}
                <Button className="flex-1" onClick={() => void guardarModulo()} loading={busy} disabled={!puedeGuardarModulo}>
                  <Plus size={16} />
                  {moduloForm.editingId ? 'Guardar cambios' : 'Agregar módulo'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────── Asignar a una audiencia ─────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-lg font-semibold text-ink-900">Asignar a una audiencia</h2>
            {programa.status === 'PUBLISHED' ? (
              <div className="relative">
                <button
                  type="button"
                  aria-label="Qué hace este botón"
                  onClick={() => setVerInfoAsignar((v) => !v)}
                  className="focus-ring flex h-5 w-5 items-center justify-center rounded-full text-ink-300 transition-colors duration-150 hover:text-ink-500"
                >
                  <Info size={15} strokeWidth={2} />
                </button>
                {verInfoAsignar ? (
                  // Se abre hacia la IZQUIERDA (`right-0`): el icono vive pegado al titulo, y un
                  // panel de 288 px saliendo hacia la derecha se iba fuera de la tarjeta y obligaba
                  // a mover la pantalla de lado para leerlo. Nada en un registro deberia pedir
                  // scroll horizontal.
                  <div className="absolute right-0 top-6 z-10 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-700 shadow-card-hover">
                    Exige el programa entero de una vez: por debajo crea el requisito en CADA uno de sus{' '}
                    {programa.items.length} módulo{programa.items.length === 1 ? '' : 's'}, con la misma audiencia y el
                    mismo plazo — lo mismo que marcar "Exigirla" en cada formación por separado, en un solo paso.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* A quién se le exige vive arriba, en el bloque de estado: es parte de "cómo está este
              programa", no una sección aparte. Tenerlo en dos sitios obligaba a mirar los dos. */}

          {programa.status !== 'PUBLISHED' ? (
            <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
              <Info size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
              Publica el programa primero: asignar un borrador obligaría a algo que todavía puede cambiar de forma.
            </p>
          ) : (
            <div className="card space-y-4 p-5">
              {/*
                UNA LINEA, Y EL RESTO BAJO DEMANDA (2026-09-15). El aviso completo son seis lineas de
                texto SIEMPRE visibles encima del formulario, y lo accionable cabe en una: cuantos
                hay que asignar. Lo demas —a quien alcanza la regla automatica, que pasa si asignas
                igual— es contexto que se lee una vez y estorba las demas.
              */}
              {automaticos.length > 0 ? (
                <div className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                  <p className="flex items-start gap-2">
                    <Info size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
                    <span className="flex-1">
                      {todosAutomaticos ? (
                        <strong className="font-medium">Este programa no necesita asignarse.</strong>
                      ) : (
                        <>
                          <strong className="font-medium">
                            {programa.items.length - automaticos.length}{' '}
                            {programa.items.length - automaticos.length === 1 ? 'módulo necesita' : 'módulos necesitan'} que los
                            asignes aquí
                          </strong>
                          ; los otros {automaticos.length} ya se exigen solos.
                        </>
                      )}{' '}
                      <button
                        type="button"
                        onClick={() => setVerDetalleAutomatico((v) => !v)}
                        className="focus-ring rounded underline underline-offset-2"
                      >
                        {verDetalleAutomatico ? 'Ocultar' : 'Por qué'}
                      </button>
                    </span>
                  </p>
                  {verDetalleAutomatico ? (
                    <p className="mt-2 pl-[23px] text-xs leading-relaxed">
                    {todosAutomaticos
                      ? `Este programa no necesita asignarse: ${
                          programa.items.length === 1
                            ? 'su único módulo es de un tipo que se exige solo'
                            : `sus ${programa.items.length} módulos son de un tipo que se exige solo`
                        } a toda la empresa al publicar cada formación`
                      : `${automaticos.length} de ${programa.items.length} módulos se exigen solos a toda la empresa al publicar cada formación`}{' '}
                    ({automaticosYaExigidos} de {automaticos.length} con su regla ya activa).
                    {algunoSoloAlIngresar
                      ? ' Esa exigencia automática alcanza a quien ingrese, no a quien ya está en la empresa: usa este panel si quieres exigírselo también a la plantilla actual.'
                      : ''}{' '}
                    {todosAutomaticos
                      ? ' Asignar aquí no pisa esa regla —queda una segunda, y la obligación nace una sola vez—, pero con la misma audiencia no añade nada.'
                      : ` Este botón exige los ${programa.items.length} módulos por igual, no solo los que hacen falta: a ${
                          automaticos.length === 1 ? 'el automático' : `los ${automaticos.length} automáticos`
                        } les queda una regla de más, que no duplica la obligación pero tampoco añade nada.`}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/*
                SI EL PROGRAMA NO NECESITA ASIGNARSE, EL FORMULARIO SE PLIEGA (2026-09-16).

                Decirle a alguien "esto no hace falta" y dejarle debajo el formulario entero, listo
                para usarse, es una contradiccion: la pantalla dice una cosa y ofrece la contraria.
                Y en un programa de Induccion General o Reinduccion usarlo es casi siempre un error
                —crea una segunda regla que compite con la automatica— asi que no deberia estar a un
                clic de distancia.

                No se quita: se guarda detras de una frase que obliga a decidirlo a proposito.
              */}
              {todosAutomaticos && !asignarDeTodasFormas ? (
                <button
                  type="button"
                  onClick={() => setAsignarDeTodasFormas(true)}
                  className="focus-ring rounded text-left text-xs text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline"
                >
                  Asignarlo igualmente a un grupo concreto
                </button>
              ) : null}
              {todosAutomaticos && !asignarDeTodasFormas ? null : (
                <>
              <Field htmlFor="a-jobs" label="A todos los de un cargo">
                <MultiSelect
                  id="a-jobs"
                  placeholder="Ningún cargo"
                  options={catalogs.jobTitles.map((row) => ({ id: row.id, label: row.name, hint: row.jobTitleType?.name }))}
                  value={scope.jobTitleIds}
                  onChange={(jobTitleIds) => setScope({ ...scope, jobTitleIds })}
                />
              </Field>
              {/* Con la rama y diciendo que el área arrastra a sus hijas, igual que en Quiénes. */}
              <Field
                htmlFor="a-areas"
                label="A toda un área"
                hint="Marcar un área incluye también a sus sub-áreas. Para acotar, marca la sub-área."
              >
                <MultiSelect
                  id="a-areas"
                  placeholder="Ninguna área"
                  options={catalogs.areas.map((row) => ({ id: row.id, label: nombreConRama(row, catalogs.areas) }))}
                  value={scope.areaIds}
                  onChange={(areaIds) => setScope({ ...scope, areaIds })}
                />
              </Field>
              <Field htmlFor="a-regionals" label="A una regional">
                <MultiSelect
                  id="a-regionals"
                  placeholder="Ninguna regional"
                  options={catalogs.regionals.map((row) => ({ id: row.id, label: row.name }))}
                  value={scope.regionalIds}
                  onChange={(regionalIds) => setScope({ ...scope, regionalIds })}
                />
              </Field>
              <Field htmlFor="a-services" label="A un servicio" hint="Solo alcanza a quien lo tenga puesto en su ficha.">
                <MultiSelect
                  id="a-services"
                  placeholder="Ningún servicio"
                  options={catalogs.services.map((row) => ({ id: row.id, label: row.name }))}
                  value={scope.serviceIds}
                  onChange={(serviceIds) => setScope({ ...scope, serviceIds })}
                />
              </Field>
              {contarFacetas(scope) > 1 ? <p className="text-xs text-ink-500">Se cruzan: hay que cumplir todo lo marcado a la vez.</p> : null}

              <div className="grid grid-cols-2 gap-3">
                <Field htmlFor="a-trigger" label="Se le exige">
                  <Select id="a-trigger" value={plazo.trigger} onChange={(e) => setPlazo({ ...plazo, trigger: e.target.value as 'ON_HIRE' | 'ON_JOIN' })}>
                    <option value="ON_JOIN">Desde ahora</option>
                    <option value="ON_HIRE">Al ingresar a la empresa</option>
                  </Select>
                </Field>
                <Field htmlFor="a-dias" label="Vence a los" hint="Días. Negativo = antes.">
                  <Input id="a-dias" type="number" value={plazo.dias} onChange={(e) => setPlazo({ ...plazo, dias: e.target.value })} />
                </Field>
              </div>

              <Field htmlFor="a-repite-modo" label="Se repite" hint={COMO_SE_REPITE[plazo.modoRepite]}>
                <Select
                  id="a-repite-modo"
                  value={plazo.modoRepite}
                  onChange={(e) =>
                    setPlazo({
                      ...plazo,
                      modoRepite: e.target.value as 'NO' | 'MESES' | 'ANUAL',
                      everyMonths: e.target.value === 'MESES' ? plazo.everyMonths || '12' : '',
                      fixedDate: e.target.value === 'ANUAL' ? plazo.fixedDate || '03-31' : '',
                    })
                  }
                >
                  <option value="NO">No se repite</option>
                  <option value="ANUAL">Cada año, en una fecha fija</option>
                  <option value="MESES">Cada N meses desde que lo completó</option>
                </Select>
              </Field>

              {plazo.modoRepite === 'MESES' ? (
                <Field htmlFor="a-repite" label="Cada cuántos meses">
                  <Input id="a-repite" type="number" min={1} value={plazo.everyMonths} onChange={(e) => setPlazo({ ...plazo, everyMonths: e.target.value })} />
                </Field>
              ) : null}
              {plazo.modoRepite === 'ANUAL' ? (
                <Field htmlFor="a-repite-fecha" label="Antes de qué fecha, cada año">
                  <MesDia idBase="a-repite-fecha" value={plazo.fixedDate || '03-31'} onChange={(valor) => setPlazo({ ...plazo, fixedDate: valor })} />
                </Field>
              ) : null}

              <Field htmlFor="a-reason" label="Motivo (opcional)" hint="Queda en el registro si se pregunta por qué.">
                <Textarea id="a-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>

              <Button className="w-full" onClick={() => void asignar()} loading={asignando} disabled={!puedeAsignar}>
                <ShieldCheck size={16} />
                Asignar programa
              </Button>
              {sinMarcar(scope) ? (
                <p className="text-center text-xs text-ink-500">Marca al menos un cargo, área, regional o servicio.</p>
              ) : reach !== null ? (
                <p className="text-center text-xs text-ink-500">Alcanza a {reach} personas hoy.</p>
              ) : null}

              {resultado ? (
                <div className="animate-card-in rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-700">
                  <p>
                    <strong className="font-medium">{resultado.reach}</strong> personas en el alcance ·{' '}
                    <strong className="font-medium">{resultado.modulos}</strong> módulos exigidos ·{' '}
                    <strong className="font-medium">{resultado.obligacionesCreadas}</strong> obligaciones nuevas.
                  </p>
                </div>
              ) : null}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
