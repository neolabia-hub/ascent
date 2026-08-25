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
  userCount: number;
}

export function listRoles(): Promise<RoleRow[]> {
  return apiFetch<RoleRow[]>('/roles', { method: 'GET' });
}

// ─────────────────────────── Usuarios ───────────────────────────

export interface UserRow {
  id: string;
  documentType: string;
  documentNumber: string;
  fullName: string;
  phone: string | null;
  email: string;
  emailKind: 'PERSONAL' | 'CORPORATE';
  mustChangePassword: boolean;
  hiredAt: string | null;
  employmentType: string;
  roadActor: string | null;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  jobTitle: { id: string; code: string; name: string };
  area: { id: string; code: string; name: string };
  regional: { id: string; code: string; name: string } | null;
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
  email: string;
  emailKind?: 'PERSONAL' | 'CORPORATE';
  jobTitleId: string;
  areaId: string;
  regionalId?: string | null;
  roleCode?: 'ADMIN' | 'ANALISTA' | 'USUARIO';
  hiredAt?: string | null;
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
  error?: string;
  generatedPassword?: string;
}

export interface ImportResult {
  batchId: string;
  total: number;
  ok: number;
  failed: number;
  rows: ImportRowResult[];
}

/** Importacion masiva: multipart, fuera de apiFetch (JSON). */
export async function importUsers(file: File): Promise<ImportResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const form = new FormData();
  form.append('file', file);
  const token = getAccessToken();
  const response = await fetch(`${apiUrl}/v1/users/import`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = (data ?? {}) as { title?: string; code?: string };
    throw new Error(detail.title ?? detail.code ?? 'Error al importar');
  }
  return data as ImportResult;
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
  link.download = 'plantilla-usuarios.csv';
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
  pillCadencePerWeek: number;
  notificationWeeklyCap: number;
  streakFreezesMax: number;
  efficacyDaysDefault: number;
  labels: Record<string, string>;
  features: Record<string, boolean>;
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
