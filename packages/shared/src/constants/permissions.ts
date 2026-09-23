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

  /*
    PROGRAMAS, CON PERMISOS PROPIOS (2026-09-22).

    Hasta hoy Programas usaba los del catalogo, asi que **quien podia crear una formacion veia y
    tocaba los programas**. No habia forma de quitarselos sin quitarle tambien el catalogo, y el
    cliente lo pidio expreso: *"programa no pueden, solo seguimiento, inicio, convocatorias"*.

    Son tres y no uno porque el reparto es el mismo del catalogo y por el mismo motivo: ver, armar
    y sacar a la gente son decisiones distintas. Publicar un programa **apaga la constancia
    individual de todos sus modulos**: no es «guardar».
  */
  'programs:read',
  'programs:manage',
  'programs:publish',

  // Convocatorias y ejecucion
  'offerings:read',
  'offerings:manage',
  'offerings:publish',
  'attendance:take',
  /*
    FIRMAR LA PROPIA ASISTENCIA (2026-09-08, mecanismos 2 y 3 de la evidencia).

    Es de TODO usuario autenticado y sobre lo SUYO: escanear el QR de la sesion o firmar en su
    telefono. Va aparte de attendance:take —que es tomar la lista de los demas— porque son dos
    potestades distintas: quien firma su asistencia no puede marcar la de nadie mas, y quien toma la
    lista no lo necesita para hacerlo.

    El servidor no se fia solo del permiso: cada operacion escribe sobre la persona de la SESION y
    nunca sobre la que venga en el cuerpo. Un permiso 'de todos' que ademas dejara elegir a quien
    marcar seria un permiso de instructor con otro nombre.
  */
  'attendance:sign',
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

  /*
    DESEMPENO — permisos PROPIOS, y no reutilizar los de formacion.

    Lo que un jefe escribe sobre una persona no lo puede leer quien administra el catalogo
    formativo. `reports:read_all` sirve para los indicadores de capacitacion y no alcanza aqui: son
    dos universos con dos confidencialidades distintas, y el cliente pidio expresamente que no se
    mezclen.

    Falta `performance:evaluate` a proposito: calificar no se autoriza por permiso sino por
    IDENTIDAD —solo el evaluador asignado a esa evaluacion puede abrirla—. Un permiso global de
    "evaluar" dejaria a cualquiera con el rol calificando a cualquiera.
  */
  'performance:manage',
  'performance:read_all',
  'performance:read_own',

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

/**
 * LOS PERMISOS QUE SOLO ALCANZAN A LO PROPIO.
 *
 * Tener unicamente permisos de esta lista significa: esta persona no administra nada. De ahi
 * cuelgan dos decisiones de la interfaz, y las dos se equivocaron a la vez el 2026-09-10:
 *
 *   1. A DONDE ENTRA al iniciar sesion. Quien solo tiene lo suyo va a `/hoy`; mandarlo al panel
 *      de administracion es mandarlo a una pantalla donde todo esta prohibido.
 *   2. SI VE EL CONMUTADOR de vuelta al panel. Para el 95% del personal operativo la superficie
 *      del aprendiz es la unica que existe, y una puerta de mas es una pantalla prohibida a un
 *      toque.
 *
 * QUE PASO. La lista vivia suelta en `apps/web/src/lib/landing.ts` y tenia UN elemento,
 * `enrollments:read_own`. Cuando el rol Usuario crecio a tres permisos —le llegaron
 * `performance:read_own` (ver su evaluacion de desempeno) y `attendance:sign` (firmar su propia
 * asistencia)— nadie volvio a mirar esa lista. A partir de ese dia, **un conductor iniciaba sesion
 * y aterrizaba en el panel de administracion**, y ademas le salia el conmutador. Ninguna de las
 * dos cosas dio error: las dos "funcionaban".
 *
 * POR QUE AHORA VIVE AQUI Y NO ALLI. Al lado del catalogo de permisos, que es lo unico que la
 * puede dejar vieja. Y se DERIVA en vez de escribirse: todo lo que acabe en `:read_own` entra
 * solo, asi que un permiso nuevo de esa forma no hay que acordarse de clasificarlo. Lo que no
 * sigue el patron se declara a mano, abajo, con su motivo.
 *
 * Y hay una prueba que lo sujeta: `apps/api/src/auth/aprendiz-solo.spec.ts` falla si el rol
 * Usuario de la semilla deja de ser enteramente "de lo suyo". Es la comprobacion que faltaba.
 */
const PROPIOS_QUE_NO_SIGUEN_EL_PATRON = new Set<PermissionCode>([
  // Firmar SU asistencia (escanear el QR de la sesion, firmar en su telefono). Es de todo usuario
  // autenticado y sobre si mismo; tomar la lista de los demas es `attendance:take`, que es otro.
  'attendance:sign',
]);

export const LEARNER_ONLY_PERMISSIONS: readonly PermissionCode[] = PERMISSIONS.filter(
  (permission) => permission.endsWith(':read_own') || PROPIOS_QUE_NO_SIGUEN_EL_PATRON.has(permission),
);

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
    'attendance:sign',
    'enrollments:read_scope',
    'enrollments:unblock',
    'assignments:manage',
    'plans:manage',
    'questions:manage',
    'attempts:grade_manual',
    'reports:read_scope',
    'reports:export',
    // El analista NO gestiona desempeno: es de Gestion Humana. Ve lo suyo, como todo el mundo.
    'performance:read_own',
  ],
  // Consulta y realiza lo asignado. Lo suyo de desempeno tambien es suyo.
  USUARIO: ['enrollments:read_own', 'performance:read_own', 'attendance:sign'],
} as const;
