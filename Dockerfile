# Open Pantry — self-hostable home grocery inventory.
# Multi-stage build producing a small Next.js standalone server image.

FROM node:22-bookworm-slim AS base
# better-sqlite3 compiles a native addon on install, so the build stage needs
# python3 + a C/C++ toolchain. The runtime image does not.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The DB file lives under /app/data — mount a volume here to persist it.
ENV OPEN_PANTRY_DB_PATH=/app/data/open-pantry.db
RUN mkdir -p /app/data

# Next.js "standalone" output bundles only what the server needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
