import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { CHANNEL_MAP } from '../lib/channels';
import { getAllItems } from '../lib/items';

const SITE_FALLBACK = 'https://username.github.io';
const FEED_LIMIT = 60;

export async function GET(context: APIContext) {
  // base 前缀在 CI 下为 /pulse-hub/，拼进 site 保证自引用链接正确
  const site = new URL(import.meta.env.BASE_URL, context.site ?? SITE_FALLBACK);
  const items = getAllItems()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, FEED_LIMIT);

  return rss({
    title: 'Pulse Hub · 行业头条',
    description:
      '每天自动聚合 AI 前沿、技术社区、财经与政策领域的官方信息源，只保留标题、短摘要与原文链接。',
    site,
    trailingSlash: false,
    items: items.map((item) => ({
      title: item.title,
      link: item.url,
      pubDate: new Date(item.publishedAt),
      description: item.summary || item.title,
      categories: [CHANNEL_MAP[item.channel]?.label ?? item.channel, item.sourceName, ...item.tags],
      customData: `<source>${item.sourceName}</source>`,
    })),
    customData: '<language>zh-CN</language>',
  });
}
