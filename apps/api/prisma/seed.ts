// NEO PULSE — Seed del tenant piloto TRANSPRENSA.
//
// Idempotente: toda entidad se crea con upsert sobre su clave unica (o se borra/reinserta
// cuando la clave es compuesta y no aporta valor como llave de negocio, caso de
// role_permissions). Correr este script varias veces deja el mismo resultado.
//
// Corre como OWNER de la base de datos (DIRECT_DATABASE_URL): sin RLS. Es el unico punto
// del sistema que crea el primer tenant, antes de que exista cualquier sesion autenticada.
//
// Ejecucion: pnpm --filter @neo-pulse/api db:seed (tsx sobre este archivo).

import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

import {
  PERMISSIONS,
  SEED_ROLE_PERMISSIONS,
  type PermissionCode,
} from '../../../packages/shared/src/constants/permissions.js';
import {
  tenantBrandingSchema,
  tenantSettingsSchema,
} from '../../../packages/shared/src/schemas/tenant-settings.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

const TENANT_SLUG = 'transprensa';
const ADMIN_DOCUMENT_NUMBER = '999999999';
const ADMIN_PASSWORD = 'Transprensa2026*';

// ─────────────────────────────── Utilidades ───────────────────────────────

interface CatalogSeedItem {
  code: string;
  name: string;
}

/** Categoria de un permiso: el prefijo antes de ":" (p. ej. "catalog:read" -> "catalog"). */
function permissionCategory(code: string): string {
  const [category] = code.split(':');
  return category;
}

/** Descripcion de respaldo si un codigo de PERMISSIONS no tiene texto curado abajo. */
function fallbackPermissionDescription(code: string): string {
  const [category, action] = code.split(':');
  return `Permite ${action.replace(/_/g, ' ')} en el modulo ${category}`;
}

// Descripciones curadas en espanol para el catalogo de permisos (mejor calidad que un
// texto generado). Si en el futuro se agrega un permiso nuevo a PERMISSIONS sin entrada
// aqui, se usa fallbackPermissionDescription para no romper el seed.
const PERMISSION_DESCRIPTIONS: Partial<Record<PermissionCode, string>> = {
  'catalog:read': 'Consultar el catalogo de actividades formativas',
  'catalog:manage_draft': 'Crear y editar borradores de actividades formativas',
  'catalog:publish': 'Publicar versiones de actividades formativas',
  'lessons:manage': 'Crear y editar lecciones (tarjetas)',
  'ai:generate': 'Generar borradores de contenido con inteligencia artificial',

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

  'reports:read_all': 'Ver reportes de todo el tenant',
  'reports:read_scope': 'Ver reportes de su ambito (procesos/areas asignados)',
  'reports:export': 'Exportar reportes',
  'audit:read': 'Consultar el log de auditoria',

  'users:manage': 'Crear y editar usuarios',
  'users:import': 'Importar usuarios de forma masiva',
  'roles:manage': 'Crear y editar roles y sus permisos',
  'users:manage_permissions': 'Asignar o revocar permisos individuales a usuarios',
  'config:manage_catalogs': 'Administrar catalogos del tenant (areas, cargos, regionales, normas...)',
  'config:manage_tenant': 'Administrar la configuracion general del tenant',
  'approvals:decide': 'Aprobar o rechazar solicitudes de aprobacion',
};

function permissionDescription(code: PermissionCode): string {
  return PERMISSION_DESCRIPTIONS[code] ?? fallbackPermissionDescription(code);
}

// ─────────────────────────────── 1. Tenant ───────────────────────────────

async function seedTenant(): Promise<{ id: string; slug: string }> {
  const settings = tenantSettingsSchema.parse({
    passingScoreDefault: 90,
    maxAttemptsDefault: 3,
  });
  const branding = tenantBrandingSchema.parse({
    companyDisplayName: 'TRANSPRENSA',
    primaryColor: '#1f3a5f',
    accentColor: '#e8734a',
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {
      name: 'TRANSPRENSA',
      timezone: 'America/Bogota',
      plan: 'pilot',
      active: true,
      settings,
      branding,
    },
    create: {
      name: 'TRANSPRENSA',
      slug: TENANT_SLUG,
      timezone: 'America/Bogota',
      plan: 'pilot',
      active: true,
      settings,
      branding,
    },
  });

  console.log(`SEED tenant OK: ${tenant.slug}`);
  return tenant;
}

