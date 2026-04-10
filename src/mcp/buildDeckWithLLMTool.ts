/**
 * buildDeckWithLLMTool.ts
 * 
 * MCP tool wrapper for the LLM-powered deck builder.
 * Uses GPT-4.1 to build complete 99-card Commander decks autonomously.
 * 
 * IMPORTANT: This tool requires OPENAI_API_KEY to be configured in .env file.
 */

import { BuildDeckInput, BuildDeckResult } from '../core/types';
import { buildDeckWithLLM } from '../core/llmDeckBuilder';

/**
 * Runs the build_deck_with_llm tool
 * 
 * @param input - BuildDeckInput with commander name and options
 * @returns BuildDeckResult with complete 99-card deck and analysis
 * @throws Error if OpenAI API key is not configured or API call fails
 * 
 * This tool builds a COMPLETE deck using GPT-4.1:
 * - Fetches EDHREC suggestions for card recommendations
 * - Enforces the custom banlist (data/Banlist.txt)
 * - Respects Bracket 3 power level
 * - Validates 100-card count, color identity, and singleton rule
 * 
 * @example
 * ```typescript
 * const result = await runBuildDeckWithLLM({
 *   commanderName: "Atraxa, Praetors' Voice"
 * });
 * // Returns complete 99-card deck
 * console.log(result.deck.cards.length); // 99
 * ```
 */
export async function runBuildDeckWithLLM(
  input: BuildDeckInput
): Promise<BuildDeckResult> {
  // Apply defaults
  const inputWithDefaults: BuildDeckInput = {
    templateId: 'bracket3',
    bracketId: 'bracket3',
    banlistId: 'commander',
    useEdhrec: true, // Always use EDHREC for LLM context
    ...input,
  };

  return buildDeckWithLLM(inputWithDefaults);
}

