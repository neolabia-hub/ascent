'use client';

import {
  ArrowLeft, Award, ClipboardCheck, Eye, EyeOff, FileCheck2, Lock, Pencil, Plus,
  SlidersHorizontal, Target, Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { frasearUso, leerEnUso, type EnUso } from '@/lib/catalog-en-uso';
import { createCatalogRow, deleteCatalogRow, listCatalog, updateCatalogRow, type CatalogRow } from '@/lib/admin-api';
import { listSurveys, type SurveyTemplate } from '@/lib/surveys-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Drawer } from '@/components/ui/drawer';
import { MesDia } from '@/components/ui/mes-dia';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * TIPOS DE FORMACION: la clase de cada formacion y lo que esa clase exige (Decisiones #111 y #116).
 *
 * ─── ESTA PANTALLA REEMPLAZA A DOS ───
 *
 * Habia "Tipos de actividad" como un catalogo mas —crear, renombrar, borrar— y ademas esta, que
 * decia que exige cada tipo. **La misma tabla vista de dos maneras**, con dos nombres distintos
 * para la misma cosa, y ninguna completa: en el catalogo se podia renombrar pero no decir que
 * exige; aqui se podia decir que exige pero no renombrarlo.
 *
 * Ahora es una sola. Se llama "formacion" y no "actividad" porque es la palabra que usa el cliente
 * y la que aparece en el resto del producto.
 *
 * ─── POR QUE LAS REGLAS VIVEN AQUI Y NO EN CADA FORMACION ───
 *
 * La pregunta "¿esto lleva evaluacion? ¿lleva encuesta? ¿entrega constancia?" es por CLASE de
 * formacion, no por formacion: una pildora de tres minutos no acredita nada y una induccion si, y
 * eso no cambia entre las doscientas formaciones de una empresa —cambia entre sus seis tipos—.
 * Lo que hay que marcar doscientas veces se olvida, y el olvido se descubre en la auditoria.
 *
 * Cada formacion puede desviarse de su tipo desde su propia ficha. Aqui se pone el criterio.
 *
 * ─── ES POR EMPRESA ───
 *
 * `activity_types` tiene `tenant_id`: lo que decida Transprensa no toca a nadie mas.
 */

interface TipoConfig {
  requiresAssessment?: boolean;
  requiresSurvey?: boolean;
  issuesCertificate?: boolean;
  /** Punto de partida de la eficacia. Cada formacion puede desviarse (Decision #118). */
  requiresEfficacy?: boolean;
  /** CUAL encuesta usa este tipo. Se engancha sola al final al publicar (Decision #116). */
  surveyTemplateId?: string | null;
  isMicro?: boolean;
  /**
   * CADA CUANTO VUELVE. Las dos son excluyentes y con las dos puestas manda la fecha:
   * "cada ano antes del 31 de marzo" (campana) o "cada N meses desde que cada quien la hizo".
   */
  defaultAnnualDate?: string | null;
  defaultRecurrenceMonths?: number | null;
  /** Que pasa si llega la ronda siguiente y no hizo la anterior (Decision #142). */
  defaultOnExpiry?: 'CIERRA' | 'ACUMULA' | 'ESPERA';
  /** No se le exige a quien entro hace menos de N meses. 0 = no se excluye a nadie. */
  exemptRecentHiresMonths?: number;
  [clave: string]: unknown;
}

interface TipoDeFormacion extends CatalogRow {
  config: TipoConfig;
}

/**
 * QUE CLASE DE OBLIGACION CREA CADA FORMA DE REPETIR (2026-09-05).
 *
 * Una palabra, no una explicacion. "Cada ano en una fecha fija" y "cada N meses" se leen igual de
 * bien y crean cosas muy distintas: una hace que todos venzan el mismo dia —lo que el auditor
 * pregunta como "¿hicieron la de este ano?"— y la otra le da a cada quien su aniversario, que es lo
 * que necesita una recertificacion por norma.
 */
const COMO_SE_REPITE: Record<string, string> = {
  NO: 'Se hace una vez y no vuelve.',
  ANUAL: 'CAMPANA: todos vencen el mismo dia, sea cuando sea que la hicieran.',
  MESES: 'ANIVERSARIO: cada persona vence en su propia fecha, contada desde que la completo.',
};

/** Las tres reglas, con lo que significa cada una de verdad y no con su nombre tecnico. */
const REGLAS = [
  {
    clave: 'requiresAssessment' as const,
    icono: FileCheck2,
    titulo: 'Se evalua',
    // Se explica la CONSECUENCIA, no la regla: "exige evaluacion" deja pensando si es un capricho
    // del sistema; "sin nota no hay nada que ensenarle a un auditor" no se discute.
    detalle: 'No se puede publicar sin una evaluacion. Sin nota no hay nada que ensenarle a un auditor.',
  },
  {
    clave: 'requiresSurvey' as const,
    icono: ClipboardCheck,
    titulo: 'Lleva encuesta',
    detalle: 'La encuesta elegida se agrega sola al final de cada formacion de este tipo.',
  },
  {
    clave: 'issuesCertificate' as const,
    icono: Award,
    titulo: 'Entrega constancia',
    detalle: 'Al terminarla se emite el papel. Una pildora de tres minutos normalmente no acredita nada.',
  },
  {
    clave: 'requiresEfficacy' as const,
    icono: Target,
    titulo: 'Se mide la eficacia',
    /*
      APAGADA EN TODAS Y ES LO CORRECTO HOY (Decision #118). Transprensa no quiere que los jefes
      encuesten por ahora, y el interruptor existe para que la funcion no quede a medias: otro
      cliente la enciende y funciona, sin tocar codigo.

      Y es el PUNTO DE PARTIDA, no la decision final: cada formacion puede desviarse desde su
      ficha. Dentro del mismo tipo conviven alturas —donde importa si usa el arnes— y una
      actualizacion documental, donde preguntarle al jefe a los 30 dias no dice nada.
    */
    detalle:
      'A los 30 dias, el jefe del area responde si la persona aplica lo aprendido. Es el punto de partida: cada formacion puede desviarse desde su ficha.',
  },
];

export default function TiposDeFormacionPage() {
  const { showToast } = useToast();
  const [tipos, setTipos] = useState<TipoDeFormacion[] | null>(null);
  const [encuestas, setEncuestas] = useState<SurveyTemplate[]>([]);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ code: '', name: '' });
  /*
    EL BORRADO QUE NO SE PUEDE, CON SU MOTIVO Y CON SU SALIDA (2026-09-04).

    Esta pantalla tiene su propio borrado —no pasa por `CatalogManager`— y se habia quedado sin lo
    que aquel si hacia: leer el desglose del 409 y ofrecer desactivar. El cliente intento borrar un
    tipo que dejo un script de demo y solo vio 'Conflict Exception', que ademas invita a reintentar.

    Se guarda el tipo Y el motivo juntos porque la ventana los necesita a la vez: de que tipo se
    habla y que lo esta usando.
  */
  const [enUso, setEnUso] = useState<{ tipo: TipoDeFormacion; motivo: EnUso } | null>(null);

  useEffect(() => {
    void recargar();
    void listSurveys('SATISFACTION')
      .then((filas) => setEncuestas(filas.filter((f) => f.active)))
      .catch(() => setEncuestas([]));
  }, []);

  async function recargar() {
    const filas = await listCatalog('activity-types').catch(() => []);
    setTipos(filas as TipoDeFormacion[]);
  }

  /** Guarda un cambio pintandolo antes de que responda el servidor, y lo devuelve si falla. */
  async function guardar(tipo: TipoDeFormacion, cambio: Partial<CatalogRow> & { config?: TipoConfig }) {
    setTipos((previos) => previos?.map((t) => (t.id === tipo.id ? ({ ...t, ...cambio } as TipoDeFormacion) : t)) ?? null);
    try {
      await updateCatalogRow('activity-types', tipo.id, cambio as Record<string, unknown>);
    } catch {
      // Dejarlo movido seria decir que se guardo algo que no se guardo.
      setTipos((previos) => previos?.map((t) => (t.id === tipo.id ? tipo : t)) ?? null);
      showToast({ kind: 'danger', title: 'No se pudo guardar' });
    }
  }

  async function crear() {
    if (!nuevo.code.trim() || !nuevo.name.trim()) return;
    try {
      await createCatalogRow('activity-types', {
        code: nuevo.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        name: nuevo.name.trim(),
        active: true,
        displayOrder: (tipos?.length ?? 0) + 1,
        colorHex: '#64748b',
        // Un tipo nuevo nace SIN exigir nada. Es la direccion segura: si naciera exigiendo
        // evaluacion, nadie podria publicar con el hasta descubrir por que.
        config: { requiresAssessment: false, requiresSurvey: false, issuesCertificate: false, requiresEfficacy: false },
      });
      setNuevo({ code: '', name: '' });
      setCreando(false);
      await recargar();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: 'No se pudo crear',
        description: error instanceof ApiError ? error.message : undefined,
      });
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/configuracion" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Configuracion
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Tipos de formacion</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">
            Que exige y que entrega cada clase de formacion. Es el criterio de la empresa; cada formacion puede
            desviarse desde su propia ficha.
          </p>
        </div>
        {!creando ? (
          <Button variant="outline" onClick={() => setCreando(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Nuevo tipo
          </Button>
        ) : null}
      </div>

      {creando ? (
        <div className="card mt-5 p-4">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field htmlFor="t-code" label="Codigo" hint="No se puede cambiar despues.">
              <Input
                id="t-code"
                value={nuevo.code}
                maxLength={40}
                placeholder="REFUERZO"
                onChange={(e) => setNuevo({ ...nuevo, code: e.target.value })}
              />
            </Field>
            <Field htmlFor="t-name" label="Nombre">
              <Input
                id="t-name"
                value={nuevo.name}
                maxLength={120}
                placeholder="Refuerzo operativo"
                onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
              />
            </Field>
          </div>
          {/*
            EL CODIGO NO SE PUEDE CAMBIAR y hay que decirlo al crearlo, no despues: los snapshots
            historicos y la semilla referencian por codigo, asi que renombrarlo romperia el pasado.
          */}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreando(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void crear()} disabled={!nuevo.code.trim() || !nuevo.name.trim()} glow>
              Crear
            </Button>
          </div>
        </div>
      ) : null}

      <p className="mt-5 rounded-lg border border-line bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink-700">
        Cambiar esto afecta a lo que se publique <strong>de aqui en adelante</strong>. Las versiones ya publicadas
        conservan lo que regia cuando se publicaron, y por eso una constancia emitida sigue explicandose.
      </p>

      <div className="mt-6 space-y-3">
        {tipos === null ? (
          <>
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </>
        ) : (
          tipos.map((tipo) => (
            <Tarjeta
              key={tipo.id}
              tipo={tipo}
              encuestas={encuestas}
              onGuardar={(cambio) => void guardar(tipo, cambio)}
              onBorrar={async () => {
                try {
                  await deleteCatalogRow('activity-types', tipo.id);
                  await recargar();
                } catch (error) {
                  // En uso: la ventana dice QUE lo usa y ofrece desactivarlo, que es lo que se
                  // queria hacer. Un toast rojo deja a quien administra donde empezo.
                  const motivo = leerEnUso(error);
                  if (motivo) {
                    setEnUso({ tipo, motivo });
                    return;
                  }
                  showToast({
                    kind: 'danger',
                    title: 'No se pudo eliminar',
                    description: error instanceof ApiError ? error.message : undefined,
                  });
                }
              }}
            />
          ))
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Link href="/configuracion/encuestas">
          <Button variant="outline">Disenar las encuestas</Button>
        </Link>
        <Link href="/configuracion/constancias">
          <Button variant="outline">Disenar la constancia</Button>
        </Link>
      </div>

      {/*
        NO SE PUEDE BORRAR: QUE LO USA Y QUE HACER EN SU LUGAR.

        La regla del servidor es correcta —lo que otras filas referencian no se borra— pero un 409
        pelado parece un fallo del sistema. Aqui se dice cuantas formaciones lo usan y se ofrece la
        unica salida que existe de verdad: desactivarlo, que lo saca de las listas de aqui en
        adelante y deja como esta lo que ya lo usaba.
      */}
      <Modal
        open={enUso !== null}
        onOpenChange={(abierto) => !abierto && setEnUso(null)}
        icon={Trash2}
        title="No se puede eliminar"
        description={enUso?.tipo.name}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEnUso(null)}>
              Cerrar
            </Button>
            {enUso?.tipo.active ? (
              // Ofrecer desactivar lo que ya esta desactivado es ruido.
              <Button
                onClick={async () => {
                  const tipo = enUso.tipo;
                  setEnUso(null);
                  await guardar(tipo, { active: false });
                  await recargar();
                }}
              >
                <EyeOff size={15} />
                Desactivar el tipo
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3 text-sm text-ink-700">
          <p>
            <span className="font-semibold">{enUso?.tipo.name}</span> lo usan{' '}
            <span className="font-semibold">{enUso ? frasearUso(enUso.motivo.usedBy) : ''}</span>. Borrarlo dejaria
            esos registros apuntando a un tipo que ya no existe, y por eso no se permite.
          </p>
          <p>
            {enUso?.tipo.active
              ? 'Al desactivarlo deja de ofrecerse al crear formaciones nuevas, y las que ya lo usan se quedan como estan. Es lo que se hace cuando un tipo deja de utilizarse.'
              : `Ya esta desactivado: no se ofrece para elegir y lo que ya lo usa se queda como esta. Para borrarlo del todo habria que cambiarles el tipo antes a esas ${enUso?.motivo.references ?? 0} formaciones.`}
          </p>
        </div>
      </Modal>
    </div>
  );
}

function Tarjeta({
  tipo,
  encuestas,
  onGuardar,
  onBorrar,
}: {
  tipo: TipoDeFormacion;
  encuestas: SurveyTemplate[];
  onGuardar: (cambio: Partial<CatalogRow> & { config?: TipoConfig }) => void;
  onBorrar: () => void;
}) {
  const [nombre, setNombre] = useState(tipo.name);
  /** El nombre se lee; solo se vuelve campo al pulsarlo. Ver la cabecera de la tarjeta. */
  const [editandoNombre, setEditandoNombre] = useState(false);

  const alternar = (clave: string, valor: boolean) => onGuardar({ config: { ...tipo.config, [clave]: valor } });

  /*
    COMO SE REPITE: una sola pregunta con tres respuestas, no dos campos que se contradicen.

    Por debajo son dos claves excluyentes —`defaultAnnualDate` y `defaultRecurrenceMonths`— y con
    las dos puestas manda la fecha. Ofrecerlas sueltas dejaria configurar un tipo que dice dos cosas
    a la vez y del que solo una es verdad, asi que al elegir una se limpia la otra.
  */
  const [configurando, setConfigurando] = useState(false);
  const modoRepite = tipo.config.defaultAnnualDate ? 'ANUAL' : tipo.config.defaultRecurrenceMonths ? 'MESES' : 'NO';
  const cambiarRepeticion = (modo: string) => {
    if (modo === modoRepite) return;
    if (modo === 'NO') {
      onGuardar({ config: { ...tipo.config, defaultAnnualDate: null, defaultRecurrenceMonths: null } });
      return;
    }
    if (modo === 'ANUAL') {
      onGuardar({
        config: { ...tipo.config, defaultAnnualDate: tipo.config.defaultAnnualDate ?? '03-31', defaultRecurrenceMonths: null },
      });
      return;
    }
    onGuardar({
      config: { ...tipo.config, defaultRecurrenceMonths: tipo.config.defaultRecurrenceMonths ?? 12, defaultAnnualDate: null },
    });
  };

  return (
    <section className={cn('card p-5 transition-opacity', !tipo.active && 'opacity-60')}>
      <div className="group flex flex-wrap items-center gap-3">
        {/*
          EL COLOR identifica el tipo en las listas, en el indice del reproductor y en la biblioteca
          del aprendiz. Se cambia aqui porque es parte de que ES el tipo, no una preferencia suelta.

          REDONDO Y CON EL COLOR DENTRO (2026-09-04). Era el `input type="color"` crudo: un cuadrado
          gris del sistema con una franja de color dentro, que no se parece a nada del producto y ni
          siquiera se lee como pulsable. Ahora el circulo ES el color —que es como se ve luego en las
          listas— y el `input` va encima, transparente, para no perder el selector nativo ni el
          teclado. El lapiz aparece al pasar por encima: sin el, un circulo de color es un adorno.
        */}
        <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="h-10 w-10 rounded-full ring-1 ring-inset ring-black/10 transition-transform group-hover:scale-105"
            style={{ backgroundColor: tipo.colorHex ?? '#64748b' }}
          />
          <Pencil
            aria-hidden="true"
            className="pointer-events-none absolute h-4 w-4 text-white opacity-70 mix-blend-difference transition-opacity group-hover:opacity-100"
            strokeWidth={2}
          />
          <input
            type="color"
            aria-label={`Color de ${tipo.name}`}
            value={tipo.colorHex ?? '#64748b'}
            onChange={(e) => onGuardar({ colorHex: e.target.value })}
            className="focus-ring absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
          />
        </span>

        {/*
          EL NOMBRE SE LEE, Y SE EDITA AL PULSARLO (2026-09-04).

          Estaba SIEMPRE en un campo abierto: siete recuadros de formulario en una pantalla donde lo
          normal es leer los tipos, no renombrarlos. Un campo abierto tambien invita a escribir sin
          querer en el nombre de la clase de la que cuelga todo lo demas. Ahora es un titulo, y se
          convierte en campo al pulsarlo — lo mismo que hace el resto del producto con lo que se
          edita en sitio.
        */}
        {editandoNombre ? (
          <Input
            autoFocus
            aria-label={`Nombre de ${tipo.name}`}
            className="min-w-[180px] flex-1 font-display text-base font-semibold"
            value={nombre}
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              // Escape descarta: escribir encima de un nombre y no poder deshacerlo es peor que no
              // poder editarlo.
              if (e.key === 'Escape') {
                setNombre(tipo.name);
                setEditandoNombre(false);
              }
            }}
            // Se guarda al salir del campo y no en cada tecla: una peticion por letra tecleada.
            onBlur={() => {
              setEditandoNombre(false);
              if (nombre.trim() && nombre !== tipo.name) onGuardar({ name: nombre.trim() });
              else setNombre(tipo.name);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditandoNombre(true)}
            title="Pulsa para renombrar"
            className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left"
          >
            <span className="truncate font-display text-base font-semibold text-ink-900">{tipo.name}</span>
            <Pencil
              className="h-3.5 w-3.5 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )}

        {/*
          DESACTIVAR Y ELIMINAR SON DOS BOTONES, no uno (2026-09-04).

          Habia solo la papelera, y desactivar era algo que se descubria DENTRO del aviso de "no se
          puede eliminar": para apagar un tipo habia que pulsar Eliminar y leerse un error. El
          cliente lo dijo con esas palabras. Son dos decisiones distintas —una es reversible y la
          otra no— y merecen dos controles.

          El estado se lee en el propio boton: ojo tachado = "esta activo, pulsa para apagarlo";
          ojo abierto en la pastilla = "esta apagado, pulsa para encenderlo". La pastilla se queda
          porque sin ella un tipo desactivado se ve igual que uno activo.
        */}
        {!tipo.active ? (
          /*
            EL ICONO DICE LA ACCION; EL ROTULO, EL ESTADO (2026-09-04).

            Los dos estados llevaban el MISMO ojo tachado, asi que el icono no distinguia nada: en
            uno significaba "esto esta apagado" y en el otro "pulsa para apagarlo". Ahora el ojo
            ABIERTO solo sale donde la accion es encender, y el tachado solo donde es apagar. El
            rotulo "Desactivado" —y la tarjeta atenuada— dicen en cual de los dos se esta.
          */
          <button
            type="button"
            onClick={() => onGuardar({ active: true })}
            title="Este tipo no se ofrece al crear formaciones nuevas. Pulsa para volver a activarlo."
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn transition-opacity hover:opacity-80"
          >
            <Eye className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Desactivado · activar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGuardar({ active: false })}
            aria-label={`Desactivar ${tipo.name}`}
            title="Deja de ofrecerse al crear formaciones nuevas. Las que ya lo usan se quedan como estan."
            className="focus-ring shrink-0 rounded-lg p-2 text-ink-500 transition-colors hover:text-ink-900"
          >
            <EyeOff className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
        {tipo.isSystem ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink-500"
            title="Los tipos del sistema no se eliminan: el producto los referencia por codigo."
          >
            <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            Del sistema
          </span>
        ) : (
          <button
            type="button"
            onClick={onBorrar}
            aria-label={`Eliminar ${tipo.name}`}
            title="Borra el tipo. Solo se puede si ninguna formacion lo usa."
            className="focus-ring shrink-0 rounded-lg p-2 text-ink-500 transition-colors hover:text-danger"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/*
        LA TARJETA SE LEE; LO QUE SE CONFIGURA VIVE EN UN CAJON (2026-09-04).

        Estaban las cuatro casillas con su explicacion, el selector de encuesta que aparece al
        encender una de ellas, y la linea de "cada cuanto vuelve" con su propio boton. Por tipo. Con
        siete tipos eran siete pantallas de alto de formulario para algo que se decide una vez y se
        queda anos, y lo que uno viene a hacer aqui casi siempre es MIRAR que exige cada clase.

        Ahora la tarjeta dice en una linea lo que el tipo exige y entrega, y todo lo que se toca esta
        detras de "Configurar". Es la regla del sistema de diseno: si tiene campos, cajon; si es para
        leer, ventana (Decision #131). De paso desaparece el segundo boton: habia "Ajustar" para la
        repeticion y nada para las casillas, que estaban sueltas en la tarjeta.
      */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-500">{resumenDelTipo(tipo.config, encuestas)}</p>
        <Button variant="outline" size="sm" onClick={() => setConfigurando(true)}>
          <SlidersHorizontal size={15} />
          Configurar
        </Button>
      </div>

      <Drawer
        open={configurando}
        onOpenChange={setConfigurando}
        title="Que exige este tipo"
        description={tipo.name}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setConfigurando(false)}>Listo</Button>
          </div>
        }
      >
      <div className="space-y-2.5">
        {REGLAS.map((regla) => {
          const marcada = tipo.config[regla.clave] === true;
          const Icono = regla.icono;
          return (
            <div key={regla.clave}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={(e) => alternar(regla.clave, e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                />
                <Icono
                  className="mt-0.5 h-[18px] w-[18px] shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                  style={{ color: marcada ? 'var(--brand-primary)' : 'var(--ink-300)' }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{regla.titulo}</span>
                  <span className="block text-xs leading-relaxed text-ink-500">{regla.detalle}</span>
                </span>
              </label>

              {/*
                CUAL encuesta, justo debajo de la casilla que la enciende. Aparte seria una lista
                desplegable suelta que nadie relaciona con la regla de arriba.
              */}
              {regla.clave === 'requiresSurvey' && marcada ? (
                <div className="ml-10 mt-2">
                  {encuestas.length === 0 ? (
                    <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs leading-relaxed text-ink-700">
                      No hay ninguna encuesta de satisfaccion activa.{' '}
                      <Link href="/configuracion/encuestas" className="focus-ring font-medium text-primary hover:underline">
                        Crea una
                      </Link>{' '}
                      o este tipo no se podra publicar.
                    </p>
                  ) : (
                    <Select
                      aria-label={`Encuesta de ${tipo.name}`}
                      className="max-w-sm"
                      value={tipo.config.surveyTemplateId ?? ''}
                      onChange={(e) => onGuardar({ config: { ...tipo.config, surveyTemplateId: e.target.value || null } })}
                    >
                      <option value="">Elegir encuesta...</option>
                      {encuestas.map((encuesta) => (
                        <option key={encuesta.id} value={encuesta.id}>
                          {encuesta.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/*
        CADA CUANTO VUELVE, Y QUE PASA SI NO LA HIZO (2026-09-04).

        Vivia solo en la semilla, y la consecuencia era doble: la reinduccion decia "cada ano antes
        del 31 de marzo" y esa fecha no se podia cambiar desde ninguna pantalla, y un cliente que NO
        trabaje por campana —que los hay: "cada 12 meses desde que cada quien la hizo"— no tenia
        forma de decirlo sin tocar la base.

        Va aqui y no en cada formacion porque es politica de EMPRESA: si cada reinduccion eligiera su
        propia fecha no habria "la reinduccion de 2026" que ensenarle a un auditor. Una formacion
        suelta puede apartarse en Quienes -> Ajustar, y ahi queda con su novedad.
      */}
      {/*
        PLEGADO, Y DICIENDO LO QUE HACE (2026-09-04).

        Tres campos desplegados en cada una de las siete tarjetas eran cuatro pantallas de alto de
        controles que casi nunca se tocan: la repeticion se decide una vez y se queda anos. Y los
        cuatro tipos que NO se repiten ensenaban un desplegable en "No se repite" para no decir
        nada.

        Ahora la tarjeta dice en una linea lo que hace —"Cada ano antes del 31 de marzo · si no la
        hizo, se cierra y nace la nueva"— y los campos salen al pulsar Ajustar. Es lo mismo que hace
        la encuesta debajo de su casilla: se ensena la decision, no el formulario.
      */}
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Cada cuanto vuelve</p>
        <p className="mb-3 mt-1 text-sm text-ink-700">{comoSeRepite(tipo.config)}</p>
        <div className="space-y-2.5">
          <Field htmlFor={`t-modo-${tipo.id}`} label="Como vuelve" hint={COMO_SE_REPITE[modoRepite]}>
            <Select
              id={`t-modo-${tipo.id}`}
              value={modoRepite}
              onChange={(e) => cambiarRepeticion(e.target.value)}
            >
              <option value="NO">No se repite</option>
              <option value="ANUAL">Cada ano, antes de una fecha fija</option>
              <option value="MESES">Cada N meses, desde que cada quien la hizo</option>
            </Select>
          </Field>

          {modoRepite === 'ANUAL' ? (
            <Field
              htmlFor={`t-fecha-${tipo.id}-mes`}
              label="Antes de que fecha"
              hint="Todos vencen el mismo dia: es una campana, no un aniversario por persona."
            >
              {/*
                DOS LISTAS, NO UN CAMPO DE TEXTO (2026-09-04).

                Aqui se escribia "03-31" a mano, y el tenant acabo con la reinduccion en `09-31`.
                Septiembre tiene 30 dias: la fecha se desbordaba al mes siguiente en silencio y la
                campana vencia el 1 de octubre mientras esta pantalla seguia diciendo 09-31.
                Con los dias saliendo del mes, el 31 de septiembre no existe para elegirlo.
              */}
              <MesDia
                idBase={`t-fecha-${tipo.id}`}
                value={tipo.config.defaultAnnualDate ?? '03-31'}
                onChange={(valor) => {
                  if (valor === tipo.config.defaultAnnualDate) return;
                  onGuardar({ config: { ...tipo.config, defaultAnnualDate: valor, defaultRecurrenceMonths: null } });
                }}
              />
            </Field>
          ) : null}

          {modoRepite === 'MESES' ? (
            <Field
              htmlFor={`t-meses-${tipo.id}`}
              label="Cada cuantos meses"
              hint="Se cuenta desde que cada persona la completo, asi que cada uno tiene su fecha."
            >
              <Input
                id={`t-meses-${tipo.id}`}
                type="number"
                min={1}
                defaultValue={tipo.config.defaultRecurrenceMonths ?? 12}
                onBlur={(e) => {
                  const meses = Number(e.target.value);
                  if (!Number.isInteger(meses) || meses < 1) return;
                  if (meses === tipo.config.defaultRecurrenceMonths) return;
                  onGuardar({ config: { ...tipo.config, defaultRecurrenceMonths: meses, defaultAnnualDate: null } });
                }}
              />
            </Field>
          ) : null}

          {/*
            SOLO TIENE SENTIDO SI VUELVE. Sin repeticion no hay "ronda siguiente" de la que
            preguntarse nada, y ensenarlo invita a configurar algo que no se va a usar.
          */}
          {modoRepite !== 'NO' ? (
            <Field
              htmlFor={`t-vencer-${tipo.id}`}
              label="Si llega la siguiente y no hizo la anterior"
              hint={
                (tipo.config.defaultOnExpiry ?? 'ESPERA') === 'ESPERA'
                  ? 'Ojo: quien nunca la hace deja de contar en los anos siguientes, y la cobertura sale mejor de lo que es.'
                  : undefined
              }
            >
              <Select
                id={`t-vencer-${tipo.id}`}
                value={tipo.config.defaultOnExpiry ?? 'ESPERA'}
                onChange={(e) =>
                  onGuardar({
                    config: { ...tipo.config, defaultOnExpiry: e.target.value as TipoConfig['defaultOnExpiry'] },
                  })
                }
              >
                <option value="CIERRA">La anterior se cierra como no realizada y nace la nueva</option>
                <option value="ACUMULA">Nace la nueva y sigue debiendo la anterior</option>
                <option value="ESPERA">No nace la nueva hasta que haga la anterior</option>
              </Select>
            </Field>
          ) : null}

          {/*
            A QUIEN ACABA DE ENTRAR NO SE LE PIDE (2026-09-04).

            El motor ya lo respetaba desde esta manana, pero el campo no estaba en ninguna pantalla:
            solo se podia poner en la semilla. El cliente pregunto "¿desde donde se configura?" y la
            respuesta honesta era "desde ningun sitio". Una opcion que existe y no se puede tocar es
            una opcion que no existe.

            Solo tiene sentido si la formacion VUELVE: sin ciclo no hay "dentro del ciclo".
          */}
          {modoRepite !== 'NO' ? (
            <Field
              htmlFor={`t-recien-${tipo.id}`}
              label="No se le exige a quien entro hace menos de"
              hint="Su induccion es su actualizacion de ese ano. En cero, se le exige a todo el mundo."
            >
              <Select
                id={`t-recien-${tipo.id}`}
                value={String(tipo.config.exemptRecentHiresMonths ?? 0)}
                onChange={(e) =>
                  onGuardar({
                    config: { ...tipo.config, exemptRecentHiresMonths: Number(e.target.value) },
                  })
                }
              >
                <option value="0">No excluir a nadie</option>
                <option value="3">3 meses</option>
                <option value="6">6 meses</option>
                <option value="9">9 meses</option>
                <option value="12">12 meses</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </div>
      </Drawer>
    </section>
  );
}

/**
 * LO QUE EXIGE Y ENTREGA EL TIPO, en una linea que se lee de un vistazo.
 *
 * Es lo que sustituye a las cuatro casillas desplegadas en la tarjeta. Se nombra la CONSECUENCIA y
 * no la clave —"Entrega constancia", no `issuesCertificate`— y la encuesta se dice con su nombre,
 * porque "lleva encuesta" sin decir cual obliga a abrir el cajon para saber si es la que toca.
 *
 * Un tipo que no exige nada tampoco se queda mudo: decirlo es informacion, y ademas es un aviso —un
 * tipo sin nada marcado se publica sin examen y no acredita nada—.
 */
function resumenDelTipo(config: TipoConfig, encuestas: SurveyTemplate[]): string {
  const partes: string[] = [];
  if (config.requiresAssessment) partes.push('Se evalua');
  if (config.requiresSurvey) {
    const encuesta = encuestas.find((e) => e.id === config.surveyTemplateId);
    partes.push(encuesta ? `Lleva "${encuesta.name}"` : 'Lleva encuesta (sin elegir)');
  }
  if (config.issuesCertificate) partes.push('Entrega constancia');
  if (config.requiresEfficacy) partes.push('Se mide la eficacia');
  if (config.isMicro) partes.push('Microaprendizaje');
  if (partes.length === 0) partes.push('No exige nada: se publica sin evaluacion y no acredita');
  return `${partes.join(' · ')} · ${comoSeRepite(config)}`;
}

/**
 * LO QUE HACE LA REPETICION, en una linea.
 *
 * La tarjeta ensena la DECISION y no el formulario: "cada ano antes del 31 de marzo · si no la
 * hizo, se cierra y nace la nueva" se lee de un vistazo, y tres desplegables en siete tarjetas no.
 */
function comoSeRepite(config: TipoConfig): string {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  if (config.defaultAnnualDate) {
    const [mes, dia] = config.defaultAnnualDate.split('-').map(Number);
    const cuando = MESES[(mes ?? 1) - 1] ? `${dia} de ${MESES[(mes ?? 1) - 1]}` : config.defaultAnnualDate;
    return `Cada ano antes del ${cuando} · ${alVencer(config)}`;
  }
  if (config.defaultRecurrenceMonths) {
    return `Cada ${config.defaultRecurrenceMonths} meses desde que cada quien la hizo · ${alVencer(config)}`;
  }
  return 'No se repite: se hace una vez.';
}

/** La segunda mitad de la frase: que pasa si llega la siguiente y no hizo la anterior. */
function alVencer(config: TipoConfig): string {
  const politica = config.defaultOnExpiry ?? 'ESPERA';
  if (politica === 'CIERRA') return 'si no la hizo, se cierra y nace la nueva';
  if (politica === 'ACUMULA') return 'si no la hizo, las debe las dos';
  return 'si no la hizo, la nueva no nace';
}
