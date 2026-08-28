'use client';

import { Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  getUser,
  listPermissions,
  listRoles,
  setUserOverrides,
  type PermissionRow,
  type UserRow,
} from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * PERMISOS DE UNA PERSONA: lo que le da su rol, mas las EXCEPCIONES suyas.
 *
 * Existe por lo que pasa de verdad en una empresa: alguien se va de vacaciones y hay que dejar
 * que otro apruebe por dos semanas; un analista concreto necesita publicar; alguien deja de poder
 * borrar. Cambiar el rol entero para eso afectaria a todos los que lo tienen.
 *
 * Tres estados por capacidad, y la diferencia importa:
 *   - HEREDADO: manda el rol. Si el rol cambia, esta persona cambia con el.
 *   - CONCEDIDO: excepcion que la SUMA aunque el rol no la tenga.
 *   - RETIRADO: excepcion que la QUITA aunque el rol si la tenga.
 *
 * Se muestra siempre lo que da el rol al lado, porque una excepcion sin ese contexto no se puede
 * juzgar: "conceder" algo que el rol ya daba es ruido, y quien lo lea despues no sabra por que.
 */

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
  reports: 'Reportes',
  users: 'Usuarios',
  roles: 'Roles',
  config: 'Configuracion',
  approvals: 'Aprobaciones',
  audit: 'Auditoria',
  ai: 'Generacion asistida',
};

type State = 'inherited' | 'granted' | 'revoked';

export function UserPermissionsDrawer({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, State>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [permissionRows, roles, detail] = await Promise.all([listPermissions(), listRoles(), getUser(user.id)]);
      setPermissions(permissionRows);
      const role = roles.find((row) => row.id === detail.role.id);
      setRolePermissions(new Set(role?.permissionCodes ?? []));
      setStates(
        Object.fromEntries(
          detail.overrides.map((override) => [override.permission.code, override.granted ? 'granted' : 'revoked']),
        ),
      );
    } catch {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los permisos' });
    } finally {
      setLoading(false);
    }
  }, [showToast, user]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const permission of permissions) {
      map.set(permission.category, [...(map.get(permission.category) ?? []), permission]);
    }
    return [...map.entries()].sort(([a], [b]) => (CATEGORY_LABEL[a] ?? a).localeCompare(CATEGORY_LABEL[b] ?? b, 'es'));
  }, [permissions]);

  const overrideCount = Object.values(states).filter((state) => state !== 'inherited').length;

  const setState = (code: string, state: State) => {
    setStates((previous) => {
      const next = { ...previous };
      if (state === 'inherited') delete next[code];
      else next[code] = state;
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setUserOverrides(
        user.id,
        Object.entries(states).map(([permissionCode, state]) => ({ permissionCode, granted: state === 'granted' })),
      );
      onOpenChange(false);
      showToast({
        kind: 'success',
        title: overrideCount === 0 ? 'Excepciones retiradas' : `${overrideCount} ${overrideCount === 1 ? 'excepcion guardada' : 'excepciones guardadas'}`,
        description: 'Aplican en la proxima peticion de esa persona.',
      });
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof ApiError ? error.message : 'No se pudieron guardar' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Permisos de ${user.fullName}` : 'Permisos'}
      description={user ? `Rol: ${user.role.name}. Aqui se ponen solo las excepciones a ese rol.` : undefined}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-ink-500">
            {overrideCount === 0 ? 'Sin excepciones' : `${overrideCount} ${overrideCount === 1 ? 'excepcion' : 'excepciones'}`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Guardar
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-5">
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Lo normal es dejarlo todo heredado. Una excepcion es para una novedad concreta —una suplencia, un permiso
            temporal— y conviene revisarla cuando la novedad termine.
          </p>

          {grouped.map(([category, rows]) => (
            <Fragment key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-500">
                {CATEGORY_LABEL[category] ?? category}
              </h3>
              <ul className="space-y-2">
                {rows.map((permission) => {
                  const fromRole = rolePermissions.has(permission.code);
                  const state = states[permission.code] ?? 'inherited';
                  const effective = state === 'granted' || (state === 'inherited' && fromRole);

                  return (
                    <li key={permission.code} className="rounded-lg border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-ink-900">{permission.description}</p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            El rol {fromRole ? 'lo concede' : 'no lo concede'} ·{' '}
                            <span className={cn('font-medium', effective ? 'text-ok' : 'text-ink-500')}>
                              {effective ? 'Puede hacerlo' : 'No puede'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={permission.description}>
                        <StateButton
                          active={state === 'inherited'}
                          onClick={() => setState(permission.code, 'inherited')}
                          icon={RotateCcw}
                          label="Heredado"
                        />
                        <StateButton
                          active={state === 'granted'}
                          onClick={() => setState(permission.code, 'granted')}
                          icon={Plus}
                          label="Conceder"
                          disabled={fromRole && state !== 'granted'}
                          hint={fromRole ? 'El rol ya lo concede' : undefined}
                        />
                        <StateButton
                          active={state === 'revoked'}
                          onClick={() => setState(permission.code, 'revoked')}
                          icon={Minus}
                          label="Retirar"
                          disabled={!fromRole && state !== 'revoked'}
                          hint={!fromRole ? 'El rol no lo concede' : undefined}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Fragment>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function StateButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Check;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      title={disabled ? hint : undefined}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-primary bg-primary-soft font-medium text-ink-900' : 'border-line text-ink-500 hover:text-ink-700',
      )}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </button>
  );
}
