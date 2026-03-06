import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SocialService } from './social.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UnsplashRefreshService implements OnModuleInit {
  private readonly logger = new Logger(UnsplashRefreshService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private social: SocialService, private prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.VERCEL) {
      this.logger.log('UnsplashRefreshService disabled in Vercel serverless runtime');
      return;
    }

    // Run check every hour and refresh all provider tokens where possible
    this.logger.log('UnsplashRefreshService starting - will check every hour for all providers');
    await this.checkAndRefresh();
    this.intervalHandle = setInterval(() => this.checkAndRefresh().catch((e) => this.logger.warn(String(e))), 1000 * 60 * 60);
  }

  async checkAndRefresh() {
    try {
      const accounts = await this.prisma.socialAccount.findMany();
      if (!accounts || accounts.length === 0) return;
      const now = new Date();
      const soon = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 24h
      for (const acc of accounts) {
        const expiresAt = acc.expiresAt ? new Date(acc.expiresAt) : null;
        // Only attempt refresh if we have a refreshToken or the provider supports exchange
        if (!acc.refreshToken && !acc.provider.startsWith('facebook')) continue;
        if (!expiresAt || expiresAt <= soon) {
          this.logger.log(`Attempting refresh for ${acc.provider} (id=${acc.id})`);
          try {
            const updated = await this.social.refreshSocialAccount(acc as any);
            if (updated) this.logger.log(`Refreshed token for ${acc.provider} (id=${acc.id})`);
            else this.logger.warn(`Refresh returned no update for ${acc.provider} (id=${acc.id})`);
          } catch (e) {
            this.logger.warn(`Failed to refresh token for ${acc.provider} (id=${acc.id}): ${String(e)}`);
          }
        }
      }
    } catch (e) {
      this.logger.warn('UnsplashRefreshService check failed: ' + String(e));
    }
  }
}
