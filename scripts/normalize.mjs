import { createHash } from 'node:crypto';

/** 需要剔除的追踪参数（域名无关） */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'spm',
  'scm',
  'from',
  'ref',
  'ref_src',
  'referrer',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'share_token',
  'share_source',
  '_hsenc',
  '_hsmi',
]);

/**
 * URL 归一化：去掉 hash 与追踪参数，统一小写域名，去掉路径尾部多余斜杠。
 * 同一条新闻在不同渠道带不同 utm 参数时，靠它识别为同一链接。
 */
export function canonicalizeUrl(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) url.searchParams.delete(key);
    }
    // 路径尾部的单个斜杠不影响语义，统一去掉以便跨源比对
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return input;
  }
}

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const point = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    if (code.startsWith('#')) {
      const point = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** 去标签、解实体、压缩空白 */
export function stripHtml(input = '') {
  return decodeEntities(
    String(input)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 按码点截断，超长补省略号 */
export function truncate(text, max = 150) {
  const value = String(text ?? '').trim();
  if (!value) return '';
  const chars = [...value];
  if (chars.length <= max) return value;
  return `${chars.slice(0, max).join('')}…`;
}

/**
 * 合规摘要上限（码点）。
 * 《著作权法》第 35 条的报刊转载摘编法定许可不覆盖网站，网站转载需落在第 24 条
 * 「适当引用」的范围内；摘要越长越接近逐字复制，在短文源上 150 字往往就是全文。
 * 80 字基本只能容纳一句话，够做导航，不构成对原文的实质性替代。
 */
export const SUMMARY_MAX = 80;

/** 句末标点：中文句号/问号/叹号，或后接空白的英文标点（避免切断小数与缩写） */
const SENTENCE_END = /[。！？]|[.!?](?=\s|$)/;

/** feed 描述里常见的样板尾巴，本身不携带信息，不能当摘要用 */
const BOILERPLATE_TAIL = /^(read more|continue reading|read the full|submitted by|the post .{0,80} appeared first|阅读全文|查看全文|点击阅读)/i;

/**
 * 生成合规摘要：只取第一句，再按 SUMMARY_MAX 兜底截断。
 * 第一句是 "Read more." 这类样板尾巴、或短到不足 12 字（寒暄、纯标题）时，
 * 退回前 SUMMARY_MAX 字，信息量比一句寒暄更多。
 */
export function briefSummary(text, max = SUMMARY_MAX) {
  const value = stripHtml(text);
  if (!value) return '';
  const match = SENTENCE_END.exec(value);
  const sentence = (match ? value.slice(0, match.index + match[0].length) : value).trim();
  const usable = [...sentence].length >= 12 && !BOILERPLATE_TAIL.test(sentence);
  return truncate(usable ? sentence : value, max);
}

/** 标题指纹：用于跨源识别同一条新闻 */
export function titleFingerprint(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 120);
}

/** 稳定短 ID */
export function makeId(parts) {
  return createHash('sha1')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * 时间归一：无法解析、早于 2000 年、或落在未来 1 天以上的一律回退到抓取时间。
 */
export function toIso(value, nowIso = new Date().toISOString()) {
  if (!value) return nowIso;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return nowIso;
  const year = date.getUTCFullYear();
  if (year < 2000) return nowIso;
  const limit = Date.now() + 24 * 3600 * 1000;
  if (date.getTime() > limit) return nowIso;
  return date.toISOString();
}

/**
 * 把各 fetcher 输出的 raw 条目统一成站点使用的 Item。
 * raw: { externalId, title, url, summary, publishedAt, tags, signals, lang }
 */
export function normalizeItem(raw, source, { nowIso = new Date().toISOString() } = {}) {
  const title = stripHtml(raw?.title ?? '').slice(0, 300);
  // source.summary === false：该源的 description 就是正文/完整摘要，只留标题
  const summaryOff = source.summary === false;
  const url = String(raw?.url ?? '').trim();
  if (!title || !url) return null;

  const externalId = raw?.externalId ? String(raw.externalId) : canonicalizeUrl(url);
  const tags = Array.isArray(raw?.tags)
    ? [...new Set(raw.tags.map((tag) => stripHtml(tag).slice(0, 24)).filter(Boolean))].slice(0, 6)
    : [];

  return {
    id: makeId([source.id, externalId]),
    sourceId: source.id,
    sourceName: source.name,
    channel: source.channel,
    title,
    summary: summaryOff ? '' : briefSummary(raw?.summary ?? ''),
    url,
    canonicalUrl: canonicalizeUrl(url),
    publishedAt: toIso(raw?.publishedAt, nowIso),
    fetchedAt: nowIso,
    tags,
    signals: raw?.signals && typeof raw.signals === 'object' ? raw.signals : {},
    lang: raw?.lang || source.lang || 'en',
    weight: source.weight ?? 50,
    titleKey: titleFingerprint(title),
  };
}
