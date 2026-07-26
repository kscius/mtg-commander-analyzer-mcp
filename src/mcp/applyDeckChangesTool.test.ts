import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplyDeckSwapsResult } from '../core/deckMutations';

const applyDeckSwaps = vi.fn<(...args: unknown[]) => ApplyDeckSwapsResult>();

vi.mock('../core/deckMutations', () => ({
  applyDeckSwaps: (...args: unknown[]) => applyDeckSwaps(...args),
}));

import { runApplyDeckChanges } from './applyDeckChangesTool';

function mockApplyResult(
  overrides: Partial<ApplyDeckSwapsResult> = {}
): ApplyDeckSwapsResult {
  return {
    decklistText: overrides.decklistText ?? '1 Sol Ring\n1 Arcane Signet',
    totalCards: overrides.totalCards ?? 99,
    applied: overrides.applied ?? [{ remove: 'Divination', add: 'Phyrexian Arena' }],
    skipped: overrides.skipped ?? [],
    errors: overrides.errors ?? [],
  };
}

describe('runApplyDeckChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns analyze_deck next step after a clean apply', async () => {
    applyDeckSwaps.mockReturnValue(mockApplyResult({ totalCards: 99 }));

    const result = await runApplyDeckChanges({
      deckText: '1 Divination\n1 Sol Ring',
      swaps: [{ remove: 'Divination', add: 'Phyrexian Arena' }],
      commanderName: 'Shadrix Silverquill',
    });

    expect(applyDeckSwaps).toHaveBeenCalledWith(
      '1 Divination\n1 Sol Ring',
      [{ remove: 'Divination', add: 'Phyrexian Arena' }],
      { commanderName: 'Shadrix Silverquill' }
    );
    expect(result.summary).toBe('Applied 1 swap(s); mainboard 99 cards.');
    expect(result.nextSuggestedAction).toBe(
      'Run analyze_deck on decklistText to verify qualityGate before delivery.'
    );
  });

  it('steers agents to fix errors before analyze when apply reports errors', async () => {
    applyDeckSwaps.mockReturnValue(
      mockApplyResult({
        applied: [],
        errors: ['Deck would have 98 cards after swaps (expected 99).'],
        totalCards: 98,
      })
    );

    const result = await runApplyDeckChanges({
      deckText: '1 Sol Ring',
      swaps: [{ remove: 'Sol Ring', add: 'Arcane Signet' }],
    });

    expect(result.summary).toMatch(/Applied 0 swap\(s\); Deck would have 98 cards/);
    expect(result.nextSuggestedAction).toBe(
      'Fix skipped swaps or errors, then analyze_deck with the updated decklistText.'
    );
  });

  it('steers agents to fix skipped swaps even when errors are empty', async () => {
    applyDeckSwaps.mockReturnValue(
      mockApplyResult({
        applied: [],
        skipped: [
          {
            remove: 'Sol Ring',
            add: 'Mana Crypt',
            reason: 'Mana Crypt is on the banlist',
          },
        ],
        errors: [],
        totalCards: 99,
      })
    );

    const result = await runApplyDeckChanges({
      deckText: '1 Sol Ring',
      swaps: [{ remove: 'Sol Ring', add: 'Mana Crypt' }],
    });

    expect(result.summary).toBe('Applied 0 swap(s); mainboard 99 cards.');
    expect(result.skipped).toHaveLength(1);
    expect(result.nextSuggestedAction).toBe(
      'Fix skipped swaps or errors, then analyze_deck with the updated decklistText.'
    );
  });
});
