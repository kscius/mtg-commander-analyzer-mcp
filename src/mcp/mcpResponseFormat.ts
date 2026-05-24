/**
 * MCP response shaping: brief vs full payloads and JSON serialization.
 */

import type {
  AnalyzeDeckResult,
  BuildDeckResult,
  OptimizeDeckResult,
} from '../core/types';

export type McpResponseMode = 'brief' | 'full';

const MAX_BRIEF_NOTES = 8;
const MAX_BRIEF_ACTIONS = 8;
const MAX_BRIEF_EDHREC_SUGGESTIONS = 25;

function slimLintReport(
  lint: AnalyzeDeckResult['analysis']['lintReport']
): AnalyzeDeckResult['analysis']['lintReport'] {
  if (!lint) return lint;
  return {
    ok: lint.ok,
    issues: lint.issues,
    metrics: {},
  };
}

/** Token-efficient analyze_deck payload for LLM agents. */
export function toBriefAnalyzeResult(result: AnalyzeDeckResult): AnalyzeDeckResult {
  const actions =
    result.analysis.prioritizedActions ??
    result.recommendations?.prioritizedActions ??
    result.analysis.recommendations?.prioritizedActions;

  return {
    input: result.input,
    summary: result.summary,
    converged: result.converged,
    remainingGaps: result.remainingGaps,
    qualityGate: result.qualityGate,
    nextSuggestedAction: result.nextSuggestedAction,
    agentBrief: result.agentBrief,
    decklistText: result.decklistText,
    synergyScore: result.analysis.synergyScore,
    deckScore: result.analysis.deckScore,
    recommendations: actions?.length
      ? {
          cuts: [],
          adds: [],
          prioritizedActions: actions.slice(0, MAX_BRIEF_ACTIONS),
        }
      : undefined,
    analysis: {
      commanderName: result.analysis.commanderName,
      totalCards: result.analysis.totalCards,
      uniqueCards: result.analysis.uniqueCards,
      categories: result.analysis.categories,
      banlistValid: result.analysis.banlistValid,
      bannedCards: result.analysis.bannedCards,
      bracketWarnings: result.analysis.bracketWarnings,
      synergyScore: result.analysis.synergyScore,
      deckScore: result.analysis.deckScore,
      unresolvedCardNames: result.analysis.unresolvedCardNames,
      notes: result.analysis.notes.slice(0, MAX_BRIEF_NOTES),
      strengthsAndWeaknesses: result.analysis.strengthsAndWeaknesses,
      prioritizedActions: actions?.slice(0, MAX_BRIEF_ACTIONS),
      lintReport: slimLintReport(result.analysis.lintReport),
      manaBaseQuality: result.analysis.manaBaseQuality,
      curveAnalysis: result.analysis.curveAnalysis,
    },
    parsedDeck: {
      cards: [],
      commanderName: result.parsedDeck.commanderName,
    },
  };
}

/** Token-efficient build_deck_from_commander payload. */
export function toBriefBuildResult(result: BuildDeckResult): BuildDeckResult {
  const suggestions = result.edhrecContext?.suggestions?.slice(0, MAX_BRIEF_EDHREC_SUGGESTIONS);
  return {
    input: result.input,
    templateId: result.templateId,
    bracketId: result.bracketId,
    bracketLabel: result.bracketLabel,
    summary: result.summary,
    converged: result.converged,
    remainingGaps: result.remainingGaps,
    qualityGate: result.qualityGate,
    nextSuggestedAction: result.nextSuggestedAction,
    agentBrief: result.agentBrief,
    decklistText: result.decklistText,
    buildQualityReport: result.buildQualityReport,
    suggestedUpgrades: result.suggestedUpgrades?.slice(0, 5),
    notes: result.notes.slice(0, MAX_BRIEF_NOTES),
    deck: {
      commanderName: result.deck.commanderName,
      cards: result.deck.cards.map((c) => ({ name: c.name, quantity: c.quantity })),
    },
    edhrecContext: result.edhrecContext
      ? {
          ...result.edhrecContext,
          suggestions: suggestions ?? [],
        }
      : undefined,
    analysis: toBriefAnalyzeResult({
      input: {
        templateId: result.templateId,
        bracketId: result.bracketId,
        preferredStrategy: result.input.preferredStrategy,
      },
      analysis: result.analysis,
      parsedDeck: { cards: [], commanderName: result.deck.commanderName },
      decklistText: result.decklistText,
      summary: result.summary,
      converged: result.converged,
      remainingGaps: result.remainingGaps,
      qualityGate: result.qualityGate,
      nextSuggestedAction: result.nextSuggestedAction,
      agentBrief: result.agentBrief,
    }).analysis as BuildDeckResult['analysis'],
  };
}

