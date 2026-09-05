#!/usr/bin/env bash
# NEO PULSE — copia de seguridad de Postgres, para cron en la maquina de produccion.
#
#   0 3 * * * /opt/neo-pulse/scripts/backup.sh >> /var/log/neo-pulse-backup.log 2>&1
#
# ─── LO QUE NO HACE ───
#
# No prueba la restauracion. Eso se hace a mano, con `scripts/restaurar-prueba.sh`, ANTES de decir
# que hay copias: un archivo que nunca se restauro no es una copia de seguridad, es un archivo.
#
# ─── LOS ARCHIVOS ───
#
# Si hay R2, los medios ya viven fuera de la maquina y esto solo tiene que cubrir la base. Si no lo
# hay, el volumen `storage` tambien es evidencia y hay que copiarlo aparte (ver el runbook).
set -euo pipefail

CONTAINER="${PG_CONTAINER:-neo-pulse-postgres-1}"   # nombre real: docker ps (proyecto 'neo-pulse')
DB_USER="${PG_USER:-neopulse}"
DB_NAME="${PG_DB:-neopulse}"
BACKUP_DIR="${BACKUP_DIR:-/opt/neo-pulse/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/neopulse-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "[backup] pg_dump -> ${FILE}"
# Formato custom (-Fc): comprimido y restaurable por partes con pg_restore.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE"

# Un dump de 0 bytes es lo que pasa cuando el contenedor no existe o cambio de nombre, y se
# descubre el dia que hace falta restaurar. Se descubre HOY.
if [ ! -s "$FILE" ]; then
  echo "[backup] ERROR: el volcado salio vacio. Revisa PG_CONTAINER (docker ps)." >&2
  rm -f "$FILE"
  exit 1
fi

find "$BACKUP_DIR" -name 'neopulse-*.dump' -mtime "+${RETENTION_DAYS}" -delete

# FUERA DE LA MAQUINA. Una copia que vive en el mismo disco que la base no protege del unico
# escenario que de verdad importa: perder la maquina.
if [[ -n "${R2_BUCKET_NAME:-}" && -n "${R2_ACCOUNT_ID:-}" ]] && command -v aws >/dev/null 2>&1; then
  echo "[backup] subiendo a R2: s3://${R2_BUCKET_NAME}/backups/"
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
    aws s3 cp "$FILE" "s3://${R2_BUCKET_NAME}/backups/" \
      --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
else
  echo "[backup] AVISO: sin copia fuera de la maquina (faltan R2_* o el cliente aws)."
fi

echo "[backup] OK (${FILE})"
