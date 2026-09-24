/**
 * Cliente HTTP tipado para la API de NEO PULSE (NestJS, prefijo /v1).
 * El access token vive SOLO en memoria (module-level): no se persiste en storage
 * para reducir superficie de robo por XSS. La sesion se recupera con /auth/refresh,
 * que usa la cookie httpOnly de refresh (por eso credentials:'include' siempre).
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
const API_PREFIX = '/v1';

let accessToken: string | null = null;

/*
  ─── LA SESION SE RENUEVA ANTES DE CADUCAR, NO DESPUES (2026-09-21) ───

  Lo reporto el cliente desde produccion: se deja la aplicacion abierta, se vuelve al rato, se pulsa
  otra opcion y en la consola sale `v1/catalogs/areas 401`, con la pantalla quieta un momento antes
  de cargar.

  No estaba roto: el token dura 15 minutos y vive solo en memoria; una pestaña quieta no lo renueva
  —nadie pide nada, nadie descubre que caduco— asi que el primer clic pagaba un 401, el refresco y
  el reintento. Funcionaba, pero cobrandole la espera a la persona y dejando un error rojo en la
  consola que parece un fallo y no lo es.

  Ahora se renueva **antes**, por dos caminos que cubren los dos casos reales:
    - un TEMPORIZADOR al 80% de la vida del token, para quien esta trabajando sin parar;
    - al VOLVER A LA PESTAÑA, para quien la dejo abierta — que es el caso reportado.

  ─── Y LA PARTE QUE HAY QUE HACER BIEN O ES PEOR EL REMEDIO ───

  El servidor **ROTA** el token de refresco en cada uso: el anterior deja de valer. Renovar mas a
  menudo, sin mas, multiplica el choque que ya conocemos (el incidente del 2026-08-29: una segunda
  pestaña tumbando la sesion de la primera). Dos renovaciones simultaneas = una invalida a la otra =
  a la calle.

  Tres frenos, y los tres hacen falta:
    1. **Un refresco a la vez DENTRO de la pestaña** (`refrescoEnCurso`, que ya estaba).
    2. **Un refresco a la vez ENTRE pestañas**, con `navigator.locks` — un cerrojo de verdad del
       navegador, no una bandera en `localStorage`, que no es atomica. Quien llega tarde al cerrojo
       se encuentra el token ya renovado y lo adopta en vez de pedir otro.
    3. **El token nuevo se reparte** por `BroadcastChannel`, asi que N pestañas cuestan UN refresco
       en vez de N. Es del mismo origen y el token ya vivia en la memoria de ese origen: no se
       expone nada que no estuviera expuesto.

  Si el navegador no trae `navigator.locks` o `BroadcastChannel`, todo esto degrada al
  comportamiento de antes —refrescar ante el 401— que sigue siendo correcto, solo que mas lento.
*/

/** Cuando caduca el token que tenemos, en epoch ms. `null` = no se sabe (sesion vieja o sin datos). */
let caducaEn: number | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
let canal: BroadcastChannel | null = null;

/** Se renueva al 80% de la vida: deja margen de sobra sin convertirlo en un refresco cada minuto. */
const FRACCION_DE_VIDA = 0.8;
/** Al volver a la pestaña, se renueva si le queda menos de esto. */
const MARGEN_AL_VOLVER_MS = 60_000;
/** Nunca se programa un temporizador mas corto: protege de un `expiresIn` absurdo del servidor. */
const MINIMO_ENTRE_RENOVACIONES_MS = 30_000;
/**
 * UNA PESTAÑA QUE NADIE TOCA DEJA DE RENOVARSE (2026-09-21).
 *
 * La cookie de refresco dura 7 dias **y se desliza en cada uso**: una pestaña abierta y visible,
 * renovando sola cada 12 minutos, mantendria la sesion viva para siempre. El problema no es el
 * gasto —son 5 peticiones por hora contra un endpoint diminuto, nada— sino que **una sesion no
 * deberia sobrevivir a la persona**: una pantalla desatendida en un puesto compartido se queda
 * dentro indefinidamente, y esta es una aplicacion donde se firma y se acredita.
 *
 * Asi es como lo acotan los sistemas serios: la vida de la sesion se ata a la ACTIVIDAD, no al
 * reloj. Pasado este rato sin una sola peticion de verdad, el temporizador deja de renovar y el
 * token muere solo. Quien vuelva despues se recupera por el camino de siempre —al volver a la
 * pestaña, o con el 401 y su reintento, que sigue ahi— porque la cookie aguanta 7 dias.
 *
 * Es un LIMITE, no un cierre de sesion forzado: echar a alguien a los N minutos es una decision de
 * politica del cliente, y esa no se toma desde aqui.
 */
const INACTIVIDAD_MAXIMA_MS = 30 * 60_000;

