/**
 * Shared MCP response helpers: summaries, convergence, Zod error formatting.
 */

import type { ZodError } from 'zod';
import type {
  AgentBrief,
  AnalyzeDeckResult,
  BuildDeckResult,
  DeckAnalysis,
  OptimizeDeckResult,
  QualityGate,
  RemainingGap,
} from '../core/types';
import { COMMANDER_MAINBOARD_SIZE } from '../core/commanderFormat';
import { analysisHasAutomatableGaps } from '../core/edhrecAutofill';

/** Format Zod validation errors for MCP clients. */
export function formatZodValidationError(error: ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
  return `Invalid tool arguments:\n${lines.join('\n')}`;
}

export function buildAnalyzeSummary(result: AnalyzeDeckResult): string {
  const a = result.analysis;
  const parts: string[] = [];
  parts.push(
    `Mainboard ${a.totalCards}/${COMMANDER_MAINBOARD_SIZE} cards` +
      (a.commanderName ? `; commander ${a.commanderName}` : '')
  );
  if (a.deckScore != null) parts.push(`deck score ${a.deckScore}/100`);
  if (a.synergyScore != null) parts.push(`synergy ${a.synergyScore}/100`);
  const below = a.categories.filter((c) => c.status === 'below');
  if (below.length) {
    parts.push(
      `${below.length} categor${below.length === 1 ? 'y' : 'ies'} below minimum (${below.map((c) => c.name).join(', ')})`
    );
  }
  const hardLint = a.lintReport?.issues.filter((i) => i.severity === 'hard').length ?? 0;
  if (hardLint) parts.push(`${hardLint} hard lint issue(s)`);
  if (!a.banlistValid) parts.push('banlist violation');
  if (a.bracketWarnings.length) parts.push(`${a.bracketWarnings.length} bracket warning(s)`);
  if (a.unresolvedCardNames?.length) {
    parts.push(
      `${a.unresolvedCardNames.length} unresolved card name(s) (${a.unresolvedCardNames.slice(0, 3).join(', ')}${a.unresolvedCardNames.length > 3 ? ', …' : ''})`
    );
  }
  return parts.join('; ') + '.';
}

/**
 * Synergy score target for optimize_deck convergence and qualityGate.
 * When a strategy slug is set, defaults to 60 (AGENTS.md quality checklist) unless stopWhenScore overrides.
 */
export function resolveOptimizeSynergyTarget(options: {
  preferredStrategy?: string;
  stopWhenScore?: number;
}): number | undefined {
  if (options.preferredStrategy?.trim()) {
    return options.stopWhenScore ?? 60;
  }
  return options.stopWhenScore;
}

export function computeRemainingGaps(
  analysis: DeckAnalysis,
  options?: { focusCategories?: string[]; synergyTarget?: number }
): RemainingGap[] {
  const gaps: RemainingGap[] = [];
  const focus = options?.focusCategories?.map((c) => c.toLowerCase());

  for (const cat of analysis.categories) {
    if (cat.status !== 'below') continue;
    if (focus?.length && !focus.includes(cat.name.toLowerCase())) continue;
    gaps.push({
      kind: 'category',
      category: cat.name,
      detail: `${cat.name} below minimum (${cat.count}/${cat.min ?? '?'})`,
    });
  }

  for (const issue of analysis.lintReport?.issues ?? []) {
    gaps.push({
      kind: 'lint',
      severity: issue.severity,
      detail: issue.message,
    });
  }

  for (const w of analysis.bracketWarnings) {
    gaps.push({ kind: 'bracket', detail: w });
  }

  if (!analysis.banlistValid) {
    gaps.push({
      kind: 'banlist',
      detail: `Banned cards: ${analysis.bannedCards.map((b) => b.name).join(', ') || 'see analysis'}`,
    });
  }

  if (analysis.totalCards !== COMMANDER_MAINBOARD_SIZE) {
    gaps.push({
      kind: 'format',
      detail: `Mainboard has ${analysis.totalCards} cards (expected ${COMMANDER_MAINBOARD_SIZE})`,
    });
  }

  if (analysis.unresolvedCardNames?.length) {
    gaps.push({
      kind: 'unresolved',
      detail: `Unresolved card names (not in cards.db): ${analysis.unresolvedCardNames.join(', ')}`,
    });
  }

  const target = options?.synergyTarget;
  if (
    target != null &&
    analysis.synergyScore != null &&
    analysis.synergyScore < target
  ) {
    gaps.push({
      kind: 'synergy',
      detail: `Synergy ${analysis.synergyScore}/100 below target ${target}`,
    });
  }

  return gaps;
}

