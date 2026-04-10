/**
 * scryfall.ts
 * 
 * Scryfall oracle card data integration.
 * Uses SQLite database for efficient lookups of large card datasets.
 * Falls back to JSON file if database is not available.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  isDatabaseReady,
  findCardByName as dbFindCardByName,
  DatabaseCard,
  isLand as dbIsLand,
} from './cardDatabase';

/**
 * OracleCard interface - compatible with both DB and JSON sources
 */
export interface OracleCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  color_identity?: string[];
  colors?: string[];
  cmc?: number;
  power?: string;
  toughness?: string;
  keywords?: string[];
  legalities?: Record<string, string>;
  rarity?: string;
  set_code?: string;
  set_name?: string;
  edhrec_rank?: number;
  image_uris?: Record<string, string>;
  /** Bracket 3 categorization tags from local DB (e.g. ["ramp","card_draw"]) */
  tags?: string[];
  /** Related parts (e.g. combo pieces) from Scryfall */
  all_parts?: { component?: string; name?: string; id?: string }[];
  /** Mana symbols this card can produce (lands/rocks); from Scryfall or DB */
  produced_mana?: string[];
  /** Card faces for MDFC/split (from DB or API) */
  card_faces?: Array<{ name?: string; mana_cost?: string; type_line?: string; oracle_text?: string }>;
}

/** Scryfall API base URL */
const SCRYFALL_API = 'https://api.scryfall.com';

/** Minimum delay between Scryfall API requests (ms) — required by Scryfall TOS */
const SCRYFALL_RATE_LIMIT_MS = 75;

/** Timestamp of the last Scryfall API call */
let lastScryfallCall = 0;

// Cache for JSON fallback (only used if DB not available)
let cachedOracleCards: OracleCard[] | null = null;
let usingDatabase: boolean | null = null;

/**
 * Check if we should use the database or fallback to JSON
 */
function shouldUseDatabase(): boolean {
  if (usingDatabase === null) {
    usingDatabase = isDatabaseReady();
    if (usingDatabase) {
      console.log('[Scryfall] Using SQLite database for card lookups');
    } else {
      console.log('[Scryfall] Database not available, falling back to JSON file');
    }
  }
  return usingDatabase;
}

/**
 * Convert DatabaseCard to OracleCard interface
 */
function dbCardToOracleCard(dbCard: DatabaseCard): OracleCard {
  return {
    id: dbCard.id,
    oracle_id: dbCard.oracle_id ?? undefined,
    name: dbCard.name,
    lang: dbCard.lang ?? undefined,
    type_line: dbCard.type_line ?? undefined,
    mana_cost: dbCard.mana_cost ?? undefined,
    oracle_text: dbCard.oracle_text ?? undefined,
    color_identity: dbCard.color_identity ?? undefined,
    colors: dbCard.colors ?? undefined,
    cmc: dbCard.cmc ?? undefined,
    power: dbCard.power ?? undefined,
    toughness: dbCard.toughness ?? undefined,
    keywords: dbCard.keywords ?? undefined,
    legalities: dbCard.legalities ?? undefined,
    rarity: dbCard.rarity ?? undefined,
    set_code: dbCard.set_code ?? undefined,
    set_name: dbCard.set_name ?? undefined,
    edhrec_rank: dbCard.edhrec_rank ?? undefined,
    image_uris: dbCard.image_uris ?? undefined,
    tags: dbCard.tags ?? undefined,
    all_parts: Array.isArray(dbCard.all_parts) ? dbCard.all_parts as { component?: string; name?: string; id?: string }[] : undefined,
    produced_mana: dbCard.produced_mana ?? undefined,
    card_faces: Array.isArray(dbCard.card_faces) ? dbCard.card_faces as Array<{ name?: string; mana_cost?: string; type_line?: string; oracle_text?: string }> : undefined,
  };
}

/**
 * Load oracle cards from JSON file (fallback mode only)
 * @deprecated Use getCardByName() which automatically uses DB when available
 */
