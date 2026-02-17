import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './core/ai.service';
import { searchUnsplashImages } from './utils/unsplash.util';

@Controller('search')
export class SearchController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  async search(@Body() body: { query?: string; context?: any }) {
    const query = body?.query;
    const context = body?.context || {};
    const trimmedQuery = String(query || '').trim();
    const normalizedQuery = trimmedQuery || 'your campaign topic';
    const brandName = String(context?.brandName || '').trim();
    const tagline = String(context?.tagline || '').trim();
    const website = String(context?.website || '').trim();
    const email = String(context?.email || '').trim();
    const contact = String(context?.contact || '').trim();
    const description = String(context?.description || '').trim();
    const imagePrompt = String(context?.imagePrompt || '').trim();
    const launchContext = String(context?.launchContext || '').trim();
    const audience = String(context?.audience || '').trim();
    const match = normalizedQuery.match(/\btop\s+(\d+)|\b(\d+)\s+(benefits|reasons|ideas|tips)\b/i);
    const desiredCount = match ? Number(match[1] || match[2]) || 3 : 3;

    // Use AI service to generate live content
    const aiResult: {
      summary?: string;
      insights?: string[] | string | object;
      raw?: any;
      error?: string;
      message?: string;
    } = await this.aiService.generateInsights({
      name: brandName || normalizedQuery,
      description: [
        `Create an engaging social media post about: ${normalizedQuery}.`,
        `Business: ${brandName || normalizedQuery}.`,
        description ? `What we offer: ${description}.` : '',
        tagline ? `Brand tagline: "${tagline}".` : '',
        launchContext ? `Context: ${launchContext}.` : 'Context: recently launched (about a week ago).',
        audience ? `Target audience: ${audience}.` : '',
        website ? `Website: ${website}.` : '',
        contact ? `Contact: ${contact}.` : '',
        email ? `Email: ${email}.` : '',
        '',
        '🎯 INSTRUCTIONS:',
        'Return a JSON array of exactly ' + desiredCount + ' objects with "text" and "reason" fields.',
        '',
        '📝 WRITING STYLE:',
        `- Write in first person ("We at ${brandName || 'our company'} are excited...")`,
        `- Mention "${brandName || normalizedQuery}" naturally in the text`,
        '- Use enthusiastic but professional tone',
        '- Include specific details about products/services',
        '- Add emotional appeal and customer benefits',
        '- End with a clear call-to-action',
        '',
        '✅ STRUCTURE (3-4 sentences):',
        '1. Hook: Start with exciting announcement or question',
        `2. Value: Explain what ${brandName || 'we'} offers and why it matters`,
        '3. Details: Mention specific products/services/features',
        '4. CTA: Encourage action (visit, call, order, explore)',
        '',
        '❌ AVOID:',
        '- Generic corporate language',
        '- Repetitive phrases',
        '- Platform-specific hashtags (we add those separately)',
        '- Overly long text (keep under 200 characters for main message)',
      ].filter(Boolean).join('\n'),
      category: 'search',
    });
    if (aiResult.error) {
      console.warn('AI service error:', aiResult.error, aiResult.raw || aiResult.message || '');
    }

    // Robust parsing for insights (handle arrays, objects, strings, and fallback to extracting from raw)
    let insights: string[] = [];
    // 1) Direct field
    if (Array.isArray(aiResult.insights)) {
      insights = aiResult.insights.map(i => (typeof i === 'string' ? i : JSON.stringify(i))).filter(Boolean);
    } else if (typeof aiResult.insights === 'string') {
      insights = [aiResult.insights];
    } else if (aiResult.insights && typeof aiResult.insights === 'object') {
      insights = [JSON.stringify(aiResult.insights)];
    }

