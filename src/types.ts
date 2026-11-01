export type ChannelId = 'ai' | 'tech' | 'finance' | 'policy';

export type SourceStatus = 'ok' | 'error' | 'skipped';

/** 来源可信度分层：官方机构 / 专业媒体 / 社区与平台 */
export type SourceTier = 'official' | 'media' | 'community';

export interface ItemSignals {
  points?: number;
  stars?: number;
  comments?: number;
  forks?: number;
  reactions?: number;
  replies?: number;
  sentiment?: number;
}

/** 一条头条信息（只保留标题、短摘要与原文链接，不存正文） */
export interface Item {
  id: string;
  sourceId: string;
  sourceName: string;
  channel: ChannelId;
  title: string;
  summary: string;
  url: string;
  canonicalUrl: string;
  publishedAt: string;
  fetchedAt: string;
  tags: string[];
  signals: ItemSignals;
  lang: string;
  weight: number;
  titleKey?: string;
}

export interface DateEntry {
  date: string;
  count: number;
  channels: Record<string, number>;
}

export interface DateIndex {
  timeZone: string;
  updatedAt: string;
  dates: DateEntry[];
}

export interface SourceHealth {
  name: string;
  channel: ChannelId;
  status: SourceStatus;
  count: number;
  durationMs: number;
  reason: string | null;
  checkedAt: string;
  lastSuccessAt: string | null;
}

export interface HealthSnapshot {
  updatedAt: string;
  timeZone: string;
  summary: {
    total: number;
    ok: number;
    failed: number;
    skipped: number;
    fetched: number;
    stored: number;
    duplicates: number;
    todayCount: number;
  };
  sources: Record<string, SourceHealth>;
}

export interface SourceSnapshot {
  id: string;
  name: string;
  channel: ChannelId;
  type: string;
  api: string | null;
  endpoint: string;
  weight: number;
  limit: number;
  lang: string;
  tier: SourceTier;
  enabled: boolean;
  note: string | null;
}

/**
 * 财报日程里的一个事件。
 * 注意这是「未来事件」，与 Item 的「已发布时间戳」是两套模型，不能混进新闻流。
 */
export interface EarningsEvent {
  symbol: string;
  /** 美东日历日，YYYY-MM-DD（财报日期本身按美东口径公布，不做时区换算） */
  date: string;
  /** bmo=盘前 / dmh=盘中 / amc=盘后 / 空=未定 */
  hour: string;
  quarter: number | null;
  year: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface EarningsCalendar {
  updatedAt: string;
  timeZone: string;
  from: string;
  to: string;
  /** skipped=没配 Key，forbidden=套餐无权限，两者都不渲染模块 */
  status: 'ok' | 'skipped' | 'forbidden' | 'error';
  reason: string | null;
  events: EarningsEvent[];
}
