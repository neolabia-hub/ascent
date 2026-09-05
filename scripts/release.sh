#!/bin/sh
# NEO PULSE — fase de RELEASE: rol de aplicacion, esquema y politicas RLS. Una sola vez por
# despliegue y ANTES de que arranque la API.
#
# Por que no va en el arranque de la aplicacion: el dia que haya dos replicas, las dos migrarian a
# la vez sobre la misma base. Y una migracion a medias durante el arranque deja el servidor
# levantado sirviendo contra un esquema que no es el que espera el codigo, que es peor que no
# arrancar.
#
# Idempotente: volver a ejecutarlo no rompe nada.
#
# Espera en el entorno:
#   DIRECT_DATABASE_URL  -> rol DUENO (neopulse): migra y aplica RLS; no esta sujeto a las policies.
#   DATABASE_URL         -> rol de la APLICACION (neopulse_app): el que usa la API, con RLS encima.
#   APP_DB_PASSWORD      -> la contrasena de ese rol. Tiene que ser la MISMA que va en DATABASE_URL.
#   RUN_SEED=true        -> (opcional) siembra los datos base. Solo la PRIMERA vez.
set -e

cd /app/apps/api

# El `?schema=` de la cadena es sintaxis de Prisma: psql no la entiende y se planta. Se retira.
PSQL_URL="$(echo "$DIRECT_DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//')"

: "${APP_DB_PASSWORD:?Falta APP_DB_PASSWORD (la contrasena del rol de la aplicacion)}"

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 1) EL ROL DE LA APLICACION, ANTES DE MIGRAR.
#
# Dos migraciones (`user_sessions`, `platform_layer`) hacen GRANT sobre neopulse_app, y el rol lo
# creaba rls.sql, que corre DESPUES. En desarrollo nunca se noto —el rol ya existia de la primera
# vez— pero contra una base VACIA, que es exactamente lo que hay el dia del despliegue, la
# migracion muere con: role "neopulse_app" does not exist.
#
# Se crea aqui, sin contrasena en el SQL: la contrasena se fija justo despues con la del entorno,
# porque la de rls.sql es la de desarrollo y con ella la API no podria conectarse en produccion.
# `\gexec` ejecuta el CREATE solo si el rol falta; el ALTER corre siempre y deja la contrasena
# alineada con DATABASE_URL, tambien si alguien la rota.
echo "[release] rol de aplicacion (neopulse_app)..."
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -v pass="$APP_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE neopulse_app LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neopulse_app')
\gexec
ALTER ROLE neopulse_app WITH LOGIN PASSWORD :'pass';
SQL

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 2) El esquema.
echo "[release] prisma migrate deploy..."
pnpm exec prisma migrate deploy

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 3) Las policies. rls.sql da permisos y activa RLS en toda tabla con tenant_id. Su CREATE ROLE es
#    idempotente, asi que al existir ya el rol no toca la contrasena que se acaba de fijar.
echo "[release] aplicando RLS (prisma/sql/rls.sql)..."
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f prisma/sql/rls.sql

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[release] semilla inicial..."
  pnpm exec tsx prisma/seed.ts
fi

echo "[release] completado."
