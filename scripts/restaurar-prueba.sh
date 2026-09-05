#!/usr/bin/env bash
# NEO PULSE — RESTAURA una copia en una base de USAR Y TIRAR, y cuenta lo que hay dentro.
#
#   ./scripts/restaurar-prueba.sh /opt/neo-pulse/backups/neopulse-20260901-030000.dump
#
# ─── POR QUE EXISTE ───
#
# Porque "tenemos backups" y "podemos volver" no son la misma frase, y la diferencia solo se
# descubre el peor dia. Esto restaura de verdad, en una base aparte llamada `neopulse_restore_test`
# —la de produccion no se toca en ningun momento— y despues cuenta filas de las tablas que
# importan: si el volcado estaba vacio o a medias, se ve aqui y no en la emergencia.
#
# Se ejecuta antes de dar la salida a produccion por buena, y de vez en cuando despues. Al terminar
# borra la base de prueba, salvo que se pida conservarla con CONSERVAR=1.
set -euo pipefail

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -s "$DUMP" ]; then
  echo "Uso: $0 <archivo.dump>   (y que no este vacio)" >&2
  exit 1
fi

CONTAINER="${PG_CONTAINER:-neo-pulse-postgres-1}"
DB_USER="${PG_USER:-neopulse}"
TEST_DB="${TEST_DB:-neopulse_restore_test}"

echo "[restaurar] base de prueba: ${TEST_DB} (la de produccion no se toca)"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE ${TEST_DB};"

echo "[restaurar] pg_restore..."
# --no-owner: la copia puede venir de otra maquina con otros roles; aqui solo interesa el contenido.
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$TEST_DB" --no-owner < "$DUMP"

echo "[restaurar] que hay dentro:"
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c "
  select 'personas' as tabla, count(*) from users
  union all select 'formaciones', count(*) from activities
  union all select 'obligaciones', count(*) from assignments
  union all select 'inscripciones', count(*) from enrollments
  union all select 'constancias', count(*) from certificates
  order by 1;"

if [ "${CONSERVAR:-0}" = "1" ]; then
  echo "[restaurar] se conserva ${TEST_DB} (CONSERVAR=1)."
else
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE ${TEST_DB};"
  echo "[restaurar] base de prueba eliminada."
fi

echo "[restaurar] OK. Si los conteos cuadran con produccion, la copia sirve."
