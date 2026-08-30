/**
 * SERVICE WORKER de NEO PULSE (Sprint 4). Escrito a mano y sin dependencias a proposito: lo que
 * se cachea aqui son datos de formacion de una persona identificada, y esa decision no se delega
 * a la configuracion por defecto de una libreria.
 *
 * QUE RESUELVE (DoD del Sprint 4: "un auxiliar de bodega completa una pildora desde el celular
 * sin senal estable"):
 *  1. La aplicacion ABRE sin red: el armazon y los estaticos estan en cache.
 *  2. Lo que ya vio sigue disponible: las respuestas de `/v1/me/...` se guardan al pasar y se
 *     sirven si la red falla. Cachear la leccion es lo que permite cursarla en la bodega.
 *  3. El avance NO se pierde: los envios de progreso que fallan se encolan en IndexedDB y se
 *     reintentan al volver la senal.
 *
 * DOS COSAS QUE ESTE WORKER NO HACE, Y ES DELIBERADO:
 *  - No inventa respuestas correctas. Un envio encolado devuelve 503, no un 202 falso: la
 *    pantalla ya sabe decir "guardaremos tu avance al recuperar senal", que es la verdad. Un
 *    exito fingido con una forma de respuesta que la interfaz espera seria mentirle al usuario y
 *    romperle el codigo.
 *  - No encola la ENTREGA de un examen ni las respuestas del repaso. Esas devuelven una nota y
 *    mueven el estado del intento; entregarlas a espaldas de la persona, horas despues y sin que
 *    vea el resultado, es peor que pedirle que lo intente con senal.
 */

const VERSION = 'v1';
const SHELL_CACHE = `neo-pulse-shell-${VERSION}`;
const DATA_CACHE = `neo-pulse-data-${VERSION}`;

/** Rutas del aprendiz que deben abrir sin red. */
const SHELL_ROUTES = ['/hoy', '/mi-formacion', '/repaso', '/perfil'];

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexion</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
background:#0e1114;color:#e8ebee;font-family:system-ui,sans-serif;text-align:center;padding:24px}
p{color:#8b96a1;margin-top:8px}</style></head><body><div><h1>Sin conexion</h1>
<p>Vuelve a intentarlo cuando tengas senal. Lo que hiciste no se perdio.</p></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Si una ruta falla no se aborta la instalacion: sin worker no hay nada offline, y es
      // peor quedarse sin ninguna que sin una.
      .then((cache) => Promise.allSettled(SHELL_ROUTES.map((route) => cache.add(route))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim())
      .then(() => flushQueue()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && isQueueableProgress(url)) {
    event.respondWith(sendOrQueue(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/v1/me/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Estaticos de Next e iconos: llevan hash en el nombre, asi que cache primero sin dudar.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
  }
});

/** El avance de contenido es acumulativo e idempotente: reenviarlo tarde es seguro. */
function isQueueableProgress(url) {
  return /\/v1\/me\/contents\/[^/]+\/progress$/.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match('/hoy'));
    if (cached) return cached;
    return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/**
 * Intenta enviar; si no hay red, guarda el envio COMPLETO (incluida la cabecera de autorizacion)
 * y devuelve 503 para que la pantalla lo diga con sus palabras.
 */
async function sendOrQueue(request) {
  const clone = request.clone();
  try {
    return await fetch(request);
  } catch (error) {
    await enqueue({
      url: clone.url,
      body: await clone.text(),
      authorization: clone.headers.get('Authorization'),
      queuedAt: Date.now(),
    });
    if ('sync' in self.registration) {
      try {
        await self.registration.sync.register('neo-pulse-progress');
      } catch {
        // Sin Background Sync se reintenta al volver a abrir o cuando la pagina avise.
      }
    }
    return new Response(JSON.stringify({ code: 'QUEUED_OFFLINE' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'neo-pulse-progress') event.waitUntil(flushQueue());
});

/**
 * Ultimo access token que vio la pagina. Existe porque el token dura 15 minutos y un envio
 * encolado puede reintentarse horas despues: reenviarlo con la cabecera vieja daria 401 y
 * perderiamos el avance de alguien por una razon puramente tecnica.
 */
let freshToken = null;

self.addEventListener('message', (event) => {
  const data = event.data ?? {};
  if (data.type === 'AUTH') freshToken = data.token ?? null;
  if (data.type === 'FLUSH_QUEUE') event.waitUntil(flushQueue());
  // Al cerrar sesion se borra el cache de datos: en un telefono compartido, la formacion de la
  // persona anterior no puede quedar legible.
  if (data.type === 'CLEAR_DATA') {
    freshToken = null;
    event.waitUntil(caches.delete(DATA_CACHE).then(() => clearQueue()));
  }
});

// ─────────────────────────── Cola en IndexedDB ───────────────────────────

const DB_NAME = 'neo-pulse-outbox';
const STORE = 'progress';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const result = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(result?.result ?? result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function enqueue(entry) {
  return withStore('readwrite', (store) => store.add(entry)).catch(() => undefined);
}

function clearQueue() {
  return withStore('readwrite', (store) => store.clear()).catch(() => undefined);
}

/**
 * Reenvia lo encolado en orden.
 *
 * Tres desenlaces distintos, y la diferencia importa:
 *  - red caida: se corta el barrido y todo queda para la proxima;
 *  - sesion caducada (401/403) o servidor ocupado (408/429): se conserva, porque el envio es
 *    valido y solo falto contexto. Perder el avance de alguien por un token vencido seria un
 *    fallo nuestro, no suyo;
 *  - rechazo real del servidor (400, 404, 409...): se descarta. Reintentarlo eternamente solo
 *    llenaria el telefono.
 */
const KEEP_ON_STATUS = new Set([401, 403, 408, 429]);

async function flushQueue() {
  let pending;
  try {
    pending = await withStore('readonly', (store) => store.getAll());
  } catch {
    return;
  }
  if (!pending || pending.length === 0) return;

  for (const entry of pending) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = freshToken ?? entry.authorization;
      if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const response = await fetch(entry.url, {
        method: 'POST',
        headers,
        body: entry.body,
        credentials: 'include',
      });
      if (!response.ok && (KEEP_ON_STATUS.has(response.status) || response.status >= 500)) return;
      await withStore('readwrite', (store) => store.delete(entry.id));
    } catch {
      // Sigue sin red: se deja en la cola y se corta el barrido.
      return;
    }
  }
}
