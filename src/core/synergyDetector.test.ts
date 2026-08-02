import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCardByName = vi.fn();
const getColorIdentity = vi.fn(() => ['R']);
const getFullCommanderProfile = vi.fn();

vi.mock('./scryfall', () => ({
  getCardByName: (...args: unknown[]) => getCardByName(...args),
  getColorIdentity: (...args: unknown[]) => getColorIdentity(...args),
}));

vi.mock('./edhrec', () => ({
  getFullCommanderProfile: (...args: unknown[]) => getFullCommanderProfile(...args),
}));

import { detectSynergiesForCommander } from './synergyDetector';

describe('detectSynergiesForCommander', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getColorIdentity.mockReturnValue(['R']);
  });

  it('throws when the commander is not in the card database', async () => {
    getCardByName.mockReturnValue(null);

    await expect(detectSynergiesForCommander('Totally Fake Commander')).rejects.toThrow(
      /not found in card database/
    );
  });

  it('returns heuristic synergies when EDHREC is unavailable', async () => {
    getCardByName.mockReturnValue({
      name: 'Krenko, Mob Boss',
      type_line: 'Legendary Creature — Goblin Warrior',
      oracle_text: '{T}: Create a 1/1 red Goblin creature token.',
      color_identity: ['R'],
    });
    getFullCommanderProfile.mockRejectedValue(new Error('network down'));

    const result = await detectSynergiesForCommander('Krenko, Mob Boss');

    expect(result.commander.name).toBe('Krenko, Mob Boss');
    expect(result.commander.colorIdentity).toEqual(['R']);
    expect(result.synergies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'tokens', source: 'heuristic' }),
      ])
    );
    expect(result.recommendedStrategy).toBe('tokens');
    expect(getFullCommanderProfile).toHaveBeenCalledWith(
      'Krenko, Mob Boss',
      ['R'],
      expect.objectContaining({ cardLimit: 40, landLimit: 0 })
    );
  });

  it('merges EDHREC themes and prefers EDHREC over heuristic duplicates', async () => {
    getCardByName.mockReturnValue({
      name: 'Krenko, Mob Boss',
      type_line: 'Legendary Creature — Goblin Warrior',
      oracle_text: '{T}: Create a 1/1 red Goblin creature token.',
      color_identity: ['R'],
    });
    getFullCommanderProfile.mockResolvedValue({
      cards: [
        { name: 'Impact Tremors', category: 'tokens', label: 'tokens' },
        { name: 'Goblin Bombardment', category: 'aristocrats', label: 'aristocrats' },
      ],
      lands: [],
      themes: [
        { slug: 'tokens', name: 'Tokens', count: 4200 },
        { slug: 'aristocrats', name: 'Aristocrats', count: 1800 },
      ],
      combos: [],
      highSaltCards: [],
      sourcesUsed: ['commander'],
    });

    const result = await detectSynergiesForCommander('Krenko, Mob Boss');

    const tokens = result.synergies.find((s) => s.slug === 'tokens');
    expect(tokens?.source).toBe('edhrec');
    expect(tokens?.cardCount).toBe(4200);
    expect(tokens?.exampleCards).toContain('Impact Tremors');

    const aristocrats = result.synergies.find((s) => s.slug === 'aristocrats');
    expect(aristocrats?.source).toBe('edhrec');

    expect(result.synergies.every((s, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      if (prev.source !== s.source) return prev.source === 'edhrec';
      return prev.name.localeCompare(s.name) <= 0;
    })).toBe(true);
  });

  it('sets recommendedStrategy to the first EDHREC theme slug', async () => {
    getCardByName.mockReturnValue({
      name: 'Krenko, Mob Boss',
      type_line: 'Legendary Creature — Goblin Warrior',
      oracle_text: '{T}: Create a 1/1 red Goblin creature token.',
      color_identity: ['R'],
    });
    getFullCommanderProfile.mockResolvedValue({
      cards: [{ name: 'Impact Tremors', category: 'tokens' }],
      lands: [],
      themes: [
        { slug: 'tokens', name: 'Tokens', count: 100 },
        { slug: 'group-slug', name: 'Group Slug', count: 50 },
      ],
      combos: [],
      highSaltCards: [],
      sourcesUsed: ['commander'],
    });

    const result = await detectSynergiesForCommander('Krenko, Mob Boss');

    expect(result.recommendedStrategy).toBe('group-slug');
  });

  it('falls back to the first synergy when EDHREC returns no themes', async () => {
    getCardByName.mockReturnValue({
      name: 'Gisela, the Broken Blade',
      type_line: 'Legendary Creature — Angel Horror',
      oracle_text: 'Flying, first strike, lifelink',
      color_identity: ['W'],
    });
    getColorIdentity.mockReturnValue(['W']);
    getFullCommanderProfile.mockResolvedValue({
      cards: [],
      lands: [],
      themes: [],
      combos: [],
      highSaltCards: [],
      sourcesUsed: [],
    });

    const result = await detectSynergiesForCommander('Gisela, the Broken Blade');

    expect(result.synergies).toHaveLength(0);
    expect(result.recommendedStrategy).toBeUndefined();
  });
});
