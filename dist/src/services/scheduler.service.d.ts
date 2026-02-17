import { SocialService } from './social.service';
export interface ScheduledPost {
    id: string;
    scheduledTime: Date;
    message: string;
    imageUrl?: string;
    accounts: Array<{
        platform: string;
        pageId: string;
        accessToken: string;
    }>;
    status: 'pending' | 'published' | 'failed';
    error?: string;
    createdAt: Date;
}
export declare class SchedulerService {
    private social;
    private readonly logger;
    private scheduledPosts;
    private isRunning;
    constructor(social: SocialService);
    schedulePost(message: string, accounts: Array<{
        platform: string;
        pageId: string;
        accessToken: string;
    }>, scheduledTime: Date, imageUrl?: string): ScheduledPost;
    getScheduledPosts(): ScheduledPost[];
    getPendingPosts(): ScheduledPost[];
    deleteScheduledPost(postId: string): boolean;
    private startScheduler;
    private publishDuePosts;
}
