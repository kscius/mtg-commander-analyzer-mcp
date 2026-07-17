import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeDeckResult, CategorySummary, DeckAnalysis } from './types';

const analyzeDeckBasic = vi.fn<() => Promise<AnalyzeDeckResult>>();

vi.mock('./analyzer', () => ({
  analyzeDeckBasic: (...args: unknown[]) => analyzeDeckBasic(...args),
}));

vi.mock('./scryfall', () => ({
  getCardByName: vi.fn((name: string) =>
    name ? { name, color_identity: ['W', 'U', 'B', 'G'] } : null
  ),
}));

vi.mock('./cardResolution', () => ({
  resolveCardNameSync: vi.fn((name: string) =>
    name.trim() ? { canonicalName: name.trim() } : null
  ),
}));

import { evaluateCardSwap } from './cardSwapEvaluator';

const category = (
  name: string,
  count: number,
  status: CategorySummary['status']
): CategorySummary => ({
  name,
  count,
  status,
});

const deckAnalysis = (overrides: Partial<DeckAnalysis> = {}): DeckAnalysis => ({
  commanderName: "Atraxa, Praetors' Voice",
  totalCards: 99,
  uniqueCards: 99,
  categories: [
    category('card_draw', 8, 'within'),
    category('ramp', 10, 'within'),
  ],
  notes: [],
  bracketWarnings: [],
  bannedCards: [],
  banlistValid: true,
  synergyScore: 60,
  ...overrides,
});

const analyzeResult = (analysis: DeckAnalysis): AnalyzeDeckResult =>
  ({
    input: { templateId: 'bracket3', bracketId: 'bracket3' },
    analysis,
    parsedDeck: { commanderName: "Atraxa, Praetors' Voice", cards: [] },
  }) as AnalyzeDeckResult;

const baseInput = {
  deckText: "Commander: Atraxa, Praetors' Voice\n1 Sol Ring",
  commanderName: "Atraxa, Praetors' Voice",
  cardToRemove: 'Sol Ring',
  cardToAdd: 'Arcane Signet',
  preferredStrategy: 'counters',
};

describe('evaluateCardSwap', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    analyzeDeckBasic.mockReset();

    const scryfall = await import('./scryfall');
    vi.mocked(scryfall.getCardByName).mockImplementation((name: string) =>
      name ? { name, color_identity: ['W', 'U', 'B', 'G'] } : null
    );

    const cardResolution = await import('./cardResolution');
    vi.mocked(cardResolution.resolveCardNameSync).mockImplementation((name: string) =>
      name.trim() ? { canonicalName: name.trim() } : null
    );
  });

  const mockAnalyzePair = (before: DeckAnalysis, after: DeckAnalysis) => {
    analyzeDeckBasic
      .mockResolvedValueOnce(analyzeResult(before))
      .mockResolvedValueOnce(analyzeResult(after));
  };

  it('skips when remove card is absent from the decklist even if it exists in the database', async () => {
    mockAnalyzePair(deckAnalysis(), deckAnalysis());

    const result = await evaluateCardSwap({
      ...baseInput,
      deckText: "Commander: Atraxa, Praetors' Voice\n1 Island",
      cardToRemove: 'Sol Ring',
    });

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Card to remove was not found in the decklist');
    expect(result.removedCardFound).toBe(false);
  });

  it('skips when add card is not found in the card database', async () => {
    const scryfall = await import('./scryfall');
    vi.mocked(scryfall.getCardByName).mockReturnValue(null);
    const cardResolution = await import('./cardResolution');
    vi.mocked(cardResolution.resolveCardNameSync).mockImplementation((name) =>
      name === 'Arcane Signet' ? null : { canonicalName: name.trim() }
    );
    mockAnalyzePair(deckAnalysis(), deckAnalysis());

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Card to add was not found');
  });

  it('skips when swap introduces new Bracket warnings', async () => {
    const before = deckAnalysis({ bracketWarnings: [] });
    const after = deckAnalysis({ bracketWarnings: ['Too many game changers (4/3)'] });
    mockAnalyzePair(before, after);

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Swap introduces new Bracket warnings');
    expect(result.newWarnings).toEqual(['Too many game changers (4/3)']);
  });

  it('skips when categories worsen with no improvements', async () => {
    const before = deckAnalysis({
      categories: [category('card_draw', 8, 'within'), category('ramp', 10, 'within')],
    });
    const after = deckAnalysis({
      categories: [category('card_draw', 7, 'below'), category('ramp', 10, 'within')],
      synergyScore: 60,
    });
    mockAnalyzePair(before, after);

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Categories worsen');
    expect(result.reason).toContain('card_draw');
  });

  it('skips when synergy score drops by more than 5 points', async () => {
    mockAnalyzePair(deckAnalysis({ synergyScore: 65 }), deckAnalysis({ synergyScore: 58 }));

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Synergy score drops by 7 points');
    expect(result.synergyScoreDelta).toBe(-7);
  });

  it('proceeds when a below-minimum category moves within range', async () => {
    mockAnalyzePair(
      deckAnalysis({
        categories: [category('card_draw', 7, 'below'), category('ramp', 10, 'within')],
        synergyScore: 60,
      }),
      deckAnalysis({
        categories: [category('card_draw', 8, 'within'), category('ramp', 10, 'within')],
        synergyScore: 60,
      })
    );

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('proceed');
    expect(result.reason).toContain('Improves: card_draw');
    expect(result.categoryDeltas).toEqual([
      expect.objectContaining({
        name: 'card_draw',
        statusBefore: 'below',
        statusAfter: 'within',
      }),
    ]);
  });

  it('proceeds when synergy improves by at least 2 points without category changes', async () => {
    mockAnalyzePair(deckAnalysis({ synergyScore: 58 }), deckAnalysis({ synergyScore: 61 }));

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('proceed');
    expect(result.reason).toContain('Synergy +3');
    expect(result.synergyScoreDelta).toBe(3);
  });

  it('skips swaps with minimal category and synergy impact', async () => {
    const analysis = deckAnalysis({ synergyScore: 60 });
    mockAnalyzePair(analysis, { ...analysis, synergyScore: 61 });

    const result = await evaluateCardSwap(baseInput);

    expect(result.recommendation).toBe('skip');
    expect(result.reason).toContain('Minimal impact');
    expect(result.categoryDeltas).toHaveLength(0);
  });

  it('does not append the add card when the remove line is missing from deck text', async () => {
    mockAnalyzePair(deckAnalysis({ synergyScore: 60 }), deckAnalysis({ synergyScore: 64 }));

    const result = await evaluateCardSwap({
      ...baseInput,
      deckText: "Commander: Atraxa, Praetors' Voice\n1 Island",
      cardToRemove: 'Missing Card',
    });

    expect(result.recommendation).toBe('skip');
    expect(result.removedCardFound).toBe(false);

    const secondCall = analyzeDeckBasic.mock.calls[1]?.[0] as { deckText: string };
    expect(secondCall.deckText).not.toContain('1 Arcane Signet');
    expect(secondCall.deckText).toContain('1 Island');
  });
});
