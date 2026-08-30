# NEO PULSE — RUNBOOK (memoria operativa)

Solo se ANEXA o se corrige; no se reescribe entre sesiones. Lo aprendido rompiendo algo va aqui.
El diario de sesiones (que se hizo cada dia, que quedo abierto) vive en `docs/HANDOFF.md`.

## Entorno de desarrollo (decidido 2026-08-25)

- **Node NATIVO de Windows** (Node 24 LTS via winget + pnpm 9.12.0 global de usuario). Los
  comandos se corren desde PowerShell sobre el repo en Documents.
- **RAZON (leccion medida):** WSL accede a `/mnt/c` por el puente 9P; con node_modules grande los
  builds se degradan 10-30x. Medido el 2026-08-25: build de la API 5+ min en WSL vs 22 s nativo;
  web >10 min (no termino) vs 97 s nativo; shared minutos vs 2.7 s. Es la misma causa de la
  lentitud cronica que sufrio SAC-NEO ("al principio rapido, despues todo lento").
- WSL queda SOLO para utilidades shell (openssl, etc.). Los e2e (Playwright) corren nativos.
- OJO: si una sesion de PowerShell no encuentra node/pnpm, refrescar PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + "$env:APPDATA\npm"`
- node_modules instalado por Linux NO sirve para Windows (binarios de plataforma): si se cambia
  de runtime, `pnpm install --force`.

## Comandos canonicos (desde la raiz del repo, PowerShell)

```
pnpm docker:up          # Postgres 5433 + Redis 6380 (proyecto compose: neo-pulse)
pnpm db:migrate         # prisma migrate dev (owner)
pnpm db:rls             # aplica prisma/sql/rls.sql (docker exec psql)
pnpm db:seed            # seed Transprensa (idempotente)
pnpm db:verify-rls      # prueba de aislamiento multi-tenant (3 chequeos) — debe pasar SIEMPRE
pnpm dev                # api :3002 + web :3100
pnpm lint / typecheck / test / build
pnpm test:e2e           # Playwright (levanta api y web solo; requiere build previo)
pnpm test:e2e:ui        # modo interactivo para depurar un test
```

Credenciales seed (solo dev): tenant `transprensa`.
- Administrador real: `999999999` / `Transprensa2026*` — pide cambio de contrasena y aceptacion
  de Habeas Data + firma electronica en el primer ingreso (comportamiento de produccion).
- Usuario de PRUEBAS automatizadas: `888888888` / `PruebaE2E2026*` — rol ADMIN, contrasena ya
  cambiada y politicas aceptadas, para que los e2e sean repetibles. NUNCA se crea con
  NODE_ENV=production (ver `seedE2EUser` en prisma/seed.ts).

## Pruebas

- Unitarias (Jest, en `apps/api/src/**/*.spec.ts`): logica de dominio pura.
  Nota: Jest usa `moduleNameMapper` para resolver los imports con extension `.js` (NodeNext).
- Aislamiento multi-tenant: `pnpm db:verify-rls`. Compuerta DURA del CI; si falla, no se mergea.
- E2E (Playwright, en `e2e/`): un archivo por sprint, acumulativo. Localizar por `id` cuando el
  campo es obligatorio: el asterisco del label cambia el texto accesible y `getByLabel(..., {exact:true})` falla.
- CI (`.github/workflows/ci.yml`): job `calidad` (lint/typecheck/build/unit) + job `integracion`
  (Postgres de servicio, migrate, RLS via psql, seed, verify-rls, e2e con reporte adjunto si falla).

## Aislamiento con SAC-NEO

Ver `docs/02-aislamiento-proyectos.md` (tabla de puertos/volumenes/nombres reservados). Resumen:
NEO PULSE = compose `neo-pulse`, PG 5433, Redis 6380, API 3002, web 3100, roles `neopulse*`.

## Incidentes y lecciones

### 2026-08-25 — Colision de proyecto Docker Compose con SAC-NEO
El primer `up` (compose aun sin `name:`) recreo los contenedores de SAC-NEO porque ambos compose
viven en carpeta `docker/` y Compose usa el nombre de carpeta como proyecto. Recuperado sin
perdida (los volumenes no se tocan con up/down; JAMAS usar `down -v` en recuperacion). Blindaje:
`name: neo-pulse` aqui, `name: docker` congelado en SAC-NEO, y el doc de aislamiento.

### 2026-08-25 — RLS: `current_setting` devuelve cadena vacia, no NULL
Tras un `SET LOCAL` revertido, `current_setting('app.tenant_id', true)` queda como `''` en la
sesion del pool y `''::uuid` lanza 22P02 rompiendo la query. Las policies usan
`NULLIF(current_setting(...), '')::uuid` (evalua a NULL = cero filas, sin error). Lo descubrio
`scripts/verify-rls.ts` — por eso ese script corre en CI y no se quita.

### 2026-08-25 — Como funciona de verdad el versionado (Sprint 2)
Lo que garantiza que "lo que alguien curso" no cambie nunca:
- Publicar una version de actividad CLONA las lecciones referenciadas a copias con estado
  PUBLISHED, y la version publicada apunta a los clones. Las lecciones PUBLISHED rechazan toda
  edicion (`LESSON_NOT_EDITABLE`). La leccion original queda en DRAFT para la siguiente version.
- "Editar lo publicado" no edita: crea la version N+1 en DRAFT copiando contenidos y clonando
  de vuelta las lecciones como DRAFT editables.
- Verificado de punta a punta: tras editar la leccion de la v2, la leccion de la v1 conserva sus
  tarjetas originales. Es LA prueba del sprint (script de humo en scratchpad, e2e en `e2e/sprint-2.spec.ts`).
- Publicar valida antes: version sin contenidos o con contenidos sin material asignado se rechaza
  (`VERSION_EMPTY`, `CONTENT_INCOMPLETE`); una seccion aleatoria que pida mas preguntas de las que
  existen tambien (`NOT_ENOUGH_QUESTIONS`).

### 2026-08-25 — Donde vive la respuesta correcta de una pregunta
Solo en `apps/api/src/assessments/question-payload.ts`. Ningun otro servicio arma la vista de una
pregunta. `toLearnerView()` es la UNICA forma de servir una pregunta a quien la responde: quita
`correct` y tambien la retroalimentacion por opcion (que la delataria). Hay una prueba que falla
si alguien filtra esos campos. Al escribir el reproductor de examenes (Sprint 4), usar esa
funcion y no construir la vista a mano.

### 2026-08-25 — Trampa de PowerShell con scripts generados
PowerShell 5.1 lee los `.ps1` como ANSI si no tienen BOM: un guion largo o una tilde desbalancea
las comillas y da "Falta la cadena en el terminador" apuntando a la ultima linea (mensaje
enganoso). Escribir los scripts de utilidad en ASCII puro o guardarlos con BOM UTF-8.

### 2026-08-27 — Una fecha de calendario NO es un instante (Sprint 3)
`users.hired_at` es `@db.Date`: el driver la entrega como **medianoche UTC**. Aplicarle el desfase
de Bogota (como se hace con un timestamp real) la corre un dia: "ingresa el 1 de diciembre" se
leia como 30 de noviembre y TODOS los vencimientos anclados al ingreso quedaban un dia antes.
Hay dos funciones separadas a proposito en `due-date.ts`: `toBogotaDate` (instantes) y
`fromDateOnly` (columnas de solo fecha). Lo detecto el e2e porque comprueba la **fecha exacta**,
no solo que fuera anterior al ingreso — de ahi la leccion secundaria: en fechas, afirmar el valor
exacto y no una desigualdad.

### 2026-08-27 — Crear migraciones sin terminal interactiva
`prisma migrate dev` es interactivo y falla en esta sesion ("environment is non-interactive").
La via que funciona:
```
docker exec neo-pulse-postgres psql -U neopulse -d postgres -c "CREATE DATABASE neopulse_shadow;"   # una vez
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma `
  --shadow-database-url "postgresql://neopulse:neopulse_dev@localhost:5433/neopulse_shadow" --script
# se revisa el SQL, se guarda en prisma/migrations/<timestamp>_<nombre>/migration.sql y luego:
DATABASE_URL=<url del owner> npx prisma migrate deploy
```
OJO: `migrate deploy` necesita el usuario **owner** (`neopulse`), no `neopulse_app` (que esta bajo
RLS y no puede alterar tablas). Las credenciales estan en `apps/api/.env`.

