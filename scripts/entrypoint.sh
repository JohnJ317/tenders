#!/bin/sh
# Entrypoint prod : gère un reset optionnel de la DB avant d'appliquer les
# migrations et de démarrer l'API.
#
# PRISMA_RESET_ON_START=true → équivalent `prisma migrate reset --force` :
#   DROP + CREATE SCHEMA public, puis rejoue toutes les migrations.
#   À utiliser UNE FOIS pour débloquer une DB en état failed (P3009) sur un
#   déploiement neuf. ⚠ Détruit toutes les données — à retirer ensuite.
#
# Sinon : `prisma migrate deploy` classique (idempotent).
set -eu

if [ "${PRISMA_RESET_ON_START:-false}" = "true" ]; then
  echo "⚠  PRISMA_RESET_ON_START=true → reset complet de la DB"
  npx prisma migrate reset --force --skip-generate --skip-seed
elif [ "${SKIP_MIGRATIONS:-false}" = "true" ]; then
  # Cas d'une base déjà provisionnée dont l'historique _prisma_migrations est
  # vide (schéma poussé via `db push`) : `migrate deploy` rejouerait les
  # migrations depuis zéro et échouerait sur des tables existantes.
  echo "↷  SKIP_MIGRATIONS=true → migrations non appliquées au démarrage"
else
  npx prisma migrate deploy
fi

exec node dist/main
