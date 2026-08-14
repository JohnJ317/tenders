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
COPY tsconfig.json nest-cli.json prisma.config.ts ./
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
COPY --from=builder /app/scripts ./scripts
# Prisma 7 : `migrate deploy` lit sa connexion depuis prisma.config.ts
# (le datasource du schéma ne porte plus d'url). tsconfig.json est requis
# pour que la CLI puisse charger ce fichier TypeScript.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
RUN chmod +x ./scripts/entrypoint.sh

EXPOSE 3000

# Entrypoint : `migrate deploy` par défaut. Pour débloquer une DB en P3009
# (init migration failed), déployer une fois avec PRISMA_RESET_ON_START=true,
# puis retirer la variable.
ENTRYPOINT ["dumb-init", "--"]
CMD ["./scripts/entrypoint.sh"]