### 2026-08-27 — El SQL crudo NO pasa por el cliente atado al tenant
`forTenant()` envuelve las operaciones de **modelos**, no `$queryRaw`. Una consulta cruda fuera de
`prisma.tx(...)` corre sin `app.tenant_id` y RLS la deja sin filas (o falla). Por eso
`SequenceService.next()` exige recibir el cliente de transaccion: ahi el `set_config` ya ocurrio.

### Decisiones de auth que no hay que rediscutir
- El tenant se resuelve ANTES del login (slug por subdominio; en dev `?tenant=` o
  NEXT_PUBLIC_DEV_TENANT). Por eso NO existe cliente Prisma "owner" en runtime: login corre
  bajo RLS con `forTenant()`. (Mejora sobre SAC-NEO, que arrastra un findFirst pre-tenant.)
- Cookie de refresh: `np_refresh` = `userId.tenantId.token`, httpOnly, path /v1/auth, rotacion
  en cada uso, hash SHA-256+pepper (no argon2: el token ya es aleatorio de 384 bits).
- Bloqueo por cuenta: 5 intentos -> 15 min (env AUTH_*). Auditado en audit_logs.

### 2026-08-27 — Iconos de la PWA: se generan, no se suben
`apps/web/public/icons/` no se edita a mano. Los cuatro PNG (192, 512, maskable 512 y el de iOS)
salen de:
```
node scripts/generate-icons.mjs
```
El script dibuja el pulso de la marca y codifica el PNG con `zlib` (sin dependencias). Cambiar el
icono es cambiar la constante `PULSE` o los colores del script: asi la revision es un diff legible
y se puede sacar cualquier tamano nuevo que pida una plataforma.

### 2026-08-27 — El service worker se queda pegado entre despliegues
`public/sw.js` usa `VERSION = 'v1'` en el nombre de los caches. **Al cambiar lo que se cachea hay
que subir esa version**: en `activate` se borra todo cache cuyo nombre no coincida. Si no se sube,
un telefono puede seguir sirviendo el armazon viejo despues de un despliegue.

Para depurar en el telefono: Chrome -> `chrome://inspect` -> Service Workers -> "Unregister", y
recargar. Los envios encolados viven en IndexedDB, base `neo-pulse-outbox`, almacen `progress`.

### 2026-08-27 — Node no siempre esta en el PATH de la sesion
Si `pnpm` responde "no se reconoce", la sesion no heredo el PATH del perfil. En PowerShell:
```
$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:PATH"
```
No es un problema del proyecto; pasa al abrir una terminal sin perfil cargado.

### 2026-08-27 — E2E: seleccionar el texto de una opcion de quiz
En el editor de lecciones, las filas de opciones de una tarjeta QUIZ no tienen `id` ni
`placeholder`: lo unico estable es el nombre accesible del radio de "opcion correcta". El e2e llega
al campo desde ahi:
```ts
page.getByRole('radio', { name: 'Marcar opcion 1 como correcta' })
    .locator('xpath=following-sibling::input[1]')
```
Leccion general: cuando un e2e no encuentra por donde agarrar un campo, la salida NO es un
`nth(0)` sobre `input` — es apoyarse en el nombre accesible del elemento vecino, que ademas es lo
que usa un lector de pantalla.

### 2026-08-27 — NUNCA correr `next build` con el servidor de desarrollo levantado
Sintoma: la aplicacion abre pero se queda en "Cargando..." para siempre. En el log del servidor
web, todo el JavaScript y el CSS responden 404:
```
GET /_next/static/chunks/main-app.js       404
GET /_next/static/chunks/app/login/page.js 404
GET /_next/static/css/app/layout.css       404
GET /login                                 200
```
El HTML llega, React no hidrata, y lo unico que se ve es el render inicial.

Causa: `next build` y `next dev` comparten el directorio `.next`. El build pisa los chunks que
el dev server esta sirviendo; si ademas el build falla a mitad (en Windows aparece como
`uncaughtException Error: spawn UNKNOWN`), `.next` queda inconsistente y el dev server sirve 404
hasta que se limpie.

Arreglo:
```
# detener el dev server primero
Remove-Item -Recurse -Force apps/web/.next
pnpm --filter @neo-pulse/web dev
```
Y en el navegador, recarga forzada (Ctrl+Shift+R): los 404 quedan cacheados.

Regla: para verificar un build, se BAJA el dev server antes. Si hace falta comprobar ambos, usar
`next build` con `--distDir` aparte.

### 2026-08-27 — Ningun archivo subido se veia: 401 en `<img>` y `<video>`
Sintoma: se sube un video o una imagen, el administrador la ve listada, pero en pantalla no
aparece nada. En la consola del navegador, `GET /v1/media/file/...` devuelve **401**.

Causa: el endpoint que sirve archivos exigia la cabecera `Authorization`, y una etiqueta HTML
(`<img>`, `<video>`, `<iframe>`) NO puede enviarla — el token vive en memoria y solo lo adjunta
`apiFetch`. La cookie de refresco tampoco viaja: su `path` es `/v1/auth`. Resultado: **todo el
material subido estaba roto desde siempre** (imagenes de tarjetas, videos y documentos), no solo
un caso.

Arreglo (patron de URL prefirmada, el que ya prescribe CLAUDE.md 11):
- `GET /v1/media/sign?key=...` — **exige sesion**, comprueba que la clave sea del tenant de quien
  pide y devuelve una ruta firmada con caducidad de 1 hora.
- `GET /v1/media/file/:key?e=<caducidad>&t=<firma>` — **publico pero firmado**. Valida HMAC con
  comparacion de tiempo constante, y saca el tenant del prefijo de la clave (que la firma acaba
  de garantizar). Sin sesion no hay contexto de empresa, por eso se usa `forTenant(...)` y no
  `scoped`.
- En el frontend, `mediaUrl()` (sincrono) se sustituye por `useMediaUrl()` y por los componentes
  `<MediaImage>` / `<MediaVideo>`: resolver la firma es asincrono y una funcion no puede esperar.

Secreto: `MEDIA_URL_SECRET`. Si no esta, reusa `REFRESH_TOKEN_PEPPER`. **En produccion hay que
fijarlo**, igual que el pepper.

Comprobacion rapida de que sigue bien (debe dar 200 sin token, y fallar con la firma tocada):
```
# 1. pedir firma con sesion   2. descargar SIN cabecera de autorizacion
curl -H "Authorization: Bearer $TOKEN" "$API/media/sign?key=$KEY"
curl -i "$API/media/file/$KEY_URLENCODED?e=...&t=..."
```

### 2026-08-27 — Formaciones de demostracion con video
`node scripts/demo-video.mjs "<ruta del mp4>"` crea dos formaciones publicadas, convocadas y
asignadas: una con video ENLAZADO (YouTube) y otra con video SUBIDO. Va por la API, no por
Prisma, a proposito: recorre los mismos endpoints que la interfaz, asi que si algo esta roto para
el administrador, el script se rompe igual.

