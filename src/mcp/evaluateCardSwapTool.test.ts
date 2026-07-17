import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/cardSwapEvaluator', () => ({
  evaluateCardSwap: vi.fn(),
}));

import { evaluateCardSwap } from '../core/cardSwapEvaluator';
import { runEvaluateCardSwap } from './evaluateCardSwapTool';

describe('runEvaluateCardSwap', () => {
  beforeEach(() => {
    vi.mocked(evaluateCardSwap).mockReset();
  });

  it('points proceed nextSuggestedAction at apply_deck_changes', async () => {
    vi.mocked(evaluateCardSwap).mockResolvedValue({
      recommendation: 'proceed',
      reason: 'Improves: card_draw',
      synergyScoreDelta: 3,
      categoryDeltas: [],
      newWarnings: [],
      resolvedCards: { removed: 'Divination', added: 'Phyrexian Arena' },
      removedCardFound: true,
      addedCardFound: true,
    });

    const result = await runEvaluateCardSwap({
      deckText: '1 Divination',
      commanderName: 'Test',
      cardToRemove: 'Divination',
      cardToAdd: 'Phyrexian Arena',
    });

    expect(result.summary).toContain('Proceed');
    expect(result.nextSuggestedAction).toContain('apply_deck_changes');
    expect(result.nextSuggestedAction).toContain('analyze_deck');
  });

  it('points skip nextSuggestedAction at get_category_candidates', async () => {
    vi.mocked(evaluateCardSwap).mockResolvedValue({
      recommendation: 'skip',
      reason: 'Card to remove was not found in the decklist.',
      categoryDeltas: [],
      newWarnings: [],
      resolvedCards: { removed: 'Missing', added: 'Phyrexian Arena' },
      removedCardFound: false,
      addedCardFound: true,
    });

    const result = await runEvaluateCardSwap({
      deckText: '1 Island',
      commanderName: 'Test',
      cardToRemove: 'Missing',
      cardToAdd: 'Phyrexian Arena',
    });

    expect(result.summary).toContain('Skip');
    expect(result.nextSuggestedAction).toContain('get_category_candidates');
  });
});
