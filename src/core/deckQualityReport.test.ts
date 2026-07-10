import { describe, expect, it } from 'vitest';
import { buildDeckQualityExtensions } from './deckQualityReport';
import type { CategorySummary, DeckAnalysis, LintReport } from './types';

function minimalAnalysis(overrides: Partial<DeckAnalysis> = {}): DeckAnalysis {
  const categories: CategorySummary[] = [
    { name: 'lands', count: 36, min: 35, max: 38, status: 'within' },
    { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' },
    { name: 'card_draw', count: 6, min: 8, max: 11, status: 'below' },
  ];
  const lintReport: LintReport = {
    ok: true,
    issues: [],
    metrics: {
      land_count: 36,
      tapped_lands_always: 2,
      tapped_lands_conditional: 1,
      land_mix: { basics: 10, utility_lands: 26 },
      curve_avg_mv: 2.8,
      curve_mv_distribution: { '0_1': 10, '2': 14, '3': 12, '4': 8, '5_plus': 5 },
    },
  };
  return {
    commanderName: 'Test Commander',
    totalCards: 99,
    uniqueCards: 99,
    categories,
    notes: [],
    bracketWarnings: [],
    bannedCards: [],
    banlistValid: true,
    lintReport,
    synergyScore: 65,
    ...overrides,
  };
}

describe('buildDeckQualityExtensions', () => {
  it('computes deckScore in 0–100 range', () => {
    const q = buildDeckQualityExtensions(minimalAnalysis(), 'tokens');
    expect(q.deckScore).toBeGreaterThanOrEqual(0);
    expect(q.deckScore).toBeLessThanOrEqual(100);
  });

  it('lists strengths and weaknesses', () => {
    const q = buildDeckQualityExtensions(minimalAnalysis(), 'tokens');
    expect(q.strengthsAndWeaknesses.strengths.length).toBeGreaterThan(0);
    expect(q.strengthsAndWeaknesses.weaknesses.some((w) => w.includes('card_draw'))).toBe(
      true
    );
  });

  it('prioritizes category below actions', () => {
    const q = buildDeckQualityExtensions(minimalAnalysis(), 'tokens');
    expect(q.prioritizedActions.length).toBeGreaterThan(0);
    expect(q.prioritizedActions.some((a) => a.category === 'card_draw' || a.detail.includes('card_draw'))).toBe(
      true
    );
  });

  it('builds manaBaseQuality and curveAnalysis from lint metrics', () => {
    const q = buildDeckQualityExtensions(minimalAnalysis());
    expect(q.manaBaseQuality?.score).toBeGreaterThan(0);
    expect(q.manaBaseQuality?.summary).toContain('36 lands');
    expect(q.curveAnalysis?.averageMv).toBeCloseTo(2.8, 1);
    expect(q.curveAnalysis?.distribution['2']).toBe(14);
  });

  it('penalizes hard lint in deckScore', () => {
    const hardLint: LintReport = {
      ok: false,
      issues: [{ key: 'format:deck_size', severity: 'hard', message: 'Wrong size' }],
      metrics: {},
    };
    const low = buildDeckQualityExtensions(
      minimalAnalysis({ lintReport: hardLint, totalCards: 98 })
    );
    const high = buildDeckQualityExtensions(minimalAnalysis());
    expect(low.deckScore).toBeLessThan(high.deckScore);
  });
});
