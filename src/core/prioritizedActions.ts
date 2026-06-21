/**
 * Merge structured prioritized actions from recommendations and quality extensions.
 *
 * Blocking quality actions (hard lint, banlist, bracket) are prepended so agents
 * fix legality before thematic cuts/adds — aligned with buildNextSuggestedAction.
 */

import type { DeckRecommendations, PrioritizedAction } from './types';

/** Hard lint, banlist, and bracket fixes must precede thematic recommendations. */
export function isBlockingPrioritizedAction(action: PrioritizedAction): boolean {
  if (action.action === 'fix') return true;
  if (action.action === 'cut' && action.detail.toLowerCase().includes('banlist')) {
    return true;
  }
  return false;
}

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

  const quality = fromQuality ?? [];
  const blockingQuality = quality.filter(isBlockingPrioritizedAction);
  const nonBlockingQuality = quality.filter((a) => !isBlockingPrioritizedAction(a));

  for (const a of blockingQuality) push(a);
  for (const a of fromRecommendations ?? []) {
    if (merged.length >= maxItems) break;
    push(a);
  }
  for (const a of nonBlockingQuality) {
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
