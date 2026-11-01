import test from 'node:test';
import assert from 'node:assert/strict';
import {
  briefSummary,
  canonicalizeUrl,
  makeId,
  normalizeItem,
  stripHtml,
  titleFingerprint,
  toIso,
  truncate,
} from '../scripts/normalize.mjs';

const SOURCE = { id: 'demo-feed', name: 'Demo Feed', channel: 'ai', weight: 90, lang: 'en' };

test('canonicalizeUrl 去掉追踪参数与 hash，保留业务参数', () => {
  assert.equal(
    canonicalizeUrl('https://Example.com/post/1/?utm_source=x&utm_medium=y&id=7#section'),
    'https://example.com/post/1?id=7',
  );
  // 无查询串时去掉尾部多余斜杠
  assert.equal(canonicalizeUrl('https://example.com/post/'), 'https://example.com/post');
  // 非法 URL 原样返回，不抛错
  assert.equal(canonicalizeUrl('not a url'), 'not a url');
});

test('stripHtml 去标签并解码实体（含数字实体）', () => {
  const html = '<p>Hello&nbsp;<b>World</b> &amp; &#39;AI&#39; &#x4E2D;文</p>';
  assert.equal(stripHtml(html), "Hello World & 'AI' 中文");
});

test('truncate 按字符截断并补省略号，且不切断代理对', () => {
  assert.equal(truncate('abc', 5), 'abc');
  assert.equal(truncate('abcdef', 3), 'abc…');
  assert.equal(truncate('😀😀😀😀', 2), '😀😀…');
});

test('briefSummary 只取第一句并封顶 80 字', () => {
  // 中文句末标点优先
  assert.equal(briefSummary('这是一句足够长的第一句话。第二句话不应该出现。'), '这是一句足够长的第一句话。');
  // 先去标签再取句
  assert.equal(
    briefSummary('<p>OpenAI ships a new model today. Details below.</p>'),
    'OpenAI ships a new model today.',
  );
  assert.equal(briefSummary(''), '');
  // 无句末标点时按 80 字封顶
  assert.equal([...briefSummary('长'.repeat(400))].length, 81);
  // 首句是样板尾巴时，退回前 80 字
  assert.equal([...briefSummary(`Read more. ${'x'.repeat(100)}`)].length, 81);
  // 首句过短（寒暄/纯标题）时，退回前 80 字而不是只留一句寒暄
  assert.equal(briefSummary(`Hoi hoi! ${'y'.repeat(20)}`), `Hoi hoi! ${'y'.repeat(20)}`);
});

test('titleFingerprint 抹平大小写、标点与空白', () => {
  assert.equal(titleFingerprint('  OpenAI 发布 GPT-5！ '), titleFingerprint('openai发布gpt5'));
  assert.equal(titleFingerprint('A/B 测试'), titleFingerprint('a b 测试'));
});

test('normalizeItem 缺标题或链接时返回 null', () => {
  assert.equal(normalizeItem({ title: '', url: 'https://a.com' }, SOURCE), null);
  assert.equal(normalizeItem({ title: '标题', url: '' }, SOURCE), null);
});

test('normalizeItem 生成稳定 ID、短摘要与来源元数据', () => {
  const raw = {
    externalId: 'guid-1',
    title: '<b>OpenAI ships a new model</b>',
    url: 'https://openai.com/news/x?utm_source=rss',
    summary: `<p>${'长'.repeat(400)}</p>`,
    publishedAt: '2026-10-26T10:00:00Z',
    tags: ['AI', 'AI', 'LLM'],
  };
  const item = normalizeItem(raw, SOURCE, { nowIso: '2026-10-27T00:00:00.000Z' });

  assert.equal(item.title, 'OpenAI ships a new model');
  assert.equal(item.canonicalUrl, 'https://openai.com/news/x');
  assert.equal(item.channel, 'ai');
  assert.equal(item.weight, 90);
  assert.equal(item.id, makeId(['demo-feed', 'guid-1']));
  assert.deepEqual(item.tags, ['AI', 'LLM'], '标签需去重');
  assert.equal([...item.summary].length, 81, '摘要需截断到 80 字加省略号');
  assert.equal(item.fetchedAt, '2026-10-27T00:00:00.000Z');
});

test('normalizeItem 对 summary=false 的源丢弃摘要', () => {
  const raw = { title: '论文标题', url: 'https://arxiv.org/abs/1', summary: 'abstract 全文' };
  const item = normalizeItem(raw, { ...SOURCE, summary: false });
  assert.equal(item.summary, '', '全文型 feed 只保留标题');
});

test('toIso 对异常时间兜底为抓取时间', () => {
  const now = '2026-10-27T00:00:00.000Z';
  assert.equal(toIso('', now), now);
  assert.equal(toIso('not-a-date', now), now);
  assert.equal(toIso('1999-01-01T00:00:00Z', now), now, '早于 2000 年视为脏数据');
  assert.equal(toIso('2999-01-01T00:00:00Z', now), now, '未来 1 天以上视为脏数据');
  assert.equal(toIso('2026-10-26T08:00:00Z', now), '2026-10-26T08:00:00.000Z');
});
