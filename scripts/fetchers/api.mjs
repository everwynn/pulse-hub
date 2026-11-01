import { fetchJson } from '../lib/http.mjs';
import { stripHtml } from '../normalize.mjs';

/** Alpha Vantage 时间格式：20261027T081500 */
function parseAlphaTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(value ?? ''));
  if (!match) return '';
  const [, y, m, d, hh, mm, ss] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}

/**
 * 财报类标题的关键词。
 * Finnhub 的 /news 没有 earnings 分类，只能用标题关键词在本地筛，
 * 所以这个词表直接决定了「财报新闻」的召回率，宁宽勿严。
 */
const EARNINGS_PATTERN =
  /\b(earnings?|quarterly|quarters?|Q[1-4]|fiscal|revenues?|profit|EPS|guidance|outlook|results|beat|beats|miss|misses)\b/i;

function isEarningsHeadline(headline) {
  return EARNINGS_PATTERN.test(String(headline ?? ''));
}

const handlers = {
  async devto(source, { timeoutMs, cap }) {
    const data = await fetchJson(`${source.url}?top=7&per_page=${cap}`, { timeoutMs });
    if (!Array.isArray(data)) throw new Error('DEV API 返回格式异常');
    return data.map((article) => ({
      externalId: `devto-${article.id}`,
      title: article.title,
      url: article.url,
      summary: article.description,
      publishedAt: article.published_at,
      tags: article.tag_list ?? [],
      signals: {
        reactions: article.positive_reactions_count ?? 0,
        comments: article.comments_count ?? 0,
      },
    }));
  },

  async v2ex(source, { timeoutMs, cap }) {
    const data = await fetchJson(source.url, { timeoutMs });
    if (!Array.isArray(data)) throw new Error('V2EX API 返回格式异常');
    return data.slice(0, cap).map((topic) => ({
      externalId: `v2ex-${topic.id}`,
      title: topic.title,
      url: topic.url,
      summary: stripHtml(topic.content ?? ''),
      publishedAt: topic.created ? new Date(topic.created * 1000).toISOString() : '',
      tags: [topic.node?.title].filter(Boolean),
      signals: { replies: topic.replies ?? 0 },
      lang: 'zh',
    }));
  },

  async 'hn-algolia'(source, { timeoutMs, cap }) {
    const query = encodeURIComponent(source.query ?? '');
    const data = await fetchJson(
      `${source.url}?query=${query}&tags=story&hitsPerPage=${cap}`,
      { timeoutMs },
    );
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    if (!hits.length) throw new Error('Algolia 未返回任何命中结果');
    return hits.map((hit) => ({
      externalId: `hn-${hit.objectID}`,
      title: hit.title ?? hit.story_title ?? '',
      url:
        hit.url ||
        (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : ''),
      summary: '',
      publishedAt: hit.created_at,
      tags: ['hacker-news'],
      signals: {
        points: hit.points ?? 0,
        comments: hit.num_comments ?? 0,
      },
    }));
  },

  async alphavantage(source, { timeoutMs, cap }) {
    const key = process.env[source.keyEnv];
    const topics = encodeURIComponent(source.topics ?? 'technology');
    const url = `${source.url}?function=NEWS_SENTIMENT&topics=${topics}&limit=${cap}&apikey=${key}`;
    const data = await fetchJson(url, { timeoutMs });
    if (!Array.isArray(data?.feed)) {
      const reason = data?.Information || data?.Note || data?.message || '返回格式异常';
      throw new Error(`Alpha Vantage: ${String(reason).slice(0, 120)}`);
    }
    return data.feed.map((article) => ({
      externalId: `av-${article.url}`,
      title: article.title,
      url: article.url,
      summary: article.summary,
      publishedAt: parseAlphaTime(article.time_published),
      tags: (article.topics ?? []).map((topic) => topic.topic).filter(Boolean),
      signals: {
        sentiment: Number(article.overall_sentiment_score ?? 0),
      },
    }));
  },

  async finnhub(source, { timeoutMs, cap }) {
    const key = process.env[source.keyEnv];
    // Finnhub 的 /news?category= 只认 general / forex / crypto / merger，没有 earnings。
    // 所以 category=earnings 走 general 全量 + 标题关键词本地过滤；
    // 非 earnings 的其他值原样透传给上游。
    const wanted = source.category ?? 'general';
    const upstream = wanted === 'earnings' ? 'general' : wanted;
    const url = `${source.url}?category=${upstream}&token=${key}`;
    const data = await fetchJson(url, { timeoutMs });
    if (!Array.isArray(data)) {
      throw new Error(data?.error ? `Finnhub: ${data.error}` : '返回格式异常');
    }
    const picked =
      wanted === 'earnings' ? data.filter((article) => isEarningsHeadline(article.headline)) : data;
    return picked.slice(0, cap).map((article) => ({
      externalId: `finnhub-${article.id}`,
      title: article.headline,
      url: article.url,
      summary: article.summary,
      publishedAt: article.datetime ? new Date(article.datetime * 1000).toISOString() : '',
      tags: [article.category].filter(Boolean),
      signals: {},
    }));
  },

  /**
   * 华尔街见闻 7×24 快讯。
   * 官方 rss.xml 已下线（返回 S3 NoSuchKey），改走站点自用的 JSON 接口。
   * 快讯没有 title 字段，只有 content_text，所以标题取正文首句截断——
   * 快讯本身就是一个句子，60 字既能当标题，也不至于把列表撑开。
   */
  async wallstreetcn(source, { timeoutMs, cap }) {
    const channel = source.liveChannel ?? 'global-channel';
    const data = await fetchJson(`${source.url}?channel=${channel}&limit=${cap}`, {
      timeoutMs,
      headers: { referer: 'https://wallstreetcn.com/' },
    });
    const items = data?.data?.items;
    if (!Array.isArray(items)) throw new Error('华尔街见闻返回格式异常');
    return items
      .map((live) => {
        const body = String(live.content_text ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!body) return null;
        return {
          externalId: `wscn-${live.id}`,
          title: body.length > 60 ? `${body.slice(0, 60)}…` : body,
          url: live.uri || `https://wallstreetcn.com/livenews/${live.id}`,
          summary: body.length > 60 ? body : '',
          publishedAt: live.display_time
            ? new Date(live.display_time * 1000).toISOString()
            : '',
          tags: (live.channels ?? []).slice(0, 3),
          signals: {},
        };
      })
      .filter(Boolean)
      .slice(0, cap);
  },
};

/** 按 source.api 分发到具体开放 API 实现 */
export async function fetchApi(source, { timeoutMs = 15000, limit } = {}) {
  const handler = handlers[source.api];
  if (!handler) throw new Error(`未实现的 API 类型：${source.api}`);
  const cap = limit || source.limit || 10;
  return handler(source, { timeoutMs, cap });
}
