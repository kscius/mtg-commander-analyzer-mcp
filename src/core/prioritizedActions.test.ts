import { describe, expect, it } from 'vitest';
import {
  isBlockingPrioritizedAction,
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

describe('isBlockingPrioritizedAction', () => {
  it('treats fix actions and banlist cuts as blocking', () => {
    expect(
      isBlockingPrioritizedAction(
        action({ action: 'fix', detail: 'Fix format/lint: deck has 98 cards' })
      )
    ).toBe(true);
    expect(
      isBlockingPrioritizedAction(
        action({ action: 'fix', detail: 'Bracket 3: too many game changers' })
      )
    ).toBe(true);
    expect(
      isBlockingPrioritizedAction(
        action({ action: 'cut', detail: 'Remove all banlisted cards.' })
      )
    ).toBe(true);
    expect(
      isBlockingPrioritizedAction(
        action({ action: 'cut', category: 'synergy', detail: 'Low thematic fit' })
      )
    ).toBe(false);
    expect(
      isBlockingPrioritizedAction(
        action({ action: 'add', category: 'card_draw', detail: 'Add draw' })
      )
    ).toBe(false);
  });
});

describe('mergePrioritizedActions', () => {
  it('places blocking quality actions before recommendations and renumbers priority', () => {
    const fromRecommendations = [
      action({ action: 'cut', category: 'synergy', detail: 'Low thematic fit for tokens' }),
      action({ action: 'add', category: 'card_draw', detail: 'Add repeatable draw' }),
    ];
    const fromQuality = [
      action({ action: 'fix', detail: 'Fix format/lint: deck has 98 cards' }),
      action({ action: 'cut', detail: 'Remove all banlisted cards.' }),
      action({ action: 'search', category: 'card_draw', detail: 'Add 2 card(s) to card_draw' }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality);

    expect(merged).toHaveLength(5);
    expect(merged[0].detail).toBe('Fix format/lint: deck has 98 cards');
    expect(merged[0].priority).toBe(1);
    expect(merged[1].detail).toBe('Remove all banlisted cards.');
    expect(merged[1].priority).toBe(2);
    expect(merged[2].detail).toBe('Low thematic fit for tokens');
    expect(merged[3].detail).toBe('Add repeatable draw');
    expect(merged[4].detail).toBe('Add 2 card(s) to card_draw');
    expect(merged[4].priority).toBe(5);
  });

  it('reserves blocking slots when recommendations fill maxItems', () => {
    const fromRecommendations = Array.from({ length: 8 }, (_, i) =>
      action({ action: 'cut', category: 'synergy', detail: `off-theme-${i}` })
    );
    const fromQuality = [
      action({ action: 'fix', detail: 'Fix format/lint: singleton violation' }),
      action({ action: 'search', category: 'ramp', detail: 'Add ramp cards' }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality, 8);

    expect(merged).toHaveLength(8);
    expect(merged[0].detail).toBe('Fix format/lint: singleton violation');
    expect(merged[1].detail).toBe('off-theme-0');
    expect(merged.some((a) => a.detail === 'Add ramp cards')).toBe(false);
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

  it('honors maxItems after merging blocking, recommendations, and quality actions', () => {
    const fromRecommendations = [
      action({ action: 'add', detail: 'rec-1' }),
      action({ action: 'add', detail: 'rec-2' }),
      action({ action: 'add', detail: 'rec-3' }),
    ];
    const fromQuality = [
      action({ action: 'fix', detail: 'Fix format/lint: hard issue' }),
      action({ action: 'cut', detail: 'quality-1' }),
      action({ action: 'cut', detail: 'quality-2' }),
    ];

    const merged = mergePrioritizedActions(fromRecommendations, fromQuality, 4);

    expect(merged).toHaveLength(4);
    expect(merged.map((a) => a.detail)).toEqual([
      'Fix format/lint: hard issue',
      'rec-1',
      'rec-2',
      'rec-3',
    ]);
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
