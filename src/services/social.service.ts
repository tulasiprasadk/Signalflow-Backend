import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SocialService {
	private readonly logger = new Logger(SocialService.name);
	private readonly encryptionKey: string | null;
	private readonly twitterStateStore = new Map<string, { codeVerifier: string; createdAt: number }>();
	private readonly memoryAccounts: Array<{ id: string; provider: string; accessToken: string }> = [];
	private readonly lastErrors: Map<string, string> = new Map();

	constructor(private config: ConfigService, private prisma: PrismaService) {}

	private getEncryptionKey(): string | null {
		const k = this.config.get<string>('TOKEN_ENCRYPTION_KEY') || this.config.get<string>('ENCRYPTION_KEY');
		if (!k) return null;
		if (k.length < 32) return null;
		return k.slice(0, 32);
	}

	private encryptToken(plain: string | null): string | null {
		if (!plain) return null;
		const key = this.getEncryptionKey();
		if (!key) return plain;
		const iv = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
		const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([iv, tag, encrypted]).toString('base64');
	}

	private decryptToken(enc: string | null): string | null {
		if (!enc) return null;
		const key = this.getEncryptionKey();
		if (!key) return enc; // no encryption configured, return raw value
		try {
			const data = Buffer.from(enc, 'base64');
			const iv = data.slice(0, 12);
			const tag = data.slice(12, 28);
			const encrypted = data.slice(28);
			const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
			decipher.setAuthTag(tag);
			const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
			return decrypted.toString('utf8');
		} catch (e) {
			this.logger.warn('Failed to decrypt token: ' + String(e));
			return null;
		}
	}

	private isDbAvailable(): boolean {
		const candidate = this.prisma as any;
		if (candidate && typeof candidate.isConnected === 'function') {
			return candidate.isConnected();
		}
		return true;
	}

	private upsertMemoryAccount(provider: string, accessToken: string) {
		if (!provider || !accessToken) return null;
		const existing = this.memoryAccounts.find((acc) => acc.provider === provider);
		if (existing) {
			existing.accessToken = accessToken;
			return existing;
		}
		const created = {
			id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			provider,
			accessToken,
		};
		this.memoryAccounts.push(created);
		return created;
	}

	private findMemoryAccount(provider: string) {
		return this.memoryAccounts.find((acc) => acc.provider === provider) || null;
	}

	private async resolveOrganizationId(organizationId?: string | null) {
		if (!this.isDbAvailable()) return organizationId || null;

		if (organizationId) {
			const existing = await this.prisma.organization.findUnique({ where: { id: organizationId } });
			if (existing) return existing.id;
		}

		let org = await this.prisma.organization.findFirst();
		if (!org) {
			org = await this.prisma.organization.create({
				data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' },
			});
		}

		return org.id;
	}

	async getFacebookOAuthUrl(state: string) {
		const clientId = this.config.get<string>('FACEBOOK_CLIENT_ID');
		const redirect =
			this.config.get<string>('FACEBOOK_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/facebook`;

		const scope = [
			'pages_show_list',
			'pages_read_engagement',
			'pages_manage_posts',
			'business_management',
			'instagram_basic',
			'instagram_content_publish',
			'public_profile',
			'email',
		].join(',');

		return `https://www.facebook.com/v16.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
			redirect,
		)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&auth_type=reauthorize`;
	}

	async handleFacebookCallback(code: string) {
		const clientId = this.config.get<string>('FACEBOOK_CLIENT_ID');
		const clientSecret = this.config.get<string>('FACEBOOK_CLIENT_SECRET');
		const redirect =
			this.config.get<string>('FACEBOOK_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/facebook`;

		// Exchange code for access token
		const tokenUrl = `https://graph.facebook.com/v16.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(
			redirect,
		)}&client_secret=${clientSecret}&code=${code}`;

		this.logger.log(`Exchanging code for token at ${tokenUrl.replace(/client_secret=[^&]+/, 'client_secret=***')}`);

		const tokenRes = await fetch(tokenUrl);
		const tokenJson: any = await tokenRes.json();

		// Optionally fetch pages/accounts for the user
		let accountsJson = null;
		try {
			if ((tokenJson as any).access_token) {
				const accountsRes = await fetch(
					`https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent((tokenJson as any).access_token)}`,
				);
				accountsJson = await accountsRes.json();
			}
		} catch (e) {
			this.logger.warn('Could not fetch Facebook accounts: ' + String(e));
		}

		return { token: tokenJson, accounts: accountsJson };
	}

	async getLinkedInOAuthUrl(state: string) {
		const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID');
		const redirect =
			this.config.get<string>('LINKEDIN_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/linkedin`;

		// Use OpenID Connect profile scope and Sign In with LinkedIn (V2) API
		// These are the most basic scopes that should be available to all apps
		const scope = ['openid', 'profile', 'email', 'w_member_social'].join(' ');

		return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
			redirect,
		)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
	}

	async handleLinkedInCallback(code: string) {
		const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID');
		const clientSecret = this.config.get<string>('LINKEDIN_CLIENT_SECRET');
		const redirect =
			this.config.get<string>('LINKEDIN_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/linkedin`;

		const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirect,
				client_id: clientId || '',
				client_secret: clientSecret || '',
			}),
		});
		const tokenJson: any = await tokenRes.json();
		if (tokenJson?.error) {
			this.logger.error(`LinkedIn token error: ${tokenJson.error} ${tokenJson.error_description || ''}`);
		}

		let profileJson: any = null;
		try {
			if (tokenJson.access_token) {
				const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
					headers: { Authorization: `Bearer ${tokenJson.access_token}` },
				});
				if (userInfoRes.ok) {
					profileJson = await userInfoRes.json();
				} else {
					const errText = await userInfoRes.text();
					this.logger.warn(`LinkedIn userinfo failed: ${userInfoRes.status} ${errText}`);
				}

				if (!profileJson?.sub) {
					const profileRes = await fetch('https://api.linkedin.com/v2/me', {
						headers: { Authorization: `Bearer ${tokenJson.access_token}` },
					});
					if (profileRes.ok) {
						profileJson = await profileRes.json();
					} else {
						const errText = await profileRes.text();
						this.logger.warn(`LinkedIn profile failed: ${profileRes.status} ${errText}`);
					}
				}
			}
		} catch (e) {
			this.logger.warn('Could not fetch LinkedIn profile: ' + String(e));
		}

		return { token: tokenJson, profile: profileJson };
	}

	private generateTwitterCodeVerifier() {
		return crypto.randomBytes(32).toString('hex');
	}

	private toBase64Url(buffer: Buffer) {
		return buffer
			.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/g, '');
	}

	private buildTwitterCodeChallenge(verifier: string) {
		const hash = crypto.createHash('sha256').update(verifier).digest();
		return this.toBase64Url(hash);
	}

	private encodeTwitterState(payload: { nonce: string; codeVerifier: string; createdAt: number }) {
		const json = JSON.stringify(payload);
		return Buffer.from(json, 'utf8').toString('base64url');
	}

	private decodeTwitterState(encodedState: string): { nonce: string; codeVerifier: string; createdAt: number } | null {
		try {
			const json = Buffer.from(encodedState, 'base64url').toString('utf8');
			const parsed = JSON.parse(json);
			if (!parsed || typeof parsed !== 'object') return null;
			const nonce = String((parsed as any).nonce || '');
			const codeVerifier = String((parsed as any).codeVerifier || '');
			const createdAt = Number((parsed as any).createdAt || 0);
			if (!nonce || !codeVerifier || !Number.isFinite(createdAt)) return null;
			return { nonce, codeVerifier, createdAt };
		} catch {
			return null;
		}
	}

	async getTwitterOAuthUrl(state: string) {
		const clientId = this.config.get<string>('TWITTER_CLIENT_ID');
		const redirect =
			this.config.get<string>('TWITTER_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/twitter`;

		const scope = [
			'tweet.read',
			'tweet.write',
			'users.read',
			'offline.access',
		].join(' ');

		const codeVerifier = this.generateTwitterCodeVerifier();
		const codeChallenge = this.buildTwitterCodeChallenge(codeVerifier);
		const createdAt = Date.now();
		const encodedState = this.encodeTwitterState({ nonce: state, codeVerifier, createdAt });
		// Keep in-memory fallback for the same process; encoded state enables recovery across restarts.
		this.twitterStateStore.set(encodedState, { codeVerifier, createdAt });
		this.twitterStateStore.set(state, { codeVerifier, createdAt });

		return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
			clientId || '',
		)}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(
			scope,
		)}&state=${encodeURIComponent(encodedState)}&code_challenge=${encodeURIComponent(
			codeChallenge,
		)}&code_challenge_method=S256`;
	}

	async handleTwitterCallback(code: string, state: string) {
		const clientId = this.config.get<string>('TWITTER_CLIENT_ID');
		const clientSecret = this.config.get<string>('TWITTER_CLIENT_SECRET');
		const redirect =
			this.config.get<string>('TWITTER_REDIRECT') ||
			`${this.config.get<string>('BACKEND_URL') || 'http://localhost:6001'}/api/social/callback/twitter`;

		let codeVerifier: string | null = null;
		const stored = this.twitterStateStore.get(state);
		if (stored?.codeVerifier) {
			codeVerifier = stored.codeVerifier;
			this.twitterStateStore.delete(state);
		}
		if (!codeVerifier) {
			const decoded = this.decodeTwitterState(state);
			if (decoded?.codeVerifier) {
				codeVerifier = decoded.codeVerifier;
			}
		}
		if (!codeVerifier) throw new Error('Invalid or expired Twitter state');

		const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				...(clientSecret
					? {
							Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
					  }
					: {}),
			},
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirect,
				client_id: clientId || '',
				code_verifier: codeVerifier,
			}),
		});
		const tokenJson: any = await tokenRes.json();
		if (tokenJson?.error) {
			this.logger.error(`Twitter token error: ${tokenJson.error} ${tokenJson.error_description || ''}`);
			throw new Error(`Twitter token error: ${tokenJson.error}`);
		}
		if (!tokenJson?.access_token) {
			throw new Error('Twitter token missing access_token');
		}

		let userJson: any = null;
		try {
			const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
				headers: { Authorization: `Bearer ${tokenJson.access_token}` },
			});
			if (!userRes.ok) {
				const errText = await userRes.text();
				this.logger.warn(`Twitter user lookup failed: ${userRes.status} ${errText}`);
			} else {
				userJson = await userRes.json();
			}
		} catch (e) {
			this.logger.warn('Could not fetch Twitter user: ' + String(e));
		}

		return { token: tokenJson, user: userJson };
	}

	async persistTwitterAccount(userJson: any, token: any, organizationId?: string | null, accountLabel?: string | null) {
		const user = userJson?.data;
		const accessToken = token?.access_token || token?.accessToken || null;
		const refreshToken = token?.refresh_token || token?.refreshToken || null;
		const expiresAt =
			Number.isFinite(Number(token?.expires_in))
				? new Date(Date.now() + Number(token.expires_in) * 1000)
				: null;
		if (!accessToken) return null;

		const normalizedLabel = String(accountLabel || '').trim().replace(/^@+/, '');
		const username = user?.username || user?.name || normalizedLabel || null;
		const providerKey = user?.id ? `twitter:${username || user.id}` : `twitter:${username || `account_${Date.now()}`}`;
		const legacyKey = user?.id ? `twitter:${user.id}` : providerKey;

		if (!this.isDbAvailable()) {
			return this.upsertMemoryAccount(providerKey, accessToken) || this.upsertMemoryAccount(legacyKey, accessToken);
		}

		const targetOrganizationId = await this.resolveOrganizationId(organizationId);
		const candidateProviders = Array.from(
			new Set([providerKey, legacyKey, normalizedLabel ? `twitter:${normalizedLabel}` : ''].filter(Boolean)),
		);

		const existing = await this.prisma.socialAccount.findFirst({
			where: { provider: { in: candidateProviders } },
		});
		if (existing) {
			return this.prisma.socialAccount.update({
				where: { id: existing.id },
				data: {
					accessToken: this.encryptToken(accessToken) || accessToken,
					refreshToken: this.encryptToken(refreshToken) || refreshToken,
					expiresAt,
					provider: providerKey,
					organizationId: targetOrganizationId || existing.organizationId,
				},
			});
		}

		return this.prisma.socialAccount.create({
			data: {
				provider: providerKey,
				accessToken: this.encryptToken(accessToken) || accessToken,
				refreshToken: this.encryptToken(refreshToken) || refreshToken,
				expiresAt,
				organizationId: targetOrganizationId!,
			},
		});
	}

	async persistLinkedInAccount(profileJson: any, accessToken: string, organizationId?: string | null) {
		const memberId = profileJson?.id || profileJson?.sub;
		if (!memberId || !accessToken) return null;

		const providerKey = `linkedin:${memberId}`;
		if (!this.isDbAvailable()) {
			return this.upsertMemoryAccount(providerKey, accessToken);
		}

		const targetOrganizationId = await this.resolveOrganizationId(organizationId);

		const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
		if (existing) {
			return this.prisma.socialAccount.update({
				where: { id: existing.id },
				data: { accessToken, organizationId: targetOrganizationId || existing.organizationId },
			});
		}

		return this.prisma.socialAccount.create({
			data: { provider: providerKey, accessToken, organizationId: targetOrganizationId! },
		});
	}

	async getLinkedInOrganizations(accessToken: string) {
		const res = await fetch(
			'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
			{
				headers: { Authorization: `Bearer ${accessToken}` },
			},
		);
		const json: any = await res.json();
		if (!res.ok) {
			this.logger.warn(`LinkedIn orgs API error (${res.status}): ${JSON.stringify(json)}`);
		}
		const elements = Array.isArray(json?.elements) ? json.elements : [];
		const orgIds = elements
			.map((item: any) => String(item?.organization || ''))
			.filter(Boolean)
			.map((urn: string) => urn.split(':').pop())
			.filter(Boolean);
		if (orgIds.length > 0) {
			this.logger.log(`LinkedIn organizations found: ${orgIds.join(', ')}`);
		} else {
			this.logger.warn(`No LinkedIn organizations found with ADMINISTRATOR role. Elements: ${JSON.stringify(elements)}`);
		}
		return orgIds;
	}

	async persistLinkedInOrganizations(orgIds: string[], accessToken: string, organizationId?: string | null) {
		if (!orgIds || orgIds.length === 0 || !accessToken) return [];

		if (!this.isDbAvailable()) {
			return orgIds
				.map((orgId) => this.upsertMemoryAccount(`linkedin_org:${orgId}`, accessToken))
				.filter(Boolean) as any[];
		}

		const targetOrganizationId = await this.resolveOrganizationId(organizationId);

		const saved: any[] = [];
		for (const orgId of orgIds) {
			const providerKey = `linkedin_org:${orgId}`;
			const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
			if (existing) {
				const updated = await this.prisma.socialAccount.update({
					where: { id: existing.id },
					data: { accessToken, organizationId: targetOrganizationId || existing.organizationId },
				});
				saved.push(updated);
				continue;
			}

			const created = await this.prisma.socialAccount.create({
				data: { provider: providerKey, accessToken, organizationId: targetOrganizationId! },
			});
			saved.push(created);
		}

		return saved;
	}

	/** Persist fetched Facebook pages as SocialAccount entries. Creates a fallback Organization if none exists. */
	async persistFacebookPages(accountsJson: any, organizationId?: string | null) {
		if (!accountsJson || !accountsJson.data) return [];

		if (!this.isDbAvailable()) {
			const saved: any[] = [];
			for (const page of accountsJson.data) {
				const pageId = page.id;
				const accessToken = page.access_token || page.accessToken || null;
				if (!accessToken) continue;
				const record = this.upsertMemoryAccount(pageId, accessToken);
				if (record) saved.push(record);
			}
			return saved;
		}

		const targetOrganizationId = await this.resolveOrganizationId(organizationId);

		const saved: any[] = [];
		for (const page of accountsJson.data) {
			const pageId = page.id;
			const accessToken = page.access_token || page.accessToken || null;

			if (!accessToken) continue;

			// Upsert by provider==pageId (simple approach for MVP)
			const record = await this.prisma.socialAccount.upsert({
				where: { id: undefined as any },
				// prisma requires a unique field for upsert; SocialAccount.id is primary but we don't have it.
				// Use a findFirst+update/create fallback instead.
				create: {
					provider: pageId,
					accessToken,
					organizationId: targetOrganizationId!,
				},
				update: {
					accessToken,
					organizationId: targetOrganizationId!,
				},
			}).catch(async () => {
				// Fallback: try findFirst then update or create
				const existing = await this.prisma.socialAccount.findFirst({ where: { provider: pageId } });
				if (existing) {
					return this.prisma.socialAccount.update({
						where: { id: existing.id },
						data: { accessToken, organizationId: targetOrganizationId || existing.organizationId },
					});
				}
				return this.prisma.socialAccount.create({
					data: { provider: pageId, accessToken, organizationId: targetOrganizationId! },
				});
			});

			saved.push(record);
		}

		return saved;
	}

	/** Persist Unsplash OAuth token as a SocialAccount (provider: unsplash:<username> or unsplash) */
	async persistUnsplashAccount(tokenJson: any) {
		if (!tokenJson || !tokenJson.access_token) return null;

		const accessToken = tokenJson.access_token;
		const refreshToken = tokenJson.refresh_token || null;
		const expiresAt = tokenJson.created_at ? new Date(tokenJson.created_at * 1000) : null;
		const username = tokenJson.username || tokenJson.username || null;

		const providerKey = username ? `unsplash:${username}` : 'unsplash';

		if (!this.isDbAvailable()) {
			return this.upsertMemoryAccount(providerKey, accessToken);
		}

		let org = await this.prisma.organization.findFirst();
		if (!org) {
			org = await this.prisma.organization.create({ data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' } });
		}

		const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
		if (existing) {
				return this.prisma.socialAccount.update({ where: { id: existing.id }, data: { accessToken: this.encryptToken(accessToken), refreshToken: this.encryptToken(refreshToken), expiresAt } });
		}

				return this.prisma.socialAccount.create({ data: { provider: providerKey, accessToken: this.encryptToken(accessToken), refreshToken: this.encryptToken(refreshToken), expiresAt, organizationId: org.id } });
	}

	/** Refresh an existing stored Unsplash account using its refresh token */
	async refreshUnsplashAccount(account: any) {
		if (!account || !account.refreshToken) return null;
		const clientId = this.config.get<string>('UNSPLASH_CLIENT_ID') || this.config.get<string>('UNSPLASH_ACCESS_KEY');
		const clientSecret = this.config.get<string>('UNSPLASH_CLIENT_SECRET');
		if (!clientId || !clientSecret) throw new Error('Unsplash client not configured');

		const refreshTokenPlain = this.decryptToken(account.refreshToken) || account.refreshToken;

		const params = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: 'refresh_token',
			refresh_token: refreshTokenPlain,
		});

		const tokenRes = await fetch('https://unsplash.com/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
		});
		const tokenJson: any = await tokenRes.json();
		if (!tokenJson?.access_token) {
			this.logger.warn('Unsplash refresh returned no access_token: ' + JSON.stringify(tokenJson));
			return null;
		}

		const accessToken = tokenJson.access_token;
		const refreshToken = tokenJson.refresh_token || refreshTokenPlain;
		const expiresAt = tokenJson.created_at ? new Date(tokenJson.created_at * 1000) : null;

		if (!this.isDbAvailable()) {
			return this.upsertMemoryAccount(account.provider || 'unsplash', accessToken);
		}

		try {
			return await this.prisma.socialAccount.update({
				where: { id: account.id },
				data: { accessToken: this.encryptToken(accessToken), refreshToken: this.encryptToken(refreshToken), expiresAt },
			});
		} catch (e) {
			this.logger.warn('Failed to update Unsplash account after refresh: ' + String(e));
			return null;
		}
	}

	/** Generic refresh handler for stored social accounts (supports Unsplash, Twitter, LinkedIn, Facebook) */
	async refreshSocialAccount(account: any) {
		if (!account) return null;
		const provider: string = account.provider || '';
		try {
			let updated = null as any;
			if (provider.startsWith('unsplash')) updated = await this.refreshUnsplashAccount(account);
			else if (provider.startsWith('twitter')) updated = await this.refreshTwitterAccount(account);
			else if (provider.startsWith('linkedin')) updated = await this.refreshLinkedInAccount(account);
			else if (!provider.includes(':')) updated = await this.refreshFacebookAccount(account); // facebook pages stored as plain id
			else {
				this.logger.warn('No refresh implementation for provider: ' + provider);
			}
			if (!updated) {
				const key = account.id || account.provider || 'unknown';
				const msg = `No update from refresh for ${provider}`;
				this.lastErrors.set(key, msg);
				if (this.isDbAvailable() && account.id) {
					try {
						await this.prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: msg } as any });
					} catch (e) {
						this.logger.warn('Could not persist lastError to DB: ' + String(e));
					}
				}
			} else {
				const key = account.id || account.provider || 'unknown';
				this.lastErrors.delete(key);
				if (this.isDbAvailable() && account.id) {
					try {
						await this.prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: null } as any });
					} catch (e) {
						this.logger.warn('Could not clear lastError in DB: ' + String(e));
					}
				}
			}
			return updated;
		} catch (e) {
			this.logger.warn('refreshSocialAccount failed for ' + provider + ': ' + String(e));
			const key = account.id || account.provider || 'unknown';
			this.lastErrors.set(key, String(e));
			if (this.isDbAvailable() && account.id) {
				try {
					await this.prisma.socialAccount.update({ where: { id: account.id }, data: { lastError: String(e) } as any });
				} catch (err) {
					this.logger.warn('Could not persist lastError to DB: ' + String(err));
				}
			}
			return null;
		}
	}

	private async refreshTwitterAccount(account: any) {
		if (!account || !account.refreshToken) return null;
		const clientId = this.config.get<string>('TWITTER_CLIENT_ID');
		const clientSecret = this.config.get<string>('TWITTER_CLIENT_SECRET');
		if (!clientId) throw new Error('Twitter client_id not configured');

		const refreshTokenPlain = this.decryptToken(account.refreshToken) || account.refreshToken;

		const params = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshTokenPlain,
			client_id: clientId,
		});

		const headers: any = { 'Content-Type': 'application/x-www-form-urlencoded' };
		if (clientSecret) {
			headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
		}

		const res = await fetch('https://api.twitter.com/2/oauth2/token', { method: 'POST', headers, body: params.toString() });
		const json: any = await res.json();
		if (!json?.access_token) {
			this.logger.warn('Twitter refresh returned no access_token: ' + JSON.stringify(json));
			return null;
		}

		const accessToken = json.access_token;
		const refreshToken = json.refresh_token || refreshTokenPlain;

		try {
			return await this.prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken: this.encryptToken(accessToken), refreshToken: this.encryptToken(refreshToken) } });
		} catch (e) {
			this.logger.warn('Failed to update Twitter account after refresh: ' + String(e));
			return null;
		}
	}

	private async refreshLinkedInAccount(account: any) {
		if (!account || !account.refreshToken) return null;
		const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID');
		const clientSecret = this.config.get<string>('LINKEDIN_CLIENT_SECRET');
		if (!clientId || !clientSecret) throw new Error('LinkedIn client not configured');

		const refreshTokenPlain = this.decryptToken(account.refreshToken) || account.refreshToken;

		const params = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshTokenPlain,
			client_id: clientId,
			client_secret: clientSecret,
		});

		const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
		const json: any = await res.json();
		if (!json?.access_token) {
			this.logger.warn('LinkedIn refresh returned no access_token: ' + JSON.stringify(json));
			return null;
		}

		const accessToken = json.access_token;
		const refreshToken = json.refresh_token || refreshTokenPlain;

		try {
			return await this.prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken: this.encryptToken(accessToken), refreshToken: this.encryptToken(refreshToken) } });
		} catch (e) {
			this.logger.warn('Failed to update LinkedIn account after refresh: ' + String(e));
			return null;
		}
	}

	private async refreshFacebookAccount(account: any) {
		// Facebook handles token long-lived exchange. If we have an access token, try exchange.
		const clientId = this.config.get<string>('FACEBOOK_CLIENT_ID');
		const clientSecret = this.config.get<string>('FACEBOOK_CLIENT_SECRET');
		if (!clientId || !clientSecret) return null;

		const accessTokenPlain = this.decryptToken(account.accessToken) || account.accessToken;
		if (!accessTokenPlain) return null;

		const url = `https://graph.facebook.com/v16.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
			clientId,
		)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(accessTokenPlain)}`;

		const res = await fetch(url);
		const json: any = await res.json();
		if (!json?.access_token) {
			this.logger.warn('Facebook exchange returned no access_token: ' + JSON.stringify(json));
			return null;
		}

		const accessToken = json.access_token;

		try {
			return await this.prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken: this.encryptToken(accessToken) } });
		} catch (e) {
			this.logger.warn('Failed to update Facebook account after exchange: ' + String(e));
			return null;
		}
	}

	/** Sync Instagram business accounts for stored Facebook pages */
	async syncInstagramAccountsFromFacebookPages(organizationId?: string | null) {
		const pages = this.isDbAvailable()
			? await this.prisma.socialAccount.findMany()
			: this.memoryAccounts;
		const facebookPages = pages.filter(p => !p.provider.includes(':'));

		if (facebookPages.length === 0) return [];

		const targetOrganizationId = this.isDbAvailable() ? await this.resolveOrganizationId(organizationId) : null;

		const saved: any[] = [];
		for (const page of facebookPages) {
			const pageId = page.provider;
			const accessToken = page.accessToken;
			try {
				const res = await fetch(
					`https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(
						accessToken,
					)}`,
				);
				const json: any = await res.json();
				const igId = json?.instagram_business_account?.id || json?.connected_instagram_account?.id;
				if (!igId) continue;

				const providerKey = `instagram:${igId}`;
				if (!this.isDbAvailable()) {
					const record = this.upsertMemoryAccount(providerKey, accessToken);
					if (record) saved.push(record);
					continue;
				}
				const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
				if (existing) {
					const updated = await this.prisma.socialAccount.update({
						where: { id: existing.id },
						data: { accessToken, organizationId: targetOrganizationId || existing.organizationId },
					});
					saved.push(updated);
				} else if (targetOrganizationId) {
					const created = await this.prisma.socialAccount.create({
						data: { provider: providerKey, accessToken, organizationId: targetOrganizationId },
					});
					saved.push(created);
				}
			} catch (e) {
				this.logger.warn(`Could not fetch Instagram account for page ${pageId}: ${String(e)}`);
			}
		}

		return saved;
	}

	async debugInstagramAccountsFromFacebookPages() {
		const pages = this.isDbAvailable()
			? await this.prisma.socialAccount.findMany()
			: this.memoryAccounts;
		const facebookPages = pages.filter(p => !p.provider.includes(':'));

		const results: any[] = [];
		for (const page of facebookPages) {
			const pageId = page.provider;
			const accessToken = page.accessToken;
			try {
				const res = await fetch(
					`https://graph.facebook.com/v18.0/${pageId}?fields=name,instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(
						accessToken,
					)}`,
				);
				const json: any = await res.json();
				results.push({ pageId, name: json?.name || null, data: json });
			} catch (e) {
				results.push({ pageId, error: String(e) });
			}
		}

		return results;
	}

	async getStoredPages() {
		if (!this.isDbAvailable()) return this.memoryAccounts;
		const pages = await this.prisma.socialAccount.findMany({
			include: {
				organization: {
					select: { id: true, name: true },
				},
			},
		});
		return pages.map((p: any) => ({
			...p,
			accessToken: p.accessToken ? this.decryptToken(p.accessToken) || p.accessToken : p.accessToken,
			refreshToken: p.refreshToken ? this.decryptToken(p.refreshToken) || p.refreshToken : p.refreshToken,
		}));
	}

	/** Return the first Unsplash stored account with decrypted tokens */
	async getUnsplashAccount() {
		if (!this.isDbAvailable()) return this.findMemoryAccount('unsplash');
		const acc = await this.prisma.socialAccount.findFirst({ where: { provider: { startsWith: 'unsplash' } } });
		if (!acc) return null;
		const accessToken = acc.accessToken ? this.decryptToken(acc.accessToken) || acc.accessToken : null;
		const refreshToken = acc.refreshToken ? this.decryptToken(acc.refreshToken) || acc.refreshToken : null;
		return { ...acc, accessToken, refreshToken };
	}

	/** Return a single stored social account by id with decrypted tokens */
	async getAccountById(id: string) {
		if (!id) return null;
		if (!this.isDbAvailable()) return this.findMemoryAccount(id);
		const acc = await this.prisma.socialAccount.findUnique({ where: { id } });
		if (!acc) return null;
		const accessToken = acc.accessToken ? this.decryptToken(acc.accessToken) || acc.accessToken : null;
		const refreshToken = acc.refreshToken ? this.decryptToken(acc.refreshToken) || acc.refreshToken : null;
		const lastError = this.lastErrors.get(acc.id) || null;
		return { ...acc, accessToken, refreshToken, lastError };
	}

	getLastError(id: string) {
		return this.lastErrors.get(id) || null;
	}

	async deleteSocialAccount(id: string) {
		if (!id) return null;
		if (!this.isDbAvailable()) {
			const index = this.memoryAccounts.findIndex((acc) => acc.id === id);
			if (index >= 0) this.memoryAccounts.splice(index, 1);
			return { ok: true } as any;
		}
		return this.prisma.socialAccount.delete({ where: { id } });
	}

	async deleteAllSocialAccounts() {
		if (!this.isDbAvailable()) {
			this.memoryAccounts.splice(0, this.memoryAccounts.length);
			return { count: 0 } as any;
		}
		return this.prisma.socialAccount.deleteMany();
	}

	/** Publish a text + image post to a Facebook page using stored page token */
	async publishToFacebookPage(pageId: string, message: string, manualToken?: string, imageUrl?: string) {
		const normalizedPageId = String(pageId || '').startsWith('facebook:')
			? String(pageId).slice('facebook:'.length)
			: String(pageId || '');
		// Use manual token if provided, otherwise find stored account
		let accessToken = manualToken;
		
		if (!accessToken) {
			const account = this.isDbAvailable()
				? await this.prisma.socialAccount.findFirst({
						where: {
							OR: [
								{ provider: pageId },
								{ provider: normalizedPageId },
								{ provider: `facebook:${normalizedPageId}` },
							],
						},
					})
				: this.findMemoryAccount(pageId) || this.findMemoryAccount(normalizedPageId) || this.findMemoryAccount(`facebook:${normalizedPageId}`);
			if (!account) throw new Error('No stored page token for page ' + pageId + '. Please provide accessToken or connect via OAuth.');
			accessToken = account.accessToken;
		}

		// If a user token is provided, try exchanging it for a page token
		if (manualToken) {
			try {
				const pageTokenRes = await fetch(
					`https://graph.facebook.com/${normalizedPageId}?fields=access_token&access_token=${encodeURIComponent(manualToken)}`,
				);
				const pageTokenJson: any = await pageTokenRes.json();
				if (pageTokenJson?.access_token) {
					accessToken = pageTokenJson.access_token;
				}
			} catch (e) {
				this.logger.warn(`Could not exchange user token for page token: ${String(e)}`);
			}
		}

		// If image provided, post as photo
		if (imageUrl) {
			const photoUrl = `https://graph.facebook.com/${normalizedPageId}/photos`;
			const res = await fetch(photoUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					url: imageUrl,
					caption: message,
					access_token: accessToken,
				}),
			});
			const json = await res.json();
			if (json.error) {
				throw new Error(`Facebook API Error: ${json.error.message || JSON.stringify(json.error)}`);
			}
			return json;
		}

		// Fallback to text-only post
		const postUrl = `https://graph.facebook.com/${normalizedPageId}/feed`;
		const res = await fetch(postUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ message, access_token: accessToken }),
		});
		const json = await res.json();
		if (json.error) {
			throw new Error(`Facebook API Error: ${json.error.message || JSON.stringify(json.error)}`);
		}
		return json;
	}

	/** Publish a text post to a LinkedIn member profile */
	async publishToLinkedInMember(providerKey: string, message: string) {
		const normalizedKey = providerKey.startsWith('linkedin:') ? providerKey : `linkedin:${providerKey}`;
		const account = this.isDbAvailable()
			? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
			: this.findMemoryAccount(normalizedKey);
		if (!account) throw new Error('No stored LinkedIn token for ' + providerKey);

		const memberId = normalizedKey.replace('linkedin:', '');
		const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${account.accessToken}`,
				'Content-Type': 'application/json',
				'X-Restli-Protocol-Version': '2.0.0',
			},
			body: JSON.stringify({
				author: `urn:li:person:${memberId}`,
				lifecycleState: 'PUBLISHED',
				specificContent: {
					'com.linkedin.ugc.ShareContent': {
						shareCommentary: { text: message },
						shareMediaCategory: 'NONE',
					},
				},
				visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
			}),
		});
		const json = await res.json().catch(() => ({}));
		if (!res.ok || (json && (json.error || json.message || json.serviceErrorCode))) {
			const errMsg = json?.message || json?.error?.message || JSON.stringify(json);
			throw new Error(`LinkedIn API Error (${res.status}): ${errMsg}`);
		}
		return json;
	}

	/** Publish a text post to a LinkedIn organization page */
	async publishToLinkedInOrganization(providerKey: string, message: string) {
		const normalizedKey = providerKey.startsWith('linkedin_org:') ? providerKey : `linkedin_org:${providerKey}`;
		const account = this.isDbAvailable()
			? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
			: this.findMemoryAccount(normalizedKey);
		if (!account) throw new Error('No stored LinkedIn org token for ' + providerKey);

		const orgId = normalizedKey.replace('linkedin_org:', '');
		const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${account.accessToken}`,
				'Content-Type': 'application/json',
				'X-Restli-Protocol-Version': '2.0.0',
			},
			body: JSON.stringify({
				author: `urn:li:organization:${orgId}`,
				lifecycleState: 'PUBLISHED',
				specificContent: {
					'com.linkedin.ugc.ShareContent': {
						shareCommentary: { text: message },
						shareMediaCategory: 'NONE',
					},
				},
				visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
			}),
		});
		const json = await res.json().catch(() => ({}));
		if (!res.ok || (json && (json.error || json.message || json.serviceErrorCode))) {
			const errMsg = json?.message || json?.error?.message || JSON.stringify(json);
			throw new Error(`LinkedIn API Error (${res.status}): ${errMsg}`);
		}
		return json;
	}

	/** Publish a text post to a Twitter/X profile */
	async publishToTwitterUser(providerKey: string, message: string, manualToken?: string) {
		const normalizedKey = providerKey.startsWith('twitter:') ? providerKey : `twitter:${providerKey}`;
		let accessToken = manualToken;
		let account: any = null;
		if (!accessToken) {
			account = this.isDbAvailable()
				? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
				: this.findMemoryAccount(normalizedKey);
			if (!account) {
				account = this.isDbAvailable()
					? await this.prisma.socialAccount.findFirst({ where: { provider: { startsWith: 'twitter:' } } })
					: this.memoryAccounts.find((acc) => acc.provider.startsWith('twitter:')) || null;
			}
			if (!account) throw new Error('No stored Twitter token for ' + providerKey);
			accessToken = this.decryptToken(account.accessToken) || account.accessToken;
		}

		const postTweet = async (tokenToUse: string) => {
			const res = await fetch('https://api.twitter.com/2/tweets', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${tokenToUse}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: message }),
			});
			const json = await res.json().catch(() => ({}));
			return { res, json };
		};

		let { res, json } = await postTweet(accessToken || '');
		if (res.status === 401 && account && account.refreshToken) {
			const refreshed = await this.refreshTwitterAccount(account);
			if (refreshed?.accessToken) {
				accessToken = this.decryptToken(refreshed.accessToken) || refreshed.accessToken;
				const retry = await postTweet(accessToken || '');
				res = retry.res;
				json = retry.json;
			}
		}

		if (!res.ok || (json && json.errors)) {
			const errMsg = json?.errors?.[0]?.message || json?.detail || JSON.stringify(json);
			const errorDetails = {
				status: res.status,
				message: errMsg,
				fullResponse: json,
			};
			this.logger.error(`Twitter API Error: ${JSON.stringify(errorDetails)}`);
			
			// Provide helpful error messages for common issues
			if (res.status === 403) {
				throw new Error(`Twitter API Error: Access forbidden. Please ensure your Twitter App has "Read and Write" permissions and elevated access. You may need to regenerate your access tokens after changing app permissions. Details: ${errMsg}`);
			}
			throw new Error(`Twitter API Error (${res.status}): ${errMsg}`);
		}
		return json;
	}

	/** Publish an Instagram post using the Graph API (requires image) */
	async publishToInstagramAccount(providerKey: string, message: string, imageUrl?: string, manualToken?: string) {
		const normalizedKey = providerKey.startsWith('instagram:') ? providerKey : `instagram:${providerKey}`;
		let accessToken = manualToken;
		if (!accessToken) {
			const account = this.isDbAvailable()
				? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
				: this.findMemoryAccount(normalizedKey);
			if (!account) throw new Error('No stored Instagram token for ' + providerKey);
			accessToken = account.accessToken;
		}
		if (!imageUrl) throw new Error('Instagram requires an image URL');

		const igUserId = normalizedKey.replace('instagram:', '');
		this.logger.log(`Creating Instagram media for ${igUserId} with image: ${imageUrl}`);
		const createRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				image_url: imageUrl,
				caption: message,
				access_token: accessToken,
			}),
		});
		const createJson: any = await createRes.json();
		this.logger.log(`Instagram media create response: ${JSON.stringify(createJson)}`);
		if (!createJson?.id) {
			this.logger.error(`Failed to create Instagram media. Response: ${JSON.stringify(createJson)}`);
			throw new Error(`Failed to create Instagram media: ${JSON.stringify(createJson.error || createJson)}`);
		}

		this.logger.log(`Publishing Instagram media ${createJson.id}`);
		const publishRes = await fetch(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				creation_id: createJson.id,
				access_token: accessToken,
			}),
		});
		const publishJson = await publishRes.json();
		this.logger.log(`Instagram media publish response: ${JSON.stringify(publishJson)}`);
		if (publishJson.error) {
			this.logger.error(`Failed to publish Instagram media. Error: ${JSON.stringify(publishJson.error)}`);
		}
		return publishJson;
	}

	async getInstagramUsername(instagramId: string, accessToken: string) {
		try {
			const res = await fetch(
				`https://graph.facebook.com/v18.0/${instagramId}?fields=username&access_token=${encodeURIComponent(
					accessToken,
				)}`,
			);
			const json: any = await res.json();
			return json?.username || null;
		} catch (e) {
			this.logger.warn(`Could not fetch Instagram username for ${instagramId}: ${String(e)}`);
			return null;
		}
	}

	async getFacebookPageName(pageId: string, accessToken: string) {
		try {
			const res = await fetch(
				`https://graph.facebook.com/v18.0/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`,
			);
			const json: any = await res.json();
			return json?.name || null;
		} catch (e) {
			this.logger.warn(`Could not fetch Facebook page name for ${pageId}: ${String(e)}`);
			return null;
		}
	}

	async getTwitterUsername(userId: string, accessToken: string) {
		try {
			const res = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const json: any = await res.json();
			if (json?.data?.username) return json.data.username;
			if (json?.data?.name) return json.data.name;
		} catch (e) {
			this.logger.warn(`Could not fetch Twitter username for ${userId}: ${String(e)}`);
		}

		try {
			const res = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=username`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const json: any = await res.json();
			return json?.data?.username || json?.data?.name || null;
		} catch (e) {
			this.logger.warn(`Could not fetch Twitter username for ${userId}: ${String(e)}`);
			return null;
		}
	}

	async getLinkedInDisplayName(memberId: string, accessToken: string) {
		try {
			const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (userInfoRes.ok) {
				const userInfoJson: any = await userInfoRes.json();
				const fullName = String(userInfoJson?.name || '').trim();
				if (fullName) return fullName;
				const email = String(userInfoJson?.email || '').trim();
				if (email) return email;
				const given = String(userInfoJson?.given_name || '').trim();
				const family = String(userInfoJson?.family_name || '').trim();
				const composed = `${given} ${family}`.trim();
				if (composed) return composed;
			}
		} catch (e) {
			this.logger.warn(`Could not fetch LinkedIn userinfo for ${memberId}: ${String(e)}`);
		}

		try {
			const profileRes = await fetch('https://api.linkedin.com/v2/me', {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			if (!profileRes.ok) return null;
			const profileJson: any = await profileRes.json();
			const localizedFirst = profileJson?.localizedFirstName || '';
			const localizedLast = profileJson?.localizedLastName || '';
			const localizedName = `${localizedFirst} ${localizedLast}`.trim();
			if (localizedName) return localizedName;
		} catch (e) {
			this.logger.warn(`Could not fetch LinkedIn profile for ${memberId}: ${String(e)}`);
		}

		return null;
	}

	async getAllAccounts() {
		if (!this.isDbAvailable()) {
			return this.memoryAccounts;
		}
		return this.prisma.socialAccount.findMany();
	}

	async updateSocialProvider(id: string, provider: string) {
		if (!this.isDbAvailable()) {
			const account = this.memoryAccounts.find((acc) => acc.id === id);
			if (account) account.provider = provider;
			return account;
		}
		return this.prisma.socialAccount.update({ where: { id }, data: { provider } });
	}

	async updateSocialAccountOrganization(id: string, organizationId: string) {
		if (!this.isDbAvailable()) {
			const account = this.memoryAccounts.find((acc) => acc.id === id);
			if (account) (account as any).organizationId = organizationId;
			return account;
		}
		return this.prisma.socialAccount.update({ where: { id }, data: { organizationId } });
	}

	/** Update access token for an existing social account identified by provider or id */
	async updateAccessToken(providerOrId: string, accessToken: string) {
		if (!this.isDbAvailable()) {
			const account = this.memoryAccounts.find((acc) => acc.id === providerOrId || acc.provider === providerOrId);
			if (account) {
				account.accessToken = accessToken;
				return account;
			}
			throw new Error('No in-memory account found for ' + providerOrId);
		}

		// Try find by provider first
		let account = await this.prisma.socialAccount.findFirst({ where: { provider: providerOrId } });
		if (!account) {
			// try by id
			account = await this.prisma.socialAccount.findUnique({ where: { id: providerOrId } });
		}
		if (!account) throw new Error('No stored social account found for ' + providerOrId);
		return this.prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken } });
	}
}
