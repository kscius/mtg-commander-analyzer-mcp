import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluateCardSwapResult } from '../core/cardSwapEvaluator';

const evaluateCardSwap = vi.fn<() => Promise<EvaluateCardSwapResult>>();

vi.mock('../core/cardSwapEvaluator', () => ({
  evaluateCardSwap: () => evaluateCardSwap(),
}));

import { runEvaluateCardSwap } from './evaluateCardSwapTool';

function mockSwapResult(
  overrides: Partial<EvaluateCardSwapResult> = {}
): EvaluateCardSwapResult {
  return {
    recommendation: overrides.recommendation ?? 'proceed',
    reason: overrides.reason ?? 'Improves synergy.',
    resolvedCards: overrides.resolvedCards ?? {
      removed: 'Divination',
      added: 'Phyrexian Arena',
    },
    synergyScoreBefore: overrides.synergyScoreBefore,
    synergyScoreAfter: overrides.synergyScoreAfter,
    synergyScoreDelta: overrides.synergyScoreDelta,
    categoryDeltas: overrides.categoryDeltas ?? [],
  };
}

describe('runEvaluateCardSwap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('steers agents to apply_deck_changes after a proceed recommendation', async () => {
    evaluateCardSwap.mockResolvedValue(mockSwapResult({ synergyScoreDelta: 6 }));

    const result = await runEvaluateCardSwap({
      deckText: '1 Divination\n1 Sol Ring',
      commanderName: 'Shadrix Silverquill',
      cardToRemove: 'Divination',
      cardToAdd: 'Phyrexian Arena',
    });

    expect(result.summary).toContain('Proceed: Divination → Phyrexian Arena');
    expect(result.nextSuggestedAction).toBe(
      'Use apply_deck_changes with swaps: [{ remove: "Divination", add: "Phyrexian Arena" }], then analyze_deck.'
    );
  });

  it('steers agents to search when recommendation is skip', async () => {
    evaluateCardSwap.mockResolvedValue(
      mockSwapResult({
        recommendation: 'skip',
        reason: 'Low thematic fit.',
      })
    );

    const result = await runEvaluateCardSwap({
      deckText: '1 Sol Ring',
      commanderName: 'Shadrix Silverquill',
      cardToRemove: 'Sol Ring',
      cardToAdd: 'Dark Ritual',
    });

    expect(result.summary).toContain('Skip:');
    expect(result.nextSuggestedAction).toBe(
      'Try another swap from analysis.prioritizedActions or search_cards.'
    );
  });
});
