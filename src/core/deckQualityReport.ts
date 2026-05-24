/**
 * Composite deck quality metrics for analyze_deck output.
 */

import type {
  CategorySummary,
  CurveAnalysisSummary,
  DeckAnalysis,
  DeckQualityReport,
  LintIssue,
  LintReport,
  ManaBaseQualitySummary,
  PrioritizedAction,
} from './types';

function categoryCoverageScore(categories: CategorySummary[]): number {
  const withBounds = categories.filter((c) => c.min != null || c.max != null);
  if (withBounds.length === 0) return 50;
  let within = 0;
  for (const c of withBounds) {
    if (c.status === 'within') within++;
  }
  return Math.round((within / withBounds.length) * 100);
}

function lintHealthScore(lintReport?: LintReport): number {
  if (!lintReport) return 70;
  const hard = lintReport.issues.filter((i) => i.severity === 'hard').length;
  const soft = lintReport.issues.filter((i) => i.severity === 'soft').length;
  if (hard > 0) return Math.max(0, 40 - hard * 12);
  if (!lintReport.ok) return Math.max(50, 85 - soft * 5);
  return soft > 0 ? Math.max(75, 95 - soft * 3) : 100;
}

function buildManaBaseQuality(lintReport?: LintReport): ManaBaseQualitySummary | undefined {
  const m = lintReport?.metrics;
  if (!m || m.land_count == null) return undefined;

  const landCount = m.land_count as number;
  const tappedAlways = (m.tapped_lands_always as number) ?? 0;
  const tappedConditional = (m.tapped_lands_conditional as number) ?? 0;
  const landMix = (m.land_mix as Record<string, number>) ?? {};

  const manaIssues =
    lintReport?.issues.filter((i) => i.key.startsWith('mana_base:')) ?? [];
  let score = 100;
  for (const issue of manaIssues) {
    score -= issue.severity === 'hard' ? 25 : 10;
  }
  score = Math.max(0, Math.min(100, score));

  const parts: string[] = [`${landCount} lands`];
  const totalTapped = tappedAlways + tappedConditional;
  if (totalTapped > 0) parts.push(`${totalTapped} enter tapped (${tappedAlways} unconditional)`);
  if (landMix.basics != null) parts.push(`${landMix.basics} basics`);

  return {
    score,
    summary: parts.join('; '),
    metrics: { landCount, tappedAlways, tappedConditional, landMix },
  };
}

function buildCurveAnalysis(lintReport?: LintReport): CurveAnalysisSummary | undefined {
  const m = lintReport?.metrics;
  const dist = m?.curve_mv_distribution as Record<string, number> | undefined;
  const avgMv = m?.curve_avg_mv as number | undefined;
  if (!dist || avgMv == null) return undefined;

  const curveIssues = lintReport?.issues.filter((i) => i.key.startsWith('curve:')) ?? [];
  let score = 100;
  for (const issue of curveIssues) {
    score -= issue.severity === 'hard' ? 20 : 8;
  }
  score = Math.max(0, Math.min(100, score));

  const early = (dist['0_1'] ?? 0) + (dist['2'] ?? 0);
  return {
    score,
    summary: `Avg MV ${avgMv.toFixed(2)}; ${early} cards at MV ≤2`,
    averageMv: avgMv,
    distribution: { ...dist },
  };
}

function buildStrengthsAndWeaknesses(
  analysis: Pick<
    DeckAnalysis,
    | 'categories'
    | 'synergyScore'
    | 'banlistValid'
    | 'bracketWarnings'
    | 'lintReport'
    | 'totalCards'
  >,
  manaBase?: ManaBaseQualitySummary,
  curve?: CurveAnalysisSummary
): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (analysis.banlistValid) strengths.push('Passes project banlist.');
  if (analysis.totalCards === 99) strengths.push('Mainboard size is correct (99).');

  const withinCats = analysis.categories.filter((c) => c.status === 'within');
  if (withinCats.length >= 8) {
    strengths.push(`${withinCats.length} template categories within recommended range.`);
  }

  if (analysis.synergyScore != null && analysis.synergyScore >= 70) {
    strengths.push(`Strong synergy score (${analysis.synergyScore}/100).`);
  } else if (analysis.synergyScore != null && analysis.synergyScore >= 55) {
    strengths.push(`Acceptable synergy score (${analysis.synergyScore}/100).`);
  }

  if (manaBase && manaBase.score >= 80) strengths.push(`Mana base: ${manaBase.summary}.`);
  if (curve && curve.score >= 80) strengths.push(`Curve: ${curve.summary}.`);

  const below = analysis.categories.filter((c) => c.status === 'below');
  for (const c of below.slice(0, 4)) {
    weaknesses.push(
      `${c.name}: ${c.count} cards (recommended ${c.min ?? '?'}-${c.max ?? '?'})`
    );
  }

  const above = analysis.categories.filter((c) => c.status === 'above');
  for (const c of above.slice(0, 2)) {
    weaknesses.push(`${c.name} above max (${c.count}/${c.max})`);
  }

  if (analysis.synergyScore != null && analysis.synergyScore < 55) {
    weaknesses.push(`Low synergy score (${analysis.synergyScore}/100).`);
  }

  const hardLint =
    analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
  if (hardLint.length > 0) {
    weaknesses.push(`${hardLint.length} hard lint/format issue(s).`);
  }

  if (!analysis.banlistValid) weaknesses.push('Banned cards present.');
  if (analysis.bracketWarnings.length > 0) {
    weaknesses.push(`${analysis.bracketWarnings.length} Bracket 3 warning(s).`);
  }
  if (manaBase && manaBase.score < 65) weaknesses.push(`Mana base needs work (${manaBase.summary}).`);
  if (curve && curve.score < 65) weaknesses.push(`Curve needs work (${curve.summary}).`);

  if (strengths.length === 0) strengths.push('Deck is analyzable; review weaknesses for next steps.');
  if (weaknesses.length === 0) weaknesses.push('No major deficits detected; optional polish only.');

  return { strengths, weaknesses };
}

