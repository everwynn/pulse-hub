import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const ITEMS_DIR = path.join(DATA_DIR, 'items');

/** 站点以北京时间为“今日”口径 */
export const TIME_ZONE = process.env.PULSE_TIME_ZONE || 'Asia/Shanghai';

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** 内容不变则不落盘，避免 Actions 里产生无意义的 diff */
export function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text, 'utf8');
  return true;
}

export function listItemFiles() {
  if (!existsSync(ITEMS_DIR)) return [];
  return readdirSync(ITEMS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function itemFile(dateKey) {
  return path.join(ITEMS_DIR, `${dateKey}.json`);
}

export function removeItemFile(dateKey) {
  const file = itemFile(dateKey);
  if (existsSync(file)) unlinkSync(file);
}

/** ISO 时间 → 北京时间的 YYYY-MM-DD */
export function dateKeyOf(iso, timeZone = TIME_ZONE) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** 'YYYY-MM-DD' 加减天数 */
export function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
