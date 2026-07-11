import { describe, expect, it } from 'vitest';
import {
  formatAuxiliaryMcpJson,
  formatMcpToolJson,
  toBriefAnalyzeResult,
  toBriefOptimizeResult,
  toBriefStrategyGuideResult,
  toBriefSynergiesResult,
} from './mcpResponseFormat';
import type {
  AnalyzeDeckResult,
  BuildDeckResult,
  OptimizeDeckResult,
  PrioritizedAction,
} from '../core/types';

function makeActions(count: number): PrioritizedAction[] {
  return Array.from({ length: count }, (_, i) => ({
    priority: i + 1,
    action: 'add' as const,
    category: 'card_draw',
    detail: `Action ${i + 1}: fill card_draw gap with repeatable draw.`,
  }));
}

function makeAnalyzeResult(overrides: Partial<AnalyzeDeckResult> = {}): AnalyzeDeckResult {
  const actions = makeActions(10);
  return {
    input: { templateId: 'bracket3', bracketId: 'bracket3', preferredStrategy: 'tokens' },
    summary: 'Deck needs work',
    converged: false,
    remainingGaps: [{ kind: 'category', detail: 'card_draw below min' }],
    qualityGate: {
      readyToShip: false,
      converged: false,
      blocking: [{ kind: 'category', detail: 'card_draw below min' }],
      polish: [],
    },
    nextSuggestedAction: 'optimize_deck or search_cards for card_draw',
    agentBrief: {
      summary: 'Deck needs work',
      readyToShip: false,
      remainingGapCount: 1,
      polishGapCount: 0,
      synergyScore: 55,
      decklistText: '1 Sol Ring',
      nextSuggestedAction: 'optimize_deck or search_cards for card_draw',
    },
    decklistText: '1 Sol Ring\n1 Command Tower',
    synergyScore: 55,
    deckScore: 62,
    recommendations: {
      cuts: [{ name: 'Divination', reason: 'Weak draw' }],
      adds: [{ name: 'Phyrexian Arena', reason: 'Repeatable draw', category: 'card_draw' }],
      swaps: [{ cut: 'Divination', add: 'Phyrexian Arena', reason: 'Better draw' }],
      prioritizedActions: actions,
    },
    analysis: {
      commanderName: 'Shadrix Silverquill',
      totalCards: 99,
      uniqueCards: 99,
      categories: [{ name: 'card_draw', count: 6, status: 'below' }],
      notes: Array.from({ length: 12 }, (_, i) => `Note ${i + 1}`),
      bracketWarnings: [],
      bannedCards: [],
      banlistValid: true,
      synergyScore: 55,
      deckScore: 62,
      unresolvedCardNames: [],
      strengthsAndWeaknesses: { strengths: ['Ramp ok'], weaknesses: ['Draw low'] },
      prioritizedActions: actions,
      lintReport: {
        ok: true,
        issues: [],
        metrics: { avg_mv: 3.2, land_count: 36 },
      },
      manaBaseQuality: { score: 80, summary: 'ok', metrics: { landCount: 36 } },
      curveAnalysis: { score: 75, summary: 'ok', averageMv: 3.2, distribution: { '2': 10 } },
      recommendations: {
        cuts: [{ name: 'Divination', reason: 'Weak draw' }],
        adds: [{ name: 'Phyrexian Arena', reason: 'Repeatable draw', category: 'card_draw' }],
        prioritizedActions: actions,
      },
    },
    parsedDeck: {
      commanderName: 'Shadrix Silverquill',
      cards: Array.from({ length: 99 }, (_, i) => ({ name: `Card ${i}`, quantity: 1 })),
    },
    ...overrides,
  } as AnalyzeDeckResult;
}

