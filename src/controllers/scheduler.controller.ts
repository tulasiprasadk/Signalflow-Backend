import { Controller, Post, Get, Delete, Body, Param, Logger } from '@nestjs/common';
import { SchedulerService } from '../services/scheduler.service';

interface SchedulePostDto {
  scheduledTime: string;
  message: string;
  imageUrl?: string;
  accounts: Array<{ platform: string; pageId: string; accessToken: string }>;
}

@Controller('scheduler')
export class SchedulerController {
  private readonly logger = new Logger(SchedulerController.name);

  constructor(private scheduler: SchedulerService) {}

  @Post('schedule')
  schedulePost(@Body() dto: SchedulePostDto) {
    const scheduledTime = new Date(dto.scheduledTime);
    const post = this.scheduler.schedulePost(
      dto.message,
      dto.accounts,
      scheduledTime,
      dto.imageUrl,
    );
    this.logger.log(`Scheduled post ${post.id} for ${scheduledTime}`);
    return post;
  }

  @Get('pending')
  getPendingPosts() {
    return this.scheduler.getPendingPosts();
  }

  @Get('all')
  getAllScheduledPosts() {
    return this.scheduler.getScheduledPosts();
  }

  @Delete(':id')
  deleteScheduledPost(@Param('id') id: string) {
    const deleted = this.scheduler.deleteScheduledPost(id);
    return { success: deleted };
  }
}