Es idempotente PASO A PASO (publicar, convocar, asignar), no "todo o nada". La primera version se
saltaba la formacion entera si la actividad ya existia, y un fallo a mitad dejaba formaciones que
existian pero no le aparecian a nadie.

### 2026-08-27 — La convocatoria NO seguia a la version nueva (y la politica de migracion no la leia nadie)
Publicar la v2 de una formacion retiraba la v1 y movia `activities.current_version_id`, pero la
convocatoria seguia apuntando a la v1: el administrador creia haber actualizado el contenido y el
aprendiz seguia cursando el anterior, sin nada en pantalla que lo dijera. La `migration_policy`
que se elegia AL PUBLICAR se guardaba y no la consultaba ningun codigo: era decorativa.

Como quedo:
- `GET /v1/offerings/:id/version-upgrade` responde QUE PASARIA (version destino, politica y el
  reparto de inscritos). `available: false` con motivo — `UP_TO_DATE`, `OFFERING_CLOSED`,
  `NO_PUBLISHED_TARGET` — no es un error: es lo que la pantalla necesita para no ofrecer un boton
  que dara error.
- `POST /v1/offerings/:id/migrate-version` lo aplica. Pasa por la misma compuerta que publicar
  (`offerings:publish`, con aprobacion si no se tiene).
- La regla de a quien mueve vive aparte y probada: `apps/api/src/offerings/version-migration.ts`
  (+ su `.spec`, 9 pruebas). Dos frenos que NINGUNA politica levanta: una ejecucion cerrada nunca
  cambia de version, y quien ya tiene otra ejecucion abierta de la version destino se queda donde
  esta (moverlo dejaria dos ejecuciones suyas de la misma version y `saveProgress` busca por
  `userId + activityVersionId`: no sabria en cual guardar).
- La version destino viaja EXPLICITA en el cuerpo. Si alguien publico otra mientras la pantalla
  estaba abierta, responde `VERSION_SUPERSEDED` en vez de mover gente a algo que nadie reviso.
- No se borra el avance del que se mueve: queda apuntando a los contenidos de la version vieja.
  Como `CompletionService` cuenta contra los contenidos de la version DE LA EJECUCION, ese avance
  deja de contar solo y sigue ahi para auditoria.

OJO con los examenes: al crear la version N+1 se copia el mismo `assessment_version_id`, asi que
un examen ya aprobado sigue aprobado despues de migrar — incluso con `RESTART_NEW`. Es lo correcto
mientras el examen no cambie; si cambia, es otra version de evaluacion y hay que volver a rendirlo.

Sin migracion de base de datos: el esquema del Sprint 0 ya traia todo.

### 2026-08-27 — Un video de YouTube SI se puede comprobar
La deuda decia que un video enlazado quedaba como declaracion de la persona porque el reproductor
es de otra plataforma. Cierto con un `<iframe>` pelado; falso con la API del reproductor de
YouTube, que responde `getCurrentTime()` y `getDuration()`. Ahora se miden los mismos SEGUNDOS
DISTINTOS que en un archivo propio y el paso se bloquea hasta el minimo de la formacion.

- Componente: `apps/web/src/components/modules/learner/youtube-player.tsx`. Carga
  `https://www.youtube.com/iframe_api` UNA vez por pagina (`onYouTubeIframeAPIReady` es un global
  unico: dos reproductores definiendolo se pisan).
- **Degrada, no bloquea.** Si el script no carga en 8 s —red corporativa que lo bloquea, video
  restringido— avisa `onMeasurable(false)`, se dibuja el iframe de siempre y la pantalla vuelve al
  boton de confianza. Dejar a alguien sin poder avanzar por una razon que no es suya seria peor.
- Vimeo y el resto siguen siendo declaracion: cada plataforma tiene su SDK y sostener uno que
  nadie usa es deuda, no rigor.
- El avance viaja con `evidence: MEASURED | DECLARED`, se guarda en `activity_progress.data` y en
  `learning_events.result`. Se conserva en su PEOR forma: si algo se dio por visto con una
  declaracion, un envio posterior medido no lo asciende a MEDIDO. Ante un auditor vale como se
  supo la primera vez.

Como comprobarlo a mano (no hay e2e: exige red y el reproductor de un tercero):
```
pnpm db:seed:demo          # deja un aprendiz 111222333 / Aprendiz2026*
# entrar como el aprendiz, abrir una formacion con video ENLAZADO y, en la consola:
document.querySelector('iframe[src*="youtube"]').contentWindow.postMessage(
  JSON.stringify({event:'command', func:'seekTo', args:[188, true]}), '*');
```
Verificado el 2026-08-27: con la reproduccion en 3:08 de 3:13, el contador marcaba **75%** y
"Terminar" seguia bloqueado. Adelantar deja hueco y no cuenta. Si algun dia el contador sube igual
que la barra del reproductor, alguien cambio el conjunto de segundos por la posicion maxima.

### 2026-08-27 — `pnpm db:verify-rls` no existia en la raiz
El RUNBOOK lo prescribia y el script solo estaba en `apps/api`. Se agrego el atajo a la raiz; el
comando de arriba ya funciona tal como esta escrito.

### 2026-08-28 — Rasterizar un PDF en Node: pdf.js no dibuja solo en el lienzo que le das
Para convertir una presentacion en imagenes hay que rasterizar el PDF en el servidor, y ahi
aparece la trampa: pdf.js **crea sus propios lienzos** para los grupos de transparencia y luego los
compone con `drawImage`. Su fabrica por defecto necesita `document`, que en Node no existe, y si se
le pasa un lienzo de otra libreria el suyo no lo reconoce:

```
Value is none of these types `CanvasElement`, `SVGElement`, `ImageBitmap`...
```

La salida es pasarle la fabrica **como CLASE** en `getDocument({ CanvasFactory })` —asi la pide, y
la instancia el— para que TODOS los lienzos, el nuestro y los suyos, salgan de `@napi-rs/canvas`.
Ver `apps/api/src/storage/slide-converter.service.ts`.

Dos detalles que se pagan si se olvidan:
- **Fondo blanco explicito** antes de renderizar. Un PDF sin fondo se rasteriza transparente, y una
  diapositiva transparente sobre el fondo oscuro del reproductor no se lee.
- **WebP, no PNG.** Con PNG cada diapositiva pesaba ~1,4 MB (12 MB por una presentacion de once).
  WebP con calidad 82 da la misma lectura por una fraccion: la misma presentacion salio a 59 KB por
  diapositiva.

### 2026-08-28 — PowerPoint necesita LibreOffice, y hay que decirlo ANTES de subir
El PDF se convierte en proceso y funciona en cualquier maquina. PPT/PPTX/ODP no: exigen LibreOffice
en modo consola. Si no esta, subir un `.pptx` fallaria despues de esperar la subida entera, que es
la peor forma de enterarse.

- La pantalla pregunta al abrir el cajon (`GET /v1/media/presentation/capabilities`) y el campo
  dice la verdad antes de que nadie elija el archivo. Si falta, el mensaje ofrece la salida:
  exportar a PDF desde PowerPoint, que es un clic y da el mismo resultado.
- Instalarlo en Windows: `winget install TheDocumentFoundation.LibreOffice`. En Debian/Ubuntu:
  `apt-get install -y libreoffice-impress`. Si esta en una ruta rara, `LIBREOFFICE_PATH`.
