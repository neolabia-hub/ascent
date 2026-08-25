'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, FolderPlus, Plus, Search } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  createAssessment,
  createQuestion,
  createQuestionCategory,
  getQuestion,
  listAssessments,
  listQuestionCategories,
  listQuestions,
  reviseQuestion,
  type AssessmentListItem,
  type QuestionCategory,
  type QuestionPayloadClient,
  type QuestionType,
  type QuestionsPage,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { AssessmentBuilder } from '@/components/assessments/assessment-builder';

const QTYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: 'Seleccion unica',
  MULTI: 'Seleccion multiple',
  TRUE_FALSE: 'Verdadero o falso',
  ESSAY: 'Abierta (calificacion manual)',
};

const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function emptyPayload(qtype: QuestionType): QuestionPayloadClient {
  const base = { qtype, stem: '', points: 1 } as QuestionPayloadClient;
  if (qtype === 'SINGLE' || qtype === 'MULTI') {
    base.options = [
      { id: 'a', text: '' },
      { id: 'b', text: '' },
    ];
    if (qtype === 'SINGLE') base.correctOptionId = 'a';
    else base.correctOptionIds = [];
  }
  if (qtype === 'TRUE_FALSE') base.correctValue = true;
  return base;
}

export default function EvaluacionesPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'BANK' | 'ASSESSMENTS'>('BANK');

  // Banco
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [questions, setQuestions] = useState<QuestionsPage | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState('');

  // Editor de pregunta
  const [qOpen, setQOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payload, setPayload] = useState<QuestionPayloadClient>(emptyPayload('SINGLE'));
  const [targetCategory, setTargetCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [qError, setQError] = useState<string | null>(null);

  // Evaluaciones
  const [assessments, setAssessments] = useState<AssessmentListItem[] | null>(null);
  const [newAssessmentOpen, setNewAssessmentOpen] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [openAssessmentId, setOpenAssessmentId] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setCategories(await listQuestionCategories().catch(() => []));
  }, []);

  const loadQuestions = useCallback(async () => {
    setQuestions(await listQuestions({ categoryId: categoryId || undefined, q: q || undefined }).catch(() => null));
  }, [categoryId, q]);

  const loadAssessments = useCallback(async () => {
    setAssessments(await listAssessments().catch(() => []));
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (tab === 'BANK') void loadQuestions();
    else void loadAssessments();
  }, [tab, loadQuestions, loadAssessments]);

  const openNewQuestion = () => {
    setEditingId(null);
    setPayload(emptyPayload('SINGLE'));
    setTargetCategory(categoryId || categories[0]?.id || '');
    setQError(null);
    setQOpen(true);
  };

  const openEditQuestion = async (id: string) => {
    try {
      const detail = await getQuestion(id);
      setEditingId(id);
      setPayload(detail.payload);
      setTargetCategory(detail.categoryId);
      setQError(null);
      setQOpen(true);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo abrir la pregunta' });
    }
  };

  const saveQuestion = async () => {
    setSaving(true);
    setQError(null);
    try {
      if (editingId) {
        await reviseQuestion(editingId, payload);
        showToast({
          kind: 'success',
          title: 'Pregunta revisada',
          description: 'Se creo una version nueva; los intentos anteriores conservan la que respondieron.',
        });
      } else {
        await createQuestion(targetCategory, payload);
        showToast({ kind: 'success', title: 'Pregunta creada' });
      }
      setQOpen(false);
      await Promise.all([loadQuestions(), loadCategories()]);
    } catch (error) {
      setQError(error instanceof ApiError ? 'Revisa los campos de la pregunta.' : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => {
    const options = payload.options ?? [];
    if (options.length >= 8) return;
    setPayload({ ...payload, options: [...options, { id: OPTION_IDS[options.length] as string, text: '' }] });
  };

  const removeOption = (id: string) => {
    const options = (payload.options ?? []).filter((o) => o.id !== id);
    setPayload({
      ...payload,
      options,
      correctOptionId: payload.correctOptionId === id ? options[0]?.id : payload.correctOptionId,
      correctOptionIds: payload.correctOptionIds?.filter((x) => x !== id),
    });
  };

  const changeType = (qtype: QuestionType) => {
    setPayload({ ...emptyPayload(qtype), stem: payload.stem, points: payload.points });
  };

  const questionValid =
    payload.stem.trim().length >= 5 &&
    (payload.qtype === 'ESSAY' ||
      payload.qtype === 'TRUE_FALSE' ||
      ((payload.options ?? []).every((o) => o.text.trim().length > 0) &&
        (payload.qtype === 'SINGLE' ? Boolean(payload.correctOptionId) : (payload.correctOptionIds ?? []).length > 0)));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Evaluaciones</h1>
          <p className="mt-1 text-sm text-ink-500">
            Banco de preguntas y armado de examenes. Editar una pregunta crea una version nueva: lo ya respondido no
            se reescribe.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'BANK' ? (
            <>
              <Button variant="outline" onClick={() => setCatOpen(true)}>
                <FolderPlus size={16} />
                Nueva categoria
              </Button>
              <Button onClick={openNewQuestion} disabled={categories.length === 0}>
                <Plus size={16} />
                Nueva pregunta
              </Button>
            </>
          ) : (
            <Button onClick={() => setNewAssessmentOpen(true)}>
              <Plus size={16} />
              Nueva evaluacion
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            { key: 'BANK', label: 'Banco de preguntas' },
            { key: 'ASSESSMENTS', label: 'Examenes' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'focus-ring -mb-px border-b-2 px-4 py-2 text-sm transition-colors duration-150',
              tab === t.key ? 'border-[var(--brand-primary)] font-medium text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'BANK' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el enunciado" className="w-72 pl-9" />
            </div>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-64">
              <option value="">Todas las categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.questions})
                </option>
              ))}
            </Select>
          </div>

          {!questions ? (
            <Skeleton className="h-80 w-full" />
          ) : questions.total === 0 ? (
            <div className="card">
              <EmptyState
                icon={ClipboardCheck}
                title={categories.length === 0 ? 'Crea primero una categoria' : 'Sin preguntas en el banco'}
                description={
                  categories.length === 0
                    ? 'Las categorias agrupan las preguntas y son de donde los examenes toman sus preguntas al azar.'
                    : 'Agrega preguntas para poder armar examenes aleatorios.'
                }
                action={
                  categories.length === 0 ? (
                    <Button onClick={() => setCatOpen(true)}>
                      <FolderPlus size={16} />
                      Nueva categoria
                    </Button>
                  ) : (
                    <Button onClick={openNewQuestion}>
                      <Plus size={16} />
                      Nueva pregunta
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <Table>
                <THead>
                  <Tr>
                    <Th>Enunciado</Th>
                    <Th>Tipo</Th>
                    <Th>Categoria</Th>
                    <Th>Version</Th>
                    <Th className="w-24 text-right">Accion</Th>
                  </Tr>
                </THead>
                <TBody>
                  {questions.items.map((question) => (
                    <Tr key={question.id}>
                      <Td>
                        <p className="line-clamp-2 max-w-xl text-ink-900">{question.stem}</p>
                      </Td>
                      <Td className="text-ink-500">{question.qtype ? QTYPE_LABEL[question.qtype] : '—'}</Td>
                      <Td className="text-ink-700">{question.categoryName}</Td>
                      <Td>
                        <StatusPill kind="info" label={`V${question.versionNumber}`} />
                      </Td>
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditQuestion(question.id)}>
                          Editar
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </>
      ) : !assessments ? (
        <Skeleton className="h-80 w-full" />
      ) : assessments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardCheck}
            title="Sin examenes"
            description="Un examen toma preguntas fijas o al azar de una categoria del banco."
            action={
              <Button onClick={() => setNewAssessmentOpen(true)}>
                <Plus size={16} />
                Nueva evaluacion
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((assessment) => {
            const current = assessment.versions[0];
            return (
              <div key={assessment.id} className="card card-hover flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{assessment.title}</p>
                  <p className="text-xs text-ink-500">
                    {current ? `Version ${current.versionNumber} · ${current._count.sections} seccion(es)` : 'Sin versiones'}
                    {current?.passingScore ? ` · nota minima ${current.passingScore}%` : ''}
                  </p>
                </div>
                {current ? (
                  <StatusPill
                    kind={current.status === 'PUBLISHED' ? 'ok' : 'neutral'}
                    label={current.status === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}
                  />
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setOpenAssessmentId(assessment.id)}>
                  Configurar
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Nueva categoria */}
      <Drawer
        open={catOpen}
        onOpenChange={setCatOpen}
        title="Nueva categoria del banco"
        description="Las secciones aleatorias de un examen toman sus preguntas de una categoria."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCatOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={catName.trim().length < 2}
              onClick={async () => {
                try {
                  await createQuestionCategory(catName.trim());
                  setCatName('');
                  setCatOpen(false);
                  await loadCategories();
                  showToast({ kind: 'success', title: 'Categoria creada' });
                } catch {
                  showToast({ kind: 'danger', title: 'No se pudo crear la categoria' });
                }
              }}
            >
              Crear
            </Button>
          </div>
        }
      >
        <Field htmlFor="cat-name" label="Nombre" required>
          <Input id="cat-name" value={catName} onChange={(e) => setCatName(e.target.value)} maxLength={120} />
        </Field>
      </Drawer>

      {/* Editor de pregunta */}
      <Drawer
        open={qOpen}
        onOpenChange={setQOpen}
        title={editingId ? 'Editar pregunta' : 'Nueva pregunta'}
        description={editingId ? 'Guardar crea una version nueva; la anterior queda como historico.' : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setQOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveQuestion} loading={saving} disabled={!questionValid}>
              {editingId ? 'Guardar como version nueva' : 'Crear pregunta'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editingId ? (
            <Field htmlFor="q-cat" label="Categoria" required>
              <Select id="q-cat" value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field htmlFor="q-type" label="Tipo de pregunta" required>
            <Select id="q-type" value={payload.qtype} onChange={(e) => changeType(e.target.value as QuestionType)}>
              {(Object.keys(QTYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {QTYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="q-stem" label="Enunciado" required>
            <textarea
              id="q-stem"
              value={payload.stem}
              onChange={(e) => setPayload({ ...payload, stem: e.target.value })}
              rows={3}
              maxLength={1000}
              className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            />
          </Field>

          {payload.qtype === 'SINGLE' || payload.qtype === 'MULTI' ? (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-700">
                Opciones {payload.qtype === 'SINGLE' ? '(marca la correcta)' : '(marca todas las correctas)'}
              </p>
              <div className="space-y-2">
                {(payload.options ?? []).map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <input
                      type={payload.qtype === 'SINGLE' ? 'radio' : 'checkbox'}
                      name="correct-option"
                      checked={
                        payload.qtype === 'SINGLE'
                          ? payload.correctOptionId === option.id
                          : (payload.correctOptionIds ?? []).includes(option.id)
                      }
                      onChange={() => {
                        if (payload.qtype === 'SINGLE') {
                          setPayload({ ...payload, correctOptionId: option.id });
                        } else {
                          const current = payload.correctOptionIds ?? [];
                          setPayload({
                            ...payload,
                            correctOptionIds: current.includes(option.id)
                              ? current.filter((x) => x !== option.id)
                              : [...current, option.id],
                          });
                        }
                      }}
                      className="shrink-0"
                      aria-label={`Marcar opcion ${option.id} como correcta`}
                    />
                    <Input
                      value={option.text}
                      onChange={(e) =>
                        setPayload({
                          ...payload,
                          options: (payload.options ?? []).map((o) => (o.id === option.id ? { ...o, text: e.target.value } : o)),
                        })
                      }
                      placeholder={`Opcion ${option.id.toUpperCase()}`}
                      maxLength={500}
                    />
                    {(payload.options ?? []).length > 2 ? (
                      <Button variant="ghost" size="sm" className="text-danger" onClick={() => removeOption(option.id)}>
                        Quitar
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={addOption} disabled={(payload.options ?? []).length >= 8}>
                <Plus size={14} />
                Agregar opcion
              </Button>
            </div>
          ) : null}

          {payload.qtype === 'TRUE_FALSE' ? (
            <Field htmlFor="q-tf" label="Respuesta correcta" required>
              <Select
                id="q-tf"
                value={payload.correctValue ? 'true' : 'false'}
                onChange={(e) => setPayload({ ...payload, correctValue: e.target.value === 'true' })}
              >
                <option value="true">Verdadero</option>
                <option value="false">Falso</option>
              </Select>
            </Field>
          ) : null}

          {payload.qtype === 'ESSAY' ? (
            <Field htmlFor="q-rubric" label="Rubrica de calificacion" hint="Guia para quien califica manualmente.">
              <textarea
                id="q-rubric"
                value={payload.rubric ?? ''}
                onChange={(e) => setPayload({ ...payload, rubric: e.target.value })}
                rows={3}
                maxLength={2000}
                className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="q-points" label="Puntaje">
              <Input
                id="q-points"
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                value={payload.points}
                onChange={(e) => setPayload({ ...payload, points: Number(e.target.value) })}
              />
            </Field>
          </div>

          {payload.qtype !== 'ESSAY' ? (
            <Field htmlFor="q-expl" label="Explicacion" hint="Se puede mostrar despues del intento, segun la politica de revision.">
              <Input
                id="q-expl"
                value={payload.explanation ?? ''}
                onChange={(e) => setPayload({ ...payload, explanation: e.target.value })}
                maxLength={1000}
              />
            </Field>
          ) : null}

          {qError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {qError}
            </p>
          ) : null}
        </div>
      </Drawer>

      {/* Nueva evaluacion */}
      <Drawer
        open={newAssessmentOpen}
        onOpenChange={setNewAssessmentOpen}
        title="Nueva evaluacion"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewAssessmentOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={assessmentTitle.trim().length < 3}
              onClick={async () => {
                try {
                  const created = await createAssessment(assessmentTitle.trim());
                  setAssessmentTitle('');
                  setNewAssessmentOpen(false);
                  await loadAssessments();
                  setOpenAssessmentId(created.id);
                } catch {
                  showToast({ kind: 'danger', title: 'No se pudo crear la evaluacion' });
                }
              }}
            >
              Crear
            </Button>
          </div>
        }
      >
        <Field htmlFor="as-title" label="Titulo" required>
          <Input id="as-title" value={assessmentTitle} onChange={(e) => setAssessmentTitle(e.target.value)} maxLength={200} />
        </Field>
      </Drawer>

      {/* Constructor del examen */}
      <AssessmentBuilder
        assessmentId={openAssessmentId}
        categories={categories}
        onClose={() => setOpenAssessmentId(null)}
        onChanged={loadAssessments}
      />
    </div>
  );
}
