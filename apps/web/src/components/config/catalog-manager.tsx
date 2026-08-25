'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  createCatalogRow,
  deleteCatalogRow,
  listCatalog,
  updateCatalogRow,
  type CatalogKey,
  type CatalogRow,
} from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/** Campo extra propio de un catalogo (ademas de code/name). */
export interface ExtraField {
  key: 'jobTitleTypeId' | 'annualHoursRequired' | 'colorHex';
  label: string;
  kind: 'select' | 'number' | 'color';
  /** Para kind=select: catalogo del que salen las opciones. */
  optionsFrom?: CatalogKey;
  hint?: string;
  required?: boolean;
}

export interface CatalogManagerProps {
  catalogKey: CatalogKey;
  /** Nombre singular para los textos ("area", "cargo", "norma"...). */
  singular: string;
  /** Genero gramatical para los articulos de los textos. */
  feminine?: boolean;
  extraFields?: ExtraField[];
}

interface FormState {
  code: string;
  name: string;
  jobTitleTypeId: string;
  annualHoursRequired: string;
  colorHex: string;
}

const EMPTY_FORM: FormState = { code: '', name: '', jobTitleTypeId: '', annualHoursRequired: '', colorHex: '' };

const ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_CODE: 'Ya existe un registro con ese codigo.',
  CATALOG_IN_USE: 'No se puede eliminar: esta en uso. Desactivalo en su lugar.',
  SYSTEM_CATALOG: 'Los registros del sistema no se pueden eliminar.',
  VALIDATION_ERROR: 'Revisa los campos del formulario.',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return ERROR_MESSAGES[error.code] ?? error.message;
  return 'Ocurrio un error. Intenta de nuevo.';
}

/**
 * Gestor generico de un catalogo del tenant: tabla + drawer de crear/editar + activar/desactivar
 * + eliminar (solo si no esta en uso). Los ocho catalogos comparten este componente; lo que varia
 * (campos extra) llega por configuracion — mismo principio que la API.
 */
