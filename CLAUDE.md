# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

TenderPro API — backend NestJS multi-tenant (SaaS) pour les cabinets d'audit & d'expertise comptable d'Afrique de l'Ouest/Centrale. Gère les pipelines d'appels d'offres (AO), les manifestations, le pricing et les propositions. La documentation et les commentaires du code sont en français — garder les nouveaux contenus en français quand on édite des fichiers existants.

## Commandes

```bash
# Serveur dev (watch)
npm run start:dev

# Build + run compilé
npm run build && npm run start:prod

# Lint (auto-fix)
npm run lint

# Prisma — régénérer le client après changement de schéma
npm run prisma:generate
# Créer + appliquer une nouvelle migration (dev)
npm run prisma:migrate
# Appliquer les migrations sans prompt (CI/prod)
npm run prisma:deploy
# GUI
npm run prisma:studio

# Seed (idempotent : supprime puis recrée le cabinet démo)
npm run db:seed
# Reset complet + remigrer + reseeder
npm run db:reset

# Démarrer les dépendances (Postgres 16 + MinIO + Redis)
docker compose up -d
```

Aucun runner de tests n'est configuré — `npm test` n'existe pas. Si on demande de « lancer les tests », le dire explicitement plutôt qu'inventer une commande.

L'API écoute sur `http://localhost:3000/api` (prefix global `api` défini dans `src/main.ts`).

## Architecture : pattern multi-tenant RLS

C'est la pièce centrale — la comprendre avant de toucher à `src/common/prisma`, `src/common/tenant`, ou à n'importe quelle migration.

**Flux d'une requête :**
1. `TenantMiddleware` (`src/common/tenant/tenant.middleware.ts`) s'exécute sur toutes les routes. Il ignore la liste publique (`/api/auth/login`, `/api/auth/register`, `/api/health`). Sinon il vérifie le JWT Bearer, extrait `{ sub, cabinetId, role, grade }`, attache le payload à `req.user`, puis appelle `TenantContext.run(ctx, () => next())`.
2. `TenantContext` (`src/common/tenant/tenant-context.ts`) est un wrapper léger autour de l'`AsyncLocalStorage` de Node. Le store transporte `{ tenantId, userId, role, grade, bypassRls? }` à travers la chaîne async.
3. `PrismaService` est un `PrismaClient` simple — l'enforcement RLS se fait côté Postgres, pas dans un middleware Prisma (le commentaire du fichier qui mentionne `$use` / `$extends` est obsolète ; le service actuel n'installe aucun intercepteur de query). L'enforcement repose sur la séparation des rôles Postgres ci-dessous.
4. **Deux rôles Postgres :**
   - `tenderpro_admin` — owner du schéma, utilisé par Prisma pour les migrations. `DATABASE_URL_ADMIN` dans `.env`. Bypass RLS implicitement (owner). **C'est aussi l'URL utilisée par le Prisma Client à l'exécution** (cf. `datasource db { url = env("DATABASE_URL_ADMIN") }` dans `prisma/schema.prisma`). À traiter comme un écart connu : les tables RLS existent et sont en `FORCE`, mais les queries applicatives tournent sous l'owner qui peut bypass. Ne pas supprimer le RLS en pensant qu'il est inutile — la direction visée est de basculer l'URL runtime vers `DATABASE_URL` (rôle `tenderpro`).
   - `tenderpro` — rôle app non-owner, soumis à `FORCE ROW LEVEL SECURITY`. `DATABASE_URL` dans `.env`.
5. **Opérations plateforme** (login, signup, jobs cross-tenant) doivent encapsuler les appels Prisma dans `prismaService.withPlatformContext(fn)` qui positionne `bypassRls: true` dans le store ALS. Le nouveau code cross-tenant doit passer par ce helper plutôt qu'instancier un `PrismaClient` frais.

