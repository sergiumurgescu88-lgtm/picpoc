import { GoogleGenAI } from '@google/genai';

export interface GroundedNewsItem {
  id: string;
  title: string;
  impact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  catalyst: string;
  summary: string;
  sourceName: string;
  url: string;
  publishedAt: number;
}

export interface MacroCalendarEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  timestamp: number;
  impact: 'HIGH' | 'MEDIUM';
  forecast: string;
  previous: string;
}

export interface FredMacroMetric {
  seriesId: 'DFII10' | 'DGS10' | 'T10YIE';
  label: string;
  value: number;
  changeBps: number;
  observationDate: string;
  goldImpact: 'BULLISH' | 'BEARISH' | 'NEUTRU';
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ExternalApiStatus {
  id: 'finnhub' | 'marketaux' | 'alphavantage' | 'newsdata';
  name: string;
  configured: boolean;
  articlesLoaded: number;
}

export interface MarketNewsResult {
  symbol: string;
  items: GroundedNewsItem[];
  macroEvents: MacroCalendarEvent[];
  macroPulse: FredMacroMetric[];
  sentimentSummary: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRU';
  };
  apiStatus: ExternalApiStatus[];
  sources: GroundingSource[];
  activeProviders: string[];
  aiTranslated: boolean;
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

interface RawFeedArticle {
  title: string;
  description: string;
  url: string;
  sourceName: string;
  publishedAt: number;
  sentimentHint?: 'BULLISH' | 'BEARISH' | 'NEUTRU';
}

interface ProviderCacheEntry {
  articles: RawFeedArticle[];
  expiresAt: number;
}

const NEWS_CACHE_TTL_MS = 180_000; // 3 minutes overall composite cache
const MACRO_CACHE_TTL_MS = 30 * 60_000; // 30 minutes for calendar & FRED CSV series

// Per-provider caches calibrated to never exceed free-tier daily quotas (24/7 operation):
const FINNHUB_TTL_MS = 3 * 60_000; // 60 req/min free tier -> refresh every 3m
const NEWSDATA_TTL_MS = 15 * 60_000; // 200 credits/day free tier -> max 96 req/day
const MARKETAUX_TTL_MS = 20 * 60_000; // 100 req/day free tier -> max 72 req/day
const ALPHAVANTAGE_TTL_MS = 65 * 60_000; // 25 req/day free tier -> max 22 req/day

function readCleanApiKey(...envNames: string[]): string {
  for (const name of envNames) {
    const raw = (process.env[name] || '').trim().replace(/^["']|["']$/g, '');
    if (
      raw &&
      !raw.startsWith('MY_') &&
      !raw.startsWith('YOUR_') &&
      raw !== 'undefined' &&
      raw !== 'null'
    ) {
      return raw;
    }
  }
  return '';
}

const PUBLIC_RSS_FEEDS: { name: string; url: string }[] = [
  {
    name: 'Investing.com Commodities',
    url: 'https://www.investing.com/rss/news_11.rss',
  },
  {
    name: 'Google News · Gold & Fed Wire',
    url: 'https://news.google.com/rss/search?q=(%22gold+price%22+OR+XAUUSD+OR+%22spot+gold%22+OR+%22Federal+Reserve%22+OR+%22Treasury+yields%22)+when:2d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'MarketWatch · Dow Jones Pulse',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse',
  },
  {
    name: 'CNBC Macro & Economy',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
  {
    name: 'Federal Reserve Monetary Policy',
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
  },
  {
    name: 'ECB Monetary Policy & Press',
    url: 'https://www.ecb.europa.eu/rss/press.html',
  },
  {
    name: 'Yahoo Finance · Gold & DXY',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F,DX-Y.NYB&region=US&lang=en-US',
  },
];

const GOLD_RELEVANCE_KEYWORDS = [
  'gold',
  'xau',
  'xauusd',
  'bullion',
  'precious metal',
  'ounce',
  'fed',
  'federal reserve',
  'fomc',
  'powell',
  'ecb',
  'lagarde',
  'interest rate',
  'rate cut',
  'rate hike',
  'inflation',
  'cpi',
  'pce',
  'payroll',
  'nfp',
  'jobless',
  'unemployment',
  'treasury',
  'yield',
  'dxy',
  'dollar',
  'greenback',
  'tariff',
  'safe-haven',
  'safe haven',
  'central bank',
  'geopolit',
  'middle east',
  'sanction',
];

const NOISE_EXCLUSION_KEYWORDS = [
  'drill hole',
  'drill program',
  'drilled',
  'mineralization',
  'assay',
  'heap leach',
  'tsxv:',
  'otcqb:',
  'exploration corp',
  'metres of',
];

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x2019;|&#8217;/gi, '’')
    .replace(/&#x2018;|&#8216;/gi, '‘')
    .replace(/&#x201C;|&#x201D;|&#8220;|&#8221;/gi, '"')
    .replace(/&#x2013;|&#x2014;|&#8211;|&#8212;/gi, '–')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1]) : '';
}

function classifyGoldMacroImpact(
  title: string,
  description: string,
  sentimentHint?: 'BULLISH' | 'BEARISH' | 'NEUTRU'
): { impact: 'BULLISH' | 'BEARISH' | 'NEUTRU'; catalyst: string; defaultSummaryRo: string } {
  const text = `${title} ${description}`.toLowerCase();

  let catalyst = 'Piața Spot XAU/USD';
  if (/\b(fed|federal reserve|fomc|powell|ecb|lagarde|rate cut|rate hike|monetary policy|hawkish|dovish)\b/.test(text)) {
    catalyst = 'Bănci Centrale / Dobânzi';
  } else if (/\b(cpi|pce|inflation|payroll|nfp|jobs|unemployment|jobless|gdp|retail sales)\b/.test(text)) {
    catalyst = 'Date Macro SUA (CPI/NFP)';
  } else if (/\b(dxy|dollar|greenback|treasury|yield|10-year|bond|tips)\b/.test(text)) {
    catalyst = 'DXY & Randamente US10Y';
  } else if (/\b(geopolit|war|middle east|tariff|sanction|safe-haven|safe haven|central bank)\b/.test(text)) {
    catalyst = 'Geopolitic / Safe-Haven';
  }

  let bullScore = 0;
  let bearScore = 0;

  const bullishPatterns = [
    /gold\s+(?:price\s+)?(?:rises|jumps|surges|climbs|gains|rebounds|rallies|hits\s+record|nears\s+record|advances|stabilizes|extends\s+gains)/,
    /\b(?:bulls|bullish|rally|breakout|upside|all-time\s+high|record\s+high)\b/,
    /rate\s+cut|cuts\s+rates/,
    /dovish/,
    /cooler\s+inflation|inflation\s+cools|softer\s+cpi/,
    /weaker\s+dollar|dollar\s+(?:falls|drops|slides|weakens|retreats|dips)/,
    /yields?\s+(?:fall|drop|slide|retreat|ease|dip)/,
    /safe[-\s]haven\s+(?:demand|buying|flows|bid)|central\s+bank\s+buying/,
    /tariff\s+(?:fears|threat|uncertainty)|geopolitical\s+(?:risk|tension)/,
    /rising\s+unemployment|weak\s+jobs|jobless\s+claims\s+rise/,
  ];

  const bearishPatterns = [
    /gold\s+(?:price\s+)?(?:falls|drops|slides|slumps|tumbles|retreats|dips|sinks|loses|opens\s+at\s+lowest|hits\s+.*low|hovers\s+near\s+.*low|weighs?\s+on\s+gold|selloff)/,
    /\b(?:bears|bearish|lowest\s+price|multi-week\s+low|under\s+pressure|pullback|sell-off|downside)\b/,
    /rate\s+hike|fed\s+hike|hikes\s+rates/,
    /hawkish|higher\s+for\s+longer/,
    /hot\s+inflation|sticky\s+inflation|cpi\s+beats|strong\s+jobs|strong\s+payrolls/,
    /stronger\s+dollar|dollar\s+(?:rises|jumps|surges|climbs|strengthens|rallies|firm)/,
    /yields?\s+(?:rise|jump|surge|climb|spike)/,
    /profit[-\s]taking|buckle\s+under\s+gold[-\s]price\s+slide/,
  ];

  for (const pat of bullishPatterns) {
    if (pat.test(text)) bullScore += 2;
  }
  for (const pat of bearishPatterns) {
    if (pat.test(text)) bearScore += 2;
  }

  let impact: 'BULLISH' | 'BEARISH' | 'NEUTRU' = sentimentHint ?? 'NEUTRU';
  if (bullScore > bearScore) impact = 'BULLISH';
  else if (bearScore > bullScore) impact = 'BEARISH';

  const cleanDesc =
    description &&
    description.length > 30 &&
    !description.toLowerCase().startsWith(title.toLowerCase().slice(0, 25))
      ? description.slice(0, 260)
      : impact === 'BULLISH'
        ? `Catalizator cu potențial de susținere (Bullish) pentru XAU/USD pe fondul dinamicii din zona ${catalyst}.`
        : impact === 'BEARISH'
          ? `Factor de presiune (Bearish) asupra XAU/USD corelat cu evoluția ${catalyst} și apetitul pentru dolar/randamente.`
          : `Eveniment monitorizat pentru volatilitatea intraday XAU/USD (${catalyst}).`;

  return { impact, catalyst, defaultSummaryRo: cleanDesc };
}

export class MarketNewsService {
  private cachedResult: MarketNewsResult | null = null;
  private cacheExpiresAt = 0;

  private cachedCalendar: MacroCalendarEvent[] = [];
  private calendarExpiresAt = 0;

  private cachedMacroPulse: FredMacroMetric[] = [];
  private macroPulseExpiresAt = 0;

  private finnhubCache: ProviderCacheEntry = { articles: [], expiresAt: 0 };
  private marketauxCache: ProviderCacheEntry = { articles: [], expiresAt: 0 };
  private newsdataCache: ProviderCacheEntry = { articles: [], expiresAt: 0 };
  private alphaVantageCache: ProviderCacheEntry = { articles: [], expiresAt: 0 };

  public async getLatestXauUsdNews(forceRefresh = false): Promise<MarketNewsResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && now < this.cacheExpiresAt) {
      return {
        ...this.cachedResult,
        cached: true,
      };
    }

    const finnhubConfigured = Boolean(
      readCleanApiKey('FINNHUB_API_KEY', 'FINNHUB_KEY', 'FINNHUB_TOKEN')
    );
    const marketauxConfigured = Boolean(
      readCleanApiKey('MARKETAUX_API_KEY', 'MARKETAUX_KEY', 'MARKETAUX_TOKEN')
    );
    const newsdataConfigured = Boolean(
      readCleanApiKey('NEWSDATA_API_KEY', 'NEWSDATA_IO_API_KEY', 'NEWSDATA_KEY')
    );
    const alphaVantageConfigured = Boolean(
      readCleanApiKey('ALPHA_VANTAGE_API_KEY', 'ALPHAVANTAGE_API_KEY', 'ALPHA_VANTAGE_KEY')
    );

    // Fetch 7 zero-key institutional RSS feeds + 4 optional free-key APIs + USD Macro Calendar + St. Louis Fed FRED Yields
    const [
      rssSettlements,
      finnhubArticles,
      marketauxArticles,
      newsdataArticles,
      alphaVantageArticles,
      macroEvents,
      macroPulse,
    ] = await Promise.all([
      Promise.allSettled(PUBLIC_RSS_FEEDS.map((feed) => this.fetchRssFeed(feed.name, feed.url))),
      this.fetchOptionalFinnhubNews(forceRefresh),
      this.fetchOptionalMarketauxNews(),
      this.fetchOptionalNewsDataIo(),
      this.fetchOptionalAlphaVantageNews(),
      this.fetchMacroCalendar(),
      this.fetchFredMacroPulse(),
    ]);

    const activeProviders: string[] = [];
    const allRaw: RawFeedArticle[] = [];

    if (finnhubArticles.length > 0) {
      activeProviders.push('Finnhub Forex API');
      allRaw.push(...finnhubArticles);
    } else if (finnhubConfigured) {
      activeProviders.push('Finnhub Forex API');
    }

    if (marketauxArticles.length > 0) {
      activeProviders.push('Marketaux Gold API');
      allRaw.push(...marketauxArticles);
    } else if (marketauxConfigured) {
      activeProviders.push('Marketaux Gold API');
    }

    if (newsdataArticles.length > 0) {
      activeProviders.push('NewsData.io Global API');
      allRaw.push(...newsdataArticles);
    } else if (newsdataConfigured) {
      activeProviders.push('NewsData.io Global API');
    }

    if (alphaVantageArticles.length > 0) {
      activeProviders.push('Alpha Vantage Sentiment API');
      allRaw.push(...alphaVantageArticles);
    } else if (alphaVantageConfigured) {
      activeProviders.push('Alpha Vantage Sentiment API');
    }

    rssSettlements.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value.length > 0) {
        activeProviders.push(PUBLIC_RSS_FEEDS[idx].name);
        allRaw.push(...res.value);
      }
    });

    if (macroPulse.length > 0) {
      activeProviders.push('FRED St. Louis Fed');
    }

    const apiStatus: ExternalApiStatus[] = [
      {
        id: 'finnhub',
        name: 'Finnhub',
        configured: finnhubConfigured,
        articlesLoaded: finnhubArticles.length,
      },
      {
        id: 'marketaux',
        name: 'Marketaux',
        configured: marketauxConfigured,
        articlesLoaded: marketauxArticles.length,
      },
      {
        id: 'alphavantage',
        name: 'Alpha Vantage',
        configured: alphaVantageConfigured,
        articlesLoaded: alphaVantageArticles.length,
      },
      {
        id: 'newsdata',
        name: 'NewsData.io',
        configured: newsdataConfigured,
        articlesLoaded: newsdataArticles.length,
      },
    ];

    // Filter for XAU/USD & Macro relevance and deduplicate by normalized title
    const seenTitles = new Set<string>();
    const relevantArticles: RawFeedArticle[] = [];

    for (const art of allRaw) {
      const hay = `${art.title} ${art.description}`.toLowerCase();
      if (NOISE_EXCLUSION_KEYWORDS.some((kw) => hay.includes(kw))) continue;

      const isPreFilteredGoldOrCentralBank =
        art.sourceName.includes('Commodities') ||
        art.sourceName.includes('Federal Reserve') ||
        art.sourceName.includes('Marketaux') ||
        art.sourceName.includes('NewsData');
      const hasRelevantKeyword = GOLD_RELEVANCE_KEYWORDS.some((kw) => hay.includes(kw));
      if (!isPreFilteredGoldOrCentralBank && !hasRelevantKeyword) continue;

      const normTitle = art.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 55);
      if (!normTitle || seenTitles.has(normTitle)) continue;
      seenTitles.add(normTitle);
      relevantArticles.push(art);
    }

    // Prioritize direct Gold/XAU/Fed mentions first, then newest timestamp
    relevantArticles.sort((a, b) => {
      const aGold = /\b(gold|xau|xauusd|bullion|fomc|powell)\b/i.test(a.title) ? 1 : 0;
      const bGold = /\b(gold|xau|xauusd|bullion|fomc|powell)\b/i.test(b.title) ? 1 : 0;
      if (aGold !== bGold) return bGold - aGold;
      return b.publishedAt - a.publishedAt;
    });

    const topRaw = relevantArticles.slice(0, 14);

    if (topRaw.length === 0 && this.cachedResult) {
      return {
        ...this.cachedResult,
        apiStatus,
        cached: true,
      };
    }

    let items: GroundedNewsItem[] = topRaw.map((art, idx) => {
      const cls = classifyGoldMacroImpact(art.title, art.description, art.sentimentHint);
      return {
        id: `news-${idx}-${art.publishedAt}`,
        title: art.title.slice(0, 175),
        impact: cls.impact,
        catalyst: cls.catalyst,
        summary: cls.defaultSummaryRo,
        sourceName: art.sourceName,
        url: art.url,
        publishedAt: art.publishedAt,
      };
    });

    // Optional non-blocking Romanian enrichment via Gemini ONLY if key is valid & responsive
    let aiTranslated = false;
    if (items.length > 0) {
      const enriched = await this.tryOptionalGeminiRomanianEnrichment(items);
      if (enriched) {
        items = enriched;
        aiTranslated = true;
      }
    }

    const bullishCount = items.filter((i) => i.impact === 'BULLISH').length;
    const bearishCount = items.filter((i) => i.impact === 'BEARISH').length;
    const neutralCount = items.length - bullishCount - bearishCount;
    const bias: 'BULLISH' | 'BEARISH' | 'NEUTRU' =
      bullishCount > bearishCount
        ? 'BULLISH'
        : bearishCount > bullishCount
          ? 'BEARISH'
          : 'NEUTRU';

    const sources: GroundingSource[] = items
      .filter((it) => Boolean(it.url))
      .map((it) => ({
        title: `${it.sourceName} — ${it.title.slice(0, 68)}`,
        uri: it.url,
      }));

    const result: MarketNewsResult = {
      symbol: 'XAU/USD',
      items,
      macroEvents,
      macroPulse,
      sentimentSummary: {
        bullishCount,
        bearishCount,
        neutralCount,
        bias,
      },
      apiStatus,
      sources,
      activeProviders,
      aiTranslated,
      generatedAt: Date.now(),
      cached: false,
    };

    if (items.length > 0) {
      this.cachedResult = result;
      this.cacheExpiresAt = Date.now() + NEWS_CACHE_TTL_MS;
    }

    return result;
  }