export function CatalogManager({ catalogKey, singular, feminine = false, extraFields = [] }: CatalogManagerProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<CatalogRow[] | null>(null);
  const [options, setOptions] = useState<Record<string, CatalogRow[]>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogRow | null>(null);

  const articulo = feminine ? 'la' : 'el';
  const nuevoLabel = feminine ? `Nueva ${singular}` : `Nuevo ${singular}`;

  const load = useCallback(async () => {
    try {
      const data = await listCatalog(catalogKey);
      setRows(data);
    } catch {
      showToast({ kind: 'danger', title: `No se pudo cargar ${articulo} catalogo` });
      setRows([]);
    }
  }, [catalogKey, articulo, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opciones de los selects de campos extra (p. ej. tipos de cargo para el catalogo de cargos).
  useEffect(() => {
    for (const field of extraFields) {
      if (field.kind === 'select' && field.optionsFrom) {
        void listCatalog(field.optionsFrom).then((data) =>
          setOptions((prev) => ({ ...prev, [field.key]: data.filter((o) => o.active) })),
        );
      }
    }
    // extraFields es configuracion estatica por instancia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: CatalogRow) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      jobTitleTypeId: row.jobTitleTypeId ?? '',
      annualHoursRequired: row.annualHoursRequired ? String(row.annualHoursRequired) : '',
      colorHex: row.colorHex ?? '',
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = { name: form.name.trim() };
    if (!editing) body.code = form.code.trim().toUpperCase();
    for (const field of extraFields) {
      if (field.key === 'jobTitleTypeId' && form.jobTitleTypeId) body.jobTitleTypeId = form.jobTitleTypeId;
      if (field.key === 'annualHoursRequired') {
        body.annualHoursRequired = form.annualHoursRequired ? Number(form.annualHoursRequired) : null;
      }
      if (field.key === 'colorHex' && form.colorHex) body.colorHex = form.colorHex;
    }
    return body;
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateCatalogRow(catalogKey, editing.id, buildBody());
        showToast({ kind: 'success', title: 'Cambios guardados' });
      } else {
        await createCatalogRow(catalogKey, buildBody());
        showToast({ kind: 'success', title: `${nuevoLabel} registrado` });
      }
      setDrawerOpen(false);
      await load();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: CatalogRow) => {
    try {
      await updateCatalogRow(catalogKey, row.id, { active: !row.active });
      showToast({ kind: 'success', title: row.active ? `Se desactivo "${row.name}"` : `Se activo "${row.name}"` });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: errorMessage(error) });
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCatalogRow(catalogKey, confirmDelete.id);
      showToast({ kind: 'success', title: `Se elimino "${confirmDelete.name}"` });
      setConfirmDelete(null);
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: errorMessage(error) });
      setConfirmDelete(null);
    }
  };

  const extraColumn = useMemo(() => extraFields.find((f) => f.kind === 'select' || f.kind === 'number'), [extraFields]);

  if (rows === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          {rows.length} registro{rows.length === 1 ? '' : 's'}
        </p>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {nuevoLabel}
        </Button>
      </div>

      <div className="card overflow-hidden">
        <Table>
          <THead>
            <Tr>
              <Th>Codigo</Th>
              <Th>Nombre</Th>
              {extraColumn ? <Th>{extraColumn.label}</Th> : null}
              <Th>Estado</Th>
              <Th className="w-32 text-right">Acciones</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-xs text-ink-500">{row.code}</Td>
                <Td className="font-medium">{row.name}</Td>
                {extraColumn ? (
                  <Td className="text-ink-500">
                    {extraColumn.key === 'jobTitleTypeId'
                      ? (row.jobTitleType?.name ?? '—')
                      : (row.annualHoursRequired ?? '—')}
                  </Td>
                ) : null}
                <Td>
                  <StatusPill kind={row.active ? 'ok' : 'neutral'} label={row.active ? 'ACTIVO' : 'INACTIVO'} />
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label={`Editar ${row.name}`}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(row)}>
                      {row.active ? 'Desactivar' : 'Activar'}
                    </Button>
                    {!row.isSystem ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(row)}
                        aria-label={`Eliminar ${row.name}`}
                        className="text-danger"
                      >
                        <Trash2 size={14} />
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? `Editar ${singular}` : nuevoLabel}
        description={editing ? `Codigo: ${editing.code}` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.name.trim() || (!editing && !form.code.trim())}>
              {editing ? 'Guardar cambios' : 'Crear'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <Field
              htmlFor="cat-code"
              label="Codigo"
              hint="Mayusculas, numeros y guion bajo. No se puede cambiar despues."
              required
            >
              <Input
                id="cat-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="EJ_CODIGO"
                maxLength={40}
              />
            </Field>
          ) : null}

          <Field htmlFor="cat-name" label="Nombre" required>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={120}
            />
          </Field>

          {extraFields.map((field) => {
            if (field.kind === 'select') {
              return (
                <Field key={field.key} htmlFor={`cat-${field.key}`} label={field.label} hint={field.hint} required={field.required}>
                  <Select
                    id={`cat-${field.key}`}
                    value={form.jobTitleTypeId}
                    onChange={(e) => setForm({ ...form, jobTitleTypeId: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {(options[field.key] ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            }
            if (field.kind === 'number') {
              return (
                <Field key={field.key} htmlFor={`cat-${field.key}`} label={field.label} hint={field.hint}>
                  <Input
                    id={`cat-${field.key}`}
                    type="number"
                    min={1}
                    max={200}
                    value={form.annualHoursRequired}
                    onChange={(e) => setForm({ ...form, annualHoursRequired: e.target.value })}
                  />
                </Field>
              );
            }
            return (
              <Field key={field.key} htmlFor={`cat-${field.key}`} label={field.label} hint={field.hint}>
                <input
                  id={`cat-${field.key}`}
                  type="color"
                  value={form.colorHex || '#1f3a5f'}
                  onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                  className="h-10 w-16 cursor-pointer rounded-md border border-line bg-surface p-1"
                />
              </Field>
            );
          })}

          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={`Eliminar ${singular}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={doDelete}>
              Eliminar {singular}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">
          Se eliminara <span className="font-semibold">{confirmDelete?.name}</span> de forma permanente. Si esta en
          uso, el sistema lo impedira y debera desactivarse en su lugar.
        </p>
      </Drawer>
    </div>
  );
}