function buildPrioritizedActions(
  analysis: Pick<
    DeckAnalysis,
    'categories' | 'recommendations' | 'bracketWarnings' | 'banlistValid' | 'lintReport' | 'synergyScore'
  >,
  preferredStrategy?: string
): PrioritizedAction[] {
  const actions: PrioritizedAction[] = [];
  let priority = 1;
  const push = (
    detail: string,
    action: PrioritizedAction['action'] = 'fix',
    category?: string,
    extra?: Partial<Pick<PrioritizedAction, 'suggestedSearch' | 'suggestedCard'>>
  ) => {
    actions.push({
      priority: priority++,
      action,
      category,
      detail,
      suggestedSearch:
        extra?.suggestedSearch ??
        (category ? { category, preferredStrategy } : undefined),
      suggestedCard: extra?.suggestedCard,
    });
  };

  const hardIssues: LintIssue[] =
    analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
  for (const issue of hardIssues.slice(0, 2)) {
    push(`Fix format/lint: ${issue.message}`, 'fix');
  }

  if (!analysis.banlistValid) {
    push('Remove all banlisted cards.', 'cut');
  }

  const below = [...analysis.categories]
    .filter((c) => c.status === 'below' && c.min != null)
    .sort((a, b) => (b.min! - b.count) - (a.min! - a.count));

  for (const c of below.slice(0, 3)) {
    const need = c.min! - c.count;
    push(
      `Add ${need} card(s) to ${c.name} (search_cards with category="${c.name}"${preferredStrategy ? `, preferredStrategy="${preferredStrategy}"` : ''}).`,
      'search',
      c.name
    );
  }

  for (const w of analysis.bracketWarnings.slice(0, 2)) {
    push(`Bracket 3: ${w}`, 'fix');
  }

  const add = analysis.recommendations?.adds?.[0];
  if (add && !add.name.startsWith('(') && actions.length < 5) {
    push(`Consider adding ${add.name}: ${add.reason}`, 'add', add.category);
  }

  const cut = analysis.recommendations?.cuts?.[0];
  if (cut && actions.length < 5) {
    push(`Consider cutting ${cut.name}: ${cut.reason}`, 'cut', cut.category);
  }

  if (
    preferredStrategy &&
    analysis.synergyScore != null &&
    analysis.synergyScore < 60 &&
    actions.length < 5
  ) {
    push(
      `Improve on-theme cards for "${preferredStrategy}" (target synergyScore > 60).`,
      'search'
    );
  }

  const softCurve = analysis.lintReport?.issues.find((i) => i.key.startsWith('curve:'));
  if (softCurve && actions.length < 5) {
    push(`Curve: ${softCurve.message}`, 'fix');
  }

  return actions.slice(0, 5);
}

/**
 * Build P0 quality fields from a completed DeckAnalysis.
 */
export function buildDeckQualityExtensions(
  analysis: DeckAnalysis,
  preferredStrategy?: string
): DeckQualityReport {
  const synergyPart = analysis.synergyScore ?? 50;
  const categoryPart = categoryCoverageScore(analysis.categories);
  const lintPart = lintHealthScore(analysis.lintReport);
  const deckScore = Math.round(synergyPart * 0.4 + categoryPart * 0.4 + lintPart * 0.2);

  const manaBaseQuality = buildManaBaseQuality(analysis.lintReport);
  const curveAnalysis = buildCurveAnalysis(analysis.lintReport);
  const strengthsAndWeaknesses = buildStrengthsAndWeaknesses(
    analysis,
    manaBaseQuality,
    curveAnalysis
  );
  const prioritizedActions = buildPrioritizedActions(analysis, preferredStrategy);

  return {
    deckScore,
    strengthsAndWeaknesses,
    prioritizedActions,
    manaBaseQuality,
    curveAnalysis,
  };
}
