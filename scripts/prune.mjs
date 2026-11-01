import { dateKeyOf, listItemFiles, removeItemFile, shiftDateKey } from './lib/files.mjs';

/**
 * 计算需要清理的归档日期：只保留最近 keepDays 天，避免仓库无限膨胀。
 * 返回日期字符串数组（YYYY-MM-DD）。
 */
export function datesToPrune(files, keepDays, nowIso = new Date().toISOString()) {
  if (!Number.isFinite(keepDays) || keepDays <= 0) return [];
  const today = dateKeyOf(nowIso);
  if (!today) return [];
  const cutoff = shiftDateKey(today, -keepDays);

  return files
    .map((name) => name.replace(/\.json$/, ''))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff);
}

export function pruneOldFiles(keepDays, { nowIso = new Date().toISOString(), dryRun = false } = {}) {
  const targets = datesToPrune(listItemFiles(), keepDays, nowIso);
  if (!dryRun) {
    for (const date of targets) removeItemFile(date);
  }
  return targets;
}
