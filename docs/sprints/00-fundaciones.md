# Sprint 0 — Fundaciones

**Fecha:** 2026-08-25 · **Commit:** `0622c7a` · **Estado:** terminado y verificado

## 1. Objetivo

Dejar el esqueleto sobre el que se construye todo lo demas: el modelo de datos completo, el
aislamiento entre empresas (multi-tenant) probado, y la autenticacion funcionando de verdad.

**Criterio de aceptacion:** un administrador de Transprensa inicia sesion contra la base real y
la plataforma le aplica su marca.

**Fuera de alcance a proposito:** cualquier pantalla de negocio. Este sprint no entrega valor
visible al usuario final; entrega la base sin la cual lo demas no se puede construir bien.

## 2. Que se construyo

### Monorepo
`apps/api` (NestJS), `apps/web` (Next.js 14), `packages/shared` (contratos Zod), orquestado con
Turborepo y pnpm. Postgres y Redis en Docker Compose con puertos propios.

### Modelo de datos — 58 modelos
Traduccion completa de la seccion 6 del CLAUDE.md a Prisma. Los grupos:
personas y organizacion, catalogo formativo con versiones, convocatorias y ejecucion, asignacion
por regla, plan anual, rutas, evaluaciones, certificacion, engagement (repaso y racha),
aprobaciones e IA, y transversales (documentos, notificaciones, auditoria, retencion).

La migracion inicial aplico a la primera, sin correcciones.

### Aislamiento multi-tenant en dos capas
- **Capa ORM:** `PrismaService.scoped` devuelve un cliente atado al tenant de la sesion. Un
  desarrollador no puede "olvidar" filtrar: no existe forma de consultar sin tenant.
- **Capa base de datos (RLS):** politicas de PostgreSQL en toda tabla con `tenant_id`. Aunque
  falle la capa de arriba, la base rechaza el cruce.

### Autenticacion
Login por **cedula o correo** con el tenant resuelto por subdominio, tokens JWT RS256 (acceso de
15 minutos), refresh rotativo en cookie httpOnly, bloqueo de cuenta por intentos fallidos, cambio
de contrasena forzado en el primer ingreso, y activacion con aceptacion de Habeas Data y del
acuerdo de firma electronica.

### Datos semilla
Tenant Transprensa con sus catalogos, 34 permisos, 3 roles, 6 tipos de actividad formativa,
4 politicas de retencion (incluida la de 20 anos para SST) y el usuario administrador.

## 3. Decisiones tomadas

| Decision | Por que |
|---|---|
| **El tenant se resuelve ANTES del login** (subdominio) | Con login por cedula, dos empresas pueden tener la misma cedula. Sin contexto de tenant el login es ambiguo. Ademas permite mostrar la marca del cliente en la pantalla de entrada |
| **Sin cliente "owner" de base de datos en tiempo de ejecucion** | Como el tenant se conoce antes, hasta el login corre con RLS activo. Es mas estricto que la solucion equivalente en SAC-NEO, que arrastra una consulta previa sin filtro |
| **Refresh token con SHA-256, no argon2** | El token ya es un secreto aleatorio de 384 bits; argon2 solo aporta contra contrasenas debiles. Cada renovacion pasa de cientos de milisegundos a microsegundos, algo que importa en un servidor modesto |
| **RLS desde el primer dia** | La red de seguridad va antes del riesgo. Una fuga entre empresas en una plataforma con historiales laborales es irreparable |

## 4. Como se verifico

Todo ejecutado, no asumido:

- **Aislamiento (`pnpm db:verify-rls`)** — tres comprobaciones, las tres en verde: con contexto
  de la empresa A no se ven filas de la B; sin contexto no se ve ninguna fila; e intentar
  escribir una fila de la empresa B desde la A es rechazado por la base.
- **Autenticacion por HTTP real** — login con cedula, consulta de sesion con 34 permisos
  efectivos, datos publicos de marca, y credenciales invalidas devolviendo 401.
- **Calidad** — lint, typecheck, build y pruebas unitarias, todo en verde.

## 5. Incidentes y lecciones

**Colision de Docker Compose con SAC-NEO.** El primer arranque recreo los contenedores del otro
proyecto, porque Compose usa el nombre de la carpeta (`docker/` en ambos) como identidad. Se
detecto de inmediato y se recupero **sin perdida de datos** (los volumenes no se tocan con
`up`/`down`). Blindaje: `name:` explicito en ambos compose y `docs/02-aislamiento-proyectos.md`
con la tabla de recursos reservados por proyecto.

**Politicas RLS y la cadena vacia.** Tras revertir un `SET LOCAL`, PostgreSQL deja la variable
como cadena vacia (no nula) y `''::uuid` reventaba la consulta. Se corrigio con `NULLIF`. Lo
encontro el script de verificacion — por eso ese script corre en integracion continua.

**El entorno de desarrollo.** Se midio: los mismos comandos tardan de 10 a 30 veces mas
ejecutados desde WSL sobre `/mnt/c` que con Node nativo de Windows (build de la API: 5+ minutos
contra 22 segundos). Es la causa de la lentitud cronica que sufrio SAC-NEO. Decision: Node nativo.

## 6. Pendiente

Nada bloqueante. Lo diferido a proposito: adaptador de almacenamiento en la nube (sprint de
despliegue) y cache de permisos en Redis (rendimiento, no correccion).
