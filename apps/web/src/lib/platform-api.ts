import { API_URL, ApiError } from './api';

export interface PlatformActor {
  id: string;
  email: string;
  fullName: string;
}

export interface PlatformSettings {
  supportName: string;
  supportEmail: string;
  supportPhone: string;
  supportNote: string;
}

/**
 * EL TOKEN DE PLATAFORMA VIVE APARTE del de los tenants (Decision #100).
 *
 * En memoria, como el otro, y en una variable distinta: dar soporte es tener las dos sesiones
 * abiertas en el mismo navegador —la del proveedor y la del cliente que se esta mirando— y con una
 * sola variable cada ingreso pisaria al anterior. Las cookies de refresco tambien van separadas,
 * por nombre y por `path`.
 */
let platformToken: string | null = null;

export function setPlatformToken(token: string | null): void {
  platformToken = token;
}

let renovando: Promise<string> | null = null;

/**
 * Un solo refresco a la vez, igual que en el producto de tenants: la pantalla lanza varias
 * peticiones y el servidor ROTA el token, asi que dos refrescos en paralelo se invalidan entre si.
 */
async function renovar(): Promise<string> {
  renovando ??= (async () => {
    const response = await fetch(`${API_URL}/v1/platform/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new ApiError({ code: 'INVALID_REFRESH', title: 'Sesión de plataforma caducada' }, response.status);
    const data = (await response.json()) as { accessToken: string };
    platformToken = data.accessToken;
    return data.accessToken;
  })().finally(() => {
    renovando = null;
  });
  return renovando;
}

async function platformFetch<T>(path: string, init: RequestInit = {}, reintentado = false): Promise<T> {
  const response = await fetch(`${API_URL}/v1/platform${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(platformToken ? { Authorization: `Bearer ${platformToken}` } : {}),
      ...init.headers,
    },
  });

  // Un 401 casi siempre es el token de 15 minutos caducado, no una sesion muerta: se renueva y se
  // reintenta UNA vez. Sin esto, la pantalla se moria a los quince minutos de trabajo.
  if (response.status === 401 && !reintentado) {
    try {
      await renovar();
      return platformFetch<T>(path, init, true);
    } catch {
      platformToken = null;
      throw new ApiError({ code: 'PLATFORM_UNAUTHORIZED', title: 'Sesión de plataforma caducada' }, 401);
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError({ code: body.code ?? 'ERROR', title: body.message ?? 'No se pudo completar la operacion' }, response.status);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function platformLogin(email: string, password: string): Promise<PlatformActor> {
  const data = await platformFetch<{ accessToken: string; user: PlatformActor }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  platformToken = data.accessToken;
  return data.user;
}

/** Recupera la sesion al recargar. Devuelve `null` si no habia ninguna viva. */
export async function platformRestore(): Promise<PlatformActor | null> {
  try {
    await renovar();
    return await platformFetch<PlatformActor>('/me', { method: 'GET' });
  } catch {
    return null;
  }
}

export function platformLogout(): Promise<void> {
  platformToken = null;
  return platformFetch<void>('/auth/logout', { method: 'POST' });
}

export function getPlatformSettings(): Promise<{ settings: PlatformSettings }> {
  return platformFetch('/settings', { method: 'GET' });
}

export function putPlatformSettings(settings: PlatformSettings): Promise<{ settings: PlatformSettings }> {
  return platformFetch('/settings', { method: 'PUT', body: JSON.stringify(settings) });
}
