'use client';

import { Check, Lock, Plus, Save, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  createRole,
  listPermissions,
  listRoles,
  updateRole,
  type PermissionRow,
  type RoleRow,
} from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/**
 * ROLES Y PERMISOS — la matriz.
 *
 * El backend soporta esto desde el Sprint 1; lo que faltaba era la pantalla, y sin ella nadie
 * podia responder la unica pregunta que importa aqui: "este rol, que puede hacer exactamente".
 *
 * Se dibuja como MATRIZ (roles en columnas, capacidades en filas) y no como una lista de casillas
 * por rol: comparar dos roles de un vistazo es justo lo que se necesita al decidir a quien poner
 * en cual, y una lista obliga a abrir y cerrar cuatro veces recordando lo que habia.
 *
 * Los roles semilla (Admin, Analista, Usuario) no se renombran ni se desactivan, pero SI se
 * ajustan sus permisos: cada empresa entiende distinto que puede hacer un analista.
 */

/** Nombres de las categorias en lenguaje de negocio, no de tabla. */
const CATEGORY_LABEL: Record<string, string> = {
  catalog: 'Contenido formativo',
  lessons: 'Lecciones',
  offerings: 'Convocatorias',
  enrollments: 'Ejecucion y progreso',
  attendance: 'Asistencia',
  assignments: 'Asignaciones y audiencias',
  plans: 'Plan anual',
  questions: 'Banco de preguntas',
  attempts: 'Evaluaciones',
  certificates: 'Certificados',
  reports: 'Seguimiento y reportes',
  users: 'Usuarios',
  roles: 'Roles',
  config: 'Configuracion',
  approvals: 'Aprobaciones',
  audit: 'Auditoria',
  ai: 'Generacion asistida',
};

export default function RolesPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ code: '', name: '' });

  const load = useCallback(async () => {
    try {
      const [roleRows, permissionRows] = await Promise.all([listRoles(), listPermissions()]);
      setRoles(roleRows);
      setPermissions(permissionRows);
      setDraft(Object.fromEntries(roleRows.map((role) => [role.id, new Set(role.permissionCodes)])));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los roles', description: motivoDelError(error) });
      setRoles([]);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const permission of permissions) {
      map.set(permission.category, [...(map.get(permission.category) ?? []), permission]);
    }
    return [...map.entries()].sort(([a], [b]) => (CATEGORY_LABEL[a] ?? a).localeCompare(CATEGORY_LABEL[b] ?? b, 'es'));
  }, [permissions]);

  const dirty = useMemo(() => {
    if (!roles) return false;
    return roles.some((role) => {
      const current = draft[role.id];
      if (!current) return false;
      if (current.size !== role.permissionCodes.length) return true;
      return role.permissionCodes.some((code) => !current.has(code));
    });
  }, [draft, roles]);

  const toggle = (roleId: string, code: string) => {
    setDraft((previous) => {
      const next = new Set(previous[roleId] ?? []);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...previous, [roleId]: next };
    });
  };

  const save = async () => {
    if (!roles) return;
    setSaving(true);
    try {
      for (const role of roles) {
        const current = draft[role.id];
        if (!current) continue;
        const changed =
          current.size !== role.permissionCodes.length || role.permissionCodes.some((code) => !current.has(code));
        if (changed) await updateRole(role.id, { permissionCodes: [...current] });
      }
      await load();
      showToast({
        kind: 'success',
        title: 'Permisos guardados',
        description: 'Cada persona los recibe en su proxima peticion.',
      });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError ? error.message : 'No se pudieron guardar los permisos',
      });
    } finally {
      setSaving(false);
    }
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      await createRole({ code: newRole.code.trim().toUpperCase(), name: newRole.name.trim(), permissionCodes: [] });
      setCreateOpen(false);
      setNewRole({ code: '', name: '' });
      await load();
      showToast({ kind: 'success', title: 'Rol creado', description: 'Ahora marca lo que puede hacer.' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.code === 'DUPLICATE_CODE' ? 'Ya existe un rol con ese codigo.' : 'No se pudo crear el rol',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!roles) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <Link
        href="/configuracion"
        className="focus-ring mb-4 inline-block text-sm text-ink-500 hover:text-ink-700"
      >
        Configuracion
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Roles y permisos</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Que puede hacer cada rol, en una sola vista. Los permisos se conceden por ROL; las excepciones para una
            persona concreta se ponen en su ficha, en Usuarios.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nuevo rol
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
            <Save size={16} />
            Guardar cambios
          </Button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-medium text-ink-500">
                Puede...
              </th>
              {roles.map((role) => (
                <th key={role.id} className="px-4 py-3 text-center">
                  <span className="block font-medium text-ink-900">{role.name}</span>
                  <span className="mt-0.5 flex items-center justify-center gap-1.5 text-xs font-normal text-ink-500">
                    {role.isSystem ? <Lock size={11} aria-label="Rol del sistema" /> : null}
                    {role.userCount} {role.userCount === 1 ? 'persona' : 'personas'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([category, rows]) => (
              <Fragment key={category}>
                <tr className="bg-paper">
                  <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">
                    {CATEGORY_LABEL[category] ?? category}
                  </td>
                </tr>
                {rows.map((permission) => (
                  <tr key={permission.code} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                      <span className="block text-ink-900">{permission.description}</span>
                      <span className="block font-mono text-[11px] text-ink-300">{permission.code}</span>
                    </td>
                    {roles.map((role) => {
                      const checked = draft[role.id]?.has(permission.code) ?? false;
                      return (
                        <td key={role.id} className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={`${role.name}: ${permission.description}`}
                            onClick={() => toggle(role.id, permission.code)}
                            className={cn(
                              'focus-ring inline-flex h-6 w-6 items-center justify-center rounded border transition-colors duration-150',
                              checked ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface hover:border-ink-300',
                            )}
                          >
                            {checked ? <Check size={13} strokeWidth={3} /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
        <p>
          El rol del sistema no se puede renombrar ni desactivar, pero sus permisos SI se ajustan: cada empresa
          entiende distinto que puede hacer un analista. Quitarle a un rol un permiso afecta de inmediato a las{' '}
          {roles.reduce((total, role) => total + role.userCount, 0)} personas que lo tienen.
        </p>
      </div>

      <Drawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo rol"
        description="Nace sin permisos. Se marcan despues en la matriz."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void doCreate()}
              loading={saving}
              disabled={newRole.code.trim().length < 2 || newRole.name.trim().length < 3}
            >
              Crear rol
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="r-code" label="Codigo" required hint="Mayusculas, sin espacios. No se puede cambiar despues.">
            <Input
              id="r-code"
              value={newRole.code}
              maxLength={40}
              onChange={(event) => setNewRole({ ...newRole, code: event.target.value.toUpperCase().replace(/\s/g, '_') })}
            />
          </Field>
          <Field htmlFor="r-name" label="Nombre" required hint="Es lo que se ve al asignar el rol a una persona.">
            <Input id="r-name" value={newRole.name} maxLength={80} onChange={(event) => setNewRole({ ...newRole, name: event.target.value })} />
          </Field>
        </div>
      </Drawer>

      {dirty ? (
        <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-5 py-3 shadow-card-hover">
            <StatusPill kind="warn" label="SIN GUARDAR" />
            <Button size="sm" onClick={() => void save()} loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