- La ruta se resuelve UNA vez por proceso y se recuerda **incluido el fallo**: preguntar por el
  binario en cada subida no cambia la respuesta y solo retrasa el error. Ojo con eso al depurar:
  si instalas LibreOffice con la API levantada, hay que reiniciarla.
- Cada conversion usa su propio directorio Y su propio perfil (`-env:UserInstallation=...`).
  LibreOffice guarda estado en el perfil y dos conversiones a la vez sobre el mismo perfil se
  pisan: la segunda termina sin escribir nada, y en silencio.

Verificado de punta a punta el 2026-08-28: una presentacion de 11 diapositivas tardo ~6 s en
convertirse y se sirvio en WebP a ~59 KB por diapositiva.

### 2026-08-28 — Un PPTX y un XLSX son el mismo ZIP para la firma binaria
La validacion por firma binaria (`magic-bytes.ts`) es lo correcto para todo lo demas, pero aqui no
alcanza: un `.pptx`, un `.xlsx` y un `.docx` son los tres un ZIP y tienen la misma cabecera. Lo
unico que los separa es la **extension**, asi que la ruta de presentaciones acepta `DOCUMENT` (el
PDF) o `ARCHIVE` **solo si ademas se llama** `.ppt`/`.pptx`/`.odp`. No es relajar la regla: la
firma sigue decidiendo que el archivo no es un ejecutable disfrazado.

### 2026-08-28 — Una barra fija que se va con el scroll: `min-h-screen` no contiene nada
Al darle chrome al reproductor (barra superior + indice a la derecha), bajar a leer las pestanas se
llevaba por delante las dos cosas. El motivo no es el `position` de la barra: es que con
`min-h-screen` la que se desplaza es la PAGINA, y dentro de una pagina que crece no hay nada que
"fijar" sin sacarlo del flujo.

La forma correcta en una disposicion de columnas es acotar la altura y elegir quien desborda:

```
raiz          h-screen overflow-hidden      <- la ventana no se desplaza
columna       flex min-h-0 flex-1 flex-col  <- min-h-0 o el hijo nunca encoge
escenario     flex-1 overflow-y-auto        <- el UNICO que se desplaza
```

El `min-h-0` es el que se olvida: por defecto un hijo flex tiene `min-height: auto`, se niega a
encoger por debajo de su contenido y empuja el alto del padre, asi que el `overflow-y-auto` del
nieto no llega a activarse nunca y el desbordamiento sube hasta la pagina.

### 2026-08-28 — La sesion del aprendiz se cae al navegar a pelo durante las pruebas
Al abrir una URL del reproductor escribiendola en la barra tras un rato inactivo, la pantalla vuelve
al login. No es un fallo: el token de acceso vive solo en memoria y dura 15 minutos (Decision de
auth), asi que una navegacion completa despues de ese rato no lo lleva. Al probar a mano conviene
entrar por la aplicacion o volver a iniciar sesion; no hay nada que arreglar.

### 2026-08-28 — Las diapositivas salian SIN TEXTO, y nada lo delataba
Una presentacion convertida se veia: fondos, recuadros, la franja de color. El texto no. Ningun
error, ningun 500: imagenes correctas y vacias.

Dos causas encadenadas, y la segunda es la que hay que recordar:

1. **pdf.js no trae las 14 fuentes estandar.** Un PDF puede referirse a Helvetica, Times o Courier
   SIN incrustarlas —lo hace cualquier exportador simple— y entonces las pone el lector. Sin
   `standardFontDataUrl` avisa `getPathGenerator - ignoring character` y no dibuja una sola letra.
   En Node se le pasa una **ruta de disco terminada en separador**, NO una URL: con `file://`
   intenta descargarla con `fetch`, que no admite ese esquema, y falla en silencio.
2. **El arreglo no llegaba a correr.** Se resolvio la ruta con `createRequire(import.meta.url)` y
   este paquete compila a **CommonJS** (`nest build`), donde `import.meta` es un error de
   compilacion. `nest start --watch` dejo de compilar y **siguio sirviendo el `dist` anterior**: la
   API respondia 201 a cada subida y seguia produciendo laminas en blanco. La pista estaba en la
   salida del `dev`, no en la respuesta HTTP.

```
Found 1 error. Watching for file changes.
  error TS1470: The 'import.meta' meta-property is not allowed in files which will build into CommonJS output.
```

Regla que queda: **cuando algo se arregla y no cambia nada, mirar la salida del watch antes que el
codigo.** Y `pnpm --filter @neo-pulse/api typecheck` NO basta: usa `tsconfig.json` (NodeNext) y no
el `tsconfig.build.json` del `nest build`. Antes de dar por bueno un cambio en la API, correr
tambien `pnpm --filter @neo-pulse/api build`.

Como se comprueba en un vistazo: una lamina convertida pesa ~14 KB con texto y ~4 KB sin el.
```
ls -la apps/api/storage-dev/<tenant>/presentation/<archivo>.slides/001.webp
```

**Las presentaciones subidas ANTES de este arreglo tienen las imagenes en blanco y no se reparan
solas: hay que volver a subir el archivo**, porque las diapositivas se convierten una vez.

### 2026-08-29 — Las e2e fallaban "al azar" porque yo estaba navegando con SU cuenta
Sintoma: la suite completa fallaba un test DISTINTO en cada corrida, todos pasaban en aislamiento y
tardaba 5,8 minutos en vez de 3. Es el sintoma clasico de una prueba fragil, y la explicacion facil
—"la maquina va cargada"— era falsa.

Lo que pasaba: el **token de refresco ROTA en cada uso** y su hash vive en `users.refresh_token_hash`,
una fila por persona. Basta con tener el navegador abierto en la aplicacion **con la misma cuenta
que usan las pruebas** (`888888888`) para que cada refresco de la pestana invalide el de la prueba, y
al reves. La prueba se queda sin sesion a mitad y termina esperando un boton en la pantalla de login.

Como se encuentra, y es lo que hay que recordar: **Playwright guarda el arbol de la pagina en el
momento del fallo**, y ahi se ve el login en vez de la pantalla esperada.
```
test-results/<nombre-del-test>/error-context.md
```
Si el snapshot dice "Iniciar sesion", no es lentitud: es que la sesion se cayo.

Reglas que quedan:
- **La cuenta `888888888` es de las pruebas. No navegar con ella.** Para mirar el panel a mano, usar
  otra cuenta de administrador.
- Antes de correr la suite, sacar el navegador de la aplicacion. No basta con dejarlo en `/login`:
  esa pantalla tambien monta la sesion e intenta refrescar. Llevarlo a otra direccion (por ejemplo
  `http://localhost:3002/v1/health`) o cerrar la pestana.
- Rotar el refresco es CORRECTO y no se toca: es lo que impide reutilizar un token robado. Lo que
  hay que arreglar es la costumbre, no la seguridad.

Verificado el 2026-08-29: con el navegador fuera de la aplicacion, **12/12 en 2,9 minutos**.

### 2026-08-29 — La sesion de Claude Code se cae y el terminal empieza a escribir solo
Sintoma: la sesion muere a mitad de un trabajo largo, aparece el prompt pelado
(`PS C:\Users\Prueba>`) y **cada movimiento del raton escribe basura**:
```
[<35;62;33M[<35;62;34M[<35;63;34M...
```

**No hay nada roto.** Son reportes de posicion del raton. Una aplicacion de consola con interfaz
propia (Claude Code, y tambien la interfaz de turbo 2.x) le pide al terminal "avisame de todo lo
que haga el raton" (`ESC[?1003h`) y al salir limpiamente lo apaga (`ESC[?1003l`). Si muere sin
apagarlo, quien queda al mando es PowerShell, que no sabe consumir esos reportes y los imprime
como texto. Es cosmetico y vive solo en esa ventana: ni el proyecto ni el disco se tocan.