// ─────────────────────────────── 2. Permisos ───────────────────────────────

async function seedPermissions(): Promise<void> {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {
        category: permissionCategory(code),
        description: permissionDescription(code),
      },
      create: {
        code,
        category: permissionCategory(code),
        description: permissionDescription(code),
      },
    });
  }

  console.log(`SEED permissions OK: ${PERMISSIONS.length} permisos`);
}

// ─────────────────────────────── 3. Roles ───────────────────────────────

const ROLE_DEFINITIONS: CatalogSeedItem[] = [
  { code: 'ADMIN', name: 'Administrador' },
  { code: 'ANALISTA', name: 'Analista' },
  { code: 'USUARIO', name: 'Usuario' },
];

async function seedRoles(tenantId: string): Promise<Record<string, string>> {
  const roleIdByCode: Record<string, string> = {};

  for (const definition of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code: definition.code } },
      update: { name: definition.name, isSystem: true, active: true },
      create: {
        tenantId,
        code: definition.code,
        name: definition.name,
        isSystem: true,
        active: true,
      },
    });
    roleIdByCode[definition.code] = role.id;
  }

  const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permissionIdByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  for (const [roleCode, permissionCodes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
    const roleId = roleIdByCode[roleCode];
    if (!roleId) {
      throw new Error(`SEED: el rol "${roleCode}" de SEED_ROLE_PERMISSIONS no fue creado`);
    }

    const data = permissionCodes.map((code) => {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) {
        throw new Error(`SEED: el permiso "${code}" no existe en el catalogo de permisos`);
      }
      return { roleId, permissionId, tenantId };
    });

    // Clave compuesta sin valor de negocio propio: se reemplaza el set completo del rol
    // en cada corrida para reflejar exactamente SEED_ROLE_PERMISSIONS (idempotente).
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    if (data.length > 0) {
      await prisma.rolePermission.createMany({ data });
    }
  }

  console.log(`SEED roles OK: ${ROLE_DEFINITIONS.length} roles`);
  return roleIdByCode;
}

// ─────────────────────────────── 4. Catalogos ───────────────────────────────

interface CatalogSeedResult {
  areas: Record<string, string>;
  jobTitles: Record<string, string>;
}

