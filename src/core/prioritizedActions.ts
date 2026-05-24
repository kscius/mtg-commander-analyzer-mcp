/**
 * Merge structured prioritized actions from recommendations and quality extensions.
 */

import type { DeckRecommendations, PrioritizedAction } from './types';

export function mergePrioritizedActions(
  fromRecommendations: PrioritizedAction[] | undefined,
  fromQuality: PrioritizedAction[] | undefined,
  maxItems = 8
): PrioritizedAction[] {
  const seen = new Set<string>();
  const merged: PrioritizedAction[] = [];
  let p = 1;

  const push = (a: PrioritizedAction) => {
    const key = `${a.action}:${a.category ?? ''}:${a.suggestedCard ?? ''}:${a.detail.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ ...a, priority: p++ });
  };

  for (const a of fromRecommendations ?? []) push(a);
  for (const a of fromQuality ?? []) {
    if (merged.length >= maxItems) break;
    push(a);
  }

  return merged.slice(0, maxItems);
}

export function recommendationsToPrioritized(
  rec?: DeckRecommendations
): PrioritizedAction[] {
  return rec?.prioritizedActions ?? [];
}
