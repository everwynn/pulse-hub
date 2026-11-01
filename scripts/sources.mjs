/**
 * 信息源注册表（声明式）。
 * 新增一个源：在对应频道下追加一条配置即可，无需改脚本。
 *
 * 字段说明：
 *   id       唯一标识，同时用于 data/health.json 的键
 *   channel  ai | tech | finance | policy
 *   type     rss | hn | github | api
 *   api      type=api 时的具体实现：devto | v2ex | hn-algolia | alphavantage | finnhub
 *   weight   源权重，重复条目去重时高权重源胜出，首页同频道内排序也用它
 *   limit    单次最多抓取条数
 *   lang     条目语言 zh | en，站点排序时中文优先曝光（见 src/lib/items.ts）
 *   tier     可信度分层：official | media | community，用于「来源」页看板分组
 *   summary  省略为 true；显式 false 表示该源 description 就是正文/完整摘要，只留标题
 *   enabled  源自身的默认开关；config/sources.json 可覆盖它（见 resolveEnabled）
 *
 * 合规约定：只抓标题 + 一句话摘要 + 原文链接，请求带可识别 UA，单源串行间隔 >= 1s。
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * 抓取开关配置（config/sources.json）。
 * 与代码分离，改完提交即可生效，不用动 sources 数组。
 * 文件缺失或解析失败时退回「全部按源内 enabled」，不阻断抓取。
 */
const CONFIG_PATH = new URL('../config/sources.json', import.meta.url);

function loadSourceConfig() {
  const empty = { groups: {}, sources: {} };
  try {
    if (!existsSync(CONFIG_PATH)) return empty;
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return {
      groups: raw && typeof raw.groups === 'object' && raw.groups ? raw.groups : {},
      sources: raw && typeof raw.sources === 'object' && raw.sources ? raw.sources : {},
    };
  } catch (error) {
    console.warn(`[sources] 读取 config/sources.json 失败，按默认配置抓取：${error.message}`);
    return empty;
  }
}

export const sourceConfig = loadSourceConfig();


const RSSHUB_BASE = (process.env.RSSHUB_BASE || '').replace(/\/+$/, '');

export const USER_AGENT =
  'pulse-hub/0.1 (+https://github.com/username/pulse-hub; headline aggregator; stores title, summary and source link only)';

/** 支持 {RSSHUB} 占位符：未配置实例时返回 null，抓取侧记为 skipped */
export function resolveUrl(url) {
  if (!url) return null;
  if (!url.includes('{RSSHUB}')) return url;
  if (!RSSHUB_BASE) return null;
  return url.replace('{RSSHUB}', RSSHUB_BASE);
}

