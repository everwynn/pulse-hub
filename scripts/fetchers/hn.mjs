import { fetchJson } from '../lib/http.mjs';

const BASE = 'https://hacker-news.firebaseio.com/v0';
const BATCH_SIZE = 5;

/**
 * Hacker News 官方 Firebase API（无需 Key、无速率限制）。
 * 取首页 top stories，只读取 title/url/score 这类公开元数据。
 */
export async function fetchHn(source, { timeoutMs = 15000, limit } = {}) {
  const cap = limit || source.limit || 10;
  const ids = await fetchJson(`${BASE}/topstories.json`, { timeoutMs });
  if (!Array.isArray(ids)) throw new Error('topstories 返回格式异常');

  const picked = ids.slice(0, Math.min(cap * 4, 60));
  const items = [];

  // 分批请求，避免一次性对上游发起几十个并发
  for (let index = 0; index < picked.length; index += BATCH_SIZE) {
    const batch = picked.slice(index, index + BATCH_SIZE);
    const stories = await Promise.all(
      batch.map((id) => fetchJson(`${BASE}/item/${id}.json`, { timeoutMs }).catch(() => null)),
    );

    for (const story of stories) {
      if (!story || story.type !== 'story' || !story.title) continue;
      items.push({
        externalId: `hn-${story.id}`,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        summary: '',
        publishedAt: story.time ? new Date(story.time * 1000).toISOString() : '',
        tags: ['hacker-news'],
        signals: {
          points: story.score ?? 0,
          comments: story.descendants ?? 0,
        },
      });
      if (items.length >= cap) return items;
    }
  }

  return items;
}
