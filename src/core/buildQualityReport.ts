/**
 * Post-build quality summary for build_deck_from_commander output.
 */

import type { DeckAnalysis, DeckRecommendations } from './types';

export interface BuildQualityReport {
  overall: 'strong' | 'acceptable' | 'needs_work';
  categoryGaps: Array<{ category: string; count: number; min?: number; deficit: number }>;
  categoryOverflows: Array<{ category: string; count: number; max?: number; excess: number }>;
  bracketIssueCount: number;
  banlistOk: boolean;
  synergyScore?: number;
  compromises: string[];
}

export interface SuggestedUpgrade {
  name: string;
  reason: string;
  category?: string;
  priority: number;
}

export function buildBuildQualityReport(analysis: DeckAnalysis): BuildQualityReport {
  const categoryGaps = analysis.categories
    .filter((c) => c.status === 'below' && c.min != null)
    .map((c) => ({
      category: c.name,
      count: c.count,
      min: c.min,
      deficit: (c.min ?? 0) - c.count,
    }));

  const categoryOverflows = analysis.categories
    .filter((c) => c.status === 'above' && c.max != null)
    .map((c) => ({
      category: c.name,
      count: c.count,
      max: c.max,
      excess: c.count - (c.max ?? 0),
    }));

  const bracketIssueCount = analysis.bracketWarnings.length;
  const banlistOk = analysis.banlistValid;
  const synergy = analysis.synergyScore;

  const compromises: string[] = [];
  if (categoryGaps.length) {
    compromises.push(`Under-filled categories: ${categoryGaps.map((g) => g.category).join(', ')}`);
  }
  if (categoryOverflows.length) {
    compromises.push(`Over-filled categories: ${categoryOverflows.map((o) => o.category).join(', ')}`);
  }
  if (bracketIssueCount) {
    compromises.push(`${bracketIssueCount} Bracket 3 warning(s) remain`);
  }
  if (analysis.lintReport && !analysis.lintReport.ok) {
    compromises.push('Template lint has hard issues');
  }

  let overall: BuildQualityReport['overall'] = 'strong';
  if (!banlistOk || bracketIssueCount > 2 || categoryGaps.length >= 3) {
    overall = 'needs_work';
  } else if (categoryGaps.length > 0 || bracketIssueCount > 0 || (synergy != null && synergy < 55)) {
    overall = 'acceptable';
  }

  return {
    overall,
    categoryGaps,
    categoryOverflows,
    bracketIssueCount,
    banlistOk,
    synergyScore: synergy,
    compromises,
  };
}

export function buildSuggestedUpgrades(
  analysis: DeckAnalysis,
  recommendations?: DeckRecommendations
): SuggestedUpgrade[] {
  const upgrades: SuggestedUpgrade[] = [];
  let priority = 1;

  for (const add of recommendations?.adds ?? []) {
    if (add.name.startsWith('(use search_cards)')) continue;
    upgrades.push({
      name: add.name,
      reason: add.reason,
      category: add.category,
      priority: priority++,
    });
    if (upgrades.length >= 10) break;
  }

  for (const swap of recommendations?.swaps ?? []) {
    if (upgrades.length >= 10) break;
    if (swap.add.startsWith('(use search_cards)')) continue;
    upgrades.push({
      name: swap.add,
      reason: swap.reason,
      category: swap.category,
      priority: priority++,
    });
  }

  if (upgrades.length < 5) {
    for (const cat of analysis.categories.filter((c) => c.status === 'below')) {
      upgrades.push({
        name: '(use search_cards)',
        reason: `Still below min for ${cat.name} (${cat.count}/${cat.min}).`,
        category: cat.name,
        priority: priority++,
      });
      if (upgrades.length >= 8) break;
    }
  }

  return upgrades.slice(0, 10);
}
