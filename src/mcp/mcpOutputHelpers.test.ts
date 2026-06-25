import { describe, expect, it } from 'vitest';
import {
  formatZodValidationError,
  buildAnalyzeSummary,
  buildQualityGate,
  buildNextSuggestedAction,
  buildAgentBriefFromAnalysis,
  computeRemainingGaps,
  isDeckConverged,
  attachAnalyzeConvergence,
  attachBuildConvergence,
  attachOptimizeConvergence,
  resolveOptimizeSynergyTarget,
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
  it('mentions unresolved card names in summary', () => {
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
        unresolvedCardNames: ['Mystery Card'],
      },
      parsedDeck: { cards: [] },
    } as AnalyzeDeckResult;
    const summary = buildAnalyzeSummary(result);
    expect(summary).toContain('unresolved');
    expect(summary).toContain('Mystery Card');
  });

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

describe('buildAgentBriefFromAnalysis', () => {
  it('filters categoriesBelow by focusCategories to match blocking gaps', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' as const },
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 70,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const brief = buildAgentBriefFromAnalysis(analysis, {
      summary: 'Optimized deck.',
      focusCategories: ['ramp'],
      remainingGaps: [],
      converged: false,
      readyToShip: false,
    });

    expect(brief.categoriesBelow).toBeUndefined();
    expect(brief.remainingGapCount).toBeUndefined();
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

  it('stays not converged when automatable gaps remain outside focusCategories', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'ramp', count: 10, min: 9, max: 12, status: 'within' as const },
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 70,
      lintReport: { ok: true, issues: [], metrics: {} },
    };
    const base = {
      input: {
        commanderName: 'Test',
        templateId: 'bracket3',
        bracketId: 'bracket3',
        focusCategories: ['ramp'],
      },
      deckText: '1 Sol Ring',
      decklistText: '1 Sol Ring',
      changes: [],
      metricsBefore: { categoriesBelow: 1, lintHardIssues: 0 },
      metricsAfter: { categoriesBelow: 1, lintHardIssues: 0, synergyScore: 70 },
      analysis,
      iterationNotes: [],
    } as OptimizeDeckResult;

    const out = attachOptimizeConvergence(base, 60);

    expect(out.qualityGate?.blocking).toHaveLength(0);
    expect(out.qualityGate?.converged).toBe(false);
    expect(out.qualityGate?.readyToShip).toBe(false);
    expect(out.nextSuggestedAction).toContain('card_draw');
    expect(out.agentBrief?.categoriesBelow).toBeUndefined();
    expect(out.agentBrief?.remainingGapCount).toBeUndefined();
  });
});

describe('resolveOptimizeSynergyTarget', () => {
  it('defaults to 60 when preferredStrategy is set and stopWhenScore is omitted', () => {
    expect(
      resolveOptimizeSynergyTarget({ preferredStrategy: 'tokens' })
    ).toBe(60);
  });

  it('uses stopWhenScore when provided with preferredStrategy', () => {
    expect(
      resolveOptimizeSynergyTarget({
        preferredStrategy: 'tokens',
        stopWhenScore: 70,
      })
    ).toBe(70);
  });

  it('returns undefined when no strategy and no stopWhenScore', () => {
    expect(resolveOptimizeSynergyTarget({})).toBeUndefined();
    expect(
      resolveOptimizeSynergyTarget({ stopWhenScore: undefined })
    ).toBeUndefined();
  });

  it('returns stopWhenScore only when preferredStrategy is absent', () => {
    expect(resolveOptimizeSynergyTarget({ stopWhenScore: 55 })).toBe(55);
  });
});

describe('isDeckConverged synergy target alignment', () => {
  it('treats synergy below default 60 as not converged when target is resolved for strategy builds', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'lands', count: 37, min: 35, max: 38, status: 'within' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 52,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const synergyTarget = resolveOptimizeSynergyTarget({
      preferredStrategy: 'tokens',
    });

    expect(synergyTarget).toBe(60);
    expect(isDeckConverged(analysis, { synergyTarget })).toBe(false);
    expect(buildQualityGate(analysis, { synergyTarget }).readyToShip).toBe(false);
  });
});

