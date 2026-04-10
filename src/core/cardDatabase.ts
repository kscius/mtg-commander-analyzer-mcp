/**
 * cardDatabase.ts
 * 
 * SQLite-based card database for fast lookups.
 * Replaces the in-memory JSON loading with efficient SQL queries.
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'cards.db');

// Singleton database connection
let db: DatabaseType | null = null;

/**
 * Card interface matching the database schema
 */
export interface DatabaseCard {
  id: string;
  oracle_id: string | null;
  name: string;
  lang: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  colors: string[] | null;
  color_identity: string[] | null;
  color_indicator: string[] | null;
  keywords: string[] | null;
  produced_mana: string[] | null;
  released_at: string | null;
  layout: string | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  reserved: boolean;
  foil: boolean;
  nonfoil: boolean;
  oversized: boolean;
  promo: boolean;
  reprint: boolean;
  variation: boolean;
  digital: boolean;
  full_art: boolean;
  textless: boolean;
  booster: boolean;
  story_spotlight: boolean;
  finishes: string[] | null;
  games: string[] | null;
  legalities: Record<string, string> | null;
  prices: Record<string, string | null> | null;
  image_uris: Record<string, string> | null;
  card_faces: unknown[] | null;
  all_parts: unknown[] | null;
  uri: string | null;
  scryfall_uri: string | null;
  artist: string | null;
  flavor_text: string | null;
  edhrec_rank: number | null;
  /** Bracket 3 categorization tags (JSON array), e.g. ["ramp","card_draw"] */
  tags: string[] | null;
}

/**
 * Raw database row (before JSON parsing)
 */
interface RawCardRow {
  id: string;
  oracle_id: string | null;
  name: string;
  lang: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  colors: string | null;
  color_identity: string | null;
  color_indicator: string | null;
  keywords: string | null;
  produced_mana: string | null;
  released_at: string | null;
  layout: string | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  reserved: number;
  foil: number;
  nonfoil: number;
  oversized: number;
  promo: number;
  reprint: number;
  variation: number;
  digital: number;
  full_art: number;
  textless: number;
  booster: number;
  story_spotlight: number;
  finishes: string | null;
  games: string | null;
  legalities: string | null;
  prices: string | null;
  image_uris: string | null;
  card_faces: string | null;
  all_parts: string | null;
  uri: string | null;
  scryfall_uri: string | null;
  artist: string | null;
  flavor_text: string | null;
  edhrec_rank: number | null;
  tags: string | null;
}

/**
 * Parse JSON fields from raw database row
 */
function parseRow(row: RawCardRow): DatabaseCard {
  return {
    id: row.id,
    oracle_id: row.oracle_id,
    name: row.name,
    lang: row.lang,
    mana_cost: row.mana_cost,
    cmc: row.cmc,
    type_line: row.type_line,
    oracle_text: row.oracle_text,
    power: row.power,
    toughness: row.toughness,
    loyalty: row.loyalty,
    defense: row.defense,
    colors: row.colors ? JSON.parse(row.colors) : null,
    color_identity: row.color_identity ? JSON.parse(row.color_identity) : null,
    color_indicator: row.color_indicator ? JSON.parse(row.color_indicator) : null,
    keywords: row.keywords ? JSON.parse(row.keywords) : null,
    produced_mana: row.produced_mana ? JSON.parse(row.produced_mana) : null,
    released_at: row.released_at,
    layout: row.layout,
    rarity: row.rarity,
    set_code: row.set_code,
    set_name: row.set_name,
    collector_number: row.collector_number,
    reserved: Boolean(row.reserved),
    foil: Boolean(row.foil),
    nonfoil: Boolean(row.nonfoil),
    oversized: Boolean(row.oversized),
    promo: Boolean(row.promo),
    reprint: Boolean(row.reprint),
    variation: Boolean(row.variation),
    digital: Boolean(row.digital),
    full_art: Boolean(row.full_art),
    textless: Boolean(row.textless),
    booster: Boolean(row.booster),
    story_spotlight: Boolean(row.story_spotlight),
    finishes: row.finishes ? JSON.parse(row.finishes) : null,
    games: row.games ? JSON.parse(row.games) : null,
    legalities: row.legalities ? JSON.parse(row.legalities) : null,
    prices: row.prices ? JSON.parse(row.prices) : null,
    image_uris: row.image_uris ? JSON.parse(row.image_uris) : null,
    card_faces: row.card_faces ? JSON.parse(row.card_faces) : null,
    all_parts: row.all_parts ? JSON.parse(row.all_parts) : null,
    uri: row.uri,
    scryfall_uri: row.scryfall_uri,
    artist: row.artist,
    flavor_text: row.flavor_text,
    edhrec_rank: row.edhrec_rank,
    tags: row.tags ? JSON.parse(row.tags) as string[] : null,
  };
}

