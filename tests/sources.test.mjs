import assert from 'node:assert/strict';
import test from 'node:test';
import { activeSources, resolveEnabled, sources } from '../scripts/sources.mjs';

/** 最小源样本：只带 resolveEnabled 用到的字段 */
const BASE = {
  id: 'demo',
  channel: 'tech',
  tier: 'media',
  type: 'rss',
  lang: 'zh',
  enabled: true,
};

const EMPTY = { groups: {}, sources: {} };

test('resolveEnabled 默认看源内 enabled', () => {
  assert.equal(resolveEnabled(BASE, EMPTY), true);
  assert.equal(resolveEnabled({ ...BASE, enabled: false }, EMPTY), false);
});

test('resolveEnabled 支持四种分组键', () => {
  assert.equal(resolveEnabled(BASE, { groups: { 'tier.media': false }, sources: {} }), false);
  assert.equal(resolveEnabled(BASE, { groups: { 'channel.tech': false }, sources: {} }), false);
  assert.equal(resolveEnabled(BASE, { groups: { 'lang.zh': false }, sources: {} }), false);
  assert.equal(resolveEnabled(BASE, { groups: { 'type.rss': false }, sources: {} }), false);
  // 只关别的不相关分组，不影响这个源
  assert.equal(resolveEnabled(BASE, { groups: { 'channel.finance': false }, sources: {} }), true);
});

test('resolveEnabled 单源设置优先级最高', () => {
  // 分组关掉后仍可单独放行
  assert.equal(resolveEnabled(BASE, { groups: { 'tier.media': false }, sources: { demo: true } }), true);
  // 分组开着也能单独停掉
  assert.equal(resolveEnabled(BASE, { groups: { 'tier.media': true }, sources: { demo: false } }), false);
  // 源内 enabled:false 被单源放行覆盖
  assert.equal(resolveEnabled({ ...BASE, enabled: false }, { groups: {}, sources: { demo: true } }), true);
});

test('activeSources 跟随配置收缩', () => {
  const all = activeSources({ includeDisabled: true });
  assert.equal(all.length, sources.length);

  const enabledNow = activeSources();
  assert.ok(enabledNow.length > 0);
  assert.ok(enabledNow.length < sources.length, '已有源默认关闭，启用数应少于总数');

  // --only 与开关取交集：默认关闭的源不会因为 --only 被强行抓取
  const closed = sources.find((source) => source.enabled === false);
  if (closed) {
    assert.equal(activeSources({ only: closed.id }).length, 0);
  }
});

test('分组键由源的字段拼出，不会漏配', () => {
  // 所有源的 channel / type / tier / lang 都能拼成可用的分组键
  for (const source of sources) {
    for (const key of [
      `tier.${source.tier ?? 'media'}`,
      `channel.${source.channel}`,
      `lang.${source.lang ?? 'en'}`,
      `type.${source.type}`,
    ]) {
      assert.ok(typeof key === 'string' && key.includes('.'), `${source.id} 的分组键异常：${key}`);
    }
  }
});
