import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeckFromCommander } from './deckBuilder';
import { describeDb, itDb } from '../../test/helpers/db';

vi.mock('./edhrec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./edhrec')>();
  return {
    ...actual,
    getFullCommanderProfile: vi.fn(),
    getLandsForColorCombination: vi.fn(),
    getTopCardsForColorIdentity: vi.fn(),
    getTopLandsForColorIdentity: vi.fn(),
  };
});

import {
  getFullCommanderProfile,
  getLandsForColorCombination,
} from './edhrec';

const mockedProfile = vi.mocked(getFullCommanderProfile);
const mockedLands = vi.mocked(getLandsForColorCombination);

describeDb('buildDeckFromCommander integration (mocked EDHREC)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLands.mockResolvedValue([
      { name: 'Command Tower', synergyScore: 0.9, category: 'lands' },
      { name: 'Exotic Orchard', synergyScore: 0.8, category: 'lands' },
    ]);
    mockedProfile.mockResolvedValue({
      cards: [
        { name: 'Sol Ring', synergyScore: 0.95, category: 'ramp' },
        { name: 'Rhystic Study', synergyScore: 0.9, category: 'card_draw' },
      ],
      lands: [{ name: 'Command Tower', synergyScore: 0.9, category: 'lands' }],
      themes: [{ name: 'Group Slug', slug: 'group-slug', count: 100 }],
      combos: [],
      highSaltCards: [],
      sourcesUsed: ['mock'],
    });
  });

  itDb('builds skeleton with analysis and mocked EDHREC context', async () => {
    const result = await buildDeckFromCommander({
      commanderName: 'Shadrix Silverquill',
      templateId: 'bracket3',
      bracketId: 'bracket3',
      preferredStrategy: 'group-slug',
      useEdhrec: true,
      useEdhrecAutofill: false,
      useTemplateGenerator: false,
      seedCards: ['Sol Ring'],
    });

    expect(result.deck.commanderName).toBe('Shadrix Silverquill');
    expect(result.deck.cards.length).toBeGreaterThan(0);
    expect(result.analysis).toBeDefined();
    expect(result.analysis.totalCards).toBeGreaterThan(0);
    expect(mockedProfile).toHaveBeenCalled();
    expect(result.notes.some((n) => /EDHREC/i.test(n))).toBe(true);
    expect(result.edhrecContext?.suggestions.length).toBeGreaterThan(0);
  });

  itDb('uses fillManaBaseFromTemplate path for bracket3 template', async () => {
    const result = await buildDeckFromCommander({
      commanderName: 'Talrand, Sky Summoner',
      templateId: 'bracket3',
      useEdhrec: false,
      useEdhrecAutofill: false,
      useTemplateGenerator: false,
    });

    const landCount = result.deck.cards
      .filter((c) => c.roles?.includes('land') || /land|plains|island|swamp|mountain|forest|wastes|tower/i.test(c.name))
      .reduce((s, c) => s + c.quantity, 0);
    expect(landCount).toBeGreaterThanOrEqual(35);
    expect(result.notes.some((n) => /mana base|four-system/i.test(n))).toBe(true);
  });
});

describe('buildDeckFromCommander (no DB)', () => {
  it('throws when commander cannot be resolved', async () => {
    await expect(
      buildDeckFromCommander({
        commanderName: 'Totally Fake Commander XYZ 99999',
        useEdhrec: false,
        useEdhrecAutofill: false,
      })
    ).rejects.toThrow(/could not be resolved/i);
  });
});
