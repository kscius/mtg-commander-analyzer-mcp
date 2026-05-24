/**
 * MCP tool: get_synergies — list EDHREC/heuristic synergies for a commander.
 */

import { GetSynergiesInputSchema, type GetSynergiesInput } from '../core/schemas';
import { detectSynergiesForCommander } from '../core/synergyDetector';

export async function runGetSynergies(raw: unknown) {
  const input: GetSynergiesInput = GetSynergiesInputSchema.parse(raw);
  const result = await detectSynergiesForCommander(input.commanderName);
  const slugList = result.synergies.map((s) => s.slug).join(', ');
  return {
    ...result,
    summary: `Found ${result.synergies.length} synergies for ${result.commander.name}: ${slugList}.`,
    nextSuggestedAction: result.recommendedStrategy
      ? `Ask the user to confirm slug "${result.recommendedStrategy}" or pick another, then get_strategy_guide → build_deck_from_commander.`
      : 'Ask the user to pick one synergy slug, then call get_strategy_guide with preferredStrategy.',
  };
}
