import type { PermissionCode } from '../../../packages/shared/src/constants/permissions.js';

/**
 * COMO SE LLAMA CADA PERMISO EN LA PANTALLA DE PERMISOS.
 *
 * Vive aparte del seed desde el 2026-09-22, y por un motivo concreto: el script
 * `dev:sincronizar-permisos` —el que agrega los codigos nuevos sin pisar lo que el cliente
 * configuro— creaba las filas con `description: 'Permiso programs:read'`. O sea que los permisos
 * llegados por seed se leian en español y los llegados por el script se leian como una fila de
 * tabla, en la misma columna de la misma pantalla. Ahora los dos leen de aqui.
 *
 * Si un codigo de `PERMISSIONS` no tiene texto, `descripcionDePermiso` compone uno para no romper
 * nada — pero es un texto de relleno: lo que se ve bien es el curado.
 */
export const PERMISSION_DESCRIPTIONS: Partial<Record<PermissionCode, string>> = {
  'catalog:read': 'Consultar el catalogo de actividades formativas',
  'catalog:manage_draft': 'Crear y editar borradores de actividades formativas',
  'catalog:publish': 'Publicar versiones de actividades formativas',
  'lessons:manage': 'Crear y editar lecciones (tarjetas)',
  'ai:generate': 'Generar borradores de contenido con inteligencia artificial',

  'programs:read': 'Consultar los programas de formacion',
  'programs:manage': 'Crear y editar programas de formacion (armar sus modulos)',
  'programs:publish': 'Publicar y despublicar programas (cambia la constancia de sus modulos)',

  'offerings:read': 'Consultar convocatorias',
  'offerings:manage': 'Crear y editar convocatorias',
  'offerings:publish': 'Publicar convocatorias',
  'attendance:take': 'Registrar asistencia en convocatorias presenciales',
  'enrollments:read_all': 'Ver las inscripciones de todo el tenant',
  'enrollments:read_scope': 'Ver las inscripciones de su ambito (procesos/areas asignados)',
  'enrollments:read_own': 'Ver sus propias inscripciones',
  'enrollments:unblock': 'Rehabilitar inscripciones bloqueadas por intentos agotados',

  'assignments:manage': 'Crear y gestionar asignaciones de formacion',
  'audiences:manage': 'Crear y gestionar audiencias (reglas de segmentacion)',
  'plans:manage': 'Crear y editar el plan de capacitacion',
  'plans:approve': 'Aprobar el plan de capacitacion',

  'questions:manage': 'Crear y editar el banco de preguntas',
  'attempts:grade_manual': 'Calificar manualmente intentos de evaluacion',
  'attempts:invalidate_question': 'Anular una pregunta e invalidar las respuestas asociadas',

  'certificates:issue': 'Emitir certificados',
  'certificates:revoke': 'Revocar certificados emitidos',
  'certificate_templates:manage': 'Crear y editar plantillas de certificado',

  // Desempeño es de Gestion Humana y no del catalogo formativo: son dos confidencialidades
  // distintas. Calificar no esta aqui porque no se autoriza por permiso sino por identidad —solo
  // el evaluador asignado abre esa evaluacion—.
  'performance:manage': 'Administrar ciclos y evaluaciones de desempeño',
  'performance:read_all': 'Ver las evaluaciones de desempeño de todo el tenant',
  'performance:read_own': 'Ver su propia evaluacion de desempeño',

  'reports:read_all': 'Ver reportes de todo el tenant',
  'reports:read_scope': 'Ver reportes de su ambito (procesos/areas asignados)',
  'reports:export': 'Exportar reportes',
  'audit:read': 'Consultar el log de auditoria',

  'users:manage': 'Crear y editar usuarios',
  'users:import': 'Importar usuarios de forma masiva',
  'roles:manage': 'Crear y editar roles y sus permisos',
  'users:manage_permissions': 'Asignar o revocar permisos individuales a usuarios',
  'attendance:sign': 'Registrar la propia asistencia: escanear el QR de la sesion y firmar en pantalla',
  'config:manage_catalogs': 'Administrar catalogos del tenant (areas, cargos, regionales, normas...)',
  'config:manage_tenant': 'Administrar la configuracion general del tenant',
  'approvals:decide': 'Aprobar o rechazar solicitudes de aprobacion',
};

/** Categoria de un permiso: el prefijo antes de ":" (p. ej. "catalog:read" -> "catalog"). */
export function categoriaDePermiso(code: string): string {
  const [category] = code.split(':');
  return category;
}

/** Texto de respaldo si un codigo de PERMISSIONS todavia no tiene descripcion curada arriba. */
function descripcionDeRespaldo(code: string): string {
  const [category, action] = code.split(':');
  return `Permite ${action.replace(/_/g, ' ')} en el modulo ${category}`;
}

export function descripcionDePermiso(code: PermissionCode): string {
  return PERMISSION_DESCRIPTIONS[code] ?? descripcionDeRespaldo(code);
}