/**
 * Get the database connection (singleton)
 */
export function getDatabase(): DatabaseType {
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `Card database not found at ${DB_PATH}. ` +
        `Run 'npm run db:create' and 'npm run db:import' first.`
      );
    }
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('cache_size = -16000'); // 16MB cache
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if the database exists and is populated
 */
export function isDatabaseReady(): boolean {
  if (!fs.existsSync(DB_PATH)) {
    return false;
  }
  try {
    const tempDb = new Database(DB_PATH, { readonly: true });
    const result = tempDb.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
    tempDb.close();
    return result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Get total card count in database
 */
export function getCardCount(): number {
  const database = getDatabase();
  const result = database.prepare('SELECT COUNT(*) as count FROM cards').get() as { count: number };
  return result.count;
}

/**
 * Find a card by exact name (case-insensitive)
 * Prefers English cards if available
 */
export function findCardByName(name: string): DatabaseCard | null {
  const database = getDatabase();
  const normalizedName = name.trim().toLowerCase();
  
  // First try to find English version
  const englishStmt = database.prepare(`
    SELECT * FROM cards 
    WHERE lower(name) = ? AND lang = 'en' 
    LIMIT 1
  `);
  let row = englishStmt.get(normalizedName) as RawCardRow | undefined;
  
  // If no English version, get any version
  if (!row) {
    const anyStmt = database.prepare(`
      SELECT * FROM cards 
      WHERE lower(name) = ? 
      LIMIT 1
    `);
    row = anyStmt.get(normalizedName) as RawCardRow | undefined;
  }
  
  return row ? parseRow(row) : null;
}

/**
 * Find a card by oracle_id (returns first printing, preferably English)
 */
export function findCardByOracleId(oracleId: string): DatabaseCard | null {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM cards
    WHERE oracle_id = ? AND lang = 'en'
    LIMIT 1
  `);
  const row = stmt.get(oracleId) as RawCardRow | undefined;
  if (!row) {
    const anyStmt = database.prepare(`
      SELECT * FROM cards WHERE oracle_id = ? LIMIT 1
    `);
    const anyRow = anyStmt.get(oracleId) as RawCardRow | undefined;
    return anyRow ? parseRow(anyRow) : null;
  }
  return parseRow(row);
}

/**
 * Get all distinct oracle_ids (for batch tagging)
 */
export function getAllOracleIds(limit?: number): string[] {
  const database = getDatabase();
  const sql = limit
    ? `SELECT DISTINCT oracle_id FROM cards WHERE oracle_id IS NOT NULL LIMIT ?`
    : `SELECT DISTINCT oracle_id FROM cards WHERE oracle_id IS NOT NULL`;
  const rows = limit
    ? database.prepare(sql).all(limit) as { oracle_id: string }[]
    : database.prepare(sql).all() as { oracle_id: string }[];
  return rows.map(r => r.oracle_id);
}

/**
 * Find cards by partial name match
 */
export function searchCardsByName(query: string, limit: number = 20): DatabaseCard[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE name LIKE ? AND lang = 'en'
    ORDER BY edhrec_rank ASC NULLS LAST, name ASC
    LIMIT ?
  `);
  const rows = stmt.all(`%${query}%`, limit) as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Full-text search on card name, oracle text, and type line
 */
export function searchCardsFTS(query: string, limit: number = 20): DatabaseCard[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT c.* FROM cards c
    INNER JOIN cards_fts fts ON c.rowid = fts.rowid
    WHERE cards_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  const rows = stmt.all(query, limit) as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Find all cards legal in Commander format
 */
export function findCommanderLegalCards(limit: number = 1000): DatabaseCard[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE json_extract(legalities, '$.commander') = 'legal'
      AND lang = 'en'
    ORDER BY edhrec_rank ASC NULLS LAST
    LIMIT ?
  `);
  const rows = stmt.all(limit) as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Find cards by type (e.g., "Creature", "Instant", "Land")
 */
export function findCardsByType(type: string, limit: number = 100): DatabaseCard[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE type_line LIKE ? AND lang = 'en'
    ORDER BY edhrec_rank ASC NULLS LAST
    LIMIT ?
  `);
  const rows = stmt.all(`%${type}%`, limit) as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Find cards by color identity
 * @param colors Array of color codes (e.g., ["W", "U", "B", "R", "G"])
 */
export function findCardsByColorIdentity(colors: string[], limit: number = 100): DatabaseCard[] {
  const database = getDatabase();
  const colorJson = JSON.stringify(colors.sort());
  
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE color_identity = ? AND lang = 'en'
    ORDER BY edhrec_rank ASC NULLS LAST
    LIMIT ?
  `);
  const rows = stmt.all(colorJson, limit) as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Find cards that fit within a color identity (subset match)
 */
export function findCardsWithinColorIdentity(colors: string[], limit: number = 100): DatabaseCard[] {
  const database = getDatabase();
  
  // Build a query that checks if card's color identity is a subset of the given colors
  const colorSet = new Set(colors.map(c => c.toUpperCase()));
  
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE lang = 'en'
      AND json_extract(legalities, '$.commander') = 'legal'
    ORDER BY edhrec_rank ASC NULLS LAST
    LIMIT ?
  `);
  
  const rows = stmt.all(limit * 10) as RawCardRow[]; // Fetch more to filter
  
  return rows
    .filter(row => {
      if (!row.color_identity) return true; // Colorless cards fit any identity
      const cardColors: string[] = JSON.parse(row.color_identity);
      return cardColors.every(c => colorSet.has(c.toUpperCase()));
    })
    .slice(0, limit)
    .map(parseRow);
}

/**
 * Find basic lands by color
 */
export function findBasicLands(): DatabaseCard[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM cards 
    WHERE type_line LIKE '%Basic Land%' 
      AND lang = 'en'
      AND name IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes')
    GROUP BY name
  `);
  const rows = stmt.all() as RawCardRow[];
  return rows.map(parseRow);
}

/**
 * Check if a card is a land
 */
export function isLand(card: DatabaseCard | null | undefined): boolean {
  if (!card || !card.type_line) return false;
  return card.type_line.toLowerCase().includes('land');
}

/**
 * Check if a card is a creature
 */
export function isCreature(card: DatabaseCard | null | undefined): boolean {
  if (!card || !card.type_line) return false;
  return card.type_line.toLowerCase().includes('creature');
}

/**
 * Check if a card is an artifact
 */
export function isArtifact(card: DatabaseCard | null | undefined): boolean {
  if (!card || !card.type_line) return false;
  return card.type_line.toLowerCase().includes('artifact');
}

/**
 * Check if a card can be a commander
 */
export function canBeCommander(card: DatabaseCard): boolean {
  if (!card.type_line) return false;
  const typeLine = card.type_line.toLowerCase();
  
  // Legendary creatures can be commanders
  if (typeLine.includes('legendary') && typeLine.includes('creature')) {
    return true;
  }
  
  // Check oracle text for "can be your commander"
  if (card.oracle_text?.toLowerCase().includes('can be your commander')) {
    return true;
  }
  
  // Planeswalkers with "can be your commander" text
  if (typeLine.includes('planeswalker') && 
      card.oracle_text?.toLowerCase().includes('can be your commander')) {
    return true;
  }
  
  return false;
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  totalCards: number;
  uniqueNames: number;
  uniqueOracleIds: number;
  englishCards: number;
  commanderLegal: number;
  totalRulings: number;
  cardsWithRulings: number;
} {
  const database = getDatabase();
  
  const total = database.prepare('SELECT COUNT(*) as c FROM cards').get() as { c: number };
  const unique = database.prepare('SELECT COUNT(DISTINCT name) as c FROM cards').get() as { c: number };
  const oracles = database.prepare('SELECT COUNT(DISTINCT oracle_id) as c FROM cards').get() as { c: number };
  const english = database.prepare("SELECT COUNT(*) as c FROM cards WHERE lang = 'en'").get() as { c: number };
  const legal = database.prepare(
    "SELECT COUNT(*) as c FROM cards WHERE json_extract(legalities, '$.commander') = 'legal'"
  ).get() as { c: number };
  
  // Rulings stats (handle if table doesn't exist)
  let rulingsCount = 0;
  let cardsWithRulingsCount = 0;
  try {
    const rulings = database.prepare('SELECT COUNT(*) as c FROM rulings').get() as { c: number };
    const cardsWithRulings = database.prepare('SELECT COUNT(DISTINCT oracle_id) as c FROM rulings').get() as { c: number };
    rulingsCount = rulings.c;
    cardsWithRulingsCount = cardsWithRulings.c;
  } catch {
    // Rulings table may not exist yet
  }
  
  return {
    totalCards: total.c,
    uniqueNames: unique.c,
    uniqueOracleIds: oracles.c,
    englishCards: english.c,
    commanderLegal: legal.c,
    totalRulings: rulingsCount,
    cardsWithRulings: cardsWithRulingsCount,
  };
}

// ============================================================
// RULINGS FUNCTIONS
// ============================================================

/**
 * Ruling interface matching the database schema
 */
export interface Ruling {
  id: number;
  oracle_id: string;
  source: string | null;
  published_at: string | null;
  comment: string;
}

/**
 * Get all rulings for a card by oracle_id
 */
export function getRulingsByOracleId(oracleId: string): Ruling[] {
  const database = getDatabase();
  
  try {
    const stmt = database.prepare(`
      SELECT id, oracle_id, source, published_at, comment
      FROM rulings
      WHERE oracle_id = ?
      ORDER BY published_at DESC
    `);
    return stmt.all(oracleId) as Ruling[];
  } catch {
    // Rulings table may not exist
    return [];
  }
}

/**
 * Get all rulings for a card by name
 * First finds the oracle_id from the cards table, then fetches rulings
 */
export function getRulingsByCardName(cardName: string): Ruling[] {
  const card = findCardByName(cardName);
  if (!card || !card.oracle_id) {
    return [];
  }
  return getRulingsByOracleId(card.oracle_id);
}

/**
 * Search rulings by text content using full-text search
 */
export function searchRulings(query: string, limit: number = 50): Ruling[] {
  const database = getDatabase();
  
  try {
    const stmt = database.prepare(`
      SELECT r.id, r.oracle_id, r.source, r.published_at, r.comment
      FROM rulings r
      INNER JOIN rulings_fts fts ON r.id = fts.rowid
      WHERE rulings_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    return stmt.all(query, limit) as Ruling[];
  } catch {
    // Rulings table or FTS may not exist
    return [];
  }
}

/**
 * Get a card with its rulings
 */
export interface CardWithRulings extends DatabaseCard {
  rulings: Ruling[];
}

export function getCardWithRulings(cardName: string): CardWithRulings | null {
  const card = findCardByName(cardName);
  if (!card) {
    return null;
  }
  
  const rulings = card.oracle_id ? getRulingsByOracleId(card.oracle_id) : [];
  
  return {
    ...card,
    rulings,
  };
}

/**
 * Check if rulings table exists
 */
export function hasRulingsTable(): boolean {
  const database = getDatabase();
  const result = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='rulings'"
  ).get();
  return !!result;
}

/**
 * Get ruling count for a specific card
 */
export function getRulingCount(oracleId: string): number {
  const database = getDatabase();
  
  try {
    const result = database.prepare(
      'SELECT COUNT(*) as count FROM rulings WHERE oracle_id = ?'
    ).get(oracleId) as { count: number };
    return result.count;
  } catch {
    return 0;
  }
}