    // 2) If not found, inspect parsed raw stream (the proxy returns `raw` as array of parsed NDJSON objects)
    if (!insights.length && aiResult.raw) {
      try {
        if (Array.isArray(aiResult.raw)) {
          // Look for the last object that contains an `insights` array or a `summary`/`result` object
          for (let i = aiResult.raw.length - 1; i >= 0; i--) {
            const obj = aiResult.raw[i];
            if (!obj || typeof obj !== 'object') continue;
            if (Array.isArray(obj.insights) && obj.insights.length) {
              insights = obj.insights.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean);
              break;
            }
            // Some outputs embed JSON text in `response` or `result`
            if (typeof obj.response === 'string') {
              const m = obj.response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
              if (m) {
                try {
                  const arr = JSON.parse(m[0]);
                  if (Array.isArray(arr)) {
                    insights = arr.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean);
                    break;
                  }
                } catch {}
              }
            }
            if (typeof obj.result === 'string') {
              const m2 = obj.result.match(/\[\s*\{[\s\S]*?\}\s*\]/);
              if (m2) {
                try {
                  const arr = JSON.parse(m2[0]);
                  if (Array.isArray(arr)) {
                    insights = arr.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean);
                    break;
                  }
                } catch {}
              }
            }
          }
        } else if (typeof aiResult.raw === 'string') {
          const m = aiResult.raw.match(/\[\s*\{[\s\S]*?\}\s*\]/);
          if (m) {
            try {
              const arr = JSON.parse(m[0]);
              if (Array.isArray(arr)) insights = arr.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean);
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn('Failed to extract insights from raw stream:', e);
      }
    }

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizeSentenceCount = (text: string) => {
      const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      return parts.slice(0, 2).join(' ');
    };
    const dedupeRepeated = (value: string) => {
      const separators = [':', ' - ', ' — ', ' – ', '. ', '; '];
      for (const sep of separators) {
        const parts = value.split(sep);
        if (parts.length === 2) {
          const first = parts[0].trim();
          const second = parts[1].trim();
          if (first.toLowerCase() === second.toLowerCase()) {
            return first;
          }
          if (second.toLowerCase().startsWith(first.toLowerCase())) {
            return second;
          }
        }
      }
      return value;
    };
    const ensureSingleQueryMention = (text: string, queryText: string) => {
      const pattern = new RegExp(escapeRegExp(queryText), 'ig');
      let count = 0;
      const replaced = text.replace(pattern, (match) => {
        count += 1;
        return count === 1 ? match : 'it';
      });
      const hasQuery = pattern.test(text);
      if (!hasQuery) {
        return `${queryText} ${replaced}`;
      }
      return replaced.replace(/\s{2,}/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();
    };
    const sanitizeInsightText = (text: string) => {
      let cleaned = dedupeRepeated(text);
      
      // Remove common prompt/instruction artifacts and extra symbols
      const promptPatterns = [
        /^.*?(Create an engaging|Write|Generate|Post about|Say something about|Create|Write in).*?:\s*/i,
        /\b(Business:|Brand tagline:|Target audience:|Context:|What we offer:|Website:|Contact:|Email:)\s*/gi,
        /\b(INSTRUCTIONS|AVOID|STRUCTURE|WRITING STYLE|Format:|Return|JSON|Tone:|Voice:)[\s\S]*?(?=\n|$)/gi,
        /^[✅❌🎯📝📄🚀💼✨🎉🥬💡]*\s*/,
        /^\[.*?\]\s*/,
        /\n\s*(—|–|-|•|·)\s*(Generic|Repetitive|Overly|Platform-specific|Avoid:|Hook:|Value:|Details:|CTA:)[\s\S]*?(?=\n|$)/gi,
        /^\d+\.\s*(Hook|Value|Details|CTA|Scene).*?:\s*/gi,
        /[\[\{\}\]]+/g,
        /\b(text|reason|insights|message|content):\s*/gi,
      ];
      
      for (const pattern of promptPatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
      
      // Remove remaining special characters except basic punctuation
      cleaned = cleaned.replace(/[☐✓✔️×✗]/g, '');
      cleaned = cleaned.replace(/◻️|⬜|▢/g, '');
      
      // Ensure single mention of query
      cleaned = ensureSingleQueryMention(cleaned, normalizedQuery);
      cleaned = normalizeSentenceCount(cleaned);
      
      // Clean up whitespace
      cleaned = cleaned
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .trim();
      
      // Remove leading numbers and dots if they appear as list markers
      cleaned = cleaned.replace(/^[\d\.\s]*/, '').trim();
      
      return cleaned;
    };
    const buildFallbackInsights = (topic: string, count: number) => {
      const brandLabel = brandName || 'our platform';
      const offerings = description || 'quality products, reliable services, and expert consultancy';
      const taglineText = tagline || 'Your trusted partner for all your needs';
      const websiteText = website || 'our website';
      const contactInfo = [contact, email].filter(Boolean);
      
      // Create topic-specific content
      const topicLower = topic.toLowerCase();
      let hook = '🎉 Exciting news!';
      let value = '';
      let cta = `Visit ${websiteText} to explore more!`;
      
      if (topicLower.includes('vegetable') || topicLower.includes('fresh') || topicLower.includes('food') || topicLower.includes('deliver')) {
        hook = '🥬 Fresh, farm-picked produce delivered to your doorstep!';
        value = `At ${brandLabel}, we bring you the freshest vegetables, fruits, and groceries - handpicked daily for quality you can trust. ${taglineText}`;
        cta = contactInfo.length ? `Order now: ${contactInfo.join(' or ')} | ${websiteText}` : `Order now at ${websiteText}`;
      } else if (topicLower.includes('launch') || topicLower.includes('new') || topicLower.includes('announce')) {
        hook = `🚀 ${brandLabel.toUpperCase()} is now LIVE!`;
        value = `We're thrilled to bring you ${offerings}. ${launchContext || 'Just launched and ready to serve!'} ${taglineText}`;
        cta = contactInfo.length ? `Get started today: ${contactInfo.join(' • ')}` : `Visit ${websiteText} now`;
      } else if (topicLower.includes('service') || topicLower.includes('consult')) {
        hook = '💼 Need expert solutions?';
        value = `${brandLabel} offers ${offerings}. We're here to make your life easier with personalized service and professional expertise. ${taglineText}`;
        cta = contactInfo.length ? `Let's talk: ${contactInfo.join(' or ')}` : `Learn more at ${websiteText}`;
      } else {
        hook = `✨ Discover ${brandLabel}`;
        value = `Your one-stop destination for ${offerings}. Whether you're looking for products, services, or expert advice, we've got you covered. ${taglineText}`;
        cta = `Explore: ${websiteText}${contactInfo.length ? ' | ' + contactInfo.join(' • ') : ''}`;
      }
      
      const templates = [
        { text: `${hook} ${value}\n\n${cta}`, reason: 'Engaging hook with value proposition and clear CTA' },
        { text: `Looking for ${offerings.split(',')[0]}? ${brandLabel} delivers excellence every time! ${taglineText}\n\n${cta}`, reason: 'Problem-solution format' },
        { text: `${brandLabel} brings you ${offerings} - all in one place! ${launchContext || 'Ready to serve you!'}\n\n${taglineText}\n${cta}`, reason: 'Convenience-focused message' },
      ];
      
      return templates.slice(0, Math.max(1, count));
    };

    // Fallback if no live insight
    if (!insights.length) {
      insights = buildFallbackInsights(normalizedQuery, desiredCount).map(item => JSON.stringify(item));
    }

    const normalizedInsights = insights.map((insight) => {
      try {
        const parsed = typeof insight === 'string' ? JSON.parse(insight) : insight;
        if (parsed && typeof parsed === 'object') {
          const rawText = typeof parsed.text === 'string' ? parsed.text : String(parsed.text || insight);
          return JSON.stringify({
            ...parsed,
            text: sanitizeInsightText(rawText),
            reason: parsed.reason || `Mentions ${normalizedQuery} once and stays on-topic.`,
          });
        }
      } catch {
        // fall through
      }
      return JSON.stringify({
        text: sanitizeInsightText(String(insight)),
        reason: `Mentions ${normalizedQuery} once and stays on-topic.`,
      });
    });
    insights = normalizedInsights;



    // Fetch real Unsplash images with better query
    let images: string[] = [];
    // Build a more specific image query
    const imageQueryParts = [];
    if (imagePrompt) {
      imageQueryParts.push(imagePrompt);
    } else {
      // Extract key terms from topic and description
      if (brandName && brandName !== 'your campaign topic') imageQueryParts.push(brandName);
      if (normalizedQuery && normalizedQuery !== 'your campaign topic') {
        const cleanQuery = normalizedQuery.replace(/\b(top|best|how|why|what|when|where)\b/gi, '').trim();
        imageQueryParts.push(cleanQuery);
      }
      // Add category hints
      if (description.toLowerCase().includes('ecommerce') || description.toLowerCase().includes('shop')) {
        imageQueryParts.push('shopping ecommerce products');
      }
      if (description.toLowerCase().includes('food') || description.toLowerCase().includes('restaurant')) {
        imageQueryParts.push('food delivery restaurant');
      }
      if (description.toLowerCase().includes('service')) {
        imageQueryParts.push('business service professional');
      }
    }
    const imageQuery = imageQueryParts.join(' ').trim() || normalizedQuery;
    
    try {
      if (this.aiService.isLlmEnabled) {
        const imgRes = await this.aiService.generateImages(imageQuery, 3);
        if (imgRes && Array.isArray(imgRes.images) && imgRes.images.length) {
          images = imgRes.images as string[];
        } else {
          images = await searchUnsplashImages(imageQuery, 3);
        }
      } else {
        images = await searchUnsplashImages(imageQuery, 3);
      }
    } catch (e) {
      console.warn('Unsplash image search failed:', e);
      images = [
        'https://images.unsplash.com/photo-1556742393-d75f468bfcb0?w=1200&h=800&fit=crop',
        'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=800&fit=crop',
        'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&h=800&fit=crop',
      ];
    }

    // If Unsplash API key is not configured and we still have no images, use direct Unsplash URLs
    if (!images || !images.length) {
      try {
        const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
        if (!unsplashKey) {
          images = [
            'https://images.unsplash.com/photo-1556742393-d75f468bfcb0?w=1200&h=800&fit=crop',
            'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&h=800&fit=crop',
            'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&h=800&fit=crop',
          ];
        }
      } catch (e) {
        // ignore
      }
    }

    // Fetch reels if available (no YouTube link fallback)
    let reels: string[] = [];
    let videoPlan: any = null;
    try {
      if (this.aiService.isLlmEnabled) {
        const r = await this.aiService.generateReels(normalizedQuery, 1);
        if (r && Array.isArray(r.reels) && r.reels.length) {
          reels = r.reels as string[];
        } else {
          reels = [];
        }
      }
    } catch (e) {
      console.warn('YouTube video search failed:', e);
      reels = [];
    }

    if (!reels || !reels.length) {
      const subject = brandName || normalizedQuery;
      const contactLine = [website, email, contact].filter(Boolean).join(' • ');
      videoPlan = {
        durationSeconds: 18,
        format: 'Vertical 9:16',
        script: [
          `Scene 1 (0-4s): Logo + "${subject} is now live"`,
          `Scene 2 (4-10s): Showcase products, services, consultancy in quick cuts`,
          `Scene 3 (10-15s): Benefit line: "Everything you need in one place"`,
          `Scene 4 (15-18s): CTA: "Visit ${website || subject}"`,
        ],
        notes: contactLine ? `Include contact line: ${contactLine}` : 'Add contact details in caption.',
      };
    }

    // Debug: Print env keys at runtime
  

    // insights already normalized above

    // Short human-friendly result: prefer first insight text
    let shortResult = '';
    const firstInsight = normalizedInsights[0];
    if (firstInsight) {
      try {
        const parsed = JSON.parse(firstInsight);
        if (parsed?.text) {
          shortResult = parsed.text;
        }
      } catch {
        // ignore
      }
    }
    if (!shortResult) {
      if (aiResult.summary && typeof aiResult.summary === 'string') {
        const s = aiResult.summary.trim();
        const m = s.match(/([\s\S]*?[.!?])(\s|$)/);
        shortResult = m ? m[1].trim() : (s.length > 200 ? s.slice(0, 197) + '...' : s);
      } else if (aiResult.raw && typeof aiResult.raw === 'string') {
        const s = aiResult.raw.trim();
        shortResult = s.length > 200 ? s.slice(0, 197) + '...' : s;
      } else {
        shortResult = `AI search result for: ${query}`;
      }
    }
    const sanitizeResultText = (text: string, queryText: string): string => {
      let cleaned = text || '';
      cleaned = cleaned.replace(/[☐□■]/g, '');
      cleaned = cleaned.replace(/\b(TEST|PROMPT|INPUT|QUERY|TOPIC)\b/gi, '');
      cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
      if (queryText && cleaned.toLowerCase().startsWith(queryText.toLowerCase())) {
        cleaned = cleaned.replace(new RegExp(`^${queryText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').trim();
      }
      return cleaned || text;
    };

    shortResult = sanitizeResultText(shortResult, normalizedQuery);

    // Generate relevant hashtags - only context-matched and topic-specific
    const generateHashtags = (): string => {
      const hashtags: string[] = [];
      const lowerQuery = normalizedQuery.toLowerCase();
      const lowerDesc = description.toLowerCase();
      const lowerAudience = (audience || '').toLowerCase();
      const lowerLaunch = (launchContext || '').toLowerCase();

      const stopwords = new Set([
        'with', 'from', 'that', 'have', 'your', 'about', 'best', 'top', 'this', 'for',
        'and', 'the', 'are', 'you', 'our', 'new', 'now', 'live', 'launch', 'launching',
        'product', 'service', 'services', 'consulting', 'consultancy', 'business', 'brand',
      ]);

      const toHashtag = (value: string) => {
        const cleaned = value.replace(/[^a-z0-9\s]/gi, ' ').trim();
        if (!cleaned) return '';
        const parts = cleaned.split(/\s+/).filter(Boolean);
        const tag = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        return tag.length > 2 ? `#${tag}` : '';
      };

      const pushTag = (tag: string) => {
        if (!tag) return;
        if (!hashtags.includes(tag)) hashtags.push(tag);
      };

      // 1) Brand tag
      if (brandName && brandName !== 'your campaign topic') {
        pushTag(toHashtag(brandName));
      }

      // 2) Topic keywords
      const topicWords = normalizedQuery
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 2 && !stopwords.has(w))
        .slice(0, 6);
      topicWords.forEach(w => pushTag(toHashtag(w)));

      // 3) Description and audience keywords
      const descWords = `${lowerDesc} ${lowerAudience}`
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ''))
        .filter(w => w.length > 3 && !stopwords.has(w))
        .slice(0, 4);
      descWords.forEach(w => pushTag(toHashtag(w)));

      // 4) Industry tags (single set, max 3)
      const industryMap: Record<string, string[]> = {
        ecommerce: ['#ECommerce', '#OnlineShopping', '#ShopOnline'],
        food: ['#FoodDelivery', '#FoodieLife', '#EatLocal'],
        restaurant: ['#RestaurantLife', '#DineIn', '#LocalFood'],
        grocery: ['#GroceryDeals', '#FreshProduce', '#FarmFresh'],
        health: ['#Wellness', '#HealthyLiving', '#HealthFirst'],
        fitness: ['#FitnessGoals', '#FitLife', '#GymLife'],
        beauty: ['#BeautyTips', '#SelfCare', '#GlowUp'],
        fashion: ['#FashionTrends', '#StyleInspo', '#OOTD'],
        'real estate': ['#RealEstate', '#DreamHome', '#Property'],
        service: ['#TrustedService', '#CustomerFirst', '#ServicePros'],
        business: ['#SmallBusiness', '#BusinessGrowth', '#Entrepreneur'],
      };

      for (const [keyword, tags] of Object.entries(industryMap)) {
        if (lowerDesc.includes(keyword) || lowerQuery.includes(keyword)) {
          tags.slice(0, 3).forEach(tag => pushTag(tag));
          break;
        }
      }

      // 5) Launch/announcement tags
      if (lowerQuery.includes('launch') || lowerLaunch.includes('launch') || lowerQuery.includes('new')) {
        ['#NewLaunch', '#NowLive', '#LaunchDay'].forEach(tag => pushTag(tag));
      }

      // Final: cap to 10 relevant tags
      const filtered = hashtags.filter(tag => tag.length > 2).slice(0, 10);
      return filtered.join(' ');
    };

    const hashtags = generateHashtags();

    return {
      result: shortResult,
      insights,
      reels,
      videoPlan,
      images,
      hashtags,
      raw: aiResult,
    };
  }
}