**Como se arregla.**
```
powershell -File "$HOME\Documents\Transprensa - NEO PULSE\scripts\arreglar-terminal.ps1"
```
Se escribe a ciegas aunque la pantalla este llena de basura; primero Enter para limpiar la linea.
Alternativa que siempre funciona: abrir una pestana nueva de Windows Terminal (Ctrl+Shift+T) — el
estado roto es de la instancia de consola, no del sistema.

**La sesion NO se pierde.** La transcripcion se guarda en disco segun se escribe:
```
claude --resume      # lista las sesiones y se elige la que se cayo
claude --continue    # reanuda directamente la ultima de esa carpeta
```

**Por que se cayo, que es lo que importa.** En la caida del 2026-08-29 la ultima entrada de la
transcripcion registra `cache_read_input_tokens: 727096` — la sesion arrastraba **727 mil tokens de
contexto** (transcripcion de 9 MB, 2901 entradas) y estaba lanzando la suite completa en primer
plano (`pnpm --filter @neo-pulse/api test ... && pnpm test:e2e`, 15 minutos). Se murio esperando la
salida de ese comando. **No fue la actualizacion**: la ultima se instalo el dia anterior a las
13:52 y termino en exito.

Reglas que quedan:
- **Antes de una corrida larga con la sesion ya muy cargada, `/compact`** — o cerrar y abrir sesion
  nueva. Correr 15 minutos de pruebas con 700k de contexto encima es donde se rompe.
- **Los comandos largos, al fondo** (ctrl+b en Claude Code). Ademas asi la salida no inunda la
  interfaz.
- **Sacar la salida a un archivo** en vez de tragarsela entera cuando es enorme:
  `pnpm test:e2e > test-results/e2e.log 2>&1` y luego mirar el archivo.
- Corolario del incidente de las e2e de mas arriba: la suite tarda ~3 minutos con el navegador
  fuera de la aplicacion, y ~6 con la cuenta `888888888` abierta. La mitad del riesgo de este
  incidente se quita respetando aquella regla.

### 2026-08-29 — "Update installed · Restart to update": no hay prisa, y no se reinicia a mitad
El aviso significa que la version nueva **ya esta descargada e instalada en disco**. El proceso que
esta corriendo sigue con la vieja en memoria, y seguira funcionando perfectamente hasta que se
cierre. No es un error, no es una cuenta atras y no hay riesgo en ignorarlo.

Que hacer: **terminar lo que se este haciendo, cerrar la sesion como se cierra siempre (`/exit`) y
volver a abrir `claude`**. Con eso ya corre la version nueva. Lo que NO hay que hacer es reiniciar
en mitad de una tarea ni cerrar la ventana del terminal a lo bruto: eso si deja trabajo a medias y
es la via rapida a dejar el terminal escribiendo solo (entrada anterior).

Donde se comprueba que la actualizacion fue bien: `~/.claude/.last-update-result.json`
(`version_from`, `version_to`, `outcome`).

### 2026-08-29 — Claude Code se esta lanzando desde HOME, no desde el repo
Constatado mirando `~/.claude/projects/`: existen `C--Users-Prueba` y
`C--Users-Prueba-Documents`, pero **no existe ninguna carpeta de NEO PULSE**. Es decir, las
sesiones se abren en `C:\Users\Prueba` y desde ahi se entra al proyecto con `cd`.

Por que importa: el contexto del proyecto se carga desde el directorio de trabajo **hacia arriba**,
nunca hacia abajo. Lanzando desde `C:\Users\Prueba` **no se cargan solos**:
- `CLAUDE.md` del proyecto (80 KB: el modelo completo y las decisiones irreversibles),
- las skills de `.claude/skills/` (`pulse-ui`, el contrato de diseno),
- los permisos y ajustes de `.claude/settings.json` del repo — de ahi que pregunte permiso por todo.

Es la razon de que cada sesion haya que empezar diciendo "lee el RUNBOOK, el CLAUDE.md y el
HANDOFF": no es olvido del modelo, es que no los tiene delante.

La costumbre correcta:
```
cd "$HOME\Documents\Transprensa - NEO PULSE"
claude
```
Y ademas: `claude --continue` reanuda la ultima sesion **de esa carpeta**, asi que lanzando desde
home reanuda cualquier cosa que se hiciera en el escritorio, no lo del proyecto.

### 2026-08-29 — Las e2e no arrancan: mirar el motivo, que casi siempre es el entorno

Dos arranques fallidos seguidos, ninguno del codigo, y los dos se leen en las **primeras lineas**
del log de `[WebServer]`:

| Sintoma en el log | Causa | Arreglo |
|---|---|---|
| `P1001: Can't reach database server` | Docker Desktop no esta levantado (tras reiniciar Windows no arranca solo) | Abrir Docker Desktop y esperar; los contenedores vuelven solos |
| `Could not find a production build in the '.next' directory` | `pnpm test:e2e` levanta `web` en modo **produccion**, no en dev | `pnpm build` antes |

La leccion no es la tabla: es que ante un fallo de arranque hay que **leer el log en vez de volver
a lanzar la suite**. Cada reintento a ciegas cuesta los mismos 2-3 minutos que leerlo cuesta cero.

Comprobacion previa de un tiron:

```powershell
docker ps                 # los 4 contenedores arriba (2 de NEO PULSE, 2 de SAC-NEO)
pnpm build; pnpm test:e2e
```

### 2026-08-29 — Un usuario recien creado NO entra directo: cambia clave Y activa la cuenta

Un e2e que entre con una cuenta nueva tiene que atravesar los dos pasos, en este orden:

1. `/cambiar-contrasena` (la generada viene con `must_change_password`),
2. **Activar cuenta** — habeas data (Ley 1581) y acuerdo de firma electronica (Dec. 2364).

Saltarse el segundo deja la prueba esperando una pantalla que nunca llega y falla por timeout muy
lejos del sitio real. Ver `e2e/alcance-analista.spec.ts`, que es la referencia de ese recorrido.
Por eso la cuenta `888888888` del seed nace con las dos cosas resueltas.

### 2026-08-29 — DOS USUARIOS EN EL MISMO NAVEGADOR se echan la sesion mutuamente

Sintoma: estas trabajando y de golpe la pantalla te devuelve al login, "como si el servidor se
cayera". **El servidor no se cae**: la API sigue en pie y respondiendo. Lo que se cae es la SESION.

Por que, mirando el codigo:

- El **access token vive en memoria** de la pestana (`apps/web/src/lib/api.ts`), asi que cada
  pestana tiene el suyo. Hasta aqui todo bien.
- El **refresh token es una cookie httpOnly**, y una cookie es **del origen, no de la pestana**:
  todas las pestanas de `localhost:3100` comparten la MISMA.
- En el servidor hay **una sola fila** por persona (`users.refresh_token_hash`) y **rota en cada
  uso** (`auth.service.ts`).

De ahi salen los dos casos, y los dos se ven igual:

| Que hiciste | Que pasa |
|---|---|
| Entrar con **otra persona** en el mismo navegador | El segundo login **pisa la cookie** del primero. La primera pestana, al refrescar, manda una cookie que ya no es suya y la echan |
| La **misma cuenta** en dos sitios (tu navegador y las pruebas) | El refresco de uno **rota** el token y deja invalido el del otro. Es el incidente del 2026-08-29 de mas arriba |

