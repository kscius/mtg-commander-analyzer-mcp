import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckAnalysis, EdhrecContext } from './types';

vi.mock('./scryfall', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scryfall')>();
  const cards: Record<string, object> = {
    'Command Tower': {
      name: 'Command Tower',
      type_line: 'Land',
      color_identity: [] as string[],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    },
    'Exotic Orchard': {
      name: 'Exotic Orchard',
      type_line: 'Land',
      color_identity: [] as string[],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    },
    Divination: {
      name: 'Divination',
      type_line: 'Sorcery',
      color_identity: ['U'],
      mana_cost: '{2}{U}',
      cmc: 3,
      oracle_text: 'Draw two cards.',
      tags: ['card_draw'],
    },
    Plains: {
      name: 'Plains',
      type_line: 'Basic Land — Plains',
      color_identity: ['W'],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    },
  };
  return {
    ...actual,
    getCardByName: vi.fn((name: string) => cards[name] ?? null),
  };
});

vi.mock('./banlist', () => ({
  isBanned: vi.fn(() => false),
}));

import { runLandAutofillPass } from './edhrecAutofill';
import { loadDeckTemplate } from './templates';

function baseAnalysis(overrides: Partial<DeckAnalysis> = {}): DeckAnalysis {
  return {
    commanderName: 'Test Commander',
    totalCards: 99,
    uniqueCards: 99,
    categories: [],
    notes: [],
    bracketWarnings: [],
    bannedCards: [],
    banlistValid: true,
    lintReport: { ok: true, issues: [], metrics: {} },
    ...overrides,
  };
}

describe('runLandAutofillPass', () => {
  const template = loadDeckTemplate('bracket3');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds EDHREC land suggestions when lands category is below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 32, min: 35, max: 38, status: 'below' },
      ],
    });
    const builtCards = [{ name: 'Plains', quantity: 32, roles: ['land'] }];

    const edhrecContext: EdhrecContext = {
      sourcesUsed: ['test'],
      suggestions: [
        { name: 'Command Tower', synergyScore: 0.9, category: 'lands' },
        { name: 'Exotic Orchard', synergyScore: 0.85, category: 'lands' },
        { name: 'Sol Ring', synergyScore: 0.95, category: 'ramp' },
      ],
    };

    const result = runLandAutofillPass(
      builtCards,
      analysis,
      template,
      ['W', 'U', 'B'],
      edhrecContext
    );

    expect(result.addedCount).toBe(2);
    expect(result.newCards.some((c) => c.name === 'Command Tower')).toBe(true);
    expect(result.newCards.some((c) => c.name === 'Exotic Orchard')).toBe(true);
    expect(result.passNotes.some((n) => /Land autofill added 2 land/i.test(n))).toBe(true);
  });

  it('swaps an off-theme nonland when mainboard is at 99 and lands are below minimum', () => {
    const analysis = baseAnalysis({
      commanderName: 'Atraxa, Praetors\' Voice',
      categories: [
        { name: 'lands', count: 34, min: 35, max: 38, status: 'below' },
        { name: 'card_draw', count: 8, min: 8, max: 11, status: 'within' },
      ],
    });

    const builtCards = [
      ...Array.from({ length: 34 }, () => ({ name: 'Plains', quantity: 1, roles: ['land'] })),
      ...Array.from({ length: 64 }, (_, i) => ({
        name: `Filler ${i}`,
        quantity: 1,
        roles: ['ramp'],
      })),
      { name: 'Divination', quantity: 1, roles: ['card_draw'] },
    ];

    const edhrecContext: EdhrecContext = {
      sourcesUsed: ['test'],
      selectedTheme: 'tokens',
      suggestions: [
        { name: 'Command Tower', synergyScore: 0.9, category: 'lands' },
        { name: 'Divination', synergyScore: 0.2, category: 'card_draw' },
      ],
    };

    const result = runLandAutofillPass(
      builtCards,
      analysis,
      template,
      ['W', 'U', 'B', 'G'],
      edhrecContext
    );

    expect(result.addedCount).toBe(1);
    expect(result.newCards.some((c) => c.name === 'Command Tower')).toBe(true);
    expect(result.newCards.some((c) => c.name === 'Divination')).toBe(false);
    expect(result.newCards.reduce((s, c) => s + c.quantity, 0)).toBe(99);
    expect(result.passNotes.some((n) => /Swap cut Divination/i.test(n))).toBe(true);
  });
});
