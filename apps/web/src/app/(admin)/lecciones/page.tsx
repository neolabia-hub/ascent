'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Layers, Pencil, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { createLesson, duplicateLesson, listLessons, type LessonListItem } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

function apiErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Ocurrio un error. Intenta de nuevo.';
}

export default function LeccionesPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [lessons, setLessons] = useState<LessonListItem[] | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listLessons();
      setLessons(result);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar el listado de lecciones' });
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setTitle('');
    setEstimatedMinutes('');
    setFormError(null);
    setDrawerOpen(true);
  };

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const minutes = estimatedMinutes.trim() === '' ? null : Number(estimatedMinutes);
      const lesson = await createLesson({ title: title.trim(), estimatedMinutes: minutes });
      setDrawerOpen(false);
      router.push(`/lecciones/${lesson.id}`);
    } catch (error) {
      setFormError(apiErrorText(error));
    } finally {
      setCreating(false);
    }
  };

  const duplicate = async (lesson: LessonListItem) => {
    setDuplicatingId(lesson.id);
    try {
      const copy = await duplicateLesson(lesson.id);
      showToast({ kind: 'success', title: `"${lesson.title}" duplicada` });
      router.push(`/lecciones/${copy.id}`);
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    } finally {
      setDuplicatingId(null);
    }
  };

  const formValid = title.trim().length >= 3 && (estimatedMinutes.trim() === '' || (Number(estimatedMinutes) >= 1 && Number(estimatedMinutes) <= 60));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Lecciones</h1>
          <p className="mt-1 text-sm text-ink-500">Lecciones en tarjetas: la unidad de contenido de las actividades formativas.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          Nueva leccion
        </Button>
      </div>

      {!lessons ? (
        <Skeleton className="h-96 w-full" />
      ) : lessons.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Layers}
            title="Sin lecciones todavia"
            description="Crea la primera leccion para empezar a armar su pila de tarjetas."
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                Nueva leccion
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Titulo</Th>
                  <Th>Tarjetas</Th>
                  <Th>Minutos estimados</Th>
                  <Th>Estado</Th>
                  <Th className="w-40 text-right">Acciones</Th>
                </Tr>
              </THead>
              <TBody>
                {lessons.map((lesson) => (
                  <Tr key={lesson.id}>
                    <Td className="font-medium text-ink-900">{lesson.title}</Td>
                    <Td className="text-ink-700">{lesson._count.cards}</Td>
                    <Td className="text-ink-700">{lesson.estimatedMinutes ?? '—'}</Td>
                    <Td>
                      <StatusPill
                        kind={lesson.status === 'PUBLISHED' ? 'info' : 'neutral'}
                        label={lesson.status === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/lecciones/${lesson.id}`)}
                          aria-label={`Editar ${lesson.title}`}
                        >
                          <Pencil size={14} />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void duplicate(lesson)}
                          loading={duplicatingId === lesson.id}
                          aria-label={`Duplicar ${lesson.title}`}
                        >
                          <Copy size={14} />
                          Duplicar
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Nueva leccion"
        description="Se crea vacia; agregas las tarjetas en el editor."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button onClick={() => void create()} loading={creating} disabled={!formValid}>
              Crear leccion
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="l-title" label="Titulo" required>
            <Input id="l-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field htmlFor="l-minutes" label="Minutos estimados" hint="Opcional, entre 1 y 60.">
            <Input
              id="l-minutes"
              type="number"
              min={1}
              max={60}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
            />
          </Field>
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
