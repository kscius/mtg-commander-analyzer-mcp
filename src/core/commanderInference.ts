/**
 * Infer commander from mainboard when deckText lacks a Commander: line.
 */

import { getCardByName, canBeCommander } from './scryfall';

export interface CommanderInferenceResult {
  commanderName: string | null;
  candidates: string[];
}

/**
 * Scan mainboard entries for commander-eligible cards (legendary creature / "can be your commander").
 * Returns the first match in deck order plus all candidates for agent disambiguation.
 */
export function inferCommanderFromDeckEntries(
  entries: Array<{ name: string }>
): CommanderInferenceResult {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const trimmed = entry.name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const card = getCardByName(trimmed);
    if (card && canBeCommander(card)) {
      candidates.push(card.name);
    }
  }

  return {
    commanderName: candidates[0] ?? null,
    candidates,
  };
}
