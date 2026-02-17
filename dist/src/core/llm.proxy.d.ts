export declare class LlmProxyController {
    proxy(body: {
        prompt: string;
        mode?: string;
        count?: number;
    }): Promise<{
        summary: any;
        insights: any;
        raw: any;
        error?: undefined;
        message?: undefined;
        images?: undefined;
        reels?: undefined;
    } | {
        error: string;
        message: any;
        summary?: undefined;
        insights?: undefined;
        raw?: undefined;
        images?: undefined;
        reels?: undefined;
    } | {
        images: any[];
        reels: any[];
        raw: any;
        summary?: undefined;
        insights?: undefined;
        error?: undefined;
        message?: undefined;
    }>;
}
