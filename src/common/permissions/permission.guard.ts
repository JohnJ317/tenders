import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Permission, hasPermission } from './permissions';

export const PERMISSION_KEY = 'permission';

/**
 * Décorateur : @RequirePermission('tender:delete')
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const role = req.user?.role as Role | undefined;

    if (!role || !hasPermission(role, required)) {
      throw new ForbiddenException(`Permission refusée : ${required}`);
    }
    return true;
  }
}
