/**
 * Plain-text decklist formatting for export and MCP analysis.
 * Basic lands (including Snow-Covered basics) are grouped: `19 Island` instead of 19× `1 Island`.
 */

import type { BuiltCardEntry } from './types';

const BASIC_LAND_EXACT = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
]);

/**
 * True if the card name is a basic land type (including Snow-Covered basics).
 */
export function isBasicLandName(name: string): boolean {
  if (BASIC_LAND_EXACT.has(name)) return true;
  if (name.startsWith('Snow-Covered ')) return true;
  return false;
}

/**
 * Preferred sort order for aggregated basic land lines (WUBRG, then Wastes, then others).
 */
const BASIC_NAME_ORDER: string[] = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
];

/**
 * Builds decklist text: non-basic cards as `1 Name` (one line per copy); basic lands as `N Name`.
 * Non-basics keep the order of `cards`; basics are appended in a stable order.
 */
export function formatDecklistText(cards: BuiltCardEntry[]): string {
  const basicCounts = new Map<string, number>();
  const nonBasicLines: string[] = [];

  for (const e of cards) {
    if (isBasicLandName(e.name)) {
      basicCounts.set(e.name, (basicCounts.get(e.name) ?? 0) + e.quantity);
      continue;
    }
    for (let i = 0; i < e.quantity; i++) {
      nonBasicLines.push(`1 ${e.name}`);
    }
  }

  const basicLines: string[] = [];
  const used = new Set<string>();

  for (const n of BASIC_NAME_ORDER) {
    const c = basicCounts.get(n);
    if (c != null && c > 0) {
      basicLines.push(`${c} ${n}`);
      used.add(n);
    }
  }

  const remaining = [...basicCounts.entries()]
    .filter(([n]) => !used.has(n))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [n, c] of remaining) {
    if (c > 0) {
      basicLines.push(`${c} ${n}`);
    }
  }

  return [...nonBasicLines, ...basicLines].join('\n');
}
