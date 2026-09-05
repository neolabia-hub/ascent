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

### 2026-08-30 — Una prueba que deja un REQUISITO vivo envenena a las demas

Al escribir `e2e/quienes-desde-la-ficha.spec.ts` (exigir una formacion a un cargo), la prueba
guardaba el requisito y **no lo retiraba**. Como es una regla permanente, cada persona creada
despues con ese cargo nacia con esa obligacion: `sprint-3` crea una persona con el cargo
`Director de Gestion Humana`, buscaba su fila por el nombre y leia la fecha de la obligacion
EQUIVOCADA. Sintoma: `toContainText('30 de nov')` fallando con el texto de otra formacion.

Es la misma leccion que ya estaba escrita en el paso 5 de `sprint-3`, ahora pagada dos veces:

- **toda prueba que cree un requisito tiene que retirarlo al terminar** (y de paso comprueba que
  retirar no borra: la obligacion queda `RETIRADA`);
- si una corrida ya lo dejo suelto, se limpia en la base antes de volver a medir:

```
docker exec neo-pulse-postgres psql -U neopulse -d neopulse \
  -c "UPDATE assignment_rules SET active=false WHERE id IN (SELECT r.id FROM assignment_rules r JOIN activities a ON a.id=r.target_id WHERE a.name LIKE '<nombre de la prueba>%');" \
  -c "UPDATE assignments SET status='WITHDRAWN_LEFT_AUDIENCE' WHERE rule_id IN (SELECT r.id FROM assignment_rules r JOIN activities a ON a.id=r.target_id WHERE a.name LIKE '<nombre de la prueba>%') AND status IN ('PENDING','IN_PROGRESS','OVERDUE');"
```

Ojo con la magnitud: esa limpieza retiro **357 obligaciones** de tres corridas, porque la base de
desarrollo acumula personas de decenas de pruebas anteriores con ese mismo cargo.

### 2026-08-30 — Tras tocar `activity_types.config`, hay que volver a sembrar

El `config` de cada tipo (a quien se le exige, como se dicta, si se repite) ahora **gobierna el
formulario**. El seed lo actualiza en su `upsert`, pero una base ya sembrada conserva el config
viejo: si al elegir "Reinduccion" la pantalla no dice "se le exige a toda la empresa", falta
`pnpm db:seed` (es idempotente).

### 2026-08-30 — El alcance del analista: `null` NO es lo mismo que `[]`

`getAnalystScope()` devuelve **`null` cuando la persona no tiene alcance = ve TODO**, y **`[]`
cuando esta acotada a ningun proceso = no ve NADA**. El servidor lo aplica bien
(`scopeAllows: scope === null || scope.includes(id)`).

Al llevar ese dato al panel se leyo al reves —`length === 0` como "ve todo"— y salieron dos
efectos, uno visible y otro grave:

- **Visible:** para el administrador (alcance `null`) el filtro reventaba dentro de un `.then()`
  sin `catch`, la promesa quedaba rechazada en silencio y **el desplegable de procesos salia
  vacio**. El sintoma en el e2e fue `selectOption` sin encontrar la opcion; la suite paso de 2,5
  a **11,9 minutos** por los tiempos de espera de los fallos.
- **Grave:** con la lectura invertida, a quien tiene alcance acotado a NINGUN proceso se le
  habrian ofrecido todos.

Reglas que quedan:

- En el panel, el tipo es `string[] | null` y se compara `=== null`, nunca por longitud.
- **Una cadena `.then()` que filtra o transforma datos lleva `catch`**: sin el, un fallo dentro
  del callback no deja rastro y la pantalla se queda a medias sin decir nada.
- Cuando un e2e tarde mucho mas de lo normal, sospechar de un fallo con espera larga antes que de
  la maquina: 12 minutos en una suite de 2,5 es un sintoma, no lentitud.

### 2026-08-30 — Un desplegable no puede sostener el catalogo (segunda vez)

El plan traia las primeras **100** convocatorias y las pintaba todas en un `<select>`. Con **253**
en la base, la recien publicada quedaba fuera de la pagina y el plan **no podia engancharla**. El
sintoma, otra vez, es "no aparece", y la causa esta a dos capas.

Es el mismo fallo que ya se pago con el orden de las fechas (`NULLS LAST`, 2026-08-27), y por eso
la leccion sube de nivel: **cuando la lista puede crecer sin techo, se PREGUNTA al servidor; no se
trae un trozo y se confia**. Ahora el picker del plan tiene busqueda (`q`) y la prueba escribe el
nombre antes de elegir.

Aviso para leer bien las corridas: la base de desarrollo acumula datos de decenas de e2e (253
convocatorias, 43 borradores). Un fallo que aparece "de repente" sin que nadie tocara esa pantalla
suele ser un tope alcanzado, no una regresion — y con un cliente real llega igual, solo que en dos
anos en vez de en dos semanas.

### 2026-08-30 — La respuesta lenta que pisa a la rapida

En Obligaciones se escribia un nombre en el buscador y la tabla mostraba **otras filas**, sin
ningun error a la vista. No era el filtro: era una **carrera**. Al entrar a la pestana sale una
consulta SIN filtro que, con miles de asignaciones, tarda; se escribe y sale otra, filtrada, que
vuelve enseguida; y despues aterriza la primera y **sobreescribe** el resultado.

Se ve solo cuando la base pesa —por eso aparecio ahora y no en el Sprint 3—, y en produccion
aparece igual, con el cliente delante y sin forma de explicarlo.

**Regla:** toda pantalla que recargue segun lo que el usuario escribe o filtra tiene que
**descartar las respuestas viejas**. En este proyecto se hace con un contador de peticion:

```ts
const peticion = useRef(0);
const load = useCallback(async () => {
  const miTurno = ++peticion.current;
  const datos = await pedir();
  if (miTurno === peticion.current) setDatos(datos);   // solo la ultima pinta
}, [filtros]);
```

Las tres pantallas que ya lo necesitaban por tamano de datos: Obligaciones (arreglada), y a
revisar cuando toque, el listado de convocatorias y el de personas.

### 2026-08-31 — Crear un requisito "para toda la empresa" tarda, y se nota

Con 459 personas en la base de desarrollo, crear un requisito sobre "toda la empresa" **tarda mas
de 10 segundos**: inserta una obligacion y un aviso POR PERSONA dentro de la misma peticion. El
e2e lo destapo fallando en el toast de confirmacion, que esperaba los 10 s por defecto.

No es un fallo nuevo: es la deuda ya declarada de que el motor recorre persona por persona,
asomando por primera vez. Con las 116 personas reales de Transprensa va sobrado; el dia que haya
miles, ese trabajo tiene que salir de la peticion —los avisos a una cola, las obligaciones por
lotes—.

Sintoma a reconocer: guardar un requisito amplio parece que "no hace nada" y despues aparece todo
de golpe. Antes de buscar el fallo en el codigo, mirar cuanta gente alcanza la audiencia.

### 2026-08-31 — `String.replace` con `$` + comilla invertida en el reemplazo DUPLICA el archivo

Editando un `.spec.ts` con un script de Node, el archivo paso de 320 a 638 lineas y quedo con
todo su contenido dos veces. La causa no estaba en la logica del script:

```js
s.replace(viejo, '  await expect(page).toHaveURL(new RegExp(`${planUrl}$`));');
//                                                                      ^^ aqui
```

En el segundo argumento de `String.prototype.replace`, `$` seguido de comilla invertida es un
**patron de sustitucion** que significa "todo lo que hay ANTES de la coincidencia". El texto de
reemplazo llevaba un `RegExp` cuyo `$` de fin de linea iba justo antes de la comilla que cierra la
plantilla, asi que inserto el archivo entero. Lo mismo pasa con `$&`, `$'` y `$1`.

**Regla:** cuando el reemplazo es texto literal —siempre, en estos scripts— usar la forma de
FUNCION, que no interpreta nada:

```js
s.replace(viejo, () => nuevo);      // literal, sin sorpresas
s.split(viejo).join(nuevo);         // igual de seguro para varias ocurrencias
```

Y comprobar el resultado por TAMANO antes de seguir (`wc -l`, o contar los `import` del archivo):
una duplicacion no rompe la sintaxis en la linea que se toco, sino 300 lineas mas abajo, y el
mensaje del compilador señala un sitio que esta perfecto.

Los archivos del repo son **CRLF**. Un script que busca cadenas de varias lineas con `\n` no
encuentra nada: hay que normalizar a `\n` al leer y volver a CRLF al escribir, o git marca el
archivo entero como cambiado.

### 2026-08-31 — `git checkout -- archivo` BORRA el trabajo sin confirmar (y como se recupero)

Al intentar deshacer la duplicacion de arriba se ejecuto `git checkout -- e2e/sprint-3.spec.ts`.
Eso no deshizo "lo del script": devolvio el archivo a HEAD y se llevo por delante **los cambios
sin confirmar de la sesion anterior** (24 lineas en 7 bloques). No hay reflog para lo que nunca se
indexo.

En este repo eso es especialmente facil de provocar porque **hay trabajo sin confirmar casi
siempre**: `git status` marca decenas de archivos modificados de sesiones anteriores.

**Antes de tocar `git checkout`, `git restore` o `git stash` sobre un archivo, mirar si tiene
cambios sin confirmar** (`git status --short <archivo>`). Si los tiene, la salida segura es copiar
el archivo a un lado (`cp archivo archivo.bak`) y arreglarlo a mano, o `git stash push -- <archivo>`,
que al menos deja algo que recuperar.

**Como se recupero, que sirve la proxima vez:** las sesiones de Claude Code guardan la
transcripcion completa en `~/.claude/projects/<proyecto>/<uuid>.jsonl`, un JSON por linea con cada
llamada a herramienta y su resultado. Los cambios se habian hecho con `sed` y heredocs desde Bash,
asi que los comandos —con el texto exacto— estaban ahi:

```
node -e "buscar en los .jsonl los bloques tool_use cuyo input mencione el archivo"
```

Se reconstruyeron los 7 bloques y se verifico que la reconstruccion era exacta con dos pruebas
independientes: los numeros de linea que la sesion ANTERIOR habia impreso al correr Playwright
(`sprint-3.spec.ts:297:5`) y los que se habian leido en ESTA sesion antes de perder el archivo.
Si los dos coinciden despues de rehacerlo, la reconstruccion es fiel.

### 2026-08-31 — `prisma generate` falla con EPERM si el stack de mirar esta levantado

```
EPERM: operation not permitted, rename '...\.prisma\client\query_engine-windows.dll.node.tmp...'
```

El proceso `node dist/main.js` de `scripts/mirar.ps1` tiene el motor de consultas abierto y Windows
no deja renombrarlo. **Los tipos SI se regeneran** (`index.d.ts` se escribe antes), asi que
`typecheck` pasa; lo que queda viejo es el binario, y el efecto se nota al ARRANCAR la API.

Salida: bajar el stack de mirar, `pnpm --filter @neo-pulse/api run prisma:generate`, y volver a
levantarlo con `.\scripts\mirar.ps1`.

### 2026-08-31 — Una migracion que falla BLOQUEA todas las siguientes (P3009)

Al aplicar `one_plan_per_year` fallo por duplicados (habia dos planes de 2026). Se limpio la causa
y el segundo intento **no** volvio a correr: Prisma contesta

```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `20260831100000_one_plan_per_year` migration started at ... failed
```

Prisma deja la fila del intento fallido en `_prisma_migrations` y se planta hasta que alguien diga
que paso con ella. Como el fallo fue en la PRIMERA sentencia y Postgres corre cada migracion en su
transaccion, la base quedo intacta y lo correcto es marcarla como revertida:

```
DATABASE_URL=<url del owner> npx prisma migrate resolve --rolled-back 20260831100000_one_plan_per_year
DATABASE_URL=<url del owner> npx prisma migrate deploy
```

**`--rolled-back` solo si de verdad no quedo nada aplicado.** Si la migracion tiene varias
sentencias y fallo a la mitad sin transaccion, hay que mirar el estado real antes: marcarla como
revertida cuando SI aplico la mitad deja el esquema y el historial diciendo cosas distintas.

Y de ahi la regla que ya estaba escrita en la propia migracion: **una migracion no deduplica
datos**. Borrar el plan del ano de alguien no puede pasar dentro de un despliegue; que falle y
obligue a decidir a mano es el comportamiento correcto.

### 2026-08-31 — Los comentarios `/** */` NO son validos en `schema.prisma`

```
error: Error validating: This line is not a valid field or attribute definition.
```
...senalando la linea del campo, no la del comentario. Prisma admite `//` (comentario) y `///`
(comentario de documentacion, que viaja al cliente generado); el bloque `/** */` de JS/TS no.
El mensaje despista porque acusa a la linea siguiente, que esta perfecta.

### 2026-09-03 — El limpiador de reglas se llevaba por delante formaciones REALES

Sintoma, tal cual lo reporto el cliente: una induccion general **publicada**, con gente ya obligada
en "Quienes la tienen que hacer", y **"Lo que se exige hoy" vacio** — sin "Ajustar" ni "Retirar".

La causa encadena dos cosas razonables:

1. `audiences.findOrCreate` **REUTILIZA** la audiencia que ya tenga esa forma. Es deliberado y esta
   bien: si no, "los conductores" acabarian siendo dos audiencias gemelas. Pero en la base de
   desarrollo la forma "toda la empresa" ya existia con el nombre que deja la suite —
   `Toda la empresa 40511390`— y la formacion real se colgo de esa.
2. `limpiar-reglas-de-prueba.ts` desactiva las reglas de toda audiencia llamada
   `Toda la empresa <marca>`, y corre **despues de cada `pnpm test:e2e`**. Se llevaba la regla de la
   formacion real con las de prueba.

Y el sintoma no delata la causa: las **asignaciones** siguen ahi (por eso "Quienes" muestra gente),
lo que desaparece es la **regla**, que es lo unico que pinta "Lo que se exige hoy".

**Arreglado**: el script ahora **se salta cualquier regla cuya formacion tenga una version
PUBLICADA**. Deja viva alguna regla de prueba —las corridas tambien publican— y eso ya no importa:
desde que el alta de personas dejo de recorrer todas las reglas (0,4 s en vez de 9 s), unas cuantas
de mas no cuestan nada. Perder el trabajo de alguien si costaba.

**Si vuelve a pasar**, se ve y se arregla asi:

```
-- ¿la regla existe pero desactivada?
select a.code, r.active, au.name from activities a
  join assignment_rules r on r.target_id = a.id
  join audiences au on au.id = r.audience_id
 where a.code = 'EL_CODIGO';

-- reactivar
update assignment_rules set active = true where id = '<id>';
```

### 2026-09-03 — LA ENCUESTA SALIA LA PRIMERA (bug, arreglado)

Lo encontro el recorrido de punta a punta: la version publicada llegaba al aprendiz como
**SURVEY, LESSON, ASSESSMENT**. La formacion empezaba preguntando que te parecio algo que todavia
no habias visto.

La causa es de manual. La encuesta se anade sola al crear la version —antes de que exista ningun
contenido— con `displayOrder: 999`, y el comentario del codigo decia textualmente "la ultima,
siempre". Pero el contenido nuevo se numeraba con **el mayor + 1**, y el mayor era ese 999: la
leccion quedaba en 1000 y el examen en 1001, **por detras** de la encuesta. El numero magico que
debia dejarla al final la dejaba al principio en cuanto se anadia el primer contenido.

Arreglado en `activities.service.ts`: el orden del contenido nuevo sale del ultimo que **no** sea
encuesta, y la encuesta se empuja detras. Se sostiene por muchos contenidos que se anadan.

**Al mirar un tipo con encuesta, comprobar el orden** — es lo primero que se rompe y lo ultimo que
alguien mira:

```
select c.type, c.display_order from activity_contents c
  join activity_versions v on v.id = c.activity_version_id
  join activities a on a.id = v.activity_id
 where a.code = 'EL_CODIGO' order by c.display_order;
```

### 2026-09-03 — Recorrido de punta a punta de INDUCCION GENERAL: lo que hay que saber para armarlo

