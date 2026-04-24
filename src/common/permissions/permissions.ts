import { Role } from '@prisma/client';

/**
 * Matrice de permissions TenderPro.
 * Chaque clé représente une action, les valeurs sont les rôles autorisés.
 */
export const PERMISSIONS = {
  // ===== Cabinet =====
  'cabinet:update': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'users:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'users:delete': [Role.ADMIN_CABINET, Role.ASSOCIE],
  'templates:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'coefficients:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'grille:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],

  // ===== Appels d'offres =====
  'tender:read': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],
  'tender:create': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'tender:update': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'tender:delete': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'tender:transition': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'tender:upload_doc': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],
  'tender:analyze': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],

  // ===== Propositions =====
  'proposal:read': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],
  'proposal:generate': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'proposal:edit': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'proposal:regenerate': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'proposal:export': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],

  // ===== Pricing =====
  'pricing:read': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'pricing:generate': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'pricing:promote': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'pricing:delete': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],

  // ===== Ressources =====
  'resource:read': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],
  'consultant:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'reference:manage': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],

  // ===== Veille =====
  'watch:read': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER, Role.CONSULTANT],
  'watch:configure': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
  'scraper:run': [Role.ADMIN_CABINET, Role.ASSOCIE, Role.MANAGER],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Vérifie si un rôle a une permission donnée.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return (allowedRoles as readonly Role[]).includes(role);
}

/**
 * Retourne toutes les permissions d'un rôle (utile pour le frontend).
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) =>
    hasPermission(role, p),
  );
}
