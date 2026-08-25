'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, KeyRound, Pencil, Plus, Search, Upload, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  createUser,
  downloadImportTemplate,
  importUsers,
  listCatalog,
  listUsers,
  resetUserPassword,
  updateUser,
  type CatalogRow,
  type CreateUserBody,
  type ImportResult,
  type UserRow,
  type UsersPage,
} from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 20;

const EMPTY_FORM: CreateUserBody = {
  documentNumber: '',
  fullName: '',
  email: '',
  emailKind: 'PERSONAL',
  jobTitleId: '',
  areaId: '',
  roleCode: 'USUARIO',
  employmentType: 'DIRECTO',
};

function apiErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const map: Record<string, string> = {
      DUPLICATE_DOCUMENT: 'Ya existe una persona con ese documento.',
      DUPLICATE_EMAIL: 'Ya existe una persona con ese correo.',
      VALIDATION_ERROR: 'Revisa los campos marcados.',
    };
    return map[error.code] ?? error.message;
  }
  return 'Ocurrio un error. Intenta de nuevo.';
}

export default function PersonasPage() {
  const { showToast } = useToast();

  // Filtros y datos
  const [q, setQ] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersPage | null>(null);
  const [areas, setAreas] = useState<CatalogRow[]>([]);
  const [jobTitles, setJobTitles] = useState<CatalogRow[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);

  // Drawer crear/editar
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState<CreateUserBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Credencial generada (se muestra UNA vez)
  const [credential, setCredential] = useState<{ name: string; document: string; password: string } | null>(null);

  // Importacion
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listUsers({ q: q || undefined, areaId: areaFilter || undefined, page, pageSize: PAGE_SIZE });
      setData(result);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar el listado de personas' });
    }
  }, [q, areaFilter, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCatalog('areas').then((r) => setAreas(r.filter((a) => a.active)));
    void listCatalog('job-titles').then((r) => setJobTitles(r.filter((a) => a.active)));
    void listCatalog('regionals').then((r) => setRegionals(r.filter((a) => a.active)));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setForm({
      documentNumber: user.documentNumber,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      emailKind: user.emailKind,
      jobTitleId: user.jobTitle.id,
      areaId: user.area.id,
      regionalId: user.regional?.id ?? null,
      roleCode: user.role.code as CreateUserBody['roleCode'],
      hiredAt: user.hiredAt ? user.hiredAt.slice(0, 10) : null,
      employmentType: user.employmentType,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const { documentNumber: _doc, ...rest } = form;
        await updateUser(editing.id, rest);
        showToast({ kind: 'success', title: 'Persona actualizada' });
      } else {
        const result = await createUser(form);
        if (result.generatedPassword) {
          setCredential({ name: form.fullName, document: form.documentNumber, password: result.generatedPassword });
        }
        showToast({ kind: 'success', title: 'Persona creada' });
      }
      setDrawerOpen(false);
      await load();
    } catch (error) {
      setFormError(apiErrorText(error));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (user: UserRow) => {
    try {
      const { generatedPassword } = await resetUserPassword(user.id);
      setCredential({ name: user.fullName, document: user.documentNumber, password: generatedPassword });
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    }
  };

  const toggleActive = async (user: UserRow) => {
    try {
      await updateUser(user.id, { active: !user.active });
      showToast({ kind: 'success', title: user.active ? `Cuenta de ${user.fullName} desactivada` : `Cuenta de ${user.fullName} activada` });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: apiErrorText(error) });
    }
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importUsers(file);
      setImportResult(result);
      showToast({
        kind: result.failed === 0 ? 'success' : 'warning',
        title: `Importacion terminada: ${result.ok} creadas, ${result.failed} con error`,
      });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof Error ? error.message : 'Error al importar' });
    } finally {
      setImporting(false);
    }
  };

  const copyImportPasswords = async () => {
    if (!importResult) return;
    const lines = importResult.rows
      .filter((r) => r.status === 'OK' && r.generatedPassword)
      .map((r) => `${r.documento}\t${r.generatedPassword}`);
    await navigator.clipboard.writeText(`documento\tcontrasena\n${lines.join('\n')}`);
    showToast({ kind: 'success', title: 'Contrasenas copiadas al portapapeles', description: 'Entregalas de forma segura. No se pueden volver a consultar.' });
  };

  const formValid = useMemo(
    () =>
      form.fullName.trim().length >= 3 &&
      form.email.includes('@') &&
      form.jobTitleId !== '' &&
      form.areaId !== '' &&
      (editing !== null || form.documentNumber.trim().length >= 5),
    [form, editing],
  );

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Personas</h1>
          <p className="mt-1 text-sm text-ink-500">Colaboradores del tenant: cuentas, cargos, areas y acceso.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportResult(null); setImportOpen(true); }}>
            <Upload size={16} />
            Importar
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} />
            Nueva persona
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, documento o correo"
            className="w-72 pl-9"
          />
        </div>
        <Select value={areaFilter} onChange={(e) => { setAreaFilter(e.target.value); setPage(1); }} className="w-56">
          <option value="">Todas las areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={UserRound}
            title="Sin personas todavia"
            description="Crea la primera persona o carga el archivo masivo con la plantilla."
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                Nueva persona
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
                  <Th>Persona</Th>
                  <Th>Documento</Th>
                  <Th>Cargo</Th>
                  <Th>Area</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                  <Th className="w-36 text-right">Acciones</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{user.fullName}</div>
                      <div className="text-xs text-ink-500">{user.email}</div>
                    </Td>
                    <Td className="font-mono text-xs">{user.documentNumber}</Td>
                    <Td className="text-ink-700">{user.jobTitle.name}</Td>
                    <Td className="text-ink-700">{user.area.name}</Td>
                    <Td className="text-ink-500">{user.role.name}</Td>
                    <Td>
                      <StatusPill kind={user.active ? 'ok' : 'neutral'} label={user.active ? 'ACTIVA' : 'INACTIVA'} />
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(user)} aria-label={`Editar ${user.fullName}`}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => resetPassword(user)} aria-label={`Nueva contrasena para ${user.fullName}`} title="Generar nueva contrasena">
                          <KeyRound size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(user)}>
                          {user.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <TablePagination
            from={from}
            to={to}
            total={data.total}
            canPrevious={page > 1}
            canNext={to < data.total}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      {/* Drawer crear/editar */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editing ? 'Editar persona' : 'Nueva persona'}
        description={editing ? `Documento: ${editing.documentNumber}` : 'La contrasena inicial se genera automaticamente (cedula + caracteres).'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button onClick={save} loading={saving} disabled={!formValid}>
              {editing ? 'Guardar cambios' : 'Crear persona'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editing ? (
            <Field htmlFor="u-doc" label="Cedula / documento" required hint="Sera su usuario de ingreso.">
              <Input id="u-doc" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value.trim() })} maxLength={20} />
            </Field>
          ) : null}
          <Field htmlFor="u-name" label="Nombre completo" required>
            <Input id="u-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-email" label="Correo" required hint="Personal o corporativo; se puede cambiar despues sin perder el historial.">
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} />
            </Field>
            <Field htmlFor="u-emailkind" label="Tipo de correo">
              <Select id="u-emailkind" value={form.emailKind} onChange={(e) => setForm({ ...form, emailKind: e.target.value as 'PERSONAL' | 'CORPORATE' })}>
                <option value="PERSONAL">Personal</option>
                <option value="CORPORATE">Corporativo</option>
              </Select>
            </Field>
          </div>
          <Field htmlFor="u-phone" label="Telefono">
            <Input id="u-phone" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} maxLength={20} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-job" label="Cargo" required>
              <Select id="u-job" value={form.jobTitleId} onChange={(e) => setForm({ ...form, jobTitleId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {jobTitles.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="u-area" label="Area" required>
              <Select id="u-area" value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-regional" label="Regional">
              <Select id="u-regional" value={form.regionalId ?? ''} onChange={(e) => setForm({ ...form, regionalId: e.target.value || null })}>
                <option value="">Sin regional</option>
                {regionals.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="u-role" label="Rol en la plataforma">
              <Select id="u-role" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value as CreateUserBody['roleCode'] })}>
                <option value="USUARIO">Usuario</option>
                <option value="ANALISTA">Analista</option>
                <option value="ADMIN">Administrador</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="u-hired" label="Fecha de ingreso" hint="Dispara la induccion previa al inicio.">
              <Input id="u-hired" type="date" value={form.hiredAt ?? ''} onChange={(e) => setForm({ ...form, hiredAt: e.target.value || null })} />
            </Field>
            <Field htmlFor="u-emp" label="Vinculacion">
              <Select id="u-emp" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                <option value="DIRECTO">Directo</option>
                <option value="CONTRATISTA">Contratista</option>
                <option value="TEMPORAL">Temporal</option>
                <option value="EN_MISION">En mision</option>
              </Select>
            </Field>
          </div>
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
          ) : null}
        </div>
      </Drawer>

      {/* Credencial generada — se muestra UNA vez */}
      <Drawer
        open={credential !== null}
        onOpenChange={(open) => { if (!open) setCredential(null); }}
        title="Contrasena generada"
        description="Se muestra una sola vez. Entregala de forma segura; en el primer ingreso el sistema exige cambiarla."
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setCredential(null)}>Entendido</Button>
          </div>
        }
      >
        {credential ? (
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-sm text-ink-500">{credential.name}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-ink-300">Usuario</p>
              <p className="font-mono text-lg">{credential.document}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-ink-300">Contrasena temporal</p>
              <p className="font-mono text-lg">{credential.password}</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(`Usuario: ${credential.document}\nContrasena: ${credential.password}`);
                showToast({ kind: 'success', title: 'Credencial copiada' });
              }}
            >
              <Copy size={16} />
              Copiar credencial
            </Button>
          </div>
        ) : null}
      </Drawer>

      {/* Importacion masiva */}
      <Drawer
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar personas"
        description="Archivo CSV o XLSX con la plantilla. Las filas validas se crean aunque otras tengan errores."
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cerrar</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Button variant="outline" onClick={() => void downloadImportTemplate()}>
            <Download size={16} />
            Descargar plantilla
          </Button>

          <Field htmlFor="import-file" label="Archivo" hint="CSV (separado por ; o ,) o XLSX. Maximo 2000 filas.">
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
                e.target.value = '';
              }}
              className="focus-ring block w-full cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-paper file:px-3 file:py-1 file:text-sm"
            />
          </Field>

          {importing ? <Skeleton className="h-24 w-full" /> : null}

          {importResult ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <StatusPill kind="ok" label={`${importResult.ok} CREADAS`} />
                <StatusPill kind={importResult.failed > 0 ? 'danger' : 'neutral'} label={`${importResult.failed} CON ERROR`} />
              </div>
              {importResult.ok > 0 ? (
                <Button variant="outline" size="sm" onClick={copyImportPasswords}>
                  <Copy size={14} />
                  Copiar contrasenas generadas
                </Button>
              ) : null}
              <div className="max-h-64 overflow-y-auto rounded-md border border-line">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Fila</Th>
                      <Th>Documento</Th>
                      <Th>Resultado</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {importResult.rows.map((row) => (
                      <Tr key={row.rowNumber}>
                        <Td className="text-ink-500">{row.rowNumber}</Td>
                        <Td className="font-mono text-xs">{row.documento}</Td>
                        <Td>
                          {row.status === 'OK' ? (
                            <span className="text-sm text-ok">OK{row.generatedPassword ? ` — clave: ${row.generatedPassword}` : ''}</span>
                          ) : (
                            <span className="text-sm text-danger">{row.error}</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
              <p className="text-xs text-ink-500">
                Las contrasenas generadas se muestran UNA sola vez. Copialas antes de cerrar este panel.
              </p>
            </div>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