`scripts/recorridos/induccion-general.mjs` hace el camino completo contra la base real. Lo que se
aprendio armandolo, que es lo que nadie tiene por que adivinar dos veces:

1. **La convocatoria la abre el TIPO, no la persona** — corregido el 2026-09-03 tras comprobarlo.
   Si el tipo trae `defaultOfferingKind: PERMANENT`, publicar **abre sola** una convocatoria
   permanente y el aprendiz puede empezar en el acto. Asi estan induccion general, especifica,
   reinduccion y pildora. Los tipos con `EVENT` —capacitacion del plan y extraordinaria— NO la
   abren: tienen fecha de sesion, y esa la pone una persona.

   Crear otra a mano cuando el tipo ya la abrio deja **dos** convocatorias para la misma version, y
   si la segunda queda en borrador, inscribirse en ella da `409 OFFERING_NOT_OPEN` aunque la
   formacion este perfectamente disponible por la primera. Comprobado: publicar una induccion
   general deja `1 offering PERMANENT PUBLISHED` sin que nadie la pida.
2. **El examen NO tiene publicacion propia** (Decision #87). Al publicar la FORMACION se crea una
   COPIA CONGELADA del examen con `status = PUBLISHED` y `sourceId` apuntando al original. Quien
   responde, responde la copia: el `assessmentId` del intento sale de la pieza de la version, no del
   examen que se edita. Usar el id del borrador da `409 ASSESSMENT_NOT_PUBLISHED`.
3. **Publicar pide `confirm: true`** ademas de `migrationPolicy`
   (`FINISH_OLD | RESTART_NEW | MOVE_NOT_STARTED`). La convocatoria tambien: `confirm: true`.
4. **Las tarjetas de una leccion van por `PUT /lessons/:id/cards`** (la leccion entera de una vez),
   y el tipo de tarjeta es `cardType`, no `ctype`. El texto es `TEXT_IMAGE`.
5. **El avance de un contenido es `pct`**, no un booleano: `{ pct: 100, secondsSpent, source }`.
6. **Responder una pregunta usa `attemptQuestionId`** —el id de ESA pregunta en ESE intento— y
   `answer: { optionId }`. Ni el id de la pregunta ni el de su version sirven.
7. **El intento se abre con `?assessmentId=` en la query**, no en el cuerpo.

Y lo que confirmo del comportamiento, que es lo que se queria comprobar:

- Al publicar pasan **DOS cosas solas**: nace **UN** requisito (`ON_HIRE`, vence **-1 dia** porque
  D1072 exige que la induccion sea previa al inicio, y **solo a quien entre desde ahora**) y se
  **abre la convocatoria permanente**. Nadie pulsa nada para ninguna de las dos.
- Con 770 personas ya en la base, ese requisito obliga a **cero**: todas entraron antes.
- Una persona creada **despues** de publicar recibe la obligacion **sola**, sin tocar nada.
- Al aprobar el examen se emite la **constancia** con su codigo de verificacion.
- El tipo no pide encuesta y **no se asigna ninguna**.

### 2026-09-03 — El alta individual pasa de 9 s a 0,4 s: dos consultas que se repetian

Continuacion de la entrada de abajo. Se busco el tiempo en vez de suponerlo: **ninguna consulta
pasaba de 150 ms** — eran MUCHAS consultas rapidas. Con `log_min_duration_statement = 0` se conto
lo que cuesta crear UNA persona: **1.680 transacciones**. Dos causas, las dos del mismo tipo:

1. **`audiences.syncPerson` escribia una fila por audiencia.** Una persona encaja en ~133 de las 143
   audiencias, y eran 133 INSERT sueltos. El camino por LOTE (`reevaluate`) ya usaba `createMany`
   desde siempre; este otro no se habia alineado. Arreglado: se decide en memoria (que ya era asi) y
   se escribe con `createMany` + `updateMany`. **2 consultas en vez de 133.**

2. **`withdrawLeavers` recorria TODAS las reglas del tenant**, activas o no, con dos consultas cada
   una. En esta base hay **569 reglas** —diez de verdad y el resto residuo de las corridas de e2e—:
   1.138 viajes para no hacer nada en 559 de ellos. Arreglado: primero se pregunta **que reglas
   tienen algo PENDIENTE o VENCIDO** (una consulta, con `distinct`) y solo se recorren esas. Con una
   persona son dos o tres.

Ninguno de los dos cambia una regla de negocio: las mismas filas, los mismos contadores. Una regla
sin obligaciones pendientes no puede retirar ninguna, asi que saltarsela es un no-op — y por eso
**tampoco se filtra por regla activa**: una regla desactivada tambien tiene que retirar lo que dejo
pendiente.

| | Antes | Despues |
|---|---|---|
| Alta individual | **9,0 s** | **0,4 s** |
| Transacciones por alta | 1.680 | ~40 |

Verificado con la suite entera, incluida la e2e "la obligacion nace sola al ingresar" (sprint-3),
que es exactamente el camino que se toco: 349 unitarias y 21/21 e2e en verde.

**Como se diagnostico, por si vuelve a pasar:**

```
docker exec neo-pulse-postgres psql -U neopulse -d neopulse -c "alter system set log_min_duration_statement = 0;"
docker exec neo-pulse-postgres psql -U neopulse -d neopulse -c "select pg_reload_conf();"
# ...ejecutar la operacion lenta...
docker logs neo-pulse-postgres --since 20s 2>&1 | grep -c "BEGIN"            # cuantas transacciones
docker logs neo-pulse-postgres --since 20s 2>&1 | grep "duration:" | sed 's/.*ms  *statement: //' | cut -c1-80 | sort | uniq -c | sort -rn | head
docker exec neo-pulse-postgres psql -U neopulse -d neopulse -c "alter system reset log_min_duration_statement;"
```

**La leccion, que ya habia aparecido antes en este proyecto:** cuando algo tarda segundos y ninguna
consulta es lenta, no se busca el indice que falta — se cuenta cuantas veces se cruza la red.

### 2026-09-03 — LA CARGA DE LAS 600 PERSONAS: por lote, nunca una por una (MEDIDO)

Estaba anotado desde el 2026-09-01 como "el alta tarda 5,6 s, hay que medirlo con datos reales
antes de decidir si se toca el motor". **Medido el 2026-09-03 contra la base de desarrollo** (184
audiencias, ~750 personas), que es peor escenario que produccion:

| Camino | Medicion | Extrapolado a 600 personas |
|---|---|---|
| **Alta individual** (`POST /users`, boton "Nueva persona") | **6,2 s** con 630 usuarios · **9,0 s** con 755 | **60-90 minutos** |
| **Carga masiva** (`POST /users/import`, CSV) | 25 filas en 9,5 s (381 ms/persona) · 100 filas en 18,0 s (**180 ms/persona**) | **1-2 minutos** |

**Por que la diferencia, y por que no es un bug.** Son dos caminos distintos del motor
(`requirement-engine.service.ts`):

- `syncPerson` (alta individual) recorre **todas las audiencias** para esa persona. El costo se
  paga entero por cada alta.
- `syncPeople` (lote) llama a `reevaluateAll` **una sola vez** y despues genera para todo el lote.
  El costo fijo se reparte: por eso 100 personas salen a la mitad de ms que 25.

**REGLA OPERATIVA: la carga inicial va SIEMPRE por Usuarios -> carga masiva.** Dar de alta 600
personas desde el boton de "Nueva persona" son mas de sesenta minutos de espera y no aporta nada.

**El orden no importa para el resultado**, pero conviene saberlo: si primero se suben las
formaciones y sus reglas y despues las personas (que es el plan del piloto), cada lote evalua
contra todas las reglas ya existentes — y aun asi son los 180 ms medidos. Al reves tambien
funciona: publicar una regla despues genera las obligaciones de quien corresponda en su propio
recorrido.

**Lo que queda abierto y ya NO es urgente:** el alta individual es lenta y **empeora con el tamano
del tenant** (6,2 s -> 9,0 s solo por anadir 125 personas). No bloquea el piloto, pero Gestion
Humana va a esperar ~9 s cada vez que cree a alguien nuevo en el dia a dia. Ahora hay numeros para
decidir si se optimiza `syncPerson` (acotar el recorrido de audiencias a las que puedan aplicar a
esa persona) en vez de la sospecha que habia.

### 2026-09-03 — Trabajos programados: que corre y cuando

Todos dentro del proceso de la API (`@nestjs/schedule`), asi que **la API debe correr con UNA sola
replica** mientras el cron viva dentro (esta dicho en `docker-compose.prod.yml`).

| Trabajo | Cada | Que hace |
|---|---|---|
| `email.dispatcher` | 30 s | Drena la cola de notificaciones por correo (Resend) |
| `requirement.worker` | 1 h | Genera obligaciones y abre ciclos de recurrencia |
| `pill-nudge.worker` | 1 h | Aviso de pildora, en la franja horaria de cada persona |
| `notification-retention.worker` | 3:00 | Borra avisos caducados |
| **`performance-reminder.worker`** | **8:00** | **Recuerda el ciclo de desempeno a quien no ha respondido, N dias antes del cierre** |

El de desempeno es nuevo (2026-09-02). Los dias los pone cada tenant en Configuracion ->
Preferencias (`performanceReminderDays`, 3 por defecto, **0 lo apaga**), avisa **una sola vez por
ciclo y persona** y no toca a quien ya entrego todo.

### 2026-09-03 — Al retomar: DOS migraciones nuevas y el orden exacto para ponerse al dia

La sesion del 2026-09-02 dejo **dos migraciones** de desempeno. Quien tome el repo a continuacion
—o cualquier entorno que no sea esta maquina— tiene que correr esto ANTES de levantar nada, y con
**el stack de mirar apagado** (si no, `prisma generate` muere con EPERM; ver la entrada de arriba):

```
# 1) Bajar lo que este vivo en 3200/3012 (mirar.ps1 lo hace solo al arrancar, pero aqui hay que
#    bajarlo ANTES de generar el cliente).
pnpm --filter @neo-pulse/api exec prisma migrate deploy
pnpm db:rls                 # las tablas nuevas llevan tenant_id: la policy se crea recorriendolas
pnpm --filter @neo-pulse/api run prisma:generate
pnpm build
.\scripts\mirar.ps1
```

Las dos migraciones:

| Migracion | Que hace |
|---|---|
| `20260902160000_ciclo_varios_formularios` | Tabla `performance_cycle_forms` + `performance_reviews.cycle_form_id`. **Rellena sola** los datos que hubiera: cada ciclo pasa a ser un ciclo de un formulario y sus evaluaciones apuntan a el |
| `20260902200000_formulario_base` | Columna `performance_forms.base_form_id` (anulable). No hay nada que rellenar: los formularios que existen no heredan de nadie |

Si se salta `pnpm db:rls`, las tablas nuevas quedan SIN politica de aislamiento. No falla nada de
forma visible — que es justo lo peligroso.

### 2026-09-02 — Entregar una evaluacion de prueba en la base de desarrollo NO se deshace

Probando la pantalla de desempeno en el navegador entregue **una evaluacion de verdad** del ciclo
demo (nota 80 a una persona de prueba). El modulo esta disenado para que una evaluacion entregada
**no se pueda corregir ni reabrir**: es lo que la persona lee y firma, y esa es la regla que le da
valor de evidencia. La interfaz no ofrece salida, y hace bien.

**Al probar la entrega, hacerlo a sabiendas.** Marcar la escala, mirar el boton medidor y abrir la
confirmacion es seguro —la entrega ocurre en el SEGUNDO boton, "Entregar la evaluacion"—. Si se
entrego sin querer, la unica salida es SQL contra la base de desarrollo:

```
docker exec neo-pulse-postgres psql -U neopulse -d neopulse -c "delete from performance_reviews where id = '<uuid>';"
```

Y para dejar la base como estaba tras probar formularios o ciclos, borrar por nombre (el ciclo
arrastra sus evaluaciones por cascada):

```
delete from performance_cycles where name like 'PRUEBA%';
update performance_forms set base_form_id = null where name like 'PRUEBA%';
delete from performance_forms where name like 'PRUEBA%';
```

El `update` antes del `delete` no es adorno: si un formulario de prueba hacia de base de otro, el
borrado falla por la clave ajena.

### 2026-09-02 — Un permiso nuevo no existe hasta que se resiembra

Sintoma: se anade un permiso a `packages/shared/src/constants/permissions.ts`, el codigo compila, el
guard lo pide... y **todo responde 403** con `MISSING_PERMISSIONS`, incluso con la cuenta de
administrador.

Causa: `permissions` es una tabla, no una constante. La lista del paquete compartido es la FUENTE,
pero quien la copia a la base y se la asigna a los roles es la semilla. Hasta que corre, el permiso
no existe para nadie — y el administrador, que tiene "todos", tiene todos los que habia ese dia.

Arreglo:

```
pnpm db:seed        # idempotente: inserta los permisos nuevos y reasigna los roles semilla
```

En el despliegue lo hace el servicio `migrate` (`scripts/release.sh` con `RUN_SEED=true`), pero en un
entorno ya montado hay que acordarse. **Regla: permiso nuevo -> resembrar antes de probar.**

### 2026-09-02 — `prisma generate` falla con EPERM si la API esta corriendo

Sintoma, en Windows, justo despues de una migracion:

```
EPERM: operation not permitted, rename '...\.prisma\client\query_engine-windows.dll.node.tmp...'
```

Causa: el proceso de la API tiene abierto el motor de consultas de Prisma, y Windows no deja
renombrar un archivo en uso. La migracion SI se aplico —la base queda al dia— pero el cliente no se
regenera, asi que el codigo sigue sin conocer los modelos nuevos.

Arreglo: parar la API, regenerar, y volver a levantarla.

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3012 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
pnpm --filter @neo-pulse/api exec prisma generate
.\scripts\mirar.ps1
```

**Regla: antes de migrar, parar lo que este sirviendo.** Es la misma familia que el `.next` de
`mirar.ps1`: dos procesos escribiendo sobre los mismos artefactos compilados.

### 2026-09-02 — Una migracion puede pasar en desarrollo y morir en produccion

Sintoma: `prisma migrate dev` falla con `P3006` y, dentro, algo como:

```
Migration `..._desempeno` failed to apply cleanly to the shadow database.
ERROR: index "areas_responsible_user_id_idx" does not exist
```

Causa: Prisma, al generar una migracion, mete tambien la limpieza de la DERIVA que encuentra entre
la base de desarrollo y el historial —indices o restricciones que existen en la base y que el
esquema ya no declara—. Esas sentencias funcionan en la base de desarrollo (donde el objeto existe)
y **fallan en una base nueva**. La base sombra de Prisma es una base nueva: por eso lo caza.

**La base sombra es el simulacro de produccion.** Cuando falla ahi, no es un capricho de la
herramienta: es `migrate deploy` fallando el dia del despliegue, con el cliente esperando.

Arreglo: volver esas sentencias idempotentes en el archivo de migracion.

```sql
DROP INDEX IF EXISTS "nombre_del_indice";
ALTER TABLE "tabla" DROP CONSTRAINT IF EXISTS "nombre";
```

Si la migracion YA se aplico en desarrollo, editar el archivo cambia su checksum y Prisma se queja.
Se repara sin resetear la base:

```bash
docker exec neo-pulse-postgres psql -U neopulse -d neopulse   -c "delete from _prisma_migrations where migration_name = '<la_migracion>';"
pnpm --filter @neo-pulse/api exec prisma migrate resolve --applied <la_migracion>
```

Y para un cambio DESTRUCTIVO (borrar una columna), la migracion se escribe a mano: `migrate dev`
pide confirmacion interactiva —que en una terminal automatizada no existe— y, mas importante, un
`DROP COLUMN` generado no copia el dato a ninguna parte. Primero se copia, despues se borra.

### 2026-09-01 — `output: 'standalone'` de Next rompe el build en Windows

Sintoma: `.\scripts\mirar.ps1` deja de compilar con un error que habla de React y no tiene nada que
ver con React:

```
Failed to copy traced files for ...\.next-mirar\server\pages\_app.js
Error: EPERM: operation not permitted, symlink
  'node_modules\.pnpm\react@18.3.1\node_modules\react' -> '...\standalone\apps\web\node_modules\react'
