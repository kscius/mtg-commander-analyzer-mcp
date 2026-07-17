import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchCardsFiltered = vi.fn();
const isDatabaseReady = vi.fn(() => true);
const getCardByName = vi.fn();

vi.mock('../core/cardDatabase', () => ({
  searchCardsFiltered: (...args: unknown[]) => searchCardsFiltered(...args),
  isDatabaseReady: () => isDatabaseReady(),
}));

vi.mock('../core/scryfall', () => ({
  getCardByName: (...args: unknown[]) => getCardByName(...args),
}));

vi.mock('../core/synergyScorer', () => ({
  scoreCardSynergyRelevance: () => ({ sortScore: 0.5 }),
}));

import { runGetCategoryCandidates } from './getCategoryCandidatesTool';

describe('runGetCategoryCandidates lands path', () => {
  beforeEach(() => {
    searchCardsFiltered.mockReset();
    isDatabaseReady.mockReturnValue(true);
    getCardByName.mockReturnValue({
      name: 'Atraxa, Praetors\' Voice',
      color_identity: ['W', 'U', 'B', 'G'],
    });
  });

  it('searches by Land type and returns land candidates for category lands', async () => {
    searchCardsFiltered.mockReturnValue([
      {
        name: 'Command Tower',
        type_line: 'Land',
        cmc: 0,
        edhrec_rank: 1,
        oracle_id: 'tower',
        tags: [],
      },
      {
        name: 'Sol Ring',
        type_line: 'Artifact',
        cmc: 1,
        edhrec_rank: 2,
        oracle_id: 'sol',
        tags: ['ramp'],
      },
    ]);

    const result = await runGetCategoryCandidates({
      commanderName: "Atraxa, Praetors' Voice",
      category: 'lands',
      limit: 5,
    });

    expect(searchCardsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        category: undefined,
        type: 'Land',
        commanderLegal: true,
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]?.name).toBe('Command Tower');
    expect(result.candidates[0]?.primaryCategory).toBe('lands');
  });

  it('still excludes lands for non-land categories', async () => {
    searchCardsFiltered.mockReturnValue([
      {
        name: 'War Room',
        type_line: 'Land',
        cmc: 0,
        edhrec_rank: 10,
        oracle_id: 'war',
        tags: ['card_draw'],
      },
      {
        name: 'Rhystic Study',
        type_line: 'Enchantment',
        cmc: 3,
        edhrec_rank: 5,
        oracle_id: 'study',
        tags: ['card_draw'],
      },
    ]);

    const result = await runGetCategoryCandidates({
      commanderName: "Atraxa, Praetors' Voice",
      category: 'card_draw',
      limit: 5,
    });

    expect(searchCardsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'card_draw',
        type: undefined,
      })
    );
    expect(result.candidates.map((c) => c.name)).toEqual(['Rhystic Study']);
  });
});
