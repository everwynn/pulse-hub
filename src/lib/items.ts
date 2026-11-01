import type {
  ChannelId,
  DateEntry,
  DateIndex,
  HealthSnapshot,
  Item,
  SourceSnapshot,
} from '../types';

/** 数据文件在构建期静态载入；缺失时返回空结构，保证空仓库也能构建 */
const itemModules = import.meta.glob<Item[]>('../../data/items/*.json', {
  eager: true,
  import: 'default',
});

const dataModules = import.meta.glob<unknown>('../../data/*.json', {
  eager: true,
  import: 'default',
});

function readData<T>(name: string, fallback: T): T {
  const value = dataModules[`../../data/${name}`];
  return (value as T) ?? fallback;
}

export const dateIndex = readData<DateIndex>('index.json', {
  timeZone: 'Asia/Shanghai',
  updatedAt: '',
  dates: [],
});

export const health = readData<HealthSnapshot>('health.json', {
  updatedAt: '',
  timeZone: 'Asia/Shanghai',
  summary: {
    total: 0,
    ok: 0,
    failed: 0,
    skipped: 0,
    fetched: 0,
    stored: 0,
    duplicates: 0,
    todayCount: 0,
  },
  sources: {},
});

export const sourceSnapshot = readData<SourceSnapshot[]>('sources.json', []);

const TIME_ZONE = 'Asia/Shanghai';

export function getAllItems(): Item[] {
  return Object.entries(itemModules)
    .flatMap(([, items]) => (Array.isArray(items) ? items : []))
    .filter((item) => item && item.title && item.url);
}

/** 北京时间口径的 YYYY-MM-DD */
export function dateKeyOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** 构建期的相对时间（站点每天重建，误差可接受） */
export function formatRelative(iso: string, now = Date.now()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const diffMinutes = Math.round((now - time) / 60000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 8) return `${days} 天前`;
  return dateKeyOf(iso);
}

export function getLatestDate(): string {
  return dateIndex.dates[0]?.date ?? '';
}

export function getDateEntries(): DateEntry[] {
  return dateIndex.dates;
}

export function getItemsByDate(date: string): Item[] {
  return getAllItems()
    .filter((item) => dateKeyOf(item.publishedAt) === date)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/**
 * 语言曝光优先级：中文条目排在英文之前。
 * 英文源数量远多于中文源，仅按权重排会让首页几乎全是英文。
 */
const LANG_RANK: Record<string, number> = { zh: 0, en: 1 };

function langRankOf(lang: string | undefined): number {
  return LANG_RANK[lang ?? ''] ?? 2;
}

/** 频道内排序：语言优先（中文在前），其次源权重，最后时间倒序 */
export function rankItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const langDiff = langRankOf(a.lang) - langRankOf(b.lang);
    if (langDiff !== 0) return langDiff;
    const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
    if (weightDiff !== 0) return weightDiff;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function getChannelItems(channel: ChannelId, limit = 0): Item[] {
  const items = rankItems(getAllItems().filter((item) => item.channel === channel));
  return limit > 0 ? items.slice(0, limit) : items;
}

/** 从已排好序的条目里挑出指定语言的前 N 条，保持原排序 */
export function pickByLang(items: Item[], lang: string, limit = 0): Item[] {
  const picked = items.filter((item) => (item.lang || 'en') === lang);
  return limit > 0 ? picked.slice(0, limit) : picked;
}

/** 按日期分组，保持传入顺序 */
export function groupByDate(items: Item[]): { date: string; items: Item[] }[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = dateKeyOf(item.publishedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, group]) => ({ date, items: group }));
}

export function getChannelCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of getAllItems()) {
    counts[item.channel] = (counts[item.channel] ?? 0) + 1;
  }
  return counts;
}

/** 各语言条目数，用于页面展示“中文 N 条 / 英文 M 条” */
export function getLangCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of getAllItems()) {
    const key = item.lang || 'en';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function getTags(items: Item[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));
}

export function totalCount(): number {
  return getAllItems().length;
}
