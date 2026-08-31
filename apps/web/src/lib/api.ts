/**
 * Cliente HTTP tipado para la API de NEO PULSE (NestJS, prefijo /v1).
 * El access token vive SOLO en memoria (module-level): no se persiste en storage
 * para reducir superficie de robo por XSS. La sesion se recupera con /auth/refresh,
 * que usa la cookie httpOnly de refresh (por eso credentials:'include' siempre).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_PREFIX = '/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export interface ApiErrorBody {
  title?: string;
  code?: string;
  status?: number;
  retryAfter?: number;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(body: ApiErrorBody, status: number) {
    super(body.title ?? 'Error de la API');
    this.name = 'ApiError';
    this.code = body.code ?? 'UNKNOWN_ERROR';
    this.status = body.status ?? status;
    this.retryAfter = body.retryAfter;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = opts;

  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', 'application/json');
  if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (!skipAuth && accessToken) {
    finalHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('json');
  const data: unknown = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const errorBody: ApiErrorBody =
      isJson && data !== null && typeof data === 'object' ? (data as ApiErrorBody) : {};
    throw new ApiError(errorBody, response.status);
  }

  return data as T;
}

export interface TenantBranding {
  primaryColor: string;
  accentColor: string;
  companyDisplayName: string;
  logoKey: string | null;
}

export interface PublicTenant {
  name: string;
  branding: TenantBranding;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  mustChangePassword: boolean;
  activated: boolean;
}

export interface MeResponse {
  id: string;
  fullName: string;
  email: string;
  mustChangePassword: boolean;
  activated: boolean;
  permissions: string[];
  /**
   * Los procesos que esta persona puede administrar.
   *
   * **`null` = SIN ACOTAR (los ve todos). `[]` = acotada a NINGUNO.** No son lo mismo y confundirlos
   * es grave en los dos sentidos: leer `[]` como "ve todo" le abre la empresa entera a quien no
   * tiene nada asignado. Es la misma regla que aplica el servidor en `scopeAllows`.
   */
  scopeProcessIds: string[] | null;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string; // TTL del access token tal como lo emite la API (p. ej. "15m")
  user: AuthUser;
}

export function getPublicTenant(tenantSlug: string): Promise<PublicTenant> {
  return apiFetch<PublicTenant>(`/public/tenants/${encodeURIComponent(tenantSlug)}`, {
    method: 'GET',
    skipAuth: true,
  });
}

export function login(tenantSlug: string, identifier: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: { tenantSlug, identifier, password },
  });
}

export function refresh(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
  });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export function activate(acceptHabeasData: true, acceptESignAgreement: true): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/auth/activate', {
    method: 'POST',
    body: { acceptHabeasData, acceptESignAgreement },
  });
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me', {
    method: 'GET',
  });
}

export interface InboxItem {
  id: string;
  eventType: string;
  subject: string;
  body: string;
  /** A que apunta el aviso. Es lo que permite que al pulsarlo lleve a alguna parte. */
  referenceType: string | null;
  referenceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboxResponse {
  unread: number;
  items: InboxItem[];
}

export function getInbox(unreadOnly = false): Promise<InboxResponse> {
  const query = unreadOnly ? '?unread=true' : '';
  return apiFetch<InboxResponse>(`/notifications${query}`, {
    method: 'GET',
  });
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
  });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/notifications/read-all', {
    method: 'POST',
  });
}