async function seedCatalogs(tenantId: string): Promise<CatalogSeedResult> {
  const AREAS: CatalogSeedItem[] = [
    { code: 'GESTION_HUMANA', name: 'Gestion Humana' },
    { code: 'LOGISTICA', name: 'Logistica' },
    { code: 'COMERCIAL', name: 'Comercial' },
    { code: 'CONTABILIDAD', name: 'Contabilidad' },
    { code: 'SAC', name: 'Servicio al Cliente' },
    { code: 'SEGURIDAD', name: 'Seguridad' },
    { code: 'COMPRAS', name: 'Compras' },
    { code: 'CONTROL_INTERNO', name: 'Control Interno' },
    { code: 'SISTEMAS', name: 'Sistemas' },
  ];
  const areaIdByCode: Record<string, string> = {};
  for (const [index, item] of AREAS.entries()) {
    const area = await prisma.area.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, displayOrder: index, active: true },
      create: { tenantId, code: item.code, name: item.name, displayOrder: index, active: true },
    });
    areaIdByCode[item.code] = area.id;
  }

  const PROCESSES: CatalogSeedItem[] = [
    { code: 'SGI', name: 'Sistema de Gestion Integral' },
    { code: 'LOGISTICA', name: 'Logistica' },
    { code: 'SST', name: 'Seguridad y Salud en el Trabajo' },
    { code: 'PESV', name: 'Plan Estrategico de Seguridad Vial' },
    { code: 'SEGURIDAD', name: 'Seguridad' },
    { code: 'GESTION_HUMANA', name: 'Gestion Humana' },
    { code: 'SAC', name: 'Servicio al Cliente' },
    { code: 'COMERCIAL', name: 'Comercial' },
    { code: 'CONTABILIDAD', name: 'Contabilidad' },
    { code: 'CONTROL_INTERNO', name: 'Control Interno' },
    { code: 'SARLAFT', name: 'SARLAFT' },
    { code: 'COMPRAS', name: 'Compras' },
    { code: 'EXCELENCIA_SERVICIO', name: 'Excelencia del Servicio' },
  ];
  for (const [index, item] of PROCESSES.entries()) {
    await prisma.process.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, displayOrder: index, active: true },
      create: { tenantId, code: item.code, name: item.name, displayOrder: index, active: true },
    });
  }

  const JOB_TITLE_TYPES: CatalogSeedItem[] = [
    { code: 'ADMINISTRATIVO', name: 'Administrativo' },
    { code: 'OPERATIVO', name: 'Operativo' },
    { code: 'COMERCIAL', name: 'Comercial' },
  ];
  const jobTitleTypeIdByCode: Record<string, string> = {};
  for (const [index, item] of JOB_TITLE_TYPES.entries()) {
    const jobTitleType = await prisma.jobTitleType.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, displayOrder: index, active: true },
      create: { tenantId, code: item.code, name: item.name, displayOrder: index, active: true },
    });
    jobTitleTypeIdByCode[item.code] = jobTitleType.id;
  }

  // Lista corta de arranque; el catalogo real lo carga el cliente (job_titles es CRUD por UI).
  const JOB_TITLES: Array<CatalogSeedItem & { typeCode: string }> = [
    { code: 'DIRECTOR_GH', name: 'Director de Gestion Humana', typeCode: 'ADMINISTRATIVO' },
    { code: 'ANALISTA_SST', name: 'Analista SST', typeCode: 'ADMINISTRATIVO' },
    { code: 'CONDUCTOR', name: 'Conductor', typeCode: 'OPERATIVO' },
    { code: 'AUX_BODEGA', name: 'Auxiliar de Bodega', typeCode: 'OPERATIVO' },
    { code: 'EJECUTIVO_COMERCIAL', name: 'Ejecutivo Comercial', typeCode: 'COMERCIAL' },
  ];
  const jobTitleIdByCode: Record<string, string> = {};
  for (const [index, item] of JOB_TITLES.entries()) {
    const jobTitleTypeId = jobTitleTypeIdByCode[item.typeCode];
    if (!jobTitleTypeId) {
      throw new Error(`SEED: el tipo de cargo "${item.typeCode}" no existe`);
    }
    const jobTitle = await prisma.jobTitle.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, jobTitleTypeId, displayOrder: index, active: true },
      create: {
        tenantId,
        code: item.code,
        name: item.name,
        jobTitleTypeId,
        displayOrder: index,
        active: true,
      },
    });
    jobTitleIdByCode[item.code] = jobTitle.id;
  }

  const SERVICES: CatalogSeedItem[] = [
    { code: 'ALMACENAMIENTO', name: 'Almacenamiento' },
    { code: 'MASIVO', name: 'Masivo' },
    { code: 'PAQUETEO', name: 'Paqueteo' },
  ];
  for (const [index, item] of SERVICES.entries()) {
    await prisma.service.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, displayOrder: index, active: true },
      create: { tenantId, code: item.code, name: item.name, displayOrder: index, active: true },
    });
  }

  const REGIONALS: CatalogSeedItem[] = [
    { code: 'ANTIOQUIA', name: 'Antioquia' },
    { code: 'BARRANQUILLA', name: 'Barranquilla' },
    { code: 'BUCARAMANGA', name: 'Bucaramanga' },
    { code: 'CUNDINAMARCA', name: 'Cundinamarca' },
    { code: 'EJE_CAFETERO', name: 'Eje Cafetero' },
    { code: 'VALLE_DEL_CAUCA', name: 'Valle del Cauca' },
  ];
  for (const [index, item] of REGIONALS.entries()) {
    await prisma.regional.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, displayOrder: index, active: true },
      create: { tenantId, code: item.code, name: item.name, displayOrder: index, active: true },
    });
  }

  const NORMS: Array<CatalogSeedItem & { annualHoursRequired: number | null }> = [
    { code: 'BASC', name: 'BASC', annualHoursRequired: null },
    {
      code: 'RES_2674',
      name: 'Resolucion 2674 de 2013 (BPM y HACCP)',
      annualHoursRequired: 10,
    },
    { code: 'TRINORMA', name: 'Trinorma ISO', annualHoursRequired: null },
    { code: 'RES_PESV', name: 'Resolucion PESV (40595 de 2022)', annualHoursRequired: null },
    { code: 'NA', name: 'No aplica', annualHoursRequired: null },
  ];
  for (const [index, item] of NORMS.entries()) {
    await prisma.norm.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: {
        name: item.name,
        annualHoursRequired: item.annualHoursRequired,
        displayOrder: index,
        active: true,
      },
      create: {
        tenantId,
        code: item.code,
        name: item.name,
        annualHoursRequired: item.annualHoursRequired,
        displayOrder: index,
        active: true,
      },
    });
  }

  console.log(
    `SEED catalogos OK: ${AREAS.length} areas, ${PROCESSES.length} procesos, ` +
      `${JOB_TITLE_TYPES.length} tipos de cargo, ${JOB_TITLES.length} cargos, ` +
      `${SERVICES.length} servicios, ${REGIONALS.length} regionales, ${NORMS.length} normas`,
  );

  return { areas: areaIdByCode, jobTitles: jobTitleIdByCode };
}

