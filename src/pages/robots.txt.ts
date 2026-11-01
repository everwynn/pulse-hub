import type { APIContext } from 'astro';

/** robots.txt 随 base 变化，用端点生成，避免写死 /pulse-hub/ 前缀 */
export async function GET(context: APIContext) {
  const site = new URL(import.meta.env.BASE_URL, context.site ?? 'https://username.github.io');

  const body = `User-agent: *
Allow: /

Sitemap: ${new URL('sitemap.xml', site).href}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
