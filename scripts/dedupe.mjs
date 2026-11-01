/**
 * 三层去重：ID → 归一化 URL → 频道内标题指纹。
 * 排序先按源权重（高权重源胜出），再按发布时间倒序，
 * 保证同一事件被多个源报道时保留最可信的那一条。
 */
export function dedupeItems(items) {
  const ranked = [...items].sort((a, b) => {
    const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
    if (weightDiff !== 0) return weightDiff;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const seenIds = new Set();
  const seenUrls = new Map();
  const seenTitles = new Map();
  const kept = [];
  let dropped = 0;

  for (const item of ranked) {
    if (!item?.id) {
      dropped += 1;
      continue;
    }
    if (seenIds.has(item.id)) {
      dropped += 1;
      continue;
    }
    const urlKey = item.canonicalUrl || item.url;
    if (urlKey && seenUrls.has(urlKey)) {
      dropped += 1;
      continue;
    }
    const titleKey = item.titleKey ? `${item.channel}:${item.titleKey}` : '';
    if (titleKey && seenTitles.has(titleKey)) {
      dropped += 1;
      continue;
    }

    seenIds.add(item.id);
    if (urlKey) seenUrls.set(urlKey, item.id);
    if (titleKey) seenTitles.set(titleKey, item.id);
    kept.push(item);
  }

  return { items: kept, dropped };
}