export const sources = [
  // ───────────── AI 前沿：官方博客与论文 RSS ─────────────
  {
    id: 'openai-news',
    name: 'OpenAI News',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://openai.com/news/rss.xml',
    weight: 95,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'deepmind-blog',
    name: 'Google DeepMind',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://deepmind.google/blog/rss.xml',
    weight: 92,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'google-research',
    name: 'Google Research',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://research.google/blog/rss/',
    weight: 86,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'huggingface-blog',
    name: 'Hugging Face Blog',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://huggingface.co/blog/feed.xml',
    weight: 85,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'meta-ai',
    name: 'Meta AI Blog',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://ai.meta.com/blog/rss/',
    weight: 82,
    limit: 6,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'microsoft-research',
    name: 'Microsoft Research',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://www.microsoft.com/en-us/research/feed/',
    weight: 78,
    limit: 6,
    lang: 'en',
    summary: false, // feed 的 description 就是博客完整摘要，只留标题
    enabled: true,
  },
  {
    id: 'arxiv-cs-ai',
    name: 'arXiv cs.AI',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://rss.arxiv.org/rss/cs.AI',
    weight: 80,
    limit: 10,
    lang: 'en',
    summary: false, // description 是论文 abstract 全文，属受保护作品
    enabled: true,
  },
  {
    id: 'arxiv-cs-lg',
    name: 'arXiv cs.LG',
    channel: 'ai',
    tier: 'official',
    type: 'rss',
    url: 'https://rss.arxiv.org/rss/cs.LG',
    weight: 76,
    limit: 8,
    lang: 'en',
    summary: false, // 同上：abstract 全文
    enabled: true,
  },
  {
    id: 'qbitai',
    name: '量子位',
    channel: 'ai',
    tier: 'media',
    type: 'rss',
    url: 'https://www.qbitai.com/feed',
    weight: 74,
    limit: 8,
    lang: 'zh',
    enabled: true,
  },
  {
    id: 'hn-ai',
    name: 'Hacker News · AI 讨论',
    channel: 'ai',
    tier: 'community',
    type: 'api',
    api: 'hn-algolia',
    url: 'https://hn.algolia.com/api/v1/search',
    query: 'LLM OR GPT OR Claude OR Gemini OR "machine learning"',
    weight: 70,
    limit: 8,
    lang: 'en',
    enabled: true,
  },

  // ───────────── 技术社区：中文技术媒体（官网原生 RSS） ─────────────
  {
    id: 'solidot',
    name: 'Solidot 奇客',
    channel: 'tech',
    tier: 'media',
    type: 'rss',
    url: 'https://www.solidot.org/index.rss',
    weight: 72,
    limit: 10,
    lang: 'zh',
    summary: false, // 短讯源：description 基本等于正文全文
    enabled: true,
  },
  {
    id: 'infoq-cn',
    name: 'InfoQ 中文',
    channel: 'tech',
    tier: 'media',
    type: 'rss',
    url: 'https://www.infoq.cn/feed',
    weight: 70,
    limit: 8,
    lang: 'zh',
    enabled: true,
  },
  {
    id: 'oschina',
    name: '开源中国',
    channel: 'tech',
    tier: 'media',
    type: 'rss',
    url: 'https://www.oschina.net/news/rss',
    weight: 64,
    limit: 10,
    lang: 'zh',
    summary: false, // description 为资讯正文摘要，长度接近全文
    enabled: true,
  },

  // ───────────── 技术社区：开放 API ─────────────
  {
    id: 'hn-front',
    name: 'Hacker News',
    channel: 'tech',
    tier: 'community',
    type: 'hn',
    url: 'https://hacker-news.firebaseio.com/v0',
    weight: 92,
    limit: 12,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'github-trending',
    name: 'GitHub 新晋热门',
    channel: 'tech',
    tier: 'community',
    type: 'github',
    url: 'https://api.github.com/search/repositories',
    weight: 90,
    limit: 10,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'devto',
    name: 'DEV Community',
    channel: 'tech',
    tier: 'community',
    type: 'api',
    api: 'devto',
    url: 'https://dev.to/api/articles',
    weight: 60,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'v2ex-hot',
    name: 'V2EX 热门',
    channel: 'tech',
    tier: 'community',
    type: 'api',
    api: 'v2ex',
    url: 'https://www.v2ex.com/api/topics/hot.json',
    weight: 55,
    limit: 8,
    lang: 'zh',
    enabled: true,
  },

  // ───────────── 财经：官方开放 API（需在 Secrets 配置 Key） ─────────────
  // 钛媒体为「科技产业 + 财报/IPO」混合 feed，科技条目归 AI/技术频道，财报类归此处
  {
    id: 'tmtpost',
    name: '钛媒体',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: 'https://www.tmtpost.com/rss',
    weight: 66,
    limit: 6,
    lang: 'zh',
    enabled: true,
  },
  {
    id: 'alphavantage-news',
    name: 'Alpha Vantage · 科技财报新闻',
    channel: 'finance',
    tier: 'media',
    type: 'api',
    api: 'alphavantage',
    url: 'https://www.alphavantage.co/query',
    keyEnv: 'ALPHAVANTAGE_KEY',
    topics: 'technology,earnings',
    weight: 72,
    limit: 10,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'finnhub-news',
    name: 'Finnhub · 市场要闻',
    channel: 'finance',
    tier: 'media',
    type: 'api',
    api: 'finnhub',
    url: 'https://finnhub.io/api/v1/news',
    keyEnv: 'FINNHUB_KEY',
    category: 'general',
    weight: 70,
    limit: 10,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'finnhub-earnings',
    name: 'Finnhub · 财报新闻',
    channel: 'finance',
    tier: 'media',
    type: 'api',
    api: 'finnhub',
    url: 'https://finnhub.io/api/v1/news',
    keyEnv: 'FINNHUB_KEY',
    // Finnhub 的 /news?category= 只认 general / forex / crypto / merger，
    // **没有 earnings**。所以这个 category 值是本地约定：抓 general 全量后
    // 按财报关键词（earnings / quarter / EPS / guidance…）过滤，详见 fetchers/api.mjs。
    category: 'earnings',
    weight: 84,
    limit: 10,
    lang: 'en',
    enabled: true,
    note: '官方无 earnings 分类，本地按财报关键词从 general 里过滤',
  },

  // ───────────── 财经：财报与市场新闻（2026-10 实测可用的直连 feed） ─────────────
  // 官网 RSS 已下线的中文媒体（华尔街见闻 / 36氪 / 财新）不在此列，见下面的 RSSHub 分组。
  {
    id: 'cnbc-earnings',
    name: 'CNBC · 财报',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html',
    weight: 82,
    limit: 10,
    lang: 'en',
    enabled: true,
    note: 'CNBC 的 Earnings 频道，财报季更新最密集',
  },
  {
    id: 'marketwatch-top',
    name: 'MarketWatch · 头条',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    weight: 68,
    limit: 8,
    lang: 'en',
    enabled: true,
  },
  {
    id: 'seekingalpha-news',
    name: 'Seeking Alpha · 快讯',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: 'https://seekingalpha.com/market_currents.xml',
    weight: 58,
    limit: 6,
    lang: 'en',
    enabled: true,
    note: '只有标题，摘要为空；深度分析在付费墙内',
  },
  {
    id: 'wallstreetcn-live',
    name: '华尔街见闻 · 7×24 快讯',
    channel: 'finance',
    tier: 'media',
    type: 'api',
    api: 'wallstreetcn',
    url: 'https://api-one.wallstcn.com/apiv1/content/lives',
    liveChannel: 'global-channel',
    weight: 74,
    limit: 10,
    lang: 'zh',
    enabled: true,
    note: '官方 rss.xml 已下线（S3 NoSuchKey），改走站点 JSON 接口；快讯没有独立标题，取正文首句',
  },

  // ───────────── 财经：中文源（官网 RSS 已下线，需自建 RSSHub） ─────────────
  // 实测：财新/36氪/第一财经/格隆汇 的 RSS 地址均已返回 HTML。
  // 华尔街见闻不在此列，它已改走上面的 JSON 快讯接口。
  {
    id: 'wallstreetcn-news',
    name: '华尔街见闻 · 资讯',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: '{RSSHUB}/wallstreetcn/news/global',
    weight: 78,
    limit: 10,
    lang: 'zh',
    enabled: false,
    note: '比快讯接口多出正式标题，需自建 RSSHub 后开启',
  },
  {
    id: '36kr-newsflash',
    name: '36氪 · 快讯',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: '{RSSHUB}/36kr/newsflashes',
    weight: 72,
    limit: 10,
    lang: 'zh',
    enabled: false,
    note: '官网已不提供 RSS，需自建 RSSHub 后开启',
  },
  {
    id: 'caixin-latest',
    name: '财新 · 最新',
    channel: 'finance',
    tier: 'media',
    type: 'rss',
    url: '{RSSHUB}/caixin/latest',
    weight: 76,
    limit: 8,
    lang: 'zh',
    enabled: false,
    note: '官网已不提供 RSS，需自建 RSSHub 后开启',
  },

  // ───────────── 政策：官方站点无 RSS，需自建 RSSHub 实例后开启 ─────────────
  // 自建方式见 README：部署 RSSHub 到 Vercel/Cloudflare 后，把实例地址写入 Secrets 的 RSSHUB_BASE。
  {
    id: 'gov-cn-policy',
    name: '中国政府网 · 最新政策',
    channel: 'policy',
    tier: 'official',
    type: 'rss',
    url: '{RSSHUB}/gov/zhengce/zuixin',
    weight: 95,
    limit: 10,
    lang: 'zh',
    enabled: false,
    note: 'M3 阶段：需自建 RSSHub 并验证路由后再启用',
  },
  {
    id: 'miit-news',
    name: '工业和信息化部 · 新闻发布',
    channel: 'policy',
    tier: 'official',
    type: 'rss',
    url: '{RSSHUB}/gov/miit/xwfb',
    weight: 85,
    limit: 8,
    lang: 'zh',
    enabled: false,
    note: 'M3 阶段：需自建 RSSHub 并验证路由后再启用',
  },
];

export function resolveEnabled(source, config = sourceConfig) {
  // 1) 单源指定最优先：可以让某个源脱离分组单独生效或单独停用
  const bySource = config.sources?.[source.id];
  if (typeof bySource === 'boolean') return bySource;

  // 2) 分组之间是「与」关系：任一分组被关掉，该源就不抓
  const groupKeys = [
    `tier.${source.tier ?? 'media'}`,
    `channel.${source.channel}`,
    `lang.${source.lang ?? 'en'}`,
    `type.${source.type}`,
  ];
  for (const key of groupKeys) {
    if (config.groups?.[key] === false) return false;
  }

  // 3) 都没管到时，看源自身的 enabled
  return source.enabled !== false;
}

export function activeSources(filters = {}) {
  return sources.filter((source) => {
    if (!resolveEnabled(source) && !filters.includeDisabled) return false;
    if (filters.only && source.id !== filters.only) return false;
    return true;
  });
}
