/**
 * Commander format constants and validation helpers (99-card mainboard + color identity).
 */

import { getCardByName, fitsColorIdentity, getColorIdentity, type OracleCard } from './scryfall';
import type { ParsedCardEntry } from './types';
import type { BuiltCardEntry } from './types';

/** Mainboard size excluding the commander. */
export const COMMANDER_MAINBOARD_SIZE = 99;

/** Total deck including commander. */
export const COMMANDER_DECK_TOTAL = 100;

/**
 * Whether a card's color identity is legal in the given commander identity.
 */
export function cardFitsCommanderColorIdentity(
  card: OracleCard | null,
  commanderColorIdentity: string[]
): boolean {
  if (!card) return false;
  return fitsColorIdentity(card, commanderColorIdentity);
}

/**
 * List mainboard cards that violate commander color identity.
 */
export function findColorIdentityViolations(
  cards: ParsedCardEntry[],
  commanderColorIdentity: string[]
): string[] {
  const violations: string[] = [];
  const allowed = commanderColorIdentity.map((c) => c.toUpperCase());

  for (const entry of cards) {
    const card = getCardByName(entry.name);
    if (!card) continue;
    if (!fitsColorIdentity(card, commanderColorIdentity)) {
      const cardCi = getColorIdentity(card).join('') || 'C';
      const cmdCi = allowed.length ? allowed.join('') : 'C';
      violations.push(`${entry.name} (identity ${cardCi} outside commander ${cmdCi})`);
    }
  }
  return violations;
}

/**
 * Trim or pad mainboard to exactly `target` cards (sum of quantities).
 * Trims from the end of the list; pads with basic lands when under target.
 */
export function enforceMainboardSize(
  cards: BuiltCardEntry[],
  target: number = COMMANDER_MAINBOARD_SIZE,
  colorIdentity: string[] = []
): { cards: BuiltCardEntry[]; trimmed: number; padded: number } {
  let total = cards.reduce((s, c) => s + c.quantity, 0);
  const out = cards.map((c) => ({ ...c }));

  if (total > target) {
    let trimmed = 0;
    while (total > target && out.length > 0) {
      const last = out[out.length - 1];
      if (last.quantity > 1) {
        last.quantity--;
      } else {
        out.pop();
      }
      total--;
      trimmed++;
    }
    return { cards: out, trimmed, padded: 0 };
  }

  if (total < target) {
    const need = target - total;
    const colorToBasic: Record<string, string> = {
      W: 'Plains',
      U: 'Island',
      B: 'Swamp',
      R: 'Mountain',
      G: 'Forest',
    };
    const basics =
      colorIdentity.length > 0
        ? colorIdentity.map((c) => colorToBasic[c.toUpperCase()]).filter(Boolean)
        : ['Wastes'];
    let added = 0;
    let i = 0;
    while (added < need) {
      const basicName = basics[i % basics.length]!;
      const existing = out.find((c) => c.name.toLowerCase() === basicName.toLowerCase());
      if (existing) {
        existing.quantity += 1;
      } else {
        out.push({ name: basicName, quantity: 1, roles: ['land'] });
      }
      added++;
      i++;
    }
    return { cards: out, trimmed: 0, padded: need };
  }

  return { cards: out, trimmed: 0, padded: 0 };
}

const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
]);

export function isBasicLandName(name: string): boolean {
  return BASIC_LAND_NAMES.has(name.trim().toLowerCase());
}

export interface SingletonViolation {
  name: string;
  quantity: number;
}

/**
 * Detect non-basic duplicate names (singleton violations).
 */
export function findSingletonViolations(cards: ParsedCardEntry[]): SingletonViolation[] {
  const counts = new Map<string, { displayName: string; quantity: number }>();
  for (const entry of cards) {
    const key = entry.name.trim().toLowerCase();
    if (isBasicLandName(entry.name)) continue;
    const prev = counts.get(key);
    if (prev) {
      prev.quantity += entry.quantity;
    } else {
      counts.set(key, { displayName: entry.name, quantity: entry.quantity });
    }
  }
  const violations: SingletonViolation[] = [];
  for (const { displayName, quantity } of counts.values()) {
    if (quantity > 1) {
      violations.push({ name: displayName, quantity });
    }
  }
  return violations.sort((a, b) => a.name.localeCompare(b.name));
}

export interface IllegalCardEntry {
  name: string;
  reason: string;
}

/**
 * Cards not legal in Commander per Scryfall/DB legalities.
 */
export function findIllegalCards(cards: ParsedCardEntry[]): IllegalCardEntry[] {
  const illegal: IllegalCardEntry[] = [];
  for (const entry of cards) {
    const card = getCardByName(entry.name);
    if (!card) continue;
    const status = card.legalities?.commander;
    if (status === 'legal' || status === 'restricted') continue;
    if (status === 'not_legal' || status === 'banned') {
      illegal.push({ name: entry.name, reason: `commander: ${status}` });
    } else if (!status) {
      illegal.push({ name: entry.name, reason: 'commander legality unknown' });
    }
  }
  return illegal;
}
