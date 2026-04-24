# CLAUDE.md

Guide pour Claude Code (claude.ai/code) lorsqu'il travaille dans ce repo.

## Projet

**TenderPro API** — backend NestJS multi-tenant (SaaS) pour les cabinets d'audit & d'expertise comptable d'Afrique de l'Ouest/Centrale. Gère les pipelines d'appels d'offres (AO), les manifestations, le pricing cost-plus et les propositions (PDF/DOCX).

**Documentation et commentaires en français.** Garder les nouveaux contenus en français quand on édite des fichiers existants. Les identifiants (variables, fonctions, tables, colonnes) restent en anglais ou franglais technique selon le style du fichier.

## Commandes

```bash
# Dev (watch)
npm run start:dev                 # http://localhost:3000/api

# Build + run prod
npm run build && npm run start:prod

# Lint (auto-fix)
npm run lint

# Prisma
npm run prisma:generate           # après modif schema.prisma
npm run prisma:migrate            # créer + appliquer une migration dev
npm run prisma:deploy             # appliquer sans prompt (CI/prod)
npm run prisma:studio             # GUI

# Seed
npm run db:seed                   # idempotent : drop + recrée le cabinet démo
npm run db:reset                  # reset complet + remigrer + reseeder

# Infra locale (Postgres 16 + MinIO + Redis)
docker compose up -d
```

**Aucun runner de tests configuré** — `npm test` n'existe pas. Si on demande de « lancer les tests », le dire explicitement plutôt qu'inventer une commande.

L'API écoute sur `http://localhost:3000/api` (préfixe global `api` défini dans `src/main.ts`).

## Architecture multi-tenant RLS

C'est la pièce centrale — la comprendre avant de toucher à `src/common/prisma`, `src/common/tenant`, ou à n'importe quelle migration.

### Flux d'une requête

1. **`TenantMiddleware`** (`src/common/tenant/tenant.middleware.ts`) s'exécute sur toutes les routes. Il ignore une liste publique :
   - `/api/auth/login`, `/api/auth/register`
   - `/api/health`
   - `/api/webhooks/wave` (signé HMAC, voir `WaveSignatureGuard`)
   - `/api/invitations/accept`, `/api/invitations/validate`
   - `/api/cron` (auth via `CRON_SECRET`, voir section Cron)

   Sinon il vérifie le JWT Bearer, extrait `{ sub, cabinetId, role, grade }` (`JwtPayload`), attache le payload à `req.user`, puis appelle `TenantContext.run(ctx, () => next())`.

2. **`TenantContext`** (`src/common/tenant/tenant-context.ts`) est un wrapper léger autour de l'`AsyncLocalStorage` de Node. Le store transporte `{ tenantId, userId, role, grade, bypassRls? }` à travers la chaîne async.

3. **`PrismaService`** est un `PrismaClient` simple — l'enforcement RLS se fait côté Postgres, pas dans un middleware Prisma. Le commentaire du fichier qui mentionne `$use` / `$extends` est obsolète ; le service actuel n'installe aucun intercepteur.

4. **Deux rôles Postgres :**
   - `tenderpro_admin` — owner du schéma, utilisé par Prisma pour les migrations. `DATABASE_URL_ADMIN` dans `.env`. Bypass RLS implicitement (owner). **C'est aussi l'URL utilisée par le Prisma Client à l'exécution** (cf. `datasource db { url = env("DATABASE_URL_ADMIN") }` dans `prisma/schema.prisma`). À traiter comme un écart connu : les tables RLS existent et sont en `FORCE`, mais les queries applicatives tournent sous l'owner qui peut bypass. Ne pas supprimer le RLS en pensant qu'il est inutile — la direction visée est de basculer l'URL runtime vers `DATABASE_URL` (rôle `tenderpro`).
   - `tenderpro` — rôle app non-owner, soumis à `FORCE ROW LEVEL SECURITY`. `DATABASE_URL` dans `.env`.

5. **Opérations cross-tenant** (login, signup, jobs cron, scrapers) doivent encapsuler les appels Prisma dans `prismaService.withPlatformContext(fn)` qui positionne `bypassRls: true` dans le store ALS. Toujours passer par ce helper plutôt qu'instancier un `PrismaClient` frais.

### Ajouter une nouvelle table tenant-scoped

- Ajouter `cabinet_id UUID` + FK vers `cabinets(id) ON DELETE CASCADE`.
- Index sur `cabinet_id` (ou composite commençant par lui).
- Dans le SQL de migration, après le `CREATE TABLE`, **activer RLS et ajouter la policy par tenant** — suivre le pattern de `prisma/migrations/20260421000000_init/migration.sql`. Accorder les DML pertinents au rôle `tenderpro` dans la même migration.
- Ne jamais se reposer sur un `WHERE cabinet_id = ...` seul ; traiter le RLS comme la source de vérité et les filtres applicatifs comme une défense redondante.

