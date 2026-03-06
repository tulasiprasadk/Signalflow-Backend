import { Injectable } from '@nestjs/common';

// Internal response shape may vary by provider; keep `any` for flexibility.

@Injectable()
export class AiService {
  private llmUrl?: string;
  private llmKey?: string;
  private hfApiKey?: string;
  private replicateVersionCache = new Map<string, string>();

  constructor() {
    this.llmUrl = process.env.LLM_API_URL;
    this.llmKey = process.env.LLM_API_KEY;
    this.hfApiKey = process.env.HUGGINGFACE_API_KEY;

    if (!this.llmUrl || !this.llmKey) {
      if (!this.hfApiKey) {
        console.error('❌ No LLM_API_URL/LLM_API_KEY or HUGGINGFACE_API_KEY configured');
        // Do not crash the whole app when AI env vars are missing.
        this.hfApiKey = undefined;
      } else {
        console.warn('LLM_API not configured, falling back to Hugging Face');
      }
    }
  }

  get isLlmEnabled() {
    return !!(this.llmUrl && this.llmKey);
  }

  private clampVideoDuration(durationSeconds?: number): number {
    const value = Number.isFinite(durationSeconds as number) ? Number(durationSeconds) : 18;
    return Math.min(20, Math.max(15, Math.round(value)));
  }