/** Ultima peticion de verdad (no un refresco). Es la señal de que hay alguien delante. */
let ultimaActividad = Date.now();

/** `"15m"`, `"900s"`, `"900"` → milisegundos. `null` si no se entiende, y entonces no se programa nada. */
function ttlEnMs(expiresIn: string | undefined): number | null {
  if (!expiresIn) return null;
  const match = /^(\d+)\s*([smhd])?$/.exec(expiresIn.trim());
  if (!match) return null;
  const cantidad = Number(match[1]);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] ?? 's'] ?? 1_000;
  return cantidad * factor;
}

function vidaRestanteMs(): number | null {
  return caducaEn === null ? null : caducaEn - Date.now();
}

function programarRenovacion(ttl: number | null): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  if (ttl === null || typeof window === 'undefined') return;
  const espera = Math.max(ttl * FRACCION_DE_VIDA, MINIMO_ENTRE_RENOVACIONES_MS);
  temporizador = setTimeout(() => {
    /*
      UNA PESTAÑA OCULTA NO RENUEVA. No hay nadie mirandola, y refrescar cuesta una rotacion del
      token que las demas pestañas tendrian que adoptar. Cuando vuelva a primer plano, el manejador
      de `visibilitychange` la pone al dia — que es exactamente el caso que originó todo esto.
    */
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    // Y una pestaña que nadie toca desde hace rato tampoco: ver `INACTIVIDAD_MAXIMA_MS`.
    if (Date.now() - ultimaActividad > INACTIVIDAD_MAXIMA_MS) return;
    void renovarToken(accessToken);
  }, espera);
}

/**
 * Adopta un token que renovo OTRA pestaña. No re-emite: eso seria un eco infinito entre pestañas.
 */
function adoptarToken(token: string | null, caduca: number | null): void {
  accessToken = token;
  caducaEn = caduca;
  programarRenovacion(caduca === null ? null : caduca - Date.now());
}

function difundir(token: string | null, caduca: number | null): void {
  canal?.postMessage({ tipo: 'token', token, caduca });
}

/**
 * Guarda el token de acceso. `expiresIn` es el TTL tal como lo emite la API (`"15m"`): con el se
 * programa la renovacion anticipada. Sin el, la sesion sigue funcionando por el camino de siempre
 * —refrescar ante el 401— pero pagando la espera.
 */
export function setAccessToken(token: string | null, expiresIn?: string): void {
  const ttl = token ? ttlEnMs(expiresIn) : null;
  accessToken = token;
  caducaEn = ttl === null ? null : Date.now() + ttl;
  programarRenovacion(ttl);
  difundir(accessToken, caducaEn);
}

/**
 * Arranca la renovacion automatica: el reparto entre pestañas y el aviso al volver a primer plano.
 * La llaman los dos armazones (panel y aprendiz) al montar, y devuelve su limpieza.
 *
 * Es explicito y no un efecto al importar el modulo porque este archivo tambien se carga en el
 * servidor durante el render de Next, donde no hay ni pestañas ni cerrojos.
 */
export function iniciarRenovacionAutomatica(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  if (!canal && typeof BroadcastChannel !== 'undefined') {
    canal = new BroadcastChannel('ascent-sesion');
    canal.onmessage = (evento: MessageEvent) => {
      const dato = evento.data as { tipo?: string; token?: string | null; caduca?: number | null };
      if (dato?.tipo === 'token') adoptarToken(dato.token ?? null, dato.caduca ?? null);
    };
  }

  const alVolver = () => {
    if (document.visibilityState !== 'visible' || !accessToken) return;
    const restante = vidaRestanteMs();
    // `null` = no sabemos cuando caduca (sesion abierta antes de este cambio): se renueva por si
    // acaso, que cuesta una peticion y evita el 401 con la espera delante.
    if (restante === null || restante < MARGEN_AL_VOLVER_MS) void renovarToken(accessToken);
  };
  document.addEventListener('visibilitychange', alVolver);

  return () => {
    document.removeEventListener('visibilitychange', alVolver);
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    canal?.close();
    canal = null;
  };
}

/** Un refresco a la vez entre TODAS las pestañas. Sin `navigator.locks`, se hace sin cerrojo. */
async function conExclusion<T>(fn: () => Promise<T>): Promise<T> {
  const cerrojos = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!cerrojos) return fn();
  return cerrojos.request('ascent-refresco', fn) as Promise<T>;
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

/**
 * Renueva el token. `tokenGastado` es el que se quiere sustituir —el que acaba de dar 401, o el que
 * esta a punto de caducar—; si al entrar en el cerrojo resulta que ya tenemos OTRO, es que otra
 * pestaña renovo mientras esperabamos y se adopta el suyo en vez de pedir uno mas.
 *
 * Esa comparacion es la que convierte N pestañas en UN refresco. Y se hace DENTRO del cerrojo a
 * proposito: comprobarlo fuera seria mirar el reloj antes de hacer la cola.
 */
