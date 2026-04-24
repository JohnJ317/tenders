import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * @Roles(Role.ADMIN_CABINET, Role.ASSOCIE)
 * Limite l'accès à certains rôles. Absence de decorator = tout user authentifié OK.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
