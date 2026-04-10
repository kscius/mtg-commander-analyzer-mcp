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

export interface ValidateBracket3Result {
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
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

/**
 * Validate Bracket 3 policies using tag counts.
 */
export function validateBracket3(
  deck: CardWithTags[],
  policies: Bracket3Policies
): ValidateBracket3Result {
  const counts = countByTag(deck);
  const errors: string[] = [];
  const warnings: string[] = [];

  const maxGC = policies.max_game_changers ?? 3;
  const maxET = policies.max_extra_turn_cards ?? 3;

  if ((counts['game_changer'] ?? 0) > maxGC) {
    errors.push(`Excede ${maxGC} Game Changers (tiene ${counts['game_changer']}).`);
  }
  if ((counts['extra_turn'] ?? 0) > maxET) {
    errors.push(`Excede ${maxET} cartas de turnos extra (tiene ${counts['extra_turn']}).`);
  }
  if (policies.ban_mass_land_denial !== false && (counts['mass_land_denial'] ?? 0) > 0) {
    errors.push('Incluye Mass Land Denial (prohibido en Bracket 3).');
  }

  if (policies.ban_extra_turn_chains && (counts['extra_turn'] ?? 0) > 0) {
    const copy = counts['spell_copy'] ?? 0;
    const recur = counts['recursion'] ?? 0;
    if (copy + recur >= 6) {
      warnings.push(
        'Posible chaining de turnos extra (mucho copy/recursion). Revisa loops.'
      );
    }
  }

  return { counts, errors, warnings };
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
  const names = new Set(deck.map(c => c.name.trim().toLowerCase()));
  const errors: string[] = [];

  for (const combo of combos) {
    if (combo.size !== 2 || combo.turnFloor >= turnFloorLimit) continue;
    if (combo.pieces.length < 2) continue;
    const normalizedPieces = combo.pieces.map(p => p.trim().toLowerCase());
    const allPresent = normalizedPieces.every(p => names.has(p));
    if (allPresent) {
      errors.push(
        `Incluye combo de 2 cartas prohibido antes de T${turnFloorLimit}: ${combo.id} (${combo.pieces.join(' + ')}).`
      );
    }
  }

  return errors;
}
