'use client';

import { Check, Layers, Lock, Plus, Save, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  createRole,
  listCatalog,
  listPermissions,
  listRoles,
  setRoleActivityTypes,
  updateRole,
  type CatalogRow,
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
  programs: 'Programas',
  lessons: 'Lecciones',
  offerings: 'Convocatorias',
  enrollments: 'Ejecución y progreso',
  attendance: 'Asistencia',
  assignments: 'Asignaciones y audiencias',
  plans: 'Plan anual',
  questions: 'Banco de preguntas',
  attempts: 'Evaluaciones',
  certificates: 'Certificados',
  reports: 'Seguimiento y reportes',
  users: 'Usuarios',
  roles: 'Roles',
  config: 'Configuración',
  approvals: 'Aprobaciones',
  audit: 'Auditoria',
  ai: 'Generacion asistida',
};

export default function RolesPage() {
  const { showToast } = useToast();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  /*
    EL SEGUNDO BORRADOR: QUE TIPOS PUEDE TOCAR CADA ROL (2026-09-22).

    Va en la MISMA matriz y no en una pantalla aparte porque es la misma pregunta —«que puede
    hacer este rol»— y porque separarlo obligaria a guardar en dos sitios para configurar una
    cosa. Se lleva en su propio estado porque se guarda por otra ruta: los permisos van en
    `updateRole` y los tipos en `setRoleActivityTypes`.

    **Conjunto vacio = SIN ACOTAR**, que es como nacen todos los roles: ninguna casilla marcada
    quiere decir «puede con todos», no «no puede con ninguno». La pantalla lo dice en voz alta
    debajo de la tabla, porque es lo contrario de lo que sugiere una fila de casillas vacias.
  */
  const [tipoDraft, setTipoDraft] = useState<Record<string, Set<string>>>({});
  const [tipos, setTipos] = useState<CatalogRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ code: '', name: '' });

  const load = useCallback(async () => {
    try {
      const [roleRows, permissionRows, tipoRows] = await Promise.all([
        listRoles(),
        listPermissions(),
        // Los tipos los crea el propio tenant, asi que la matriz se dibuja con los que HAYA.
        listCatalog('activity-types'),
      ]);
      setRoles(roleRows);
      setPermissions(permissionRows);
      setTipos(tipoRows.filter((tipo) => tipo.active));
      setDraft(Object.fromEntries(roleRows.map((role) => [role.id, new Set(role.permissionCodes)])));
      setTipoDraft(Object.fromEntries(roleRows.map((role) => [role.id, new Set(role.activityTypeIds)])));
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
      const tiposActuales = tipoDraft[role.id];
      if (current) {
        if (current.size !== role.permissionCodes.length) return true;
        if (role.permissionCodes.some((code) => !current.has(code))) return true;
      }
      // Los tipos cuentan como cambio igual que los permisos: es el MISMO boton de guardar.
      if (tiposActuales) {
        if (tiposActuales.size !== role.activityTypeIds.length) return true;
        if (role.activityTypeIds.some((id) => !tiposActuales.has(id))) return true;
      }
      return false;
    });
  }, [draft, tipoDraft, roles]);

  const toggleTipo = (roleId: string, tipoId: string) => {
    setTipoDraft((previous) => {
      const next = new Set(previous[roleId] ?? []);
      if (next.has(tipoId)) next.delete(tipoId);
      else next.add(tipoId);
      return { ...previous, [roleId]: next };
    });
  };

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
        if (current) {
          const changed =
            current.size !== role.permissionCodes.length || role.permissionCodes.some((code) => !current.has(code));
          if (changed) await updateRole(role.id, { permissionCodes: [...current] });
        }
        /*
          Los tipos van por su propia ruta y solo si cambiaron: mandar el conjunto entero en cada
          guardado reescribiria las filas de todos los roles —y su `set_by`/`set_at`— cada vez que
          alguien toca una casilla de permisos en otra columna.
        */
        const tiposActuales = tipoDraft[role.id];
        if (tiposActuales) {
          const cambiaron =
            tiposActuales.size !== role.activityTypeIds.length ||
            role.activityTypeIds.some((id) => !tiposActuales.has(id));
          if (cambiaron) await setRoleActivityTypes(role.id, [...tiposActuales]);
        }
      }
      await load();
      showToast({
        kind: 'success',
        title: 'Permisos guardados',
        description: 'Cada persona los recibe en su próxima peticion.',
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
        Configuración
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

            {/*
              ─── QUE TIPOS DE FORMACION PUEDE TOCAR CADA ROL (2026-09-22) ───

              Va en esta misma matriz y no en otra pantalla porque es la misma pregunta: «que puede
              hacer este rol». Separarlo obligaria a ir a dos sitios y guardar dos veces para
              configurar una cosa.

              No son permisos y por eso el grupo lo dice: un permiso es una CAPACIDAD («puede
              publicar») y esto es un AMBITO («sobre que puede»). La diferencia se nota en la regla
              de abajo, que es la contraria a la de un permiso: sin marcar nada, puede con todos.
            */}
            {tipos.length > 0 ? (
              <Fragment key="tipos-de-formacion">
                <tr className="bg-paper">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500"
                  >
                    Tipos de formación que puede tocar
                  </td>
                </tr>
                {tipos.map((tipo) => (
                  <tr key={tipo.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                      <span className="block text-ink-900">{tipo.name}</span>
                      <span className="block font-mono text-[11px] text-ink-300">{tipo.code}</span>
                    </td>
                    {roles.map((role) => {
                      const marcado = tipoDraft[role.id]?.has(tipo.id) ?? false;
                      const sinAcotar = (tipoDraft[role.id]?.size ?? 0) === 0;
                      return (
                        <td key={role.id} className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={marcado}
                            aria-label={`${role.name}: puede crear ${tipo.name}`}
                            title={sinAcotar ? 'Sin acotar: hoy puede con todos los tipos' : undefined}
                            onClick={() => toggleTipo(role.id, tipo.id)}
                            className={cn(
                              'focus-ring inline-flex h-6 w-6 items-center justify-center rounded border transition-colors duration-150',
                              marcado
                                ? 'border-primary bg-primary text-white'
                                : sinAcotar
                                  ? // Sin acotar, las casillas vacias no significan «no puede»: se
                                    // dibujan mas tenues para que no se lean como una prohibicion.
                                    'border-dashed border-line-strong bg-surface hover:border-ink-300'
                                  : 'border-line-strong bg-surface hover:border-ink-300',
                            )}
                          >
                            {marcado ? <Check size={13} strokeWidth={3} /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ) : null}
          </tbody>
        </table>
      </div>

      {tipos.length > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-paper px-4 py-3 text-sm text-ink-700">
          <Layers size={16} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} />
          <p>
            <strong>Sin ninguna casilla marcada, ese rol puede con TODOS los tipos.</strong> Marcar es acotar: en cuanto
            se marca uno, solo podrá crear y ver ese. Para devolverle el acceso a todo, se desmarcan todos.
            {' '}Y si a una persona concreta se le marcan tipos en su ficha, <strong>los suyos mandan sobre los de su
            rol</strong> — igual que con los permisos.
          </p>
        </div>
      ) : null}

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
        description="Nace sin permisos. Se marcan después en la matriz."
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
          <Field htmlFor="r-code" label="Código" required hint="Mayusculas, sin espacios. No se puede cambiar después.">
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
