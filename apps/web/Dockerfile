# NEO PULSE WEB (Next.js 14) — imagen multi-stage. Contexto de build: RAIZ del monorepo.
#
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://... -t neo-pulse-web:local .
#
# LAS VARIABLES `NEXT_PUBLIC_*` SE HORNEAN AL CONSTRUIR, no se leen al arrancar: viajan dentro del
# JavaScript que descarga el navegador. Por eso llegan como build-arg y no por `environment` del
# compose — ponerlas ahi no falla, simplemente no hace nada, que es la peor forma de fallar.
#
# ─── NEXT_PUBLIC_API_URL VACIO = MISMO ORIGEN, y es lo que conviene aqui ───
#
# Si no se pasa, el cliente pide `/v1/...` RELATIVO al dominio desde el que se sirvio la pagina. Y
# como Caddy publica el web y la API bajo el mismo dominio, eso siempre acierta: la misma imagen
# vale para un tunel con URL aleatoria, para el DuckDNS de hoy y para el dominio propio de manana,
# sin reconstruir nada. Solo hay que pasarla cuando la API viva en OTRO dominio.
#
# `NEXT_PUBLIC_ROOT_HOST` si obliga a reconstruir al cambiar de dominio: no hay forma de deducirlo
# en caliente, y adivinarlo es lo que rompia el ingreso en hosts de tercer nivel.

# ---------- Etapa 1: construccion ----------
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@neo-pulse/web..."

COPY packages/shared packages/shared
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_HOST
ARG NEXT_PUBLIC_DEV_TENANT
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_ROOT_HOST=${NEXT_PUBLIC_ROOT_HOST} \
    NEXT_PUBLIC_DEV_TENANT=${NEXT_PUBLIC_DEV_TENANT}

# Sin NEXT_DIST_DIR: dentro de la imagen no hay dos instancias que convivan, asi que la salida va
# a `.next` (lo que espera la etapa siguiente).
# NEXT_OUTPUT enciende la salida autocontenida. Solo aqui: en Windows, construirla en local falla
# por los enlaces simbolicos hacia el store de pnpm (ver next.config.mjs).
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter @neo-pulse/shared build \
 && pnpm --filter @neo-pulse/web build

# ---------- Etapa 2: ejecucion ----------
FROM node:20-slim AS runtime
WORKDIR /app
# HOSTNAME explicito: el servidor autocontenido escucha en la interfaz que le digan, y si se queda
# en localhost solo se puede llegar desde DENTRO del contenedor. El sintoma es un healthcheck que
# pasa y un proxy que no conecta, que no se parece a la causa.
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Salida autocontenida (`output: 'standalone'` en next.config.mjs). Los estaticos y `public` van
# aparte a proposito: Next los deja fuera del paquete autocontenido.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT:-3100}/login" || exit 1

CMD ["node", "apps/web/server.js"]
