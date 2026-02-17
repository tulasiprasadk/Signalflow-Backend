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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SocialController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialController = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const social_service_1 = require("../services/social.service");
const scheduler_service_1 = require("../services/scheduler.service");
const config_1 = require("@nestjs/config");
let SocialController = SocialController_1 = class SocialController {
    constructor(social, scheduler, config) {
        this.social = social;
        this.scheduler = scheduler;
        this.config = config;
        this.logger = new common_1.Logger(SocialController_1.name);
    }
    async connectFacebook(res) {
        const state = `state_${Date.now()}`;
        const url = await this.social.getFacebookOAuthUrl(state);
        this.logger.log(`Redirecting to Facebook OAuth: ${url}`);
        return res.redirect(url);
    }
    async connectLinkedIn(res) {
        const state = `state_${Date.now()}`;
        const url = await this.social.getLinkedInOAuthUrl(state);
        this.logger.log(`Redirecting to LinkedIn OAuth: ${url}`);
        return res.redirect(url);
    }
    async connectTwitter(res) {
        const state = `state_${Date.now()}`;
        const url = await this.social.getTwitterOAuthUrl(state);
        this.logger.log(`Redirecting to Twitter OAuth: ${url}`);
        return res.redirect(url);
    }
    async connectInstagram(res) {
        const state = `state_${Date.now()}`;
        const url = await this.social.getFacebookOAuthUrl(state);
        this.logger.log(`Redirecting to Instagram OAuth (via Facebook): ${url}`);
        return res.redirect(url);
    }
    async callbackFacebook(code, res) {
        const frontend = this.config.get('FRONTEND_URL') || 'http://localhost:9000';
        if (!code) {
            return res.redirect(`${frontend}/?connected=facebook&success=0`);
        }
        try {
            const result = await this.social.handleFacebookCallback(code);
            this.logger.log('Facebook callback handled; accounts=' + JSON.stringify(result.accounts));
            const saved = await this.social.persistFacebookPages(result.accounts);
            this.logger.log(`Persisted ${saved.length} facebook page(s)`);
            const igSaved = await this.social.syncInstagramAccountsFromFacebookPages();
            this.logger.log(`Persisted ${igSaved.length} instagram account(s)`);
            return res.redirect(`${frontend}/?connected=facebook&success=1`);
        }
        catch (e) {
            this.logger.error('Error handling Facebook callback', e);
            return res.redirect(`${frontend}/?connected=facebook&success=0`);
        }
    }
    async callbackLinkedIn(code, query, res) {
        var _a, _b, _c;
        const frontend = this.config.get('FRONTEND_URL') || 'http://localhost:9000';
        this.logger.log(`LinkedIn callback received: ${JSON.stringify(query || {})}`);
        if (!code) {
            return res.redirect(`${frontend}/?connected=linkedin&success=0`);
        }
        try {
            const result = await this.social.handleLinkedInCallback(code);
            this.logger.log('LinkedIn callback handled');
            const saved = await this.social.persistLinkedInAccount(result.profile, (_a = result.token) === null || _a === void 0 ? void 0 : _a.access_token);
            this.logger.log(`Persisted LinkedIn account: ${saved ? 'ok' : 'none'}`);
            const orgIds = await this.social.getLinkedInOrganizations((_b = result.token) === null || _b === void 0 ? void 0 : _b.access_token);
            const orgSaved = await this.social.persistLinkedInOrganizations(orgIds, (_c = result.token) === null || _c === void 0 ? void 0 : _c.access_token);
            this.logger.log(`Persisted LinkedIn org(s): ${orgSaved.length}`);
            const ok = Boolean(saved) || (orgSaved && orgSaved.length > 0);
            return res.redirect(`${frontend}/?connected=linkedin&success=${ok ? 1 : 0}`);
        }
        catch (e) {
            this.logger.error('Error handling LinkedIn callback', e);
            return res.redirect(`${frontend}/?connected=linkedin&success=0`);
        }
    }
    async callbackTwitter(code, state, res) {
        var _a;
        const frontend = this.config.get('FRONTEND_URL') || 'http://localhost:9000';
        if (!code || !state) {
            return res.redirect(`${frontend}/?connected=twitter&success=0`);
        }
        try {
            const result = await this.social.handleTwitterCallback(code, state);
            const saved = await this.social.persistTwitterAccount(result.user, (_a = result.token) === null || _a === void 0 ? void 0 : _a.access_token);
            this.logger.log(`Persisted Twitter account: ${saved ? 'ok' : 'none'}`);
            return res.redirect(`${frontend}/?connected=twitter&success=${saved ? 1 : 0}`);
        }
        catch (e) {
            this.logger.error('Error handling Twitter callback', e);
            return res.redirect(`${frontend}/?connected=twitter&success=0`);
        }
    }
    async publishFacebook(body, res) {
        try {
            const resp = await this.social.publishToFacebookPage(body.pageId, body.message, body.accessToken, body.imageUrl);
            return res.status(200).json(resp);
        }
        catch (e) {
            this.logger.error('Error publishing to Facebook', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async publishLinkedIn(body, res) {
        var _a;
        try {
            const isOrg = (_a = body.pageId) === null || _a === void 0 ? void 0 : _a.startsWith('linkedin_org:');
            const resp = isOrg
                ? await this.social.publishToLinkedInOrganization(body.pageId, body.message)
                : await this.social.publishToLinkedInMember(body.pageId, body.message);
            return res.status(200).json(resp);
        }
        catch (e) {
            this.logger.error('Error publishing to LinkedIn', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async publishTwitter(body, res) {
        try {
            const resp = await this.social.publishToTwitterUser(body.pageId, body.message, body.accessToken);
            return res.status(200).json(resp);
        }
        catch (e) {
            this.logger.error('Error publishing to Twitter', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async publishInstagram(body, res) {
        try {
            const resp = await this.social.publishToInstagramAccount(body.pageId, body.message, body.imageUrl, body.accessToken);
            return res.status(200).json(resp);
        }
        catch (e) {
            this.logger.error('Error publishing to Instagram', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async debugLinkedInOrganizations(res) {
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
        }
        catch (e) {
            this.logger.error('Error fetching LinkedIn orgs', e);
            return res.status(500).json({ error: String(e), message: 'Failed to fetch LinkedIn organizations' });
        }
    }
    async uploadImage(body, res) {
        try {
            const dataUrl = (body === null || body === void 0 ? void 0 : body.dataUrl) || '';
            const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!match) {
                return res.status(400).json({ error: 'Invalid image data URL' });
            }
            const mime = match[1];
            const ext = mime.split('/')[1] || 'jpg';
            const buffer = Buffer.from(match[2], 'base64');
            const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const uploadsDir = (0, path_1.join)(process.cwd(), 'uploads');
            const filePath = (0, path_1.join)(uploadsDir, filename);
            await (0, promises_1.writeFile)(filePath, buffer);
            const publicBase = this.config.get('BACKEND_PUBLIC_URL') || this.config.get('BACKEND_URL') || 'http://localhost:9001';
            const url = `${publicBase.replace(/\/$/, '')}/uploads/${filename}`;
            return res.status(200).json({ url });
        }
        catch (e) {
            this.logger.error('Error uploading image', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async adminUpdateToken(body, res) {
        const allow = this.config.get('ALLOW_ADMIN_ENDPOINTS') === '1';
        if (!allow)
            return res.status(403).json({ error: 'admin endpoints disabled' });
        if (!body || !body.provider || !body.accessToken)
            return res.status(400).json({ error: 'provider and accessToken required' });
        try {
            const updated = await this.social.updateAccessToken(body.provider, body.accessToken);
            return res.status(200).json({ ok: true, updated });
        }
        catch (e) {
            this.logger.error('Error in adminUpdateToken', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async refreshInstagram(res) {
        try {
            const saved = await this.social.syncInstagramAccountsFromFacebookPages();
            return res.status(200).json({ count: saved.length });
        }
        catch (e) {
            this.logger.error('Error syncing Instagram accounts', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async debugInstagram(res) {
        try {
            const results = await this.social.debugInstagramAccountsFromFacebookPages();
            return res.status(200).json(results);
        }
        catch (e) {
            this.logger.error('Error debugging Instagram accounts', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async listPages() {
        const pages = await this.social.getStoredPages();
        const results = await Promise.all(pages.map(async (p) => {
            const hasPrefix = p.provider.includes(':');
            const [rawPlatform, label] = hasPrefix ? p.provider.split(':') : ['facebook', p.provider];
            const platform = rawPlatform === 'linkedin_org' ? 'linkedin' : rawPlatform;
            if (rawPlatform === 'instagram') {
                const igUsername = await this.social.getInstagramUsername(label, p.accessToken);
                return { id: p.id, provider: p.provider, platform, label: igUsername || label, accessToken: p.accessToken };
            }
            if (rawPlatform === 'facebook') {
                const pageName = await this.social.getFacebookPageName(label, p.accessToken);
                return { id: p.id, provider: p.provider, platform, label: pageName || label, accessToken: p.accessToken };
            }
            if (rawPlatform === 'twitter') {
                const username = await this.social.getTwitterUsername(label, p.accessToken);
                if (username && label !== username) {
                    await this.social.updateSocialProvider(p.id, `twitter:${username}`);
                    return { id: p.id, provider: `twitter:${username}`, platform, label: username, accessToken: p.accessToken };
                }
                return { id: p.id, provider: p.provider, platform, label: username || label, accessToken: p.accessToken };
            }
            return { id: p.id, provider: p.provider, platform, label, accessToken: p.accessToken };
        }));
        return results;
    }
    async deletePage(id) {
        await this.social.deleteSocialAccount(id);
        return { ok: true };
    }
    async deleteAllPages() {
        await this.social.deleteAllSocialAccounts();
        return { ok: true };
    }
    async schedulePost(body, res) {
        try {
            const scheduledTime = new Date(body.scheduledTime);
            if (scheduledTime < new Date()) {
                return res.status(400).json({ error: 'Scheduled time must be in the future' });
            }
            const post = this.scheduler.schedulePost(body.message, body.accounts, scheduledTime, body.imageUrl);
            return res.status(200).json(post);
        }
        catch (e) {
            this.logger.error('Error scheduling post', e);
            return res.status(500).json({ error: String(e) });
        }
    }
    async getPendingPosts() {
        return this.scheduler.getPendingPosts();
    }
    async getAllScheduledPosts() {
        return this.scheduler.getScheduledPosts();
    }
    async deleteScheduledPost(id) {
        const deleted = this.scheduler.deleteScheduledPost(id);
        if (deleted) {
            return { ok: true };
        }
        else {
            return { ok: false, error: 'Post not found' };
        }
    }
};
exports.SocialController = SocialController;
__decorate([
    (0, common_1.Get)('connect/facebook'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "connectFacebook", null);
__decorate([
    (0, common_1.Get)('connect/linkedin'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "connectLinkedIn", null);
__decorate([
    (0, common_1.Get)('connect/twitter'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "connectTwitter", null);
__decorate([
    (0, common_1.Get)('connect/instagram'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "connectInstagram", null);
__decorate([
    (0, common_1.Get)('callback/facebook'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "callbackFacebook", null);
__decorate([
    (0, common_1.Get)('callback/linkedin'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "callbackLinkedIn", null);
__decorate([
    (0, common_1.Get)('callback/twitter'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "callbackTwitter", null);
__decorate([
    (0, common_1.Post)('publish/facebook'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "publishFacebook", null);
__decorate([
    (0, common_1.Post)('publish/linkedin'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "publishLinkedIn", null);
__decorate([
    (0, common_1.Post)('publish/twitter'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "publishTwitter", null);
__decorate([
    (0, common_1.Post)('publish/instagram'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "publishInstagram", null);
__decorate([
    (0, common_1.Get)('debug/linkedin-orgs'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "debugLinkedInOrganizations", null);
__decorate([
    (0, common_1.Post)('upload-image'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "uploadImage", null);
__decorate([
    (0, common_1.Post)('admin/update-token'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "adminUpdateToken", null);
__decorate([
    (0, common_1.Post)('refresh/instagram'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "refreshInstagram", null);
__decorate([
    (0, common_1.Get)('debug/instagram'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "debugInstagram", null);
__decorate([
    (0, common_1.Get)('pages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "listPages", null);
__decorate([
    (0, common_1.Delete)('pages/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "deletePage", null);
__decorate([
    (0, common_1.Delete)('pages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "deleteAllPages", null);
__decorate([
    (0, common_1.Post)('schedule'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "schedulePost", null);
__decorate([
    (0, common_1.Get)('schedule/pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getPendingPosts", null);
__decorate([
    (0, common_1.Get)('schedule/all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getAllScheduledPosts", null);
__decorate([
    (0, common_1.Delete)('schedule/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "deleteScheduledPost", null);
exports.SocialController = SocialController = SocialController_1 = __decorate([
    (0, common_1.Controller)('social'),
    __metadata("design:paramtypes", [social_service_1.SocialService, scheduler_service_1.SchedulerService, config_1.ConfigService])
], SocialController);
//# sourceMappingURL=social.controller.js.map