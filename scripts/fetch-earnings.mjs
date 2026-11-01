#!/usr/bin/env node
/**
 * 财报日历：拉取未来两周的财报发布日程，写入 data/earnings.json。
 *
 * 为什么单独一个文件（不并进 data/items）：
 * 财报日历是「未来事件」，而 items 是按 already-published 的时间戳归档的，
 * 两者混在一起会让 rankItems 把未来条目排到最前面，也会在 data/index.json
 * 里凭空多出未来日期的桶。所以这里独立存储，只在频道页单独渲染。
 *
 * 用法：
 *   node scripts/fetch-earnings.mjs
 */
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR, dateKeyOf, shiftDateKey, writeJson } from './lib/files.mjs';
import { fetchJson } from './lib/http.mjs';

const KEY_ENV = 'FINNHUB_KEY';
const ENDPOINT = 'https://finnhub.io/api/v1/calendar/earnings';
/** 往后看多少天。财报日程通常提前 2-4 周公布，两周足够覆盖「本周」和「下周」 */
const DAYS_AHEAD = 14;

/**
 * 关注列表：config/earnings-watchlist.json 优先。
 * 文件缺失或写坏时退回内置的最小集合——不能退化成「不过滤」，
 * Finnhub 的日历是全市场口径，一天几百家，不过滤页面根本没法看。
 */
const FALLBACK_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
  'NVDA', 'AMD', 'AVGO', 'TSM', 'BABA', 'PDD', 'JD',
];
const WATCHLIST_PATH = new URL('../config/earnings-watchlist.json', import.meta.url);

function loadWatchlist() {
  try {
    if (!existsSync(WATCHLIST_PATH)) return new Set(FALLBACK_WATCHLIST);
    const raw = JSON.parse(readFileSync(WATCHLIST_PATH, 'utf8'));
    const symbols = Array.isArray(raw?.symbols) ? raw.symbols : [];
    const normalized = symbols.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    return normalized.length ? new Set(normalized) : new Set(FALLBACK_WATCHLIST);
  } catch (error) {
    console.warn(`[earnings] 读取 config/earnings-watchlist.json 失败，退回内置列表：${error.message}`);
    return new Set(FALLBACK_WATCHLIST);
  }
}

const WATCHLIST = loadWatchlist();

/** 财报发布时段的先后顺序：盘前 → 盘中 → 盘后 → 未定 */
const HOUR_RANK = { bmo: 0, dmh: 1, amc: 2, '': 3 };

/** finnhub 对没有权限的接口返回 403，这里要跟普通失败区分开 */
function emptyCalendar({ nowIso, from, to, status, reason }) {
  return {
    updatedAt: nowIso,
    timeZone: 'Asia/Shanghai',
    from,
    to,
    status,
    reason: reason ?? null,
    events: [],
  };
}

function sortEvents(events) {
  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const rankDiff = (HOUR_RANK[a.hour] ?? 3) - (HOUR_RANK[b.hour] ?? 3);
    if (rankDiff !== 0) return rankDiff;
    return a.symbol.localeCompare(b.symbol);
  });
}

export async function fetchEarningsCalendar({ nowIso = new Date().toISOString() } = {}) {
  const key = process.env[KEY_ENV];
  const today = dateKeyOf(nowIso);
  const from = today;
  const to = shiftDateKey(today, DAYS_AHEAD);

  if (!key) {
    console.log(`[SKIP] 财报日历：未配置 ${KEY_ENV}`);
    return emptyCalendar({ nowIso, from, to, status: 'skipped', reason: `未配置 ${KEY_ENV}` });
  }

  try {
    const url = `${ENDPOINT}?from=${from}&to=${to}&token=${key}`;
    const data = await fetchJson(url, { timeoutMs: 15000 });
    const rows = data?.earningsCalendar;
    if (!Array.isArray(rows)) {
      throw new Error(data?.error ? `Finnhub: ${data.error}` : '返回格式异常');
    }

    const all = sortEvents(
      rows
        .filter((row) => WATCHLIST.has(String(row.symbol ?? '').toUpperCase()))
        .map((row) => ({
          symbol: String(row.symbol).toUpperCase(),
          // Finnhub 的 date 是美东日历日，财报日期本身就是按美东算的，不做时区换算
          date: String(row.date ?? ''),
          hour: row.hour ?? '',
          quarter: row.quarter ?? null,
          year: row.year ?? null,
          epsEstimate: row.epsEstimate ?? null,
          epsActual: row.epsActual ?? null,
          revenueEstimate: row.revenueEstimate ?? null,
          revenueActual: row.revenueActual ?? null,
        })),
    );

    console.log(
      `[OK  ] 财报日历：${from} ~ ${to} 共 ${rows.length} 家，关注列表（${WATCHLIST.size} 只）命中 ${all.length} 家`,
    );
    return { updatedAt: nowIso, timeZone: 'Asia/Shanghai', from, to, status: 'ok', reason: null, events: all };
  } catch (error) {
    const status = error?.status === 403 ? 'forbidden' : 'error';
    const reason =
      status === 'forbidden'
        ? '当前 Finnhub 套餐无权访问财报日历接口'
        : (error?.message ?? String(error));
    console.log(`[FAIL] 财报日历：${reason}`);
    return emptyCalendar({ nowIso, from, to, status, reason });
  }
}

// 只有直接执行本文件时才写盘；被 fetch.mjs import 时由调用方统一决定写盘时机
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/fetch-earnings.mjs')) {
  const snapshot = await fetchEarningsCalendar();
  writeJson(path.join(DATA_DIR, 'earnings.json'), snapshot);
  console.log(`已写入 data/earnings.json · status=${snapshot.status} · ${snapshot.events.length} 条`);
}
