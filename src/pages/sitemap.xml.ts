import type { APIContext } from 'astro';
import { visibleChannels } from '../lib/channels';
import { getChannelCounts, getDateEntries } from '../lib/items';

const SITE_FALLBACK = 'https://username.github.io';

/**
 * 手写 sitemap，替代 @astrojs/sitemap：
 * 该集成 3.7.x 依赖 Astro 5 才有的 `astro:routes:resolved` 钩子，在 Astro 4 下会抛错。
 * 站点路由是有限且可枚举的，直接列出更可控。
 */
export async function GET(context: APIContext) {
  const site = new URL(import.meta.env.BASE_URL, context.site ?? SITE_FALLBACK);
  const paths = [
    '',
    'daily',
    'sources',
    'about',
    'search',
    ...visibleChannels(getChannelCounts()).map((channel) => `channel/${channel.id}`),
    ...getDateEntries().map((entry) => `daily/${entry.date}`),
  ];

  const urls = paths
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