### Tables platform (cross-tenant)

Quelques tables n'ont **pas** de `cabinet_id` car elles sont partagées :
- `ScrapedTender` — items bruts scrapés, matchés ensuite vers les cabinets via `matched_cabinet_ids` (UUID[])
- `Cabinet`, `User` (avec `cabinet_id` mais accessibles cross-tenant par les SUPER_ADMIN)
- Tables platform : `WaveWebhookEvent`, `Subscription`, `Commission`, `PlatformConfig`

Ces tables doivent être manipulées via `withPlatformContext()`.

## RBAC : rôles & permissions

Enum `Role` (`prisma/schema.prisma`) :
- `ADMIN_CABINET` — admin du cabinet client
- `ASSOCIE` — associé senior
- `MANAGER` — manager d'engagement
- `CONSULTANT` — consultant
- `SUPER_ADMIN` — admin plateforme TenderPro (cross-tenant)

Enum `Grade` (`ASSOCIE | MANAGER | SENIOR | JUNIOR | ASSISTANT`) pilote les tarifs de `grille_horaire`, **pas** l'autorisation.

Trois guards à connaître :

| Guard | Rôle |
|-------|------|
| `RolesGuard` (`src/common/auth/roles.guard.ts`) + `@Roles(...)` | Restreint un endpoint à certains rôles. Lit `req.user` posé par `TenantMiddleware` — ne re-vérifie pas le JWT. |
| `SuperAdminGuard` (`src/common/platform/platform-core.module.ts`) | Réserve aux `SUPER_ADMIN`. À utiliser sur tous les `@Controller('platform/...')`. |
| `WaveSignatureGuard` (`src/common/platform/wave-signature.guard.ts`) | Vérifie la signature HMAC du webhook Wave. À utiliser sur `/webhooks/wave`. |
| `CronSecretGuard` (`src/common/auth/cron-secret.guard.ts`) | Vérifie `Authorization: Bearer ${CRON_SECRET}`. À utiliser sur les endpoints `/cron/*`. Refuse si `CRON_SECRET` non défini. |

`@CurrentUser()` (decorator) extrait `req.user` (`JwtPayload`) dans une méthode de contrôleur.

## Validation & DTOs

`main.ts` installe un `ValidationPipe` global avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `transformOptions: { enableImplicitConversion: true }`.

- **Tout champ inconnu dans un body produit un 400** — toujours déclarer chaque champ attendu sur le DTO.
- Utiliser `class-validator` pour les contraintes ; `enableImplicitConversion` gère la coercion des query strings (`?limit=10` → `number`).

## Modules métier

Tout module nouveau doit être enregistré dans les `imports` de `src/app.module.ts`.

### Pipelines AO & manifestations

- **`tenders/`** — pipeline AO. State machine in `state-machine/tender-transitions.ts` :
  - États : `WATCHING → QUALIFICATION → (EOI → SHORTLISTED →)? PREPARING → SUBMITTED → (NEGOTIATION →)? WON | LOST`
  - États finaux : `WON`, `LOST`, `CANCELLED` (pas de retour arrière, `TENDER_CLOSED_STAGES` bascule `isOpen=false`)
  - Toujours passer par `canTransition(from, to)` pour un changement d'étape.
  - Simple map de transitions, **pas XState** malgré la roadmap.
- **`events/`** — miroir de `tenders` pour conférences/salons (`state-machine/event-transitions.ts`).
- **`tender-documents/`, `event-documents/`** — uploads DCE/cahier des charges via Multer + S3.
- **`tender-analysis/`** — analyse Claude des DCE (table dédiée, voir migration `20260422144252_add_tender_analysis`).

### Veille & scraping (Sprint 5a)

- **`watch-domains/`** — domaines de veille configurés par cabinet (mots-clés, secteurs, pays).
- **`scrapers/`** — orchestre les sources externes. Chaque source étend `AbstractScraper` (`abstract-scraper.ts`) :
  - Champs obligatoires : `sourceCode`, `sourceLabel`, `countries`, `baseUrl`, `enabled`, `scrape()`.
  - Sources implémentées : `world-bank`, `sigmap`, `afd`, `afdb`, `ungm`, `educarriere`, `bceao`, `j360`. Stubs : ARMP Sénégal/Bénin/Niger/Togo, ARCOP Burkina, DGMP Mali, EU TED, USAID.
  - Après run, déclenche `matching.processNew()` (best-effort, non attendu) qui matche les items aux `Activity` configurées et les promeut en `Tender`.
  - Pour ajouter une source : créer `sources/<nom>.scraper.ts`, l'ajouter à `SCRAPER_CLASSES` dans `scrapers.module.ts`.
