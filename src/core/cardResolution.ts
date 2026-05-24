/**
 * Canonical card name resolution via local DB (exact + FTS) with optional Scryfall fallback.
 */

import { isDatabaseReady, searchCardsFTS } from './cardDatabase';
import { getCardByName, getCardByNameWithFallback, type OracleCard } from './scryfall';
import { fetchScryfallCollectionByNames } from './scryfallCollection';

export type CardResolutionSource = 'exact' | 'fts' | 'scryfall_exact' | 'scryfall_fuzzy' | 'unresolved';

export interface ResolvedCard {
  requestedName: string;
  canonicalName: string;
  card: OracleCard;
  source: CardResolutionSource;
}

function ftsQueryFromName(name: string): string {
  const tokens = name
    .trim()
    .replace(/[^\w\s',-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

/**
 * Resolve a card name using local database only (sync). Never invents names.
 */
export function resolveCardNameSync(name: string): ResolvedCard | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const local = getCardByName(trimmed);
  if (local) {
    return { requestedName: name, canonicalName: local.name, card: local, source: 'exact' };
  }

  if (isDatabaseReady()) {
    const q = ftsQueryFromName(trimmed);
    if (q) {
      try {
        const hits = searchCardsFTS(q, 8);
        const lower = trimmed.toLowerCase();
        const best =
          hits.find((h) => h.name.toLowerCase() === lower) ??
          hits.find((h) => h.name.toLowerCase().startsWith(lower)) ??
          (hits.length === 1 ? hits[0] : undefined);
        if (best) {
          const card = getCardByName(best.name);
          if (card) {
            return { requestedName: name, canonicalName: card.name, card, source: 'fts' };
          }
        }
      } catch {
        // FTS unavailable or bad query — skip
      }
    }
  }

  return null;
}

/**
 * Full resolution chain including Scryfall API when local data misses.
 */
export async function resolveCardName(name: string): Promise<ResolvedCard | null> {
  const sync = resolveCardNameSync(name);
  if (sync) return sync;

  const before = getCardByName(name.trim());
  const card = await getCardByNameWithFallback(name.trim());
  if (!card) return null;

  const source: CardResolutionSource =
    before != null ? 'scryfall_exact' : card.name.toLowerCase() === name.trim().toLowerCase() ? 'scryfall_exact' : 'scryfall_fuzzy';

  return { requestedName: name, canonicalName: card.name, card, source };
}

/**
 * Normalize parsed deck entries to canonical Scryfall names where possible.
 */
export function normalizeParsedCardNames(
  entries: Array<{ name: string; quantity: number; rawLine?: string }>
): { entries: Array<{ name: string; quantity: number; rawLine?: string }>; renamed: string[]; unresolved: string[] } {
  const renamed: string[] = [];
  const unresolved: string[] = [];
  const out = entries.map((e) => {
    const resolved = resolveCardNameSync(e.name);
    if (!resolved) {
      unresolved.push(e.name);
      return e;
    }
    if (resolved.canonicalName !== e.name) {
      renamed.push(`${e.name} → ${resolved.canonicalName}`);
    }
    return { ...e, name: resolved.canonicalName };
  });
  return { entries: out, renamed, unresolved };
}

export interface BatchResolveResult {
  resolved: ResolvedCard[];
  unresolved: string[];
}

/**
 * Resolve many card names: local DB first, then Scryfall /cards/collection batches, then per-name fallback.
 */
export async function resolveCardNamesBatch(
  names: string[],
  options?: { delayMs?: number }
): Promise<BatchResolveResult> {
  const delayMs = options?.delayMs ?? 50;
  const resolved: ResolvedCard[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const needsApi: string[] = [];

  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const sync = resolveCardNameSync(name);
    if (sync) {
      resolved.push(sync);
    } else {
      needsApi.push(name);
    }
  }

  if (needsApi.length > 0) {
    const collection = await fetchScryfallCollectionByNames(needsApi);
    const stillMissing: string[] = [];

    for (const name of needsApi) {
      const card = collection.get(name.toLowerCase());
      if (card) {
        resolved.push({
          requestedName: name,
          canonicalName: card.name,
          card,
          source: 'scryfall_exact',
        });
      } else {
        stillMissing.push(name);
      }
    }

    for (const name of stillMissing) {
      const asyncRes = await resolveCardName(name);
      if (asyncRes) {
        resolved.push(asyncRes);
      } else {
        unresolved.push(name);
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  return { resolved, unresolved };
}

/**
 * FTS suggestions for repair prompts when names fail to resolve.
 */
export function suggestCardNamesFts(name: string, limit: number = 5): string[] {
  if (!isDatabaseReady()) return [];
  const q = ftsQueryFromName(name);
  if (!q) return [];
  try {
    return searchCardsFTS(q, limit).map((c) => c.name);
  } catch {
    return [];
  }
}
