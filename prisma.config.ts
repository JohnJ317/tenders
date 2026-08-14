import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Configuration Prisma 7.
 *
 * Depuis Prisma 7, le datasource du schéma ne porte plus d'`url` : la CLI
 * (migrate, studio, seed) obtient sa connexion via l'adapter déclaré ici,
 * et le runtime via l'adapter passé au constructeur dans PrismaService.
 *
 * On utilise DATABASE_URL_ADMIN si présent (rôle owner, requis pour appliquer
 * les migrations et les policies RLS), sinon DATABASE_URL.
 */
const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node prisma/seed.ts',
  },
  // `migrate` / `db` ont besoin de l'URL brute (elles pilotent le moteur de
  // migration), tandis que `studio` passe par l'adapter.
  datasource: {
    url: adminUrl,
  },
  adapter: async () => new PrismaPg({ connectionString: adminUrl }),
});
