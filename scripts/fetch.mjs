#!/usr/bin/env node
/**
 * 头条抓取编排：多源并发抓取 → 归一化 → 去重 → 按天归档 → 更新索引与健康度。
 *
 * 用法：
 *   node scripts/fetch.mjs                          正式抓取并写入 data/
 *   node scripts/fetch.mjs --dry-run --limit 3      只跑一遍看结果，不落盘
 *   node scripts/fetch.mjs --only hn-front          只抓指定源（调试单源）
 *   node scripts/fetch.mjs --keep-days 60           调整归档保留天数
 */
import path from 'node:path';
import pLimit from 'p-limit';
import { activeSources, resolveEnabled, resolveUrl, sources } from './sources.mjs';
import { fetchRss } from './fetchers/rss.mjs';
import { fetchHn } from './fetchers/hn.mjs';
import { fetchGithubTrending } from './fetchers/github.mjs';
import { fetchApi } from './fetchers/api.mjs';
import { fetchEarningsCalendar } from './fetch-earnings.mjs';
import { withRetry } from './lib/http.mjs';
import { normalizeItem } from './normalize.mjs';
import { dedupeItems } from './dedupe.mjs';
import { pruneOldFiles } from './prune.mjs';
import {
  DATA_DIR,
  ITEMS_DIR,
  TIME_ZONE,
  dateKeyOf,
  itemFile,
  listItemFiles,
  readJson,
  shiftDateKey,
  writeJson,
} from './lib/files.mjs';

const DEFAULTS = {
  keepDays: 90,
  concurrency: 4,
  timeoutMs: 15000,
};

function parseArgs(argv) {
  const options = {
    dryRun: false,
    keepDays: DEFAULTS.keepDays,
    concurrency: DEFAULTS.concurrency,
    only: '',
    limit: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--only') options.only = argv[++index] ?? '';
    else if (arg === '--limit') options.limit = Number(argv[++index]) || 0;
    else if (arg === '--keep-days') options.keepDays = Number(argv[++index]) || DEFAULTS.keepDays;
    else if (arg === '--concurrency') {
      options.concurrency = Number(argv[++index]) || DEFAULTS.concurrency;
    }
  }
  return options;
}

function fetcherFor(source) {
  switch (source.type) {
    case 'rss':
      return fetchRss;
    case 'hn':
      return fetchHn;
    case 'github':
      return fetchGithubTrending;
    case 'api':
      return fetchApi;
    default:
      throw new Error(`未知源类型：${source.type}`);
  }
}

