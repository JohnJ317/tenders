import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../tenant/tenant.middleware';

/**
 * Usage: myEndpoint(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
