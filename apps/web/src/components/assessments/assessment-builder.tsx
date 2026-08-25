'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Shuffle, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  createNextAssessmentVersion,
  getAssessment,
  publishAssessment,
  updateAssessmentDraft,
  type AssessmentDetail,
  type AssessmentVersion,
  type QuestionCategory,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

interface SectionDraft {
  mode: 'RANDOM_FROM_POOL';
  categoryId: string;
  pickCount: number;
}

export interface AssessmentBuilderProps {
  assessmentId: string | null;
  categories: QuestionCategory[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

/**
 * Constructor del examen: configuracion academica + secciones.
 *
 * Fase 1 expone secciones ALEATORIAS (N preguntas al azar de una categoria), que es lo que evita
 * que se comparta la hoja de respuestas. Las secciones fijas existen en la API y se habilitan en
 * la UI cuando haya un caso que las pida.
 */
export function AssessmentBuilder({ assessmentId, categories, onClose, onChanged }: AssessmentBuilderProps) {
  const { showToast } = useToast();
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [version, setVersion] = useState<AssessmentVersion | null>(null);
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setAssessment(null);
    const detail = await getAssessment(assessmentId).catch(() => null);
    if (!detail) return;
    setAssessment(detail);
    const draft = detail.versions.find((v) => v.status === 'DRAFT') ?? detail.versions[0] ?? null;
    setVersion(draft);
    setSections(
      (draft?.sections ?? [])
        .filter((s) => s.mode === 'RANDOM_FROM_POOL' && s.categoryId)
        .map((s) => ({ mode: 'RANDOM_FROM_POOL', categoryId: s.categoryId as string, pickCount: s.pickCount ?? 1 })),
    );
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDraft = version?.status === 'DRAFT';

  const save = async () => {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await updateAssessmentDraft(version.id, {
        timeLimitMin: version.timeLimitMin,
        maxAttempts: version.maxAttempts,
        passingScore: version.passingScore,
        gradingPolicy: version.gradingPolicy,
        shuffleQuestions: version.shuffleQuestions,
        shuffleOptions: version.shuffleOptions,
        sections: sections.map((s) => ({ mode: 'RANDOM_FROM_POOL', categoryId: s.categoryId, pickCount: s.pickCount })),
      });
      await load();
      await onChanged();
      showToast({ kind: 'success', title: 'Evaluacion guardada' });
    } catch {
      setError('No se pudo guardar. Revisa las secciones.');
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await publishAssessment(version.id);
      await load();
      await onChanged();
      showToast({ kind: 'success', title: 'Evaluacion publicada', description: 'Ya se puede usar en una actividad.' });
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          NOT_ENOUGH_QUESTIONS: 'Alguna seccion pide mas preguntas de las que hay en su categoria.',
          ASSESSMENT_EMPTY: 'Agrega al menos una seccion.',
          EMPTY_FIXED_SECTION: 'Hay secciones sin preguntas.',
        };
        setError(map[err.code] ?? err.message);
      } else {
        setError('No se pudo publicar.');
      }
    } finally {
      setBusy(false);
    }
  };

  const newVersion = async () => {
    if (!assessment) return;
    setBusy(true);
    try {
      await createNextAssessmentVersion(assessment.id);
      await load();
      await onChanged();
      showToast({ kind: 'success', title: 'Version nueva en borrador' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo crear la version' });
    } finally {
      setBusy(false);
    }
  };

  const totalQuestions = sections.reduce((sum, s) => sum + s.pickCount, 0);
  const availableFor = (categoryId: string) => categories.find((c) => c.id === categoryId)?._count.questions ?? 0;
  const anyInsufficient = sections.some((s) => s.pickCount > availableFor(s.categoryId));

  return (
    <Drawer
      open={assessmentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={assessment?.title ?? 'Evaluacion'}
      description={version ? `Version ${version.versionNumber}` : undefined}
      footer={
        isDraft ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={save} loading={busy}>
              Guardar borrador
            </Button>
            <Button onClick={doPublish} loading={busy} disabled={sections.length === 0 || anyInsufficient}>
              Publicar
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="outline" onClick={newVersion} loading={busy}>
              Nueva version
            </Button>
          </div>
        )
      }
    >
      {!assessment || !version ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <StatusPill
              kind={version.status === 'PUBLISHED' ? 'ok' : 'neutral'}
              label={version.status === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}
            />
            {!isDraft ? <span className="text-xs text-ink-500">Publicada: inmutable. Crea una version para cambiarla.</span> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="as-score" label="Nota minima (%)" hint="Vacio = hereda la de la actividad.">
              <Input
                id="as-score"
                type="number"
                min={1}
                max={100}
                disabled={!isDraft}
                value={version.passingScore ?? ''}
                onChange={(e) => setVersion({ ...version, passingScore: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field htmlFor="as-attempts" label="Intentos maximos">
              <Input
                id="as-attempts"
                type="number"
                min={1}
                max={10}
                disabled={!isDraft}
                value={version.maxAttempts ?? ''}
                onChange={(e) => setVersion({ ...version, maxAttempts: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field htmlFor="as-time" label="Tiempo limite (min)" hint="Vacio = sin limite.">
              <Input
                id="as-time"
                type="number"
                min={1}
                max={600}
                disabled={!isDraft}
                value={version.timeLimitMin ?? ''}
                onChange={(e) => setVersion({ ...version, timeLimitMin: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
            <Field htmlFor="as-policy" label="Nota con varios intentos">
              <Select
                id="as-policy"
                disabled={!isDraft}
                value={version.gradingPolicy}
                onChange={(e) => setVersion({ ...version, gradingPolicy: e.target.value as AssessmentVersion['gradingPolicy'] })}
              >
                <option value="HIGHEST">La mas alta</option>
                <option value="LAST">El ultimo intento</option>
                <option value="FIRST">El primer intento</option>
                <option value="AVERAGE">Promedio</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                disabled={!isDraft}
                checked={version.shuffleQuestions}
                onChange={(e) => setVersion({ ...version, shuffleQuestions: e.target.checked })}
                className="h-4 w-4 rounded border-line-strong"
              />
              Barajar el orden de las preguntas
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                disabled={!isDraft}
                checked={version.shuffleOptions}
                onChange={(e) => setVersion({ ...version, shuffleOptions: e.target.checked })}
                className="h-4 w-4 rounded border-line-strong"
              />
              Barajar el orden de las opciones
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">Secciones</p>
                <p className="text-xs text-ink-500">
                  Cada seccion toma preguntas al azar de una categoria: dos personas no ven el mismo examen.
                </p>
              </div>
              {isDraft ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSections([...sections, { mode: 'RANDOM_FROM_POOL', categoryId: categories[0]?.id ?? '', pickCount: 5 }])
                  }
                  disabled={categories.length === 0}
                >
                  <Plus size={14} />
                  Agregar
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              {sections.map((section, index) => {
                const available = availableFor(section.categoryId);
                const insufficient = section.pickCount > available;
                return (
                  <div key={index} className="card p-3">
                    <div className="flex items-center gap-2">
                      <Shuffle size={14} className="shrink-0 text-ink-500" />
                      <Select
                        value={section.categoryId}
                        disabled={!isDraft}
                        onChange={(e) =>
                          setSections(sections.map((s, i) => (i === index ? { ...s, categoryId: e.target.value } : s)))
                        }
                        className="flex-1"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        disabled={!isDraft}
                        value={section.pickCount}
                        onChange={(e) =>
                          setSections(sections.map((s, i) => (i === index ? { ...s, pickCount: Number(e.target.value) } : s)))
                        }
                        className="w-20"
                        aria-label="Cantidad de preguntas"
                      />
                      {isDraft ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => setSections(sections.filter((_, i) => i !== index))}
                          aria-label="Quitar seccion"
                        >
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                    <p className={insufficient ? 'mt-1 text-xs text-danger' : 'mt-1 text-xs text-ink-500'}>
                      {insufficient
                        ? `Solo hay ${available} pregunta(s) en esta categoria: agrega mas o baja la cantidad.`
                        : `Disponibles en la categoria: ${available}`}
                    </p>
                  </div>
                );
              })}
            </div>

            {sections.length > 0 ? (
              <p className="mt-2 text-sm text-ink-700">
                El examen tendra <span className="font-semibold">{totalQuestions}</span> pregunta(s).
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
