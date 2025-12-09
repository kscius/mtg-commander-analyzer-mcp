/**
 * scryfall.ts
 * 
 * Scryfall oracle card data integration.
 * Loads and caches oracle-cards.json, provides helpers for card lookups.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface OracleCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  color_identity?: string[];
}

let cachedOracleCards: OracleCard[] | null = null;

export function loadOracleCards(): OracleCard[] {
  if (cachedOracleCards) {
    return cachedOracleCards;
  }

  try {
    const filePath = path.join(__dirname, '..', '..', 'data', 'oracle-cards.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OracleCard[];
    cachedOracleCards = parsed;
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load oracle-cards.json: ${error.message}\n` +
        `Make sure data/oracle-cards.json exists in the project root.`
      );
    }
    throw error;
  }
}

export function getCardByName(name: string): OracleCard | null {
  const cards = loadOracleCards();
  const target = name.trim().toLowerCase();
  let bestMatch: OracleCard | null = null;

  for (const card of cards) {
    if (!card.name) continue;
    
    if (card.name.trim().toLowerCase() === target) {
      if (card.lang === 'en') {
        return card;
      }
      if (!bestMatch) {
        bestMatch = card;
      }
    }
  }

  return bestMatch;
}

export function isLand(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('land');
}