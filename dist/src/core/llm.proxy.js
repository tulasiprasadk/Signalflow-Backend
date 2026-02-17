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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmProxyController = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = require("openai");
const openaiKey = process.env.OPENAI_API_KEY;
const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
const openaiClient = openaiKey ? new openai_1.default({ apiKey: openaiKey }) : null;
let LlmProxyController = class LlmProxyController {
    async proxy(body) {
        var _a, _b, _c;
        const { prompt, mode = 'text', count = 1 } = body;
        const LLM_MOCK = process.env.LLM_MOCK === 'true';
        if (LLM_MOCK) {
            const summary = `Mock summary for prompt: ${prompt}`;
            const insights = [
                `Key point about "${prompt}" — mock insight 1.`,
                `Suggested post idea for "${prompt}" — mock insight 2.`,
                `Hashtags: #${String(prompt).replace(/\s+/g, '')}`,
            ];
            return { summary, insights, raw: { mock: true } };
        }
        if (mode === 'text') {
            if (openaiClient) {
                try {
                    const res = await openaiClient.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 500,
                    });
                    const text = ((_c = (_b = (_a = res.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || JSON.stringify(res);
                    let insights = undefined;
                    try {
                        const m = text.match(/\[\s*\{?[\s\S]*\}\s*\]/);
                        if (m)
                            insights = JSON.parse(m[0]);
                    }
                    catch (_d) { }
                    return { summary: text, insights: insights || undefined, raw: res };
                }
                catch (e) {
                    return { error: 'OpenAI LLM text call failed', message: (e === null || e === void 0 ? void 0 : e.message) || e };
                }
            }
            try {
                const modelName = body['model'] || process.env.OLLAMA_DEFAULT_MODEL || 'llama2:latest';
                const resp = await fetch(`${ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName, prompt }),
                });
                const raw = await resp.text();
                const parsedLines = [];
                let summaryText = '';
                const lines = raw.split(/\r?\n/);
                for (const line of lines) {
                    const l = (line || '').trim();
                    if (!l)
                        continue;
                    const cleaned = l.replace(/^data:\s*/i, '').replace(/^event:\s*/i, '').trim();
                    const firstBrace = cleaned.indexOf('{');
                    const lastBrace = cleaned.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        const candidate = cleaned.slice(firstBrace, lastBrace + 1);
                        try {
                            const obj = JSON.parse(candidate);
                            parsedLines.push(obj);
                            if (typeof obj.response === 'string')
                                summaryText += obj.response;
                            if (!summaryText && typeof obj.result === 'string')
                                summaryText += obj.result;
                            if (!summaryText && typeof obj.output === 'string')
                                summaryText += obj.output;
                            if (!summaryText && obj.text)
                                summaryText += String(obj.text);
                        }
                        catch (err) {
                        }
                    }
                    else {
                        summaryText += cleaned + '\n';
                    }
                }
                if (parsedLines.length === 0) {
                    try {
                        const parsed = JSON.parse(raw);
                        parsedLines.push(parsed);
                        if (typeof parsed.response === 'string')
                            summaryText = parsed.response;
                        else if (typeof parsed.result === 'string')
                            summaryText = parsed.result;
                        else if (typeof parsed.output === 'string')
                            summaryText = parsed.output;
                        else
                            summaryText = JSON.stringify(parsed);
                    }
                    catch (err) {
                    }
                }
                let insights = undefined;
                try {
                    const m = summaryText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
                    if (m)
                        insights = JSON.parse(m[0]);
                }
                catch (err) {
                    insights = undefined;
                }
                return { summary: summaryText || raw, insights: insights || undefined, raw: parsedLines.length ? parsedLines : raw };
            }
            catch (e) {
                return { error: 'Ollama LLM call failed', message: (e === null || e === void 0 ? void 0 : e.message) || String(e) };
            }
        }
        return { images: [], reels: [], raw: null };
    }
};
exports.LlmProxyController = LlmProxyController;
__decorate([
    (0, common_1.Post)('llm-proxy'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LlmProxyController.prototype, "proxy", null);
exports.LlmProxyController = LlmProxyController = __decorate([
    (0, common_1.Controller)('core')
], LlmProxyController);
//# sourceMappingURL=llm.proxy.js.map