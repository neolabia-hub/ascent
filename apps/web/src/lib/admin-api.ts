/**
 * Cliente tipado de los modulos de administracion (Sprint 1): catalogos, roles, usuarios,
 * importacion, aprobaciones, settings/branding del tenant. Extiende lib/api.ts.
 */
import { apiFetch, getAccessToken } from './api';

// ─────────────────────────── Catalogos ───────────────────────────

export type CatalogKey =
  | 'areas'
  | 'processes'
  | 'job-title-types'
  | 'job-titles'
  | 'services'
  | 'regionals'
  | 'norms'
  | 'activity-types';

export interface CatalogRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  displayOrder: number;
  // Campos especificos por catalogo (presentes solo donde aplican):
  jobTitleTypeId?: string;
  jobTitleType?: { id: string; code: string; name: string };
  annualHoursRequired?: number | null;
  colorHex?: string | null;
  isSystem?: boolean;
  config?: Record<string, unknown>;
  parentId?: string | null;
  responsibleUserId?: string | null;
  areaId?: string | null;
  area?: { id: string; name: string } | null;
  responsible?: { id: string; fullName: string } | null;
}

/**
 * EL NOMBRE DE UN ÁREA CON SU RAMA: «Gestión Humana › Nómina» (2026-09-17).
 *
 * Desde que hay SUB-ÁREAS, un desplegable plano es inservible: «Nómina», «Contratación» y
 * «Selección» salen al mismo nivel que «Gestión Humana» y nada dice cuál cuelga de cuál. Y aquí
 * elegir mal tiene consecuencia real: **el área de la persona decide quién la evalúa**, porque el
 * evaluador es el responsable de esa área (ver `planificarEvaluaciones` en el servidor).
 *
 * Se corta en dos niveles a propósito: con tres o más la etiqueta se vuelve una frase y deja de
 * leerse de un vistazo, y el nivel que de verdad importa es el inmediato — de quién cuelgo.
 */
export function nombreConRama(area: CatalogRow, todas: readonly CatalogRow[]): string {
  const padre = area.parentId ? todas.find((a) => a.id === area.parentId) : null;
  return padre ? `${padre.name} › ${area.name}` : area.name;
}

export function listCatalog(key: CatalogKey): Promise<CatalogRow[]> {
  return apiFetch<CatalogRow[]>(`/catalogs/${key}`, { method: 'GET' });
}

export function createCatalogRow(key: CatalogKey, body: Record<string, unknown>): Promise<CatalogRow> {
  return apiFetch<CatalogRow>(`/catalogs/${key}`, { method: 'POST', body });
}

export function updateCatalogRow(key: CatalogKey, id: string, body: Record<string, unknown>): Promise<CatalogRow> {
  return apiFetch<CatalogRow>(`/catalogs/${key}/${id}`, { method: 'PATCH', body });
}

export function deleteCatalogRow(key: CatalogKey, id: string): Promise<void> {
  return apiFetch<void>(`/catalogs/${key}/${id}`, { method: 'DELETE' });
}

// ─────────────────────────── Roles ───────────────────────────

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  permissionCodes: string[];
  /**
   * Tipos de formacion que este rol puede tocar (2026-09-22).
   * **Vacio = sin acotar**: puede con todos. Acotar es un acto deliberado.
   */
  activityTypeIds: string[];
  userCount: number;
}

/** Fija el conjunto ENTERO de tipos de un rol. Lista vacia = desacotarlo. */
export function setRoleActivityTypes(roleId: string, activityTypeIds: string[]): Promise<{ activityTypeIds: string[] }> {
  return apiFetch(`/roles/${roleId}/tipos`, { method: 'PUT', body: { activityTypeIds } });
}

export function listRoles(): Promise<RoleRow[]> {
  return apiFetch<RoleRow[]>('/roles', { method: 'GET' });
}

/** Catalogo global de permisos, agrupable por categoria para la matriz de roles. */
export interface PermissionRow {
  code: string;
  category: string;
  description: string;
}

export function listPermissions(): Promise<PermissionRow[]> {
  return apiFetch<PermissionRow[]>('/roles/permissions', { method: 'GET' });
}

export function createRole(body: { code: string; name: string; permissionCodes: string[] }): Promise<RoleRow> {
  return apiFetch<RoleRow>('/roles', { method: 'POST', body });
}

export function updateRole(
  id: string,
  body: { name?: string; active?: boolean; permissionCodes?: string[] },
): Promise<RoleRow> {
  return apiFetch<RoleRow>(`/roles/${id}`, { method: 'PATCH', body });
}

export function deleteRole(id: string): Promise<void> {
  return apiFetch<void>(`/roles/${id}`, { method: 'DELETE' });
}

/** Excepciones individuales sobre el rol. Reemplaza el conjunto completo. */
export function setUserOverrides(
  userId: string,
  overrides: Array<{ permissionCode: string; granted: boolean }>,
): Promise<unknown> {
  return apiFetch(`/users/${userId}/overrides`, { method: 'POST', body: { overrides } });
}

