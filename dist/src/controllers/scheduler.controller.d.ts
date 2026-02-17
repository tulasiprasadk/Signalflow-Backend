import { SchedulerService } from '../services/scheduler.service';
interface SchedulePostDto {
    scheduledTime: string;
    message: string;
    imageUrl?: string;
    accounts: Array<{
        platform: string;
        pageId: string;
        accessToken: string;
    }>;
}
export declare class SchedulerController {
    private scheduler;
    private readonly logger;
    constructor(scheduler: SchedulerService);
    schedulePost(dto: SchedulePostDto): import("../services/scheduler.service").ScheduledPost;
    getPendingPosts(): import("../services/scheduler.service").ScheduledPost[];
    getAllScheduledPosts(): import("../services/scheduler.service").ScheduledPost[];
    deleteScheduledPost(id: string): {
        success: boolean;
    };
}
export {};