describe('formatAuxiliaryMcpJson', () => {
  it('strips full oracle text from search_cards in brief mode', () => {
    const raw = {
      cards: [
        {
          name: 'Sol Ring',
          type: 'Artifact',
          mv: 1,
          oracleText: 'A'.repeat(200),
          tags: ['ramp'],
        },
      ],
      count: 1,
      databaseReady: true,
    };
    const brief = JSON.parse(formatAuxiliaryMcpJson(raw, 'brief')) as typeof raw;
    expect(brief.cards[0]).not.toHaveProperty('oracleText');
    expect((brief.cards[0] as { oracleTextPreview?: string }).oracleTextPreview?.length).toBe(120);
  });

  it('limits synergy example cards in brief mode', () => {
    const raw = {
      synergies: [
        {
          slug: 'tokens',
          name: 'Tokens',
          description: 'Go wide',
          source: 'edhrec',
          cardCount: 42,
          exampleCards: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        },
      ],
      recommendedStrategy: 'tokens',
      commander: { name: 'Test' },
    };
    const slim = toBriefSynergiesResult(raw);
    const first = (slim.synergies as Array<Record<string, unknown>>)[0];
    expect(first.exampleCards).toHaveLength(5);
    expect(first.source).toBe('edhrec');
    expect(first.cardCount).toBe(42);
    expect(first).not.toHaveProperty('recommendedStrategy');
    expect(slim.recommendedStrategy).toBe('tokens');
  });

  it('omits guide markdown in brief strategy guide', () => {
    const slim = toBriefStrategyGuideResult({
      guideMarkdown: '# Long guide',
      preferredStrategy: 'tokens',
      summary: 'ok',
    });
    expect(slim.guideMarkdown).toBe('');
  });

  it('pretty-prints auxiliary payloads in full mode without slimming', () => {
    const raw = {
      cards: [{ name: 'Sol Ring', oracleText: 'A'.repeat(200) }],
      databaseReady: true,
    };
    const full = formatAuxiliaryMcpJson(raw, 'full');
    expect(full).toContain('\n');
    const parsed = JSON.parse(full) as typeof raw;
    expect(parsed.cards[0].oracleText).toHaveLength(200);
  });

  it('passes get_category_candidates through unchanged in brief mode', () => {
    const raw = {
      candidates: [{ name: 'Phyrexian Arena', category: 'card_draw' }],
      category: 'card_draw',
      databaseReady: true,
    };
    const brief = JSON.parse(formatAuxiliaryMcpJson(raw, 'brief')) as typeof raw;
    expect(brief.candidates).toEqual(raw.candidates);
    expect(brief.category).toBe('card_draw');
  });
});

describe('toBriefAnalyzeResult / formatMcpToolJson analyze', () => {
  it('empties recommendations.cuts/adds and parsedDeck.cards in brief mode (AGENTS.md contract)', () => {
    const full = makeAnalyzeResult();
    const brief = toBriefAnalyzeResult(full);

    expect(brief.parsedDeck.cards).toEqual([]);
    expect(brief.parsedDeck.commanderName).toBe('Shadrix Silverquill');
    expect(brief.decklistText).toContain('Sol Ring');
    expect(brief.qualityGate?.readyToShip).toBe(false);
    expect(brief.agentBrief?.remainingGapCount).toBe(1);
    expect(brief.recommendations?.cuts).toEqual([]);
    expect(brief.recommendations?.adds).toEqual([]);
    expect(brief.recommendations).not.toHaveProperty('swaps');
    expect(brief.analysis.recommendations).toBeUndefined();
  });

  it('caps prioritizedActions and notes at 8 in brief mode', () => {
    const brief = toBriefAnalyzeResult(makeAnalyzeResult());
    expect(brief.analysis.prioritizedActions).toHaveLength(8);
    expect(brief.recommendations?.prioritizedActions).toHaveLength(8);
    expect(brief.analysis.notes).toHaveLength(8);
  });

  it('strips lintReport.metrics in brief mode while keeping issues', () => {
    const brief = toBriefAnalyzeResult(makeAnalyzeResult());
    expect(brief.analysis.lintReport?.ok).toBe(true);
    expect(brief.analysis.lintReport?.metrics).toEqual({});
  });

  it('routes analyze results through toBriefAnalyzeResult via formatMcpToolJson brief', () => {
    const parsed = JSON.parse(
      formatMcpToolJson(makeAnalyzeResult(), 'brief')
    ) as AnalyzeDeckResult;
    expect(parsed.parsedDeck.cards).toEqual([]);
    expect(parsed.recommendations?.cuts).toEqual([]);
    expect(parsed.analysis.prioritizedActions).toHaveLength(8);
  });

  it('preserves full analyze payload and pretty-prints in full mode', () => {
    const full = makeAnalyzeResult();
    const text = formatMcpToolJson(full, 'full');
    expect(text).toContain('\n');
    const parsed = JSON.parse(text) as AnalyzeDeckResult;
    expect(parsed.parsedDeck.cards).toHaveLength(99);
    expect(parsed.recommendations?.cuts).toHaveLength(1);
    expect(parsed.recommendations?.adds).toHaveLength(1);
    expect(parsed.recommendations?.swaps).toHaveLength(1);
    expect(parsed.analysis.notes).toHaveLength(12);
    expect(parsed.analysis.lintReport?.metrics).toEqual({ avg_mv: 3.2, land_count: 36 });
  });
});