export function loadOracleCards(): OracleCard[] {
  if (shouldUseDatabase()) {
    console.warn('[Scryfall] loadOracleCards() called but database is available. ' +
      'This function loads all cards into memory which is not recommended. ' +
      'Use getCardByName() for individual lookups instead.');
  }

  if (cachedOracleCards) {
    return cachedOracleCards;
  }

  try {
    const filePath = path.join(__dirname, '..', '..', 'data', 'oracle-cards.json');
    
    // Check file size first
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    if (sizeMB > 500) {
      throw new Error(
        `oracle-cards.json is ${sizeMB.toFixed(0)}MB which is too large to load into memory. ` +
        `Please run 'npm run db:create' and 'npm run db:import' to set up the SQLite database.`
      );
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as OracleCard[];
    cachedOracleCards = parsed;
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load oracle-cards.json: ${error.message}\n` +
        `Consider setting up the SQLite database instead:\n` +
        `  npm run db:create\n` +
        `  npm run db:import`
      );
    }
    throw error;
  }
}

/**
 * Get a card by its exact name (case-insensitive)
 * Uses SQLite database if available, falls back to JSON file
 */
export function getCardByName(name: string): OracleCard | null {
  // Try database first
  if (shouldUseDatabase()) {
    try {
      const dbCard = dbFindCardByName(name);
      return dbCard ? dbCardToOracleCard(dbCard) : null;
    } catch (error) {
      console.warn(`[Scryfall] Database query failed, falling back to JSON: ${error}`);
      usingDatabase = false;
    }
  }

  // Fallback to JSON
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

/**
 * Check if a card is a land
 */
export function isLand(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('land');
}

/**
 * Check if a card is a creature
 */
export function isCreature(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('creature');
}

/**
 * Check if a card is an artifact
 */
export function isArtifact(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('artifact');
}

/**
 * Check if a card is an instant
 */
export function isInstant(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('instant');
}

/**
 * Check if a card is a sorcery
 */
export function isSorcery(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('sorcery');
}

/**
 * Check if a card is an enchantment
 */
export function isEnchantment(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('enchantment');
}

/**
 * Check if a card is a planeswalker
 */
export function isPlaneswalker(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('planeswalker');
}

/**
 * Check if a card is legendary
 */
export function isLegendary(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  return card.type_line.toLowerCase().includes('legendary');
}

/**
 * Check if a card can be a commander
 */
export function canBeCommander(card: OracleCard | null | undefined): boolean {
  if (!card || !card.type_line) {
    return false;
  }
  
  const typeLine = card.type_line.toLowerCase();
  
  // Legendary creatures can be commanders
  if (typeLine.includes('legendary') && typeLine.includes('creature')) {
    return true;
  }
  
  // Check oracle text for "can be your commander"
  if (card.oracle_text?.toLowerCase().includes('can be your commander')) {
    return true;
  }
  
  return false;
}

/**
 * Get the color identity of a card as a sorted array
 */
export function getColorIdentity(card: OracleCard | null | undefined): string[] {
  if (!card || !card.color_identity) {
    return [];
  }
  return [...card.color_identity].sort();
}

/**
 * Check if a card's color identity fits within a given identity
 */
export function fitsColorIdentity(card: OracleCard, allowedColors: string[]): boolean {
  const cardIdentity = getColorIdentity(card);
  const allowed = new Set(allowedColors.map(c => c.toUpperCase()));
  
  return cardIdentity.every(c => allowed.has(c.toUpperCase()));
}

// ---------------------------------------------------------------------------
// Scryfall REST API integration (fallback & advanced search)
// ---------------------------------------------------------------------------

/**
 * Enforce Scryfall rate limit (≥75ms between calls).
 */
async function scryfallRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastScryfallCall;
  if (elapsed < SCRYFALL_RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, SCRYFALL_RATE_LIMIT_MS - elapsed));
  }
  lastScryfallCall = Date.now();
}

/**
 * Fetch a single card from the Scryfall API by exact name.
 * Returns null on 404 or network errors.
 */
export async function fetchCardFromApi(name: string): Promise<OracleCard | null> {
  await scryfallRateLimit();
  try {
    const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mtg-commander-analyzer-mcp/0.4.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return scryfallResponseToOracleCard(data);
  } catch {
    return null;
  }
}

/**
 * Fuzzy card name search via Scryfall API.
 * Useful when a user provides an approximate card name.
 * Returns the best single match or null.
 */
export async function fetchCardFuzzy(name: string): Promise<OracleCard | null> {
  await scryfallRateLimit();
  try {
    const url = `${SCRYFALL_API}/cards/named?fuzzy=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mtg-commander-analyzer-mcp/0.4.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return scryfallResponseToOracleCard(data);
  } catch {
    return null;
  }
}

/**
 * Search Scryfall with a full-text query string (Scryfall search syntax).
 * Returns up to `limit` matching cards.
 *
 * @param query  Scryfall search query (e.g. "t:creature c:wr cmc<=3")
 * @param limit  Max results (default 20, max 175 per Scryfall page)
 */
export async function searchScryfallApi(
  query: string,
  limit: number = 20
): Promise<OracleCard[]> {
  await scryfallRateLimit();
  try {
    const url = `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=edhrec&dir=asc`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mtg-commander-analyzer-mcp/0.4.0', Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const body = await res.json() as { data?: unknown[] };
    if (!Array.isArray(body.data)) return [];
    return body.data
      .slice(0, limit)
      .map(item => scryfallResponseToOracleCard(item as Record<string, unknown>))
      .filter((c): c is OracleCard => c !== null);
  } catch {
    return [];
  }
}

/**
 * Get autocomplete suggestions for a partial card name.
 * Returns up to 20 card names.
 */
export async function autocompleteScryfallApi(partial: string): Promise<string[]> {
  await scryfallRateLimit();
  try {
    const url = `${SCRYFALL_API}/cards/autocomplete?q=${encodeURIComponent(partial)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mtg-commander-analyzer-mcp/0.4.0', Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const body = await res.json() as { data?: string[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Get a card by name with full fallback chain:
 * 1. Local DB  →  2. JSON file  →  3. Scryfall exact API  →  4. Scryfall fuzzy API
 *
 * Async version of getCardByName that enables online fallback.
 */
export async function getCardByNameWithFallback(name: string): Promise<OracleCard | null> {
  // 1 & 2: existing local sources
  const local = getCardByName(name);
  if (local) return local;

  // 3: exact API lookup
  const exact = await fetchCardFromApi(name);
  if (exact) return exact;

  // 4: fuzzy API lookup
  return fetchCardFuzzy(name);
}

/**
 * Fetch a random Commander-legal card from Scryfall.
 * Useful for exploration or seeding suggestions.
 */
export async function fetchRandomCommanderCard(): Promise<OracleCard | null> {
  await scryfallRateLimit();
  try {
    const url = `${SCRYFALL_API}/cards/random?q=legal%3Acommander`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mtg-commander-analyzer-mcp/0.4.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return scryfallResponseToOracleCard(data);
  } catch {
    return null;
  }
}

/**
 * Map a raw Scryfall JSON card object to OracleCard.
 */
function scryfallResponseToOracleCard(data: Record<string, unknown>): OracleCard | null {
  if (!data || typeof data.name !== 'string') return null;

  const faces = Array.isArray(data.card_faces)
    ? (data.card_faces as Array<Record<string, unknown>>).map(f => ({
        name: f.name as string | undefined,
        mana_cost: f.mana_cost as string | undefined,
        type_line: f.type_line as string | undefined,
        oracle_text: f.oracle_text as string | undefined,
      }))
    : undefined;

  return {
    id: (data.id as string) ?? '',
    oracle_id: data.oracle_id as string | undefined,
    name: data.name as string,
    lang: data.lang as string | undefined,
    type_line: data.type_line as string | undefined,
    mana_cost: data.mana_cost as string | undefined,
    oracle_text: data.oracle_text as string | undefined,
    color_identity: data.color_identity as string[] | undefined,
    colors: data.colors as string[] | undefined,
    cmc: data.cmc as number | undefined,
    power: data.power as string | undefined,
    toughness: data.toughness as string | undefined,
    keywords: data.keywords as string[] | undefined,
    legalities: data.legalities as Record<string, string> | undefined,
    rarity: data.rarity as string | undefined,
    set_code: (data.set as string) ?? undefined,
    set_name: data.set_name as string | undefined,
    edhrec_rank: data.edhrec_rank as number | undefined,
    image_uris: data.image_uris as Record<string, string> | undefined,
    all_parts: Array.isArray(data.all_parts)
      ? (data.all_parts as Array<Record<string, unknown>>).map(p => ({
          component: p.component as string | undefined,
          name: p.name as string | undefined,
          id: p.id as string | undefined,
        }))
      : undefined,
    produced_mana: data.produced_mana as string[] | undefined,
    card_faces: faces,
  };
}

/**
 * Force reset the data source (for testing)
 */
export function resetDataSource(): void {
  usingDatabase = null;
  cachedOracleCards = null;
}
