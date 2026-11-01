import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeItems } from '../scripts/dedupe.mjs';
import { normalizeItem } from '../scripts/normalize.mjs';

const NOW = '2026-10-27T00:00:00.000Z';

function build(raw, source) {
  return normalizeItem(raw, source, { nowIso: NOW });
}

const HIGH = { id: 'high', name: '高权重源', channel: 'ai', weight: 90 };
const LOW = { id: 'low', name: '低权重源', channel: 'ai', weight: 50 };

test('dedupeItems 丢弃完全相同的条目', () => {
  const item = build({ externalId: '1', title: 'A', url: 'https://a.com/1' }, HIGH);
  const { items, dropped } = dedupeItems([item, { ...item }]);
  assert.equal(items.length, 1);
  assert.equal(dropped, 1);
});

test('dedupeItems 把仅追踪参数不同的链接视为同一条，并保留高权重源', () => {
  const fromLow = build(
    { externalId: 'x', title: 'Claude 5 发布', url: 'https://news.com/claude?utm_source=tg' },
    LOW,
  );
  const fromHigh = build(
    { externalId: 'y', title: 'Claude 5 正式发布', url: 'https://news.com/claude' },
    HIGH,
  );
  const { items } = dedupeItems([fromLow, fromHigh]);
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceId, 'high');
});

test('dedupeItems 在频道内按标题指纹去重（跨源同一事件）', () => {
  const a = build({ externalId: '1', title: 'OpenAI 发布新模型', url: 'https://a.com/x' }, HIGH);
  const b = build({ externalId: '2', title: 'OpenAI 发布新模型！', url: 'https://b.com/y' }, LOW);
  const { items } = dedupeItems([a, b]);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://a.com/x');
});

test('dedupeItems 不跨频道合并同标题条目', () => {
  const ai = build({ externalId: '1', title: 'Nvidia 财报超预期', url: 'https://a.com/x' }, HIGH);
  const finance = normalizeItem(
    { externalId: '2', title: 'Nvidia 财报超预期', url: 'https://b.com/y' },
    { id: 'fin', name: '财经源', channel: 'finance', weight: 60 },
    { nowIso: NOW },
  );
  const { items } = dedupeItems([ai, finance]);
  assert.equal(items.length, 2);
});

test('dedupeItems 保持权重优先、其次时间倒序', () => {
  const low = build(
    { externalId: '1', title: '低权重旧闻', url: 'https://a.com/1', publishedAt: '2026-10-20T00:00:00Z' },
    LOW,
  );
  const high = build(
    { externalId: '2', title: '高权重新闻', url: 'https://a.com/2', publishedAt: '2026-10-19T00:00:00Z' },
    HIGH,
  );
  const { items } = dedupeItems([low, high]);
  assert.equal(items[0].sourceId, 'high');
});
