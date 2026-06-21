import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckAnalysis, EdhrecContext } from './types';

vi.mock('./scryfall', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scryfall')>();
  return {
    ...actual,
    getCardByName: vi.fn((name: string) => {
      const lands = new Set(['Command Tower', 'Exotic Orchard']);
      if (!lands.has(name)) return null;
      return {
        name,
        type_line: 'Land',
        color_identity: [] as string[],
        mana_cost: '',
        cmc: 0,
        oracle_text: '',
        tags: ['land'],
      };
    }),
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
});
