/**
 * bracketCards.ts
 * 
 * Bracket-specific card list loader and checker.
 * Provides utilities to identify game changers, mass land denial, and extra turn cards.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Card lists for a specific bracket
 */
interface BracketCardLists {
  /** List of game-changing card names */
  gameChangers: string[];
  /** List of mass land destruction/denial card names */
  massLandDenial: string[];
  /** List of extra turn card names */
  extraTurns: string[];
}

/**
 * Cache for loaded bracket card lists
 * Key: bracket ID (e.g., "bracket3")
 */
const cardListsCache: Map<string, BracketCardLists> = new Map();

/**
 * Normalizes a card name for case-insensitive comparison
 * 
 * @param name - Card name to normalize
 * @returns Lowercase, trimmed card name
 */
function normalizeCardName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Loads bracket card lists from JSON files
 * 
 * @param bracketId - Bracket identifier (e.g., "bracket3")
 * @returns BracketCardLists with all card name lists
 * @throws Error if files cannot be loaded
 * 
 * Files loaded:
 * - data/bracket3-game-changers.json
 * - data/bracket3-mass-land-denial.json
 * - data/bracket3-extra-turns.json
 */
function loadBracketCardLists(bracketId: string): BracketCardLists {
  // Check cache first
  if (cardListsCache.has(bracketId)) {
    return cardListsCache.get(bracketId)!;
  }

  try {
    // Resolve paths relative to compiled output (dist/core)
    const dataDir = path.join(__dirname, '..', '..', 'data');

    // Load each list
    const gameChangersPath = path.join(dataDir, `${bracketId}-game-changers.json`);
    const massLandDenialPath = path.join(dataDir, `${bracketId}-mass-land-denial.json`);
    const extraTurnsPath = path.join(dataDir, `${bracketId}-extra-turns.json`);

    const gameChangers = JSON.parse(fs.readFileSync(gameChangersPath, 'utf8')) as string[];
    const massLandDenial = JSON.parse(fs.readFileSync(massLandDenialPath, 'utf8')) as string[];
    const extraTurns = JSON.parse(fs.readFileSync(extraTurnsPath, 'utf8')) as string[];

    // Validate that we got arrays
    if (!Array.isArray(gameChangers) || !Array.isArray(massLandDenial) || !Array.isArray(extraTurns)) {
      throw new Error(`Invalid card list format for bracket "${bracketId}". Expected arrays of strings.`);
    }

    const lists: BracketCardLists = {
      gameChangers,
      massLandDenial,
      extraTurns
    };

    // Cache the lists
    cardListsCache.set(bracketId, lists);

    return lists;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load bracket card lists for "${bracketId}": ${error.message}\n` +
        `Make sure data/${bracketId}-*.json files exist.`
      );
    }
    throw error;
  }
}

/**
 * Checks if a card is a Game Changer for the specified bracket
 * 
 * @param name - Card name to check
 * @param bracketId - Bracket identifier (e.g., "bracket3")
 * @returns True if the card is in the game changers list
 * 
 * @example
 * ```typescript
 * if (isGameChanger("Demonic Tutor", "bracket3")) {
 *   console.log("This is a powerful tutor!");
 * }
 * ```
 */
export function isGameChanger(name: string, bracketId: string): boolean {
  try {
    const lists = loadBracketCardLists(bracketId);
    const normalized = normalizeCardName(name);
    return lists.gameChangers.some(gc => normalizeCardName(gc) === normalized);
  } catch {
    // If bracket card lists don't exist, return false
    return false;
  }
}

/**
 * Checks if a card is a Mass Land Denial card for the specified bracket
 * 
 * @param name - Card name to check
 * @param bracketId - Bracket identifier (e.g., "bracket3")
 * @returns True if the card is in the mass land denial list
 * 
 * @example
 * ```typescript
 * if (isMassLandDenial("Armageddon", "bracket3")) {
 *   console.log("This card destroys all lands!");
 * }
 * ```
 */
export function isMassLandDenial(name: string, bracketId: string): boolean {
  try {
    const lists = loadBracketCardLists(bracketId);
    const normalized = normalizeCardName(name);
    return lists.massLandDenial.some(mld => normalizeCardName(mld) === normalized);
  } catch {
    // If bracket card lists don't exist, return false
    return false;
  }
}

/**
 * Checks if a card is an Extra Turn card for the specified bracket
 * 
 * @param name - Card name to check
 * @param bracketId - Bracket identifier (e.g., "bracket3")
 * @returns True if the card is in the extra turns list
 * 
 * @example
 * ```typescript
 * if (isExtraTurnCard("Time Warp", "bracket3")) {
 *   console.log("This card grants extra turns!");
 * }
 * ```
 */
export function isExtraTurnCard(name: string, bracketId: string): boolean {
  try {
    const lists = loadBracketCardLists(bracketId);
    const normalized = normalizeCardName(name);
    return lists.extraTurns.some(et => normalizeCardName(et) === normalized);
  } catch {
    // If bracket card lists don't exist, return false
    return false;
  }
}

/**
 * Clears the card lists cache (useful for testing)
 */
export function clearBracketCardListsCache(): void {
  cardListsCache.clear();
}

