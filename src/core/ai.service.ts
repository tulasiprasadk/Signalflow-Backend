import { Injectable } from '@nestjs/common';

// Internal response shape may vary by provider; keep `any` for flexibility.

@Injectable()
export class AiService {
  private llmUrl?: string;
  private llmKey?: string;
  private hfApiKey?: string;

  constructor() {
    this.llmUrl = process.env.LLM_API_URL;
    this.llmKey = process.env.LLM_API_KEY;
    this.hfApiKey = process.env.HUGGINGFACE_API_KEY;

    if (!this.llmUrl || !this.llmKey) {
      if (!this.hfApiKey) {
        console.error('❌ No LLM_API_URL/LLM_API_KEY or HUGGINGFACE_API_KEY configured');
        throw new Error('LLM provider is not configured');
      } else {
        console.warn('LLM_API not configured, falling back to Hugging Face');
      }
    }
  }

  get isLlmEnabled() {
    return !!(this.llmUrl && this.llmKey);
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

  async generateReels(prompt: string, count = 2): Promise<any> {
    try {
      // Prefer Replicate video generation if configured
      const replicateToken = process.env.REPLICATE_API_TOKEN;
      const replicateVideoModel = process.env.REPLICATE_VIDEO_MODEL;
      if (replicateToken && replicateVideoModel) {
        try {
          const data: any = await this.replicatePredict(replicateVideoModel, { prompt, num_outputs: count });
          const outputs = data.output || data.outputs || data.result;
          return { reels: Array.isArray(outputs) ? outputs.flat() : [], raw: data };
        } catch (e) {
          console.warn('Replicate reel generation failed, falling back:', e?.message || e);
        }
      }

      if (this.isLlmEnabled) {
        const data: any = await this.callLlm({ prompt, mode: 'reel', count });
        return { reels: data.reels || data.generated_reels || [], raw: data };
      }

      return { reels: [], raw: null };
    } catch (error) {
      console.error('❌ Reel generation failed:', error);
      return { error: 'Reel generation failed', message: error?.message || error } as any;
    }
  }

  private async replicatePredict(version: string, input: any): Promise<any> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error('REPLICATE_API_TOKEN not set');
    const endpoint = 'https://api.replicate.com/v1/predictions';
    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version, input }),
    });
    let data: any = await res.json();
    // Poll until finished
    const maxPoll = 30;
    let attempts = 0;
    while (data.status !== 'succeeded' && data.status !== 'failed' && attempts < maxPoll) {
      await new Promise(r => setTimeout(r, 1000));
      const poll = await fetch(`${endpoint}/${data.id}`, { headers: { Authorization: `Token ${token}` } });
      data = await poll.json();
      attempts += 1;
    }
    if (data.status === 'failed') throw new Error('Replicate prediction failed');
    return data;
  }
}
