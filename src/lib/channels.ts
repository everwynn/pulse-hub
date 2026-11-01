import type { ChannelId } from '../types';

export interface ChannelMeta {
  id: ChannelId;
  label: string;
  short: string;
  description: string;
  /** 频道徽章配色（静态类名，不能拼接，否则会被 Tailwind 摇掉） */
  badge: string;
  dot: string;
}

export const CHANNELS: ChannelMeta[] = [
  {
    id: 'ai',
    label: 'AI 前沿',
    short: 'AI',
    description: '大模型、论文、开源与研究动态，来源为各家官方博客与 arXiv',
    badge:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900',
    dot: 'bg-sky-500',
  },
  {
    id: 'tech',
    label: '技术社区',
    short: '技术',
    description: 'Hacker News、GitHub 新晋热门、开发者社区讨论',
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900',
    dot: 'bg-emerald-500',
  },
  {
    id: 'finance',
    label: '财经',
    short: '财经',
    description: '市场要闻与科技公司动态，仅呈现标题与原文链接',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
    dot: 'bg-amber-500',
  },
  {
    id: 'policy',
    label: '政策',
    short: '政策',
    description: '政策文件与产业监管，来源为政府官网',
    badge:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900',
    dot: 'bg-violet-500',
  },
];

export const CHANNEL_MAP: Record<ChannelId, ChannelMeta> = CHANNELS.reduce(
  (acc, channel) => ({ ...acc, [channel.id]: channel }),
  {} as Record<ChannelId, ChannelMeta>,
);

export function isChannelId(value: string): value is ChannelId {
  return value in CHANNEL_MAP;
}
