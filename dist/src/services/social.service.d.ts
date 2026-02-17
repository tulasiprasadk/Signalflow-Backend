import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class SocialService {
    private config;
    private prisma;
    private readonly logger;
    private readonly twitterStateStore;
    private readonly memoryAccounts;
    constructor(config: ConfigService, prisma: PrismaService);
    private isDbAvailable;
    private upsertMemoryAccount;
    private findMemoryAccount;
    getFacebookOAuthUrl(state: string): Promise<string>;
    handleFacebookCallback(code: string): Promise<{
        token: any;
        accounts: any;
    }>;
    getLinkedInOAuthUrl(state: string): Promise<string>;
    handleLinkedInCallback(code: string): Promise<{
        token: any;
        profile: any;
    }>;
    private generateTwitterCodeVerifier;
    private toBase64Url;
    private buildTwitterCodeChallenge;
    getTwitterOAuthUrl(state: string): Promise<string>;
    handleTwitterCallback(code: string, state: string): Promise<{
        token: any;
        user: any;
    }>;
    persistTwitterAccount(userJson: any, accessToken: string): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }>;
    persistLinkedInAccount(profileJson: any, accessToken: string): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }>;
    getLinkedInOrganizations(accessToken: string): Promise<any>;
    persistLinkedInOrganizations(orgIds: string[], accessToken: string): Promise<any[]>;
    persistFacebookPages(accountsJson: any): Promise<any[]>;
    syncInstagramAccountsFromFacebookPages(): Promise<any[]>;
    debugInstagramAccountsFromFacebookPages(): Promise<any[]>;
    getStoredPages(): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }[]>;
    deleteSocialAccount(id: string): Promise<any>;
    deleteAllSocialAccounts(): Promise<any>;
    publishToFacebookPage(pageId: string, message: string, manualToken?: string, imageUrl?: string): Promise<any>;
    publishToLinkedInMember(providerKey: string, message: string): Promise<any>;
    publishToLinkedInOrganization(providerKey: string, message: string): Promise<any>;
    publishToTwitterUser(providerKey: string, message: string, manualToken?: string): Promise<any>;
    publishToInstagramAccount(providerKey: string, message: string, imageUrl?: string, manualToken?: string): Promise<any>;
    getInstagramUsername(instagramId: string, accessToken: string): Promise<any>;
    getFacebookPageName(pageId: string, accessToken: string): Promise<any>;
    getTwitterUsername(userId: string, accessToken: string): Promise<any>;
    getAllAccounts(): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }[]>;
    updateSocialProvider(id: string, provider: string): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }>;
    updateAccessToken(providerOrId: string, accessToken: string): Promise<{
        id: string;
        provider: string;
        accessToken: string;
    }>;
}
