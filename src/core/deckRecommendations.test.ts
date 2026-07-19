/**
 * Unit tests for buildDeckRecommendations — locks agent-facing cut/add/swap/search contracts.
 * Mocks synergy scoring, EDHREC theme scores, strategy profiles, and card lookup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyzeDeckInput,
  CategorySummary,
  EdhrecCardSuggestion,
  ParsedCardEntry,
} from './types';

const getCardByName = vi.fn();
const scoreDeckSynergy = vi.fn();
const scoreCardForStrategy = vi.fn();
const scoreEdhrecSuggestionForTheme = vi.fn();
const getStrategyProfile = vi.fn();

vi.mock('./scryfall', () => ({
  getCardByName: (...args: unknown[]) => getCardByName(...args),
}));

vi.mock('./synergyScorer', () => ({
  scoreDeckSynergy: (...args: unknown[]) => scoreDeckSynergy(...args),
  scoreCardForStrategy: (...args: unknown[]) => scoreCardForStrategy(...args),
}));

vi.mock('./edhrecStrategyScoring', () => ({
  scoreEdhrecSuggestionForTheme: (...args: unknown[]) =>
    scoreEdhrecSuggestionForTheme(...args),
}));

vi.mock('./strategyProfiles', () => ({
  getStrategyProfile: (...args: unknown[]) => getStrategyProfile(...args),
}));

import { buildDeckRecommendations, getCardRoleTags } from './deckRecommendations';

const entry = (name: string): ParsedCardEntry => ({ name, quantity: 1 });

const cat = (
  name: string,
  count: number,
  status: CategorySummary['status'],
  min?: number,
  max?: number
): CategorySummary => ({
  name,
  count,
  status,
  min,
  max,
});

const input = (overrides: Partial<AnalyzeDeckInput> = {}): AnalyzeDeckInput => ({
  deckText: '1 Sol Ring',
  preferredStrategy: 'tokens',
  commanderName: 'Rhys the Redeemed',
  ...overrides,
});

const scry = (
  name: string,
  opts: { type_line?: string; tags?: string[] } = {}
) => ({
  name,
  type_line: opts.type_line ?? 'Creature',
  oracle_text: '',
  mana_cost: '{1}{G}',
  cmc: 2,
  tags: opts.tags,
});

const pool = (...names: string[]): EdhrecCardSuggestion[] =>
  names.map((name, i) => ({ name, synergyScore: 0.5, rank: i + 1 }));

describe('buildDeckRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scoreDeckSynergy.mockReturnValue({ synergyScore: 70, offThemeCards: [] });
    scoreCardForStrategy.mockReturnValue(10);
    scoreEdhrecSuggestionForTheme.mockReturnValue(5);
    getStrategyProfile.mockReturnValue(undefined);
    getCardByName.mockImplementation((name: string) =>
      name ? scry(name, { tags: ['ramp'] }) : null
    );
  });

  it('returns empty recommendations when categories are within and no off-theme cards', () => {
    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('ramp', 10, 'within', 9, 12), cat('card_draw', 8, 'within', 8, 11)],
      input()
    );

    expect(result.cuts).toEqual([]);
    expect(result.adds).toEqual([]);
    expect(result.swaps).toEqual([]);
    expect(result.synergyPackages).toEqual([]);
    expect(result.prioritizedActions).toEqual([]);
  });

  it('caps off-theme cuts at 5 and emits prioritized cut actions', () => {
    scoreDeckSynergy.mockReturnValue({
      synergyScore: 40,
      offThemeCards: [
        'Off1',
        'Off2',
        'Off3',
        'Off4',
        'Off5',
        'Off6',
        'Off7',
      ],
    });

    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('ramp', 10, 'within', 9, 12)],
      input({ preferredStrategy: 'tokens' })
    );

    expect(result.cuts).toHaveLength(5);
    expect(result.cuts.map((c) => c.name)).toEqual([
      'Off1',
      'Off2',
      'Off3',
      'Off4',
      'Off5',
    ]);
    expect(result.cuts.every((c) => c.category === 'synergy')).toBe(true);
    expect(result.cuts[0].reason).toContain('tokens');
    expect(result.prioritizedActions).toHaveLength(5);
    expect(result.prioritizedActions.every((a) => a.action === 'cut')).toBe(true);
    expect(result.prioritizedActions[0].suggestedCard).toBe('Off1');
    expect(result.prioritizedActions[0].priority).toBe(1);
  });

  it('emits search placeholder and suggestedSearch when category is below and pool is empty', () => {
    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('card_draw', 6, 'below', 8, 11)],
      input({ preferredStrategy: 'tokens' }),
      []
    );

    expect(result.adds).toHaveLength(1);
    expect(result.adds[0]).toMatchObject({
      name: '(use search_cards)',
      category: 'card_draw',
    });
    expect(result.adds[0].reason).toContain('6/8');
    expect(result.prioritizedActions).toHaveLength(1);
    expect(result.prioritizedActions[0]).toMatchObject({
      action: 'search',
      category: 'card_draw',
      suggestedSearch: { category: 'card_draw', preferredStrategy: 'tokens' },
    });
    expect(result.prioritizedActions[0].detail).toContain('Need 2 more');
    expect(result.swaps).toEqual([]);
  });

  it('emits named add when EDHREC pool has an on-theme non-land candidate and no prior cut', () => {
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Phyrexian Arena') {
        return scry(name, { tags: ['card_draw'] });
      }
      return scry(name, { tags: ['ramp'] });
    });

    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('card_draw', 6, 'below', 8, 11)],
      input({ preferredStrategy: 'tokens' }),
      pool('Phyrexian Arena')
    );

    expect(result.adds).toHaveLength(1);
    expect(result.adds[0].name).toBe('Phyrexian Arena');
    expect(result.adds[0].category).toBe('card_draw');
    expect(result.swaps).toEqual([]);
    expect(result.prioritizedActions[0]).toMatchObject({
      action: 'add',
      category: 'card_draw',
      suggestedCard: 'Phyrexian Arena',
      suggestedSearch: { category: 'card_draw', preferredStrategy: 'tokens' },
    });
  });

  it('prefers swap when an off-theme cut exists and an add candidate is available', () => {
    scoreDeckSynergy.mockReturnValue({
      synergyScore: 45,
      offThemeCards: ['Divination'],
    });
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Impact Tremors') {
        return scry(name, { tags: ['win_conditions'] });
      }
      return scry(name, { tags: ['ramp'] });
    });

    const result = buildDeckRecommendations(
      [entry('Divination'), entry('Sol Ring')],
      [cat('win_conditions', 0, 'below', 2, 4)],
      input({ preferredStrategy: 'tokens' }),
      pool('Impact Tremors')
    );

    expect(result.swaps).toHaveLength(1);
    expect(result.swaps![0]).toMatchObject({
      cut: 'Divination',
      add: 'Impact Tremors',
      category: 'win_conditions',
      impact: 'medium',
    });
    expect(result.adds).toEqual([]);
    expect(result.prioritizedActions.some((a) => a.action === 'swap')).toBe(true);
    expect(result.prioritizedActions.find((a) => a.action === 'swap')?.suggestedCard).toBe(
      'Impact Tremors'
    );
  });

  it('marks swap impact high when category deficit is at least 3', () => {
    scoreDeckSynergy.mockReturnValue({
      synergyScore: 40,
      offThemeCards: ['Filler'],
    });
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Rhystic Study') {
        return scry(name, { tags: ['card_draw'] });
      }
      return scry(name, { tags: ['ramp'] });
    });

    const result = buildDeckRecommendations(
      [entry('Filler')],
      [cat('card_draw', 4, 'below', 8, 11)],
      input(),
      pool('Rhystic Study')
    );

    expect(result.swaps![0].impact).toBe('high');
  });

  it('skips EDHREC lands, wrong-category cards, and cards already in the deck', () => {
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Command Tower') {
        return scry(name, { type_line: 'Land', tags: ['lands'] });
      }
      if (name === 'Swords to Plowshares') {
        return scry(name, { tags: ['spot_removal'] });
      }
      if (name === 'Sol Ring') {
        return scry(name, { tags: ['ramp'] });
      }
      if (name === 'Beast Whisperer') {
        return scry(name, { tags: ['card_draw'] });
      }
      return null;
    });

    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('card_draw', 6, 'below', 8, 11)],
      input(),
      pool('Command Tower', 'Swords to Plowshares', 'Sol Ring', 'Beast Whisperer')
    );

    expect(result.adds).toHaveLength(1);
    expect(result.adds[0].name).toBe('Beast Whisperer');
  });

  it('processes below categories by largest deficit first', () => {
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Arcane Signet') return scry(name, { tags: ['ramp'] });
      if (name === 'Phyrexian Arena') return scry(name, { tags: ['card_draw'] });
      return scry(name, { tags: ['ramp'] });
    });

    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [
        cat('card_draw', 7, 'below', 8, 11), // deficit 1
        cat('ramp', 5, 'below', 9, 12), // deficit 4
      ],
      input(),
      pool('Arcane Signet', 'Phyrexian Arena')
    );

    expect(result.adds.map((a) => a.category)).toEqual(['ramp', 'card_draw']);
    expect(result.prioritizedActions[0].category).toBe('ramp');
    expect(result.prioritizedActions[0].suggestedCard).toBe('Arcane Signet');
    expect(result.prioritizedActions[1].category).toBe('card_draw');
  });

  it('cuts non-land cards whose primary category is above max', () => {
    getCardByName.mockImplementation((name: string) => {
      if (name === 'Rampant Growth') {
        return scry(name, { tags: ['ramp'] });
      }
      if (name === 'Command Tower') {
        return scry(name, { type_line: 'Land', tags: ['lands'] });
      }
      return null;
    });

    const result = buildDeckRecommendations(
      [entry('Rampant Growth'), entry('Command Tower')],
      [cat('ramp', 14, 'above', 9, 12)],
      input()
    );

    expect(result.cuts).toHaveLength(1);
    expect(result.cuts[0]).toMatchObject({
      name: 'Rampant Growth',
      category: 'ramp',
    });
    expect(result.cuts[0].reason).toContain('above max');
    expect(result.prioritizedActions[0]).toMatchObject({
      action: 'cut',
      category: 'ramp',
      suggestedCard: 'Rampant Growth',
    });
  });

  it('includes synergy packages with missing cards and adds action only when missing ≤ 2', () => {
    getStrategyProfile.mockReturnValue({
      synergyPackages: [
        {
          name: 'Token Doublers',
          cards: ['Anointed Procession', 'Parallel Lives'],
        },
        {
          name: 'Wide Package',
          cards: ['A', 'B', 'C', 'D'],
        },
        {
          name: 'Complete',
          cards: ['Sol Ring'],
        },
      ],
    });

    const result = buildDeckRecommendations(
      [entry('Sol Ring')],
      [cat('ramp', 10, 'within', 9, 12)],
      input({ preferredStrategy: 'tokens' })
    );

    expect(result.synergyPackages).toHaveLength(2);
    expect(result.synergyPackages![0]).toMatchObject({
      name: 'Token Doublers',
      missingCards: ['Anointed Procession', 'Parallel Lives'],
    });
    expect(result.synergyPackages![1].name).toBe('Wide Package');
    expect(result.synergyPackages!.some((p) => p.name === 'Complete')).toBe(false);

    const packageAdds = result.prioritizedActions.filter(
      (a) => a.action === 'add' && a.detail?.includes('Package')
    );
    expect(packageAdds).toHaveLength(1);
    expect(packageAdds[0].detail).toContain('Token Doublers');
    expect(packageAdds[0].suggestedSearch).toEqual({ preferredStrategy: 'tokens' });
  });

  it('enforces output caps on cuts, adds, swaps, and prioritizedActions', () => {
    scoreDeckSynergy.mockReturnValue({
      synergyScore: 20,
      offThemeCards: Array.from({ length: 5 }, (_, i) => `Off${i}`),
    });
    getCardByName.mockImplementation((name: string) => {
      if (name.startsWith('Add')) {
        return scry(name, { tags: ['card_draw'] });
      }
      if (name.startsWith('Over')) {
        return scry(name, { tags: ['ramp'] });
      }
      return scry(name, { tags: ['ramp'] });
    });
    getStrategyProfile.mockReturnValue({
      synergyPackages: [
        { name: 'Pkg1', cards: ['X1', 'Y1'] },
        { name: 'Pkg2', cards: ['X2', 'Y2'] },
        { name: 'Pkg3', cards: ['X3', 'Y3'] },
      ],
    });

    const manyBelow = Array.from({ length: 10 }, (_, i) =>
      cat(`cat_${i}`, 0, 'below' as const, 2, 4)
    );
    // Force pickBestAdd to always miss (wrong tags) so each below emits a search add
    getCardByName.mockImplementation((name: string) => {
      if (name.startsWith('Over')) return scry(name, { tags: ['ramp'] });
      return scry(name, { tags: ['unrelated'] });
    });

    const result = buildDeckRecommendations(
      [
        ...Array.from({ length: 5 }, (_, i) => entry(`Off${i}`)),
        ...Array.from({ length: 8 }, (_, i) => entry(`Over${i}`)),
      ],
      [...manyBelow, cat('ramp', 20, 'above', 9, 12)],
      input(),
      pool(...Array.from({ length: 5 }, (_, i) => `Add${i}`))
    );

    expect(result.cuts.length).toBeLessThanOrEqual(10);
    expect(result.adds.length).toBeLessThanOrEqual(12);
    expect(result.swaps!.length).toBeLessThanOrEqual(8);
    expect(result.prioritizedActions.length).toBeLessThanOrEqual(8);
  });
});

describe('getCardRoleTags', () => {
  it('uses existing tags when present', () => {
    const result = getCardRoleTags({
      name: 'Phyrexian Arena',
      oracle_text: 'At the beginning of your upkeep, you draw a card and you lose 1 life.',
      type_line: 'Enchantment',
      tags: ['card_draw', 'value_engines'],
    });

    expect(result.primary).toBe('card_draw');
    expect(result.allTags).toEqual(['card_draw', 'value_engines']);
    expect(result.secondary).toContain('value_engines');
  });
});