export interface UserDetail extends UserRow {
  overrides: Array<{ granted: boolean; permission: { code: string } }>;
  analystScopes: Array<{
    id: string;
    process: { id: string; code: string; name: string } | null;
    area: { id: string; code: string; name: string } | null;
  }>;
}

/** Personas para un SELECTOR: nombre y cargo, nada mas. Ver users.controller.ts. */
export interface PickableUser {
  id: string;
  fullName: string;
  jobTitle: { id: string; name: string } | null;
  area: { id: string; name: string } | null;
  regional: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
}

export function listPickableUsers(): Promise<PickableUser[]> {
  return apiFetch<PickableUser[]>('/users/pickable', { method: 'GET' });
}

export function getUser(id: string): Promise<UserDetail> {
  return apiFetch<UserDetail>(`/users/${id}`, { method: 'GET' });
}

/**
 * ALCANCE: sobre que trabaja esta persona. Reemplaza el conjunto completo.
 *
 * Por AREA alcanza todos los procesos que cuelgan de ella (una jefatura); por PROCESO, solo ese
 * (quien responde por uno). Ver api/src/common/analyst-scope.ts y la Decision #57.
 *
 * Todo vacio NO es "no ve nada": es "sin restriccion", que es como esta el administrador. Tener
 * alcance es lo que restringe.
 */
export function setAnalystScopes(
  userId: string,
  scope: { processIds: string[]; areaIds: string[] },
): Promise<unknown> {
  return apiFetch(`/users/${userId}/analyst-scopes`, {
    method: 'POST',
    body: {
      scopes: [
        ...scope.areaIds.map((areaId) => ({ areaId })),
        ...scope.processIds.map((processId) => ({ processId })),
      ],
    },
  });
}

// ─────────────────────────── Usuarios ───────────────────────────

export interface UserRow {
  id: string;
  documentType: string;
  documentNumber: string;
  fullName: string;
  phone: string | null;
  /** `null` = esta persona no tiene correo. Entra con su cedula (Decision #10). */
  email: string | null;
  emailKind: 'PERSONAL' | 'CORPORATE';
  mustChangePassword: boolean;
  hiredAt: string | null;
  birthDate: string | null;
  employmentType: string;
  roadActor: string | null;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  /** La foto de perfil que se puso la persona. Puede no tenerla. */
  avatarKey: string | null;
  jobTitle: { id: string; code: string; name: string };
  area: { id: string; code: string; name: string };
  regional: { id: string; code: string; name: string } | null;
  service: { id: string; code: string; name: string } | null;
  role: { id: string; code: string; name: string };
}

export interface UsersPage {
  total: number;
  page: number;
  pageSize: number;
  items: UserRow[];
}

export interface CreateUserBody {
  documentType?: string;
  documentNumber: string;
  fullName: string;
  phone?: string | null;
  /** Opcional: hay gente sin correo. Vacio o `null` se guarda como «sin correo». */
  email?: string | null;
  emailKind?: 'PERSONAL' | 'CORPORATE';
  jobTitleId: string;
  areaId: string;
  regionalId?: string | null;
  serviceId?: string | null;
  roleCode?: 'ADMIN' | 'ANALISTA' | 'USUARIO';
  hiredAt?: string | null;
  birthDate?: string | null;
  employmentType?: string;
  roadActor?: string | null;
}

export function listUsers(params: {
  q?: string;
  areaId?: string;
  roleCode?: string;
  active?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}): Promise<UsersPage> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, String(v));
  });
  return apiFetch<UsersPage>(`/users?${search.toString()}`, { method: 'GET' });
}

export function createUser(body: CreateUserBody): Promise<{ user: UserRow; generatedPassword: string | null }> {
  return apiFetch(`/users`, { method: 'POST', body });
}

export function updateUser(id: string, body: Partial<CreateUserBody> & { active?: boolean }): Promise<UserRow> {
  return apiFetch(`/users/${id}`, { method: 'PATCH', body });
}

export function resetUserPassword(id: string): Promise<{ generatedPassword: string }> {
  return apiFetch(`/users/${id}/reset-password`, { method: 'POST' });
}

export interface ImportRowResult {
  rowNumber: number;
  status: 'OK' | 'ERROR';
  documento: string;
  /** El nombre tal como venia en el archivo, para saber de quien es el error sin abrirlo. */
  nombre?: string | null;
  error?: string;
  note?: string;
  /** Que se hizo con esta fila. Ausente en las filas con error. */
  accion?: 'CREADA' | 'ACTUALIZADA' | 'SIN_CAMBIOS';
  generatedPassword?: string;
}

export interface ImportResult {
  batchId: string;
  /** `true` = vista previa: no se escribió nada todavía (`PENDIENTES` 5.4). */
  simulacion?: boolean;
  total: number;
  ok: number;
  failed: number;
  /** Desglose del `ok`: desde que una recarga actualiza, «180 bien» ya no quiere decir «180 altas». */
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  rows: ImportRowResult[];
}