**Que hacer:** para mirar el panel con dos cuentas a la vez, usar una **ventana de incognito** (o
un perfil distinto de Chrome) para la segunda. No es un fallo del producto: ningun sitio que use
una cookie de sesion puede tener dos cuentas abiertas en el mismo perfil sin trucos tipo `/u/0/`
de Google. Y para correr las e2e, no dejar el navegador dentro de la aplicacion con `888888888`.

**Que NO hacer:** buscar el fallo en el codigo que estabas tocando. El sintoma aparece lejos del
sitio y hace perder tiempo. Si la pantalla que ves al fallar es el LOGIN, es esto.

### 2026-08-29 — El `next build` que rompe las e2e tambien te alcanza si arrancaste TU los servidores

Ampliacion del incidente del 2026-08-27 ("nunca `next build` con el servidor levantado"). Ese
decia "servidor de desarrollo"; la trampa es la misma con `next start`, y engana mas porque
`pnpm test:e2e` **reutiliza** los servidores que ya esten en pie (`reuseExistingServer`).

Secuencia que costo dos corridas de 10 minutos:

1. arranco `api` y `web` a mano para mirar algo en el navegador,
2. hago un cambio y corro `pnpm build`,
3. `pnpm test:e2e` **no arranca nada**: reutiliza el `next start` viejo, que ahora sirve rutas de
   assets que ya no existen. Todo responde 404, cada prueba agota su minuto y la suite se cuelga
   sin un solo error util.

**Regla:** despues de `pnpm build`, **bajar los servidores** y dejar que Playwright levante los
suyos. Y si se levantaron a mano, bajarlos antes de construir.

```bash
for port in 3100 3002; do
  pid=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | head -1)
  [ -n "$pid" ] && taskkill //PID $pid //F
done
pnpm build && pnpm exec playwright test
```

**Sintoma para reconocerlo:** la suite tarda mucho mas de sus ~2,5 minutos y las pruebas fallan
todas por timeout en el primer elemento que buscan. No es el codigo: es el servidor.

### 2026-08-29 — "Empresa no encontrada" no siempre significa eso

El login resolvia el tenant y metia CUALQUIER fallo en el mismo cajon: si la API estaba
reiniciando o se caia la red un segundo, la pantalla afirmaba **"Empresa no encontrada."** y se
quedaba ahi, sin salida y sin reintentar. Desde fuera se ve como "la aplicacion no carga", y se
busca el fallo donde no esta.

Corregido: solo un **404** dice que la empresa no existe; cualquier otro fallo muestra "No pudimos
conectar con el servidor" **con boton de reintentar**. La leccion vale para cualquier pantalla que
resuelva algo antes de dejarte entrar: un `catch` que no distingue convierte un problema temporal
en un veredicto falso.

### 2026-08-29 — "A personas concretas" salia SIEMPRE vacio (y el `catch` vacio lo escondia)

La pestana **Quienes** de una formacion pedia las personas asi:

```ts
void listUsers({ active: 'true', pageSize: 200 })
  .then((page) => setPeople(page.items))
  .catch(() => undefined);          // <- aqui moria todo
```

`listUsersQuerySchema` topa `pageSize` en **100**, asi que la peticion devolvia **422 siempre**. El
`catch` vacio se lo tragaba y el selector salia sin nadie dentro **para todo el mundo, tambien para
el administrador**, sin un solo mensaje. Nadie podia asignar una formacion a personas concretas.

Dos lecciones, y la segunda es la que importa:

1. Un limite del esquema no es una sugerencia. Si la pantalla pide 200 y el contrato dice 100, no
   se recorta: **no hay respuesta**.
2. **`.catch(() => undefined)` es la forma mas cara de ahorrar tres lineas.** Convierte un error
   con nombre y codigo en una lista vacia indistinguible de "no hay datos". Si algo puede fallar,
   la pantalla tiene que poder decirlo.

Arreglado con un endpoint propio, `GET /users/pickable`:

- guardado por **`assignments:manage`** y no por `users:manage` — quien asigna necesita ver
  personas, no el directorio con correos, documentos y roles;
- devuelve solo id, nombre, cargo y area: **lo que no se manda no se filtra**;
- **sin paginar**, porque un desplegable con "pagina 2" no es un desplegable.

Comprobado: devuelve **116 personas** donde antes salian 0. Y 116 > 100, asi que subir el
`pageSize` a 100 tampoco lo habria arreglado del todo.

### 2026-08-29 — Intermitencia SIN diagnosticar en "la obligacion nace sola" (anotada, no explicada)

`sprint-3.spec.ts:55` fallo **una vez** en una corrida completa y paso en la siguiente, y pasa
siempre en aislamiento. El fallo no fue una sesion caida (el arbol de la pagina era el panel, no el
login): la persona SI se creo, pero su fila no traia la obligacion con origen `Requisito`.

**No se cual es la causa. Queda anotado, no explicado** — la leccion del incidente de mas arriba es
justamente no rematar con "sera la carga".

Lo unico comprobado es que existe un camino por el que esto puede pasar en silencio:

```ts
// requirement-engine.service.ts:124
async syncPersonSafely(tenantId: string, userId: string): Promise<void> {
  try { await this.syncPerson(tenantId, userId); }
  catch (error) { this.logger.error(...); }   // el alta responde 201 igual
}
```

Es **deliberado** —dar de alta a alguien no debe fallar porque el motor falle— pero significa que
un fallo del motor deja a la persona creada y sin obligaciones, con la unica huella en el log del
servidor. Si vuelve a aparecer, lo primero es **mirar el log de la API buscando "No se pudieron
generar las obligaciones"**: si esta, el motor fallo y hay causa que perseguir; si no esta, el
problema es de tiempos en la pantalla y no del motor.

### 2026-08-29 — DOS stacks: el de mirar (3200/3012) y el de las pruebas (3100/3002)

Sintoma que lo motivo: `ERR_CONNECTION_REFUSED` contra `:3002` **cada rato** mientras alguien usa
la aplicacion. No era un fallo del producto: cada `pnpm build` y cada corrida de e2e tumbaba y
relevantaba los servidores de esos puertos, que eran los mismos que estaba usando la persona.

Ahora hay dos stacks que no se tocan:

| | Para mirar | Para construir y probar |
|---|---|---|
| Web | **3200** (`next dev`) | 3100 (`next start`) |
| API | **3012** | 3002 |
| Carpeta de build | **`.next-mirar`** | `.next` |
| Lo levanta | `.\scripts\mirar.ps1` | Playwright, solo |

```powershell
.\scripts\mirar.ps1      # y abrir http://localhost:3200/login?tenant=transprensa
```

Tres detalles que hacen que funcione de verdad, y sin ellos no sirve de nada:

1. **`distDir` por entorno** (`apps/web/next.config.mjs`). Next escribe dev y build en la MISMA
   carpeta: sin separarlas, un `pnpm build` deja la pantalla de desarrollo en "Cargando..." con
   todo el JavaScript en 404 (incidente del 2026-08-27). El stack de mirar usa `.next-mirar`.
2. **Modo desarrollo**, no `start`: recompila sola al guardar, asi que no hace falta reconstruir
   nada para ver un cambio, y por tanto no hay motivo para tumbarla.
3. **`$env:` y no `-Environment`** en el .ps1: este equipo corre Windows PowerShell 5.1, donde ese
   parametro de `Start-Process` todavia no existe. El hijo hereda el entorno al arrancar.

Comprobado: con el stack de mirar arriba, un `pnpm build` completo y la suite entera de e2e dejan
3012 y 3200 respondiendo 200.

### 2026-08-29 — RESUELTO: la intermitencia de "la obligacion nace sola" era basura acumulada

