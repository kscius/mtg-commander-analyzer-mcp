/**
 * bracket3Validation.ts
 *
 * Bracket 3 policy validation: Game Changers, extra turns, MLD, no chaining, no 2-card combos before T6.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComboDef } from './types';

/** Card with optional tags (from DB or computed) */
export interface CardWithTags {
  name: string;
  tags?: string[];
}

/** Policies from template or bracket-rules */
export interface Bracket3Policies {
  max_game_changers?: number;
  max_extra_turn_cards?: number;
  ban_mass_land_denial?: boolean;
  ban_extra_turn_chains?: boolean;
  ban_2card_gameenders_before_turn?: number;
}

export type BracketViolationSeverity = 'error' | 'warning';

export interface BracketViolation {
  severity: BracketViolationSeverity;
  message: string;
  policy?: string;
  cards?: string[];
}

export interface ValidateBracket3Result {
  counts: Record<string, number>;
  violations: BracketViolation[];
  /** Error messages (English) for backward compatibility */
  errors: string[];
  /** Warning messages (English) for backward compatibility */
  warnings: string[];
}

function cardsWithTag(deck: CardWithTags[], tag: string): string[] {
  return deck.filter((c) => (c.tags ?? []).includes(tag)).map((c) => c.name);
}

function pushViolation(
  violations: BracketViolation[],
  severity: BracketViolationSeverity,
  message: string,
  options?: { policy?: string; cards?: string[] }
): void {
  violations.push({
    severity,
    message,
    policy: options?.policy,
    cards: options?.cards,
  });
}

/**
 * Count cards per tag in the deck (each card counts once per tag it has).
 */
export function countByTag(deck: CardWithTags[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of deck) {
    for (const tag of card.tags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

function violationsToLegacy(violations: BracketViolation[]): {
  errors: string[];
  warnings: string[];
} {
  return {
    errors: violations.filter((v) => v.severity === 'error').map((v) => v.message),
    warnings: violations
      .filter((v) => v.severity === 'warning')
      .map((v) => v.message),
  };
}

/**
 * Validate Bracket 3 policies using tag counts.
 */
export function validateBracket3(
  deck: CardWithTags[],
  policies: Bracket3Policies
): ValidateBracket3Result {
  const counts = countByTag(deck);
  const violations: BracketViolation[] = [];

  const maxGC = policies.max_game_changers ?? 3;
  const maxET = policies.max_extra_turn_cards ?? 3;
  const gcCount = counts['game_changer'] ?? 0;
  const etCount = counts['extra_turn'] ?? 0;

  if (gcCount > maxGC) {
    const gcCards = cardsWithTag(deck, 'game_changer');
    pushViolation(
      violations,
      'error',
      `Exceeds Bracket 3 limit of ${maxGC} Game Changer(s) (found ${gcCount}): ${gcCards.join(', ')}.`,
      { policy: 'max_game_changers', cards: gcCards }
    );
  }
  if (etCount > maxET) {
    const etCards = cardsWithTag(deck, 'extra_turn');
    pushViolation(
      violations,
      'error',
      `Exceeds Bracket 3 limit of ${maxET} extra-turn card(s) (found ${etCount}): ${etCards.join(', ')}.`,
      { policy: 'max_extra_turn_cards', cards: etCards }
    );
  }
  if (policies.ban_mass_land_denial !== false && (counts['mass_land_denial'] ?? 0) > 0) {
    const mldCards = cardsWithTag(deck, 'mass_land_denial');
    pushViolation(
      violations,
      'error',
      `Mass land denial is banned in Bracket 3: ${mldCards.join(', ')}.`,
      { policy: 'ban_mass_land_denial', cards: mldCards }
    );
  }

  if (policies.ban_extra_turn_chains && etCount > 0) {
    const copy = counts['spell_copy'] ?? 0;
    const recur = counts['recursion'] ?? 0;
    if (copy + recur >= 6) {
      pushViolation(
        violations,
        'warning',
        'Possible extra-turn chain risk (high spell copy + recursion density). Review for loops.',
        { policy: 'ban_extra_turn_chains' }
      );
    }
  }

  const legacy = violationsToLegacy(violations);
  return { counts, violations, errors: legacy.errors, warnings: legacy.warnings };
}

/**
 * Load combos from data/combos.json.
 */
export function loadCombos(combosPath?: string): ComboDef[] {
  const p = combosPath ?? path.join(__dirname, '..', '..', 'data', 'combos.json');
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  const arr = JSON.parse(raw) as ComboDef[];
  return Array.isArray(arr) ? arr : [];
}

/**
 * Validate that the deck does not contain 2-card combos with turnFloor < 6.
 */
export function validateTwoCardCombosBeforeT6(
  deck: CardWithTags[],
  combos: ComboDef[],
  turnFloorLimit: number = 6
): string[] {
  const names = new Set(deck.map((c) => c.name.trim().toLowerCase()));
  const errors: string[] = [];

  for (const combo of combos) {
    if (combo.size !== 2 || combo.turnFloor >= turnFloorLimit) continue;
    if (combo.pieces.length < 2) continue;
    const normalizedPieces = combo.pieces.map((p) => p.trim().toLowerCase());
    const allPresent = normalizedPieces.every((p) => names.has(p));
    if (allPresent) {
      errors.push(
        `Banned 2-card combo before turn ${turnFloorLimit}: ${combo.id} (${combo.pieces.join(' + ')}).`
      );
    }
  }

  return errors;
}

/**
 * Remove bracket policy violations from a built deck when possible (trim excess tagged cards).
 */
export function remediateBracket3Violations(
  deck: CardWithTags[],
  policies: Bracket3Policies
): { deck: CardWithTags[]; removed: string[]; notes: string[] } {
  let working = [...deck];
  const removed: string[] = [];
  const notes: string[] = [];

  const tryTrimTag = (tag: string, max: number): void => {
    let count = working.filter((c) => (c.tags ?? []).includes(tag)).length;
    while (count > max) {
      const idx = working.findIndex((c) => (c.tags ?? []).includes(tag));
      if (idx < 0) break;
      removed.push(working[idx].name);
      working.splice(idx, 1);
      count--;
      notes.push(`Removed ${tag} card to meet Bracket 3 cap.`);
    }
  };

  tryTrimTag('game_changer', policies.max_game_changers ?? 3);
  tryTrimTag('extra_turn', policies.max_extra_turn_cards ?? 3);

  if (policies.ban_mass_land_denial !== false) {
    const mld = working.filter((c) => (c.tags ?? []).includes('mass_land_denial'));
    if (mld.length) {
      for (const c of mld) {
        removed.push(c.name);
      }
      working = working.filter((c) => !(c.tags ?? []).includes('mass_land_denial'));
      notes.push(`Removed ${mld.length} mass land denial card(s).`);
    }
  }

  const combos = loadCombos();
  const comboErrs = validateTwoCardCombosBeforeT6(
    working,
    combos,
    policies.ban_2card_gameenders_before_turn ?? 6
  );
  for (const err of comboErrs) {
    const match = err.match(/\(([^)]+)\)/);
    if (!match) continue;
    const pieces = match[1].split(' + ').map((p) => p.trim().toLowerCase());
    for (const piece of pieces) {
      const idx = working.findIndex((c) => c.name.toLowerCase() === piece);
      if (idx >= 0) {
        const card = working[idx];
        removed.push(card.name);
        working.splice(idx, 1);
        notes.push(`Removed combo piece ${card.name}.`);
      }
    }
  }

  return { deck: working, removed, notes };
}