  private async fetchRssFeed(feedName: string, url: string): Promise<RawFeedArticle[]> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SSocietyQuantTerminal/2.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      throw new Error(`${feedName} HTTP ${res.status}`);
    }

    const xml = await res.text();
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    const articles: RawFeedArticle[] = [];

    for (const block of itemBlocks.slice(0, 14)) {
      let title = extractXmlTag(block, 'title');
      const link = extractXmlTag(block, 'link');
      const description = extractXmlTag(block, 'description');
      const pubDateRaw = extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'dc:date');
      const sourceTag = extractXmlTag(block, 'source');

      if (!title || !link) continue;

      let resolvedSource = sourceTag || feedName;
      if (feedName.startsWith('Google News') && title.includes(' - ')) {
        const lastDash = title.lastIndexOf(' - ');
        const publisher = title.slice(lastDash + 3).trim();
        if (publisher.length > 1 && publisher.length < 36) {
          resolvedSource = publisher;
          title = title.slice(0, lastDash).trim();
        }
      }

      const parsedRfc = pubDateRaw ? Date.parse(pubDateRaw) : NaN;
      const parsedTime = Number.isFinite(parsedRfc)
        ? parsedRfc
        : pubDateRaw
          ? Date.parse(pubDateRaw.replace(' ', 'T'))
          : NaN;
      const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();

      articles.push({
        title,
        description: description === title ? '' : description,
        url: link,
        sourceName: resolvedSource,
        publishedAt,
      });
    }

    return articles;
  }

  /**
   * Zero-key St. Louis Fed (FRED) Official Macro Yields for Gold Fundamental Pricing:
   * - DFII10: 10-Year Treasury Inflation-Indexed Security (Real Yield — #1 inverse driver of XAU/USD)
   * - DGS10: 10-Year Nominal US Treasury Yield
   * - T10YIE: 10-Year Breakeven Inflation Rate
   */
  private async fetchFredMacroPulse(): Promise<FredMacroMetric[]> {
    const now = Date.now();
    if (this.cachedMacroPulse.length > 0 && now < this.macroPulseExpiresAt) {
      return this.cachedMacroPulse;
    }

    const seriesDefs: {
      id: 'DFII10' | 'DGS10' | 'T10YIE';
      label: string;
      inverseToGold: boolean;
    }[] = [
      { id: 'DFII10', label: 'Randament Real SUA 10Y (TIPS)', inverseToGold: true },
      { id: 'DGS10', label: 'Titluri Trezorerie SUA 10Y', inverseToGold: true },
      { id: 'T10YIE', label: 'Inflație Așteptată SUA 10Y', inverseToGold: false },
    ];

    try {
      const results = await Promise.allSettled(
        seriesDefs.map(async (def) => {
          const res = await fetch(
            `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${def.id}`,
            {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SSocietyQuantTerminal/2.0)' },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (!res.ok) throw new Error(`FRED ${def.id} HTTP ${res.status}`);
          const csv = await res.text();
          const lines = csv.trim().split('\n').slice(-20);
          const validObs: { date: string; val: number }[] = [];

          for (const line of lines) {
            const [d, v] = line.split(',');
            const num = Number(v);
            if (d && v && v.trim() !== '.' && Number.isFinite(num)) {
              validObs.push({ date: d.trim(), val: num });
            }
          }

          if (validObs.length === 0) throw new Error(`No valid observations for ${def.id}`);
          const latest = validObs[validObs.length - 1];
          const prev = validObs.length >= 2 ? validObs[validObs.length - 2] : latest;
          const changeBps = Math.round((latest.val - prev.val) * 100);

          let goldImpact: 'BULLISH' | 'BEARISH' | 'NEUTRU' = 'NEUTRU';
          if (Math.abs(changeBps) >= 2) {
            if (def.inverseToGold) {
              goldImpact = changeBps < 0 ? 'BULLISH' : 'BEARISH';
            } else {
              goldImpact = changeBps > 0 ? 'BULLISH' : 'BEARISH';
            }
          }

          return {
            seriesId: def.id,
            label: def.label,
            value: Math.round(latest.val * 100) / 100,
            changeBps,
            observationDate: latest.date,
            goldImpact,
          } satisfies FredMacroMetric;
        })
      );

      const metrics: FredMacroMetric[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          metrics.push(r.value);
        }
      }

      if (metrics.length > 0) {
        this.cachedMacroPulse = metrics;
        this.macroPulseExpiresAt = now + MACRO_CACHE_TTL_MS;
      }
      return this.cachedMacroPulse;
    } catch {
      return this.cachedMacroPulse;
    }
  }

  private async fetchOptionalFinnhubNews(forceRefresh = false): Promise<RawFeedArticle[]> {
    const token = readCleanApiKey('FINNHUB_API_KEY', 'FINNHUB_KEY', 'FINNHUB_TOKEN');
    if (!token) return [];

    const now = Date.now();
    if (!forceRefresh && this.finnhubCache.articles.length > 0 && now < this.finnhubCache.expiresAt) {
      return this.finnhubCache.articles;
    }

    try {
      const [forexRes, generalRes] = await Promise.allSettled([
        fetch(
          `https://finnhub.io/api/v1/news?category=forex&token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(4000) }
        ),
        fetch(
          `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(4000) }
        ),
      ]);

      const combined: {
        headline?: string;
        summary?: string;
        url?: string;
        source?: string;
        datetime?: number;
      }[] = [];

      for (const settled of [forexRes, generalRes]) {
        if (settled.status === 'fulfilled' && settled.value.ok) {
          const arr = (await settled.value.json()) as typeof combined;
          if (Array.isArray(arr)) {
            combined.push(...arr.slice(0, 15));
          }
        }
      }

      if (combined.length === 0) return this.finnhubCache.articles;

      const parsed = combined
        .filter((item) => Boolean(item.headline && item.url))
        .map((item) => ({
          title: String(item.headline || '').trim(),
          description: String(item.summary || '').trim(),
          url: String(item.url || '').trim(),
          sourceName: item.source ? `Finnhub · ${item.source}` : 'Finnhub Wire',
          publishedAt: item.datetime ? item.datetime * 1000 : Date.now(),
        }));

      if (parsed.length > 0) {
        this.finnhubCache = { articles: parsed, expiresAt: now + FINNHUB_TTL_MS };
      }
      return parsed.length > 0 ? parsed : this.finnhubCache.articles;
    } catch {
      return this.finnhubCache.articles;
    }
  }

  private async fetchOptionalMarketauxNews(): Promise<RawFeedArticle[]> {
    const token = readCleanApiKey('MARKETAUX_API_KEY', 'MARKETAUX_KEY', 'MARKETAUX_TOKEN');
    if (!token) return [];

    const now = Date.now();
    if (this.marketauxCache.articles.length > 0 && now < this.marketauxCache.expiresAt) {
      return this.marketauxCache.articles;
    }

    try {
      const url = `https://api.marketaux.com/v1/news/all?search=gold&language=en&limit=3&api_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) return this.marketauxCache.articles;
      const body = (await res.json()) as {
        data?: {
          title?: string;
          description?: string;
          snippet?: string;
          url?: string;
          source?: string;
          published_at?: string;
          entities?: { sentiment_score?: number }[];
        }[];
      };
      if (!Array.isArray(body.data)) return this.marketauxCache.articles;

      const parsed = body.data
        .filter((item) => Boolean(item.title && item.url))
        .map((item) => {
          const score = item.entities?.[0]?.sentiment_score ?? 0;
          const sentimentHint: 'BULLISH' | 'BEARISH' | 'NEUTRU' =
            score >= 0.15 ? 'BULLISH' : score <= -0.15 ? 'BEARISH' : 'NEUTRU';
          const ts = item.published_at ? Date.parse(item.published_at) : NaN;
          return {
            title: String(item.title || '').trim(),
            description: String(item.description || item.snippet || '').trim(),
            url: String(item.url || '').trim(),
            sourceName: item.source ? `Marketaux · ${item.source}` : 'Marketaux',
            publishedAt: Number.isFinite(ts) ? ts : Date.now(),
            sentimentHint,
          };
        });

      if (parsed.length > 0) {
        this.marketauxCache = { articles: parsed, expiresAt: now + MARKETAUX_TTL_MS };
      }
      return parsed.length > 0 ? parsed : this.marketauxCache.articles;
    } catch {
      return this.marketauxCache.articles;
    }
  }

  private async fetchOptionalNewsDataIo(): Promise<RawFeedArticle[]> {
    const token = readCleanApiKey('NEWSDATA_API_KEY', 'NEWSDATA_IO_API_KEY', 'NEWSDATA_KEY');
    if (!token) return [];

    const now = Date.now();
    if (this.newsdataCache.articles.length > 0 && now < this.newsdataCache.expiresAt) {
      return this.newsdataCache.articles;
    }

    try {
      const url = `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(token)}&q=${encodeURIComponent('"gold price" OR XAUUSD OR "Federal Reserve"')}&language=en&category=business`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!res.ok) return this.newsdataCache.articles;
      const body = (await res.json()) as {
        results?: {
          title?: string;
          description?: string;
          link?: string;
          source_name?: string;
          pubDate?: string;
        }[];
      };
      if (!Array.isArray(body.results)) return this.newsdataCache.articles;

      const parsed = body.results
        .slice(0, 10)
        .filter((item) => Boolean(item.title && item.link))
        .map((item) => {
          const ts = item.pubDate ? Date.parse(item.pubDate) : NaN;
          return {
            title: String(item.title || '').trim(),
            description: String(item.description || '').trim(),
            url: String(item.link || '').trim(),
            sourceName: item.source_name ? `NewsData · ${item.source_name}` : 'NewsData.io',
            publishedAt: Number.isFinite(ts) ? ts : Date.now(),
          };
        });

      if (parsed.length > 0) {
        this.newsdataCache = { articles: parsed, expiresAt: now + NEWSDATA_TTL_MS };
      }
      return parsed.length > 0 ? parsed : this.newsdataCache.articles;
    } catch {
      return this.newsdataCache.articles;
    }
  }

  private async fetchOptionalAlphaVantageNews(): Promise<RawFeedArticle[]> {
    const token = readCleanApiKey(
      'ALPHA_VANTAGE_API_KEY',
      'ALPHAVANTAGE_API_KEY',
      'ALPHA_VANTAGE_KEY'
    );
    if (!token) return [];

    const now = Date.now();
    if (this.alphaVantageCache.articles.length > 0 && now < this.alphaVantageCache.expiresAt) {
      return this.alphaVantageCache.articles;
    }

    try {
      const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=economy_monetary&apikey=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return this.alphaVantageCache.articles;
      const body = (await res.json()) as {
        feed?: {
          title?: string;
          summary?: string;
          url?: string;
          source?: string;
          time_published?: string;
          overall_sentiment_score?: number;
        }[];
      };
      if (!Array.isArray(body.feed)) {
        // Rate limit or informational notice — defer retry by 30m and preserve last cache
        this.alphaVantageCache.expiresAt = now + 30 * 60_000;
        return this.alphaVantageCache.articles;
      }

      const parsed = body.feed
        .slice(0, 20)
        .filter((item) => Boolean(item.title && item.url))
        .map((item) => {
          // Alpha Vantage format: YYYYMMDDTHHMMSS
          const tp = String(item.time_published || '');
          const iso =
            tp.length >= 15
              ? `${tp.slice(0, 4)}-${tp.slice(4, 6)}-${tp.slice(6, 8)}T${tp.slice(9, 11)}:${tp.slice(11, 13)}:${tp.slice(13, 15)}Z`
              : '';
          const ts = iso ? Date.parse(iso) : NaN;
          const score = Number(item.overall_sentiment_score ?? 0);
          const sentimentHint: 'BULLISH' | 'BEARISH' | 'NEUTRU' =
            score >= 0.15 ? 'BULLISH' : score <= -0.15 ? 'BEARISH' : 'NEUTRU';

          return {
            title: String(item.title || '').trim(),
            description: String(item.summary || '').trim(),
            url: String(item.url || '').trim(),
            sourceName: item.source ? `AlphaVantage · ${item.source}` : 'Alpha Vantage',
            publishedAt: Number.isFinite(ts) ? ts : Date.now(),
            sentimentHint,
          };
        });

      if (parsed.length > 0) {
        this.alphaVantageCache = { articles: parsed, expiresAt: now + ALPHAVANTAGE_TTL_MS };
      }
      return parsed.length > 0 ? parsed : this.alphaVantageCache.articles;
    } catch {
      return this.alphaVantageCache.articles;
    }
  }

  private async fetchMacroCalendar(): Promise<MacroCalendarEvent[]> {
    const now = Date.now();
    if (this.cachedCalendar.length > 0 && now < this.calendarExpiresAt) {
      return this.cachedCalendar;
    }

    try {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SSocietyQuantTerminal/2.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return this.cachedCalendar;

      const rawText = await res.text();
      if (!rawText.trim().startsWith('[')) {
        return this.cachedCalendar;
      }

      const parsed = JSON.parse(rawText) as {
        title?: string;
        country?: string;
        date?: string;
        impact?: string;
        forecast?: string;
        previous?: string;
      }[];

      const allUsdImportant: MacroCalendarEvent[] = parsed
        .filter(
          (ev) =>
            ev.country === 'USD' &&
            (ev.impact === 'High' || ev.impact === 'Medium') &&
            Boolean(ev.title && ev.date)
        )
        .map((ev, idx) => {
          const ts = Date.parse(String(ev.date));
          return {
            id: `cal-${idx}-${ts || idx}`,
            title: String(ev.title),
            country: 'USD',
            date: String(ev.date),
            timestamp: Number.isFinite(ts) ? ts : now,
            impact: (ev.impact === 'High' ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM',
            forecast: String(ev.forecast || '—'),
            previous: String(ev.previous || '—'),
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      const upcoming = allUsdImportant.filter((ev) => ev.timestamp >= now - 12 * 3600_000);
      const relevantEvents = (upcoming.length > 0 ? upcoming : allUsdImportant.slice(-6)).slice(0, 6);

      if (relevantEvents.length > 0) {
        this.cachedCalendar = relevantEvents;
        this.calendarExpiresAt = now + MACRO_CACHE_TTL_MS;
      }
      return this.cachedCalendar;
    } catch {
      return this.cachedCalendar;
    }
  }

  private async tryOptionalGeminiRomanianEnrichment(
    items: GroundedNewsItem[]
  ): Promise<GroundedNewsItem[] | null> {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return null;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const compactInput = items.map((it, idx) => ({
        i: idx,
        title: it.title,
        summary: it.summary,
      }));

      const prompt = [
        'Tradu și sintetizează în limba română următoarele știri financiare reale despre XAU/USD (Aur) și macroeconomie.',
        'Evaluează impactul direct asupra prețului aurului (XAU/USD): BULLISH (susține creșterea aurului, ex: tăieri dobândă Fed, dolar slab, randamente US10Y în scădere, risc geopolitic), BEARISH (pune presiune pe aur, ex: dolar puternic, randamente US10Y în creștere, Fed hawkish) sau NEUTRU.',
        'Returnează STRICT un array JSON cu aceeași lungime, de forma: [{"i":0,"titleRo":"...","summaryRo":"1 propoziție clară în română","impact":"BULLISH"|"BEARISH"|"NEUTRU"}]',
        JSON.stringify(compactInput),
      ].join('\n');

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini timeout')), 3500)
        ),
      ]);

      const raw = (response.text ?? '').trim();
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start === -1 || end <= start) return null;

      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        i?: number;
        titleRo?: string;
        summaryRo?: string;
        impact?: string;
      }[];
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      return items.map((orig, idx) => {
        const match = parsed.find((p) => p.i === idx) ?? parsed[idx];
        if (!match) return orig;
        const imp = String(match.impact || orig.impact).toUpperCase();
        const validImpact: GroundedNewsItem['impact'] =
          imp === 'BULLISH' || imp === 'BEARISH' || imp === 'NEUTRU' ? imp : orig.impact;
        return {
          ...orig,
          title: match.titleRo ? String(match.titleRo).slice(0, 175) : orig.title,
          summary: match.summaryRo ? String(match.summaryRo).slice(0, 320) : orig.summary,
          impact: validImpact,
        };
      });
    } catch {
      return null;
    }
  }
}
