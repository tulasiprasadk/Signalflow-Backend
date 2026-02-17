import { AiService } from './core/ai.service';
export declare class SearchController {
    private readonly aiService;
    constructor(aiService: AiService);
    search(body: {
        query?: string;
        context?: any;
    }): Promise<{
        result: string;
        insights: string[];
        reels: string[];
        videoPlan: any;
        images: string[];
        hashtags: string;
        raw: {
            summary?: string;
            insights?: string[] | string | object;
            raw?: any;
            error?: string;
            message?: string;
        };
    }>;
}
