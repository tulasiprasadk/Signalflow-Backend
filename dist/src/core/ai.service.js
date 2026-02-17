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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
let AiService = class AiService {
    constructor() {
        this.llmUrl = process.env.LLM_API_URL;
        this.llmKey = process.env.LLM_API_KEY;
        this.hfApiKey = process.env.HUGGINGFACE_API_KEY;
        if (!this.llmUrl || !this.llmKey) {
            if (!this.hfApiKey) {
                console.error('❌ No LLM_API_URL/LLM_API_KEY or HUGGINGFACE_API_KEY configured');
                throw new Error('LLM provider is not configured');
            }
            else {
                console.warn('LLM_API not configured, falling back to Hugging Face');
            }
        }
    }
    get isLlmEnabled() {
        return !!(this.llmUrl && this.llmKey);
    }
    async callLlm(payload) {
        if (!this.llmUrl || !this.llmKey)
            throw new Error('LLM not configured');
        const res = await fetch(this.llmUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.llmKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return res.json();
    }
    async generateInsights(input, options) {
        var _a;
        const prompt = `Business name: ${input.name}\nCategory: ${input.category}\nDescription: ${input.description}\nGenerate 3 actionable, non-generic social media insights in JSON array format.`;
        try {
            if (this.isLlmEnabled) {
                const model = (options === null || options === void 0 ? void 0 : options.model) || process.env.OLLAMA_DEFAULT_MODEL || 'llama2:latest';
                const data = await this.callLlm({ prompt, mode: 'text', model });
                const summary = (data && (data.summary || (typeof data === 'string' ? data : undefined))) || JSON.stringify(data);
                const insights = (data && (data.insights || data.generated)) || [];
                return { summary, insights, raw: data };
            }
            const response = await fetch('https://api-inference.huggingface.co/models/bigscience/bloomz-560m', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.hfApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ inputs: prompt }),
            });
            const data = await response.json();
            let summary = '';
            let insights = [];
            if (Array.isArray(data) && typeof ((_a = data[0]) === null || _a === void 0 ? void 0 : _a.generated_text) === 'string') {
                summary = data[0].generated_text;
                const match = summary.match(/\[([^\]]*)\]/);
                if (match) {
                    try {
                        const arr = JSON.parse('[' + match[1] + ']');
                        if (Array.isArray(arr)) {
                            insights = arr.map(i => (typeof i === 'string' ? i : JSON.stringify(i)));
                        }
                    }
                    catch (_b) { }
                }
            }
            if (!insights.length && summary)
                insights = [summary];
            return { summary, insights, raw: data };
        }
        catch (error) {
            console.error('❌ AI GENERATION FAILED:', error);
            return { error: 'AI generation failed', message: (error === null || error === void 0 ? void 0 : error.message) || error };
        }
    }
    async generateImages(prompt, count = 3) {
        try {
            const replicateToken = process.env.REPLICATE_API_TOKEN;
            const replicateImageModel = process.env.REPLICATE_IMAGE_MODEL;
            if (replicateToken && replicateImageModel) {
                try {
                    const data = await this.replicatePredict(replicateImageModel, { prompt, num_outputs: count });
                    const outputs = data.output || data.outputs || data.result;
                    return { images: Array.isArray(outputs) ? outputs.flat() : [], raw: data };
                }
                catch (e) {
                    console.warn('Replicate image generation failed, falling back:', (e === null || e === void 0 ? void 0 : e.message) || e);
                }
            }
            if (this.isLlmEnabled) {
                const data = await this.callLlm({ prompt, mode: 'image', count });
                return { images: data.images || data.generated_images || [], raw: data };
            }
            return { images: [], raw: null };
        }
        catch (error) {
            console.error('❌ Image generation failed:', error);
            return { error: 'Image generation failed', message: (error === null || error === void 0 ? void 0 : error.message) || error };
        }
    }
    async generateReels(prompt, count = 2) {
        try {
            const replicateToken = process.env.REPLICATE_API_TOKEN;
            const replicateVideoModel = process.env.REPLICATE_VIDEO_MODEL;
            if (replicateToken && replicateVideoModel) {
                try {
                    const data = await this.replicatePredict(replicateVideoModel, { prompt, num_outputs: count });
                    const outputs = data.output || data.outputs || data.result;
                    return { reels: Array.isArray(outputs) ? outputs.flat() : [], raw: data };
                }
                catch (e) {
                    console.warn('Replicate reel generation failed, falling back:', (e === null || e === void 0 ? void 0 : e.message) || e);
                }
            }
            if (this.isLlmEnabled) {
                const data = await this.callLlm({ prompt, mode: 'reel', count });
                return { reels: data.reels || data.generated_reels || [], raw: data };
            }
            return { reels: [], raw: null };
        }
        catch (error) {
            console.error('❌ Reel generation failed:', error);
            return { error: 'Reel generation failed', message: (error === null || error === void 0 ? void 0 : error.message) || error };
        }
    }
    async replicatePredict(version, input) {
        const token = process.env.REPLICATE_API_TOKEN;
        if (!token)
            throw new Error('REPLICATE_API_TOKEN not set');
        const endpoint = 'https://api.replicate.com/v1/predictions';
        let res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ version, input }),
        });
        let data = await res.json();
        const maxPoll = 30;
        let attempts = 0;
        while (data.status !== 'succeeded' && data.status !== 'failed' && attempts < maxPoll) {
            await new Promise(r => setTimeout(r, 1000));
            const poll = await fetch(`${endpoint}/${data.id}`, { headers: { Authorization: `Token ${token}` } });
            data = await poll.json();
            attempts += 1;
        }
        if (data.status === 'failed')
            throw new Error('Replicate prediction failed');
        return data;
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AiService);
//# sourceMappingURL=ai.service.js.map