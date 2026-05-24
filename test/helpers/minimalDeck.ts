import { getCardByName } from '../../src/core/scryfall';
import { hasCardsDatabase } from './dbAvailability';

const STAPLES = [
  'Sol Ring',
  'Arcane Signet',
  'Command Tower',
  'Path to Exile',
  'Swords to Plowshares',
  'Counterspell',
  'Brainstorm',
  'Rhystic Study',
  'Smothering Tithe',
  "Teferi's Protection",
] as const;

/**
 * Build a minimal 99-line mainboard using cards known to exist in cards.db.
 * Pads with Islands when staples are missing (CI environments without full import).
 */
export function buildMinimalMainboard(targetSize: number = 99): string[] {
  if (!hasCardsDatabase()) {
    return Array.from({ length: targetSize }, () => '1 Island');
  }

  const lines: string[] = [];
  for (const name of STAPLES) {
    if (lines.length >= targetSize) break;
    if (getCardByName(name)) lines.push(`1 ${name}`);
  }

  while (lines.length < targetSize) {
    lines.push('1 Island');
  }

  return lines.slice(0, targetSize);
}

export function minimalDeckText(size: number = 99): string {
  return buildMinimalMainboard(size).join('\n');
}