export function isDeckConverged(
  analysis: DeckAnalysis,
  options?: {
    focusCategories?: string[];
    synergyTarget?: number;
  }
): boolean {
  const gaps = computeRemainingGaps(analysis, {
    focusCategories: options?.focusCategories,
    synergyTarget: options?.synergyTarget,
  });

  const blocking = gaps.filter((g) => g.kind !== 'lint' || g.severity === 'hard');
  if (blocking.length > 0) return false;

  return !analysisHasAutomatableGaps(analysis);
}

export function buildNextSuggestedAction(
  analysis: DeckAnalysis,
  toolHint: 'analyze_deck' | 'optimize_deck' | 'search_cards' | 'build_deck_from_commander',
  options?: { synergyTarget?: number }
): string {
  const hardLint = analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
  if (hardLint.length) {
    const first = hardLint[0];
    return `Fix hard lint (${first.key}): ${first.message}. Re-run ${toolHint}.`;
  }
  if (analysis.unresolvedCardNames?.length) {
    const names = analysis.unresolvedCardNames.slice(0, 3).join(', ');
    const suffix =
      analysis.unresolvedCardNames.length > 3
        ? ` (+${analysis.unresolvedCardNames.length - 3} more)`
        : '';
    return `Resolve unresolved card names via resolve_card or search_cards: ${names}${suffix}. Then re-run ${toolHint}.`;
  }
  if (!analysis.banlistValid) {
    return 'Remove banned cards, then re-run analyze_deck.';
  }
  if (analysis.totalCards !== COMMANDER_MAINBOARD_SIZE) {
    return `Adjust mainboard to ${COMMANDER_MAINBOARD_SIZE} cards, then analyze_deck.`;
  }
  const below = analysis.categories.filter((c) => c.status === 'below');
  if (below.length) {
    const cat = below[0];
    return `Category ${cat.name} is below min (${cat.count}/${cat.min}). Run optimize_deck or search_cards with category="${cat.name}".`;
  }
  if (analysis.bracketWarnings.length) {
    return `Address Bracket 3 warnings (${analysis.bracketWarnings[0]}).`;
  }
  const synergyTarget = options?.synergyTarget;
  if (
    synergyTarget != null &&
    analysis.synergyScore != null &&
    analysis.synergyScore < synergyTarget
  ) {
    return `Synergy ${analysis.synergyScore}/100 below target ${synergyTarget} — review analysis.prioritizedActions or run optimize_deck.`;
  }
  return 'Deck looks healthy. Use evaluate_card_swap for single changes.';
}

export function buildAgentBriefFromAnalysis(
  analysis: DeckAnalysis,
  options: {
    summary: string;
    decklistText?: string;
    converged?: boolean;
    readyToShip?: boolean;
    remainingGaps?: RemainingGap[];
    focusCategories?: string[];
    polishGapCount?: number;
    nextSuggestedAction?: string;
    buildQualityOverall?: AgentBrief['buildQualityOverall'];
  }
): AgentBrief {
  const focus = options.focusCategories?.map((c) => c.toLowerCase());
  const below = analysis.categories
    .filter((c) => c.status === 'below')
    .filter((c) => !focus?.length || focus.includes(c.name.toLowerCase()))
    .map((c) => c.name);
  const blockingCount = options.remainingGaps?.length ?? 0;
  const polishCount = options.polishGapCount ?? 0;
  return {
    summary: options.summary,
    commanderName: analysis.commanderName,
    decklistText: options.decklistText,
    converged: options.converged,
    readyToShip: options.readyToShip,
    synergyScore: analysis.synergyScore,
    categoriesBelow: below.length ? below : undefined,
    remainingGapCount: blockingCount > 0 ? blockingCount : undefined,
    polishGapCount: polishCount > 0 ? polishCount : undefined,
    nextSuggestedAction: options.nextSuggestedAction,
    buildQualityOverall: options.buildQualityOverall,
  };
}

export function buildQualityGate(
  analysis: DeckAnalysis,
  options?: { focusCategories?: string[]; synergyTarget?: number }
): QualityGate {
  const allGaps = computeRemainingGaps(analysis, options);
  const blocking = allGaps.filter((g) => g.kind !== 'lint' || g.severity === 'hard');
  const polish = allGaps.filter((g) => g.kind === 'lint' && g.severity === 'soft');
  const converged = isDeckConverged(analysis, options);
  const readyToShip = blocking.length === 0 && converged;
  return { readyToShip, converged, blocking, polish };
}