- **`scraped-tenders/`** — table `ScrapedTender` (cross-tenant), endpoints pour promouvoir/dismiss un item.
- **`matching/`** — appariement scraped → activités cabinet.
- **`alerts/`** — notifications utilisateur (nouveau match, deadline, etc.).
- **`j360/`** — scraper spécifique J360 + `J360AuthService` qui cache les cookies de login en Redis (TTL 7j). Voir section Redis.

### Pricing & propositions

- **`pricing-coefficients/`** — coefficients cost-plus par grade et par activité (configurables par cabinet).
- **`pricing/`** — moteur de calcul des devis (jours × taux × coefficients).
- **`competitive-intel/`** — veille concurrentielle (qui a soumis quoi à quel prix).
- **`consultants/`, `references/`** — équipe et références projets pour bourrer les propositions. CV uploadés via S3.
- **`proposals/`** — génération PDF (`pdfkit`) et DOCX (`docx`) des offres techniques + financières. Sections team/methodology/planning générées par Claude (voir `claude/`).
- **`proposal-templates/`** — templates de propositions personnalisables par cabinet.

### Plateforme (cross-tenant, SUPER_ADMIN)

`platform/` regroupe tout ce qui est admin TenderPro :
- `platform/cabinets` — gestion des cabinets clients
- `platform/subscriptions` — abonnements
- `platform/commissions` — commissions
- `platform/finance` — vues financières globales
- `platform/config` — config plateforme (grace days, etc.)
- `webhooks/wave` — webhook paiement Wave (HMAC SHA-256 via `WAVE_WEBHOOK_SECRET`)
- `billing` — endpoints billing côté cabinet client

`PlatformService` expose deux jobs cross-tenant :
- `runReminderCheck()` — emails J-1 aux cabinets dont l'échéance arrive demain
- `runSuspensionCheck()` — suspend les cabinets en retard de paiement (selon `suspensionGraceDays`)

Ces deux jobs sont déclenchés via les endpoints cron HTTP (voir section Cron).

### Autres

- **`auth/`** (`common/auth/`) — login, JWT, `@Roles`, `@CurrentUser`, `RolesGuard`, `CronSecretGuard`.
- **`storage/`** (`common/storage/`) — wrapper S3/MinIO (`StorageService`). Bucket auto-créé au boot. Multer en mémoire pour les uploads, push direct vers S3.
- **`claude/`** — `@anthropic-ai/sdk` + `pdf-parse` pour analyser les DCE. Modèle par défaut `claude-haiku-4-5`, surchargeable via `ANTHROPIC_MODEL`. **Nécessite `ANTHROPIC_API_KEY` ; se désactive proprement si absente.**
- **`analytics/`** — KPIs cabinet (pipeline funnel, segments, time series).
- **`grille-horaire/`** — taux horaires par grade.
- **`activities/`** — types d'activités du cabinet (CAC, audit contractuel, EC tenue, EC états financiers, etc.).
- **`invitations/`** — invitations utilisateur par email (token signé, accept/validate publics).
- **`health/`** — `/api/health` (public, pour les liveness probes Railway).

## Cron : déclenchement HTTP externe

**Pas de `@Cron` in-process.** Les jobs récurrents sont exposés en HTTP et déclenchés par un ordonnanceur externe (Railway Cron Jobs, cron-job.org, etc.).

Module : `src/modules/cron/`. Tous les endpoints sont protégés par `CronSecretGuard` qui vérifie `Authorization: Bearer ${CRON_SECRET}`. Si `CRON_SECRET` n'est pas défini, tous les appels sont refusés (fail-closed).

| Endpoint | Fréquence recommandée | Action |
|----------|------------------------|--------|
| `POST /api/cron/scrapers/run-all` | toutes les 30 min | Lance tous les scrapers actifs (équivalent `runAll()`). |
| `POST /api/cron/platform/daily-tasks` | 1×/j à 9h00 Africa/Abidjan (UTC) | Rappels J-1 + suspensions impayés. |

