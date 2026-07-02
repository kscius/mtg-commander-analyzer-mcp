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
    if (name === 'Shadrix Silverquill') {
      return { name, color_identity: ['W', 'B'] };
    }
    return null;
  }),
}));

import { runSearchCards } from './searchCardsTool';

function mockHit(overrides: Partial<DatabaseCard> & { name: string }): DatabaseCard {
  return {
    oracle_id: overrides.oracle_id ?? overrides.name.toLowerCase().replace(/\s/g, '-'),
    name: overrides.name,
    type_line: overrides.type_line ?? 'Instant',
    cmc: overrides.cmc ?? 2,
    mana_cost: overrides.mana_cost ?? '{1}{U}',
    oracle_text: overrides.oracle_text ?? 'Draw a card.',
    color_identity: overrides.color_identity ?? ['U'],
    tags: overrides.tags,
    edhrec_rank: overrides.edhrec_rank ?? null,
    legalities: overrides.legalities ?? { commander: 'legal' },
  };
}

describe('runSearchCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDatabaseReady.mockReturnValue(true);
    searchCardsFiltered.mockReturnValue([]);
  });

  it('rejects empty input at the Zod schema before tool guard rails run', async () => {
    await expect(runSearchCards({})).rejects.toThrow(/At least one of query, category, type/);
  });

  it('returns warning when database is unavailable but a schema-valid filter is present', async () => {
    isDatabaseReady.mockReturnValue(false);

    const result = await runSearchCards({ category: 'ramp' });

    expect(result.databaseReady).toBe(false);
    expect(result.warning).toMatch(/Card database is not available/);
    expect(result.error).toBeUndefined();
  });

  it('returns agent-facing summary when no cards match filters', async () => {
    searchCardsFiltered.mockReturnValue([]);

    const result = await runSearchCards({ category: 'ramp', colorIdentity: ['G'] });

    expect(result.count).toBe(0);
    expect(result.summary).toMatch(/No cards matched/);
    expect(result.nextSuggestedAction).toMatch(/Broaden search_cards/);
  });

  it('returns agent-facing next step when cards are found', async () => {
    searchCardsFiltered.mockReturnValue([mockHit({ name: 'Cultivate', tags: ['ramp'], cmc: 3 })]);

    const result = await runSearchCards({ category: 'ramp', colorIdentity: ['G'] });

    expect(result.count).toBe(1);
    expect(result.summary).toMatch(/Found 1 card/);
    expect(result.nextSuggestedAction).toMatch(/evaluate_card_swap/);
  });

  it('infers colorIdentity from commanderName when colors are omitted', async () => {
    searchCardsFiltered.mockReturnValue([mockHit({ name: 'Swords to Plowshares' })]);

    await runSearchCards({
      commanderName: 'Shadrix Silverquill',
      category: 'spot_removal',
    });

    expect(searchCardsFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        colorIdentity: ['W', 'B'],
      })
    );
  });

  it('excludes card names from excludeNames (case-insensitive)', async () => {
    searchCardsFiltered.mockReturnValue([
      mockHit({ name: 'Sol Ring', tags: ['ramp'], cmc: 1 }),
      mockHit({ name: 'Arcane Signet', tags: ['ramp'], cmc: 2 }),
    ]);

    const result = await runSearchCards({
      category: 'ramp',
      excludeNames: ['sol ring'],
    });

    expect(result.cards.map((c) => c.name)).toEqual(['Arcane Signet']);
  });

  it('filters by category tag with underscore normalization', async () => {
    searchCardsFiltered.mockReturnValue([
      mockHit({ name: 'Rhystic Study', tags: ['card_draw'], cmc: 3 }),
      mockHit({ name: 'Lightning Bolt', tags: ['spot_removal'], cmc: 1 }),
    ]);

    const result = await runSearchCards({
      category: 'card_draw',
      colorIdentity: ['U'],
    });

    expect(result.cards.map((c) => c.name)).toEqual(['Rhystic Study']);
  });

  it('sorts results by mana value when sortBy is mv', async () => {
    searchCardsFiltered.mockReturnValue([
      mockHit({ name: 'High CMC', cmc: 5, tags: ['ramp'] }),
      mockHit({ name: 'Low CMC', cmc: 1, tags: ['ramp'] }),
    ]);

    const result = await runSearchCards({
      category: 'ramp',
      colorIdentity: ['G'],
      sortBy: 'mv',
    });

    expect(result.cards.map((c) => c.name)).toEqual(['Low CMC', 'High CMC']);
  });
});
