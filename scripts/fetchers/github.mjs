import { fetchJson } from '../lib/http.mjs';

/**
 * GitHub Trending 没有官方接口，这里用官方 Search API 近似：
 * 近 7 天创建且已有一定 star 的仓库，按 star 倒序。
 * 未认证 60 次/小时，Actions 中注入 GITHUB_TOKEN 后为 5000 次/小时。
 */
export async function fetchGithubTrending(source, { timeoutMs = 15000, limit } = {}) {
  const cap = limit || source.limit || 10;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = `created:>${since} stars:>20`;
  const url = `${source.url}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${cap}`;

  const headers = { accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const data = await fetchJson(url, { timeoutMs, headers });
  if (!Array.isArray(data?.items)) {
    throw new Error(data?.message ? `GitHub API: ${data.message}` : 'Search API 返回格式异常');
  }

  return data.items.map((repo) => ({
    externalId: `gh-${repo.full_name}`,
    title: repo.full_name,
    url: repo.html_url,
    summary: [
      repo.description,
      repo.language,
      repo.stargazers_count != null ? `★ ${repo.stargazers_count}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    publishedAt: repo.created_at,
    tags: [repo.language, ...(repo.topics ?? [])].filter(Boolean),
    signals: {
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
    },
  }));
}