// ───────────────────────── 5. Tipos de actividad formativa ─────────────────────────

interface ActivityTypeSeedItem {
  code: string;
  name: string;
  colorHex: string;
  config: Prisma.InputJsonObject;
}

async function seedActivityTypes(tenantId: string): Promise<void> {
  // El `config` de cada tipo es lo que GOBIERNA el formulario: a quien se le exige por defecto,
  // como se dicta (y por tanto que campos pide su convocatoria), si se repite y si certifica.
  // Es la razon de que crear una pildora no pregunte por instructor ni por lugar.
  const ACTIVITY_TYPES: ActivityTypeSeedItem[] = [
    {
      code: 'INDUCCION_GENERAL',
      name: 'Induccion general',
      colorHex: '#1d4ed8',
      config: {
        requiresAssessment: true,
        issuesCertificate: true,
        requiresBeforeHire: true,
        defaultAssignmentMode: 'ON_HIRE',
        defaultOfferingKind: 'PERMANENT',
        participatesInPlan: false,
        isMicro: false,
      },
    },
    {
      code: 'INDUCCION_ESPECIFICA',
      name: 'Induccion especifica',
      colorHex: '#0e7490',
      config: {
        requiresAssessment: true,
        issuesCertificate: true,
        defaultAssignmentMode: 'BY_JOB_TITLE',
        defaultOfferingKind: 'PERMANENT',
        participatesInPlan: false,
        isMicro: false,
      },
    },
    {
      /*
        RECERTIFICACION: la competencia del puesto que CADUCA (2026-09-05).

        ─── POR QUE UN TIPO Y NO UNA INDUCCION ESPECIFICA QUE SE REPITE ───

        Las dos cuelgan del CARGO y las dos usan el mismo motor, asi que tecnicamente bastaba con
        poner "cada N meses" en una especifica. Pero entonces el tipo MIENTE, y el tipo es lo que
        lee el auditor: "Induccion especifica: Montacargas" que vence cada ano no es una induccion.

        Y son dos preguntas distintas:

          Induccion especifica  ->  "¿le hicieron la induccion del puesto cuando llego?"
                                     Un hecho del pasado, con su fecha. No vuelve.
          Recertificacion       ->  "¿esta VIGENTE hoy su habilitacion?"
                                     Un estado de hoy. Vence, y hay que renovarla.

        La Decision #8 puso los tipos en una TABLA por tenant justamente para esto, y nombraba
        "RECERTIFICACION" como el ejemplo. No cuesta codigo: es una fila.

        ─── POR QUE ESTE CONFIG Y NO OTRO ───

        `defaultRecurrenceMonths: 12` y no fecha fija: un certificado vence el dia de CADA PERSONA.
        Si se hiciera por campana, quien se certifico en agosto estaria "al dia" hasta marzo con la
        habilitacion vencida desde agosto — y el indicador mentiria en el peor momento.

        `participatesInPlan: false` y es OBLIGATORIO que lo sea: el servidor le fuerza recurrencia
        nula a todo lo que participa del plan (la del ano que viene es otro plan, no otra ronda).
        Ponerlo en `true` mataria el aniversario, que es lo unico que hace util a este tipo.

        `defaultOnExpiry: ESPERA` —el defecto— y aqui SI es lo correcto, al reves que en la
        reinduccion: una habilitacion vencida **sigue siendo la que hay que renovar**. No hay
        "periodo 2026 cerrado" del que pasar pagina; se queda ATRASADA, que cuenta como
        incumplimiento, hasta que la renueve. Abrir una segunda seria decir que la primera ya no
        importa.

        `defaultOfferingKind: EVENT`: se dicta en jornada, con practica y evaluador. Y `executedBy`
        admite externo, que es el caso normal —lo certifica la ARL o un tercero— sin que cambie de
        quien es el registro ni quien vigila el vencimiento.
      */
      code: 'RECERTIFICACION',
      name: 'Recertificacion',
      colorHex: '#65a30d',
      config: {
        requiresAssessment: true,
        /*
          LA ENCUESTA NO SE SIEMBRA, igual que en los otros cinco tipos: pedirla exige elegir CUAL,
          y esa es de la empresa. Si se sembrara `requiresSurvey: true` sin encuesta elegida, este
          tipo no se podria publicar hasta que alguien descubriera por que — y el aviso, aunque lo
          explica bien, llega tarde. El cliente la enciende y elige la suya en Configuracion.
        */
        // La constancia no es un extra: ES el certificado, y es lo que se enseña cuando preguntan.
        issuesCertificate: true,
        defaultAssignmentMode: 'BY_JOB_TITLE',
        defaultOfferingKind: 'EVENT',
        participatesInPlan: false,
        isMicro: false,
        defaultRecurrenceMonths: 12,
        // Quien entra tiene que certificarse ya: no hay meses de gracia en una habilitacion.
        exemptRecentHiresMonths: 0,
        /*
          EL UNICO TIPO QUE NACE CON ESTO ENCENDIDO (Decision #157).

          Es la clase de formacion donde el papel lo emite un TERCERO acreditado —la ARL, un centro
          de entrenamiento— y la empresa es receptora: lo que necesita saber es cuando vence. Con
          esto encendido, la lista de asistencia de la jornada pide entidad, numero y vencimiento, y
          esa fecha MANDA sobre la que calcularia la recurrencia: si la ARL certifica por tres anos
          y aqui dice doce meses, reclamarla al ano seria inventar un incumplimiento.

          Los otros seis nacen apagados y cada empresa lo enciende donde le aplique.
        */
        tracksExternalCertificate: true,
      },
    },
    {
      code: 'REINDUCCION',
      name: 'Reinduccion',
      colorHex: '#6d28d9',
      config: {
        requiresAssessment: true,
        issuesCertificate: true,
        // Se le exige a TODA la empresa, como la general, y ademas vuelve cada ano. Estaba sin
        // modo de asignacion, asi que caia en MANUAL: la reinduccion anual de 116 personas
        // quedaba dependiendo de que alguien se acordara de marcarla.
        defaultAssignmentMode: 'ON_HIRE',
        defaultOfferingKind: 'PERMANENT',
        // QUE PASA SI NO LA HIZO Y LLEGA LA DEL ANO SIGUIENTE: la de este ano se cierra como NO
        // REALIZADA —que cuenta como incumplimiento de ese periodo— y la nueva nace para todos. Es
        // como funciona una campana de calendario, y evita que quien nunca la hace desaparezca del
        // denominador de los anos siguientes.
        defaultOnExpiry: 'CIERRA',
        // CAMPANA ANUAL, no aniversario por persona: la reinduccion es una obligacion de
        // calendario que cae sobre todos el mismo dia. Anclarla a "12 meses desde que cada quien
        // la hizo" deja sin fecha a quien nunca hizo la induccion, y no es lo que pregunta el
        // auditor: pregunta si se hizo LA REINDUCCION DE 2026.
        defaultAnnualDate: '03-31',
        // QUIEN ENTRO HACE MENOS DE SEIS MESES NO ENTRA A LA CAMPANA: su induccion ES su
        // actualizacion de ese ano, y encimarle la reinduccion sobre una induccion a medio hacer es
        // pedirle dos veces lo mismo. Sin esto habia que eximir a mano a cada ingreso reciente
        // —unos cincuenta al ano— escribiendo cincuenta veces el mismo motivo.
        exemptRecentHiresMonths: 6,
        participatesInPlan: false,
        isMicro: false,
      },
    },
    {
      code: 'PLAN',
      name: 'Capacitacion del plan',
      colorHex: '#15803d',
      config: {
        requiresAssessment: true,
        requiresSurvey: true,
        issuesCertificate: true,
        defaultOfferingKind: 'EVENT',
        participatesInPlan: true,
        isMicro: false,
      },
    },
    {
      code: 'EXTRA',
      name: 'Capacitacion extraordinaria',
      colorHex: '#b45309',
      config: {
        requiresAssessment: true,
        issuesCertificate: true,
        defaultOfferingKind: 'EVENT',
        participatesInPlan: false,
        isMicro: false,
      },
    },
    {
      code: 'MICROLEARNING',
      name: 'Pildora',
      colorHex: '#be185d',
      config: {
        requiresAssessment: false,
        issuesCertificate: false,
        defaultOfferingKind: 'PERMANENT',
        participatesInPlan: false,
        isMicro: true,
      },
    },
  ];

  for (const [index, item] of ACTIVITY_TYPES.entries()) {
    /*
      RESEMBRAR NO PUEDE PISAR LO QUE EL TENANT PARAMETRIZO (2026-09-04).

      El `update` mandaba `config: item.config` entero, asi que cada `pnpm db:seed` borraba lo que
      la empresa hubiera configurado en sus tipos. Paso de verdad en esta sesion: resembrar tras
      una migracion **borro la encuesta de satisfaccion** de induccion general, especifica,
      reinduccion y extraordinaria, y esas formaciones pasaron a publicarse sin encuesta sin que
      nadie dijera nada. En produccion seria la parametrizacion del cliente.

      La semilla aporta DEFECTOS, no verdades: se anaden las claves que no existan —asi una clave
      nueva llega a los tenants que ya existen— y se respeta cualquier valor ya puesto.
    */
    const existente = await prisma.activityType.findUnique({
      where: { tenantId_code: { tenantId, code: item.code } },
      select: { config: true },
    });
    const configActual = (existente?.config ?? {}) as Record<string, unknown>;
    const configMezclada = { ...item.config, ...configActual };

    await prisma.activityType.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: {
        name: item.name,
        colorHex: item.colorHex,
        config: configMezclada,
        isSystem: true,
        active: true,
        displayOrder: index,
      },
      create: {
        tenantId,
        code: item.code,
        name: item.name,
        colorHex: item.colorHex,
        config: item.config,
        isSystem: true,
        active: true,
        displayOrder: index,
      },
    });
  }

  console.log(`SEED tipos de actividad OK: ${ACTIVITY_TYPES.length} tipos`);
}