describe('toBriefOptimizeResult / formatMcpToolJson optimize', () => {
  function makeOptimizeResult(): OptimizeDeckResult {
    const analysis = makeAnalyzeResult().analysis;
    return {
      input: {
        commanderName: 'Shadrix Silverquill',
        preferredStrategy: 'group-slug',
        templateId: 'bracket3',
        bracketId: 'bracket3',
      },
      deckText: '1 Sol Ring',
      decklistText: '1 Sol Ring\n1 Command Tower',
      changes: [{ type: 'add', name: 'Phyrexian Arena', reason: 'Draw' }],
      metricsBefore: { synergyScore: 50, categoriesBelow: 2, lintHardIssues: 0 },
      metricsAfter: { synergyScore: 58, categoriesBelow: 1, lintHardIssues: 0 },
      analysis,
      iterationNotes: Array.from({ length: 12 }, (_, i) => `Iter note ${i + 1}`),
      summary: 'Improved draw',
      converged: false,
      remainingGaps: [{ kind: 'category', detail: 'card_draw below min' }],
      qualityGate: {
        readyToShip: false,
        converged: false,
        blocking: [{ kind: 'category', detail: 'card_draw below min' }],
        polish: [],
      },
      nextSuggestedAction: 'search_cards for card_draw',
      agentBrief: {
        summary: 'Improved draw',
        readyToShip: false,
        remainingGapCount: 1,
        polishGapCount: 0,
        synergyScore: 58,
        decklistText: '1 Sol Ring',
        nextSuggestedAction: 'search_cards for card_draw',
      },
    };
  }

  it('aliases deckText to decklistText and caps iterationNotes in brief mode', () => {
    const brief = toBriefOptimizeResult(makeOptimizeResult());
    expect(brief.decklistText).toContain('Sol Ring');
    expect(brief.deckText).toBe(brief.decklistText);
    expect(brief.iterationNotes).toHaveLength(8);
    expect(brief.changes).toHaveLength(1);
    expect(brief.metricsBefore.categoriesBelow).toBe(2);
    expect(brief.metricsAfter.synergyScore).toBe(58);
  });

  it('slims nested analysis like analyze brief (empty cuts, capped actions)', () => {
    const brief = toBriefOptimizeResult(makeOptimizeResult());
    expect(brief.analysis.notes).toHaveLength(8);
    expect(brief.analysis.prioritizedActions).toHaveLength(8);
    expect(brief.analysis.lintReport?.metrics).toEqual({});
  });

  it('routes optimize results through toBriefOptimizeResult via formatMcpToolJson brief', () => {
    const parsed = JSON.parse(
      formatMcpToolJson(makeOptimizeResult(), 'brief')
    ) as OptimizeDeckResult;
    expect(parsed.iterationNotes).toHaveLength(8);
    expect(parsed.deckText).toBe(parsed.decklistText);
    expect(parsed.analysis.prioritizedActions).toHaveLength(8);
  });

  it('preserves full optimize payload in full mode', () => {
    const text = formatMcpToolJson(makeOptimizeResult(), 'full');
    expect(text).toContain('\n');
    const parsed = JSON.parse(text) as OptimizeDeckResult;
    expect(parsed.iterationNotes).toHaveLength(12);
    expect(parsed.analysis.notes).toHaveLength(12);
    expect(parsed.analysis.lintReport?.metrics).toEqual({ avg_mv: 3.2, land_count: 36 });
  });
});

describe('formatMcpToolJson build brief', () => {
  it('omits deck.cards array in brief build responses (use decklistText)', () => {
    const buildResult = {
      input: { commanderName: 'Test' },
      templateId: 'bracket3',
      bracketId: 'bracket3',
      deck: {
        commanderName: 'Test',
        cards: Array.from({ length: 99 }, (_, i) => ({
          name: `Card ${i}`,
          quantity: 1,
        })),
      },
      analysis: {
        commanderName: 'Test',
        totalCards: 99,
        uniqueCards: 99,
        categories: [],
        notes: [],
        bracketWarnings: [],
        bannedCards: [],
        banlistValid: true,
      },
      notes: [],
      decklistText: '1 Sol Ring\n1 Command Tower',
    } as BuildDeckResult;

    const parsed = JSON.parse(formatMcpToolJson(buildResult, 'brief')) as BuildDeckResult;

    expect(parsed.decklistText).toContain('Sol Ring');
    expect(parsed.deck.commanderName).toBe('Test');
    expect(parsed.deck.cards).toEqual([]);
  });

  it('preserves deck.cards in full build mode', () => {
    const buildResult = {
      input: { commanderName: 'Test' },
      templateId: 'bracket3',
      bracketId: 'bracket3',
      deck: {
        commanderName: 'Test',
        cards: Array.from({ length: 3 }, (_, i) => ({
          name: `Card ${i}`,
          quantity: 1,
        })),
      },
      analysis: {
        commanderName: 'Test',
        totalCards: 3,
        uniqueCards: 3,
        categories: [],
        notes: [],
        bracketWarnings: [],
        bannedCards: [],
        banlistValid: true,
      },
      notes: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'],
      decklistText: '1 Card 0',
    } as BuildDeckResult;

    const parsed = JSON.parse(formatMcpToolJson(buildResult, 'full')) as BuildDeckResult;
    expect(parsed.deck.cards).toHaveLength(3);
    expect(parsed.notes).toHaveLength(9);
  });
});
