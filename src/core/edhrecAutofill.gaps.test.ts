import { describe, expect, it, vi } from 'vitest';
import {
  analysisHasAutomatableGaps,
  hasRemainingEdhrecAutofillDeficits,
  runLandAutofillPass,
} from './edhrecAutofill';
import type { DeckAnalysis, EdhrecContext } from './types';
import { loadDeckTemplate } from './templates';

vi.mock('./scryfall', () => ({
  getCardByName: vi.fn((name: string) => {
    const lands = new Set(['Command Tower', 'Exotic Orchard', 'Plains', 'Island']);
    if (!lands.has(name)) return null;
    return {
      name,
      type_line: 'Land',
      color_identity: name === 'Command Tower' || name === 'Exotic Orchard' ? [] : ['W'],
      mana_cost: '',
      cmc: 0,
      oracle_text: '',
      tags: ['land'],
    };
  }),
}));

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

describe('analysisHasAutomatableGaps', () => {
  it('returns true when hard lint issues are present', () => {
    const analysis = baseAnalysis({
      lintReport: {
        ok: false,
        issues: [
          {
            key: 'format:card_count',
            message: 'Mainboard must be 99 cards',
            severity: 'hard',
          },
        ],
        metrics: {},
      },
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(true);
  });

  it('returns false when only soft lint issues are present', () => {
    const analysis = baseAnalysis({
      lintReport: {
        ok: false,
        issues: [
          { key: 'curve:high', message: 'Curve skews high', severity: 'soft' },
        ],
        metrics: {},
      },
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(false);
  });

  it('returns true when lands are below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 32, min: 35, max: 38, status: 'below' },
      ],
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(true);
  });

  it('returns true for autofill-tracked categories below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' },
      ],
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(true);
  });

  it('returns false for non-autofill categories below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'game_changers', count: 0, min: 0, max: 3, status: 'below' },
      ],
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(false);
  });

  it('returns false when all categories are within range and lint is clean', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 37, min: 35, max: 38, status: 'within' },
        { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
      ],
    });

    expect(analysisHasAutomatableGaps(analysis)).toBe(false);
  });
});

describe('hasRemainingEdhrecAutofillDeficits', () => {
  const template = loadDeckTemplate('bracket3');

  it('returns true when only lands are below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 32, min: 35, max: 38, status: 'below' },
        { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
      ],
    });

    expect(hasRemainingEdhrecAutofillDeficits(analysis, template)).toBe(true);
  });

  it('returns false when lands and autofill categories are within range', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 37, min: 35, max: 38, status: 'within' },
        { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
      ],
    });

    expect(hasRemainingEdhrecAutofillDeficits(analysis, template)).toBe(false);
  });

  it('returns true for autofill category deficits even when lands are fine', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 37, min: 35, max: 38, status: 'within' },
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' },
      ],
    });

    expect(hasRemainingEdhrecAutofillDeficits(analysis, template)).toBe(true);
  });
});

describe('runLandAutofillPass', () => {
  const template = loadDeckTemplate('bracket3');

  it('adds EDHREC land suggestions when lands category is below minimum', () => {
    const analysis = baseAnalysis({
      categories: [
        { name: 'lands', count: 32, min: 35, max: 38, status: 'below' },
      ],
    });
    const builtCards = Array.from({ length: 32 }, (_, i) => ({
      name: i < 30 ? `Plains` : `Island`,
      quantity: 1,
      roles: ['land'] as string[],
    }));
    builtCards.push(
      ...Array.from({ length: 67 }, (_, i) => ({
        name: `Nonland Card ${i}`,
        quantity: 1,
        roles: ['ramp'] as string[],
      }))
    );

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

    expect(result.addedCount).toBe(3);
    expect(result.newCards.some((c) => c.name === 'Command Tower')).toBe(true);
    expect(result.newCards.some((c) => c.name === 'Exotic Orchard')).toBe(true);
    expect(result.passNotes.some((n) => /Land autofill added 3 land/i.test(n))).toBe(true);
  });
});
