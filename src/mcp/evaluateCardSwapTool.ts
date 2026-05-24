/**
 * MCP tool: evaluate_card_swap — preview impact of replacing one card with another.
 */

import {
  evaluateCardSwap,
  type EvaluateCardSwapInput,
  type EvaluateCardSwapResult,
} from '../core/cardSwapEvaluator';

export async function runEvaluateCardSwap(
  input: EvaluateCardSwapInput
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
      ? 'Apply swap to deckText and re-run analyze_deck.'
      : 'Try another swap from recommendations.swaps or search_cards.';
  return { ...result, summary, nextSuggestedAction };
}
