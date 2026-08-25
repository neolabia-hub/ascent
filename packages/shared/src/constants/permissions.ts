/**
 * Codigos de permiso de NEO PULSE (CLAUDE.md seccion 7).
 * REGLA DE ORO: los guards evaluan SOLO estos codigos, nunca nombres de rol.
 * El Analista ademas se filtra por analyst_scopes (sus procesos/areas).
 */
export const PERMISSIONS = [
  // Catalogo y contenido formativo
  'catalog:read',
  'catalog:manage_draft',
  'catalog:publish',
  'lessons:manage',
  'ai:generate',

  // Convocatorias y ejecucion
  'offerings:read',
  'offerings:manage',
  'offerings:publish',
  'attendance:take',
  'enrollments:read_all',
  'enrollments:read_scope',
  'enrollments:read_own',
  'enrollments:unblock',

  // Asignacion y plan
  'assignments:manage',
  'audiences:manage',
  'plans:manage',
  'plans:approve',

  // Evaluaciones
  'questions:manage',
  'attempts:grade_manual',
  'attempts:invalidate_question',

  // Certificados
  'certificates:issue',
  'certificates:revoke',
  'certificate_templates:manage',

  // Cumplimiento y reportes
  'reports:read_all',
  'reports:read_scope',
  'reports:export',
  'audit:read',

  // Administracion del tenant
  'users:manage',
  'users:import',
  'roles:manage',
  'users:manage_permissions',
  'config:manage_catalogs',
  'config:manage_tenant',
  'approvals:decide',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

/** Roles semilla del tenant y sus permisos por defecto (el admin puede ajustarlos por UI). */
export const SEED_ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  // Control total del tenant.
  ADMIN: PERMISSIONS,
  // Gestiona la formacion de su area/proceso; publicar y editar lo publicado pasa por aprobacion.
  ANALISTA: [
    'catalog:read',
    'catalog:manage_draft',
    'lessons:manage',
    'ai:generate',
    'offerings:read',
    'offerings:manage',
    'attendance:take',
    'enrollments:read_scope',
    'enrollments:unblock',
    'assignments:manage',
    'plans:manage',
    'questions:manage',
    'attempts:grade_manual',
    'reports:read_scope',
    'reports:export',
  ],
  // Consulta y realiza lo asignado.
  USUARIO: ['enrollments:read_own'],
} as const;
