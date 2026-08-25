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

### Decisiones de auth que no hay que rediscutir
- El tenant se resuelve ANTES del login (slug por subdominio; en dev `?tenant=` o
  NEXT_PUBLIC_DEV_TENANT). Por eso NO existe cliente Prisma "owner" en runtime: login corre
  bajo RLS con `forTenant()`. (Mejora sobre SAC-NEO, que arrastra un findFirst pre-tenant.)
- Cookie de refresh: `np_refresh` = `userId.tenantId.token`, httpOnly, path /v1/auth, rotacion
  en cada uso, hash SHA-256+pepper (no argon2: el token ya es aleatorio de 384 bits).
- Bloqueo por cuenta: 5 intentos -> 15 min (env AUTH_*). Auditado en audit_logs.
