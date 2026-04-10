/**
 * banlist.ts
 * 
 * Manages the banned cards list for Commander format.
 * Loads from data/Banlist.txt and provides functions to check if cards are banned.
 * 
 * This is a custom banlist that can differ from the official Commander RC banlist.
 * The system enforces this banlist for deck building and analysis.
 */

import * as fs from 'fs';
import * as path from 'path';

const BANLIST_PATH = path.join(__dirname, '..', '..', 'data', 'Banlist.txt');

// Cache for the banned cards set (case-insensitive)
let bannedCardsCache: Set<string> | null = null;
let bannedCardsListCache: string[] | null = null;

/**
 * Load the banlist from file and cache it
 */
function loadBanlist(): void {
  if (bannedCardsCache !== null) {
    return; // Already loaded
  }

  try {
    if (!fs.existsSync(BANLIST_PATH)) {
      console.warn(`[Banlist] Warning: Banlist file not found at ${BANLIST_PATH}`);
      bannedCardsCache = new Set();
      bannedCardsListCache = [];
      return;
    }

    const content = fs.readFileSync(BANLIST_PATH, 'utf8');
    const lines = content.split('\n');

    const uniqueCards = new Set<string>();
    const cardList: string[] = [];

    for (const line of lines) {
      // Trim whitespace
      let cardName = line.trim();

      // Skip empty lines
      if (!cardName) {
        continue;
      }

      // Handle lines with quantity prefix (e.g., "1 Black Lotus")
      const quantityMatch = cardName.match(/^\d+\s+(.+)$/);
      if (quantityMatch) {
        cardName = quantityMatch[1].trim();
      }

      // Normalize to lowercase for case-insensitive matching
      const normalized = cardName.toLowerCase();

      // Skip duplicates
      if (!uniqueCards.has(normalized)) {
        uniqueCards.add(normalized);
        cardList.push(cardName); // Keep original casing for display
      }
    }

    bannedCardsCache = uniqueCards;
    bannedCardsListCache = cardList;

    console.log(`[Banlist] Loaded ${cardList.length} banned cards`);
  } catch (error) {
    console.error(`[Banlist] Error loading banlist: ${error}`);
    bannedCardsCache = new Set();
    bannedCardsListCache = [];
  }
}

/**
 * Check if a card is banned
 * @param cardName - The card name to check
 * @returns true if the card is banned
 */
export function isBanned(cardName: string): boolean {
  loadBanlist();
  return bannedCardsCache!.has(cardName.toLowerCase().trim());
}

/**
 * Get all banned cards
 * @returns Array of banned card names (with original casing)
 */
export function getBannedCards(): string[] {
  loadBanlist();
  return [...bannedCardsListCache!];
}

/**
 * Get the count of banned cards
 */
export function getBannedCount(): number {
  loadBanlist();
  return bannedCardsListCache!.length;
}

/**
 * Filter a list of card names and return only the banned ones
 * @param cardNames - Array of card names to check
 * @returns Array of card names that are banned
 */
export function filterBannedCards(cardNames: string[]): string[] {
  loadBanlist();
  return cardNames.filter(name => bannedCardsCache!.has(name.toLowerCase().trim()));
}

/**
 * Check multiple cards and return details about banned ones
 */
export interface BannedCardInfo {
  name: string;
  quantity: number;
}

export function checkDeckForBannedCards(
  cards: { name: string; quantity: number }[]
): BannedCardInfo[] {
  loadBanlist();
  
  const bannedInDeck: BannedCardInfo[] = [];
  
  for (const card of cards) {
    if (bannedCardsCache!.has(card.name.toLowerCase().trim())) {
      bannedInDeck.push({
        name: card.name,
        quantity: card.quantity,
      });
    }
  }
  
  return bannedInDeck;
}

/**
 * Force reload the banlist (useful after file changes)
 */
export function reloadBanlist(): void {
  bannedCardsCache = null;
  bannedCardsListCache = null;
  loadBanlist();
}

/**
 * Check if banlist is loaded and available
 */
export function isBanlistAvailable(): boolean {
  loadBanlist();
  return bannedCardsListCache !== null && bannedCardsListCache.length > 0;
}

