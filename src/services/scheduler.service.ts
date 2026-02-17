import { Injectable, Logger } from '@nestjs/common';
import { SocialService } from './social.service';

export interface ScheduledPost {
  id: string;
  scheduledTime: Date;
  message: string;
  imageUrl?: string;
  accounts: Array<{ platform: string; pageId: string; accessToken: string }>;
  status: 'pending' | 'published' | 'failed';
  error?: string;
  createdAt: Date;
}

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private scheduledPosts: ScheduledPost[] = [];
  private isRunning = false;

  constructor(private social: SocialService) {
    this.startScheduler();
  }

  schedulePost(
    message: string,
    accounts: Array<{ platform: string; pageId: string; accessToken: string }>,
    scheduledTime: Date,
    imageUrl?: string,
  ): ScheduledPost {
    const post: ScheduledPost = {
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

  getScheduledPosts(): ScheduledPost[] {
    return this.scheduledPosts;
  }

  getPendingPosts(): ScheduledPost[] {
    return this.scheduledPosts.filter((p) => p.status === 'pending');
  }

  deleteScheduledPost(postId: string): boolean {
    const index = this.scheduledPosts.findIndex((p) => p.id === postId);
    if (index >= 0) {
      this.scheduledPosts.splice(index, 1);
      this.logger.log(`Deleted scheduled post ${postId}`);
      return true;
    }
    return false;
  }

  private startScheduler() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Check every 10 seconds for posts to publish
    setInterval(() => {
      this.publishDuePosts();
    }, 10000);
    
    this.logger.log('Scheduler started - checking every 10 seconds');
  }

  private async publishDuePosts() {
    const now = new Date();
    const duePosts = this.scheduledPosts.filter(
      (p) => p.status === 'pending' && p.scheduledTime <= now,
    );

    if (duePosts.length === 0) return;

    this.logger.log(`Publishing ${duePosts.length} due post(s)`);

    for (const post of duePosts) {
      try {
        for (const account of post.accounts) {
          const platform = account.platform;
          const pageId = account.pageId;
          const accessToken = account.accessToken;

          if (platform === 'facebook') {
            await this.social.publishToFacebookPage(
              pageId,
              post.message,
              accessToken,
              post.imageUrl,
            );
          } else if (platform === 'instagram') {
            await this.social.publishToInstagramAccount(
              pageId,
              post.message,
              post.imageUrl,
              accessToken,
            );
          } else if (platform === 'linkedin') {
            const isOrg = pageId.startsWith('linkedin_org:');
            if (isOrg) {
              await this.social.publishToLinkedInOrganization(pageId, post.message);
            } else {
              await this.social.publishToLinkedInMember(pageId, post.message);
            }
          } else if (platform === 'twitter') {
            await this.social.publishToTwitterUser(pageId, post.message, accessToken);
          }
        }
        post.status = 'published';
        this.logger.log(`Published scheduled post ${post.id}`);
      } catch (e) {
        post.status = 'failed';
        post.error = String(e);
        this.logger.error(`Failed to publish scheduled post ${post.id}: ${String(e)}`);
      }
    }
  }
}
