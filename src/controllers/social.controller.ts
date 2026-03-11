import { Controller, Get, Query, Res, Logger, Post, Body, Delete, Param, Patch, Headers, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { SocialService } from '../services/social.service';
import { SchedulerService } from '../services/scheduler.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

interface PublishDto {
	pageId: string;
	message: string;
	imageUrl?: string;
	accessToken?: string; // Optional: for manual accounts without OAuth
}

interface UploadImageDto {
	dataUrl: string;
}

@Controller('social')
export class SocialController {
	private readonly logger = new Logger(SocialController.name);

	constructor(private social: SocialService, private scheduler: SchedulerService, private config: ConfigService, private authService: AuthService) {}

	@Get('connect/facebook')
	async connectFacebook(@Res() res) {
		const state = `state_${Date.now()}`;
		const url = await this.social.getFacebookOAuthUrl(state);
		this.logger.log(`Redirecting to Facebook OAuth: ${url}`);
		return res.redirect(url);
	}

	@Get('connect/linkedin')
	async connectLinkedIn(@Res() res) {
		const state = `state_${Date.now()}`;
		const url = await this.social.getLinkedInOAuthUrl(state);
		this.logger.log(`Redirecting to LinkedIn OAuth: ${url}`);
		return res.redirect(url);
	}

	@Get('connect/twitter')
	async connectTwitter(@Res() res) {
		const state = `state_${Date.now()}`;
		const url = await this.social.getTwitterOAuthUrl(state);
		this.logger.log(`Redirecting to Twitter OAuth: ${url}`);
		return res.redirect(url);
	}

	@Get('connect/instagram')
	async connectInstagram(@Res() res) {
		const state = `state_${Date.now()}`;
		const url = await this.social.getFacebookOAuthUrl(state);
		this.logger.log(`Redirecting to Instagram OAuth (via Facebook): ${url}`);
		return res.redirect(url);
	}

	@Get('callback/facebook')
	async callbackFacebook(@Query('code') code: string, @Res() res) {
		const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:6002';

		if (!code) {
			return res.redirect(`${frontend}/?connected=facebook&success=0&reason=${encodeURIComponent('Missing authorization code from Facebook callback')}`);
		}

		try {
			const result = await this.social.handleFacebookCallback(code);
			this.logger.log('Facebook callback handled; accounts=' + JSON.stringify(result.accounts));

			// Persist fetched pages into DB
			const saved = await this.social.persistFacebookPages(result.accounts);
			this.logger.log(`Persisted ${saved.length} facebook page(s)`);

			const igSaved = await this.social.syncInstagramAccountsFromFacebookPages();
			this.logger.log(`Persisted ${igSaved.length} instagram account(s)`);

			return res.redirect(`${frontend}/?connected=facebook&success=1`);
		} catch (e) {
			this.logger.error('Error handling Facebook callback', e as any);
			const reason = encodeURIComponent(String((e as any)?.message || e || 'Facebook callback failed'));
			return res.redirect(`${frontend}/?connected=facebook&success=0&reason=${reason}`);
		}
	}

	@Get('callback/linkedin')
	async callbackLinkedIn(@Query('code') code: string, @Query() query: any, @Res() res) {
		const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:6002';
		this.logger.log(`LinkedIn callback received: ${JSON.stringify(query || {})}`);

		if (!code) {
			return res.redirect(`${frontend}/?connected=linkedin&success=0`);
		}

		try {
			const result = await this.social.handleLinkedInCallback(code);
			this.logger.log('LinkedIn callback handled');

			const saved = await this.social.persistLinkedInAccount(result.profile, result.token?.access_token);
			this.logger.log(`Persisted LinkedIn account: ${saved ? 'ok' : 'none'}`);

			const orgIds = await this.social.getLinkedInOrganizations(result.token?.access_token);
			const orgSaved = await this.social.persistLinkedInOrganizations(orgIds, result.token?.access_token);
			this.logger.log(`Persisted LinkedIn org(s): ${orgSaved.length}`);

			const ok = Boolean(saved) || (orgSaved && orgSaved.length > 0);
			return res.redirect(`${frontend}/?connected=linkedin&success=${ok ? 1 : 0}`);
		} catch (e) {
			this.logger.error('Error handling LinkedIn callback', e as any);
			return res.redirect(`${frontend}/?connected=linkedin&success=0`);
		}
	}

	@Get('callback/twitter')
	async callbackTwitter(@Query('code') code: string, @Query('state') state: string, @Query('error') oauthError: string, @Query('error_description') errorDescription: string, @Query() query: any, @Res() res) {
		const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:6002';
		this.logger.log(`Twitter callback received: ${JSON.stringify(query || {})}`);

		if (oauthError) {
			const reason = encodeURIComponent(`${oauthError}${errorDescription ? `: ${errorDescription}` : ''}`);
			return res.redirect(`${frontend}/?connected=twitter&success=0&reason=${reason}`);
		}

		if (!code || !state) {
			return res.redirect(`${frontend}/?connected=twitter&success=0&reason=${encodeURIComponent('Missing code or state from Twitter callback')}`);
		}

		try {
			const result = await this.social.handleTwitterCallback(code, state);
			const saved = await this.social.persistTwitterAccount(result.user, result.token);
			this.logger.log(`Persisted Twitter account: ${saved ? 'ok' : 'none'}`);
			return res.redirect(`${frontend}/?connected=twitter&success=${saved ? 1 : 0}`);
		} catch (e) {
			this.logger.error('Error handling Twitter callback', e as any);
			const reason = encodeURIComponent(String((e as any)?.message || e || 'Twitter callback failed'));
			return res.redirect(`${frontend}/?connected=twitter&success=0&reason=${reason}`);
		}
	}

	@Post('publish/facebook')
	async publishFacebook(@Body() body: PublishDto, @Res() res) {
		try {
			const resp = await this.social.publishToFacebookPage(body.pageId, body.message, body.accessToken, body.imageUrl);
			return res.status(200).json(resp);
		} catch (e) {
			this.logger.error('Error publishing to Facebook', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Post('publish/linkedin')
	async publishLinkedIn(@Body() body: PublishDto, @Res() res) {
		try {
			const isOrg = body.pageId?.startsWith('linkedin_org:');
			const resp = isOrg
				? await this.social.publishToLinkedInOrganization(body.pageId, body.message)
				: await this.social.publishToLinkedInMember(body.pageId, body.message);
			return res.status(200).json(resp);
		} catch (e) {
			this.logger.error('Error publishing to LinkedIn', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Post('publish/twitter')
	async publishTwitter(@Body() body: PublishDto, @Res() res) {
		try {
			const resp = await this.social.publishToTwitterUser(body.pageId, body.message, body.accessToken);
			return res.status(200).json(resp);
		} catch (e) {
			this.logger.error('Error publishing to Twitter', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Post('publish/instagram')
	async publishInstagram(@Body() body: PublishDto, @Res() res) {
		try {
			const resp = await this.social.publishToInstagramAccount(body.pageId, body.message, body.imageUrl, body.accessToken);
			return res.status(200).json(resp);
		} catch (e) {
			this.logger.error('Error publishing to Instagram', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Get('debug/linkedin-orgs')
	async debugLinkedInOrganizations(@Res() res) {
		try {
			const accounts = await this.social.getAllAccounts();
			const linkedInAccounts = accounts.filter(acc => acc.provider.startsWith('linkedin:'));
			
			if (linkedInAccounts.length === 0) {
				return res.status(200).json({
					message: 'No LinkedIn personal accounts found',
					accounts: [],
				});
			}

			const results = [];
			for (const account of linkedInAccounts) {
				const memberId = account.provider.replace('linkedin:', '');
				const orgs = await this.social.getLinkedInOrganizations(account.accessToken);
				results.push({
					memberId,
					accessToken: `***${account.accessToken.slice(-10)}`,
					orgs,
					orgsCount: orgs.length,
					message: orgs.length === 0 ? '⚠️ No organizations found. Check if you are an admin.' : '✅ Organizations found',
				});
			}

			return res.status(200).json({
				message: 'LinkedIn organization debug info',
				accounts: results,
			});
		} catch (e) {
			this.logger.error('Error fetching LinkedIn orgs', e as any);
			return res.status(500).json({ error: String(e), message: 'Failed to fetch LinkedIn organizations' });
		}
	}

	@Post('upload-image')
	async uploadImage(@Body() body: UploadImageDto, @Res() res) {
		try {
			const dataUrl = body?.dataUrl || '';
			const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
			if (!match) {
				return res.status(400).json({ error: 'Invalid image data URL' });
			}
			const mime = match[1];
			const ext = mime.split('/')[1] || 'jpg';
			const buffer = Buffer.from(match[2], 'base64');
			const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
			const uploadsDir = join(process.cwd(), 'uploads');
			const filePath = join(uploadsDir, filename);
			await writeFile(filePath, buffer);
			const publicBase = this.config.get<string>('BACKEND_PUBLIC_URL') || this.config.get<string>('BACKEND_URL') || 'http://localhost:6001';
			const url = `${publicBase.replace(/\/$/, '')}/uploads/${filename}`;
			return res.status(200).json({ url });
		} catch (e) {
			this.logger.error('Error uploading image', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	// Temporary admin endpoint for local development to update stored access tokens.
	// Enabled when environment variable `ALLOW_ADMIN_ENDPOINTS` is set to '1'.
	@Post('admin/update-token')
	async adminUpdateToken(@Body() body: { provider: string; accessToken: string }, @Res() res) {
		const allow = this.config.get<string>('ALLOW_ADMIN_ENDPOINTS') === '1';
		if (!allow) return res.status(403).json({ error: 'admin endpoints disabled' });
		if (!body || !body.provider || !body.accessToken) return res.status(400).json({ error: 'provider and accessToken required' });
		try {
			const updated = await this.social.updateAccessToken(body.provider, body.accessToken);
			return res.status(200).json({ ok: true, updated });
		} catch (e) {
			this.logger.error('Error in adminUpdateToken', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Post('refresh/instagram')
	async refreshInstagram(@Res() res) {
		try {
			const saved = await this.social.syncInstagramAccountsFromFacebookPages();
			return res.status(200).json({ count: saved.length });
		} catch (e) {
			this.logger.error('Error syncing Instagram accounts', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Get('debug/instagram')
	async debugInstagram(@Res() res) {
		try {
			const results = await this.social.debugInstagramAccountsFromFacebookPages();
			return res.status(200).json(results);
		} catch (e) {
			this.logger.error('Error debugging Instagram accounts', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Get('pages')
	async listPages(@Headers('authorization') authorization?: string) {
		const user = await this.authService.getUserFromAuthorization(authorization);
		const allowedOrganizationIds = new Set((user.memberships || []).map((membership) => membership.organization.id));
		const pages = await this.social.getStoredPages();
		// return account info including accessToken
		const results = await Promise.all(
			pages
				.filter((p: any) => {
					const orgId = (p as any)?.organizationId || null;
					return orgId ? allowedOrganizationIds.has(orgId) : false;
				})
				.map(async (p) => {
				const orgId = (p as any)?.organizationId || null;
				const orgName = (p as any)?.organization?.name || 'Unassigned';
				const hasPrefix = p.provider.includes(':');
				const [rawPlatform, label] = hasPrefix ? p.provider.split(':') : ['facebook', p.provider];
				const platform = rawPlatform === 'linkedin_org' ? 'linkedin' : rawPlatform;
				const base = {
					id: p.id,
					provider: p.provider,
					pageId: label,
					platform,
					accessToken: p.accessToken,
					organizationId: orgId,
					organizationName: orgName,
					isPostable: true,
					postabilityReason: null as string | null,
				};

				if (rawPlatform === 'instagram') {
					const igUsername = await this.social.getInstagramUsername(label, p.accessToken);
					return {
						...base,
						label: igUsername || label,
					};
				}

				if (rawPlatform === 'facebook') {
					const pageName = await this.social.getFacebookPageName(label, p.accessToken);
					const isNumericPageId = /^\d+$/.test(String(label || ''));
					return {
						...base,
						label: pageName || label,
						isPostable: isNumericPageId,
						postabilityReason: isNumericPageId ? null : 'Invalid Facebook Page ID. Reconnect Facebook to fetch real pages.',
					};
				}

				if (rawPlatform === 'twitter') {
					const username = await this.social.getTwitterUsername(label, p.accessToken);
					if (username && label !== username) {
						await this.social.updateSocialProvider(p.id, `twitter:${username}`);
						return {
							...base,
							provider: `twitter:${username}`,
							pageId: username,
							label: username,
						};
					}
					return {
						...base,
						label: username || label,
					};
				}

				return { ...base, label };
			}),
		);

		return results;
	}

	@Delete('pages/:id')
	async deletePage(@Param('id') id: string, @Headers('authorization') authorization?: string) {
		const user = await this.authService.getUserFromAuthorization(authorization);
		const account = await this.social.getAccountById(id);
		if (!account) {
			throw new UnauthorizedException('Account not found');
		}
		if (!this.authService.hasOrganizationAccess(user, (account as any).organizationId, ['owner', 'admin'])) {
			throw new ForbiddenException('You do not have permission to manage this account');
		}
		await this.social.deleteSocialAccount(id);
		return { ok: true };
	}

	@Patch('pages/:id/organization')
	async updatePageOrganization(@Param('id') id: string, @Body() body: { organizationId?: string }, @Headers('authorization') authorization?: string) {
		if (!body?.organizationId) {
			return { ok: false, error: 'organizationId is required' };
		}
		const user = await this.authService.getUserFromAuthorization(authorization);
		const account = await this.social.getAccountById(id);
		if (!account) {
			throw new UnauthorizedException('Account not found');
		}
		const canManageCurrent = this.authService.hasOrganizationAccess(user, (account as any).organizationId, ['owner', 'admin']);
		const canAssignTarget = this.authService.hasOrganizationAccess(user, body.organizationId, ['owner', 'admin']);
		if (!canManageCurrent || !canAssignTarget) {
			throw new ForbiddenException('You do not have permission to reassign this account');
		}
		await this.social.updateSocialAccountOrganization(id, body.organizationId);
		return { ok: true };
	}

	@Delete('pages')
	async deleteAllPages(@Headers('authorization') authorization?: string) {
		const user = await this.authService.getUserFromAuthorization(authorization);
		if (!user.isAdmin) {
			throw new ForbiddenException('Admin membership required');
		}
		await this.social.deleteAllSocialAccounts();
		return { ok: true };
	}

	@Post('schedule')
	async schedulePost(@Body() body: { message: string; imageUrl?: string; accounts: Array<{ platform: string; pageId: string; accessToken: string }>; scheduledTime: string }, @Res() res) {
		try {
			const scheduledTime = new Date(body.scheduledTime);
			if (scheduledTime < new Date()) {
				return res.status(400).json({ error: 'Scheduled time must be in the future' });
			}
			const post = this.scheduler.schedulePost(body.message, body.accounts, scheduledTime, body.imageUrl);
			return res.status(200).json(post);
		} catch (e) {
			this.logger.error('Error scheduling post', e as any);
			return res.status(500).json({ error: String(e) });
		}
	}

	@Get('schedule/pending')
	async getPendingPosts() {
		return this.scheduler.getPendingPosts();
	}

	@Get('schedule/all')
	async getAllScheduledPosts() {
		return this.scheduler.getScheduledPosts();
	}

	@Delete('schedule/:id')
	async deleteScheduledPost(@Param('id') id: string) {
		const deleted = this.scheduler.deleteScheduledPost(id);
		if (deleted) {
			return { ok: true };
		} else {
			return { ok: false, error: 'Post not found' };
		}
	}
}
