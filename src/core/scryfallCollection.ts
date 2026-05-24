/**
 * Scryfall /cards/collection batch lookup (up to 75 identifiers per request).
 */

import { scryfallResponseToOracleCard, type OracleCard } from './scryfall';

const SCRYFALL_API = 'https://api.scryfall.com';
const COLLECTION_CHUNK = 75;
const RATE_LIMIT_MS = 75;

let lastCall = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCall = Date.now();
}

type ScryfallCollectionResponse = {
  object?: string;
  data?: Record<string, unknown>[];
  not_found?: { name?: string }[];
};

/**
 * Resolve many card names via Scryfall collection API (batched).
 * Keys are lowercase trimmed requested names.
 */
export async function fetchScryfallCollectionByNames(
  names: string[]
): Promise<Map<string, OracleCard>> {
  const out = new Map<string, OracleCard>();
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }

  for (let i = 0; i < unique.length; i += COLLECTION_CHUNK) {
    const chunk = unique.slice(i, i + COLLECTION_CHUNK);
    await rateLimit();
    try {
      const res = await fetch(`${SCRYFALL_API}/cards/collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'mtg-commander-analyzer-mcp/0.7.0',
        },
        body: JSON.stringify({
          identifiers: chunk.map((name) => ({ name })),
        }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as ScryfallCollectionResponse;
      for (const card of body.data ?? []) {
        const name = typeof card.name === 'string' ? card.name : '';
        if (!name) continue;
        const oracle = scryfallResponseToOracleCard(card);
        if (!oracle) continue;
        out.set(name.toLowerCase(), oracle);
        for (const requested of chunk) {
          if (requested.toLowerCase() === name.toLowerCase()) {
            out.set(requested.toLowerCase(), oracle);
          }
        }
      }
    } catch {
      // skip failed chunk
    }
  }

  return out;
}
