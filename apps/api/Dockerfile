# NEO PULSE API — imagen multi-stage. El contexto de build es la RAIZ del monorepo.
#
#   docker build -f apps/api/Dockerfile -t neo-pulse-api:local .
#
# Debian slim (glibc) y no Alpine (musl): los motores de Prisma, argon2 y @napi-rs/canvas traen
# binarios precompilados para glibc. En Alpine cada uno hay que compilarlo, y el que falla lo hace
# al arrancar, no al construir.
#
# La MISMA imagen sirve para dos cosas, cambiando el `command`:
#   - API HTTP (por defecto):  node dist/main.js
#   - Release (migraciones):   sh /app/scripts/release.sh

# ---------- Etapa 1: construccion ----------
FROM node:20-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Los manifiestos primero: asi la capa de `pnpm install` se reaprovecha mientras no cambien las
# dependencias, que es la parte lenta.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Solo la API y lo que necesita del workspace. El web no entra aqui.
RUN pnpm install --frozen-lockfile --filter "@neo-pulse/api..."

COPY packages/shared packages/shared
COPY apps/api apps/api
# El script de release viaja DENTRO de la imagen: el contenedor que migra es el mismo artefacto que
# despues sirve, asi que migra exactamente el codigo que se va a ejecutar.
COPY scripts scripts

# `prisma generate` exige que las variables existan, aunque no conecta con nada. Valores de
# mentira, solo para que el generador no se queje durante la construccion.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    DIRECT_DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN pnpm --filter @neo-pulse/shared build \
 && pnpm --filter @neo-pulse/api exec prisma generate \
 && pnpm --filter @neo-pulse/api build

# ---------- Etapa 2: ejecucion ----------
FROM node:20-slim AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production

# openssl + ca-certificates: Prisma, argon2 y TLS. postgresql-client: aplicar rls.sql en el
# release. curl: el healthcheck.
#
# LibreOffice NO va en esta imagen. Son ~500 MB y otro tanto de RAM al convertir, y la maquina del
# piloto es una VM gratuita de 1 GB. Sin el, subir un PPTX se rechaza con un mensaje que pide el
# PDF —comportamiento ya existente y explicado en pantalla—, en vez de tumbar el servidor entero
# la primera vez que alguien convierta una presentacion. Se anade el dia que haya maquina para el.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client curl \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@9.12.0 --activate

# Se copia /app entero para preservar los enlaces del store virtual de pnpm: copiar solo dist/
# dejaria node_modules apuntando a la nada.
COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-3002}/v1/health" || exit 1

CMD ["node", "dist/main.js"]