```

Causa: para armar la carpeta autocontenida, Next crea **enlaces simbolicos** hacia el store de pnpm.
Windows los deniega salvo con modo desarrollador o permisos de administrador. Dentro del contenedor
—Linux— no pasa.

Arreglo: la salida autocontenida se enciende con una variable y solo en la imagen.
`next.config.mjs` la lee de `NEXT_OUTPUT`, y `apps/web/Dockerfile` pone `ENV NEXT_OUTPUT=standalone`.
En local no se activa y `mirar.ps1` compila como siempre.

Regla: **una opcion que solo hace falta al empaquetar no se deja encendida en el repositorio.** Aqui
el costo fue una compilacion caida con un mensaje que apuntaba al sitio equivocado.

### 2026-09-01 — Un nombre de bucket sin credenciales tumbaba el arranque

Sintoma: la API no levanta en desarrollo y muere en el arranque:
`Configuracion de R2 incompleta: falta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY`.

Causa: al cablear R2 se anadio la regla "o estan las cuatro variables o ninguna". Sonaba prudente y
no lo era: `apps/api/.env` llevaba meses con `R2_BUCKET_NAME=neo-pulse-files` heredado de la
plantilla, sin credenciales al lado. La comprobacion estaba mirando la senal equivocada.

Arreglo: quien decide si se quiere R2 son las **credenciales**, no el nombre del bucket. Con alguna
credencial presente se exigen las cuatro y se dice cual falta —con tres de cuatro el fallo llegaria
en la primera subida, en produccion y con alguien esperando—. Sin ninguna, disco local y un aviso de
que el bucket se esta ignorando.

Regla: **una validacion nueva tiene que fallar solo en el caso que de verdad es peligroso.** Si
tumba un entorno que funcionaba, la que esta mal es la validacion.

### 2026-08-31 — Los requisitos que deja el e2e se ACUMULAN, y acaban tumbando otras pruebas

Sintoma: `alcance-analista` y `sprint-1 personas` fallan esperando el dialogo "Contrasena generada"
al crear una persona. No es un fallo de esas pruebas ni de la pantalla de personas: es que **crear
una persona tardaba mas de 10 segundos**.

Causa: **67 reglas de asignacion activas**, casi todas sobre audiencias "Toda la empresa" —52 de
ellas dejadas por corridas anteriores del e2e y 15 de pruebas a mano—. El motor evalua TODAS las
reglas activas al dar de alta a alguien, asi que cada persona nueva disparaba 67 rondas —una
obligacion y un aviso por regla— dentro de la misma peticion.

Ya estaba escrita la leccion de que *una* prueba que deja un requisito vivo envenena a la
siguiente; lo que faltaba es que **se suman**: cada corrida deja el suyo y a los dos dias la base
tarda tanto que fallan pruebas que no tienen nada que ver con requisitos.

Para verlo antes de buscar el fallo en el codigo:

```sql
select count(*) from assignment_rules where active;   -- si pasa de 20, es esto
select a.name, au.name audiencia,
       (select count(*) from assignments s where s.rule_id = r.id) obligaciones
from assignment_rules r
join activities a on a.id = r.target_id
join audiences au on au.id = r.audience_id
where r.active order by obligaciones desc limit 15;
```

**Se RETIRAN, no se borran.** Es la diferencia que importa: 154 de esas obligaciones ya tenian
ejecucion, asi que borrarlas dejaria inscripciones apuntando a nada. Y retirar es justo lo que
arregla el sintoma —el motor solo mira reglas ACTIVAS—, sin tocar una linea de historia:

```sql
UPDATE assignment_rules r SET active = false
FROM activities a
WHERE a.id = r.target_id AND r.active
  AND a.name ~ '^(Induccion E2E|Version viva|Induccion automatica|Induccion S3|Capacitacion S3|Capacitacion desde el plan|Capacitacion S2|Formacion E2E) ';
```

De 67 a 15 reglas activas, y la suite paso de 17/19 a **19/19** sin tocar una linea de codigo.

Regla: **si una prueba falla por un tiempo de espera y no por una asercion, mirar la basura de la
base antes que el codigo.** Es la tercera vez que el sintoma es "lento" y la causa es
"acumulacion", despues de los planes fantasma y de los desplegables recortados.

Lo que falta para que deje de repetirse: cada spec que crea un requisito tiene que RETIRARLO al
terminar, como ya hacen `quienes-desde-la-ficha` y el DoD del sprint 3. Las que lo dejan vivo son
las de version y convocatoria.

**Cerrado el 2026-09-01 por el otro extremo:** `e2e/global-teardown.ts` corre la limpieza al
terminar CUALQUIER corrida, en verde o en rojo, asi que la basura deja de acumularse aunque una spec
siga dejando la suya. No sustituye a que cada spec recoja lo suyo —eso sigue siendo lo correcto—
pero quita del camino el fallo que mas confunde: una prueba de ALTA DE PERSONAS que expira por unas
reglas que nadie relaciona con ella. Justo antes de un despliegue, una suite que falla por su propia
basura entrena a mirar para otro lado, y ese es el dia en que el fallo de verdad pasa por flaky.

Si hace falta a mano: `pnpm --filter @neo-pulse/api dev:limpiar-reglas`.

### 2026-09-03 — Recorrido de INDUCCION ESPECIFICA: lo que cambia cuando el alcance es por cargo

`scripts/recorridos/induccion-especifica.mjs`, 16 pasos, **todo en verde a la primera**. No
encontro ningun fallo, y eso tambien es informacion: el camino por cargo estaba bien. Lo que si
deja son respuestas medidas a preguntas que antes se contestaban de memoria.

**Como elige los cargos, y por que importa al leer el script.** Sin el corte de "solo nuevos",
exigir la formacion crea la obligacion a TODA la gente que ya tiene ese cargo. Con "Conductor"
(408 personas en desarrollo) eso son 408 asignaciones de mentira. El recorrido pregunta primero
`POST /audiences/preview` por cada cargo y se queda con los DOS menos poblados. Comprueba lo mismo
y no engorda la base.

Lo que quedo comprobado:

| | |
|---|---|
| Publicar **NO exige nada** | `aplicarExigenciaAutomatica` solo actua si el tipo es `ON_HIRE`; la especifica es `BY_JOB_TITLE`. La convocatoria PERMANENTE **si** se abre sola: son dos automatismos distintos y solo uno mira el cargo |
| Ficha y matriz son **el mismo registro** | exigirla desde "Quienes" con un solo cargo enciende la casilla de la matriz, porque `singleJobTitleOf` reconoce esa audiencia. Y al reves |
| Cada cargo, **su requisito** | anadir el segundo cargo no toco el primero: mismo `ruleId` y las mismas obligaciones. Apagarlo tampoco |
| **Cambiar de cargo** no espera al cron | ver abajo |

#### Que pasa cuando alguien cambia de cargo (medido, no deducido)

Es el caso propio de este tipo —una induccion general no lo sufre— y es donde un sistema de
cumplimiento se equivoca callado. `PATCH /users/:id` con un `jobTitleId` distinto llama a
`syncPersonSafely`, y en la MISMA peticion:

1. `audiences.syncPerson` recalcula a que audiencias pertenece: sale de la del cargo viejo, entra
   en la del nuevo.
2. `generate` le crea la obligacion del cargo nuevo. La deduplicacion es **por regla**
   (`where: { ruleId, userId }`), no por formacion, asi que tener una de la otra regla no la frena.
3. `withdrawLeavers` retira lo PENDIENTE de la regla que ya no le aplica:
   `WITHDRAWN_LEFT_AUDIENCE`, **no se borra** —el auditor pregunta por que dejo de deberla— y de
   paso marca leidos sus avisos, para que la campana no siga reclamando algo que ya no debe.

Resultado observado: la persona pasa de `PENDING` a `PENDING + WITHDRAWN_LEFT_AUDIENCE`, dos filas
para la misma formacion y **una sola viva**. En `/me/pending` la ve UNA vez.

Dos cosas mas, estas leidas en el codigo y NO medidas, que conviene tener presentes:

- **Lo EN CURSO se respeta**: `withdrawLeavers` solo toca `PENDING` y `OVERDUE`. Quien ya habia
  empezado la del cargo viejo la conserva, que es lo correcto: hay trabajo hecho.
- **Quien la habia COMPLETADO y cambia a un cargo que tambien la exige, la vuelve a deber**: la
  regla nueva no tiene historia suya, asi que le nace la ronda 1. Hoy no se da porque ninguna
  formacion se exige a dos cargos a la vez con contenido identico, pero el dia que la matriz real
  del cliente repita una induccion en varios cargos, es la primera piedra con la que se va a
  tropezar. No se toca ahora: hace falta la matriz definitiva para saber si de verdad ocurre.

### 2026-09-03 — "Cubre a 773 personas": el numero que se veia al cortar no era el que se guardaba

Lo vio el cliente en Programacion. La tarjeta del alcance de la convocatoria decia *"Cubre a 773
personas de la empresa"* en una formacion que obliga a nueve, y justo debajo, la frase correcta:
*"los proyectados seran los obligados a la formacion que esten dentro"*. La tarjeta se contradecia
sola.

**El servidor siempre estuvo bien.** `ProjectedAudienceService` deriva `obligados ∩ tajada`, y eso
es lo que se congela al publicar. Lo que estaba mal era la ayuda del formulario: llamaba a
`previewAudience(scope)`, que cuenta gente **de la empresa** que encaja con las facetas — con los
campos vacios, que es el caso normal, la plantilla entera. El numero no tenia nada que ver con la
formacion que se estaba convocando.

Arreglado en tres partes, todas apoyadas en el servicio que ya existia:

1. **`POST /offerings/proyectados`** (`previewProjectedSchema`): los proyectados de una
   convocatoria que TODAVIA NO EXISTE. La tajada llega como REGLA y no como audiencia —la
   audiencia se crea al guardar—, asi que `OfferingScope` acepta ahora `rule`. Previsualizar y
   congelar pasan por la misma funcion a proposito: dos caminos parecidos se separan siempre.
2. **"Proyecta N de las M personas obligadas"**, en vez de un numero suelto que no se sabe contra
   que se lee. Sin corte se dice el total una sola vez. Si no hay ningun obligado, la frase manda a
   "Quienes" en vez de dar un cero sin explicacion.
3. **Los cuatro selectores solo ofrecen lo que existe ENTRE LOS OBLIGADOS**, con cuantos hay de
   cada uno ("Conductor · 12 obligados"). Ofrecer los cuarenta cargos del catalogo invitaba a
   cortar por uno que da cero, y eso solo se descubria despues de publicar. Las facetas salen de
   los obligados de verdad y **no de los requisitos**: una persona puede estarlo por una asignacion
   suelta hecha en "Quienes", y filtrar por reglas la habria borrado de la lista. Si todavia no hay
   obligados, se ensena el catalogo entero — acotar antes es legitimo y una lista vacia seria un
   callejon sin salida.

Comprobado contra la base: la misma formacion que decia 777 (la empresa) dice ahora **3 de 3**, y
al cortar por el cargo que la faceta anunciaba con 3, proyecta 3.

### 2026-09-03 — La "Novedad" era un asterisco que solo vivia en el navegador

Dos cosas, las dos de la pestana "Quienes" de una induccion especifica:

**1. No se exigia en el servidor.** El campo salia con asterisco y la pantalla bloqueaba el boton,
pero `reason` es `.nullable().optional()` en el esquema: una llamada directa a la API guardaba sin
motivo. Un control de auditoria que solo esta en la pantalla no es un control. Ahora
`setActivityRequirement` responde **400 `REASON_REQUIRED`**.

**2. Se pedia tambien al declararla por primera vez.** Montar la matriz del piloto son decenas de
casillas seguidas, y ahi no hay ninguna novedad que contar: se esta escribiendo el documento, no
modificandolo. Pedirla en cada una convierte el control en un tramite que se rellena con "carga
inicial" cuarenta veces, y un campo que siempre dice lo mismo deja de informar — el alta queda
auditada igual como `ASSIGNMENT_RULE_CREATED`.

**La regla que quedo, en las dos capas:** la novedad se pide cuando la casilla YA existe — ajustar
el plazo, cambiar el alcance, volver a exigir algo retirado— y solo en los tipos `BY_JOB_TITLE`.
Una induccion general no la pide nunca: ahi no hay ninguna decision que justificar, la pone el
sistema al publicar.

Comprobado contra la API: declarar una casilla nueva sin motivo pasa (201); cambiarla sin motivo da
400; cambiarla con motivo pasa.

### 2026-09-03 — La matriz por cargo se saltaba la Decision #76 (bug, reproducido y arreglado)

Salio al ir a rehacer la pantalla. **Habia dos puertas para crear la misma casilla y no hacian lo
mismo**: la ficha llama a `setActivityRequirement` y la matriz llamaba a `createRule` por su cuenta.
Lo que la segunda se saltaba:

1. **La Decision #76.** `setActivityRequirement` fuerza el disparador a `PLAN` cuando la formacion
   es del plan; la matriz mandaba `ON_HIRE` a pelo. Medido contra la base: marcar una casilla de
   una capacitacion del plan creaba un requisito que **disparaba solo** y hacia nacer **143
   obligaciones de golpe** — exactamente las dos obligaciones por persona con vencimientos que
   compiten que esa decision existe para impedir.
2. **El plazo.** La ficha manda **-1** (D1072: la induccion es PREVIA al ingreso) y la pantalla de
   la matriz mandaba **0**. La misma casilla vencia distinto segun por donde se hubiera creado.

**Arreglado delegando**: `toggleJobTitleMatrix` ahora llama a `setActivityRequirement`. Hereda el
forzado a PLAN, el plazo, la novedad y lo que venga despues, sin tener que acordarse de copiarlo.
De paso se borro `findOrCreateJobTitleAudience`, que era la tercera copia de `audiences.findOrCreate`
y la unica que no reutilizaba las audiencias creadas desde la ficha. El defecto del esquema pasa a
**-1** y el maximo a **0**: aqui no cabe un plazo positivo.

Comprobado: la misma casilla del plan queda ahora en `PLAN` y nacen **0** obligaciones.

**Leccion, que es la tercera vez que aparece:** cuando dos pantallas escriben lo mismo, una tiene
que llamar a la otra. Ya paso con las audiencias gemelas y con el preview de proyectados. Dos
caminos parecidos no divergen por descuido: divergen siempre.

### 2026-09-03 — La matriz de inducciones, rehecha

Era una tabla de casillas de verificacion desnudas: todos los cargos por **todas** las formaciones
activas. En la base de desarrollo, **5 x 1.606 = 8.030 casillas** con barra horizontal infinita.
Cada casilla decia lo mismo —marcada o no— y ninguna decia lo unico que importa antes de marcarla:
a cuanta gente le va a nacer una obligacion.

Lo que hay ahora (`components/modules/admin/matriz-de-inducciones.tsx`):

- **Solo inducciones especificas** (`defaultAssignmentMode: BY_JOB_TITLE`). Son las unicas que se
  deciden por cargo, y cruzar las demas era lo que abria la puerta al fallo de arriba. De 8.030
  casillas a 535 con los mismos datos.
- **La cifra delante**: cada fila lleva cuanta gente tiene el cargo, cada casilla encendida cuantas
  obligaciones hay detras, y cada columna avisa si la formacion sigue **sin publicar** —exigir algo
  sin contenido crea una obligacion que nadie puede hacer; no se bloquea, porque declarar la matriz
  antes del contenido es como se arma un piloto, pero se dice—.
- **La casilla es un boton, no un `checkbox`.** Una casilla de verificacion promete que no pasa
  nada hasta guardar; aqui cada clic crea o retira una obligacion legal en el acto.
- **Apagar se confirma y pide novedad; encender no.** No es simetrico a proposito: encender crea
  algo que se puede retirar, apagar RETIRA obligaciones vivas de gente concreta.
- **Buscador de cargos** y recuento de inducciones por fila.

**Y pinta las de varios cargos.** En "Quienes" se pueden marcar tres cargos de una vez y eso crea
UNA audiencia con los tres. La matriz solo reconocia las de un cargo exacto (`singleJobTitleOf`),
asi que esa formacion aparecia **sin ninguna casilla**: decia que no se le exigia a nadie mientras
se le estaba exigiendo a tres cargos. Ahora `jobTitlesOf` devuelve los cargos de cualquier audiencia
que solo hable de cargos, y esas casillas se pintan **marcadas como compartidas**: se ven, pero no
se apagan de a una desde aqui —apagar una tendria que partir una audiencia que otras formaciones
tambien usan—. Esa se corrige en la ficha, que es donde se creo.

### 2026-09-03 — Eximir a UNA persona, desde donde se la esta mirando

"Retirar" quita el requisito entero: deja de exigirsele al cargo. Para sacar a **una** persona no
habia mas camino que salir a Asignaciones, filtrar y encontrarla otra vez — cuando la pregunta se
hace leyendo "Quienes la tienen que hacer" en la ficha, con el nombre delante.

Ahora la accion esta en esa tabla, y es el mismo endpoint y la **misma ventana** que Asignaciones
(`components/modules/admin/eximir-obligacion.tsx`). Solo aparece en lo que sigue vivo: eximir algo
cumplido o ya eximido no significa nada.

**Y deja de ser un `window.prompt`.** Para algo que queda firmado en el registro de auditoria, un
prompt del navegador no dice de quien es la obligacion, no puede avisar del minimo de diez
caracteres hasta que ya se pulso aceptar, no lo lee bien un lector de pantalla y en varios
navegadores sale con el dominio delante, con pinta de aviso del sistema. La ventana dice a quien se
exime y de que, cuenta los caracteres que faltan y el boton nombra a la persona.

### 2026-09-03 — Una casilla por cargo: marcar tres cargos crea TRES requisitos

Marcar tres cargos de una vez en "Quienes" creaba **un** requisito con una audiencia de los tres
dentro. Se guardaba bien y obligaba a quien tenia que obligar, pero dejaba esos cargos sin poder
administrarse: quitarle la induccion a UNO exigia rehacer el requisito entero marcando los otros
dos, y retirarlo se los llevaba a los tres por delante.

**Y no se puede partir por abajo**: `audiences.findOrCreate` REUTILIZA la audiencia entre
formaciones, asi que partir "Conductor + Auxiliar" al apagar una casilla cambiaria a quien alcanzan
otras formaciones que usan esa misma audiencia. El sitio de partirlo es ARRIBA, al declararlo.

`setActivityRequirement` ahora, **solo en los tipos `BY_JOB_TITLE` y solo si el alcance habla solo
de cargos**, reparte: un requisito de un cargo por cada cargo marcado. Para quien lo hace sigue
siendo un gesto —marca los tres, pulsa una vez—; lo que cambia es que cada casilla queda
independiente y se enciende y apaga desde cualquiera de las dos puertas. La contrapartida, a la
vista: "Lo que se exige hoy" ensena tres renglones en vez de uno, que es la verdad.

"Conductores de Antioquia" NO se reparte: es un grupo de verdad, no tres casillas.

**Dos cosas que salieron al comprobarlo, y las dos importan:**

1. **Reenviar lo mismo no es un cambio.** La pestana abre con los cargos ya marcados, asi que
   anadir el cuarto reenvia tambien los tres de antes. Sin esto, anadir un cargo pedia una novedad
   por los tres que nadie toco — y el usuario acabaria escribiendo "sin cambios" para poder pasar,
   que es como se vacia de sentido un registro de auditoria. Ahora, si nada difiere (disparador,
   plazo, recurrencia), no se toca nada y no se pide nada.
2. **Un requisito RETIRADO no pide novedad para volver a encenderse.** La ficha no lo ensena
   —`activityRequirements` filtra por `active: true`— y la matriz lo pinta apagado, asi que
   reencenderlo es DECLARAR, no modificar. Pedir novedad ahi era pedir explicaciones por cambiar
   algo que la pantalla dice que no existe. Lo destapo la comprobacion automatica, que se comio un
   400 al marcar tres cargos de los que uno se habia retirado en una corrida anterior.

### 2026-09-03 — La matriz: tres formas descartadas antes de dar con la buena

Las tres que se descartaron, y por que:

- **Rejilla cargo x formacion** (la original). Obliga a mirar en dos ejes para contestar una
  pregunta que siempre es de uno: nadie se pregunta "¿esta marcado el cruce de conductor con
  seguridad vial?", se pregunta "¿que tiene que hacer un conductor?". Con cuarenta cargos y treinta
  inducciones, encontrar el cruce era la mitad del trabajo.
- **Acordeon por cargo.** Un solo eje, pero ESCONDE: para saber donde faltan inducciones hay que
  abrir cargo por cargo, y la pregunta con la que se entra —"¿donde tengo huecos?"— vuelve a costar
  cuarenta clics. Un plegado se justifica cuando lo de dentro es largo; aqui son tres nombres.

- **Pastillas editables en la propia fila**. Todo a la vista, pero editar donde se lee obliga a que
  la fila sea a la vez resumen y formulario: con ocho inducciones crece a tres lineas, la lista deja
  de recorrerse de un vistazo, y el desplegable de anadir se abre dentro de una fila estrecha donde
  los nombres largos no caben.

Lo que quedo: **se LEE en la lista y se EDITA en el cajon**. La lista contesta de un vistazo la
pregunta con la que se entra —"¿a que cargos les falta?"—: una fila por cargo, su gente, los nombres
de las dos primeras inducciones con un "+N", y el recuento en pastilla de marca. Al abrir un cargo,
el cajon da el sitio que la fila no tiene: **las que ya se le exigen** —con cuanta gente hay detras,
si la formacion sigue sin publicar y si viene de un requisito compartido— y **el resto con casilla
para marcar varias de una vez**, con buscador cuando pasan de ocho. Se guardan juntas, con un solo
aviso. Retirar sigue de a una, con confirmacion y novedad.

Arriba, la unica cifra que se mira de golpe: **cuantos cargos no tienen ninguna**.

Regla que deja: **la lista lee, el cajon edita**. Es la regla de la casa —"si tiene campos, cajon;
si es para leer, ventana"— aplicada a una pantalla que intentaba ser las dos cosas a la vez.

### 2026-09-03 — LAS OBLIGACIONES NACIAN VENCIDAS (bug de fondo, reproducido y arreglado)

Lo encontro el recorrido de la REINDUCCION, que es donde mas duele: se publica, y la plantilla
entera aparece en rojo el primer dia.

**El sintoma.** Al publicar una reinduccion, la primera ronda vencia el 29 de septiembre en vez del
4 de octubre — 30 dias, si, pero contados desde una fecha que no era hoy.

**La causa.** `computeFirstDueAt` anclaba en `joinedAt`, el instante en que la persona entro a la
AUDIENCIA. Y las audiencias **se reutilizan entre formaciones** (`audiences.findOrCreate`, y esta
bien que asi sea: si no, "los conductores" acabarian siendo cinco audiencias gemelas). "Toda la
empresa" o "Cargo: Conductor" pueden llevar meses creadas, asi que al estrenar un requisito nuevo
la gente ya lleva meses *dentro del grupo*, y su plazo se contaba desde entonces.

Con una audiencia lo bastante vieja, la fecha calculada cae en el PASADO. La gracia de 30 dias
existe justo para eso —"la empresa no estaba incumpliendo, es que el sistema no existia"— pero
comparaba `calculada < joined` contra el mismo `joinedAt` viejo, asi que no se disparaba nunca.

**MEDIDO, no deducido.** Se atrasaron 60 dias los `joined_at` de una audiencia de 7 personas y se
creo un requisito nuevo de 30 dias:

```
    hoy     |   vence    | obligaciones | nacidas_ya_vencidas
