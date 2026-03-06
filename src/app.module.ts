import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { StatusController } from './status.controller';
import { SearchController } from './search.controller';
import { OrgController } from './controllers/org.controller';
import { SocialController } from './controllers/social.controller';
import { UnsplashController } from './controllers/unsplash.controller';
import { SchedulerController } from './controllers/scheduler.controller';
import { AuthController } from './controllers/auth.controller';
import { SocialService } from './services/social.service';
import { SchedulerService } from './services/scheduler.service';
import { UnsplashRefreshService } from './services/unsplash-refresh.service';
import { AuthService } from './services/auth.service';
import { AdminKeyGuard } from './guards/admin-key.guard';
import { AdminController } from './controllers/admin.controller';

import { CoreModule } from './core/core.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 🔑 Database access
    PrismaModule,

    // 🔥 Core AI logic
    CoreModule,
  ],
  controllers: [
    HealthController,
    StatusController,
    SearchController,
    AuthController,
    OrgController,
    SocialController,
    SchedulerController,
    UnsplashController,
    AdminController,
  ],
  providers: [
    SocialService,
    SchedulerService,
    UnsplashRefreshService,
    AuthService,
    AdminKeyGuard,
  ],
})
export class AppModule {}
