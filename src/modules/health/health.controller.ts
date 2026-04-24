import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // Ping DB en mode platform (pas de tenant context requis)
    let dbOk = false;
    try {
      await this.prisma.withPlatformContext(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      });
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbOk,
      uptime: process.uptime(),
    };
  }
}
