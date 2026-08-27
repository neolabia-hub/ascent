# NEO PULSE — RUNBOOK (memoria operativa)

Solo se ANEXA o se corrige; no se reescribe entre sesiones. Lo aprendido rompiendo algo va aqui.
El diario de sesiones (que se hizo cada dia) ira en HANDOFF.md cuando exista.

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
