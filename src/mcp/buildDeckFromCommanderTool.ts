/**
 * buildDeckFromCommanderTool.ts
 * 
 * MCP tool wrapper for the deck builder.
 * This will be exposed as an MCP tool for building Commander decks.
 */

import { BuildDeckInput, BuildDeckResult } from '../core/types';
import { buildDeckFromCommander } from '../core/deckBuilder';

/**
 * Runs the build_deck_from_commander tool
 * 
 * @param input - BuildDeckInput with commander name and options
 * @returns BuildDeckResult with built deck and analysis
 * @throws Error if commander cannot be resolved
 * 
 * This is a thin wrapper around the core buildDeckFromCommander function,
 * suitable for exposure as an MCP tool.
 * 
 * @example
 * ```typescript
 * const result = await runBuildDeckFromCommander({
 *   commanderName: "Atraxa, Praetors' Voice",
 *   templateId: "bracket3",
 *   seedCards: ["Sol Ring", "Arcane Signet"]
 * });
 * console.log(result.deck.commanderName); // "Atraxa, Praetors' Voice"
 * ```
 */
export async function runBuildDeckFromCommander(
  input: BuildDeckInput
): Promise<BuildDeckResult> {
  return buildDeckFromCommander(input);
}