/**
 * Importacion masiva: multipart, fuera de apiFetch (JSON).
 *
 * `simular` recorre el mismo camino sin escribir nada y devuelve lo que PASARIA (`PENDIENTES` 5.4).
 * Es la misma funcion y no dos porque la respuesta tiene la misma forma: si fueran dos, una podria
 * dejar de parecerse a la otra y la vista previa mentiria.
 */
export async function importUsers(file: File, simular = false): Promise<ImportResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', file);
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/users/import${simular ? '/simular' : ''}`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  /*
    LOS ERRORES QUE TUMBAN EL ARCHIVO ENTERO, EN ESPAÑOL (2026-09-22).

    Aqui se leia `detail.title`, y cuando la API no manda una frase propia ese titulo es **el nombre
    de la clase de la excepcion**: la pantalla decia «Bad Request Exception» y ahi se acababa la
    conversacion. Ahora la API manda su frase en casi todos los casos; esto cubre los que no puede
    mandarla —el archivo demasiado grande lo corta el servidor antes de llegar al codigo, y una
    respuesta que ni siquiera es JSON no trae nada que leer—.
  */
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { title?: string; code?: string };
    if (response.status === 413) {
      throw new Error('El archivo pesa más de 5 MB. Quita las hojas y los formatos que no uses, o pártelo en varios.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Tu sesión no tiene permiso para cargar personas. Vuelve a entrar o pídeselo a un administrador.');
    }
    // Un titulo que es el nombre de una clase no se le enseña a nadie.
    const parece_tecnico = !detail.title || /exception|error$/i.test(detail.title);
    throw new Error(
      parece_tecnico
        ? 'No se pudo leer el archivo. Revisa que sea la plantilla (.xlsx o .csv) y que la primera fila tenga los encabezados.'
        : detail.title,
    );
  }
  return (await response.json()) as ImportResult;
}

export async function downloadImportTemplate(): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/users/import-template`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-usuarios.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────── Aprobaciones ───────────────────────────

export interface ApprovalRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  justification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedByName?: string | null;
  decidedBy: string | null;
  decidedByName?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface ApprovalsPage {
  total: number;
  page: number;
  pageSize: number;
  items: ApprovalRow[];
}

export function listApprovals(status?: 'PENDING' | 'APPROVED' | 'REJECTED', page = 1): Promise<ApprovalsPage> {
  const search = new URLSearchParams({ page: String(page) });
  if (status) search.set('status', status);
  return apiFetch(`/approvals?${search.toString()}`, { method: 'GET' });
}

export function listMyApprovals(page = 1): Promise<ApprovalsPage> {
  return apiFetch(`/approvals/mine?page=${page}`, { method: 'GET' });
}

export function decideApproval(id: string, decision: 'APPROVED' | 'REJECTED', decisionNote?: string): Promise<ApprovalRow> {
  return apiFetch(`/approvals/${id}/decide`, { method: 'POST', body: { decision, decisionNote } });
}

// ─────────────────────────── Tenant (preferencias) ───────────────────────────

export interface TenantSettings {
  schemaVersion: number;
  passingScoreDefault: number;
  maxAttemptsDefault: number;
  retryWaitHours: number;
  /** Minimo de video visto que exige la empresa cuando la formacion no dice otra cosa. */
  minWatchPctDefault: number;
  pillCadencePerWeek: number;
  notificationWeeklyCap: number;
  streakFreezesMax: number;
  efficacyDaysDefault: number;
  /** Dias antes del cierre en que se recuerda el ciclo de desempeno. 0 = sin recordatorio. */
  performanceReminderDays: number;
  /** Dias hacia adelante que mira el aviso semanal de vencimientos. 0 = sin aviso. */
  expirationDigestDays: number;
  /** A partir de cuantas preguntas vencidas de repaso se avisa a la persona. 0 = sin aviso. */
  reviewDigestMinDue: number;
  /** Escalones de repaso en dias (Leitner): fallar vuelve al primero, acertar sube uno. Creciente, 2 a 8 pasos. */
  reviewIntervalsDays: number[];
  labels: Record<string, string>;
  features: Record<string, boolean>;
  /** A quien acude quien no puede entrar. Se publica SIN sesion (Decision #97). */
  support: {
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    note: string;
  };
}

export interface TenantBrandingSettings {
  logoKey: string | null;
  primaryColor: string;
  accentColor: string;
  companyDisplayName: string;
}

export function getTenantSettings(): Promise<{ settings: TenantSettings }> {
  return apiFetch('/tenant/settings', { method: 'GET' });
}

export function putTenantSettings(settings: TenantSettings): Promise<{ settings: TenantSettings }> {
  return apiFetch('/tenant/settings', { method: 'PUT', body: settings });
}

export function getTenantBranding(): Promise<{ branding: TenantBrandingSettings }> {
  return apiFetch('/tenant/branding', { method: 'GET' });
}

export function putTenantBranding(branding: TenantBrandingSettings): Promise<{ branding: TenantBrandingSettings }> {
  return apiFetch('/tenant/branding', { method: 'PUT', body: branding });
}