// ───────────────────────── 6. Politicas de retencion ─────────────────────────

interface RetentionSeedItem {
  recordClass: 'SST_TRAINING' | 'GENERAL_TRAINING' | 'AUDIT' | 'PII';
  retentionYears: number;
  legalBasis: string;
}

async function seedRetention(tenantId: string): Promise<void> {
  const POLICIES: RetentionSeedItem[] = [
    {
      recordClass: 'SST_TRAINING',
      retentionYears: 20,
      legalBasis: 'Decreto 1072 de 2015 art. 2.2.4.6.13',
    },
    { recordClass: 'GENERAL_TRAINING', retentionYears: 5, legalBasis: 'Politica interna' },
    { recordClass: 'AUDIT', retentionYears: 10, legalBasis: 'Politica interna' },
    { recordClass: 'PII', retentionYears: 5, legalBasis: 'Ley 1581 de 2012' },
  ];

  for (const policy of POLICIES) {
    await prisma.retentionPolicy.upsert({
      where: { tenantId_recordClass: { tenantId, recordClass: policy.recordClass } },
      update: {
        retentionYears: policy.retentionYears,
        legalBasis: policy.legalBasis,
        actionOnExpiry: 'ANONYMIZE',
        active: true,
      },
      create: {
        tenantId,
        recordClass: policy.recordClass,
        retentionYears: policy.retentionYears,
        legalBasis: policy.legalBasis,
        actionOnExpiry: 'ANONYMIZE',
        active: true,
      },
    });
  }

  console.log(`SEED politicas de retencion OK: ${POLICIES.length} politicas`);
}

