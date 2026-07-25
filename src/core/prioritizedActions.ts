/**
 * Merge structured prioritized actions from recommendations and quality extensions.
 *
 * Order (aligned with docs/optimization-playbook.md + synergy-scoring-explained.md):
 * 1. Blocking legality (hard format/lint, banlist, Bracket 3)
 * 2. Category gap closers (add / search / swap for template `below` slots)
 * 3. Remaining recommendations (off-theme cuts, packages, above-max trims)
 * 4. Soft polish from quality (curve, synergy score nudges)
 */

import type { DeckRecommendations, PrioritizedAction } from './types';

/**
 * Hard lint, banlist, and bracket fixes must precede thematic recommendations.
 * Soft curve polish (`Curve: …`) uses action `fix` but is not blocking.
 */
export function isBlockingPrioritizedAction(action: PrioritizedAction): boolean {
  if (action.action === 'fix') {
    const detail = action.detail.toLowerCase();
    return detail.startsWith('fix format/lint:') || detail.startsWith('bracket 3:');
  }
  if (action.action === 'cut' && action.detail.toLowerCase().includes('banlist')) {
    return true;
  }
  return false;
}

/**
 * Template category deficits / swaps that close `below` slots.
 * Synergy-only cuts and uncategorized package adds are not gap closers.
 */
export function isCategoryGapAction(action: PrioritizedAction): boolean {
  if (action.action !== 'add' && action.action !== 'search' && action.action !== 'swap') {
    return false;
  }
  if (!action.category || action.category === 'synergy') return false;
  return true;
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
  const recommendations = fromRecommendations ?? [];

  const blockingQuality = quality.filter(isBlockingPrioritizedAction);
  const nonBlockingQuality = quality.filter((a) => !isBlockingPrioritizedAction(a));

  const categoryFromRecs = recommendations.filter(isCategoryGapAction);
  const otherFromRecs = recommendations.filter((a) => !isCategoryGapAction(a));
  const categoryFromQuality = nonBlockingQuality.filter(isCategoryGapAction);
  const polishFromQuality = nonBlockingQuality.filter((a) => !isCategoryGapAction(a));

  for (const a of blockingQuality) push(a);
  for (const a of categoryFromRecs) {
    if (merged.length >= maxItems) break;
    push(a);
  }
  for (const a of categoryFromQuality) {
    if (merged.length >= maxItems) break;
    push(a);
  }
  for (const a of otherFromRecs) {
    if (merged.length >= maxItems) break;
    push(a);
  }
  for (const a of polishFromQuality) {
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
