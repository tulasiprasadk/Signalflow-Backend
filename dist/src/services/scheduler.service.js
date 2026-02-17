"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const common_1 = require("@nestjs/common");
const social_service_1 = require("./social.service");
let SchedulerService = SchedulerService_1 = class SchedulerService {
    constructor(social) {
        this.social = social;
        this.logger = new common_1.Logger(SchedulerService_1.name);
        this.scheduledPosts = [];
        this.isRunning = false;
        this.startScheduler();
    }
    schedulePost(message, accounts, scheduledTime, imageUrl) {
        const post = {
            id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            message,
            imageUrl,
            accounts,
            scheduledTime,
            createdAt: new Date(),
            status: 'pending',
        };
        this.scheduledPosts.push(post);
        this.logger.log(`Scheduled post ${post.id} for ${scheduledTime}`);
        return post;
    }
    getScheduledPosts() {
        return this.scheduledPosts;
    }
    getPendingPosts() {
        return this.scheduledPosts.filter((p) => p.status === 'pending');
    }
    deleteScheduledPost(postId) {
        const index = this.scheduledPosts.findIndex((p) => p.id === postId);
        if (index >= 0) {
            this.scheduledPosts.splice(index, 1);
            this.logger.log(`Deleted scheduled post ${postId}`);
            return true;
        }
        return false;
    }
    startScheduler() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        setInterval(() => {
            this.publishDuePosts();
        }, 10000);
        this.logger.log('Scheduler started - checking every 10 seconds');
    }
    async publishDuePosts() {
        const now = new Date();
        const duePosts = this.scheduledPosts.filter((p) => p.status === 'pending' && p.scheduledTime <= now);
        if (duePosts.length === 0)
            return;
        this.logger.log(`Publishing ${duePosts.length} due post(s)`);
        for (const post of duePosts) {
            try {
                for (const account of post.accounts) {
                    const platform = account.platform;
                    const pageId = account.pageId;
                    const accessToken = account.accessToken;
                    if (platform === 'facebook') {
                        await this.social.publishToFacebookPage(pageId, post.message, accessToken, post.imageUrl);
                    }
                    else if (platform === 'instagram') {
                        await this.social.publishToInstagramAccount(pageId, post.message, post.imageUrl, accessToken);
                    }
                    else if (platform === 'linkedin') {
                        const isOrg = pageId.startsWith('linkedin_org:');
                        if (isOrg) {
                            await this.social.publishToLinkedInOrganization(pageId, post.message);
                        }
                        else {
                            await this.social.publishToLinkedInMember(pageId, post.message);
                        }
                    }
                    else if (platform === 'twitter') {
                        await this.social.publishToTwitterUser(pageId, post.message, accessToken);
                    }
                }
                post.status = 'published';
                this.logger.log(`Published scheduled post ${post.id}`);
            }
            catch (e) {
                post.status = 'failed';
                post.error = String(e);
                this.logger.error(`Failed to publish scheduled post ${post.id}: ${String(e)}`);
            }
        }
    }
};
exports.SchedulerService = SchedulerService;
exports.SchedulerService = SchedulerService = SchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [social_service_1.SocialService])
], SchedulerService);
//# sourceMappingURL=scheduler.service.js.map