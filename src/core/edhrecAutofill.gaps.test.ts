import { describe, expect, it } from 'vitest';
import { analysisHasAutomatableGaps } from './edhrecAutofill';
import type { DeckAnalysis } from './types';

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
