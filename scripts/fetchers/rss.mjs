import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../lib/http.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  trimValues: true,
  processEntities: true,
  // 关闭自动类型转换，避免标题/日期被解析成数字或 Date
  parseTagValue: false,
  parseAttributeValue: false,
});

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') {
    if (node['#cdata'] != null) return text(node['#cdata']);
    if (node['#text'] != null) return text(node['#text']);
  }
  return '';
}

/** 兼容 RSS2 的字符串 link、Atom 的 @_href、以及 RSS1.0 的 rdf:about */
function linkOf(node) {
  const raw = node.link ?? node['feedburner:origLink'] ?? node['rdf:about'];
  const list = Array.isArray(raw) ? raw : [raw];

  for (const entry of list) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry && typeof entry === 'object') {
      const rel = entry['@_rel'];
      const href = entry['@_href'];
      if (href && (!rel || rel === 'alternate')) return String(href).trim();
    }
  }
  for (const entry of list) {
    const value = text(entry);
    if (value) return value;
  }
  return '';
}

function tagsOf(node) {
  const raw = node.category ?? node['dc:subject'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        return entry['@_term'] ?? entry['@_label'] ?? text(entry);
      }
      return '';
    })
    .map((tag) => String(tag ?? '').trim())
    .filter(Boolean);
}

/**
 * 纯函数：把 feed 文本解析成 raw 条目。抽出来是为了能在测试里离线跑 fixture。
 */
export function parseFeedXml(xml, source = {}, { limit } = {}) {
  const doc = parser.parse(xml);
  const rssChannel = doc?.rss?.channel;
  const rdf = doc?.['rdf:RDF'];
  const feed = doc?.feed;

  let nodes = [];
  if (rssChannel) nodes = [].concat(rssChannel.item ?? []);
  else if (rdf) nodes = [].concat(rdf.item ?? rdf.channel?.item ?? []);
  else if (feed) nodes = [].concat(feed.entry ?? []);

  if (!nodes.length) throw new Error('未解析到任何条目（feed 结构可能已变更）');

  const cap = limit || source.limit || 10;

  return nodes
    .map((node) => ({
      externalId:
        text(node.guid ?? node.id ?? node['dc:identifier'] ?? node['atom:id']) || linkOf(node),
      title: text(node.title),
      url: linkOf(node),
      summary: text(
        node.description ??
          node.summary ??
          node['content:encoded'] ??
          node['content'] ??
          node['media:description'],
      ),
      publishedAt: text(node.pubDate ?? node.published ?? node.updated ?? node['dc:date']),
      tags: tagsOf(node),
    }))
    .filter((item) => item.title && item.url)
    .slice(0, cap);
}

/**
 * 通用 RSS / Atom / RSS1.0 抓取。所有官方博客、arXiv 都走这里。
 * 返回 raw 条目，由 normalizeItem 统一补全来源、频道、权重等字段。
 */
export async function fetchRss(source, { timeoutMs = 15000, limit } = {}) {
  const xml = await fetchText(source.url, {
    timeoutMs,
    accept:
      'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  });
  return parseFeedXml(xml, source, { limit });
}
