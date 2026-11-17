import { GoogleGenAI } from '@google/genai';

export interface GroundedNewsItem {
  id: string;
  title: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  catalyst: string;
  summary: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface MarketNewsResult {
  symbol: string;
  items: GroundedNewsItem[];
  sources: GroundingSource[];
  searchQueries: string[];
  generatedAt: number;
  cached: boolean;
}

export class NewsServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502
  ) {
    super(message);
    this.name = 'NewsServiceError';
  }
}

const NEWS_CACHE_TTL_MS = 180_000; // 3 minutes

export class MarketNewsService {
  private cachedResult: MarketNewsResult | null = null;
  private cacheExpiresAt = 0;

  private createClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new NewsServiceError(
        'Cheia GEMINI_API_KEY nu este configurată. Verificați panoul Settings > Secrets.',
        503
      );
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  public async getLatestXauUsdNews(forceRefresh = false): Promise<MarketNewsResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && now < this.cacheExpiresAt) {
      return {
        ...this.cachedResult,
        cached: true,
      };
    }

    const ai = this.createClient();

    const prompt = [
      'Caută pe web cele mai recente știri financiare și catalizatori macroeconomici pentru XAU/USD (Aur spot, Rezerva Federală / dobânzi Fed, indicele DXY, randamente titluri US Treasury, date inflație / locuri de muncă și cerere safe-haven).',
      'Returnează STRICT un array JSON valid (fără text înainte sau după) cu 4-5 știri actuale, fiecare obiect având câmpurile exacte:',
      '{ "title": "Titlu concis în limba română", "impact": "BULLISH" | "BEARISH" | "NEUTRU", "catalyst": "ex: Fed / DXY / Macro / Geopolitic", "summary": "Rezumat clar de 1-2 propoziții în limba română cu cifre reale din știri." }',
    ].join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawText = (response.text ?? '').trim();
      const items = this.parseNewsItems(rawText);

      const metadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = metadata?.groundingChunks ?? [];
      const seenUris = new Set<string>();
      const sources: GroundingSource[] = [];

      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri;
        const title = chunk.web?.title;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: title || new URL(uri).hostname,
            uri,
          });
        }
      }

      const searchQueries = metadata?.webSearchQueries ?? [];

      const result: MarketNewsResult = {
        symbol: 'XAU/USD',
        items,
        sources: sources.slice(0, 8),
        searchQueries,
        generatedAt: Date.now(),
        cached: false,
      };

      this.cachedResult = result;
      this.cacheExpiresAt = Date.now() + NEWS_CACHE_TTL_MS;
      return result;
    } catch (err) {
      if (err instanceof NewsServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
        throw new NewsServiceError(
          'Cheia GEMINI_API_KEY este invalidă sau lipsesc permisiunile. Verificați Settings > Secrets.',
          403
        );
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new NewsServiceError(
          'Limita de cereri Gemini API (429) a fost atinsă. Puteți verifica cota sau selecta o cheie cu facturare activă în Settings > Secrets.',
          429
        );
      }
      throw new NewsServiceError(
        'Nu s-au putut prelua știrile XAU/USD prin Google Search Grounding.',
        502
      );
    }
  }

  private parseNewsItems(rawText: string): GroundedNewsItem[] {
    // Strip markdown code fences if present
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const jsonStart = cleaned.indexOf('[');
    const jsonEnd = cleaned.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as unknown[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 6).map((entry, idx) => {
            const obj = (entry ?? {}) as Record<string, unknown>;
            const rawImpact = String(obj.impact ?? 'NEUTRU').toUpperCase();
            const impact: GroundedNewsItem['impact'] =
              rawImpact === 'BULLISH' || rawImpact === 'BEARISH' ? rawImpact : 'NEUTRU';
            return {
              id: `news-${idx}-${Date.now()}`,
              title: String(obj.title ?? 'Actualizare Piață XAU/USD').slice(0, 160),
              impact,
              catalyst: String(obj.catalyst ?? 'Macro / XAU').slice(0, 48),
              summary: String(obj.summary ?? '').slice(0, 420),
            };
          });
        }
      } catch {
        // Fall through to structured prose fallback
      }
    }

    if (!cleaned) {
      throw new NewsServiceError('Răspuns gol de la serviciul de știri grounded.', 502);
    }

    return [
      {
        id: `news-0-${Date.now()}`,
        title: 'Sinteză Piață XAU/USD (Google Search Grounding)',
        impact: 'NEUTRU',
        catalyst: 'Macro / XAU',
        summary: cleaned.slice(0, 500),
      },
    ];
  }
}