// ─────────────────────────────── 7. Usuario admin ───────────────────────────────

interface SeedAdminParams {
  tenantId: string;
  roleId: string;
  jobTitleId: string;
  areaId: string;
}

async function seedAdmin(params: SeedAdminParams): Promise<void> {
  // El hash solo se calcula/aplica al CREAR: si el usuario ya existe, una corrida repetida
  // del seed no debe pisar una contrasena que el admin ya cambio en produccion.
  const existing = await prisma.user.findUnique({
    where: {
      tenantId_documentNumber: { tenantId: params.tenantId, documentNumber: ADMIN_DOCUMENT_NUMBER },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: 'Administrador NEO PULSE',
        email: 'admin@transprensa.com',
        emailKind: 'CORPORATE',
        jobTitleId: params.jobTitleId,
        areaId: params.areaId,
        roleId: params.roleId,
        employmentType: 'DIRECTO',
        active: true,
      },
    });
  } else {
    const passwordHash = await argon2.hash(ADMIN_PASSWORD);
    await prisma.user.create({
      data: {
        tenantId: params.tenantId,
        documentNumber: ADMIN_DOCUMENT_NUMBER,
        fullName: 'Administrador NEO PULSE',
        email: 'admin@transprensa.com',
        emailKind: 'CORPORATE',
        phone: null,
        passwordHash,
        mustChangePassword: true,
        jobTitleId: params.jobTitleId,
        areaId: params.areaId,
        roleId: params.roleId,
        employmentType: 'DIRECTO',
        active: true,
      },
    });
  }

  console.log(`SEED OK — login: ${ADMIN_DOCUMENT_NUMBER} / ${ADMIN_PASSWORD}`);
}