async function renovarToken(tokenGastado: string | null): Promise<string | null> {
  refrescoEnCurso ??= (async () => {
    try {
      return await conExclusion(async () => {
        if (accessToken && accessToken !== tokenGastado) return accessToken;
        const renovado = await apiFetch<LoginResponse>('/auth/refresh', { method: 'POST', skipAuth: true });
        setAccessToken(renovado.accessToken, renovado.expiresIn);
        return renovado.accessToken;
      });
    } catch {
      setAccessToken(null);
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

  /*
    HAY ALGUIEN DELANTE. Se marca aqui y no con eventos de raton o teclado a proposito: una pagina
    abierta en un portatil recibe `mousemove` por el roce del dedo en el panel tactil, y eso no es
    trabajo. Una peticion a la API si: alguien pidio, guardo o navego. El propio refresco no cuenta
    —se excluye con `skipAuth`— o se daria vida a si mismo y este limite no serviria de nada.
  */
  if (!skipAuth) ultimaActividad = Date.now();

  const tokenUsado = accessToken;
  let response = await lanzar(tokenUsado);

  /*
    401 = el token caduco (dura 15 minutos). Se renueva UNA vez y se reintenta. Ver `renovarToken`:
    varias peticiones que caducan a la vez comparten un solo refresco, porque el servidor rota el
    token y refrescos en paralelo se invalidarian entre si.
  */
  if (response.status === 401 && !skipAuth && !esRutaDeSesion(path)) {
    // Se pasa el token CON EL QUE SE LANZO, no el actual: entre medias otra pestaña pudo renovarlo,
    // y en ese caso no hay nada que pedir — se reintenta con el suyo.
    const nuevo = await renovarToken(tokenUsado);
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

/**
 * La ficha propia, tal como la ve la persona en su perfil. Solo `email` y `phone` los cambia ella;
 * el resto es de la empresa y lo cambia quien administra o el archivo de personal.
 */
export interface MisDatos {
  documentNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** AAAA-MM-DD. */
  birthDate: string | null;
  hiredAt: string | null;
  employmentType: string;
  role: string;
  jobTitle: string | null;
  /** Con su rama: «Operaciones / Bodega Norte». */
  area: string | null;
  regional: string | null;
  service: string | null;
}

export function getMisDatos(): Promise<MisDatos> {
  return apiFetch('/auth/me/datos');
}

/** `''` quita el dato; ausente, no lo toca. */
export function updateMiContacto(input: { email?: string; phone?: string }): Promise<MisDatos> {
  return apiFetch('/auth/me/contacto', { method: 'PATCH', body: input });
}

export interface AuthUser {
  id: string;
  fullName: string;
  /** `null` = sin correo: esa persona entra con su cedula (Decision #10). */
  email: string | null;
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
  /** `null` = sin correo: esa persona entra con su cedula (Decision #10). */
  email: string | null;
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

/**
 * LO QUE EL SERVIDOR EXPLICO, para ponerlo debajo del titulo del aviso.
 *
 * ─── EL FALLO QUE OBLIGA A QUE ESTO EXISTA (2026-09-06) ───
 *
 * Lo reporto el cliente: publicar una convocatoria devolvia **409 en la consola** y la pantalla
 * decia "No se pudo publicar". La API si explicaba —*"Publica primero el contenido de la formacion.
 * Hasta entonces esta convocatoria puede quedar programada, pero no se puede abrir a la gente"*—
 * y el `catch` la tiraba a la basura.
 *
 * No era un caso: habia **55 `catch` vacios** haciendo lo mismo. Un servidor que se molesta en
 * decir QUE hacer y una pantalla que responde "no se pudo" convierte cada regla de negocio en un
 * misterio, y a quien la usa en alguien que prueba cosas a ver si alguna pasa.
 *
 * ─── POR QUE `message` Y NO `code` ───
 *
 * `ApiError.message` lleva el `title` del cuerpo, que es donde el filtro global de excepciones pone
 * la frase de la excepcion (ver la nota del RUNBOOK del 2026-09-04: *"el motivo de un 409 viaja en
 * `title`, no en `message`"*). El `code` sirve para DECIDIR —ramificar, contar, traducir— y no para
 * escribir: `VERSION_NOT_PUBLISHED` no le dice nada a nadie.
 *
 * Devuelve `undefined` cuando no hay nada util que enseñar —un fallo de red, un error sin cuerpo—
 * porque un aviso con una linea vacia debajo se lee peor que uno sin ella.
 */
export function motivoDelError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const texto = error.message?.trim();
  // "Error de la API" es el respaldo del constructor cuando el cuerpo no traia `title`: es ruido,
  // no explicacion.
  if (!texto || texto === 'Error de la API') return undefined;
  return texto;
}
