/**
 * MCP tool wrapper for analyze_deck.
 */

import { AnalyzeDeckInput, AnalyzeDeckResult } from '../core/types';
import { parseDeckText } from '../core/deckParser';
import { analyzeDeckBasic } from '../core/analyzer';
import {
  attachAnalyzeConvergence,
  buildAnalyzeSummary,
} from './mcpOutputHelpers';
import { validatePreferredStrategySlug } from '../core/strategyProfiles';

export async function runAnalyzeDeck(
  input: AnalyzeDeckInput
): Promise<AnalyzeDeckResult> {
  const parsedDeck = parseDeckText(input.deckText);
  const result = await analyzeDeckBasic(input, parsedDeck);

  if (input.preferredStrategy?.trim()) {
    const slugCheck = validatePreferredStrategySlug(input.preferredStrategy);
    if (!slugCheck.ok) {
      const sample = (slugCheck.knownSlugs ?? []).slice(0, 10).join(', ');
      result.analysis.notes.push(
        `Unknown preferredStrategy "${input.preferredStrategy}". Known slugs include: ${sample}. Use get_synergies for commander-specific themes.`
      );
    }
  }

  const summary = buildAnalyzeSummary(result);
  return attachAnalyzeConvergence({ ...result, summary });
}
