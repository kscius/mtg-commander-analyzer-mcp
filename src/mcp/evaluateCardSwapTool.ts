/**
 * MCP tool: evaluate_card_swap — preview impact of replacing one card with another.
 */

import {
  evaluateCardSwap,
  type EvaluateCardSwapResult,
} from '../core/cardSwapEvaluator';
import type { EvaluateCardSwapInput as EvaluateCardSwapMcpInput } from '../core/schemas';

/** Handler input after server strips `responseMode`. */
export type EvaluateCardSwapToolInput = Omit<EvaluateCardSwapMcpInput, 'responseMode'>;

export async function runEvaluateCardSwap(
  input: EvaluateCardSwapToolInput
): Promise<
  EvaluateCardSwapResult & { summary: string; nextSuggestedAction: string }
> {
  const result = await evaluateCardSwap(input);
  const delta =
    result.synergyScoreDelta != null
      ? ` (synergy ${result.synergyScoreDelta >= 0 ? '+' : ''}${result.synergyScoreDelta})`
      : '';
  const summary = `${result.recommendation === 'proceed' ? 'Proceed' : 'Skip'}: ${result.resolvedCards.removed} → ${result.resolvedCards.added}${delta}. ${result.reason}`;
  const nextSuggestedAction =
    result.recommendation === 'proceed'
      ? 'Apply via apply_deck_changes with this remove/add pair, then re-run analyze_deck.'
      : 'Try another swap from analysis.prioritizedActions, get_category_candidates, or search_cards.';
  return { ...result, summary, nextSuggestedAction };
}
