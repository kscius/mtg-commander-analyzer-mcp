import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveCardNameSync = vi.fn();
const getCardByName = vi.fn();
const isBanned = vi.fn(() => false);
const cardFitsCommanderColorIdentity = vi.fn(() => true);

vi.mock('../core/cardResolution', () => ({
  resolveCardNameSync: (...args: unknown[]) => resolveCardNameSync(...args),
}));

vi.mock('../core/scryfall', () => ({
  getCardByName: (...args: unknown[]) => getCardByName(...args),
}));

vi.mock('../core/banlist', () => ({
  isBanned: (...args: unknown[]) => isBanned(...args),
}));

vi.mock('../core/commanderFormat', () => ({
  cardFitsCommanderColorIdentity: (...args: unknown[]) =>
    cardFitsCommanderColorIdentity(...args),
}));

import { runResolveCard } from './resolveCardTool';

function mockResolvedCard(
  overrides: {
    name?: string;
    color_identity?: string[];
    type_line?: string;
    legalities?: { commander?: string };
  } = {}
) {
  const name = overrides.name ?? 'Sol Ring';
  return {
    canonicalName: name,
    source: 'exact' as const,
    card: {
      name,
      type_line: overrides.type_line ?? 'Artifact',
      color_identity: overrides.color_identity ?? [],
      legalities: overrides.legalities ?? { commander: 'legal' },
    },
  };
}

describe('runResolveCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isBanned.mockReturnValue(false);
    cardFitsCommanderColorIdentity.mockReturnValue(true);
  });

  it('returns search_cards next step when the card name cannot be resolved', async () => {
    resolveCardNameSync.mockReturnValue(null);

    const result = await runResolveCard({ cardName: 'Totally Fake Card' });

    expect(result.resolved).toBe(false);
    expect(result.error).toMatch(/Card not found/);
    expect(result.summary).toMatch(/Could not resolve/);
    expect(result.nextSuggestedAction).toMatch(/search_cards/);
  });

  it('returns verify-commander action when commanderName is missing from the database', async () => {
    resolveCardNameSync.mockReturnValue(mockResolvedCard({ name: 'Sol Ring' }));
    getCardByName.mockReturnValue(null);

    const result = await runResolveCard({
      cardName: 'Sol Ring',
      commanderName: 'Missing Commander',
    });

    expect(result.resolved).toBe(true);
    expect(result.canonicalName).toBe('Sol Ring');
    expect(result.error).toMatch(/Commander "Missing Commander" not found/);
    expect(result.nextSuggestedAction).toMatch(/Verify commanderName spelling/);
  });

  it('blocks banned cards with a do-not-add next step', async () => {
    resolveCardNameSync.mockReturnValue(mockResolvedCard({ name: 'Mana Crypt' }));
    isBanned.mockReturnValue(true);

    const result = await runResolveCard({ cardName: 'Mana Crypt' });

    expect(result.resolved).toBe(true);
    expect(result.banned).toBe(true);
    expect(result.summary).toMatch(/BANNED/);
    expect(result.nextSuggestedAction).toMatch(/Do not add this card/);
  });

  it('blocks non-Commander-legal cards with a do-not-add next step', async () => {
    resolveCardNameSync.mockReturnValue(
      mockResolvedCard({
        name: 'Black Lotus',
        legalities: { commander: 'banned' },
      })
    );

    const result = await runResolveCard({ cardName: 'Black Lotus' });

    expect(result.resolved).toBe(true);
    expect(result.commanderLegal).toBe(false);
    expect(result.summary).toMatch(/not Commander-legal/);
    expect(result.nextSuggestedAction).toMatch(/Do not add this card/);
  });

  it('steers agents to search_cards when the card is outside commander colors', async () => {
    resolveCardNameSync.mockReturnValue(
      mockResolvedCard({ name: 'Lightning Bolt', color_identity: ['R'] })
    );
    getCardByName.mockReturnValue({
      name: 'Shadrix Silverquill',
      color_identity: ['W', 'B'],
    });
    cardFitsCommanderColorIdentity.mockReturnValue(false);

    const result = await runResolveCard({
      cardName: 'Lightning Bolt',
      commanderName: 'Shadrix Silverquill',
    });

    expect(result.resolved).toBe(true);
    expect(result.fitsCommanderColors).toBe(false);
    expect(result.summary).toMatch(/outside commander color identity/);
    expect(result.nextSuggestedAction).toMatch(/color identity via search_cards/);
  });

  it('returns evaluate_card_swap guidance when the card fits commander colors', async () => {
    resolveCardNameSync.mockReturnValue(
      mockResolvedCard({ name: 'Swords to Plowshares', color_identity: ['W'] })
    );
    getCardByName.mockReturnValue({
      name: 'Shadrix Silverquill',
      color_identity: ['W', 'B'],
    });
    cardFitsCommanderColorIdentity.mockReturnValue(true);

    const result = await runResolveCard({
      cardName: 'Swords to Plowshares',
      commanderName: 'Shadrix Silverquill',
    });

    expect(result.resolved).toBe(true);
    expect(result.canonicalName).toBe('Swords to Plowshares');
    expect(result.fitsCommanderColors).toBe(true);
    expect(result.banned).toBe(false);
    expect(result.commanderLegal).toBe(true);
    expect(result.summary).toMatch(/fits commander colors/);
    expect(result.nextSuggestedAction).toMatch(/evaluate_card_swap/);
  });
});
