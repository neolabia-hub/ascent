/**
 * Cliente HTTP tipado para la API de NEO PULSE (NestJS, prefijo /v1).
 * El access token vive SOLO en memoria (module-level): no se persiste en storage
 * para reducir superficie de robo por XSS. La sesion se recupera con /auth/refresh,
 * que usa la cookie httpOnly de refresh (por eso credentials:'include' siempre).
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_PREFIX = '/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * LA SESION SE RENUEVA SOLA (Decision #91).
 *
 * ANTES NO SE RENOVABA NUNCA. El token de acceso dura 15 minutos y solo se pedia uno nuevo al
 * montar el armazon, es decir, al recargar la pagina entera. A los quince minutos de trabajo
 * TODA peticion empezaba a dar 401 y la aplicacion se caia sola: se quedaba en blanco, decia
 * "no se pudo conectar" o mandaba al login sin motivo aparente. Es el "se salio de la nada".
 *
 * Ahora, ante un 401 se pide un token nuevo con la cookie de refresco y se REINTENTA la peticion
 * una vez. Detalles que importan:
 *
 *   - UN SOLO REFRESCO A LA VEZ. La pantalla dispara varias peticiones en paralelo (pendientes,
 *     repaso, progreso...); si el token caduca justo ahi, todas fallarian a la vez y cada una
 *     pediria su refresco. Como el servidor ROTA el token en cada refresco, el primero invalida
 *     al resto y el usuario acaba fuera. Coalescerlos en una sola promesa lo evita.
 *   - UN SOLO REINTENTO. Si tras refrescar sigue habiendo 401, es que la sesion murio de verdad
 *     —contrasena cambiada, sesion cerrada desde otro sitio— y reintentar en bucle solo retrasa
 *     el momento de decirlo.
 *   - NI EL LOGIN NI EL REFRESCO se reintentan: ahi un 401 es la respuesta, no un accidente.
 */
let refrescoEnCurso: Promise<string | null> | null = null;

/** Se avisa al armazon cuando la sesion muere de verdad, para que lleve al login UNA vez. */
let alPerderLaSesion: (() => void) | null = null;
export function onSessionLost(handler: (() => void) | null): void {
  alPerderLaSesion = handler;
}

async function renovarToken(): Promise<string | null> {
  refrescoEnCurso ??= (async () => {
    try {
      const renovado = await apiFetch<LoginResponse>('/auth/refresh', { method: 'POST', skipAuth: true });
      accessToken = renovado.accessToken;
      return renovado.accessToken;
    } catch {
      accessToken = null;
      return null;
    } finally {
      // Se libera en el siguiente turno: las peticiones que fallaron a la vez comparten ESTA.
      setTimeout(() => {
        refrescoEnCurso = null;
      }, 0);
    }
  })();
  return refrescoEnCurso;
}

/** El login y el refresco no se reintentan: ahi un 401 es la respuesta. */
function esRutaDeSesion(path: string): boolean {
  return path.startsWith('/auth/refresh') || path.startsWith('/auth/login');
}

export function getAccessToken(): string | null {
  return accessToken;
}

export interface ApiErrorBody {
  title?: string;
  code?: string;
  status?: number;
  retryAfter?: number;
  /** Miembros de extension del Problem Details (RFC 9457 3.2). */
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  /**
   * El cuerpo entero, para los errores que traen datos con los que se puede hacer algo.
   *
   * Un `code` solo alcanza para elegir la frase; no alcanza para escribirla. `CATALOG_IN_USE`
   * viaja con cuantas filas lo usan y como se llaman, y sin esto habria que descartarlo y decir
   * "esta en uso" —que es justo el mensaje que no ayuda a nadie—.
   */
  readonly body: ApiErrorBody;

  constructor(body: ApiErrorBody, status: number) {
    super(body.title ?? 'Error de la API');
    this.name = 'ApiError';
    this.code = body.code ?? 'UNKNOWN_ERROR';
    this.status = body.status ?? status;
    this.retryAfter = body.retryAfter;
    this.body = body;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = opts;

  const lanzar = (token: string | null) => {
    const finalHeaders = new Headers(headers);
    finalHeaders.set('Accept', 'application/json');
    if (body !== undefined) {
      finalHeaders.set('Content-Type', 'application/json');
    }
    if (!skipAuth && token) {
      finalHeaders.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${API_URL}${API_PREFIX}${path}`, {
      ...rest,
      headers: finalHeaders,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await lanzar(accessToken);

  /*
    401 = el token caduco (dura 15 minutos). Se renueva UNA vez y se reintenta. Ver `renovarToken`:
    varias peticiones que caducan a la vez comparten un solo refresco, porque el servidor rota el
    token y refrescos en paralelo se invalidarian entre si.
  */
  if (response.status === 401 && !skipAuth && !esRutaDeSesion(path)) {
    const nuevo = await renovarToken();
    if (nuevo) {
      response = await lanzar(nuevo);
    }
    // Si tras refrescar sigue sin pasar, la sesion murio de verdad y se avisa al armazon.
    if (!nuevo || response.status === 401) {
      alPerderLaSesion?.();
    }
  }

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

/**
 * Convierte una ruta firmada del servidor en una URL absoluta contra la API.
 *
 * Hace falta porque el front y la API viven en origenes distintos: un `<img src="/v1/media/...">`
 * lo resolveria contra el front y daria 404. Lo descubrimos con el logo de la pantalla de ingreso,
 * que salia como texto alternativo.
 */
export function mediaUrlFromPath(path: string | null): string | null {
  return path ? `${API_URL}${path}` : null;
}

/**
 * A QUIEN ACUDIR si no se puede entrar (Decision #97).
 *
 * El campo `scope` dice de QUIEN es el contacto y cambia lo que la pantalla escribe alrededor: el
 * de la empresa resuelve en minutos porque puede restablecer la contrasena; el nuestro es el
 * respaldo de cuando la empresa todavia no ha puesto el suyo, y ahi hay que avisar de que la
 * respuesta tarda mas. Sin distinguirlos, la pantalla prometeria lo mismo en los dos casos.
 */
export interface TenantSupport {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
  scope: 'tenant' | 'platform';
}

export interface PublicTenant {
  name: string;
  branding: TenantBranding;
  /** El logo YA firmado: la pantalla de ingreso no tiene sesion para pedir la firma. */
  logoUrl: string | null;
  /** `null` cuando no hay ninguno de los dos configurados. */
  support: TenantSupport | null;
}

/**
 * Deja constancia de que alguien no puede entrar. Responde igual exista la cuenta o no.
 *
 * Por eso NUNCA lanza por 404 ni por 429: la pantalla no puede reaccionar distinto segun la
 * respuesta —eso convertiria el formulario en un comprobador de cedulas de la empresa— y quien
 * espera solo necesita saber que su aviso quedo puesto.
 */
export async function solicitarAyudaDeIngreso(tenantSlug: string, identifier: string): Promise<void> {
  await fetch(`${API_URL}/v1/auth/help-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantSlug, identifier }),
  }).catch(() => undefined);
}

/** Guarda o quita la foto de perfil. Opera siempre sobre la sesion actual, nunca sobre otro. */
export function setMyAvatar(avatarKey: string | null): Promise<{ avatarKey: string | null }> {
  return apiFetch('/auth/me/avatar', { method: 'PUT', body: { avatarKey } });
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
  /** El cargo, para la barra superior. `null` si el catalogo aun no lo tiene. */
  jobTitle: string | null;
  /** La foto de perfil que subio la persona. `null` = iniciales (Decision #105). */
  avatarKey: string | null;
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