  private normalizeMediaOutputs(outputs: any): string[] {
    if (!outputs) return [];
    if (typeof outputs === 'string') return [outputs];
    if (Array.isArray(outputs)) {
      return outputs
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            return item.url || item.uri || item.output || item.video || item.src || null;
          }
          return null;
        })
        .filter(Boolean);
    }
    if (outputs && typeof outputs === 'object') {
      const single = outputs.url || outputs.uri || outputs.output || outputs.video || outputs.src;
      return single ? [single] : [];
    }
    return [];
  }

  private async callLlm(payload: any): Promise<any> {
    if (!this.llmUrl || !this.llmKey) throw new Error('LLM not configured');
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

  async generateInsights(input: { name: string; description: string; category: string }, options?: { model?: string }): Promise<any> {
    const prompt = `Business name: ${input.name}\nCategory: ${input.category}\nDescription: ${input.description}\nGenerate 3 actionable, non-generic social media insights in JSON array format.`;
    try {
      if (this.isLlmEnabled) {
        const model = options?.model || process.env.OLLAMA_DEFAULT_MODEL || 'llama2:latest';
        const data: any = await this.callLlm({ prompt, mode: 'text', model });
        // Expecting consumer LLM to return { summary, insights }
        const summary = (data && (data.summary || (typeof data === 'string' ? data : undefined))) || JSON.stringify(data);
        const insights = (data && (data.insights || data.generated)) || [];
        return { summary, insights, raw: data };
      }

      // Fallback to Hugging Face inference API for existing behaviour
      const response = await fetch('https://api-inference.huggingface.co/models/bigscience/bloomz-560m', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.hfApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt }),
      });
      const data: any = await response.json();
      let summary = '';
      let insights: string[] = [];
      if (Array.isArray(data) && typeof data[0]?.generated_text === 'string') {
        summary = data[0].generated_text;
        const match = summary.match(/\[([^\]]*)\]/);
        if (match) {
          try {
            const arr = JSON.parse('[' + match[1] + ']');
            if (Array.isArray(arr)) {
              insights = arr.map(i => (typeof i === 'string' ? i : JSON.stringify(i)));
            }
          } catch {}
        }
      }
      if (!insights.length && summary) insights = [summary];
      return { summary, insights, raw: data };
    } catch (error) {
      console.error('❌ AI GENERATION FAILED:', error);
      return { error: 'AI generation failed', message: error?.message || error } as any;
    }
  }

  async generateImages(prompt: string, count = 3): Promise<any> {
    try {
      // Prefer Replicate image generation if configured
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      const replicateImageModel = process.env.REPLICATE_IMAGE_MODEL;
      if (replicateToken && replicateImageModel) {
        try {
          const data: any = await this.replicatePredict(replicateImageModel, { prompt, num_outputs: count });
          const outputs = data.output || data.outputs || data.result;
          return { images: Array.isArray(outputs) ? outputs.flat() : [], raw: data };
        } catch (e) {
          console.warn('Replicate image generation failed, falling back:', e?.message || e);
        }
      }

      if (this.isLlmEnabled) {
        const data: any = await this.callLlm({ prompt, mode: 'image', count });
        return { images: data.images || data.generated_images || [], raw: data };
      }

      return { images: [], raw: null };
    } catch (error) {
      console.error('❌ Image generation failed:', error);
      return { error: 'Image generation failed', message: error?.message || error } as any;
    }
  }

  async generateReels(prompt: string, count = 2, durationSeconds = 18, imageUrl?: string): Promise<any> {
    try {
      const clampedDuration = this.clampVideoDuration(durationSeconds);
      let replicateError: string | null = null;
      // Prefer Replicate video generation if configured
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      const replicateVideoModel = process.env.REPLICATE_VIDEO_MODEL;
      if (replicateToken && replicateVideoModel) {
        try {
          // Different video models use different duration keys; send common variants.
          const data: any = await this.replicatePredict(replicateVideoModel, {
            prompt,
            num_outputs: count,
            duration: clampedDuration,
            duration_seconds: clampedDuration,
            seconds: clampedDuration,
            image: imageUrl,
            image_url: imageUrl,
            init_image: imageUrl,
            first_frame_image: imageUrl,
          });
          const outputs = data.output || data.outputs || data.result;
          const reels = this.normalizeMediaOutputs(outputs);
          return { reels, raw: data };
        } catch (e) {
          replicateError = String(e?.message || e || 'unknown Replicate error');
          console.warn('Replicate reel generation failed, falling back:', replicateError);
        }
      }

      if (this.isLlmEnabled) {
        const data: any = await this.callLlm({ prompt, mode: 'reel', count, durationSeconds: clampedDuration });
        const reels = data.reels || data.generated_reels || [];
        if (Array.isArray(reels) && reels.length) {
          return { reels, raw: data };
        }
        return {
          reels: [],
          raw: data,
          error: replicateError || 'No reel URLs returned by configured providers',
        };
      }

      return {
        reels: [],
        raw: null,
        error:
          replicateError || 'No real video provider configured (set REPLICATE_API_TOKEN and REPLICATE_VIDEO_MODEL)',
      };
    } catch (error) {
      console.error('❌ Reel generation failed:', error);
      return { error: 'Reel generation failed', message: error?.message || error } as any;
    }
  }

  private async replicatePredict(version: string, input: any): Promise<any> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN not set');
    const resolvedVersion = await this.resolveReplicateVersion(version, token);
    const endpoint = 'https://api.replicate.com/v1/predictions';
    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: resolvedVersion, input }),
    });
    let data: any = await res.json();
    if (!res.ok) {
      const title = data?.title || data?.error || 'Replicate create failed';
      const detail = data?.detail || data?.message || '';
      throw new Error(`${title}${detail ? `: ${detail}` : ''}`.trim());
    }
    // Poll until finished
    const maxPoll = 30;
    let attempts = 0;
    while (data.status !== 'succeeded' && data.status !== 'failed' && attempts < maxPoll) {
      await new Promise(r => setTimeout(r, 1000));
      const poll = await fetch(`${endpoint}/${data.id}`, { headers: { Authorization: `Token ${token}` } });
      data = await poll.json();
      if (!poll.ok) {
        const title = data?.title || data?.error || 'Replicate poll failed';
        const detail = data?.detail || data?.message || '';
        throw new Error(`${title}${detail ? `: ${detail}` : ''}`.trim());
      }
      attempts += 1;
    }
    if (data.status === 'failed') {
      const err = data?.error || data?.logs || 'Replicate prediction failed';
      throw new Error(String(err));
    }
    return data;
  }

  private looksLikeReplicateVersion(value: string): boolean {
    return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
  }

  private async resolveReplicateVersion(modelOrVersion: string, token: string): Promise<string> {
    const raw = String(modelOrVersion || '').trim();
    if (!raw) throw new Error('REPLICATE_VIDEO_MODEL is empty');

    if (this.looksLikeReplicateVersion(raw)) return raw;

    // Allow owner/model:version-hash format.
    if (raw.includes(':')) {
      const [, maybeVersion] = raw.split(':');
      if (this.looksLikeReplicateVersion(maybeVersion || '')) return maybeVersion;
    }

    // Resolve owner/model slug to latest version.
    if (raw.includes('/')) {
      const cached = this.replicateVersionCache.get(raw);
      if (cached) return cached;

      const [owner, name] = raw.split('/');
      if (!owner || !name) throw new Error(`Invalid Replicate model slug: ${raw}`);

      const modelRes = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (!modelRes.ok) {
        const msg = await modelRes.text().catch(() => '');
        throw new Error(`Unable to resolve Replicate model "${raw}": HTTP ${modelRes.status} ${msg}`.trim());
      }
      const modelJson: any = await modelRes.json();
      const latestVersion = modelJson?.latest_version?.id || modelJson?.default_version?.id;
      if (!latestVersion || !this.looksLikeReplicateVersion(String(latestVersion))) {
        throw new Error(`Replicate model "${raw}" has no resolvable latest version id`);
      }
      this.replicateVersionCache.set(raw, String(latestVersion));
      return String(latestVersion);
    }

    throw new Error(
      'REPLICATE_VIDEO_MODEL must be a version hash, owner/model slug, or owner/model:version',
    );
  }
}
