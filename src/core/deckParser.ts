/**
 * deckParser.ts
 * 
 * Parses plain-text decklists into structured format.
 * Current implementation: simple line-by-line parsing of "<quantity> <card name>" format.
 * Future: detect commanders, handle different formats (MTGO, Arena, etc.)
 */

import { ParsedCardEntry, ParsedDeck } from './types';

/**
 * Parses a plain-text decklist into structured format
 * 
 * @param deckText - Raw decklist text, one card per line
 * @returns ParsedDeck object with structured card data
 * 
 * Parsing rules:
 * - Each line should be: "<integer> <card name>"
 * - Blank lines are ignored
 * - Lines that don't match the pattern are skipped
 * - Commander detection is not yet implemented
 * 
 * @example
 * ```typescript
 * const text = "1 Sol Ring\n2 Island\n1 Counterspell";
 * const deck = parseDeckText(text);
 * // deck.cards.length === 3
 * ```
 */
export function parseDeckText(deckText: string): ParsedDeck {
  const cards: ParsedCardEntry[] = [];
  const lines = deckText.split('\n');

  // Regex to capture: <quantity> <card name>
  // Example: "1 Sol Ring", "2 Island", "10 Forest"
  const cardPattern = /^\s*(\d+)\s+(.+?)\s*$/;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      continue;
    }

    const match = cardPattern.exec(trimmedLine);
    if (match) {
      const quantity = parseInt(match[1], 10);
      const name = match[2].trim();

      cards.push({
        rawLine: line,
        quantity,
        name
      });
    }
    // Lines that don't match are silently ignored
    // (could be comments, sections, etc.)
  }

  return {
    cards,
    commanderName: null // Commander detection not yet implemented
  };
}

