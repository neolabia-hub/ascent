'use client';

import { ArrowLeft, Award, ClipboardCheck, FileCheck2, Lock, Plus, Target, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { createCatalogRow, deleteCatalogRow, listCatalog, updateCatalogRow, type CatalogRow } from '@/lib/admin-api';
import { listSurveys, type SurveyTemplate } from '@/lib/surveys-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
  [clave: string]: unknown;
}

interface TipoDeFormacion extends CatalogRow {
  config: TipoConfig;
}

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

  const alternar = (clave: string, valor: boolean) => onGuardar({ config: { ...tipo.config, [clave]: valor } });

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        {/*
          EL COLOR identifica el tipo en las listas, en el indice del reproductor y en la
          biblioteca del aprendiz. Se cambia aqui porque es parte de que ES el tipo, no una
          preferencia estetica suelta.
        */}
        <input
          type="color"
          aria-label={`Color de ${tipo.name}`}
          value={tipo.colorHex ?? '#64748b'}
          onChange={(e) => onGuardar({ colorHex: e.target.value })}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
        />
        <Input
          aria-label={`Nombre de ${tipo.name}`}
          className="min-w-[180px] flex-1 font-display text-base font-semibold"
          value={nombre}
          maxLength={120}
          onChange={(e) => setNombre(e.target.value)}
          // Se guarda al salir del campo y no en cada tecla: una peticion por letra tecleada.
          onBlur={() => nombre.trim() && nombre !== tipo.name && onGuardar({ name: nombre.trim() })}
        />
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
            className="focus-ring shrink-0 rounded-lg p-2 text-ink-500 transition-colors hover:text-danger"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2.5">
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

      {tipo.config.isMicro ? (
        <p className={cn('mt-3 text-xs text-ink-500')}>
          Microaprendizaje: se cursa en minutos y aparece como pildora en la biblioteca del colaborador.
        </p>
      ) : null}
    </section>
  );
}
