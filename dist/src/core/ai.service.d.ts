export declare class AiService {
    private llmUrl?;
    private llmKey?;
    private hfApiKey?;
    constructor();
    get isLlmEnabled(): boolean;
    private callLlm;
    generateInsights(input: {
        name: string;
        description: string;
        category: string;
    }, options?: {
        model?: string;
    }): Promise<any>;
    generateImages(prompt: string, count?: number): Promise<any>;
    generateReels(prompt: string, count?: number): Promise<any>;
    private replicatePredict;
}