export function attachAnalyzeConvergence(
  result: AnalyzeDeckResult,
  synergyTargetOverride?: number
): AnalyzeDeckResult {
  const synergyTarget =
    synergyTargetOverride ??
    resolveOptimizeSynergyTarget({ preferredStrategy: result.input.preferredStrategy });
  const qualityGate = buildQualityGate(result.analysis, { synergyTarget });
  const remainingGaps = qualityGate.blocking;
  const converged = qualityGate.converged;
  const summary = result.summary ?? buildAnalyzeSummary(result);
  const nextSuggestedAction = converged
    ? 'Deck converged — run deck-quality checklist, then deliver decklistText.'
    : buildNextSuggestedAction(result.analysis, 'analyze_deck', { synergyTarget });
  const agentBrief = buildAgentBriefFromAnalysis(result.analysis, {
    summary,
    decklistText: result.decklistText,
    converged,
    readyToShip: qualityGate.readyToShip,
    remainingGaps,
    polishGapCount: qualityGate.polish.length,
    nextSuggestedAction,
  });
  return {
    ...result,
    summary,
    converged,
    remainingGaps,
    qualityGate,
    nextSuggestedAction,
    agentBrief,
  };
}

export function attachBuildConvergence(
  result: BuildDeckResult,
  synergyTargetOverride?: number
): BuildDeckResult {
  const synergyTarget =
    synergyTargetOverride ??
    resolveOptimizeSynergyTarget({ preferredStrategy: result.input.preferredStrategy });
  const qualityGate = buildQualityGate(result.analysis, { synergyTarget });
  const remainingGaps = qualityGate.blocking;
  const converged = qualityGate.converged;
  const analysisSummary = buildAnalyzeSummary({
    analysis: result.analysis,
    input: { templateId: result.templateId, bracketId: result.bracketId },
    parsedDeck: { cards: [], commanderName: result.deck.commanderName },
  });
  const summary =
    result.summary ??
    `Built ${result.deck.cards.length}-card mainboard for ${result.deck.commanderName}; ${analysisSummary}`;
  const nextSuggestedAction = qualityGate.readyToShip
    ? 'Build complete — run deck-quality checklist, then deliver decklistText.'
    : buildNextSuggestedAction(result.analysis, 'analyze_deck', {
        synergyTarget,
      });
  const agentBrief = buildAgentBriefFromAnalysis(result.analysis, {
    summary,
    decklistText: result.decklistText,
    converged,
    readyToShip: qualityGate.readyToShip,
    remainingGaps,
    polishGapCount: qualityGate.polish.length,
    nextSuggestedAction,
    buildQualityOverall: result.buildQualityReport?.overall,
  });
  return {
    ...result,
    summary,
    converged,
    remainingGaps,
    qualityGate,
    nextSuggestedAction,
    agentBrief,
  };
}

export function attachOptimizeConvergence(
  result: OptimizeDeckResult,
  synergyTarget?: number
): OptimizeDeckResult {
  const gateOptions = {
    focusCategories: result.input.focusCategories,
    synergyTarget,
  };
  const qualityGate = buildQualityGate(result.analysis, gateOptions);
  const remainingGaps = qualityGate.blocking;
  const converged = qualityGate.converged;
  const summary =
    result.summary ??
    `Optimized deck (${result.changes.length} change(s)); ${buildAnalyzeSummary({
      analysis: result.analysis,
      input: result.input,
      parsedDeck: { cards: [], commanderName: result.input.commanderName },
    })}`;
  const nextSuggestedAction = qualityGate.readyToShip
    ? 'Optimization converged — run deck-quality checklist, then deliver decklistText.'
    : buildNextSuggestedAction(result.analysis, 'optimize_deck', { synergyTarget });
  const agentBrief = buildAgentBriefFromAnalysis(result.analysis, {
    summary,
    decklistText: result.decklistText,
    converged,
    readyToShip: qualityGate.readyToShip,
    remainingGaps,
    focusCategories: result.input.focusCategories,
    polishGapCount: qualityGate.polish.length,
    nextSuggestedAction,
  });
  return {
    ...result,
    summary,
    converged,
    remainingGaps,
    qualityGate,
    nextSuggestedAction,
    agentBrief,
  };
}
