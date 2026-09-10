#!/usr/bin/env bash
#
# r2-cors.sh — pone (o revisa) la politica CORS del bucket de medios.
#
# ─────────────────────────────────────────────────────────────────────────────
# POR QUE HACE FALTA ESTO
#
# El video de una leccion se pide asi:
#
#   1. El navegador pide  https://<tenant>.ascentio.app/v1/media/file/<clave>?e=..&t=..
#      Mismo origen que la pagina. La API comprueba NUESTRA firma y resuelve el paquete.
#   2. La API responde 302 hacia una URL prefirmada de R2, que es OTRO origen.
#   3. El navegador sigue el redireccion... y ahi se para.
#
# Se para porque el <video> pide el archivo en modo CORS —lleva `crossOrigin="anonymous"`,
# puesto el 2026-08-28 porque sin el Chrome ABANDONA la carga en silencio cuando la web y la
# API estan en origenes distintos, que es el caso en desarrollo— y **el bucket no traia
# ninguna politica CORS**, asi que R2 devolvia los bytes (206) sin cabecera
# `Access-Control-Allow-Origin` y el navegador los tiraba.
#
# El sintoma exacto:
#   net::ERR_FAILED 206 (Partial Content)
#   has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
#
# Es un fallo que SOLO puede aparecer en produccion: en desarrollo el almacenamiento es local
# y no hay redireccion a ningun bucket. Va a la lista de "cosas que solo se ven desplegando".
#
# ─────────────────────────────────────────────────────────────────────────────
# POR QUE EL ORIGEN VA EN "*" Y NO EN UNA LISTA, QUE ES LO QUE UNO ESPERARIA
#
# Dos razones, y las dos importan:
#
# 1. **La lista no serviria.** Cuando una peticion en modo CORS sigue un redireccion hacia
#    otro origen, el navegador puede mandar `Origin: null`. Una lista de origenes concretos
#    no casa con `null`; `*` si.
#
# 2. **Aqui no protege nada.** CORS no da ni quita acceso al archivo: dice que navegador
#    puede LEER la respuesta. Quien da acceso es la firma de la URL, que caduca en una hora
#    y va atada a esa clave concreta. Restringir el origen no impide que nadie descargue un
#    video —con la URL firmada, `curl` lo baja igual—; solo impide que lo lea un navegador.
#    Poner "*" no abre una puerta: la puerta es la firma.
#
# Y hay una tercera, practica: el producto da **un subdominio por empresa**. Con una lista
# habria que acordarse de anadir el subdominio de cada cliente nuevo el dia del alta, y
# nadie se acuerda — se descubre cuando a un cliente no le funciona el video.
#
# ─────────────────────────────────────────────────────────────────────────────
# COMO SE USA (en el servidor)
#
#   ssh -i ~/.ssh/ascent linuxuser@45.63.107.34
#   cd /opt/ascent
#   bash scripts/r2-cors.sh            # la pone
#   bash scripts/r2-cors.sh --ver      # solo la enseña, no toca nada
#
# El cambio es inmediato: no hay que reiniciar nada ni volver a desplegar. Basta con recargar
# la pagina del reproductor. Las URL ya firmadas siguen valiendo.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/ascent/.env.prod}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[r2-cors] ERROR: no encuentro $ENV_FILE" >&2
  exit 1
fi

# Solo las R2_*. No se vuelca el .env.prod entero al entorno: ahi dentro tambien estan la
# contrasena de Postgres y los secretos de firma.
set -a
# shellcheck disable=SC1090
source <(grep -E '^R2_[A-Z_]+=' "$ENV_FILE")
set +a

for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
  if [[ -z "${!v:-}" ]]; then
    echo "[r2-cors] ERROR: falta $v en $ENV_FILE" >&2
    exit 1
  fi
done

if ! command -v aws >/dev/null 2>&1; then
  echo "[r2-cors] ERROR: no esta el cliente aws. Instalalo con:" >&2
  echo "  sudo apt-get install -y awscli" >&2
  exit 1
fi

ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

# ── Solo mirar ───────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--ver" ]]; then
  echo "[r2-cors] politica actual de '${R2_BUCKET_NAME}':"
  aws s3api get-bucket-cors --bucket "$R2_BUCKET_NAME" --endpoint-url "$ENDPOINT" \
    || echo "[r2-cors] (el bucket no tiene ninguna politica CORS puesta)"
  exit 0
fi

# ── Ponerla ──────────────────────────────────────────────────────────────────
POLITICA="$(mktemp)"
trap 'rm -f "$POLITICA"' EXIT

# AllowedHeaders incluye "range" porque es lo que manda el reproductor para saltar en el
# video. ExposeHeaders es la otra mitad y se olvida siempre: sin Content-Range y
# Accept-Ranges el navegador recibe los bytes pero NO puede leer cuanto dura el archivo,
# asi que la barra de progreso no funciona aunque el video se vea.
cat > "$POLITICA" <<'JSON'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["range", "content-type", "if-match", "if-none-match", "if-modified-since"],
      "ExposeHeaders": ["Content-Length", "Content-Range", "Content-Type", "Accept-Ranges", "ETag", "Last-Modified"],
      "MaxAgeSeconds": 3600
    }
  ]
}
JSON

echo "[r2-cors] aplicando politica a '${R2_BUCKET_NAME}'..."
aws s3api put-bucket-cors \
  --bucket "$R2_BUCKET_NAME" \
  --endpoint-url "$ENDPOINT" \
  --cors-configuration "file://$POLITICA"

echo "[r2-cors] hecho. Como queda:"
aws s3api get-bucket-cors --bucket "$R2_BUCKET_NAME" --endpoint-url "$ENDPOINT"

echo
echo "[r2-cors] COMPROBAR: recargar el reproductor de una leccion con video."
echo "[r2-cors] No hace falta reiniciar nada ni volver a desplegar."