// ─────────────────────── 8. Usuario de pruebas E2E ───────────────────────

const E2E_DOCUMENT_NUMBER = '888888888';
const E2E_PASSWORD = 'PruebaE2E2026*';

/**
 * Usuario dedicado a las pruebas automatizadas (Playwright): ya tiene la contrasena cambiada y
 * las politicas aceptadas, de modo que el e2e entra directo al panel y es REPETIBLE sobre la
 * misma base. NUNCA se crea en produccion.
 */
async function seedE2EUser(params: SeedAdminParams): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('SEED e2e OMITIDO (NODE_ENV=production)');
    return;
  }

  const now = new Date();
  const existing = await prisma.user.findUnique({
    where: {
      tenantId_documentNumber: { tenantId: params.tenantId, documentNumber: E2E_DOCUMENT_NUMBER },
    },
    select: { id: true },
  });

  const data = {
    fullName: 'Usuario Pruebas Automatizadas',
    email: 'e2e@transprensa.test',
    emailKind: 'CORPORATE' as const,
    jobTitleId: params.jobTitleId,
    areaId: params.areaId,
    roleId: params.roleId,
    employmentType: 'DIRECTO' as const,
    active: true,
    // Listo para operar: sin cambio forzado y con las politicas ya aceptadas.
    mustChangePassword: false,
    habeasDataConsentAt: now,
    habeasDataVersion: '1.0',
    esignAgreementAt: now,
    esignAgreementVersion: '1.0',
    failedLoginAttempts: 0,
    lockedUntil: null,
  };

  if (existing) {
    // La contrasena SI se restablece en cada corrida: el e2e depende de que sea conocida.
    await prisma.user.update({
      where: { id: existing.id },
      data: { ...data, passwordHash: await argon2.hash(E2E_PASSWORD) },
    });
  } else {
    await prisma.user.create({
      data: {
        ...data,
        tenantId: params.tenantId,
        documentNumber: E2E_DOCUMENT_NUMBER,
        passwordHash: await argon2.hash(E2E_PASSWORD),
      },
    });
  }

  console.log(`SEED e2e OK — login pruebas: ${E2E_DOCUMENT_NUMBER} / ${E2E_PASSWORD}`);
}

// ─────────────────────────────── main ───────────────────────────────

async function main(): Promise<void> {
  try {
    console.log('SEED iniciando — tenant TRANSPRENSA');

    const tenant = await seedTenant();
    await seedPermissions();
    const roles = await seedRoles(tenant.id);
    const catalogs = await seedCatalogs(tenant.id);
    await seedActivityTypes(tenant.id);
    await seedRetention(tenant.id);

    const adminRoleId = roles.ADMIN;
    const adminJobTitleId = catalogs.jobTitles.DIRECTOR_GH;
    const adminAreaId = catalogs.areas.GESTION_HUMANA;

    if (!adminRoleId || !adminJobTitleId || !adminAreaId) {
      throw new Error('SEED: faltan dependencias (rol/cargo/area) para crear el usuario administrador');
    }

    const adminParams: SeedAdminParams = {
      tenantId: tenant.id,
      roleId: adminRoleId,
      jobTitleId: adminJobTitleId,
      areaId: adminAreaId,
    };
    await seedAdmin(adminParams);
    await seedE2EUser(adminParams);

    console.log('SEED completo.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('SEED FALLO:', error);
  process.exitCode = 1;
});
