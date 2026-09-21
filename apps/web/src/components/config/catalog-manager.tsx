'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { frasearUso, leerEnUso, type EnUso } from '@/lib/catalog-en-uso';
import {
  createCatalogRow,
  deleteCatalogRow,
  listCatalog,
  listPickableUsers,
  updateCatalogRow,
  type CatalogKey,
  type CatalogRow,
  type PickableUser,
} from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PersonPicker } from '@/components/ui/person-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { usePaginacion } from '@/components/ui/use-paginacion';

/** Campo extra propio de un catalogo (ademas de code/name). */
export interface ExtraField {
  /** `parentId` es el de las SUB-ÁREAS: de qué área cuelga esta (2026-09-17). */
  key: 'jobTitleTypeId' | 'annualHoursRequired' | 'colorHex' | 'areaId' | 'responsibleUserId' | 'parentId';
  label: string;
  kind: 'select' | 'number' | 'color' | 'user';
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

/**
 * Los campos extra se guardan POR CLAVE y no cada uno con su propiedad.
 *
 * Antes el unico `select` posible escribia siempre en `jobTitleTypeId`, asi que el segundo
 * catalogo que quiso uno —el area responsable de un proceso— guardaba en el campo del primero:
 * elegias un area y se iba al tipo de cargo. El mecanismo decia ser generico y no lo era.
 */
interface FormState {
  code: string;
  name: string;
  extra: Record<string, string>;
}

const EMPTY_FORM: FormState = { code: '', name: '', extra: {} };

const ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_CODE: 'Ya existe un registro con ese código.',
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
  const [people, setPeople] = useState<PickableUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogRow | null>(null);
  /** Por que no se pudo borrar, cuando la API lo impidio. Mantiene el drawer abierto. */
  const [enUso, setEnUso] = useState<EnUso | null>(null);

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
      if (field.kind === 'user') {
        void listPickableUsers().then(setPeople).catch(() => undefined);
      }
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
      extra: {
        jobTitleTypeId: row.jobTitleTypeId ?? '',
        areaId: row.areaId ?? '',
        responsibleUserId: row.responsibleUserId ?? '',
        annualHoursRequired: row.annualHoursRequired ? String(row.annualHoursRequired) : '',
        colorHex: row.colorHex ?? '',
      },
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = { name: form.name.trim() };
    if (!editing) body.code = form.code.trim().toUpperCase();
    for (const field of extraFields) {
      const valor = form.extra[field.key] ?? '';
      if (field.kind === 'number') {
        body[field.key] = valor ? Number(valor) : null;
      } else if (field.required) {
        if (valor) body[field.key] = valor;
      } else {
        // Vacio significa "ninguno", y hay que mandarlo: es como se QUITA un area responsable.
        body[field.key] = valor || null;
      }
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
      /*
        SI ESTA EN USO, EL DRAWER SE QUEDA ABIERTO con el motivo y con la salida.

        Cerrarlo y lanzar un toast rojo dejaba a quien administra donde empezo: sin saber que
        estorba y sin nada que pulsar. Aqui se dice cuantas formaciones lo usan y se ofrece
        desactivarlo, que es lo que de verdad queria hacer.
      */
      const motivo = leerEnUso(error);
      if (motivo) {
        setEnUso(motivo);
        return;
      }
      showToast({ kind: 'danger', title: errorMessage(error) });
      setConfirmDelete(null);
    }
  };

  /** Desactivar desde el drawer del borrado: es la salida que se ofrece cuando esta en uso. */
  const desactivarDesdeDrawer = async () => {
    if (!confirmDelete) return;
    const fila = confirmDelete;
    setConfirmDelete(null);
    setEnUso(null);
    await toggleActive(fila);
  };

  const { visibles: filasVisibles, paginador } = usePaginacion(rows ?? []);

  const extraColumn = useMemo(
    () => extraFields.find((f) => f.kind === 'select' || f.kind === 'number' || f.kind === 'user'),
    [extraFields],
  );

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
              <Th>Código</Th>
              <Th>Nombre</Th>
              {extraColumn ? <Th>{extraColumn.label}</Th> : null}
              <Th>Estado</Th>
              <Th className="w-32 text-right">Acciones</Th>
            </Tr>
          </THead>
          <TBody>
            {filasVisibles.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-xs text-ink-500">{row.code}</Td>
                {/*
                  UNA SUB-ÁREA TIENE QUE VERSE COMO TAL (2026-09-21).

                  Se abrió el árbol de áreas y la lista seguía pintándolas planas: «Nómina» salía
                  igual que «Gestión Humana» y no había forma de saber cuál colgaba de cuál. El
                  cliente lo dijo así: *«¿por qué sale como área general si es una sub-área?»*.

                  Se resuelve en el NOMBRE y no con una columna nueva, por dos razones: es el mismo
                  «Gestión Humana › Nómina» que ya usan los desplegables de Usuarios —una sola forma
                  de decirlo en todo el producto— y una columna más en una tabla de catálogo se
                  gasta en algo que la mayoría de catálogos no tiene.
                */}
                <Td className="font-medium">
                  {row.parentId ? (
                    <>
                      <span className="font-normal text-ink-500">
                        {rows.find((otra) => otra.id === row.parentId)?.name ?? '?'} ›{' '}
                      </span>
                      {row.name}
                    </>
                  ) : (
                    row.name
                  )}
                </Td>
                {extraColumn ? (
                  <Td className="text-ink-500">
                    {extraColumn.key === 'jobTitleTypeId'
                      ? (row.jobTitleType?.name ?? '—')
                      : extraColumn.key === 'areaId'
                        ? (row.area?.name ?? (
                            // Sin area, este proceso es invisible para toda jefatura de area. Es
                            // una tarea de un clic, no una advertencia decorativa: se ofrece
                            // hacerla, pero se DICE la consecuencia, que es lo que nadie sabia.
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              title="Sin area, ninguna jefatura de area ve este proceso en su catálogo"
                              className="focus-ring rounded bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn underline decoration-dotted underline-offset-4"
                            >
                              Sin area
                            </button>
                          ))
                        : extraColumn.key === 'responsibleUserId'
                          ? (row.responsible?.fullName ?? (
                              // Un hueco que se puede llenar de un clic no es una advertencia: es
                              // una tarea. Se ofrece hacerla en vez de pintar el problema de ambar.
                              <button
                                type="button"
                                onClick={() => openEdit(row)}
                                className="focus-ring rounded text-ink-500 underline decoration-dotted underline-offset-4 hover:text-ink-900"
                              >
                                Asignar
                              </button>
                            ))
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
                        onClick={() => {
                          setEnUso(null);
                          setConfirmDelete(row);
                        }}
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
        {paginador}
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
              label="Código"
              hint="Mayusculas, numeros y guion bajo. No se puede cambiar después."
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
                    value={form.extra[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, extra: { ...form.extra, [field.key]: e.target.value } })}
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
            if (field.kind === 'user') {
              return (
                <Field key={field.key} htmlFor={`cat-${field.key}`} label={field.label} hint={field.hint}>
                  {/*
                    Se sugieren los del AREA que se acaba de elegir arriba en este mismo cajon, no
                    los del registro guardado: si estas moviendo el proceso a otra area, los
                    candidatos que quieres ver son los de la nueva.
                  */}
                  <PersonPicker
                    id={`cat-${field.key}`}
                    people={people}
                    suggestedAreaId={form.extra.areaId || null}
                    value={form.extra[field.key] || null}
                    onChange={(personId) =>
                      setForm({ ...form, extra: { ...form.extra, [field.key]: personId ?? '' } })
                    }
                  />
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
                    value={form.extra[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, extra: { ...form.extra, [field.key]: e.target.value } })}
                  />
                </Field>
              );
            }
            return (
              <Field key={field.key} htmlFor={`cat-${field.key}`} label={field.label} hint={field.hint}>
                <input
                  id={`cat-${field.key}`}
                  type="color"
                  value={form.extra[field.key] || '#1f3a5f'}
                  onChange={(e) => setForm({ ...form, extra: { ...form.extra, [field.key]: e.target.value } })}
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
          if (!open) {
            setConfirmDelete(null);
            setEnUso(null);
          }
        }}
        title={enUso ? 'No se puede eliminar' : `Eliminar ${singular}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmDelete(null);
                setEnUso(null);
              }}
            >
              {enUso ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!enUso ? (
              <Button variant="danger" onClick={doDelete}>
                Eliminar {singular}
              </Button>
            ) : confirmDelete?.active ? (
              // Solo si sigue activo: ofrecer desactivar lo que ya esta desactivado es ruido.
              <Button onClick={desactivarDesdeDrawer}>Desactivar {singular}</Button>
            ) : null}
          </div>
        }
      >
        {enUso ? (
          <div className="space-y-3 text-sm text-ink-700">
            <p>
              <span className="font-semibold">{confirmDelete?.name}</span> lo usan{' '}
              <span className="font-semibold">{frasearUso(enUso.usedBy)}</span>. Borrarlo dejaria esos registros
              apuntando a algo que ya no existe, y por eso no se permite.
            </p>
            <p>
              {confirmDelete?.active
                ? `Al desactivarlo deja de ofrecerse de aqui en adelante y lo que ya lo usa se queda como esta. Es lo que se hace cuando ${articulo} ${singular} deja de utilizarse.`
                : `Ya esta desactivado: no se ofrece para elegir y lo que ya lo usa se queda como esta. Para borrarlo del todo habria que quitarlo antes de esos ${enUso.references} registros.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-700">
            Se eliminara <span className="font-semibold">{confirmDelete?.name}</span> de forma permanente. Si esta en
            uso, el sistema lo impedira y debera desactivarse en su lugar.
          </p>
        )}
      </Drawer>
    </div>
  );
}
