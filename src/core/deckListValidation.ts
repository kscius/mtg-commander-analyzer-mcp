/**
 * Commander mainboard list validation (99 cards, singleton, banlist, color identity).
 */

import { resolveCardNameSync } from './cardResolution';
import { isBasicLandName } from './commanderFormat';
import { getCardByName } from './scryfall';
import { searchCardsByName, isDatabaseReady } from './cardDatabase';

export { isBasicLandName };

/**
 * Validate a 99-card mainboard list (commander excluded).
 */
export function validateMainboardDeck(
  cards: string[],
  colorIdentity: string[],
  bannedCards: Set<string>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (cards.length !== 99) {
    errors.push(`Deck has ${cards.length} cards, expected 99`);
  }

  const cardCounts = new Map<string, number>();
  for (const card of cards) {
    const count = (cardCounts.get(card.toLowerCase()) || 0) + 1;
    cardCounts.set(card.toLowerCase(), count);
    if (count > 1 && !isBasicLandName(card)) {
      errors.push(`Duplicate card: ${card}`);
    }
  }

  for (const card of cards) {
    if (bannedCards.has(card.toLowerCase())) {
      errors.push(`Banned card included: ${card}`);
    }
  }

  for (const cardName of cards) {
    const resolved = resolveCardNameSync(cardName);
    const cardData = resolved?.card ?? getCardByName(cardName);
    if (!cardData) {
      const suggestions = isDatabaseReady()
        ? searchCardsByName(cardName, 3).map((c) => c.name)
        : [];
      errors.push(
        suggestions.length
          ? `Unresolved card: ${cardName} (try: ${suggestions.join(', ')})`
          : `Unresolved card: ${cardName}`
      );
      continue;
    }

    const cardColors = cardData.color_identity || [];
    for (const color of cardColors) {
      if (!colorIdentity.includes(color)) {
        errors.push(`Card "${cardName}" has color ${color} outside commander's identity`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
