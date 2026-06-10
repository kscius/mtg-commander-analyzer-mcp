import { describe, expect, it } from 'vitest';
import {
  mergePrioritizedActions,
  recommendationsToPrioritized,
} from './prioritizedActions';
import type { DeckRecommendations, PrioritizedAction } from './types';

const action = (
  partial: Partial<PrioritizedAction> & Pick<PrioritizedAction, 'action' | 'detail'>
): PrioritizedAction => ({
  priority: partial.priority ?? 1,
  action: partial.action,
  detail: partial.detail,
  category: partial.category,
  suggestedCard: partial.suggestedCard,
  suggestedSearch: partial.suggestedSearch,
});

describe('mergePrioritizedActions', () => {
  it('places recommendation actions before quality actions and renumbers priority', () => {
    const fromRecommendations = [
      action({ action: 'add', category: 'card_draw', detail: 'Add repeatable draw' }),
    ];
    const fromQuality = [
      action({ action: 'fix', detail: 'Remove banned card Mana Crypt' }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality);

    expect(merged).toHaveLength(2);
    expect(merged[0].detail).toBe('Add repeatable draw');
    expect(merged[0].priority).toBe(1);
    expect(merged[1].detail).toBe('Remove banned card Mana Crypt');
    expect(merged[1].priority).toBe(2);
  });

  it('deduplicates actions with the same action/category/card/detail prefix', () => {
    const duplicateDetail =
      'Category card_draw below minimum (6/8). Add repeatable draw at MV ≤3.';
    const fromRecommendations = [
      action({ action: 'add', category: 'card_draw', detail: duplicateDetail }),
    ];
    const fromQuality = [
      action({ action: 'add', category: 'card_draw', detail: duplicateDetail }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality);

    expect(merged).toHaveLength(1);
  });

  it('collapses quality actions that share the dedup key prefix with recommendations', () => {
    const sharedPrefix = 'A'.repeat(40);
    const fromRecommendations = [
      action({ action: 'add', category: 'ramp', detail: `${sharedPrefix}-first` }),
    ];
    const fromQuality = [
      action({ action: 'add', category: 'ramp', detail: `${sharedPrefix}-second` }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality);

    expect(merged).toHaveLength(1);
    expect(merged[0].detail).toBe(`${sharedPrefix}-first`);
  });

  it('keeps distinct actions when category differs despite shared detail prefix', () => {
    const sharedPrefix = 'Category below minimum (6/8). Add draw';
    const fromRecommendations = [
      action({ action: 'add', category: 'card_draw', detail: sharedPrefix }),
    ];
    const fromQuality = [
      action({ action: 'add', category: 'ramp', detail: sharedPrefix }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality);

    expect(merged).toHaveLength(2);
  });

  it('honors maxItems after merging recommendations and quality actions', () => {
    const fromRecommendations = [
      action({ action: 'add', detail: 'rec-1' }),
      action({ action: 'add', detail: 'rec-2' }),
      action({ action: 'add', detail: 'rec-3' }),
    ];
    const fromQuality = [
      action({ action: 'cut', detail: 'quality-1' }),
      action({ action: 'cut', detail: 'quality-2' }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality, 4);

    expect(merged).toHaveLength(4);
    expect(merged.map((a) => a.detail)).toEqual(['rec-1', 'rec-2', 'rec-3', 'quality-1']);
  });
});

describe('recommendationsToPrioritized', () => {
  it('returns prioritizedActions from recommendations when present', () => {
    const prioritized = [
      action({ action: 'add', category: 'ramp', detail: 'Add mana rock' }),
    ];
    const rec: DeckRecommendations = {
      cuts: [],
      adds: [],
      swaps: [],
      prioritizedActions: prioritized,
    };

    expect(recommendationsToPrioritized(rec)).toEqual(prioritized);
  });

  it('returns empty array when recommendations are undefined', () => {
    expect(recommendationsToPrioritized(undefined)).toEqual([]);
  });
});
