/**
 * roles.ts
 * 
 * Card role classification system for deck analysis.
 * Uses heuristics based on card type and oracle text to assign functional roles.
 * 
 * NOTE: This is a first-iteration heuristic classifier. It will be refined
 * over time with more sophisticated pattern matching and ML-based classification.
 */

import { OracleCard } from './scryfall';
import { CardRole } from './types';

/**
 * Classifies a card into one or more functional roles
 * 
 * @param card - OracleCard from Scryfall (can be null if card not found)
 * @returns Array of CardRole classifications
 * 
 * A card can have multiple roles (e.g., a card that both ramps and draws)
 * 
 * @example
 * ```typescript
 * const solRing = getCardByName("Sol Ring");
 * const roles = classifyCardRoles(solRing);
 * // roles === ["ramp"]
 * 
 * const island = getCardByName("Island");
 * const roles2 = classifyCardRoles(island);
 * // roles2 === ["land"]
 * ```
 */
export function classifyCardRoles(card: OracleCard | null): CardRole[] {
  // If card not found in Scryfall, classify as "other"
  if (!card) {
    return ['other'];
  }

  const roles: CardRole[] = [];
  const typeLine = (card.type_line || '').toLowerCase();
  const oracleText = (card.oracle_text || '').toLowerCase();

  // LAND: Check type_line first (most reliable)
  if (typeLine.includes('land')) {
    return ['land']; // Lands are purely lands, return early
  }

  // RAMP: Mana acceleration
  // Patterns: mana rocks, land fetch, mana dorks
  if (
    // Mana rocks (artifacts that produce mana)
    (typeLine.includes('artifact') && oracleText.includes('add {')) ||
    // Land search
    oracleText.includes('search your library for a land') ||
    oracleText.includes('search your library for a basic land') ||
    oracleText.includes('search your library for up to') && oracleText.includes('land') ||
    // Mana dorks (creatures that tap for mana)
    (typeLine.includes('creature') && oracleText.includes('{t}: add')) ||
    // Other ramp patterns
    oracleText.includes('put a land card from your hand onto the battlefield') ||
    oracleText.includes('you may put a land card')
  ) {
    roles.push('ramp');
  }

  // TARGET REMOVAL: Single-target removal
  // Must be targeted, not mass removal
  if (
    // Destroy/exile target
    (oracleText.includes('destroy target') && !oracleText.includes('destroy all')) ||
    (oracleText.includes('exile target') && !oracleText.includes('exile all')) ||
    // Damage to target
    (oracleText.includes('damage to target') || oracleText.includes('damage to any target')) ||
    // Return to hand/library
    (oracleText.includes('return target') && oracleText.includes('to its owner')) ||
    // -X/-X to target
    (oracleText.includes('target') && oracleText.includes('gets -'))
  ) {
    // Exclude if it's clearly a board wipe
    if (!oracleText.includes('destroy all') && !oracleText.includes('each creature')) {
      roles.push('target_removal');
    }
  }

  // BOARD WIPE: Mass removal
  if (
    oracleText.includes('destroy all creatures') ||
    oracleText.includes('destroy all nonland permanents') ||
    oracleText.includes('destroy all permanents') ||
    oracleText.includes('each creature gets -') ||
    (oracleText.includes('each creature') && oracleText.includes('destroy')) ||
    oracleText.includes('all creatures get -') ||
    oracleText.includes('exile all creatures')
  ) {
    roles.push('board_wipe');
  }

  // CARD DRAW: Card advantage
  if (
    oracleText.includes('draw a card') ||
    oracleText.includes('draw two cards') ||
    oracleText.includes('draw three cards') ||
    oracleText.includes('draw cards equal to') ||
    oracleText.includes('draw that many cards') ||
    (oracleText.includes('draw') && oracleText.includes('card'))
  ) {
    roles.push('card_draw');
  }

  // PROTECTION: Defensive abilities
  if (
    oracleText.includes('hexproof') ||
    oracleText.includes('indestructible') ||
    oracleText.includes('protection from') ||
    oracleText.includes('shroud') ||
    oracleText.includes('ward') ||
    oracleText.includes('prevent all damage') ||
    (oracleText.includes('counter target') && oracleText.includes('spell'))
  ) {
    roles.push('protection');
  }

  // TUTOR: Library search for any card
  if (
    oracleText.includes('search your library for a card') ||
    (oracleText.includes('search your library for an') && !oracleText.includes('land')) ||
    (oracleText.includes('search your library') && 
     (oracleText.includes('creature') || oracleText.includes('artifact') || 
      oracleText.includes('enchantment') || oracleText.includes('instant') || 
      oracleText.includes('sorcery')))
  ) {
    roles.push('tutor');
  }

  // WINCON: Cards that typically win games
  // This is very heuristic and will need refinement
  if (
    oracleText.includes('you win the game') ||
    oracleText.includes('deals damage to any target') && oracleText.includes('50') ||
    oracleText.includes('infinite') ||
    (typeLine.includes('planeswalker') && oracleText.includes('emblem'))
  ) {
    roles.push('wincon');
  }

  // If no roles were assigned, classify as "other"
  if (roles.length === 0) {
    roles.push('other');
  }

  return roles;
}

/**
 * Maps CardRole values to deck template category names
 * 
 * @param roles - Array of CardRole classifications
 * @returns Array of category names that match these roles
 * 
 * @example
 * ```typescript
 * const roles = ["ramp", "card_draw"];
 * const categories = cardRolesToCategories(roles);
 * // categories === ["ramp", "card_draw"]
 * ```
 * 
 * Current mappings:
 * - "ramp" -> "ramp"
 * - "card_draw" -> "card_draw"
 * - "target_removal" -> "target_removal"
 * - "board_wipe" -> "board_wipes" (note the plural in category name)
 */
export function cardRolesToCategories(roles: CardRole[]): string[] {
  const categories = new Set<string>();
  
  for (const role of roles) {
    if (role === "ramp") {
      categories.add("ramp");
    }
    if (role === "card_draw") {
      categories.add("card_draw");
    }
    if (role === "target_removal") {
      categories.add("target_removal");
    }
    if (role === "board_wipe") {
      categories.add("board_wipes"); // Note: plural in category name
    }
    // Other roles (land, creature, commander_synergy, other) don't map to template categories yet
  }
  
  return Array.from(categories);
}

