/**
 * analyzeDeckTool.ts
 * 
 * MCP tool wrapper for the analyze_deck functionality.
 * This is not yet a full MCP server integration - it's a plain async function
 * that will later be wrapped with proper MCP protocol handlers.
 * 
 * Future: Will integrate with @modelcontextprotocol/sdk for full MCP server.
 */

import { AnalyzeDeckInput, AnalyzeDeckResult } from '../core/types';
import { parseDeckText } from '../core/deckParser';
import { analyzeDeckBasic } from '../core/analyzer';

/**
 * Runs the analyze_deck tool with the given input
 * 
 * This function orchestrates the deck analysis workflow:
 * 1. Parse the deck text into structured format
 * 2. Analyze the parsed deck
 * 3. Return the complete result
 * 
 * @param input - AnalyzeDeckInput with deck text and options
 * @returns Promise<AnalyzeDeckResult> with complete analysis
 * 
 * @example
 * ```typescript
 * const input: AnalyzeDeckInput = {
 *   deckText: "1 Sol Ring\n1 Command Tower",
 *   templateId: "default",
 *   banlistId: "commander"
 * };
 * const result = await runAnalyzeDeck(input);
 * console.log(result.analysis.totalCards); // 2
 * ```
 */
export async function runAnalyzeDeck(
  input: AnalyzeDeckInput
): Promise<AnalyzeDeckResult> {
  // Step 1: Parse the deck text
  const parsedDeck = parseDeckText(input.deckText);

  // Step 2: Analyze the parsed deck
  const result = analyzeDeckBasic(input, parsedDeck);

  // Step 3: Return the result (currently synchronous, but async for future expansion)
  return result;
}

