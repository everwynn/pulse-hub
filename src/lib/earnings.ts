import type { EarningsCalendar, EarningsEvent } from '../types';

/** 财报日历由 scripts/fetch-earnings.mjs 写入；首次运行前文件可能不存在，空对象兜底 */
const modules = import.meta.glob<unknown>('../../data/earnings.json', {
  eager: true,
  import: 'default',
});

const EMPTY: EarningsCalendar = {
  updatedAt: '',
  timeZone: 'Asia/Shanghai',
  from: '',
  to: '',
  status: 'skipped',
  reason: null,
  events: [],
};

export const earningsCalendar: EarningsCalendar =
  (modules['../../data/earnings.json'] as EarningsCalendar) ?? EMPTY;

/**
 * 关注列表在 config/earnings-watchlist.json，抓取端和页面端读同一份。
 * 页面这里再筛一遍是防御性的：data/earnings.json 是构建期读的静态文件，
 * 可能是上一轮抓的，如果之后收窄过 watchlist，旧票不应该继续留在页面上。
 */
const watchlistModules = import.meta.glob<unknown>('../../config/earnings-watchlist.json', {
  eager: true,
  import: 'default',
});

const WATCHLIST = new Set<string>(
  (
    (watchlistModules['../../config/earnings-watchlist.json'] as { symbols?: string[] } | undefined)
      ?.symbols ?? []
  )
    .map((symbol) => String(symbol).trim().toUpperCase())
    .filter(Boolean),
);

/**
 * 关注列表里的票在页面上的中文名。
 * 没收录的直接显示代码——财报日历只到 symbol 级别，Finnhub 不返回公司全名。
 */
const COMPANY_NAMES: Record<string, string> = {
  AAPL: '苹果',
  MSFT: '微软',
  GOOGL: '谷歌',
  GOOG: '谷歌',
  AMZN: '亚马逊',
  META: 'Meta',
  TSLA: '特斯拉',
  NFLX: '奈飞',
  ORCL: '甲骨文',
  CRM: 'Salesforce',
  ADBE: 'Adobe',
  IBM: 'IBM',
  INTC: '英特尔',
  SAP: 'SAP',
  NVDA: '英伟达',
  AMD: 'AMD',
  AVGO: '博通',
  TSM: '台积电',
  ASML: '阿斯麦',
  MU: '美光',
  QCOM: '高通',
  ARM: 'Arm',
  SMCI: '超微电脑',
  MRVL: 'Marvell',
  LRCX: '泛林集团',
  AMAT: '应用材料',
  KLAC: '科磊',
  TXN: '德州仪器',
  ADI: '亚德诺',
  PLTR: 'Palantir',
  SNOW: 'Snowflake',
  CRWD: 'CrowdStrike',
  DDOG: 'Datadog',
  MDB: 'MongoDB',
  NET: 'Cloudflare',
  NOW: 'ServiceNow',
  SHOP: 'Shopify',
  UBER: '优步',
  ABNB: '爱彼迎',
  PANW: 'Palo Alto',
  ZS: 'Zscaler',
  BABA: '阿里巴巴',
  JD: '京东',
  PDD: '拼多多',
  BIDU: '百度',
  NTES: '网易',
  TCOM: '携程',
  NIO: '蔚来',
  XPEV: '小鹏',
  LI: '理想',
  BILI: '哔哩哔哩',
  TME: '腾讯音乐',
  IQ: '爱奇艺',
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function companyNameOf(symbol: string): string {
  return COMPANY_NAMES[symbol] ?? symbol;
}

/** 财报时段：盘前 / 盘中 / 盘后 / 待定 */
export function formatHour(hour: string): string {
  if (hour === 'bmo') return '盘前';
  if (hour === 'amc') return '盘后';
  if (hour === 'dmh') return '盘中';
  return '待定';
}

/** 美东口径的今天，YYYY-MM-DD。财报日期按美东日历日公布，用 UTC 或北京日期会差一天 */
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * EPS 的展示文案。
 * 已公布（epsActual 有值）时给出实际值与对比，未公布只给预期。
 */
export function formatEps(event: EarningsEvent): string {
  const { epsActual, epsEstimate } = event;
  const fmt = (value: number) => (Math.round(value * 100) / 100).toFixed(2);
  if (epsActual != null && epsEstimate != null) return `实际 ${fmt(epsActual)} / 预期 ${fmt(epsEstimate)}`;
  if (epsActual != null) return `实际 ${fmt(epsActual)}`;
  if (epsEstimate != null) return `预期 ${fmt(epsEstimate)}`;
  return '';
}

/** 超预期幅度（%）。只有实际与预期都有值才算得出来 */
export function epsSurprise(event: EarningsEvent): number | null {
  const { epsActual, epsEstimate } = event;
  if (epsActual == null || epsEstimate == null || epsEstimate === 0) return null;
  return ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100;
}

export interface EarningsDay {
  date: string;
  /** 11/02 周一 */
  label: string;
  isToday: boolean;
  events: EarningsEvent[];
}

/**
 * 按日期分组，剔除已经过去的日子。
 * 构建是每天一次的，所以「今天」取构建时刻的美东日期即可。
 */
export function getUpcomingEarnings(now = new Date()): EarningsDay[] {
  const today = easternToday(now);
  const buckets = new Map<string, EarningsEvent[]>();

  for (const event of earningsCalendar.events) {
    if (!event.date || event.date < today) continue;
    if (WATCHLIST.size && !WATCHLIST.has(event.symbol)) continue;
    if (!buckets.has(event.date)) buckets.set(event.date, []);
    buckets.get(event.date)!.push(event);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, events]) => {
      const month = date.slice(5, 7).replace(/^0/, '');
      const day = date.slice(8, 10).replace(/^0/, '');
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? '';
      return {
        date,
        label: `${month}/${day} ${weekday}`,
        isToday: date === today,
        events,
      };
    });
}

/** 只有真的抓到数据才渲染模块，没配 Key / 无权限时静默 */
export function hasEarnings(now = new Date()): boolean {
  return earningsCalendar.status === 'ok' && getUpcomingEarnings(now).length > 0;
}