------------+------------+--------------+---------------------
 2026-09-04 | 2026-08-05 |            7 |                   7
```

**Siete de siete, vencidas un mes antes de existir.** En produccion eso son 600 personas en rojo el
dia que se publique la reinduccion, y un indicador de cumplimiento que arranca inventando un
incumplimiento que nunca ocurrio.

**El arreglo.** La obligacion no puede vencer antes de que existiera la regla que la crea:
`computeFirstDueAt` recibe ahora `ruleCreatedAt` y ancla en **el maximo de los dos** —la creacion de
la regla, o la entrada a la audiencia si es posterior—. A quien entra manana no le cambia nada: su
entrada es posterior a la regla y manda ella. Cuatro pruebas unitarias lo fijan, incluida la de
"sin `ruleCreatedAt` se comporta como antes", que es el camino de las obligaciones sueltas.

Comprobado de punta a punta: la misma reinduccion pasa de vencer el 2026-09-29 a vencer el
2026-10-04, que son los 30 dias contados desde hoy. Y el recorrido lleva ahora la guardia:
**ninguna obligacion puede nacer vencida**.

### 2026-09-03 — Recorrido de REINDUCCION: lo comprobado

`scripts/recorridos/reinduccion.mjs`, 12 pasos. Ademas del fallo de arriba:

| | |
|---|---|
| Publicar obliga a **TODA la plantilla** | 791 de 791, **sin** el corte de "solo los nuevos". Es lo contrario que la induccion general, y es lo que hace que la reinduccion anual no dependa de que alguien se acuerde |
| Y tarda **~2 s** | medido sobre 791 personas. No hace falta hacer nada antes del piloto |
| Todas vencen **el mismo dia** | es una CAMPANA, no un aniversario por persona: una sola fecha para las 791 |
| Pero la PRIMERA no cae el 31 de marzo | `computeFirstDueAt` solo usa la fecha fija con disparador `SCHEDULED`, y el automatismo pone `ON_JOIN`: la primera vence a los 30 dias de publicarla y **la campana rige desde la 2a ronda**. Es defendible —estrenar el 15 de marzo con vencimiento el 31 daria dos semanas para 800 personas— pero la pantalla dice "cada ano el 31 de marzo" y la primera no vence ese dia |
| La ronda siguiente **no se abre al terminar** | solo cuando se entra en la ventana de la proxima (60 dias antes). Si naciera al completarla, quien la hace en abril tendria encima la de 2027 desde abril |
| Emite constancia y trae encuesta | 3 piezas: leccion, examen y encuesta al final |

**Al correrlo, ojo:** obliga a la empresa entera a proposito. El ultimo paso retira el requisito
para no dejar 791 obligaciones vivas en la base de desarrollo.

### 2026-09-04 — `pnpm db:seed` BORRABA la parametrizacion del tenant en los tipos

Paso de verdad y lo desperte yo: tras aplicar una migracion corri `pnpm db:seed` —que es
idempotente y se corre sin pensarlo— y **borro las encuestas de satisfaccion** que el cliente habia
activado desde la interfaz en induccion general, especifica, reinduccion, extraordinaria y plan.

El `update` del upsert mandaba `config: item.config` entero, asi que cada resembrado reescribia el
`config` completo con los valores de la semilla. En desarrollo se noto porque un recorrido empezo a
fallar diciendo que faltaba la encuesta; **en produccion habria borrado la parametrizacion del
cliente sin que nadie se enterara**, porque el sistema no falla: publica sin encuesta y sigue.

**Arreglado:** el `update` MEZCLA. La semilla aporta DEFECTOS —las claves que no existan, para que
una clave nueva llegue a los tenants que ya existen— y respeta cualquier valor ya puesto:

```ts
const configMezclada = { ...item.config, ...configActual };
```

**Restaurado a mano** lo que se borro: `requiresSurvey` y `surveyTemplateId` en los cinco tipos, con
la plantilla que usan las 69 formaciones ya publicadas.

**Y el sistema si aviso, aunque nadie mirara.** Publicar una formacion cuyo tipo pide encuesta sin
tener ninguna elegida no es compuerta —es aviso auditado a proposito, hasta que el config del tipo
se edite desde la interfaz— y quedo en `audit_logs` con el texto exacto:

```
VERSION_PUBLISHED | {"publicadaSinLoQuePideElTipo": ["Este tipo de formacion pide encuesta y no
tiene ninguna elegida. Elige cual en Configuracion > Tipos de formacion..."]}
```

**Leccion:** antes de resembrar, preguntarse que ha configurado el cliente desde la interfaz. Y
mas de fondo: una semilla que pisa configuracion no es idempotente, es destructiva.

### 2026-09-04 — Recorrido de CAPACITACION DEL PLAN: 19 pasos y dos fallos de servidor

`scripts/recorridos/capacitacion-del-plan.mjs`. Es el tipo que rompe todas las costumbres de los
tres anteriores, y el que mas situaciones tiene. Encontro dos fallos, los dos del mismo tipo: una
regla que existia **solo en la pantalla**.

#### 1. Cualquier formacion entraba al plan por la API (Decision #78, ahora cerrada)

La lista de "agregar convocatoria existente" filtraba por `participatesInPlan`... en el navegador.
Por la API entraba cualquier cosa. El recorrido metio una induccion general en un plan de prueba y
**los proyectados del plan pasaron de 22 a 819**, porque la induccion alcanza a la empresa entera:
el cumplimiento del ano se calculaba contra un denominador que no era del plan.

Arreglado en `plans.addItem`: **409 `ACTIVITY_NOT_PLANNABLE`** si el tipo no dice
`participatesInPlan: true`. Un filtro que solo vive en la pantalla no es un filtro: es una
sugerencia.

#### 2. Cancelar la jornada no cancelaba un renglon REPROGRAMADO

`offerings.cancel` ponia el renglon en CANCELADA con `where: { status: 'PLANNED' }`. Un renglon al
que alguien le habia cambiado el mes queda en `RESCHEDULED` —correcto al moverlo— y se quedaba
diciendo "reprogramada" despues de cancelar la jornada. Es falso: no se reprogramo a ninguna parte,
se cancelo. Y el plan lo seguia contando como programado.

Arreglado: `status: { in: ['PLANNED', 'RESCHEDULED'] }`. Lo EJECUTADO no se toca.

#### Lo comprobado, que es lo que no hay que volver a averiguar

| | |
|---|---|
| Publicar | **ni requisito ni convocatoria**: las dos las decide una persona |
| El requisito de "Quienes" | queda en `PLAN` aunque se pida `ON_HIRE`, con plazo 0 y sin recurrencia: **lo fuerza el servidor** |
| Y **no genera nada** | alcanza a 11 personas y obliga a 0 hasta aprobar el plan |
| Programar la jornada | crea el renglon **solo** si el plan esta en BORRADOR |
| Con el plan APROBADO | el renglon no entra solo, y anadirlo **sin motivo da 409** |
| Publicar la convocatoria | **congela** los proyectados, y sigue sin obligar a nadie |
| **Aprobar el plan** | aqui nacen las obligaciones: `source = PLAN`, todas el **ultimo dia del mes** del renglon |
| Dos jornadas de lo mismo | **no duplican** la obligacion de nadie (Decision #73) |
| Reprogramar el mes | renglon a `RESCHEDULED`, y **no** mueve la fecha de quien ya la tiene |
| Contenido en borrador | se **programa** pero no se publica (409 `VERSION_NOT_PUBLISHED`) |
| Quien ingresa despues | **no** entra a una jornada ya programada (regla de oro 2) |
| El aprendiz | **no se apunta solo**: 409 `OFFERING_NOT_SELF_SERVICE`. Lo convoca quien la programa, con `POST /offerings/:id/enroll` |
| Cancelar la jornada | retira lo abierto a `WITHDRAWN_PLAN_ITEM_CANCELLED` y cancela el renglon |

**Dos trampas del propio recorrido, anotadas para el siguiente:**

- **El vencimiento se lee en hora de Colombia.** Es el FINAL del ultimo dia del mes: 31 de mayo a
  las 23:59 de Bogota es **1 de junio en UTC**. Comparar el ISO en crudo hace fallar una fecha que
  esta bien. Misma trampa que `hired_at` (2026-08-27).
- **Un recorrido que aprueba un plan tiene que usar un ANO LIBRE por corrida.** Hay un plan por ano
  (Decision #71) y aprobarlo es irreversible en la practica: la segunda corrida se quedaba sin plan
  en borrador y fallaba entera. Busca el primer ano libre desde 2030.

**La cuenta del requisito sigue en cero, y es correcto:** las obligaciones del plan cuelgan del
RENGLON (`plan_item_id`), no de la regla, asi que "Lo que se exige hoy" ensena 0 obligadas mientras
hay 11 personas obligadas de verdad.

### 2026-09-04 — El plan proyectaba a la misma gente DOS VECES (bug medido, arreglado)

Salio al preguntar si se habia probado con varias convocatorias a la vez. Se probo, y el numero no
cuadraba:

```
obligados reales de la formacion:              13
lo que el plan decia proyectar:                26
```

Dos jornadas de la misma capacitacion, sin tajada, y el plan **sumaba a la misma gente dos veces**.
La cobertura del ano no podia pasar del 50% aunque se capacitara a todo el mundo. Es el dano que
describe la Decision #68 —"40 obligados repartidos en dos jornadas salian como 80 proyectados"—
pero un piso mas arriba: no en la convocatoria, en el PLAN.

**La causa, en dos lineas de `plans.materialize`:**

```ts
data: { projectedSnapshot: item.offering.projectedCount ?? people.count }
```

Se congelaba lo que la jornada atenderia **en bruto**. Pero justo despues `repartirObligaciones`
(Decision #73) le SALTA a quien ya cuenta otro renglon — precisamente para no duplicar la obligacion
de nadie. Asi que el renglon quedaba diciendo que proyectaba trece y obligando a cero: el
denominador y el numerador salian de sitios distintos.

**Arreglado**: el renglon congela **la gente que ese renglon cuenta**, contando sus obligaciones ya
estampadas (`congelarProyectados`). Sigue siendo un congelado (Decision #5) —se escribe una vez, al
materializar, y no se recalcula— pero de un numero que significa algo.

Medido despues: **14 obligados, 14 proyectados**.

**Que un renglon quede en cero no es un error**: es una segunda jornada de algo que ya cubria otra.
Sigue contando para el CUMPLIMIENTO —la jornada se programo y se dicto— y no para la COBERTURA, que
es de personas. Son dos indicadores distintos a proposito, y esta es justo la diferencia.

**Y la tajada funciona**: acotar la segunda jornada a un area la baja de 14 a 1. Comprobado en el
mismo recorrido.

### 2026-09-04 — La repeticion sale de la semilla y pasa a tener pantalla

Faltaba, y tenia dos consecuencias que el cliente noto:

1. **La reinduccion decia "cada ano antes del 31 de marzo" y esa fecha no se podia cambiar desde
   ninguna parte.** Vivia en `activity_types.config.defaultAnnualDate`, sembrada.
2. **Un cliente que NO trabaje por campana no tenia como decirlo.** Los hay: "cada 12 meses desde
   que cada quien la hizo" es igual de legitimo, y el modelo ya lo soportaba
   (`defaultRecurrenceMonths`) — lo que no habia era donde decirlo.

Ahora esta en **Configuracion -> Tipos de formacion**, debajo de las reglas del tipo:

- **Como se repite**: no / cada ano en fecha fija / cada N meses. Una sola pregunta con tres
  respuestas, porque por debajo son dos claves EXCLUYENTES y con las dos puestas manda la fecha:
  ofrecerlas sueltas dejaria configurar un tipo que dice dos cosas y solo una es verdad. Al elegir
  una se limpia la otra.
- **La fecha** o **los meses**, segun lo elegido.
- **Que pasa si llega la siguiente y no hizo la anterior** (Decision #142), solo cuando se repite:
  sin repeticion no hay ronda siguiente de la que preguntarse nada.

**Por que en el TIPO y no en "Reglas academicas" de Preferencias.** Se planteo y se descarto:
Reglas academicas son valores por defecto **transversales** —nota minima, % de video, intentos— que
cualquier actividad puede ajustar. La fecha de la campana no es transversal: solo significa algo
para un tipo que se repite. Ponerla ahi seria clavar un tipo concreto en una pantalla general, y un
cliente con DOS tipos recurrentes —reinduccion y recertificacion anual— no podria expresarlo. Ademas
el motor la lee del tipo: tenerla en otro sitio seria una segunda fuente de verdad.

**Y el aviso de "Quienes" no estaba fijo en el codigo**: lee `typeConfig`. Comprobado de punta a
punta cambiando la fecha a 06-30 y viendo que la ficha de una reinduccion la trae.

### 2026-09-04 — Con DOS convocatorias abiertas, la misma persona se inscribia dos veces (bug)

Lo pidio el cliente —"prueba con varias convocatorias de inicio a fin"— y salio a la primera.
`scripts/recorridos/varias-convocatorias.mjs`, 9 pasos.

**El sistema PERMITE dos convocatorias permanentes del mismo contenido.** No es un descuido de
nadie: salen de "creo otra por si acaso" o de un doble clic, y publicar la segunda no da error.

Mientras la segunda esta en BORRADOR no pasa nada malo: inscribirse en ella da `409
OFFERING_NOT_OPEN` —el error confuso que ya avisaba este RUNBOOK—. **El problema es con las dos
PUBLICADAS**: la misma persona se inscribia en las dos y quedaba con **dos inscripciones distintas
de la misma formacion**. Comprobado, con sus dos ids.

Y el dano no es cosmetico:

- la **obligacion es UNA**, asi que al terminar una se cierra la obligacion y **la otra inscripcion
  se queda viva para siempre**, sin nada que la cierre;
- los numeros de ejecucion cuentan **dos inscritos donde hay una persona**, lo que infla la
  asistencia y la cobertura de la jornada.

**La causa**: `learner.enroll` deduplicaba por `offeringId`. **El arreglo**: una inscripcion VIVA
por FORMACION. Si ya tiene una abierta en otra convocatoria de la misma actividad, se le devuelve
esa en vez de crear otra. Se mira lo vivo y no el historial a proposito: la reinduccion del ano que
viene necesita inscripcion nueva, y la anterior ya esta terminada.

#### Lo demas que comprobo el recorrido, y que estaba bien

| | |
|---|---|
| Dos convocatorias, **una obligacion** | la obligacion es de la FORMACION, no de la convocatoria |
| El aprendiz la ve **una vez** en pendientes | tambien con las dos publicadas |
| Terminarla | cierra su unica obligacion y le desaparece de pendientes |
| Cancelar una | **no** tumba la otra ni toca lo ya cumplido |
| Los proyectados | las dos proyectan lo MISMO (21 y 21): sin tajada cada una atiende a todos los obligados. Sumarlas seria contar dos veces a la misma gente — por eso existe la tajada, y por eso el plan las deduplica desde hoy |

### 2026-09-04 — Que ve el aprendiz de una CAPACITACION DEL PLAN en cada paso (medido)

Lo pregunto el cliente con esas palabras: "que pasa con el usuario en cada boton, que ve o que no
ve". Se contesta MIRANDO su pantalla, no razonandolo: el recorrido crea un testigo con el cargo al
que se le exige y consulta sus pendientes despues de cada paso.

| Se pulsa | Que ve el aprendiz |
|---|---|
| **Publicar la formacion** | **Nada.** El contenido queda congelado y no se abre ninguna convocatoria: es de jornada |
| **Exigirla en Quienes** | **Nada.** La regla queda con disparador PLAN y NO genera obligaciones: solo guarda a quienes |
| **Programar la convocatoria** | **Nada.** Queda en borrador |
| **Publicar la convocatoria** | **Nada todavia.** Se congelan los proyectados, y sigue sin llegarle a nadie |
| **APROBAR EL PLAN** | **Aqui le aparece**, y solo aqui: nacen las obligaciones con `source = PLAN` |
| **Convocarlo** desde la jornada | Queda inscrito y puede empezarla. A una jornada con fecha y cupo **no se apunta solo** |

Medido: `NO le aparece nada` tras publicar y exigir, `NO le aparece nada` tras programar y publicar
la convocatoria, `le aparece 1 vez` tras aprobar.

**Es lo contrario de las tres permanentes**, donde exigirla ya hace nacer la obligacion y publicar
la convocatoria le quita el candado. Confundir los dos modelos es lo que hacia que la pantalla
dijera "publica la convocatoria" y despues no pasara nada.

**Dos avisos nuevos en la pestana Convocatorias de la ficha** (pantalla de quien gestiona, no del
aprendiz):

- al de "Todavia nadie puede hacerla" se le anade, en una del plan, *"y despues hay que aprobar el
  plan de 2026"*;
- y se crea el que faltaba: **convocatoria publicada + plan sin aprobar**. Ahi el primer aviso no
  salta —la convocatoria SI esta publicada—, la pantalla no decia nada, y no le llegaba a nadie.
  Todo se veia bien y no pasaba nada, que es la peor forma de estar roto.

### 2026-09-04 — Programar significa lo mismo se entre por donde se entre

Habia tres puertas para crear una convocatoria —la pestana Convocatorias de la ficha, el modulo de
Convocatorias, y el plan— y **solo el plan metia el renglon cuando el plan ya estaba APROBADO**. Por
las otras dos, con el plan vivo, la jornada quedaba fuera: se dicta, la gente asiste, y no cuenta
para el cumplimiento de nadie.

Eso obligaba ademas a tener un CUARTO boton —el de la tarjeta del plan en la ficha— que si sabia
pedir el motivo. Cuatro caminos para lo mismo, y el usuario adivinando cual.

- **La pestana de la ficha** pide la novedad y mete el renglon cuando el plan esta vivo.
- **El modulo de Convocatorias** hace lo mismo: `NewOfferingDrawer` gana `autoPlan`, busca el plan
  aprobado del ano y, si la formacion elegida es del plan, pide el motivo y mete el renglon.
- **El boton de la tarjeta del plan se quito.** Era la unica razon de su existencia.

Con el plan en BORRADOR nada de esto hace falta: el renglon entra solo (Decision #75).

**No esta clicado.** Las llamadas que hacen esas pantallas estan probadas por los recorridos —con
plan borrador entra sola, con plan vivo hace falta el motivo— pero el cableado de la interfaz no se
ha ejercido en un navegador.

### 2026-09-04 — Convocar a todos falla ENTERO si se pasa del cupo (anotado, NO arreglado)

`POST /offerings/:id/enroll` con `allAssigned` lanza `409 OFFERING_CAPACITY_EXCEEDED` si los
obligados no caben en el cupo: **no convoca a los que caben**. Lo destapo el recorrido del plan al
crecer el cargo de pruebas por encima de las 30 sillas que tenia clavadas.

**Fallar es defendible** —no se eligen 30 de 40 al azar, y menos en cumplimiento—, pero el mensaje
dice solo *"El cupo es de 30 personas."* y ahi se acaba. Falta lo accionable: **cuantos hay
obligados**, cuantas sillas faltan, y que la salida es partir en dos jornadas con su tajada, que es
justamente para lo que existe la tajada.

En el recorrido solo se esquivo: el cupo se saca ahora del tamano del cargo (`elegido.n + 50`) para
que no se rompa solo cuando la base de pruebas crece. **El producto sigue igual.**

### 2026-09-04 — Recorrido de PILDORA: el tipo que se define por lo que NO hace

`scripts/recorridos/pildora.mjs`, 10 pasos, **en verde a la primera**. Que no encontrara nada es la
noticia: aqui lo que hay que comprobar es que las dos cosas que el tipo promete NO hacer, de verdad
no pasan. Los dos fallos posibles son silenciosos —un tipo que promete "sin examen" y exige uno
bloquea al aprendiz sin explicacion; uno que promete "sin constancia" y la emite mete papel en un
expediente de cumplimiento que no le corresponde—.

| | |
|---|---|
| **Se publica SIN examen** | en los otros cuatro tipos, publicar sin evaluacion se rechaza con "este tipo de formacion se evalua". Aqui no. Si `loQueExigeElTipo` cayera del lado que protege —su defecto cuando el tipo esta mal configurado— una pildora no se podria publicar nunca |
| El temario | **una sola pieza**: la leccion |
| Se abre sola una convocatoria PERMANENTE | y publicar **no se la exige a nadie** (`MANUAL`) |
| Al marcarla | el disparador es el que se pidio: aqui el servidor **no fuerza nada**, a diferencia del plan |
| **CUMPLIDA con ver el contenido** | sin examen no hay nada mas que hacer, y desaparece de pendientes |
| **NO emite constancia** | comprobado en "Mis constancias" |
| **No entra al plan** | 409 `ACTIVITY_NOT_PLANNABLE` — la compuerta nueva de hoy, ejercida tambien desde aqui |

Queda un solo tipo sin recorrido: **extraordinaria**.

---

### 2026-09-04 — El informe de cumplimiento contaba 96.000 obligaciones que ya no se le piden a nadie

**El fallo mas caro de los encontrados hasta hoy**, medido en la unica unidad que importa aqui: el
numero que el cliente le ensena a un auditor.

**Como se encontro.** No buscandolo. `reinduccion-ciclos.mjs` es el primer recorrido que, tras ver
que el motor cierra una ronda como NO REALIZADA, se acordo de preguntar **que ensena el informe de
esa ronda**. Dos respuestas, las dos malas:

| Lo que el motor escribia | Lo que el Seguimiento ensenaba |
|---|---|
| Ronda cerrada `EXPIRED_NOT_DONE` | **"Sin empezar"** — lo contrario de lo que es |
| **96.246** obligaciones `WITHDRAWN_*` | **"Sin empezar"**, y sumando al denominador |

```
                          antes          despues
renglones del informe    121.819         25.208     (sobraba el 79%)
avance global              0,18%          0,89%     (224/121.819 -> 224/25.164)
```

**La causa, y por que nadie lo vio.** Los tres informes (`ejecucionDeActividad`,
`estadosPorActividad`, `hechosDeAnalitica`) traian **todas** las obligaciones de la formacion, sin
filtro de estado ninguno. `resolverEstadoEjecucion` solo recibia `overdue` y el estado de la
INSCRIPCION, y quien nunca empezo no tiene inscripcion — asi que todo lo terminal caia en el cajon
por defecto, `SIN_EMPEZAR`.

Y encima estaba escrito que no podia pasar. `00-el-motor.md` §7 decia: *"todo lo abierto se consulta
por lista blanca, asi que un estado terminal nuevo cae solo de todas las consultas; es la razon de
que anadir EXPIRED_NOT_DONE no obligara a tocar ninguna"*. Cierto para las consultas de lo abierto y
**falso para los informes**, que no usan lista blanca. Una frase tranquilizadora a medias es peor
que no tener ninguna: la #142 se dio por terminada el dia que el motor empezo a escribir el estado.

**El arreglo** (Decision #144), en tres piezas:

1. `ESTADOS_RETIRADOS` en `execution-state.ts`, y los tres informes filtran por el. Retirarse de una
   audiencia no es no haber hecho la formacion: es que ya no se le exige.
2. `resolverEstadoEjecucion` recibe `assignmentStatus`, con dos estados de lectura nuevos:
   **No realizada** (`EXPIRED_NOT_DONE`) y **Eximida** (`WAIVED`). Van detras del resultado: si
   alcanzo a aprobarla, esta hecha aunque despues se cerrara el periodo.
3. El avance es `terminadas / (total - eximidas)`. La eximida sale porque dejarla dentro pone un
   **techo** al indicador —eximir a diez de cien haria imposible pasar del 90%— y castiga una
   decision legitima con motivo escrito. La no realizada se queda: es el incumplimiento.

**La leccion que vale para lo que venga.** El argumento ya estaba escrito en el propio codigo, dos
lineas mas arriba de la consulta rota: *"quien ya no trabaja aqui no cuenta como incumplimiento: su
obligacion murio con su salida, y dejarlo infla el denominador con gente que no va a formarse"*. Se
habia aplicado a la PERSONA y nunca al estado de la OBLIGACION. Cuando un criterio se escribe para
un caso, conviene preguntarse en voz alta a que otros casos se aplica el mismo argumento.

Y la de proceso: **un estado nuevo no esta terminado cuando el motor lo escribe, sino cuando alguien
lo lee**. Vale la pena recorrer los sitios donde se lee antes de dar por cerrada la decision.

### 2026-09-04 — Como probar "el ano que viene" sin esperar un ano ni tocar la base

`03-reinduccion.md` decia que "cierra y abre" solo se podia probar con unitarias porque **haria
falta esperar un ano o manipular fechas en la base**. Ninguna de las dos.

La ventana en la que nace la ronda siguiente esta fijada en **60 dias** antes del vencimiento
(`assignments.service.ts`, `windowDays: 60`). Con una recurrencia ANUAL hay que esperar al 30 de
enero; con una de **un mes**, la ventana de la ronda 2 ya esta abierta el mismo dia en que nace la
ronda 1 —60 dias de ventana sobre un periodo de 30—, y el motor abre la siguiente en la pasada
siguiente.

**Es el mismo codigo que correra en 2027**: `generateForRule` no sabe si la recurrencia es de un mes
o de un ano, solo compara `now` con `cycleOpensAt`. Se comprime la RECURRENCIA, no el reloj: no hay
fechas falsas en la base ni mocks de tiempo, que es lo que hace que estas pruebas envejezcan mal.

Y para dar la segunda pasada del motor sin esperar al cron de cada hora: `PATCH /users/:id` con el
area que la persona **ya tiene**. No cambia nada del registro y dispara `syncPersonSafely`, que es
exactamente lo que hara el cron el dia que la ventana se abra de verdad.

Regla general: **si una prueba necesita que pase el tiempo, mira si puedes acortar el periodo en vez
de mover el reloj.** Vale para cualquier recurrencia, vencimiento o ventana del producto.

### 2026-09-04 — `mirar.ps1` fallaba con "Fallo la compilacion de shared" si se lanzaba con la ruta entera

El script usaba `-WorkingDirectory $raiz` en los `Start-Process`, pero las tres compilaciones se
invocan directamente y corrian en la carpeta **actual**. Llamandolo desde `C:\Users\Prueba\Documents`
—lo normal si uno escribe la ruta completa— pnpm se ponia a rastrear `Documents` entera y moria en:

```
 EPERM  EPERM: operation not permitted, scandir 'C:\Users\Prueba\Documents\Mi musica'
```

que es un enlace del sistema. El mensaje que se veia era "Fallo la compilacion de shared", que no se
parece en nada a la causa. Arreglado con un `Set-Location $raiz` al principio.

**Ojo al diagnosticarlo:** correr el script con `2>&1` desde una herramienta **oculta el EPERM** y
solo deja el `throw`. En PowerShell 5.1, redirigir la stderr de un ejecutable nativo envuelve cada
linea en un ErrorRecord y el error real se pierde. Sin la redireccion, la causa sale a la primera.

### 2026-09-04 — Un script de demo que ensucia la CONFIGURACION del cliente no es gratis

`demo:encuesta` montaba su escenario y no lo recogia. El TIPO que crea aparece en Configuracion →
Tipos de formacion como uno mas, y ahi ya no se distingue de los seis reales.

Lo que paso de verdad: el cliente se topo con "Prueba de encuesta W6PWX" el 2026-09-01, **intento
borrarlo y no pudo** —sus propias formaciones lo referencian, que es la regla correcta— y ademas
**eligio ese tipo para una formacion suya**, porque estaba en la lista. Tres dias despues seguia
ahi. Un tipo de formacion no es una fila cualquiera: es la clase de la que cuelga todo lo demas.

Tres arreglos, y ninguno es la regla de borrado, que estaba bien:

1. `demo:encuesta --limpiar` borra todo lo que el script haya dejado, de esta corrida y de las
   anteriores, buscando por el prefijo `PRUEBA_ENCUESTA_`. Arrastra tambien las formaciones que
   **no** creo el script pero que alguien puso en ese tipo, que es el caso real.
2. La pantalla de Tipos de formacion tiene su propio borrado —no pasa por `CatalogManager`— y se
   habia quedado sin lo que aquel si hacia: leer el desglose del 409 y ofrecer desactivar. Ensenaba
   **"Conflict Exception"**, que ademas invita a reintentar. Ahora dice "lo usan 2 formaciones" y
   ofrece el boton. El lector del 409 vive en `lib/catalog-en-uso.ts`, compartido por las dos.
3. Desactivar no tenia efecto visible en esa pantalla —la tarjeta quedaba igual—, asi que se
   ofrecia una salida que parecia no hacer nada. Ahora hay pastilla "Desactivado", y se pulsa para
   volver a activarlo.

**La leccion:** un escenario de prueba que escribe en la configuracion del tenant tiene que saber
recogerse. Y cuando una pantalla se sale del componente generico, hereda la obligacion de replicar
lo que aquel hacia bien — no solo lo que hacia.

### 2026-09-04 — El motivo de un 409 viaja en `title`, no en `message`

Costo una corrida del recorrido de extraordinaria. `global-exception.filter.ts` mueve el `message` de
la excepcion a `title` y **nunca reenvia `message` crudo**, a proposito: puede traer detalle interno.
Leer `cuerpo.message` da vacio y parece que el servidor rechaza sin explicar.

Las dos formas que usa el producto, y conviene saber cual es cual:

| | |
|---|---|
| `ACTIVITY_NOT_PLANNABLE` | la excepcion **lleva** `message` → llega en `title`, listo para ensenar |
| `CATALOG_IN_USE` | **no lleva** `message` → `title` acaba siendo "Conflict Exception", y la frase la arma la pantalla con `references`/`usedBy`, que viajan aparte |

### 2026-09-04 (tarde) — Dos jornadas de la misma formacion proyectaban CADA UNA a todos

Lo pregunto el cliente: *"una convocatoria del plan en distinto momento para regionales diferentes,
¿se suman bien?... no solo por regional, por cualquier campo que se pueda acotar"*. No se sumaban.

**Medido** con `scripts/recorridos/plan-tajadas.mjs`, en las cinco facetas que tienen datos:

| Faceta | Lo que debia proyectar cada jornada | Lo que proyectaba |
|---|---|---|
| Area | 198 y 207 | **405 y 405** |
| Cargo | 288 y 57 | **345 y 345** |
| Regional | 1 y 2 | **3 y 3** |
| Tipo de cargo | 345 y 559 | **904 y 904** |
| Vinculacion | 817 y 144 | **961 y 961** |

Y una tajada sobre un grupo **sin ningun obligado** proyectaba el total entero en vez de cero, que
es el fallo silencioso clasico de estos filtros: cuando no encuentra a nadie, devuelve "todos".

**La causa: una colision de claves en un objeto.**

```js
const eligible = { active: true, ..., ...tajada.where };   // tajada = { audienceMembers: {...} }
const userIds  = await this.findUserIds({
  ...eligible,
  audienceMembers: { ... },   // <- MISMA clave: pisa la de la tajada, en silencio
});
```

El acotamiento se guardaba bien —la convocatoria tenia su audiencia— y hasta se NOMBRABA en el
texto: *"Personas alcanzadas por el requisito de esta actividad **de «SGI»**"*, con el numero sin
acotar al lado. El texto decia que estaba cortado y el numero no lo estaba.

**Por que no lo vio nadie.** El escalon de arriba —los ya obligados— usa la clave `assignments`, que
no choca con ninguna tajada. Asi que **el reparto funcionaba DESPUES de aprobar el plan y fallaba
ANTES**, que es justo cuando se programan las jornadas y se decide como partirlas. El recorrido del
plan probaba la tajada despues de aprobar (14 -> 1, en verde) y por eso pasaba.

**Lo que costaba.** Publicar CONGELA los proyectados. Dos jornadas de 405 congeladas para 405
personas dan un denominador de 810: la cobertura del ano no podia pasar del 50% aunque se capacitara
a todo el mundo. Es literalmente el fallo que la cabecera de `projected-audience.service.ts` dice que
la tajada existe para impedir — descrito arriba y reintroducido una rama mas abajo.

**El arreglo** (Decision #145): las dos condiciones van en un `AND` en vez de esparcidas.

```js
const userIds = await this.findUserIds({
  AND: [eligible, { audienceMembers: { some: { audienceId: { in: audienceIds }, leftAt: null } } }],
});
```

Quita la clase de error entera, no solo este caso: da igual que forma tenga la tajada —una audiencia,
una regional, o un `AND` completo cuando llega como regla sin guardar—.

**La leccion, que vale para todo el codigo de consultas:** *esparcir un objeto y anadirle claves es
seguro solo si sabes que ninguna se repite*. Cuando una de las dos mitades es variable —y `eligible`
lo es, porque depende de como se acoto— hay que combinarlas con `AND`, no con el operador de
propagacion. El error no da fallo, no da aviso y no se ve leyendo: solo se ve contando.

**Y la de proceso:** el recorrido del plan probaba la tajada en UN camino (con obligaciones) y se dio
por probada. Cuando una funcion tiene varios escalones de derivacion —aqui tres: obligaciones,
reglas, nada— hay que ejercer cada escalon, porque son codigos distintos que se parecen.

### 2026-09-04 (tarde) — Todos los recorridos cruzan ahora el Seguimiento

Antes probaban el MOTOR y ninguno miraba lo que el informe cuenta de todo eso — y ahi estaba el
fallo mas caro de la semana. Ahora los ocho llaman a `comprobarSeguimiento` (`seguimiento.mjs`)
antes de limpiar, que cruza la BASE contra el INFORME:

- lo retirado no entra en el informe;
- el resumen cuenta exactamente las filas que ensena;
- `EXPIRED_NOT_DONE` se lee "No realizada" y `WAIVED` se lee "Eximida", nunca "sin empezar";
- el avance cuadra con `terminadas / (total - eximidas)`;
- los estados suman el total: nadie se queda sin clasificar.

**Ojo al escribirlos:** `/assignments` topa en `pageSize=100`. Pedir 200 devuelve **422** y `items`
llega vacio, asi que la comprobacion comparaba contra cero y acusaba al informe de contar retiradas
cuando no era verdad. Es la tercera vez que este tope muerde en el proyecto. Se pagina.

### 2026-09-04 (tarde) — Y despues: ¿el acotamiento se porta igual en los seis tipos?

Lo pregunto el cliente al ver que la prueba se habia hecho solo sobre el plan: *"¿la hiciste solo en
plan o en las demas tambien? ¿Todas funcionan igual?"*. La respuesta de leer el codigo era que si
—`projected-audience.service.ts` recibe una actividad y una tajada, y no mira el tipo—, pero **eso es
exactamente lo que se creia del fallo anterior**, que llevaba semanas ahi porque nadie ejercia uno de
los tres escalones de derivacion.

Asi que se mide. `tajadas.mjs` prueba ahora **los seis tipos**, y de paso los DOS escalones, que son
codigo distinto:

| Escalon | Cuando manda | Como se ejerce |
|---|---|---|
| `RULES` | no hay obligaciones todavia | formacion del plan: las obligaciones nacen al aprobar |
| `OBLIGATIONS` | ya hay obligados | los otros cinco tipos: `ON_JOIN` con plazo 0 las crea al momento |

Resultado: identico en los seis. Y **con dos reglas que se solapan** —area 211 y cargo 294, con 89
personas comunes— los proyectados dan **416**, la union, y no 505, la suma. Si se sumaran, el
denominador del plan creceria sin que entre nadie.

**La leccion que se repite:** cuando una funcion tiene varios caminos que se parecen —tres escalones
de derivacion, seis tipos que comparten motor—, "es el mismo codigo" es una hipotesis, no una prueba.
Cuesta poco recorrerlos todos y es la unica forma de saberlo.

**Y un tropiezo del propio recorrido, por si vuelve:** las etiquetas de las formaciones salian de
recortar el codigo del tipo a diez caracteres, y `INDUCCION_GENERAL` e `INDUCCION_ESPECIFICA` dan los
dos `INDUCCION_`. La segunda moria en `DUPLICATE_CODE`, que se lee como un fallo del producto y no lo
era. Las etiquetas van numeradas.

### 2026-09-04 (noche) — La suite ESTANDAR: probar que el sistema honra su propia configuracion

Lo pidio el cliente: *"hay que crear pruebas estandarizadas para cada tipo de formacion, para cuando
se agreguen cambios, de inicio a fin, que tomen todo en cuenta"*.

**El problema de los ocho recorridos escritos a mano.** Prueban muy bien lo PROPIO de cada tipo —el
renglon del plan, la ronda de la reinduccion, el cambio de cargo de la especifica— pero tienen dos
grietas que crecen:

1. **Se desincronizan.** Cambiar algo comun obliga a acordarse de ocho archivos, y el que se olvide
   sigue en verde probando lo de antes.
2. **Un tipo nuevo no se prueba solo.** El cliente puede crear "Refuerzo" desde Configuracion —lo
   hizo hoy— y no habria recorrido que lo mirara.

**La idea: el contrato es la configuracion.** `estandar.mjs` no lleva una tabla de expectativas
escrita aparte, porque una tabla escrita aparte es exactamente lo que se desincroniza. Las
expectativas se DERIVAN de `activity_types.config`, y por eso la prueba sigue siendo cierta cuando
el cliente cambia el tipo desde la pantalla:

| Config | Lo que se comprueba de punta a punta |
|---|---|
| `requiresAssessment` | el temario lleva examen y el aprendiz lo aprueba |
| `requiresSurvey` | lleva encuesta, y va la ULTIMA |
| `issuesCertificate` | hay constancia — o NO la hay, si el tipo no la promete |
| `defaultAssignmentMode` | `ON_HIRE` obliga solo al publicar; el resto no obliga a nadie |
| `defaultOfferingKind` | `PERMANENT` abre convocatoria sola y el aprendiz entra solo |
| `participatesInPlan` | entra al plan, o da 409 `ACTIVITY_NOT_PLANNABLE` |
| — | y el **Seguimiento** dice lo mismo que paso |

Lo que comprueba no es "la induccion general hace X" —que envejece— sino algo mas fuerte y estable:
**el sistema honra su propia configuracion**.

**Como conviven las dos capas.** No se sustituyen:

    estandar.mjs   ->  todos los tipos · lo COMUN · derivado de la configuracion
    <tipo>.mjs     ->  un tipo · lo SUYO · escrito a mano

Al tocar el motor o anadir un tipo, se corre la estandar. Al tocar algo propio de un tipo, el suyo.

**Y lo primero que encontro fue una mentira en la documentacion.** El `LEEME` de los recorridos
afirmaba que *"en los otros cuatro tipos, publicar sin evaluacion se rechaza"*. **No se rechaza.** La
Decision #74 lo dejo deliberadamente en AVISO —que queda en la auditoria, no en la respuesta— con
dos motivos escritos en `versioning.service.ts`:

> 1. "El tenant todavia no puede cambiar ese config desde la interfaz."
> 2. "Ni una sola de las 19 pruebas de punta a punta anade evaluacion."
>
> "Se convierte en compuerta el dia que el config del tipo se edite desde la interfaz."

**Los dos motivos han dejado de ser ciertos**: el config se edita desde Configuracion -> Tipos de
formacion, y casi todos los recorridos anaden evaluacion. La condicion que el propio codigo puso
para convertirlo en compuerta se cumplio. Es decision del cliente, y queda anotada.

**Una trampa de la propia prueba, por si vuelve:** el aviso viaja en la AUDITORIA, no en la respuesta
del publish. Buscarlo en la respuesta da vacio y se lee como si el aviso se hubiera perdido.

### 2026-09-04 (noche) — "Ajustar proyectados" se movio de sitio

Lo pregunto el cliente: *"al publicar una convocatoria pide ajustar proyectados, ¿esto es util o es
redundante?"*. Util, pero mal colocado.

Estaba DENTRO del cajon de publicar, y ahi el numero acaba de derivarse de los obligados de hoy: no
ha tenido tiempo de quedarse viejo. Ofrecer corregirlo en ese momento invita a teclear encima de un
dato exacto, y el motivo —que es la evidencia que lee quien audita— acaba diciendo "ajuste inicial",
que no explica nada.

Ahora: **publicar congela lo derivado y punto**; corregir es otra decision, sobre la cifra ya
congelada, con su boton en la tarjeta de Proyectados y su propio cajon. La Regla de oro 3 no cambia
—el numero se deriva, se congela, y corregirlo exige motivo—; cambia CUANDO se ofrece.

`proyectados-ajuste.mjs` prueba la situacion entera, que es lo unico que dice si el indicador queda
coherente:

| | |
|---|---|
| Publicar | congela **exactamente** lo derivado (97), con sello y **sin** motivo de ajuste |
| Entran 2 personas mas | hoy se derivarian 99, y **el congelado sigue en 97** |
| Por que no se mueve solo | si se recalculara, el denominador del ano cambiaria por detras cada vez que entra alguien (regla de oro 2) |
| Ajustar sin motivo | 422. Con "ok" de motivo, 422. Con -1 proyectados, 422 |
| Ajustar con motivo | 99, el motivo guardado tal cual, y **sigue congelado**: ajustar no descongela |

### 2026-09-04 (noche) — Una fecha de campana que no existe, y nadie se entera

Leyendo la configuracion REAL del tenant para escribir la guia de usuario aparecio esto: la
reinduccion tenia la campana puesta en **`09-31`**. Septiembre tiene 30 dias.

No falla nada. `Date.UTC(2026, 8, 31)` no lanza: se lleva la fecha al mes siguiente en silencio. Asi
que la campana vencia **el 1 de octubre** mientras la pantalla seguia diciendo 09-31, y el auditor
leeria una fecha distinta de la que el sistema usa.

**Medido**, con las tres que el patron dejaba pasar:

| Guardado | Vencimiento real (Bogota) |
|---|---|
| `09-31` | 1 de octubre |
| `04-31` | 1 de mayo |
| `02-30` | 2 de marzo |

**La causa.** El patron `^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$` acepta `3[01]` en CUALQUIER mes, y
estaba **copiado a mano en tres sitios**: el requisito, la matriz por cargo y el tipo de formacion.
Un patron copiado en tres sitios es un patron que se corrige en dos.

**El arreglo**, en dos capas porque hacen falta las dos:

1. `packages/shared/src/schemas/fixed-date.ts` — un solo `fixedDateSchema` que ademas comprueba que
   el dia EXISTE en ese mes, y los tres sitios lo usan. Se valida contra un ano bisiesto a
   proposito: `02-29` es legitimo para una campana y rechazarlo obligaria a explicar por que.
2. `nextFixedDate` **acota** el dia al ultimo del mes en vez de desbordarlo, igual que ya hacia
   `addMonths` para el caso hermano. Es la red de abajo: la base ya tiene fechas escritas con el
   patron viejo, y no se arreglan solas.

**La leccion.** El sistema de tipos no protege de esto: `'09-31'` es un `string` perfectamente
valido. Cuando un dato se guarda como TEXTO con estructura —una fecha MM-DD, un codigo, una
referencia— la validacion es lo unico que hay, y tiene que vivir en UN sitio. Y conviene leer la
configuracion real del cliente de vez en cuando: este fallo no lo encontro ninguna prueba, lo
encontro mirar lo que el cliente habia escrito.

### 2026-09-04 (noche) — Retirar un requisito de toda la empresa tardaba 61 segundos

Lo destapo la e2e al ponerse en rojo: el boton "Retirar" salia **deshabilitado** en la captura del
fallo, es decir, la peticion seguia en vuelo pasados 30 segundos. No era la prueba.

**Medido, con 1.116 personas:**

| | |
|---|---|
| Crear el requisito de toda la empresa | **1,0 s** |
| Retirarlo | **61,1 s** |

Sesenta veces mas lento deshacer que hacer, para la operacion inversa. En pantalla es un boton
apagado un minuto entero, sin nada que explique la espera.

**La causa** estaba en `withdrawLeavers`, marcando como leidos los avisos de lo retirado:

```js
OR: afectados.map((fila) => ({ recipientUserId: fila.userId, referenceId: fila.targetId })),
```

Un par (persona, formacion) por cada obligacion: **mil clausulas en un solo `OR`**, y Postgres
evaluando esa expresion booleana entera.

Y no hacia falta: el bucle va POR REGLA, y todas las obligaciones de una regla apuntan a la misma
formacion (`newRow` copia `rule.targetId`). Con dos `IN` —las personas por un lado, las formaciones
por otro— el producto cartesiano es **exactamente el mismo conjunto**, no una aproximacion mas
ancha. **61,1 s -> 1,3 s.**

**Es la tercera vez que este patron muerde en el proyecto**, siempre con la misma forma —algo por
fila donde cabe algo por lote—:

| Cuando | Donde | Antes | Despues |
|---|---|---|---|
| 2026-09-03 | `audiences.syncPerson`, un INSERT por audiencia | 9,0 s | 0,4 s |
| 2026-09-03 | `withdrawLeavers` recorriendo 569 reglas | — | acotado |
| 2026-09-04 | `withdrawLeavers`, un `OR` de mil pares | 61,1 s | 1,3 s |

**La leccion, ya con tres casos:** cuando una operacion construye una condicion **a partir de una
lista de filas**, hay que preguntarse cuanto mide esa lista con la plantilla entera. Y la pista de
que algo va mal no vino de una prueba de rendimiento: vino de una prueba funcional que empezo a
agotar su tiempo de espera. **Un test que se vuelve lento esta diciendo algo**; subirle el tiempo
sin mirar habria enterrado esto.

### 2026-09-04 (noche) — Cerrada la Decision #74: publicar sin lo que el tipo pide se rechaza

Las dos razones escritas en su dia para dejarlo en AVISO caducaron —el config del tipo se edita
desde la interfaz, y los recorridos anaden evaluacion— y el propio comentario ponia la condicion:
*"se convierte en compuerta el dia que el config del tipo se edite desde la interfaz"*.

Ahora publicar sin evaluacion devuelve **409 `TYPE_REQUIREMENTS_MISSING`**, con el mensaje que ya
existia: *"este tipo de formacion se evalua: agrega una evaluacion antes de publicar. Sin nota no hay
nada que ensenarle a un auditor"*.

**No se anadio un "publicar igualmente"**, y es deliberado: la salida ya existe y es mejor —apagar
"Se evalua" en el TIPO—. Se dice una vez, en su sitio, y vale para todas las de esa clase. Un
escape por formacion volveria a dejar la regla en una sugerencia, que es de donde venimos.

**Lo que costo, y estaba previsto:** tres de las pruebas de punta a punta publicaban tipos que piden
evaluacion sin anadirla. Eso era, palabra por palabra, la segunda razon de la #74 para no bloquear
—"ni una sola de las 19 pruebas anade evaluacion... es la senal de que la regla no esta acordada"—.
Ahora esta acordada, y las pruebas se pusieron al dia con un helper compartido (`agregarEvaluacion`).

### 2026-09-04 (noche) — Reinduccion: la primera ronda, y quien acaba de entrar

Dos cosas que llevaban semanas anotadas como "decision del cliente" y se cerraron.

**1. La primera ronda ya cae en la fecha de la campana** — si da tiempo. Antes vencia siempre a los
30 dias de publicarla, asi que la pantalla decia "cada ano antes del 31 de marzo" y la primera no
vencia ese dia. La razon para dejarlo asi era buena: estrenarla el 15 de marzo con vencimiento el 31
da dos semanas para 1.060 personas.

No habia que elegir una de las dos, sino mirar **cuanto falta**:

| Falta | Vence |
|---|---|
| mas que la ventana (60 dias) | en la fecha de la campana |
| menos | a los 30 dias de gracia |

Se usa la VENTANA de la propia recurrencia como umbral y no un numero suelto: es la misma antelacion
con la que el motor abre las rondas siguientes, asi que la primera se comporta como las demas.

**Medido:** publicada el 2026-09-04, la primera ronda vence el **31 de marzo de 2027**.

**2. Quien ingreso hace menos de N meses no entra a la campana** (`exemptRecentHiresMonths`, 6 para
TRANSPRENSA). Su induccion ES su actualizacion de ese ano, y encimarle la reinduccion sobre una
induccion a medio hacer es pedirle dos veces lo mismo. Antes habia que eximir a mano a cada ingreso
reciente —unos cincuenta al ano— escribiendo cincuenta veces el mismo motivo.

**Medido:** de 1.071 personas, obliga a **747**; 324 quedan fuera por ingreso reciente. Solo afecta a
la PRIMERA ronda de cada quien: a quien ya tiene historia con la regla la campana anterior si le
toco, y sigue su ciclo.

### 2026-09-04 (noche) — Convocar a todos ya no falla entero si no caben

Antes: `OFFERING_CAPACITY_EXCEEDED`, cero inscritos y un mensaje que solo decia el cupo. Fallar era
defendible —nadie quiere que el sistema elija 30 de 40 al azar— pero el problema no era elegir: era
hacerlo **al azar**.

Ahora convoca a los que caben con un criterio que se explica en una frase y se defiende delante de
un auditor: **primero quien esta mas cerca de incumplir**, es decir, quien vence antes. Quien no
tiene obligacion viva va al final.

Y la respuesta trae `sinCupo`, que es lo unico que le sirve a quien esta programando: la pantalla
dice *"30 inscritas de 47 obligadas · faltan 17 por cupo: programa otra jornada"*. Los que quedan
fuera siguen obligados y sin inscribir, que es justo lo que la cobertura tiene que ensenar.

### 2026-09-04 (noche) — Una opcion que existe y no se puede tocar es una opcion que no existe

El cliente pregunto: *"¿desde donde se configuran esos 6 meses?"*. La respuesta honesta era **desde
ningun sitio**: `exemptRecentHiresMonths` se anadio al esquema, al motor y a la semilla, pero no a la
pantalla de Tipos de formacion. Funcionaba, y solo se podia cambiar resembrando.

Ya esta en *Configuracion → Tipos de formacion → Configurar*, junto a la fecha de la campana y a
"si llega la siguiente y no hizo la anterior". Solo sale si la formacion VUELVE: sin ciclo no hay
"dentro del ciclo".

**La leccion:** al anadir una opcion nueva, el recorrido no termina en el motor. Son cuatro sitios
—esquema, motor, semilla y **pantalla**— y el cuarto es el unico que el cliente ve. Vale la pena
preguntarse "¿y desde donde se cambia esto?" antes de dar por hecha la funcion.

### 2026-09-04 (noche) — Documentacion de usuario: una guia POR TIPO

Habia una sola guia con los seis tipos dentro. El cliente pidio una por tipo, y tiene razon: quien
va a montar una pildora no deberia leerse las inducciones para llegar a lo suyo.

`docs/guias/` — seis paginas, cada una con la misma espina (lo que promete su tipo · paso a paso ·
lo que pasa solo · lo que hay que saber) y el color con el que la aplicacion marca ese tipo, para
que la guia y la pantalla digan lo mismo. La guia general se queda como indice comparativo.

**Y una regla de escritura que costo un error:** en la documentacion de USUARIO no van las
decisiones de producto. Habia frases como "decision del cliente" o "pendiente conocido", que son
lenguaje de equipo: quien usa el sistema no tiene que enterarse de que algo esta en discusion, ni
cargar con una decision que no le toca. Lo abierto vive en el HANDOFF y en los modulos.

**Y otra que costo mas:** la guia decia que publicar una induccion general "nace un requisito para
toda la empresa". Es literalmente cierto y **enganoso**: nace con el corte de solo-nuevos puesto por
el sistema y obliga a CERO. Lo caza el cliente leyendola. Medido: alcance 1.060, obligadas 0. La
documentacion de usuario se escribe **midiendo**, igual que la tecnica; de memoria se cuelan cosas
que suenan bien y no son.

### 2026-09-04 (noche) — Un tipo de formacion nuevo (RECERTIFICACION) sin tocar codigo

El cliente pregunto si la certificacion de montacargas debia ser una induccion especifica que se
repite o un tipo aparte. Salio un tipo aparte, y montarlo costo **una fila en `activity_types`, un
bloque en el seed y un recorrido**. Ni una linea de logica.

**La suite estandar lo cubrio sola.** `estandar.mjs` lee el `config` del tipo y comprueba el
contrato que ese config promete, asi que el tipo nuevo entro en la suite sin tocarla. Es el primer
tipo creado despues de la suite y es la prueba que le faltaba: el contrato se deriva de la
configuracion, no de una lista de tipos escrita a mano.

**Lo que si costo dos horas: publicar fallaba con 409.** El bloque del seed traia
`requiresSurvey: true` y el tenant no tenia encuesta asignada a ese tipo, asi que la puerta de la
Decision #74 —*no publicar si falta lo que el tipo promete*— rechazaba la publicacion, correctamente.
Cinco pasos del recorrido en rojo por una config incompleta, no por un fallo. **La puerta hizo justo
lo que se puso a hacer**, y el diagnostico fue leer el `code` del 409 (`TYPE_REQUIREMENTS_MISSING`)
en vez de suponer que el recorrido estaba mal escrito.

**Y una advertencia sobre lo que una prueba dice que prueba.** El paso 5 afirmaba que "dos personas
certificadas en meses distintos no vencen el mismo dia", pero creaba las dos con segundos de
diferencia: las dos vencian el mismo dia, y con razon. La prueba pasaba **sin comprobar lo que
decia**. Se reescribio para comprobar la CAUSA (`everyMonths` sin `fixedDate`, y
`computeNextCycleDueAt` anclando en `completedAt`) en vez de simular ocho meses. Una asercion que
pasa siempre no es una asercion: es un comentario con sintaxis de codigo.

**Tres valores de su config son obligatorios, no gustos** —y los tres se equivocarian en silencio:

- **Aniversario y no fecha fija.** Un certificado vence el dia de cada persona. Con campana, quien
  se certifico en agosto figura al dia hasta marzo con la habilitacion caducada desde agosto.
- **`participatesInPlan: false`.** El servidor fuerza recurrencia NULA a lo que participa del plan.
  Un `true` aqui mata el aniversario sin dar error y el tipo deja de servir.
- **`onExpiry: ESPERA`**, al reves que la reinduccion: una habilitacion vencida sigue siendo la que
  hay que renovar. No se pasa pagina.

### 2026-09-05 — Quien ya hizo la formacion y cambia de cargo la volvia a deber

El pendiente que llevaba escrito desde el 2026-09-03 en `02-induccion-especifica.md`, cerrado antes
de que apareciera en la matriz real. **La deduplicacion del motor es POR REGLA** —indice unico
(regla, persona, ronda)— y eso es correcto mientras cada formacion cuelgue de un solo cargo. En
cuanto la matriz repite una formacion en varios puestos deja de serlo: la regla del cargo nuevo no
tiene historia de la persona y le abre la ronda 1 de algo que acaba de terminar, con constancia
emitida y sin nada en pantalla que se lo explique.

**No es hipotetico.** En transporte la induccion de bodega vale igual para auxiliar, montacarguista
y coordinador, que es justo lo que va a hacer la matriz del cliente.

`decidirPrimeraRonda` (`next-cycle.ts`, logica pura, seis unitarias) decide tres caminos al generar
la ronda 1 de quien no tiene historia con esa regla pero SI completo esa misma formacion por otra:

| | |
|---|---|
| No se repite | no le nace nunca: el hecho no caduca |
| Vigente | no le nace todavia; le nacera en la ventana de la vigencia que ya tiene, **con SU vencimiento** |
| Caducada | le nace como a cualquiera, con sus dias de gracia — **nunca heredando una fecha ya pasada** |

**Dos decisiones que no son gusto.** Solo cuenta lo **CUMPLIDO**: una eximida o una retirada no son
evidencia de que la persona sepa hacer el trabajo, son la explicacion de por que no se le exigio, y
esa explicacion pertenece al cargo donde se escribio. Y la consulta se hace **una sola vez por
regla y solo por quienes no tienen ninguna fila suya**: en la pasada de rutina esa lista esta vacia
y no cuesta ni un viaje a la base. Es la cuarta vez que el proyecto se topa con "algo por fila donde
cabe algo por lote", y esta vez se escribio ya por lote.

Medido en el paso 14 del recorrido de la especifica: antes del cambio **1 CUMPLIDA**, despues
**1 CUMPLIDA y ninguna viva**, y en la pantalla del aprendiz **cero** veces.

**Lo que NO cubre, dicho:** una formacion exigida por dos reglas VIVAS a la vez —cargo y area, solo
posible en tipos de alcance `MANUAL`— sigue naciendo dos veces. Aqui solo se mira lo cumplido.

### 2026-09-05 — La campana acusaba de incumplir exactamente a quien cumplia

Salio buscando otra cosa: al escribir la unitaria de la carga de vigencia con una recurrencia de
fecha fija, la asercion daba lo contrario de lo esperado. **El ancla de la ronda siguiente era
`completedAt` para las dos formas de repetir**, y en una campana eso es falso.

Quien hace la reinduccion el 20 de marzo la hace **para el periodo que vence el 31**, no para el dia
20. Con el ancla en el dia 20, `nextFixedDate` devuelve la ocurrencia siguiente a ese dia —el **31
de marzo del mismo ano**, once dias despues—, la ventana de 60 dias ya esta abierta, y al dia
siguiente de cumplir le nace la **ronda 2 con el mismo vencimiento que acaba de satisfacer**.

MEDIDO, reproduciendo lo que hace el motor: completada el 20/03/2026 -> ronda 2 abierta venciendo el
31/03/2026. Esa ronda pasa a VENCIDA el 1 de abril y se cierra como **NO REALIZADA** diez meses
despues.

| Quien | Que le pasaba |
|---|---|
| La hizo **antes** del 31 de marzo (o sea, cumplio) | ronda 2 el 31, vencida el 1 de abril, NO REALIZADA en enero |
| La hizo tarde, o no la hizo | su ancla caia despues del 31 y su siguiente era la del ano que viene: **correcto** |

Un indicador que solo castiga a quien cumple esta al reves, y de la forma mas dificil de ver: el
informe acusa a la gente que si se formo.

**El arreglo** es `cycleAnchor` (`due-date.ts`): la fecha fija ancla en el **VENCIMIENTO** de la
ronda —lo que se satisface es el PERIODO— y "cada N meses" sigue anclando en `completedAt`, que es
el sentido entero del aniversario. Cinco unitarias sobre las funciones reales de fecha, incluidas
las dos esquinas: adelantarse no adelanta la campana, y hacerla tarde tampoco la corre.

**Por que no lo vio ningun recorrido, y por que sigue sin verlo.** `reinduccion-ciclos.mjs` comprime
la recurrencia a **un mes** para no esperar un ano — el truco que este proyecto usa siempre— y prueba
el camino de la que NO se hizo. El caso solo aparece con `fixedDate` **completando dentro de la
ventana**, y para eso hacen falta 60 dias entre crear la regla y la fecha de campana. Una campana no
se puede comprimir: su periodo es el ano, no un numero que se pueda bajar. Asi que aqui la unitaria
sobre las funciones de fecha reales **es** la prueba, y conviene que quede dicho en vez de fingir
una cobertura de punta a punta que no hay.

**La leccion, que ya tiene tres marcas:** el truco de comprimir la recurrencia solo prueba lo que
puede comprimirse. Todo lo que dependa de una FECHA DEL CALENDARIO —campana anual, ultimo dia del
mes del plan— se queda fuera y hay que probarlo en la logica pura.

### 2026-09-05 — No habia forma de registrar una formacion presencial, y nadie lo habia notado

Salio de una pregunta del cliente sobre certificados externos y acabo destapando algo mucho mayor.
**`CompletionService.evaluate` —lo unico que cierra una obligacion— solo lo llaman `player.service`
y `attempts.service`, las dos del lado del APRENDIZ.** `POST /offerings/:id/complete` cierra la
jornada y marca el renglon del plan como EJECUTADO, pero no toca a ninguna persona. Y el roster era
de solo lectura.

Traducido: **la unica manera de que a alguien se le cerrara una formacion era que entrara a la
plataforma y completara el contenido.** Una capacitacion de la ARL, presencial, de dos horas, con
veinte personas: no habia como darla por cumplida.

En una empresa bajo SG-SST la mayor parte del plan anual se dicta en salon. Y encima de esa capa
esta construido todo lo demas —los siete tipos, el plan con proyectados y tajadas, la cobertura, las
constancias, el Seguimiento—, asi que el indicador de cumplimiento enseñaba **cero de todo lo que de
verdad se hizo**.

Por eso los recorridos decian *"ASISTENCIA: solo aplica a lo presencial"* y acto seguido *"la
formacion es VIRTUAL: se acredita completando el contenido"* — el caso presencial nunca se probo
porque no se podia hacer.

**LAS TRES VIAS DE EVIDENCIA (Decision #157).** Se generalizo en vez de anadir un campo:

|  | Cuando | Que queda |
|---|---|---|
| A. En plataforma | contenido + examen | progreso, nota, constancia propia — ya existia |
| B. Lista de asistencia | jornada con fecha, la dicte quien la dicte | quien vino, quien no, y quien lo marco |
| C. Papel de un tercero | lo emite un organismo acreditado | entidad, numero, expedicion, vencimiento, escaneo |

**LA ASISTENCIA VA CON EL `kind`, NO CON LA MODALIDAD**, y es la decision que mas se piensa mal. Una
jornada `EVENT` se cierra por lista la dicte como la dicte —presencial en un salon o virtual en
vivo—: en las dos hay quien estuvo y en ninguna queda contenido completado. Una `PERMANENT` no.
Atarlo a `PRESENCIAL` habria dejado fuera el webinar de la ARL.

**CERRAR POR ASISTENCIA NO PASA POR `evaluate`, y eso hay que registrarlo.** `evaluate` recalcula
desde contenidos vistos y examenes aprobados; para una jornada de salon esos hechos no existen ni
van a existir. No es un atajo alrededor de la regla: la evidencia es OTRA. Pero salta la evaluacion
que exige el tipo, que es lo que un auditor cuestionaria, asi que queda `attendance_by` ademas de la
auditoria. El recorrido lo mide con el caso mas duro: tipo RECERTIFICACION, que exige examen, y
nadie lo responde en la plataforma.

**QUIEN NO VINO LA SIGUE DEBIENDO.** `attended: false` es un DATO, no un hueco: "convocado y no
vino" es lo que hay que poder demostrar. No se cierra ni se retira nada.

**Y CON PAPEL DE TERCERO NO SE EMITE CONSTANCIA PROPIA:** dos papeles con dos numeros para un mismo
hecho es peor, en auditoria, que ninguno. Sin papel si se emite — la charla presencial que no
certifica nada deja a la persona sin nada mas.

### 2026-09-05 — "El papel manda", y como se mide sin tocar el reloj

Lo decidio el cliente: *"el papel siempre debe mandar, en caso de externas"*. Contradice a proposito
la Decision #111 —*"la vigencia sale de la recurrencia y pedirla aparte seria pedir el mismo dato dos
veces"*— y con razon: **la fecha del certificado de un tercero no la pone la empresa**. Si la ARL
certifica por tres anos y el tipo dice doce meses, reclamarla al ano es inventar un incumplimiento
sobre alguien con su habilitacion vigente y el papel para probarlo.

`proximoVencimiento` (`due-date.ts`) resuelve las tres en orden: **papel → campana → aniversario**.
La fecha se copia a `assignments.valid_until_override` y no se queda solo en la inscripcion, porque
es el MOTOR quien la lee y la obligacion es la fila que el auditor rastrea.

**Ojo a la forma:** `validUntilOverride` **no es un ancla** a la que sumarle meses — es el
vencimiento mismo. Tratarlo como ancla daria "tres anos despues de que caduque".

**Y como se prueba de punta a punta sin manipular fechas:** un certificado que vence dentro de **30
dias** sobre una formacion con recurrencia de **12 meses**. Es el mismo truco de comprimir que usa
`reinduccion-ciclos.mjs` —la ventana esta fijada en 60 dias, asi que un papel a 30 la tiene abierta
hoy—. Si manda el papel, nace la ronda 2 venciendo el dia del papel; si mandara la recurrencia, no
naceria ninguna. **Medido: nace, y con la fecha del papel.**

**La trampa que volvio a morder:** el vencimiento se guarda al FIN DEL DIA en Bogota, que en UTC cae
el dia siguiente a las 04:59. La primera corrida dio dos fallos —`2026-10-06` contra `2026-10-05`—
que no eran del sistema sino de la asercion. Ya le habia pasado al recorrido del plan.

### 2026-09-05 — Un testigo de prueba tiene que cumplir DOS condiciones, no una

Al escribir `asistencia.mjs` hacia falta una formacion cuyo tipo NO llevara certificado externo,
para comprobar que el servidor lo rechaza. Se eligio "el primer tipo sin `tracksExternalCertificate`"
y salio **Induccion general** — que exige evaluacion. La compuerta de la Decision #74 rechazo
publicarla sin examen, y de ahi cayeron en cascada cuatro pasos: sin publicar no hay jornada, sin
jornada no hay convocados, y sin convocados el `enrollmentId` iba `undefined` y el 409 esperado
llegaba como **422 de validacion**.

El diagnostico costo una corrida entera porque los pasos intermedios **no comprobaban nada**: se
llamaba a publicar y a convocar sin mirar el resultado, asi que el primer `comprobar` que fallaba
estaba cinco operaciones despues de la causa. Ahora cada eslabon tiene el suyo y el mensaje dice
exactamente que se rompio.

**La leccion, que es la misma de siempre en este directorio:** un paso preparatorio sin asercion no
es preparacion, es una suposicion — y cuando falla, el recorrido acusa al sitio equivocado.

### 2026-09-05 (tarde) — Le puse columnas a una tabla cuando el modelo ya tenia la suya

La primera version de la Decision #157 anadio `attended_at` y `attendance_by` a `enrollments`.
**`attendance_records` ya estaba en el esquema desde el Sprint 0** —con los tres estados
(PRESENT/ABSENT/JUSTIFIED), el metodo (INSTRUCTOR/QR/SIGNATURE), la justificacion, la firma y quien
marco— y vacia porque nadie la escribia. Al lado, `session_acts` para el acta con su hash.

Se descubrio al intentar anadir el estado JUSTIFICADO: `prisma migrate deploy` fallo con *"invalid
input value for enum AttendanceStatus: PRESENTE"*, y despues `generate` con *"the enum
AttendanceStatus cannot be defined because a enum with that name already exists"*. El error decia
exactamente lo que pasaba y aun asi hubo que pararse a leerlo dos veces.

**Se corrigio el mismo dia, con la tabla todavia vacia**, y no cuando hubiera un ano de asistencias
repartidas entre dos sitios. Es el mismo problema que este proyecto ya conoce por el otro lado: el
informe de Vencimientos leyendo `certification_grants`, que tampoco escribe nadie — solo que aquel
lleva meses asi y este se cazo en horas.

**La leccion, que vale mas que el caso:** este esquema se diseno ENTERO al principio y lleva partes
esperando. Antes de anadir una columna, mirar si el modelo ya la tiene. Buscar `model X` en
`schema.prisma` cuesta diez segundos; una migracion de vuelta cuesta el dia que alguien descubre que
hay dos sitios donde mirar.

**Y de paso salio el permiso correcto.** El endpoint iba bajo `offerings:manage`; `attendance:take`
existe desde el Sprint 1 sin usarse, y existe porque **el INSTRUCTOR** tiene que poder decir quien
vino sin poder ademas programar, publicar ni cancelar convocatorias.

### 2026-09-05 (tarde) — El informe daba por TERMINADA la ronda que la persona todavia debe

El fallo mas caro del dia, y no era del trabajo nuevo: **lo destapo medirlo**. El cliente pidio
probar con varias reglas y con acotamiento, y al cruzar el Seguimiento con cinco obligaciones —dos
cumplidas de verdad y tres pendientes— el informe decia **cuatro terminadas**.

Los tres informes hacian esto:

```
// La inscripcion MAS RECIENTE de cada persona: una formacion recurrente tiene una por ronda,
// y la que describe el estado de hoy es la ultima.
const ultima = new Map();  // clave: userId | activityId
```

El comentario explica la suposicion y la suposicion es falsa: la inscripcion mas reciente describe
la RONDA mas reciente, no todas. Y como `resolverEstadoEjecucion` pregunta primero por el resultado
—correctamente: una formacion aprobada el mes pasado no esta "atrasada"— **quien completo la ronda 1
salia con la ronda 2 tambien como TERMINADA**.

MEDIDO: el mismo escenario pasaba de **80% de avance a 40%**, que es el real. En produccion es la
reinduccion de 796 personas figurando hecha el 2 de enero de cada ano.

Es el hermano del fallo del 2026-09-04 —el informe contando lo retirado como "sin empezar"— pero al
reves, y por eso es peor: **aquel inflaba el incumplimiento y este infla el cumplimiento**. Nadie
reclama un numero que le favorece, asi que este no se descubre solo.

**No hizo falta inventar nada:** el enlace existe en las dos direcciones desde el Sprint 3 (Decision
#2, *la ejecucion y la obligacion se ENLAZAN, no se fusionan*): `assignments.completed_enrollment_id`
apunta a la que la cerro y `enrollments.assignment_id` a la que se venia a satisfacer. Se usan los
dos y no se supone nada — una inscripcion sin obligacion no colorea ninguna fila.

`inscripcionDeCadaRonda` vive en `execution-state.ts` y se exporta por el mismo motivo que
`ESTADOS_RETIRADOS`: **son tres informes**, y el que se olvide dara un numero distinto en su
pantalla.

**Por que no lo vio ningun recorrido:** `reinduccion-ciclos.mjs` prueba el camino de quien NO la
hizo —ronda 1 cerrada como NO REALIZADA y ronda 2 abierta— y ahi no hay inscripcion, asi que no hay
falso TERMINADA. Hacia falta alguien que hubiera CUMPLIDO la ronda anterior, que es justo lo que
produce cerrar por asistencia.

### 2026-09-05 (tarde) — Lo que se midio con varias reglas y con acotamiento

Lo pidio el cliente y da tres respuestas que conviene tener escritas:

| | |
|---|---|
| Formacion exigida por **dos reglas** que alcanzan a la misma persona | le nacen **DOS** obligaciones (la deduplicacion es por REGLA) y asistir a una jornada cierra **UNA** |
| Las **facetas** del alcance | se **cruzan**: cargo 100 · area 240 · las dos, **9** |
| Lista con la inscripcion de **otra** jornada | se **ignora**: una lista no cierra la formacion de quien no estuvo en esa sala |

Lo primero **no se cambio**, y merece decirse por que: cerrar las dos haria que una sola sesion
cubriera dos requisitos distintos, y no cerrar ninguna dejaria en rojo a quien si fue. Cerrar una es
lo correcto. Que existan dos es una decision anterior, y sigue anotada en `00-el-motor.md` §9.

### 2026-09-05 (tarde) — Y sobre hacer un recorrido por tipo

El cliente pregunto si convenia uno por tipo. **No**, y por lo mismo que ya decidio `tajadas.mjs`
—que recorre los siete tipos dentro de un solo archivo—: cerrar por asistencia **no depende del
tipo**. Depende del `kind` de la jornada. Siete archivos serian siete copias del mismo camino que
se desincronizan una a una, y lo especifico de cada tipo (que emita constancia, que exija examen,
que entre al plan) ya lo deriva `estandar.mjs` de su propia configuracion.

Lo que si hacia falta era cubrir las combinaciones dentro de UN recorrido, y es lo que hace ahora
`asistencia.mjs` con 15 pasos: dos tipos distintos —uno que lleva papel de tercero y otro que no—,
dos reglas sobre la misma persona, dos jornadas, las tres formas de marcar, el acotamiento y el
Seguimiento cruzado al final.