Se caza asi (queda el metodo, que vale para la proxima):

```bash
# 40 altas por la API, midiendo, en vez de repetir la prueba de navegador a ciegas
node scripts/cazar-obligaciones.mjs      # imprime cuantas quedaron sin obligaciones y los ms
```

Resultado: **40 de 40 con obligaciones, alta en ~700 ms**. El motor no era. Lo que si aparecio:

```sql
SELECT count(*) FROM audiences WHERE active AND name LIKE 'Toda la empresa %';  -- 41
```

Cada corrida del e2e creaba una audiencia **"toda la empresa"** con su requisito y **los dejaba
vigentes**. Al llegar a 41, cada persona nueva nacia con **41 obligaciones** en vez de una, y la
prueba —que busca la fila de esa persona— empezo a fallar de vez en cuando.

Arreglado en la prueba, que ahora **retira su requisito al terminar** (el boton "Retirar" ya
existia; era la prueba la que no lo usaba). Limpiadas las 41 acumuladas con `active = false`, sin
borrar: las obligaciones que nacieron de ellas tienen que seguir explicandose.

Medido despues: **41 obligaciones por alta → 1**, y el alta de **697 ms → 213 ms**.

**Leccion:** una prueba que deja reglas VIGENTES no ensucia la base, la cambia. Todo lo que cree un
e2e y siga afectando a lo que venga despues hay que retirarlo al final, aunque las filas se queden.

**De paso, y esto si es del producto:** `syncPersonSafely` se tragaba los errores del motor dejando
solo una linea de log. Ahora deja una fila de auditoria `OBLIGATIONS_SYNC_FAILED` con el motivo. El
alta sigue sin fallar por eso —dar de alta a alguien no puede depender del motor— pero la proxima
vez habra evidencia en vez de un misterio.

### 2026-08-29 — `listUsers({ pageSize: 200 })`: el mismo fallo en TRES pantallas

Ya estaba documentado arriba para "A personas concretas". Al buscarlo bien aparecio en dos sitios
mas, y en los tres con el mismo `catch` vacio escondiendolo:

| Pantalla | Que salia vacio |
|---|---|
| Formacion → Quienes | "A personas concretas" |
| Formacion → Ficha | **"Responsable"** |
| Formacion → Programacion | **"Instructor"** |

Los tres pedian 200 y el esquema topa en 100: **422 siempre**. Los tres usan ya
`listPickableUsers()`, que no pagina porque es para un desplegable.

**Como buscarlo si aparece otro:**

```bash
grep -rn "listUsers({" apps/web/src --include=*.tsx     # cualquier pageSize > 100 es un 422
grep -rn "catch(() => undefined)" apps/web/src           # y esto es lo que lo esconde
```

### 2026-08-29 — El mecanismo de "campos extra" de los catalogos no era generico

`catalog-manager.tsx` permitia declarar campos extra por catalogo, pero el `select` escribia
SIEMPRE en `form.jobTitleTypeId`. Con un solo catalogo que lo usaba (cargos → tipo de cargo) nadie
lo noto; al añadir el segundo —proceso → area responsable— elegir un area guardaba en el tipo de
cargo. Ahora los campos extra se guardan por CLAVE (`form.extra[field.key]`).

**Leccion:** un mecanismo "generico" con un solo caso de uso no esta probado, esta sin estrenar.
El segundo caso es el que dice si de verdad lo era.

### 2026-08-29 — Un `Buffer` devuelto por un controlador de Nest sale como JSON

La plantilla de carga bajaba con **HTTP 200 y 28 KB**, y al abrirla Excel decia que estaba
corrupta. El motivo, en los primeros bytes del archivo:

```
{"type":"Buffer","data":[80,75,3,4,...
```

Nest serializa lo que devuelve el handler, y un `Buffer` se convierte en ese JSON. El fichero llega
"bien" —codigo correcto, tamano plausible— y solo falla al abrirlo, que es donde peor se descubre.

**Regla:** cualquier binario (xlsx, pdf, zip) se devuelve envuelto en `StreamableFile`:

```ts
return new StreamableFile(await this.importer.buildTemplateXlsx());
```

**Como comprobarlo sin abrir Excel:** los cuatro primeros bytes de un .xlsx son `PK\x03\x04`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" .../users/import-template -o p.xlsx
head -c 4 p.xlsx | xxd    # 504b 0304 = bien;  7b22 7479 ({"ty) = el JSON del bug
```

### 2026-08-29 — El responsable de una formacion se HEREDA del proceso

Se pedia dos veces lo mismo: al configurar el proceso y otra vez en cada formacion. Ahora, si al
crear una formacion no se dice quien responde, **se copia el del proceso**
(`activities.service.ts`, `create`).

Se copia el VALOR, no se referencia: cambiar manana el responsable del proceso no debe reescribir
en silencio quien respondia por lo que ya existe. Quien quiera cambiarlo en una formacion concreta
lo hace en su ficha, y ahi el desplegable ofrece **solo la gente del area de ese proceso** (si el
proceso todavia no cuelga de un area, ofrece a todos: una lista larga se maneja, una vacia parece
un error).

Comprobado por API: se pone responsable al proceso SGI, se crea una formacion sin indicar
responsable, y la formacion nace con el.

**Y por eso el listado de Procesos marca en ambar "Sin responsable":** un proceso sin responsable
no avisa a nadie cuando algo se incumple, y eso tiene que verse desde la lista, no descubrirse el
dia que hacia falta el aviso.

### 2026-08-29 — Los codigos: cuales se proponen solos y cuales NO

Pregunta que zanjo esto: "si el codigo sale del nombre, ¿que pasa con SGI, que se llama Sistema de
Gestion Integral?". La respuesta esta en para que sirve cada codigo, y no son la misma cosa:

| Codigo de | Para que sirve | Como se escribe |
|---|---|---|
| **Catalogos** (areas, procesos, cargos, regionales, servicios) | **Es la clave con la que casa la carga masiva** | **A mano.** SGI, SST, PESV |
| **Formaciones** | Solo buscarlas (`code: { contains: q }`); no es clave de nada | Se PROPONE desde el nombre, editable |

Por eso la propuesta automatica solo se aplica a las formaciones: ahi equivocarse cuesta una
etiqueta fea, no una carga masiva rota. En los catalogos, acertar no puede depender de una
heuristica, y ademas el codigo corto que la empresa ya usa (SGI) no se deduce de su nombre largo.

**Y por eso el codigo aguanta los cambios de nombre.** Si la regional "Bogota" pasa a llamarse
"Cota", el codigo `BOGOTA` sigue apuntando a la misma fila: el historico no se mueve y un archivo
viejo con el codigo sigue entrando. El nombre nuevo tambien entra, porque desde hoy la carga casa
por codigo **o** por nombre. Lo unico que deja de funcionar es un archivo viejo que traiga el
NOMBRE viejo — y eso es correcto: ese nombre ya no existe.

La propuesta ademas quita las palabras de relleno, que se comian las que distinguen:

```
"Sistema de Gestion Integral"     -> SISTEMA_GESTION_INTEGRAL   (antes: SISTEMA_DE_GESTION)
"Prevencion del lavado de activos" -> PREVENCION_LAVADO_ACTIVOS
```

---

## La convocatoria recien publicada NO aparece en el plan (2026-08-29)

**Sintoma.** Se publica una convocatoria, se abre el plan, "Usar una que ya existe" — y no esta en
el desplegable. Ninguna pantalla dice nada: la lista se ve llena, con otras convocatorias.

**Como reconocerlo.** No falla por permisos ni por alcance (el administrador tambien lo ve). Falla
solo cuando la base ya tiene volumen: con pocas convocatorias no ocurre nunca, y por eso aparecio
sola despues de 40 corridas de e2e. Lo caza un conteo:

```
docker exec neo-pulse-postgres psql -U neopulse -d neopulse \
  -c "select count(*) filter (where scheduled_date is null) nulos, count(*) from offerings;"
