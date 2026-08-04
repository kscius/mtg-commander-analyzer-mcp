/**
 * MCP tool: apply_deck_changes — apply cut/add swaps without re-pasting deckText.
 */

import { applyDeckSwaps, type ApplyDeckSwapsResult } from '../core/deckMutations';
import type { ApplyDeckChangesInput } from '../core/schemas';

export type ApplyDeckChangesResult = ApplyDeckSwapsResult & {
  summary?: string;
  nextSuggestedAction?: string;
};

export async function runApplyDeckChanges(
  input: ApplyDeckChangesInput
): Promise<ApplyDeckChangesResult> {
  const result = applyDeckSwaps(input.deckText, input.swaps, {
    commanderName: input.commanderName,
  });

  const appliedPart = `Applied ${result.applied.length} swap(s)`;
  const skippedPart =
    result.skipped.length > 0
      ? `; ${result.skipped.length} skipped (${result.skipped[0]!.reason})`
      : '';
  const summary =
    result.errors.length > 0
      ? `${appliedPart}${skippedPart}; ${result.errors.join(' ')}`
      : `${appliedPart}${skippedPart}; mainboard ${result.totalCards} cards.`;

  const nextSuggestedAction =
    result.errors.length > 0 || result.skipped.length > 0
      ? 'Fix skipped swaps or errors, then analyze_deck with the updated decklistText.'
      : 'Run analyze_deck on decklistText to verify qualityGate before delivery.';

  return {
    ...result,
    summary,
    nextSuggestedAction,
  };
}
