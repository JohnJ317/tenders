# syntax=docker/dockerfile:1.7

# ---------- Base commune ----------
FROM node:20-slim AS base
# openssl requis par Prisma ; dumb-init pour PID 1 propre
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- Dépendances (avec dev, on a besoin du CLI Prisma) ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------- Build ----------
FROM deps AS builder
COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts
RUN npx prisma generate && npm run build

# ---------- Runtime ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# On copie les deps (avec Prisma CLI pour `migrate deploy` au démarrage),
# le build compilé, et le dossier prisma (migrations + schema).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# `migrate deploy` est idempotent : applique uniquement les migrations manquantes.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