```

**Causa.** El cajon pide `listOfferings({ pageSize: 100 })` y el servidor ordenaba por
`scheduledDate desc`. En Postgres, DESC pone los NULOS PRIMERO: las convocatorias sin fecha
—borradores, formaciones permanentes— ocupaban la cabeza de la lista. Con 52 sin fecha mas 50 con
fecha posterior, la recien publicada caia en la posicion 103 de una pagina de 100.

**Arreglo.** `orderBy` explicito con `nulls: 'last'` y `createdAt desc` como desempate
(`offerings.service.ts`). Lo recien creado va arriba, que es lo que espera quien acaba de crearlo.

**La leccion, que se repite.** El sintoma vuelve a ser "esta vacio / no aparece" y la causa vuelve a
estar lejos: un orden por defecto que nadie eligio. Cuando una lista con tope no encuentra algo que
acaba de crearse, mirar el ORDEN antes que el filtro.

### La persona recien creada NO aparece en el listado (2026-08-29)

**Sintoma.** Se da de alta a alguien, sale "Persona creada" con su contrasena… y no esta en la
tabla. Parece que el alta no se guardo.

**Causa.** El listado es **alfabetico y paginado de 20**. Con volumen, la persona nueva cae en la
pagina 3 y nadie la ve. No es un fallo del alta: el dato esta.

**Arreglo.** Al crear (no al editar), la pantalla filtra por el **documento** de quien se acaba de
crear y vuelve a la pagina 1, asi que queda mostrando exactamente a esa persona.

**Hermano del anterior.** Misma familia que el orden de las convocatorias: el sintoma es "no
aparece" y la causa esta en como se ORDENA o se PAGINA, no en lo que se guardo. Los dos salieron
del mismo e2e al crecer los datos, y ninguno se habria visto en una base recien sembrada.

**Nota de migraciones.** Al aplicar la de este dia se vio que `_prisma_migrations` estaba
DESINCRONIZADA: `user_birth_date` figuraba como fallida y `user_service` ni siquiera constaba,
aunque las dos columnas existian (se aplicaron a mano en su sesion). Se arreglo con
`prisma migrate resolve --applied <nombre>` para cada una, con el usuario owner. Si `migrate
deploy` se queja de que una columna "already exists", es esto: resolver, no re-aplicar.

### "No pudimos conectar con el servidor" al abrir la aplicacion (2026-08-30)

**Casi siempre es uno de estos dos, y ninguno es un fallo del producto:**

1. **Se abrio el 3100.** Los puertos 3100 (web) y 3002 (api) son de las PRUEBAS: Playwright los
   levanta al empezar la suite y los tumba al terminar. Fuera de una corrida no hay nadie
   escuchando. El stack para mirar es **3200 / 3012**.
2. **El stack de mirar estaba en modo desarrollo y recompilando.** `next dev` y `nest start
   --watch` rehacen el bundle cada vez que cambia un archivo del repo; durante esos segundos la
   pantalla no responde. Trabajar en el codigo mientras alguien mira la aplicacion garantiza el
   error.

**Arreglo (2026-08-30):** `scripts/mirar.ps1` ahora levanta en **produccion por defecto** —compila
una vez (~1 min) y sirve codigo ya compilado, sin vigilar archivos—, y antes de arrancar **para lo
que hubiera vivo en 3200/3012**, porque dos servidores en el mismo puerto dan un fallo que no se
parece a nada: el segundo arranca, no escucha, y la pantalla dice que no hay conexion.

```
.\scripts\mirar.ps1          # estable. No se cae aunque se trabaje en el repo o corran las pruebas
.\scripts\mirar.ps1 -Dev     # recompila al guardar; util solo mientras se esta programando
```

El precio del modo estable: un cambio nuevo no aparece hasta volver a ejecutar el script.

**Ojo con `NEXT_PUBLIC_API_URL`:** Next lo **incrusta al compilar**, no lo lee al arrancar. Por eso
el build vive dentro del script, con el entorno ya puesto. Si se compila fuera, la web sale
apuntando al 3002 (el de las pruebas) y el sintoma es exactamente el mismo mensaje.

### El alcance por AREA se reescribia solo al editar la persona (2026-08-30)

**Sintoma, tal como lo reporto el cliente:** en Permisos se le da a alguien alcance sobre otra
area, dice que se aplico —y se aplico—, pero al abrir Editar el campo sigue mostrando lo de antes;
y con los PROCESOS no pasa, ahi si se ve el cambio.

**Causa.** El cajon de alta/edicion tiene tres opciones y una de ellas, "Solo su area", asumia que
un alcance de area era SIEMPRE la propia area de la persona: leia solo *si habia* filas de area, no
CUALES, y al guardar escribia `areaIds: [area de la persona]`. Los procesos si se leian uno a uno,
y por eso esos si cuadraban.

**Lo grave no era lo que se veia, sino lo que pasaba despues:** guardar cualquier cambio de la
ficha —un telefono— reescribia el alcance a "su propia area" sin avisar. Un jefe con alcance sobre
otra area lo perdia al corregirle el correo.

**Arreglo.** El cajon lee ahora QUE areas son. Si es exactamente una y es la suya, sigue siendo
"Solo su area". Cualquier otra cosa —otra area, o varias— aparece como cuarta opcion, "a medida",
seleccionada y explicada, y **guardar no la toca**: se cambia desde Permisos o eligiendo otra
opcion a proposito.

**La leccion.** Dos pantallas que escriben el MISMO dato con formas distintas: la simple tiene que
saber reconocer lo que no sabe representar, y no puede escribir por defecto. Cuando una pantalla
"simplifica" un dato, el caso que no cabe no es un caso raro: es el que se pierde.

### "El aviso dice que me asignaron X, pero no esta en mis pendientes" (2026-08-30)

**No es un fallo de asignacion.** Se comprueba en un minuto:

```
docker exec neo-pulse-postgres psql -U neopulse -d neopulse -c "select s.status, s.source \
  from assignments s join users u on u.id=s.user_id join activities a on a.id=s.target_id \
  where a.name ilike '%<parte del nombre>%' and u.document_number='<documento>';"
```

Si sale `WITHDRAWN_LEFT_AUDIENCE`, la obligacion **se retiro** porque la persona dejo de
pertenecer a la audiencia que se la exigia —lo mas comun en esta base: la limpieza del e2e borra
su requisito al terminar, y el motor retira lo que ese requisito sostenia—. El aviso se queda
porque es el registro de lo que paso.

En esta base hay **230 avisos `ASSIGNMENT_CREATED` contra 117 obligaciones creadas en total**: son
datos de prueba acumulados de decenas de corridas.

Desde hoy, pulsar ese aviso lleva a `/formacion/<id>`, que lo explica en pantalla en vez de dejar
a la persona pulsando sin que pase nada.

### Intermitencia conocida del e2e bajo carga (2026-08-30)

`DoD: la obligacion nace sola al ingresar` tarda ~25 s con la maquina cargada y algunas
aserciones tienen 20 s de tope, asi que en una corrida completa puede caer y **pasa sola en
aislamiento**:

```
pnpm exec playwright test e2e/sprint-3.spec.ts -g "nace sola"
```

Antes de dar por rota una prueba que falla en la suite completa, correrla sola. Si pasa, es carga.
