import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { StatusController } from './status.controller';
import { SearchController } from './search.controller';
import { OrgController } from './controllers/org.controller';
import { SocialController } from './controllers/social.controller';
import { SchedulerController } from './controllers/scheduler.controller';
import { SocialService } from './services/social.service';
import { SchedulerService } from './services/scheduler.service';

import { CoreModule } from './core/core.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 🔑 Database access
    PrismaModule,

    // 🔥 Core AI logic
    CoreModule,
  ],
  controllers: [
    StatusController,
    SearchController,
    OrgController,
    SocialController,
    SchedulerController,
  ],
  providers: [SocialService, SchedulerService],
})
export class AppModule {}
