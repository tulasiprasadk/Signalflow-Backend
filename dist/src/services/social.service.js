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
var SocialService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialService = void 0;
const common_1 = require("@nestjs/common");
const crypto = require("crypto");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
let SocialService = SocialService_1 = class SocialService {
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
        this.logger = new common_1.Logger(SocialService_1.name);
        this.twitterStateStore = new Map();
        this.memoryAccounts = [];
    }
    isDbAvailable() {
        const candidate = this.prisma;
        if (candidate && typeof candidate.isConnected === 'function') {
            return candidate.isConnected();
        }
        return true;
    }
    upsertMemoryAccount(provider, accessToken) {
        if (!provider || !accessToken)
            return null;
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
    findMemoryAccount(provider) {
        return this.memoryAccounts.find((acc) => acc.provider === provider) || null;
    }
    async getFacebookOAuthUrl(state) {
        const clientId = this.config.get('FACEBOOK_CLIENT_ID');
        const redirect = this.config.get('FACEBOOK_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/facebook`;
        const scope = [
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts',
            'instagram_basic',
            'instagram_content_publish',
            'public_profile',
            'email',
        ].join(',');
        return `https://www.facebook.com/v16.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&auth_type=reauthorize`;
    }
    async handleFacebookCallback(code) {
        const clientId = this.config.get('FACEBOOK_CLIENT_ID');
        const clientSecret = this.config.get('FACEBOOK_CLIENT_SECRET');
        const redirect = this.config.get('FACEBOOK_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/facebook`;
        const tokenUrl = `https://graph.facebook.com/v16.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&client_secret=${clientSecret}&code=${code}`;
        this.logger.log(`Exchanging code for token at ${tokenUrl.replace(/client_secret=[^&]+/, 'client_secret=***')}`);
        const tokenRes = await fetch(tokenUrl);
        const tokenJson = await tokenRes.json();
        let accountsJson = null;
        try {
            if (tokenJson.access_token) {
                const accountsRes = await fetch(`https://graph.facebook.com/me/accounts?access_token=${encodeURIComponent(tokenJson.access_token)}`);
                accountsJson = await accountsRes.json();
            }
        }
        catch (e) {
            this.logger.warn('Could not fetch Facebook accounts: ' + String(e));
        }
        return { token: tokenJson, accounts: accountsJson };
    }
    async getLinkedInOAuthUrl(state) {
        const clientId = this.config.get('LINKEDIN_CLIENT_ID');
        const redirect = this.config.get('LINKEDIN_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/linkedin`;
        const scope = ['openid', 'profile', 'email', 'w_member_social'].join(' ');
        return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
    }
    async handleLinkedInCallback(code) {
        const clientId = this.config.get('LINKEDIN_CLIENT_ID');
        const clientSecret = this.config.get('LINKEDIN_CLIENT_SECRET');
        const redirect = this.config.get('LINKEDIN_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/linkedin`;
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
        const tokenJson = await tokenRes.json();
        if (tokenJson === null || tokenJson === void 0 ? void 0 : tokenJson.error) {
            this.logger.error(`LinkedIn token error: ${tokenJson.error} ${tokenJson.error_description || ''}`);
        }
        let profileJson = null;
        try {
            if (tokenJson.access_token) {
                const userInfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
                    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
                });
                if (userInfoRes.ok) {
                    profileJson = await userInfoRes.json();
                }
                else {
                    const errText = await userInfoRes.text();
                    this.logger.warn(`LinkedIn userinfo failed: ${userInfoRes.status} ${errText}`);
                }
                if (!(profileJson === null || profileJson === void 0 ? void 0 : profileJson.sub)) {
                    const profileRes = await fetch('https://api.linkedin.com/v2/me', {
                        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
                    });
                    if (profileRes.ok) {
                        profileJson = await profileRes.json();
                    }
                    else {
                        const errText = await profileRes.text();
                        this.logger.warn(`LinkedIn profile failed: ${profileRes.status} ${errText}`);
                    }
                }
            }
        }
        catch (e) {
            this.logger.warn('Could not fetch LinkedIn profile: ' + String(e));
        }
        return { token: tokenJson, profile: profileJson };
    }
    generateTwitterCodeVerifier() {
        return crypto.randomBytes(32).toString('hex');
    }
    toBase64Url(buffer) {
        return buffer
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }
    buildTwitterCodeChallenge(verifier) {
        const hash = crypto.createHash('sha256').update(verifier).digest();
        return this.toBase64Url(hash);
    }
    async getTwitterOAuthUrl(state) {
        const clientId = this.config.get('TWITTER_CLIENT_ID');
        const redirect = this.config.get('TWITTER_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/twitter`;
        const scope = [
            'tweet.read',
            'tweet.write',
            'users.read',
            'offline.access',
        ].join(' ');
        const codeVerifier = this.generateTwitterCodeVerifier();
        const codeChallenge = this.buildTwitterCodeChallenge(codeVerifier);
        this.twitterStateStore.set(state, { codeVerifier, createdAt: Date.now() });
        return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId || '')}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
    }
    async handleTwitterCallback(code, state) {
        const clientId = this.config.get('TWITTER_CLIENT_ID');
        const clientSecret = this.config.get('TWITTER_CLIENT_SECRET');
        const redirect = this.config.get('TWITTER_REDIRECT') ||
            `${this.config.get('BACKEND_URL') || 'http://localhost:9001'}/api/social/callback/twitter`;
        const stored = this.twitterStateStore.get(state);
        if (!stored)
            throw new Error('Invalid or expired Twitter state');
        this.twitterStateStore.delete(state);
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
                code_verifier: stored.codeVerifier,
            }),
        });
        const tokenJson = await tokenRes.json();
        if (tokenJson === null || tokenJson === void 0 ? void 0 : tokenJson.error) {
            this.logger.error(`Twitter token error: ${tokenJson.error} ${tokenJson.error_description || ''}`);
            throw new Error(`Twitter token error: ${tokenJson.error}`);
        }
        if (!(tokenJson === null || tokenJson === void 0 ? void 0 : tokenJson.access_token)) {
            throw new Error('Twitter token missing access_token');
        }
        let userJson = null;
        try {
            const userRes = await fetch('https://api.twitter.com/2/users/me', {
                headers: { Authorization: `Bearer ${tokenJson.access_token}` },
            });
            if (!userRes.ok) {
                const errText = await userRes.text();
                this.logger.warn(`Twitter user lookup failed: ${userRes.status} ${errText}`);
                throw new Error('Twitter user lookup failed');
            }
            userJson = await userRes.json();
        }
        catch (e) {
            this.logger.warn('Could not fetch Twitter user: ' + String(e));
            throw e;
        }
        return { token: tokenJson, user: userJson };
    }
    async persistTwitterAccount(userJson, accessToken) {
        const user = userJson === null || userJson === void 0 ? void 0 : userJson.data;
        if (!(user === null || user === void 0 ? void 0 : user.id) || !accessToken)
            return null;
        const username = user.username || user.name || null;
        const providerKey = `twitter:${username || user.id}`;
        const legacyKey = `twitter:${user.id}`;
        if (!this.isDbAvailable()) {
            return this.upsertMemoryAccount(providerKey, accessToken) || this.upsertMemoryAccount(legacyKey, accessToken);
        }
        let org = await this.prisma.organization.findFirst();
        if (!org) {
            org = await this.prisma.organization.create({
                data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' },
            });
        }
        const existing = await this.prisma.socialAccount.findFirst({
            where: { provider: { in: [providerKey, legacyKey] } },
        });
        if (existing) {
            return this.prisma.socialAccount.update({
                where: { id: existing.id },
                data: { accessToken, provider: providerKey },
            });
        }
        return this.prisma.socialAccount.create({
            data: { provider: providerKey, accessToken, organizationId: org.id },
        });
    }
    async persistLinkedInAccount(profileJson, accessToken) {
        const memberId = (profileJson === null || profileJson === void 0 ? void 0 : profileJson.id) || (profileJson === null || profileJson === void 0 ? void 0 : profileJson.sub);
        if (!memberId || !accessToken)
            return null;
        const providerKey = `linkedin:${memberId}`;
        if (!this.isDbAvailable()) {
            return this.upsertMemoryAccount(providerKey, accessToken);
        }
        let org = await this.prisma.organization.findFirst();
        if (!org) {
            org = await this.prisma.organization.create({
                data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' },
            });
        }
        const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
        if (existing) {
            return this.prisma.socialAccount.update({ where: { id: existing.id }, data: { accessToken } });
        }
        return this.prisma.socialAccount.create({
            data: { provider: providerKey, accessToken, organizationId: org.id },
        });
    }
    async getLinkedInOrganizations(accessToken) {
        const res = await fetch('https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (!res.ok) {
            this.logger.warn(`LinkedIn orgs API error (${res.status}): ${JSON.stringify(json)}`);
        }
        const elements = Array.isArray(json === null || json === void 0 ? void 0 : json.elements) ? json.elements : [];
        const orgIds = elements
            .map((item) => String((item === null || item === void 0 ? void 0 : item.organization) || ''))
            .filter(Boolean)
            .map((urn) => urn.split(':').pop())
            .filter(Boolean);
        if (orgIds.length > 0) {
            this.logger.log(`LinkedIn organizations found: ${orgIds.join(', ')}`);
        }
        else {
            this.logger.warn(`No LinkedIn organizations found with ADMINISTRATOR role. Elements: ${JSON.stringify(elements)}`);
        }
        return orgIds;
    }
    async persistLinkedInOrganizations(orgIds, accessToken) {
        if (!orgIds || orgIds.length === 0 || !accessToken)
            return [];
        if (!this.isDbAvailable()) {
            return orgIds
                .map((orgId) => this.upsertMemoryAccount(`linkedin_org:${orgId}`, accessToken))
                .filter(Boolean);
        }
        let org = await this.prisma.organization.findFirst();
        if (!org) {
            org = await this.prisma.organization.create({
                data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' },
            });
        }
        const saved = [];
        for (const orgId of orgIds) {
            const providerKey = `linkedin_org:${orgId}`;
            const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
            if (existing) {
                const updated = await this.prisma.socialAccount.update({
                    where: { id: existing.id },
                    data: { accessToken },
                });
                saved.push(updated);
                continue;
            }
            const created = await this.prisma.socialAccount.create({
                data: { provider: providerKey, accessToken, organizationId: org.id },
            });
            saved.push(created);
        }
        return saved;
    }
    async persistFacebookPages(accountsJson) {
        if (!accountsJson || !accountsJson.data)
            return [];
        if (!this.isDbAvailable()) {
            const saved = [];
            for (const page of accountsJson.data) {
                const pageId = page.id;
                const accessToken = page.access_token || page.accessToken || null;
                if (!accessToken)
                    continue;
                const record = this.upsertMemoryAccount(pageId, accessToken);
                if (record)
                    saved.push(record);
            }
            return saved;
        }
        let org = await this.prisma.organization.findFirst();
        if (!org) {
            org = await this.prisma.organization.create({ data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' } });
        }
        const saved = [];
        for (const page of accountsJson.data) {
            const pageId = page.id;
            const accessToken = page.access_token || page.accessToken || null;
            if (!accessToken)
                continue;
            const record = await this.prisma.socialAccount.upsert({
                where: { id: undefined },
                create: {
                    provider: pageId,
                    accessToken,
                    organizationId: org.id,
                },
                update: {
                    accessToken,
                },
            }).catch(async () => {
                const existing = await this.prisma.socialAccount.findFirst({ where: { provider: pageId } });
                if (existing) {
                    return this.prisma.socialAccount.update({ where: { id: existing.id }, data: { accessToken } });
                }
                return this.prisma.socialAccount.create({ data: { provider: pageId, accessToken, organizationId: org.id } });
            });
            saved.push(record);
        }
        return saved;
    }
    async syncInstagramAccountsFromFacebookPages() {
        var _a, _b;
        const pages = this.isDbAvailable()
            ? await this.prisma.socialAccount.findMany()
            : this.memoryAccounts;
        const facebookPages = pages.filter(p => !p.provider.includes(':'));
        if (facebookPages.length === 0)
            return [];
        let org = null;
        if (this.isDbAvailable()) {
            org = await this.prisma.organization.findFirst();
            if (!org) {
                org = await this.prisma.organization.create({
                    data: { name: 'Local Organization', description: '', category: 'general', location: '', website: '' },
                });
            }
        }
        const saved = [];
        for (const page of facebookPages) {
            const pageId = page.provider;
            const accessToken = page.accessToken;
            try {
                const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(accessToken)}`);
                const json = await res.json();
                const igId = ((_a = json === null || json === void 0 ? void 0 : json.instagram_business_account) === null || _a === void 0 ? void 0 : _a.id) || ((_b = json === null || json === void 0 ? void 0 : json.connected_instagram_account) === null || _b === void 0 ? void 0 : _b.id);
                if (!igId)
                    continue;
                const providerKey = `instagram:${igId}`;
                if (!this.isDbAvailable()) {
                    const record = this.upsertMemoryAccount(providerKey, accessToken);
                    if (record)
                        saved.push(record);
                    continue;
                }
                const existing = await this.prisma.socialAccount.findFirst({ where: { provider: providerKey } });
                if (existing) {
                    const updated = await this.prisma.socialAccount.update({
                        where: { id: existing.id },
                        data: { accessToken },
                    });
                    saved.push(updated);
                }
                else if (org) {
                    const created = await this.prisma.socialAccount.create({
                        data: { provider: providerKey, accessToken, organizationId: org.id },
                    });
                    saved.push(created);
                }
            }
            catch (e) {
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
        const results = [];
        for (const page of facebookPages) {
            const pageId = page.provider;
            const accessToken = page.accessToken;
            try {
                const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=name,instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(accessToken)}`);
                const json = await res.json();
                results.push({ pageId, name: (json === null || json === void 0 ? void 0 : json.name) || null, data: json });
            }
            catch (e) {
                results.push({ pageId, error: String(e) });
            }
        }
        return results;
    }
    async getStoredPages() {
        if (!this.isDbAvailable())
            return this.memoryAccounts;
        return this.prisma.socialAccount.findMany();
    }
    async deleteSocialAccount(id) {
        if (!id)
            return null;
        if (!this.isDbAvailable()) {
            const index = this.memoryAccounts.findIndex((acc) => acc.id === id);
            if (index >= 0)
                this.memoryAccounts.splice(index, 1);
            return { ok: true };
        }
        return this.prisma.socialAccount.delete({ where: { id } });
    }
    async deleteAllSocialAccounts() {
        if (!this.isDbAvailable()) {
            this.memoryAccounts.splice(0, this.memoryAccounts.length);
            return { count: 0 };
        }
        return this.prisma.socialAccount.deleteMany();
    }
    async publishToFacebookPage(pageId, message, manualToken, imageUrl) {
        let accessToken = manualToken;
        if (!accessToken) {
            const account = this.isDbAvailable()
                ? await this.prisma.socialAccount.findFirst({ where: { provider: pageId } })
                : this.findMemoryAccount(pageId);
            if (!account)
                throw new Error('No stored page token for page ' + pageId + '. Please provide accessToken or connect via OAuth.');
            accessToken = account.accessToken;
        }
        if (manualToken) {
            try {
                const pageTokenRes = await fetch(`https://graph.facebook.com/${pageId}?fields=access_token&access_token=${encodeURIComponent(manualToken)}`);
                const pageTokenJson = await pageTokenRes.json();
                if (pageTokenJson === null || pageTokenJson === void 0 ? void 0 : pageTokenJson.access_token) {
                    accessToken = pageTokenJson.access_token;
                }
            }
            catch (e) {
                this.logger.warn(`Could not exchange user token for page token: ${String(e)}`);
            }
        }
        if (imageUrl) {
            const photoUrl = `https://graph.facebook.com/${pageId}/photos`;
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
        const postUrl = `https://graph.facebook.com/${pageId}/feed`;
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
    async publishToLinkedInMember(providerKey, message) {
        var _a;
        const normalizedKey = providerKey.startsWith('linkedin:') ? providerKey : `linkedin:${providerKey}`;
        const account = this.isDbAvailable()
            ? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
            : this.findMemoryAccount(normalizedKey);
        if (!account)
            throw new Error('No stored LinkedIn token for ' + providerKey);
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
            const errMsg = (json === null || json === void 0 ? void 0 : json.message) || ((_a = json === null || json === void 0 ? void 0 : json.error) === null || _a === void 0 ? void 0 : _a.message) || JSON.stringify(json);
            throw new Error(`LinkedIn API Error (${res.status}): ${errMsg}`);
        }
        return json;
    }
    async publishToLinkedInOrganization(providerKey, message) {
        var _a;
        const normalizedKey = providerKey.startsWith('linkedin_org:') ? providerKey : `linkedin_org:${providerKey}`;
        const account = this.isDbAvailable()
            ? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
            : this.findMemoryAccount(normalizedKey);
        if (!account)
            throw new Error('No stored LinkedIn org token for ' + providerKey);
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
            const errMsg = (json === null || json === void 0 ? void 0 : json.message) || ((_a = json === null || json === void 0 ? void 0 : json.error) === null || _a === void 0 ? void 0 : _a.message) || JSON.stringify(json);
            throw new Error(`LinkedIn API Error (${res.status}): ${errMsg}`);
        }
        return json;
    }
    async publishToTwitterUser(providerKey, message, manualToken) {
        var _a, _b;
        const normalizedKey = providerKey.startsWith('twitter:') ? providerKey : `twitter:${providerKey}`;
        let accessToken = manualToken;
        if (!accessToken) {
            const account = this.isDbAvailable()
                ? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
                : this.findMemoryAccount(normalizedKey);
            if (!account)
                throw new Error('No stored Twitter token for ' + providerKey);
            accessToken = account.accessToken;
        }
        const res = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: message }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || (json && json.errors)) {
            const errMsg = ((_b = (_a = json === null || json === void 0 ? void 0 : json.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || (json === null || json === void 0 ? void 0 : json.detail) || JSON.stringify(json);
            const errorDetails = {
                status: res.status,
                message: errMsg,
                fullResponse: json,
            };
            this.logger.error(`Twitter API Error: ${JSON.stringify(errorDetails)}`);
            if (res.status === 403) {
                throw new Error(`Twitter API Error: Access forbidden. Please ensure your Twitter App has "Read and Write" permissions and elevated access. You may need to regenerate your access tokens after changing app permissions. Details: ${errMsg}`);
            }
            throw new Error(`Twitter API Error (${res.status}): ${errMsg}`);
        }
        return json;
    }
    async publishToInstagramAccount(providerKey, message, imageUrl, manualToken) {
        const normalizedKey = providerKey.startsWith('instagram:') ? providerKey : `instagram:${providerKey}`;
        let accessToken = manualToken;
        if (!accessToken) {
            const account = this.isDbAvailable()
                ? await this.prisma.socialAccount.findFirst({ where: { provider: normalizedKey } })
                : this.findMemoryAccount(normalizedKey);
            if (!account)
                throw new Error('No stored Instagram token for ' + providerKey);
            accessToken = account.accessToken;
        }
        if (!imageUrl)
            throw new Error('Instagram requires an image URL');
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
        const createJson = await createRes.json();
        this.logger.log(`Instagram media create response: ${JSON.stringify(createJson)}`);
        if (!(createJson === null || createJson === void 0 ? void 0 : createJson.id)) {
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
    async getInstagramUsername(instagramId, accessToken) {
        try {
            const res = await fetch(`https://graph.facebook.com/v18.0/${instagramId}?fields=username&access_token=${encodeURIComponent(accessToken)}`);
            const json = await res.json();
            return (json === null || json === void 0 ? void 0 : json.username) || null;
        }
        catch (e) {
            this.logger.warn(`Could not fetch Instagram username for ${instagramId}: ${String(e)}`);
            return null;
        }
    }
    async getFacebookPageName(pageId, accessToken) {
        try {
            const res = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`);
            const json = await res.json();
            return (json === null || json === void 0 ? void 0 : json.name) || null;
        }
        catch (e) {
            this.logger.warn(`Could not fetch Facebook page name for ${pageId}: ${String(e)}`);
            return null;
        }
    }
    async getTwitterUsername(userId, accessToken) {
        var _a, _b, _c, _d;
        try {
            const res = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const json = await res.json();
            if ((_a = json === null || json === void 0 ? void 0 : json.data) === null || _a === void 0 ? void 0 : _a.username)
                return json.data.username;
            if ((_b = json === null || json === void 0 ? void 0 : json.data) === null || _b === void 0 ? void 0 : _b.name)
                return json.data.name;
        }
        catch (e) {
            this.logger.warn(`Could not fetch Twitter username for ${userId}: ${String(e)}`);
        }
        try {
            const res = await fetch(`https://api.twitter.com/2/users/${userId}?user.fields=username`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const json = await res.json();
            return ((_c = json === null || json === void 0 ? void 0 : json.data) === null || _c === void 0 ? void 0 : _c.username) || ((_d = json === null || json === void 0 ? void 0 : json.data) === null || _d === void 0 ? void 0 : _d.name) || null;
        }
        catch (e) {
            this.logger.warn(`Could not fetch Twitter username for ${userId}: ${String(e)}`);
            return null;
        }
    }
    async getAllAccounts() {
        if (!this.isDbAvailable()) {
            return this.memoryAccounts;
        }
        return this.prisma.socialAccount.findMany();
    }
    async updateSocialProvider(id, provider) {
        if (!this.isDbAvailable()) {
            const account = this.memoryAccounts.find((acc) => acc.id === id);
            if (account)
                account.provider = provider;
            return account;
        }
        return this.prisma.socialAccount.update({ where: { id }, data: { provider } });
    }
    async updateAccessToken(providerOrId, accessToken) {
        if (!this.isDbAvailable()) {
            const account = this.memoryAccounts.find((acc) => acc.id === providerOrId || acc.provider === providerOrId);
            if (account) {
                account.accessToken = accessToken;
                return account;
            }
            throw new Error('No in-memory account found for ' + providerOrId);
        }
        let account = await this.prisma.socialAccount.findFirst({ where: { provider: providerOrId } });
        if (!account) {
            account = await this.prisma.socialAccount.findUnique({ where: { id: providerOrId } });
        }
        if (!account)
            throw new Error('No stored social account found for ' + providerOrId);
        return this.prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken } });
    }
};
exports.SocialService = SocialService;
exports.SocialService = SocialService = SocialService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService, prisma_service_1.PrismaService])
], SocialService);
//# sourceMappingURL=social.service.js.map