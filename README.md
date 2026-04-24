# TenderPro API — Sprint 1

Socle multi-tenant pour la plateforme SaaS de gestion AO & manifestations pour cabinets audit/expertise comptable.

## Stack

- **NestJS 10** (TypeScript)
- **PostgreSQL 16** avec Row-Level Security (RLS) pour l'isolation multi-tenant
- **Prisma 5** ORM, avec middleware qui injecte automatiquement le tenant courant dans chaque query
- **Auth** JWT (HS256) + RBAC à 4 rôles (admin_cabinet, associé, manager, consultant)
- **`AsyncLocalStorage`** pour la propagation du contexte tenant à travers la chaîne asynchrone

## Architecture multi-tenant

Le pattern est simple et robuste :

1. Un client envoie un JWT dans le header `Authorization: Bearer ...`
2. Le `TenantMiddleware` vérifie le JWT, extrait `cabinetId`, et lance le reste de la requête dans un `AsyncLocalStorage.run({ tenantId, userId, role, grade }, next)`
3. Le `PrismaService` enregistre un middleware `$use` qui, pour chaque query, ouvre une transaction courte et exécute `SET LOCAL app.current_tenant_id = '<uuid>'` avant d'exécuter la query
4. Les **policies RLS** sur chaque table filtrent les lignes accessibles en fonction de ce paramètre

Résultat : même si un dev oublie un `WHERE cabinet_id = ...`, aucune fuite cross-tenant n'est possible. Defense in depth au niveau base.

Deux rôles Postgres distincts :
- `tenderpro_admin` (owner du schéma) — utilisé pour les migrations, bypass RLS implicitement côté app via `withPlatformContext()` (login, signup)
- `tenderpro` (app runtime) — soumis aux policies grâce à `FORCE ROW LEVEL SECURITY`

## Prérequis

- Node.js ≥ 20
- Docker + Docker Compose (pour Postgres local)
- npm ≥ 10

## Setup

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer Postgres
docker compose up -d

# 3. Copier l'env
cp .env.example .env

# 4. Appliquer les migrations (crée les tables + policies RLS)
npm run prisma:migrate

# 5. Seeder la base (crée un cabinet démo + 2 users + grille horaire)
npm run db:seed

# 6. Lancer le serveur en dev
npm run start:dev
```

L'API écoute sur `http://localhost:3000/api`.

## Endpoints Sprint 1

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/health` | public | Health check |
| POST | `/auth/login` | public | Login → JWT |
| GET | `/cabinets/me` | tous | Config du cabinet courant |
| PATCH | `/cabinets/me` | ADMIN_CABINET, ASSOCIE | Modifier config du cabinet |
| GET | `/users` | ADMIN_CABINET, ASSOCIE, MANAGER | Liste des users |
| POST | `/users` | ADMIN_CABINET | Créer un user |
| PATCH | `/users/:id` | ADMIN_CABINET | Modifier un user |
| DELETE | `/users/:id` | ADMIN_CABINET | Désactiver un user |
| GET | `/activities` | tous | Liste des activités du cabinet |
| POST | `/activities` | ADMIN_CABINET, ASSOCIE | Créer une activité |
| PATCH | `/activities/:id` | ADMIN_CABINET, ASSOCIE | Modifier une activité |
| DELETE | `/activities/:id` | ADMIN_CABINET, ASSOCIE | Désactiver une activité |
| GET | `/grille-horaire` | ADMIN_CABINET, ASSOCIE, MANAGER | Grille active |
| POST | `/grille-horaire` | ADMIN_CABINET, ASSOCIE | Ajouter une ligne |
| PATCH | `/grille-horaire/:id` | ADMIN_CABINET, ASSOCIE | Modifier une ligne |

## Test rapide

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kouassi-associes.ci","password":"admin123"}'

# Récupérer le cabinet courant (remplace TOKEN par accessToken retourné ci-dessus)
curl http://localhost:3000/api/cabinets/me \
  -H "Authorization: Bearer TOKEN"

# Essaie avec un user non admin sur un endpoint admin-only :
curl -X PATCH http://localhost:3000/api/cabinets/me \
  -H "Authorization: Bearer MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Nouveau nom"}'
# → 403 Forbidden (le manager n'a pas le rôle ADMIN_CABINET/ASSOCIE)
```

