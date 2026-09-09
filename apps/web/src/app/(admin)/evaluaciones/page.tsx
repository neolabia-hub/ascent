'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Dices, ListChecks, Plus, Search, Timer } from 'lucide-react';
import {
  createAssessment,
  listAssessments,
  type AssessmentListItem,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';
import { motivoDelError } from '@/lib/api';

/**
 * EVALUACIONES. Solo evaluaciones (Decision #84).
 *
 * SE VA LA PESTANA "BANCO DE PREGUNTAS", y con ella la ceremonia que ponia delante. Lo pregunto
 * el cliente en estos terminos: *"si tiene beneficio el banco de preguntas o biblioteca si si, si
 * no quitarlo"*. La respuesta honesta es que el banco tiene DOS beneficios reales y ninguno de
 * los dos justifica ser un sitio al que ir:
 *
 *   - sin el no existe el BLOQUE AL AZAR, que es lo que evita que 116 personas se pasen la hoja
 *     de respuestas el primer dia;
 *   - guarda el VERSIONADO (Decision #6): corregir un enunciado hoy no reescribe lo que alguien
 *     respondio el año pasado.
 *
 * Los dos siguen enteros. Lo que se retira es el DESTINO: nadie entra a este modulo queriendo
 * "administrar un banco", entra queriendo armar un examen. Tenerlo como pestana de primer nivel
 * era repetir el error mas citado de Moodle, y ademas cobraba peaje —habia que salirse a crear
 * una "categoria" ANTES de poder escribir la primera pregunta—. Ahora reutilizar y el tema viven
 * DENTRO de la evaluacion, en el momento en que sirven para algo.
 *
 * Y el listado deja de ser un renglon por evaluacion con un boton "Configurar" al final. La
 * pregunta de quien entra aqui no es "¿que evaluaciones hay?" sino "¿cual esta lista y cual no?",
 * y para contestarla habia que abrirlas una a una.
 */

export default function EvaluacionesPage() {
  const { showToast } = useToast();
  const router = useRouter();

  const [assessments, setAssessments] = useState<AssessmentListItem[] | null>(null);
  const [q, setQ] = useState('');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    setAssessments(await listAssessments().catch(() => []));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const termino = q.trim().toLowerCase();
  const visibles = (assessments ?? []).filter((row) => !termino || row.title.toLowerCase().includes(termino));

  const crear = async () => {
    setCreando(true);
    try {
      const created = await createAssessment(titulo.trim());
      setTitulo('');
      setNuevaOpen(false);
      router.push(`/evaluaciones/${created.id}`);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo crear la evaluación', description: motivoDelError(error) });
    } finally {
      setCreando(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Evaluaciones</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Los examenes que se pueden poner dentro de una formacion. Las preguntas se escriben dentro de cada una y
            quedan guardadas para poder reutilizarlas.
          </p>
        </div>
        <Button onClick={() => setNuevaOpen(true)}>
          <Plus size={16} />
          Nueva evaluacion
        </Button>
      </div>

      {assessments && assessments.length > 6 ? (
        <div className="relative mb-4 max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar por titulo"
            className="pl-9"
            aria-label="Buscar evaluaciones"
          />
        </div>
      ) : null}

      {!assessments ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardCheck}
            title="Todavía no hay ninguna evaluación"
            description="Se crea con un titulo y se le escriben las preguntas dentro, viendo como quedan para quien las responda."
            action={
              <Button onClick={() => setNuevaOpen(true)}>
                <Plus size={16} />
                Nueva evaluacion
              </Button>
            }
          />
        </div>
      ) : visibles.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-500">Ninguna coincide con &quot;{q.trim()}&quot;.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((assessment) => (
            <li key={assessment.id}>
              <TarjetaEvaluacion assessment={assessment} onOpen={() => router.push(`/evaluaciones/${assessment.id}`)} />
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={nuevaOpen}
        onOpenChange={setNuevaOpen}
        title="Nueva evaluación"
        description="Solo el titulo: las preguntas se escriben dentro, viendo como van a quedar."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNuevaOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={titulo.trim().length < 3} loading={creando} onClick={() => void crear()}>
              Crear y empezar
            </Button>
          </div>
        }
      >
        <Field htmlFor="as-title" label="Titulo" required>
          <Input
            id="as-title"
            autoFocus
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            maxLength={200}
            placeholder="Examen de inducción general"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && titulo.trim().length >= 3) void crear();
            }}
          />
        </Field>
      </Drawer>
    </div>
  );
}

/**
 * Una evaluacion, con lo que hace falta para saber en que estado esta SIN abrirla: cuantos
 * bloques lleva, la nota minima, los intentos y —lo que de verdad cambia el significado de
 * tocarla— si ya esta dentro de alguna formacion. La tarjeta entera es el enlace: con una sola
 * accion principal, anadir ademas un boton "Abrir" solo reparte la atencion.
 *
 * Antes decia "PUBLICADA v2 / BORRADOR". Eso era de la escalera de versiones propia que se
 * retiro (Decision #87): una evaluacion se edita siempre, y lo que la pone en manos de la gente
 * es publicar la formacion que la lleva.
 */
function TarjetaEvaluacion({ assessment, onOpen }: { assessment: AssessmentListItem; onOpen: () => void }) {
  const secciones = assessment._count.sections;
  const enUso = assessment._count.copias > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card card-hover focus-ring flex h-full w-full flex-col items-start p-5 text-left transition-transform duration-150 hover:-translate-y-0.5"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <h2 className="font-display text-base font-semibold leading-snug text-ink-900">{assessment.title}</h2>
        {enUso ? <StatusPill kind="ok" label="EN USO" /> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks size={14} strokeWidth={1.75} />
          {secciones === 0 ? 'Sin preguntas' : `${secciones} ${secciones === 1 ? 'bloque' : 'bloques'}`}
        </span>
        {assessment.passingScore ? (
          <span className="inline-flex items-center gap-1.5">
            <Dices size={14} strokeWidth={1.75} />
            Nota minima {assessment.passingScore}%
          </span>
        ) : null}
        {assessment.maxAttempts ? (
          <span className="inline-flex items-center gap-1.5">
            <Timer size={14} strokeWidth={1.75} />
            {assessment.maxAttempts} {assessment.maxAttempts === 1 ? 'intento' : 'intentos'}
          </span>
        ) : null}
      </div>

      {/*
        Un borrador ENCIMA de una publicada es lo unico que la pastilla de arriba no puede decir, y
        es justo lo que alguien necesita ver desde fuera: hay trabajo a medias que nadie esta
        respondiendo todavia.
      */}
      <p className={cn('mt-auto pt-4 text-xs', enUso ? 'text-ink-500' : 'text-ink-300')}>
        {secciones === 0
          ? 'Sin preguntas todavia: no se puede poner en una formacion'
          : enUso
            ? `Dentro de ${assessment._count.copias} ${assessment._count.copias === 1 ? 'formacion publicada' : 'formaciones publicadas'}`
            : 'Lista para ponerla en una formacion'}
      </p>
    </button>
  );
}
