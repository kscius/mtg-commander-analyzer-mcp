import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseCard } from '../core/cardDatabase';

const isDatabaseReady = vi.fn(() => true);
const searchCardsFiltered = vi.fn<() => DatabaseCard[]>(() => []);

vi.mock('../core/cardDatabase', () => ({
  isDatabaseReady: () => isDatabaseReady(),
  searchCardsFiltered: (...args: unknown[]) => searchCardsFiltered(...args),
}));

vi.mock('../core/scryfall', () => ({
  getCardByName: vi.fn((name: string) => {
    if (name === 'Atraxa, Praetors\' Voice') {
      return { name, color_identity: ['W', 'U', 'B', 'G'] };
    }
    if (name === 'Llanowar Elves') {
      return { name, color_identity: ['G'] };
    }
    return null;
  }),
}));

import { runGetCategoryCandidates } from './getCategoryCandidatesTool';

function mockHit(overrides: Partial<DatabaseCard> & { name: string }): DatabaseCard {
  return {
    oracle_id: overrides.oracle_id ?? overrides.name.toLowerCase().replace(/\s/g, '-'),
    name: overrides.name,
    type_line: overrides.type_line ?? 'Instant',
    cmc: overrides.cmc ?? 2,
    mana_cost: overrides.mana_cost ?? '{1}{G}',
    oracle_text: overrides.oracle_text ?? 'Add {G}.',
    color_identity: overrides.color_identity ?? ['G'],
    tags: overrides.tags,
    edhrec_rank: overrides.edhrec_rank ?? 100,
    legalities: overrides.legalities ?? { commander: 'legal' },
  };
}

describe('runGetCategoryCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDatabaseReady.mockReturnValue(true);
    searchCardsFiltered.mockReturnValue([]);
  });

  it('returns structured error when database is unavailable', async () => {
    isDatabaseReady.mockReturnValue(false);

    const result = await runGetCategoryCandidates({
      commanderName: 'Llanowar Elves',
      category: 'ramp',
    });

    expect(result.databaseReady).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toMatch(/Card database is not available/);
    expect(result.nextSuggestedAction).toMatch(/db:import/);
  });

  it('requires commander in database', async () => {
    const result = await runGetCategoryCandidates({
      commanderName: 'Totally Fake Commander XYZ',
      category: 'ramp',
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toBeDefined();
    expect(result.summary).toMatch(/Unknown commander/);
  });

  it('returns ramp candidates and excludes lands for non-land categories', async () => {
    searchCardsFiltered.mockReturnValue([
      mockHit({
        name: 'Cultivate',
        type_line: 'Sorcery',
        tags: ['ramp'],
        oracle_text: 'Search your library for up to two basic land cards.',
        cmc: 3,
      }),
      mockHit({
        name: 'Command Tower',
        type_line: 'Land',
        tags: [],
        oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
        cmc: 0,
      }),
    ]);

    const result = await runGetCategoryCandidates({
      commanderName: 'Llanowar Elves',
      category: 'ramp',
      limit: 5,
    });

    expect(result.databaseReady).toBe(true);
    expect(searchCardsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'ramp', type: undefined })
    );
    expect(result.candidates.map((c) => c.name)).toEqual(['Cultivate']);
    expect(result.candidates.every((c) => c.primaryCategory === 'ramp')).toBe(true);
  });

  it('returns land candidates for category=lands via type-line path', async () => {
    searchCardsFiltered.mockReturnValue([
      mockHit({
        name: 'Command Tower',
        type_line: 'Land',
        tags: [],
        oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
        cmc: 0,
        edhrec_rank: 10,
      }),
      mockHit({
        name: 'Exotic Orchard',
        type_line: 'Land',
        tags: [],
        oracle_text:
          '{T}: Add one mana of any color that a land an opponent controls could produce.',
        cmc: 0,
        edhrec_rank: 50,
      }),
      mockHit({
        name: 'Sol Ring',
        type_line: 'Artifact',
        tags: ['ramp', 'fast_mana'],
        oracle_text: '{T}: Add {C}{C}.',
        cmc: 1,
      }),
    ]);

    const result = await runGetCategoryCandidates({
      commanderName: "Atraxa, Praetors' Voice",
      category: 'lands',
      limit: 5,
    });

    expect(searchCardsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined, type: 'Land' })
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.primaryCategory === 'lands')).toBe(true);
    expect(result.candidates.every((c) => /land/i.test(c.type))).toBe(true);
    expect(result.candidates.map((c) => c.name)).not.toContain('Sol Ring');
    expect(result.summary).toMatch(/candidate\(s\) for lands/);
  });
});
