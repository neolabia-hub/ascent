# Aislamiento entre proyectos NEO IO (SAC-NEO y NEO PULSE)

Norma operativa para que los proyectos de este equipo NUNCA se pisen entre si en la maquina de
desarrollo ni en despliegue. Nace del incidente del 2026-08-25 (colision de nombre de proyecto de
Docker Compose, recuperado sin perdida de datos; detalle en el RUNBOOK de SAC-NEO).

## Regla 1 — Docker Compose SIEMPRE con `name:` explicito

Compose usa el nombre de la CARPETA del archivo como nombre de proyecto si no se declara. Ambos
proyectos guardan su compose en `docker/`, asi que sin `name:` Compose los trata como EL MISMO
proyecto y recrea los contenedores del otro.

- SAC-NEO: agregar `name: docker` (su nombre HISTORICO implicito) para congelarlo explicitamente.
  OJO: NO renombrarlo a `sac-neo`: sus volumenes ya se llaman `docker_pgdata`/`docker_redisdata` y
  cambiar el nombre de proyecto los dejaria huerfanos (la base apareceria vacia).
- NEO PULSE: `name: neo-pulse` (ya aplicado en `docker/docker-compose.yml`).
- TODO proyecto futuro: `name: <slug-del-proyecto>` en la PRIMERA linea de servicios.

## Regla 2 — Tabla de recursos reservados por proyecto

Ningun proyecto usa un recurso de la columna del otro. Al crear un proyecto nuevo, se agrega su
fila AQUI (y en el runbook del proyecto nuevo) ANTES de levantar nada.

| Recurso | SAC-NEO | NEO PULSE |
|---|---|---|
| Compose project | `docker` (historico; migrar a `sac-neo`) | `neo-pulse` |
| Contenedores | `sac-neo-postgres`, `sac-neo-redis` | `neo-pulse-postgres`, `neo-pulse-redis` |
| Volumenes | `docker_pgdata`, `docker_redisdata` | `neo-pulse_pgdata`, `neo-pulse_redisdata` |
| Puerto Postgres (host) | 5432 | 5433 |
| Puerto Redis (host) | 6379 | 6380 |
| Puerto API | 3001 | 3002 |
| Puerto Web | 3000 | 3100 |
| Rol Postgres owner | `sacneo` | `neopulse` |
| Rol Postgres app (RLS) | `sacneo_app` | `neopulse_app` |
| Base de datos | `sacneo` | `neopulse` |
| Prefijo de paquetes npm | `@sac-neo/*` | `@neo-pulse/*` |

## Regla 3 — Independencia total de codigo y datos

- Repos git SEPARADOS, sin submodulos ni paquetes compartidos entre proyectos: si un patron sirve
  en ambos, se COPIA y evoluciona por separado (los productos tienen ciclos de vida distintos).
- `.env` NUNCA compartidos ni commiteados; cada proyecto tiene su `.env.example` propio.
- Llaves JWT propias por proyecto (`apps/api/keys/`, gitignored). Jamas reutilizar el par RS256
  de un proyecto en otro.
- Despliegue: hosts/DNS/almacenamiento (buckets R2) independientes por proyecto.

## Regla 4 — Verificacion antes de levantar entorno

Antes del primer `docker compose up` de una sesion de trabajo en cualquiera de los dos proyectos:

```
docker ps --format "{{.Names}} | {{.Status}}"
```

Deben verse (si estan encendidos) los contenedores con el PREFIJO CORRECTO de cada proyecto. Si un
`up` muestra "Recreate" sobre contenedores del OTRO proyecto: detener con Ctrl+C / `down` SIN `-v`
(el `-v` borra volumenes; nunca usarlo en recuperacion), y revisar el `name:` del compose.

## Que paso el 2026-08-25 (resumen del incidente)

El primer `up` del compose de NEO PULSE (aun sin `name:`) recreo los contenedores de SAC-NEO y
monto su volumen `docker_pgdata` en la imagen nueva. Se detecto de inmediato; `down` sin `-v`
preservo los volumenes; se re-levanto SAC-NEO con su compose (datos verificados intactos: tenants,
usuarios, casos, auditoria) y NEO PULSE quedo con proyecto, volumenes y puertos propios. La
produccion de SAC-NEO (VM Oracle) nunca estuvo involucrada.
