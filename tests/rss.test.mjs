import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedXml } from '../scripts/fetchers/rss.mjs';
import { stripHtml } from '../scripts/normalize.mjs';

const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Demo AI Blog</title>
    <item>
      <title><![CDATA[OpenAI ships <b>GPT-5</b>]]></title>
      <link>https://openai.com/news/gpt-5/</link>
      <guid isPermaLink="false">openai-123</guid>
      <description><![CDATA[<p>Today we release &amp; ship a new model.</p>]]></description>
      <pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate>
      <category>Research</category>
      <category>Models</category>
    </item>
    <item>
      <title>Second post</title>
      <link>https://openai.com/news/second/</link>
      <pubDate>Sun, 25 Oct 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Hugging Face Blog</title>
  <entry>
    <title>SmolLM3 is here</title>
    <link rel="alternate" href="https://huggingface.co/blog/smollm3" />
    <id>https://huggingface.co/blog/smollm3</id>
    <published>2026-10-25T09:00:00Z</published>
    <summary>A small model that punches above its weight.</summary>
    <category term="llm" />
  </entry>
</feed>`;

test('parseFeedXml 解析 RSS2：CDATA、guid、分类、日期', () => {
  const items = parseFeedXml(RSS2, { limit: 10 });
  assert.equal(items.length, 2);
  assert.equal(items[0].externalId, 'openai-123');
  assert.equal(items[0].url, 'https://openai.com/news/gpt-5/');
  // fetcher 保留原文摘要（含 HTML），由 normalizeItem 统一去标签
  assert.equal(stripHtml(items[0].summary), 'Today we release & ship a new model.');
  assert.deepEqual(items[0].tags, ['Research', 'Models']);
  assert.ok(!Number.isNaN(new Date(items[0].publishedAt).getTime()));
});

test('parseFeedXml 解析 Atom：link@href、published、term', () => {
  const items = parseFeedXml(ATOM, { limit: 10 });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'SmolLM3 is here');
  assert.equal(items[0].url, 'https://huggingface.co/blog/smollm3');
  assert.equal(items[0].externalId, 'https://huggingface.co/blog/smollm3');
  assert.deepEqual(items[0].tags, ['llm']);
  assert.equal(items[0].publishedAt, '2026-10-25T09:00:00Z');
});

test('parseFeedXml 遵守 limit 上限', () => {
  assert.equal(parseFeedXml(RSS2, { limit: 1 }).length, 1);
});

test('parseFeedXml 对空 feed 抛错，便于记录来源失效', () => {
  assert.throws(() => parseFeedXml('<rss><channel></channel></rss>'), /未解析到任何条目/);
});