/** Token-efficient optimize_deck payload. */
export function toBriefOptimizeResult(result: OptimizeDeckResult): OptimizeDeckResult {
  return {
    input: result.input,
    deckText: result.decklistText,
    decklistText: result.decklistText,
    changes: result.changes,
    metricsBefore: result.metricsBefore,
    metricsAfter: result.metricsAfter,
    iterationNotes: result.iterationNotes.slice(0, MAX_BRIEF_NOTES),
    summary: result.summary,
    converged: result.converged,
    remainingGaps: result.remainingGaps,
    qualityGate: result.qualityGate,
    nextSuggestedAction: result.nextSuggestedAction,
    agentBrief: result.agentBrief,
    analysis: toBriefAnalyzeResult({
      input: {
        templateId: result.input.templateId,
        bracketId: result.input.bracketId,
        preferredStrategy: result.input.preferredStrategy,
      },
      analysis: result.analysis,
      parsedDeck: { cards: [], commanderName: result.input.commanderName },
      decklistText: result.decklistText,
    }).analysis as OptimizeDeckResult['analysis'],
  };
}

const MAX_ORACLE_PREVIEW = 120;
const MAX_SYNERGY_EXAMPLES = 5;

/** Slim search_cards / get_category_candidates payloads for LLM agents. */
export function toBriefCardSearchResult(result: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(result.cards)) return result;
  return {
    ...result,
    cards: (result.cards as Array<Record<string, unknown>>).map((c) => {
      const oracle = typeof c.oracleText === 'string' ? c.oracleText : '';
      const { oracleText: _omit, ...rest } = c;
      return {
        ...rest,
        ...(oracle ? { oracleTextPreview: oracle.slice(0, MAX_ORACLE_PREVIEW) } : {}),
      };
    }),
  };
}

/** Slim get_synergies payloads. */
export function toBriefSynergiesResult(result: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(result.synergies)) return result;
  return {
    ...result,
    synergies: (result.synergies as Array<Record<string, unknown>>).map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      recommendedStrategy: s.recommendedStrategy,
      exampleCards: Array.isArray(s.exampleCards)
        ? (s.exampleCards as string[]).slice(0, MAX_SYNERGY_EXAMPLES)
        : s.exampleCards,
    })),
  };
}

/** Omit long guide markdown unless summaryOnly already cleared it. */
export function toBriefStrategyGuideResult(result: Record<string, unknown>): Record<string, unknown> {
  if (!('guideMarkdown' in result)) return result;
  return { ...result, guideMarkdown: '' };
}

export function formatAuxiliaryMcpJson(result: unknown, mode: McpResponseMode = 'brief'): string {
  if (mode === 'full') {
    return JSON.stringify(result, null, 2);
  }
  if (!result || typeof result !== 'object') {
    return JSON.stringify(result);
  }
  const r = result as Record<string, unknown>;
  let payload: Record<string, unknown> = r;
  if (Array.isArray(r.cards) && 'databaseReady' in r) {
    payload = toBriefCardSearchResult(r);
  } else if (Array.isArray(r.candidates) && 'category' in r) {
    payload = r;
  } else if (Array.isArray(r.synergies)) {
    payload = toBriefSynergiesResult(r);
  } else if ('guideMarkdown' in r && 'preferredStrategy' in r) {
    payload = toBriefStrategyGuideResult(r);
  }
  return JSON.stringify(payload);
}

export function formatMcpToolJson(result: unknown, mode: McpResponseMode = 'brief'): string {
  let payload = result;
  if (mode === 'brief' && result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if ('parsedDeck' in r && 'analysis' in r && !('deck' in r)) {
      payload = toBriefAnalyzeResult(result as AnalyzeDeckResult);
    } else if ('deck' in r && 'analysis' in r) {
      payload = toBriefBuildResult(result as BuildDeckResult);
    } else if ('changes' in r && 'metricsBefore' in r) {
      payload = toBriefOptimizeResult(result as OptimizeDeckResult);
    }
  }
  return mode === 'full'
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
}