**Quand on ajoute une nouvelle table tenant-scoped :**
- Ajouter `cabinet_id UUID` + FK vers `cabinets(id) ON DELETE CASCADE`.
- Index sur `cabinet_id` (ou composite commençant par lui).
- Dans le SQL de migration, après le `CREATE TABLE`, activer RLS et ajouter la policy par tenant — suivre le pattern de `prisma/migrations/20260421000000_init/migration.sql`. Accorder les DML pertinents au rôle `tenderpro` dans la même migration.
- Ne jamais se reposer sur un `WHERE cabinet_id = ...` seul ; traiter le RLS comme la source de vérité et les filtres applicatifs comme une défense redondante.

**Rôles & contrôle d'accès :**
- Enum RBAC `Role` : `ADMIN_CABINET | ASSOCIE | MANAGER | CONSULTANT`.
- Protéger les contrôleurs avec `@UseGuards(RolesGuard)` + `@Roles(Role.X, Role.Y)`. `RolesGuard` (`src/common/auth/roles.guard.ts`) lit `req.user` posé par le middleware — il ne re-vérifie pas le JWT.
- L'enum `Grade` (`ASSOCIE | MANAGER | SENIOR | JUNIOR | ASSISTANT`) pilote les tarifs de `grille_horaire`, pas l'autorisation.

## Organisation des modules

- `src/common/` — infra transverse : `prisma` (client), `tenant` (ALS + middleware), `auth` (login, JWT, RolesGuard, `@CurrentUser`, `@Roles`), `storage` (wrapper S3/MinIO).
- `src/modules/` — features métier. Chacun est un module NestJS autonome (controller + service + DTOs). Lors de l'ajout, l'enregistrer dans les `imports` de `src/app.module.ts`.
- Relations inter-modules à connaître :
  - `scrapers` tire les AO depuis des sources externes (`sources/*.scraper.ts`, chacun étend `AbstractScraper`) et écrit des lignes `ScrapedTender`. Après un run, il déclenche `matching.processNew()` (best-effort, non attendu) qui tente de matcher les items scrapés aux `Activity` configurées et de les promouvoir en `Tender`.
  - `tenders` possède la state machine du pipeline AO (`state-machine/tender-transitions.ts`) — une simple map de transitions, pas XState malgré la roadmap du README. États finaux : `WON`, `LOST`, `CANCELLED`. Toujours passer par `canTransition(from, to)` pour un changement d'état.
  - `events` est le miroir de `tenders` pour les conférences/salons, avec ses propres étapes et transitions.
  - `claude` utilise `@anthropic-ai/sdk` + `pdf-parse` pour analyser les DCE des AO. Modèle par défaut `claude-haiku-4-5`, surchargeable via `ANTHROPIC_MODEL`. Nécessite `ANTHROPIC_API_KEY` ; se désactive proprement si absente.
  - `pricing` / `pricing-coefficients` / `proposals` — moteur de devis cost-plus, produit les offres PDF/DOCX via `pdfkit` / `docx`.
- `prisma/schema.prisma` est l'unique source de vérité — 800+ lignes couvrant tous les sprints. `prisma/SCHEMA-CHANGES*.md` et `prisma/schema-*-additions.prisma` sont **des fichiers de travail/planification** issus de features en cours, non autoritatifs ; en cas de divergence, faire confiance à `schema.prisma`.

## Validation & DTOs

`main.ts` installe un `ValidationPipe` global avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Les champs inconnus dans un body produisent un 400 — toujours déclarer chaque champ attendu sur le DTO. Utiliser les décorateurs `class-validator` ; `enableImplicitConversion` gère la coercion des query strings.

## Variables d'environnement

Copier `.env.example` → `.env`. Les non-évidentes :
- `DATABASE_URL` vs `DATABASE_URL_ADMIN` — voir la section RLS. Prisma utilise actuellement l'URL admin.
- `JWT_SECRET` — clé de signature HS256 ; le README demande ≥64 caractères en prod.
- `S3_*` — pointe sur MinIO en dev (`localhost:9000`, console `:9001`). `S3_FORCE_PATH_STYLE=true` est requis pour MinIO.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` — optionnelles ; le module Claude se désactive silencieusement sans elles.

## Alias de path

`tsconfig.json` mappe `@/*` → `src/*`. Préférer les imports relatifs à l'intérieur d'un module, et les imports via alias entre modules uniquement si le code existant le fait déjà — la majorité du codebase utilise des chemins relatifs.
