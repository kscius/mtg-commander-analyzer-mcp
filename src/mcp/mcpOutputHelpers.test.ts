import { describe, expect, it } from 'vitest';
import {
  formatZodValidationError,
  buildAnalyzeSummary,
  buildQualityGate,
  attachAnalyzeConvergence,
  attachBuildConvergence,
  attachOptimizeConvergence,
} from './mcpOutputHelpers';
import type { BuildDeckResult, OptimizeDeckResult } from '../core/types';
import { validatePreferredStrategySlug } from '../core/strategyProfiles';
import { SearchCardsInputSchema } from '../core/schemas';
import type { AnalyzeDeckResult } from '../core/types';

describe('formatZodValidationError', () => {
  it('formats zod issues as readable lines', () => {
    let err;
    try {
      SearchCardsInputSchema.parse({});
    } catch (e) {
      err = e;
    }
    const text = formatZodValidationError(err as import('zod').ZodError);
    expect(text).toContain('Invalid tool arguments');
    expect(text).toContain('maxMV');
  });
});

describe('buildAnalyzeSummary', () => {
  it('includes card count and synergy when present', () => {
    const result = {
      input: {},
      analysis: {
        commanderName: 'Test',
        totalCards: 99,
        uniqueCards: 99,
        categories: [],
        notes: [],
        bracketWarnings: [],
        bannedCards: [],
        banlistValid: true,
        synergyScore: 72,
        deckScore: 80,
      },
      parsedDeck: { cards: [] },
    } as AnalyzeDeckResult;
    const summary = buildAnalyzeSummary(result);
    expect(summary).toContain('99');
    expect(summary).toContain('synergy 72');
  });
});

describe('buildQualityGate', () => {
  it('keeps soft lint in polish only, not blocking or remainingGaps', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [{ name: 'lands', count: 37, min: 35, max: 38, status: 'within' as const }],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 65,
      lintReport: {
        ok: false,
        issues: [
          { key: 'curve:high', message: 'Curve skews high', severity: 'soft' as const },
          { key: 'curve:low', message: 'Too many 1-drops', severity: 'soft' as const },
        ],
        metrics: {},
      },
    };
    const gate = buildQualityGate(analysis, { synergyTarget: 60 });
    expect(gate.blocking).toHaveLength(0);
    expect(gate.polish).toHaveLength(2);
    expect(gate.readyToShip).toBe(true);

    const out = attachAnalyzeConvergence({
      input: {},
      analysis,
      parsedDeck: { cards: [] },
    } as AnalyzeDeckResult);
    expect(out.remainingGaps).toHaveLength(0);
    expect(out.agentBrief?.readyToShip).toBe(true);
    expect(out.agentBrief?.remainingGapCount).toBeUndefined();
    expect(out.agentBrief?.polishGapCount).toBe(2);
    expect(out.qualityGate?.polish).toHaveLength(2);
  });

  it('marks readyToShip when converged with no blocking gaps', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [{ name: 'lands', count: 37, min: 35, max: 38, status: 'within' as const }],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 65,
      lintReport: { ok: true, issues: [], metrics: {} },
    };
    const gate = buildQualityGate(analysis, { synergyTarget: 60 });
    expect(gate.converged).toBe(true);
    expect(gate.readyToShip).toBe(true);
    expect(gate.blocking).toHaveLength(0);
  });
});

describe('attachAnalyzeConvergence', () => {
  it('adds agentBrief with summary and decklistText', () => {
    const base = {
      input: {},
      analysis: {
        commanderName: 'Shadrix Silverquill',
        totalCards: 99,
        uniqueCards: 99,
        categories: [],
        notes: [],
        bracketWarnings: [],
        bannedCards: [],
        banlistValid: true,
        synergyScore: 70,
      },
      parsedDeck: { cards: [] },
      decklistText: '1 Sol Ring',
      summary: 'Mainboard 99/99 cards.',
    } as AnalyzeDeckResult;
    const out = attachAnalyzeConvergence(base);
    expect(out.agentBrief?.summary).toContain('99');
    expect(out.agentBrief?.decklistText).toBe('1 Sol Ring');
    expect(out.agentBrief?.synergyScore).toBe(70);
  });
});

describe('validatePreferredStrategySlug', () => {
  it('accepts known slugs and rejects unknown', () => {
    expect(validatePreferredStrategySlug('tokens').ok).toBe(true);
    expect(validatePreferredStrategySlug('not-a-real-slug-xyz').ok).toBe(false);
  });
});

const sampleAnalysis = {
  commanderName: 'Test',
  totalCards: 99,
  uniqueCards: 99,
  categories: [{ name: 'lands', count: 37, min: 35, max: 38, status: 'within' as const }],
  notes: [],
  bracketWarnings: [],
  bannedCards: [],
  banlistValid: true,
  synergyScore: 65,
  lintReport: { ok: true, issues: [], metrics: {} },
};

describe('attachBuildConvergence', () => {
  it('adds qualityGate on build results', () => {
    const base = {
      input: { commanderName: 'Test' },
      templateId: 'bracket3',
      bracketId: 'bracket3',
      deck: { commanderName: 'Test', cards: [] },
      analysis: sampleAnalysis,
      notes: [],
      decklistText: '1 Sol Ring',
    } as BuildDeckResult;
    const out = attachBuildConvergence(base);
    expect(out.qualityGate?.readyToShip).toBe(true);
    expect(out.agentBrief?.readyToShip).toBe(true);
  });
});

describe('attachOptimizeConvergence', () => {
  it('adds qualityGate on optimize results', () => {
    const base = {
      input: { commanderName: 'Test', templateId: 'bracket3', bracketId: 'bracket3' },
      deckText: '1 Sol Ring',
      decklistText: '1 Sol Ring',
      changes: [],
      metricsBefore: { categoriesBelow: 0, lintHardIssues: 0 },
      metricsAfter: { categoriesBelow: 0, lintHardIssues: 0, synergyScore: 65 },
      analysis: sampleAnalysis,
      iterationNotes: [],
    } as OptimizeDeckResult;
    const out = attachOptimizeConvergence(base, 60);
    expect(out.qualityGate?.readyToShip).toBe(true);
  });
});