Pour ajouter un nouveau job cron :
1. Ajouter une méthode dans `CronController` (toujours wrapper avec `prisma.withPlatformContext()` si l'opération est cross-tenant).
2. Configurer le ping HTTP côté ordonnanceur externe.

Le path `/api/cron` est dans `publicPaths` du `TenantMiddleware` — **ne pas le retirer** sinon le middleware rejettera le header (qui n'est pas un JWT) avant que le guard ne s'exécute.

## Redis (cookies J360)

Redis est utilisé **uniquement** par `J360AuthService` pour cacher les cookies de login J360 (TTL 7j). Pas de BullMQ malgré ce que dit l'ancien commentaire dans le code.

Configuration (priorité) :
1. `REDIS_URL` — chaîne complète format Railway/Heroku (`redis[s]://[user:pass@]host:port[/db]`).
2. Sinon fallback sur `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` (utilisé par `docker-compose.yml` en local).

Si Redis est injoignable au boot, ioredis logue `ECONNREFUSED` en boucle mais l'app continue de tourner — seul le scraper J360 sera cassé. Si tu n'utilises pas J360, tu peux ignorer le bruit (ou désactiver l'instanciation de Redis dans `J360AuthService`).

## Storage (S3 / MinIO)

`common/storage/storage.service.ts` wrappe `@aws-sdk/client-s3`. Le bucket (`S3_BUCKET`) est créé automatiquement au boot s'il n'existe pas (`onModuleInit`).

- **Local :** MinIO via `docker-compose.yml` (console UI sur `:9001`, S3 sur `:9000`). `S3_FORCE_PATH_STYLE=true` requis pour MinIO.
- **Prod :** S3 réel (AWS, Backblaze B2, Wasabi…).

URLs de download : presigned (expiration `S3_DOWNLOAD_URL_EXPIRES`, défaut 7j).

## Variables d'environnement

Copier `.env.example` → `.env`. Les non-évidentes :

| Variable | Note |
|----------|------|
| `DATABASE_URL` vs `DATABASE_URL_ADMIN` | Voir section RLS. Prisma utilise actuellement l'URL admin à l'exécution. |
| `JWT_SECRET` | Clé HS256, ≥ 64 caractères en prod (recommandation README). |
| `JWT_EXPIRES_IN` | Défaut `12h`. |
| `BCRYPT_ROUNDS` | Défaut 12. |
| `S3_*` | Pointe sur MinIO en dev. `S3_FORCE_PATH_STYLE=true` obligatoire pour MinIO. |
| `WAVE_WEBHOOK_SECRET` | Format `wave_sn_WHS_xxx...`. Si vide en dev → check HMAC désactivé (warning logué). **Obligatoire en prod.** |
| `REDIS_URL` | Prioritaire sur `REDIS_HOST/PORT/PASSWORD`. Format URL Railway/Heroku. |
| `CRON_SECRET` | Secret pour les endpoints `/api/cron/*`. Générer avec `openssl rand -hex 32`. Si vide, tous les appels cron refusés. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Optionnelles. Module `claude` se désactive silencieusement sans elles. Modèle défaut `claude-haiku-4-5`. |
| `J360_EMAIL` / `J360_PASSWORD` | Login J360 ; obligatoire si scraper J360 activé. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM_NAME` | Envoi d'emails (rappels, invitations). |
| `APP_URL` | URL publique du frontend, utilisée dans les emails (liens d'acceptation invitation, etc.). |

## Déploiement Railway

- `Dockerfile` multi-stage (`base` → `deps` → `builder` → `runner`). Node 20-slim + openssl + dumb-init.
- `scripts/entrypoint.sh` :
  - Si `PRISMA_RESET_ON_START=true` → `prisma migrate reset --force --skip-generate --skip-seed` (à utiliser **une fois** pour débloquer une DB en P3009 sur déploiement neuf, puis retirer la var).
  - Sinon → `prisma migrate deploy` (idempotent).
  - Puis `node dist/main`.
- **Build constraint :** `tsconfig.json` doit avoir `"include": ["src/**/*"]` + `"exclude": ["node_modules", "dist", "scripts", "prisma"]` pour que `tsc` ne descende pas le `rootDir` au-dessus de `src/`. Sinon la sortie devient `dist/src/main.js` au lieu de `dist/main.js` et le `CMD` du Dockerfile échoue (`Cannot find module /app/dist/main`).

## Alias de path

`tsconfig.json` mappe `@/*` → `src/*`. Préférer les imports relatifs à l'intérieur d'un module, et les imports via alias entre modules uniquement si le code existant le fait déjà — la majorité du codebase utilise des chemins relatifs.

## Pièges connus à éviter

- **Ne pas instancier `new PrismaClient()`** ad-hoc — toujours injecter `PrismaService` pour bénéficier d'`onModuleInit` (`$connect`) et du contexte tenant.
- **Ne pas oublier `withPlatformContext()`** dans les jobs cron / scrapers / handlers webhook qui touchent plusieurs tenants.
- **`prisma/schema.prisma` est l'unique source de vérité.** Les fichiers `prisma/SCHEMA-CHANGES*.md` et `prisma/schema-*-additions.prisma` sont des brouillons de planification — en cas de divergence, faire confiance à `schema.prisma`.
- **Ne pas re-générer la routes publiques** sans ajouter le path à `TenantMiddleware.publicPaths`.
- **Ne pas remettre de `@Cron`** dans le code — utiliser le pattern HTTP via `CronModule`.
