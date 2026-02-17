import { Controller, Post, Body } from '@nestjs/common';
import OpenAI from 'openai';

const openaiKey = process.env.OPENAI_API_KEY;
const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
const openaiClient = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

@Controller('core')
export class LlmProxyController {
  // POST /core/llm-proxy
  @Post('llm-proxy')
  async proxy(@Body() body: { prompt: string; mode?: string; count?: number }) {
    const { prompt, mode = 'text', count = 1 } = body;

    // Mock mode for local testing without Ollama/OpenAI
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
      // Prefer OpenAI if API key present, otherwise try Ollama local endpoint
      if (openaiClient) {
        try {
          const res: any = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
          });
          const text = res.choices?.[0]?.message?.content || JSON.stringify(res);

          let insights: any = undefined;
          try {
            const m = text.match(/\[\s*\{?[\s\S]*\}\s*\]/);
            if (m) insights = JSON.parse(m[0]);
          } catch {}

          return { summary: text, insights: insights || undefined, raw: res };
        } catch (e) {
          return { error: 'OpenAI LLM text call failed', message: e?.message || e };
        }
      }

        try {
          const modelName = body['model'] || process.env.OLLAMA_DEFAULT_MODEL || 'llama2:latest';
          const resp = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName, prompt }),
          });

          // Read full text (Ollama may return NDJSON / streaming lines)
          const raw = await resp.text();

          const parsedLines: any[] = [];
          let summaryText = '';

          // Split into lines and attempt to robustly extract JSON objects from each line.
          const lines = raw.split(/\r?\n/);
          for (const line of lines) {
            const l = (line || '').trim();
            if (!l) continue;

            // Ollama may prefix lines with 'data:' or similar. Strip known prefixes.
            const cleaned = l.replace(/^data:\s*/i, '').replace(/^event:\s*/i, '').trim();

            // Find the first '{' and last '}' and try to parse the substring as JSON.
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const candidate = cleaned.slice(firstBrace, lastBrace + 1);
              try {
                const obj = JSON.parse(candidate);
                parsedLines.push(obj);
                // accumulate textual parts if present
                if (typeof obj.response === 'string') summaryText += obj.response;
                if (!summaryText && typeof obj.result === 'string') summaryText += obj.result;
                if (!summaryText && typeof obj.output === 'string') summaryText += obj.output;
                // some objects include 'text' or nested arrays
                if (!summaryText && obj.text) summaryText += String(obj.text);
              } catch (err) {
                // ignore parse errors for the line
              }
            } else {
              // If line doesn't contain braces, it may itself be raw text to append
              summaryText += cleaned + '\n';
            }
          }

          // If no parsed lines, try overall JSON parse as fallback
          if (parsedLines.length === 0) {
            try {
              const parsed = JSON.parse(raw);
              parsedLines.push(parsed);
              if (typeof parsed.response === 'string') summaryText = parsed.response;
              else if (typeof parsed.result === 'string') summaryText = parsed.result;
              else if (typeof parsed.output === 'string') summaryText = parsed.output;
              else summaryText = JSON.stringify(parsed);
            } catch (err) {
              // leave summaryText as-is (raw merged lines)
            }
          }

          // Try to extract JSON array of insights from accumulated text
          let insights: any = undefined;
          try {
            const m = summaryText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
            if (m) insights = JSON.parse(m[0]);
          } catch (err) {
            insights = undefined;
          }

          return { summary: summaryText || raw, insights: insights || undefined, raw: parsedLines.length ? parsedLines : raw };
        } catch (e) {
          return { error: 'Ollama LLM call failed', message: e?.message || String(e) };
        }
    }

    // For image/reel modes, this proxy does not implement generation — return empty and let AiService fallback
    return { images: [], reels: [], raw: null };
  }
}