describe('computeRemainingGaps', () => {
  it('includes synergy gap when score is below target', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 52,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const gaps = computeRemainingGaps(analysis, { synergyTarget: 60 });

    expect(gaps.some((g) => g.kind === 'synergy')).toBe(true);
    expect(gaps.find((g) => g.kind === 'synergy')?.detail).toContain('52/100');
  });

  it('filters category gaps by focusCategories when provided', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'ramp', count: 6, min: 9, max: 12, status: 'below' as const },
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const gaps = computeRemainingGaps(analysis, { focusCategories: ['ramp'] });

    expect(gaps.filter((g) => g.kind === 'category')).toHaveLength(1);
    expect(gaps[0].category).toBe('ramp');
  });
});

describe('buildQualityGate blocking paths', () => {
  it('blocks shipment when unresolved card names are present', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 70,
      unresolvedCardNames: ['Fake Card XYZ', 'Another Unknown'],
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const gate = buildQualityGate(analysis, { synergyTarget: 60 });

    expect(gate.blocking.some((g) => g.kind === 'unresolved')).toBe(true);
    expect(gate.readyToShip).toBe(false);
    expect(gate.converged).toBe(false);

    const action = buildNextSuggestedAction(analysis, 'analyze_deck');
    expect(action).toContain('resolve_card');
    expect(action).toContain('Fake Card XYZ');

    const out = attachAnalyzeConvergence({
      input: {},
      analysis,
      parsedDeck: { cards: [] },
    } as AnalyzeDeckResult);
    expect(out.agentBrief?.readyToShip).toBe(false);
    expect(out.nextSuggestedAction).toContain('unresolved');
  });

  it('blocks shipment on hard lint issues', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 70,
      lintReport: {
        ok: false,
        issues: [
          {
            key: 'format:color_identity',
            message: 'Card outside commander colors',
            severity: 'hard' as const,
          },
        ],
        metrics: {},
      },
    };

    const gate = buildQualityGate(analysis, { synergyTarget: 60 });

    expect(gate.blocking.some((g) => g.kind === 'lint')).toBe(true);
    expect(gate.readyToShip).toBe(false);
    expect(gate.converged).toBe(false);
  });

  it('blocks shipment on banlist and format violations', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 98,
      uniqueCards: 98,
      categories: [],
      notes: [],
      bracketWarnings: [],
      bannedCards: [{ name: 'Mana Crypt', reason: 'project banlist' }],
      banlistValid: false,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    const gate = buildQualityGate(analysis);

    expect(gate.blocking.some((g) => g.kind === 'banlist')).toBe(true);
    expect(gate.blocking.some((g) => g.kind === 'format')).toBe(true);
    expect(gate.readyToShip).toBe(false);
  });
});

describe('buildNextSuggestedAction', () => {
  it('prioritizes hard lint fixes in the suggested action', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      lintReport: {
        ok: false,
        issues: [
          {
            key: 'format:color_identity',
            message: 'Card outside commander colors',
            severity: 'hard' as const,
          },
        ],
        metrics: {},
      },
    };

    const action = buildNextSuggestedAction(analysis, 'optimize_deck');

    expect(action).toContain('format:color_identity');
    expect(action).toContain('optimize_deck');
  });
});

describe('isDeckConverged', () => {
  it('returns false when automatable category deficits remain', () => {
    const analysis = {
      commanderName: 'Test',
      totalCards: 99,
      uniqueCards: 99,
      categories: [
        { name: 'card_draw', count: 5, min: 8, max: 11, status: 'below' as const },
      ],
      notes: [],
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 70,
      lintReport: { ok: true, issues: [], metrics: {} },
    };

    expect(isDeckConverged(analysis, { synergyTarget: 60 })).toBe(false);
  });
});