/** 单源抓取：任何异常都收敛为 health 状态，绝不中断整轮任务 */
async function runSource(source, { limit }) {
  const startedAt = Date.now();
  const base = { source, items: [] };

  const url = resolveUrl(source.url);
  if (!url) {
    return { ...base, status: 'skipped', reason: '缺少 RSSHUB_BASE，未启用该源', durationMs: 0 };
  }
  if (source.keyEnv && !process.env[source.keyEnv]) {
    return { ...base, status: 'skipped', reason: `未配置 ${source.keyEnv}`, durationMs: 0 };
  }

  const fetchOptions = { timeoutMs: DEFAULTS.timeoutMs, limit: limit || undefined };
  const resolved = { ...source, url };

  try {
    const raw = await withRetry(() => fetcherFor(resolved)(resolved, fetchOptions));
    return {
      ...base,
      status: 'ok',
      count: raw.length,
      durationMs: Date.now() - startedAt,
      items: raw,
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      reason: error?.message ?? String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padStart(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const nowIso = new Date().toISOString();
  const targets = activeSources({ only: options.only });

  if (!targets.length) {
    console.error(
      '没有匹配的信息源，请检查 --only 参数、config/sources.json 的开关或 sources.mjs 的 enabled 配置',
    );
    process.exit(1);
  }

  const disabledCount = sources.length - targets.length;
  console.log(`开始抓取 ${targets.length} 个信息源 · ${nowIso}`);
  if (disabledCount > 0) {
    console.log(`另有 ${disabledCount} 个源被 config/sources.json 或自身 enabled 关闭，本轮跳过`);
  }
  console.log('-'.repeat(96));

  const limit = pLimit(options.concurrency);
  const results = await Promise.all(
    targets.map((source) => limit(() => runSource(source, { limit: options.limit }))),
  );

  for (const result of results) {
    const flag = result.status === 'ok' ? 'OK  ' : result.status === 'skipped' ? 'SKIP' : 'FAIL';
    const detail =
      result.status === 'ok'
        ? `${result.count} 条`
        : result.reason ?? '';
    console.log(
      `[${flag}] ${pad(result.source.id, 22)} ${pad(result.source.channel, 8)} ${padStart(
        detail,
        6,
      )}  ${result.durationMs}ms  ${result.status === 'ok' ? '' : detail}`.trim(),
    );
  }

  // 归一化 + 合并最近若干天的历史（保证去重跨天跨轮次生效）
  const fresh = results.flatMap((result) =>
    result.items
      .map((raw) => normalizeItem(raw, result.source, { nowIso }))
      .filter(Boolean),
  );

  // 历史数据全量载入：既支持跨轮次、跨天去重，也避免“新数据覆盖同日旧数据”
  const historical = listItemFiles().flatMap((name) => {
    const items = readJson(path.join(ITEMS_DIR, name), []);
    return Array.isArray(items) ? items : [];
  });

  // 保留条目的首次抓取时间，避免同一内容反复刷新 fetchedAt 产生无意义 diff
  const previousById = new Map(historical.map((item) => [item.id, item]));
  for (const item of fresh) {
    const previous = previousById.get(item.id);
    if (previous?.fetchedAt) item.fetchedAt = previous.fetchedAt;
  }

  const { items: merged, dropped } = dedupeItems([...fresh, ...historical]);

  // 按北京时间的自然日分桶
  const buckets = new Map();
  for (const item of merged) {
    const key = dateKeyOf(item.publishedAt) ?? dateKeyOf(nowIso);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const today = dateKeyOf(nowIso);
  const keepFrom = shiftDateKey(today, -options.keepDays);
  const todayCount = buckets.get(today)?.length ?? 0;

  console.log('-'.repeat(96));
  console.log(
    `本轮新抓取 ${fresh.length} 条 · 去重后保留 ${merged.length} 条（丢弃重复 ${dropped} 条）`,
  );
  console.log(`今日 ${today} 共 ${todayCount} 条 · 覆盖 ${buckets.size} 个日期`);

  if (options.dryRun) {
    console.log('dry-run：不写入任何文件');
    return;
  }

  // 写入按天归档
  let touched = 0;
  for (const [dateKey, items] of buckets) {
    // 超出保留期的老条目直接跳过，不必先写盘再删
    if (dateKey < keepFrom) continue;
    const sorted = [...items].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    if (writeJson(itemFile(dateKey), sorted)) touched += 1;
  }

  // 清理超出保留期的归档
  const pruned = pruneOldFiles(options.keepDays, { nowIso });
  if (pruned.length) console.log(`清理归档：${pruned.join('、')}（超出 ${options.keepDays} 天）`);

  // 重建日期索引
  const dates = listItemFiles()
    .map((name) => name.replace(/\.json$/, ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map((date) => {
      const items = readJson(itemFile(date), []);
      const counts = {};
      for (const item of Array.isArray(items) ? items : []) {
        counts[item.channel] = (counts[item.channel] ?? 0) + 1;
      }
      return { date, count: Array.isArray(items) ? items.length : 0, channels: counts };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  writeJson(path.join(DATA_DIR, 'index.json'), { timeZone: TIME_ZONE, updatedAt: nowIso, dates });

  // 更新来源健康度
  const previous = readJson(path.join(DATA_DIR, 'health.json'), { sources: {} });
  const sourceHealth = {};
  for (const result of results) {
    const before = previous.sources?.[result.source.id] ?? {};
    sourceHealth[result.source.id] = {
      name: result.source.name,
      channel: result.source.channel,
      status: result.status,
      count: result.count ?? 0,
      durationMs: result.durationMs ?? 0,
      reason: result.reason ?? null,
      checkedAt: nowIso,
      lastSuccessAt: result.status === 'ok' ? nowIso : before.lastSuccessAt ?? null,
    };
  }

  writeJson(path.join(DATA_DIR, 'health.json'), {
    updatedAt: nowIso,
    timeZone: TIME_ZONE,
    summary: {
      total: results.length,
      ok: results.filter((result) => result.status === 'ok').length,
      failed: results.filter((result) => result.status === 'error').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      fetched: fresh.length,
      stored: merged.length,
      duplicates: dropped,
      todayCount,
    },
    sources: sourceHealth,
  });

  // 供 /sources 页面渲染的源快照
  writeJson(
    path.join(DATA_DIR, 'sources.json'),
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      channel: source.channel,
      type: source.type,
      api: source.api ?? null,
      endpoint: source.url.replace(/\?.*$/, ''),
      weight: source.weight ?? 50,
      limit: source.limit ?? 10,
      lang: source.lang ?? 'en',
      tier: source.tier ?? 'media',
      enabled: resolveEnabled(source),
      note: source.note ?? null,
    })),
  );

  console.log(`已更新 ${touched} 个归档文件 · health/sources/index 已刷新`);

  // 财报日历是「未来事件」，与按已发布日期归档的 items 是两套模型，单独落盘。
  // 放在最后：即使它失败也不影响本轮新闻数据的写入。
  const earnings = await fetchEarningsCalendar({ nowIso });
  writeJson(path.join(DATA_DIR, 'earnings.json'), earnings);
}

main().catch((error) => {
  console.error('抓取任务异常终止：', error);
  process.exit(1);
});