## Test du cloisonnement RLS

Pour vérifier que l'isolation fonctionne vraiment, tu peux :

1. Créer un 2ᵉ cabinet via Prisma Studio (`npm run prisma:studio`) avec un user propre
2. Login avec ce 2ᵉ user
3. Appeler `GET /cabinets/me` → tu récupères **uniquement** ton cabinet, jamais l'autre

Même en essayant un `prisma.cabinet.findMany()` sans filtre dans un service, seul ton propre cabinet remontera grâce aux policies RLS.

## Structure

```
src/
├── main.ts                      # Bootstrap
├── app.module.ts                # Module root + wiring du middleware tenant
├── common/
│   ├── prisma/                  # PrismaService avec enforcement RLS via $use
│   ├── tenant/                  # AsyncLocalStorage context + middleware JWT
│   └── auth/                    # Login, RolesGuard, decorators
└── modules/
    ├── health/                  # /health endpoint
    ├── cabinets/                # Config du cabinet courant
    ├── users/                   # CRUD utilisateurs
    ├── activities/              # CRUD activités (CAC, audit, EC, etc.)
    └── grille-horaire/          # CRUD grille horaire par grade

prisma/
├── schema.prisma                # Cabinet, User, Activity, GrilleHoraire
├── migrations/
│   └── 20260421000000_init/
│       └── migration.sql        # Tables + policies RLS (le fichier clé)
└── seed.ts                      # Cabinet démo Abidjan
```

## Prochaines étapes

**Sprint 2** — Pipeline AO + manifestations
- Entités `Opportunity` (discriminator AO / manifestation), `Stage`, `StageTransition`, `Document`
- State machine XState pour les transitions d'étape (veille → qualification → ...)
- Upload fichiers S3-compatible (MinIO)
- UI Kanban + tableau filtrable (projet Next.js séparé)
- Mentions `@` et notifications

**Sprint 3** — Moteur de pricing & offre financière
- `PriceSimulation` : cost-plus paramétrable
- Coefficients (complexité, secteur réglementé, déplacements, urgence)
- Gestion TVA par pays (18% CI/SN, 19,25% CM)
- Export proposition financière format bailleur (BM, BAD, UE)

**Sprint 4** — Ingestion & analytics
- Scraper Playwright pour SIGMAP CI, BM eProcurement, BAD
- Parseur DCE (PDF → sections via Claude API)
- Matching automatique aux activités configurées du cabinet
- Dashboard funnel + win rate par segment

## Points d'attention pour la prod

1. **Remplacer `JWT_SECRET`** par une clé 64+ caractères générée via `openssl rand -base64 64`
2. **Créer un rôle PG dédié pour les migrations** avec uniquement les droits DDL nécessaires (pas le superuser)
3. **Passer à un OIDC provider** (Keycloak, Auth0, WorkOS) — les gros cabinets exigeront SSO/SAML
4. **Activer `prepared_statements=false`** dans l'URL Prisma si tu utilises PgBouncer en mode transaction (sinon le `SET LOCAL` fuit entre requêtes)
5. **Auditer les logs Postgres** : activer `log_statement='mod'` en staging pour vérifier qu'aucune query ne contourne les policies
6. **Rate limiting** sur `/auth/login` (throttler NestJS ou nginx) — cible prioritaire de brute force
7. **Audit log** : ajouter une table `audit_log` pour tracer qui a modifié quoi, demandé par les normes audit ISA 220

## Licence

Propriétaire — tous droits réservés.
