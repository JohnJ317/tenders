import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Global,
  Injectable,
  Module,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClaudeUsageService } from './claude-usage.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Guard qui n'autorise que les SUPER_ADMIN.
 * À utiliser sur les controllers /platform/...
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.user?.role as Role | undefined;

    if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Accès réservé au super administrateur');
    }
    return true;
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ClaudeUsageService, SuperAdminGuard],
  exports: [ClaudeUsageService, SuperAdminGuard],
})
export class PlatformCoreModule {}
