import { describe, expect, it } from 'vitest';
import { computeCategoryDeficits } from './categoryUtils';
import type { DeckAnalysis, DeckTemplate } from './types';

function makeAnalysis(categories: DeckAnalysis['categories']): DeckAnalysis {
  return {
    commanderName: 'Test Commander',
    totalCards: 99,
    uniqueCards: 99,
    categories,
    notes: [],
    bracketWarnings: [],
    bannedCards: [],
    banlistValid: true,
    lintReport: { ok: true, issues: [], metrics: {} },
  };
}

function makeTemplate(categories: DeckTemplate['categories']): DeckTemplate {
  return {
    id: 'bracket3',
    label: 'Bracket 3',
    categories,
  };
}

describe('computeCategoryDeficits', () => {
  it('computes deficit as max(0, min - current)', () => {
    const analysis = makeAnalysis([
      { name: 'ramp', count: 6, min: 9, max: 12, status: 'below' },
      { name: 'card_draw', count: 10, min: 8, max: 11, status: 'within' },
    ]);
    const template = makeTemplate([
      { name: 'ramp', min: 9, max: 12 },
      { name: 'card_draw', min: 8, max: 11 },
    ]);

    const deficits = computeCategoryDeficits(analysis, template, ['ramp', 'card_draw']);

    expect(deficits).toEqual([
      { name: 'ramp', current: 6, min: 9, max: 12, deficit: 3 },
      { name: 'card_draw', current: 10, min: 8, max: 11, deficit: 0 },
    ]);
  });

  it('treats missing analysis categories as zero count', () => {
    const analysis = makeAnalysis([]);
    const template = makeTemplate([{ name: 'lands', min: 35, max: 38 }]);

    const deficits = computeCategoryDeficits(analysis, template, ['lands']);

    expect(deficits).toEqual([
      { name: 'lands', current: 0, min: 35, max: 38, deficit: 35 },
    ]);
  });

  it('returns zero deficit when template category has no minimum', () => {
    const analysis = makeAnalysis([{ name: 'custom', count: 0, status: 'within' }]);
    const template = makeTemplate([{ name: 'custom' }]);

    const deficits = computeCategoryDeficits(analysis, template, ['custom']);

    expect(deficits[0]?.deficit).toBe(0);
    expect(deficits[0]?.min).toBeUndefined();
  });

  it('only evaluates requested category names', () => {
    const analysis = makeAnalysis([
      { name: 'ramp', count: 5, min: 9, max: 12, status: 'below' },
      { name: 'protection', count: 2, min: 3, max: 6, status: 'below' },
    ]);
    const template = makeTemplate([
      { name: 'ramp', min: 9, max: 12 },
      { name: 'protection', min: 3, max: 6 },
    ]);

    const deficits = computeCategoryDeficits(analysis, template, ['ramp']);

    expect(deficits).toHaveLength(1);
    expect(deficits[0]?.name).toBe('ramp');
  });
});
