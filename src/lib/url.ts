/**
 * GitHub Pages 项目站点部署在 /仓库名/ 下，所有站内链接必须走这里拼前缀，
 * 否则本地正常、线上 404。BASE_URL 由 astro.config.mjs 的 base 决定。
 */
const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export function href(path = '/'): string {
  const clean = path.replace(/^\/+/, '');
  return clean ? `${BASE}${clean}` : BASE;
}

export function asset(path: string): string {
  return href(path);
}
