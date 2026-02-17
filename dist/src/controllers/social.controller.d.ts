import { SocialService } from '../services/social.service';
import { SchedulerService } from '../services/scheduler.service';
import { ConfigService } from '@nestjs/config';
interface PublishDto {
    pageId: string;
    message: string;
    imageUrl?: string;
    accessToken?: string;
}
interface UploadImageDto {
    dataUrl: string;
}
export declare class SocialController {
    private social;
    private scheduler;
    private config;
    private readonly logger;
    constructor(social: SocialService, scheduler: SchedulerService, config: ConfigService);
    connectFacebook(res: any): Promise<any>;
    connectLinkedIn(res: any): Promise<any>;
    connectTwitter(res: any): Promise<any>;
    connectInstagram(res: any): Promise<any>;
    callbackFacebook(code: string, res: any): Promise<any>;
    callbackLinkedIn(code: string, query: any, res: any): Promise<any>;
    callbackTwitter(code: string, state: string, res: any): Promise<any>;
    publishFacebook(body: PublishDto, res: any): Promise<any>;
    publishLinkedIn(body: PublishDto, res: any): Promise<any>;
    publishTwitter(body: PublishDto, res: any): Promise<any>;
    publishInstagram(body: PublishDto, res: any): Promise<any>;
    debugLinkedInOrganizations(res: any): Promise<any>;
    uploadImage(body: UploadImageDto, res: any): Promise<any>;
    adminUpdateToken(body: {
        provider: string;
        accessToken: string;
    }, res: any): Promise<any>;
    refreshInstagram(res: any): Promise<any>;
    debugInstagram(res: any): Promise<any>;
    listPages(): Promise<{
        id: string;
        provider: string;
        platform: string;
        label: any;
        accessToken: string;
    }[]>;
    deletePage(id: string): Promise<{
        ok: boolean;
    }>;
    deleteAllPages(): Promise<{
        ok: boolean;
    }>;
    schedulePost(body: {
        message: string;
        imageUrl?: string;
        accounts: Array<{
            platform: string;
            pageId: string;
            accessToken: string;
        }>;
        scheduledTime: string;
    }, res: any): Promise<any>;
    getPendingPosts(): Promise<import("../services/scheduler.service").ScheduledPost[]>;
    getAllScheduledPosts(): Promise<import("../services/scheduler.service").ScheduledPost[]>;
    deleteScheduledPost(id: string): Promise<{
        ok: boolean;
        error?: undefined;
    } | {
        ok: boolean;
        error: string;
    }>;
}
export {};
