import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthController } from './controllers/auth.controller';
import { OrgController } from './controllers/org.controller';
import { AuthService } from './services/auth.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController, AuthController, OrgController],
  providers: [AuthService],
})
export class ServerlessAppModule {}
