/**
 * edhrec.ts
 * 
 * EDHREC JSON API client for fetching card suggestions.
 * Provides helpers to get popular cards and lands based on color identity.
 */

import { EdhrecCardSuggestion, EdhrecTheme } from './types';

/**
 * EDHREC JSON API base URL
 */
const EDHREC_BASE = 'https://json.edhrec.com/pages';

/**
 * In-memory cache for EDHREC JSON responses
 * Key: full URL, Value: parsed JSON
 */
const edhrecCache: Map<string, any> = new Map();

/**
 * Color identity to guild/shard/clan name mappings
 */
const COLOR_COMBINATIONS: Record<string, string> = {
  // Monocolor
  'W': 'mono-white',
  'U': 'mono-blue',
  'B': 'mono-black',
  'R': 'mono-red',
  'G': 'mono-green',
  
  // 2-color (guilds)
  'UW': 'azorius',
  'WU': 'azorius',
  'BU': 'dimir',
  'UB': 'dimir',
  'BR': 'rakdos',
  'RB': 'rakdos',
  'GR': 'gruul',
  'RG': 'gruul',
  'GW': 'selesnya',
  'WG': 'selesnya',
  'BW': 'orzhov',
  'WB': 'orzhov',
  'RU': 'izzet',
  'UR': 'izzet',
  'BG': 'golgari',
  'GB': 'golgari',
  'RW': 'boros',
  'WR': 'boros',
  'GU': 'simic',
  'UG': 'simic',
  
  // 3-color (shards/wedges)
  'BUW': 'esper',
  'UBW': 'esper',
  'WUB': 'esper',
  'WBU': 'esper',
  'BWU': 'esper',
  'UWB': 'esper',
  
  'BRU': 'grixis',
  'RBU': 'grixis',
  'UBR': 'grixis',
  'URB': 'grixis',
  'BUR': 'grixis',
  'RUB': 'grixis',
  
  'BRG': 'jund',
  'RBG': 'jund',
  'GBR': 'jund',
  'GRB': 'jund',
  'BGR': 'jund',
  'RGB': 'jund',
  
  'GRW': 'naya',
  'RGW': 'naya',
  'WGR': 'naya',
  'WRG': 'naya',
  'GWR': 'naya',
  'RWG': 'naya',
  
  'GUW': 'bant',
  'UGW': 'bant',
  'WGU': 'bant',
  'WUG': 'bant',
  'GWU': 'bant',
  'UWG': 'bant',
  
  'BGW': 'abzan',
  'GBW': 'abzan',
  'WBG': 'abzan',
  'WGB': 'abzan',
  'BWG': 'abzan',
  'GWB': 'abzan',
  
  'RUW': 'jeskai',
  'URW': 'jeskai',
  'WRU': 'jeskai',
  'WUR': 'jeskai',
  'RWU': 'jeskai',
  'UWR': 'jeskai',
  
  'BGU': 'sultai',
  'GBU': 'sultai',
  'UBG': 'sultai',
  'UGB': 'sultai',
  'BUG': 'sultai',
  'GUB': 'sultai',
  
  'BRW': 'mardu',
  'RBW': 'mardu',
  'WBR': 'mardu',
  'WRB': 'mardu',
  'BWR': 'mardu',
  'RWB': 'mardu',
  
  'GRU': 'temur',
  'RGU': 'temur',
  'UGR': 'temur',
  'URG': 'temur',
  'GUR': 'temur',
  'RUG': 'temur',
  
  // 4-color (nephilim)
  'BRUW': 'yore-tiller',
  'BRGU': 'glint-eye',
  'BRGW': 'dune-brood',
  'GRUW': 'ink-treader',
  'BGUW': 'witch-maw',
  
  // 5-color
  'BGRUW': 'five-color',
  'WUBRG': 'five-color'
};

/**
 * Fetches JSON from EDHREC API with caching
 * 
 * @param pathOrUrl - Either a full URL or a relative path (e.g., "top/white.json")
 * @returns Parsed JSON response
 * @throws Error if fetch fails or JSON is invalid
 */
async function fetchEdhrecJson(pathOrUrl: string): Promise<any> {
  // Determine full URL
  const url = pathOrUrl.startsWith('http') 
    ? pathOrUrl 
    : `${EDHREC_BASE}/${pathOrUrl}`;

  // Check cache
  if (edhrecCache.has(url)) {
    return edhrecCache.get(url);
  }

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`EDHREC fetch failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    
    // Cache the result
    edhrecCache.set(url, json);
    
    return json;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch EDHREC data from ${url}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Normalizes EDHREC inclusion to 0–1. Values above 1 are treated as whole percentages (e.g. 65 → 0.65).
 */
function normalizeEdhrecInclusion(raw: unknown): number | undefined {
  if (raw == null || typeof raw !== 'number' || Number.isNaN(raw)) {
    return undefined;
  }
  if (raw > 1) {
    return Math.min(raw / 100, 1);
  }
  return Math.min(Math.max(raw, 0), 1);
}

function cardviewToSuggestion(
  card: Record<string, unknown>,
  index: number,
  sourceTag: string
): EdhrecCardSuggestion | null {
  const name = card.name;
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }

  const rank =
    typeof card.rank === 'number' && !Number.isNaN(card.rank)
      ? card.rank
      : index + 1;

  const inclusionRaw =
    card.inclusion ??
    card.inclusion_rate ??
    card.inclusionRate ??
    (typeof card.stats === 'object' && card.stats !== null
      ? (card.stats as Record<string, unknown>).inclusion
      : undefined);
  const inclusionRate = normalizeEdhrecInclusion(inclusionRaw);

  let numDecks: number | undefined;
  if (typeof card.num_decks === 'number' && !Number.isNaN(card.num_decks)) {
    numDecks = card.num_decks;
  } else if (typeof card.numDecks === 'number' && !Number.isNaN(card.numDecks)) {
    numDecks = card.numDecks;
  }

  const saltRaw = card.salt_score ?? card.salt;
  const saltScore =
    typeof saltRaw === 'number' && !Number.isNaN(saltRaw) ? saltRaw : undefined;

  const synRaw = card.synergy_score ?? card.synergy;
  const synergyScore =
    typeof synRaw === 'number' && !Number.isNaN(synRaw) ? synRaw : undefined;

  let label: string | undefined;
  if (typeof card.label === 'string' && card.label.length > 0) {
    label = card.label;
  } else if (Array.isArray(card.labels) && typeof card.labels[0] === 'string') {
    label = card.labels[0];
  }

  const url = typeof card.url === 'string' ? card.url : undefined;

  return {
    name,
    url,
    rank,
    saltScore,
    synergyScore,
    category: sourceTag,
    inclusionRate,
    numDecks,
    label,
  };
}

/**
 * Extracts card suggestions from EDHREC JSON response.
 *
 * Handles `container.json_dict.cardlists[].cardviews`, top-level `cardlists`, `cardviews`, or `cards`.
 * Maps `inclusion` → {@link EdhrecCardSuggestion.inclusionRate}, optional `label`, `num_decks`, scores.
 * `rank` uses EDHREC `rank` when present; otherwise list position (1-based).
 *
 * @param json - Raw EDHREC JSON response
 * @param sourceTag - Category/source identifier (e.g., "top/white")
 */
export function extractEdhrecSuggestionsFromJson(
  json: unknown,
  sourceTag: string
): EdhrecCardSuggestion[] {
  const suggestions: EdhrecCardSuggestion[] = [];
  const root = json as Record<string, unknown>;

  let cardData: Record<string, unknown>[] = [];

  const container = root.container as Record<string, unknown> | undefined;
  const jsonDict = container?.json_dict as Record<string, unknown> | undefined;
  if (Array.isArray(jsonDict?.cardlists)) {
    for (const cardlist of jsonDict.cardlists as Record<string, unknown>[]) {
      if (Array.isArray(cardlist.cardviews)) {
        cardData.push(...(cardlist.cardviews as Record<string, unknown>[]));
      }
    }
  } else if (Array.isArray(root.cardlists)) {
    for (const cardlist of root.cardlists as Record<string, unknown>[]) {
      if (Array.isArray(cardlist.cardviews)) {
        cardData.push(...(cardlist.cardviews as Record<string, unknown>[]));
      }
    }
  } else if (Array.isArray(root.cardviews)) {
    cardData = root.cardviews as Record<string, unknown>[];
  } else if (Array.isArray(root.cards)) {
    cardData = root.cards as Record<string, unknown>[];
  }

  for (let i = 0; i < cardData.length; i++) {
    const row = cardviewToSuggestion(cardData[i], i, sourceTag);
    if (row) {
      suggestions.push(row);
    }
  }

  return suggestions;
}

/**
 * Normalizes color identity array to a sorted string
 * 
 * @param colorIdentity - Array of color letters (W, U, B, R, G)
 * @returns Sorted color string (e.g., ["B", "G", "U"] → "BGU")
 */
function normalizeColorIdentity(colorIdentity: string[]): string {
  // Standard WUBRG order
  const order = ['W', 'U', 'B', 'R', 'G'];
  return colorIdentity
    .filter(c => order.includes(c))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .join('');
}

/**
 * Gets top cards for a given color identity from EDHREC
 * 
 * @param colorIdentity - Array of color letters (W, U, B, R, G)
 * @param limit - Maximum number of suggestions to return (default: 50)
 * @returns Array of card suggestions
 * 
 * Strategy:
 * - Colorless: Use top/colorless.json
 * - Monocolor: Use top/{color}.json
 * - Multicolor: Combine top/multicolor.json + individual monocolor pages
 * 
 * This is a first-pass heuristic and will be refined over time.
 */
export async function getTopCardsForColorIdentity(
  colorIdentity: string[],
  limit: number = 50
): Promise<EdhrecCardSuggestion[]> {
  const suggestions: EdhrecCardSuggestion[] = [];
  const seen = new Set<string>(); // Track card names to avoid duplicates

  try {
    if (colorIdentity.length === 0) {
      // Colorless
      const json = await fetchEdhrecJson('top/colorless.json');
      const extracted = extractEdhrecSuggestionsFromJson(json, 'top/colorless');
      
      for (const sug of extracted) {
        if (!seen.has(sug.name)) {
          suggestions.push(sug);
          seen.add(sug.name);
        }
      }
    } else if (colorIdentity.length === 1) {
      // Monocolor
      const colorMap: Record<string, string> = {
        'W': 'white',
        'U': 'blue',
        'B': 'black',
        'R': 'red',
        'G': 'green'
      };
      
      const colorName = colorMap[colorIdentity[0]];
      if (colorName) {
        const json = await fetchEdhrecJson(`top/${colorName}.json`);
        const extracted = extractEdhrecSuggestionsFromJson(json, `top/${colorName}`);
        
        for (const sug of extracted) {
          if (!seen.has(sug.name)) {
            suggestions.push(sug);
            seen.add(sug.name);
          }
        }
      }
    } else {
      // Multicolor: fetch top/multicolor.json
      const multiJson = await fetchEdhrecJson('top/multicolor.json');
      const multiExtracted = extractEdhrecSuggestionsFromJson(multiJson, 'top/multicolor');
      
      for (const sug of multiExtracted) {
        if (!seen.has(sug.name)) {
          suggestions.push(sug);
          seen.add(sug.name);
        }
      }
      
      // Also fetch individual monocolor pages for each color in identity
      const colorMap: Record<string, string> = {
        'W': 'white',
        'U': 'blue',
        'B': 'black',
        'R': 'red',
        'G': 'green'
      };
      
      for (const color of colorIdentity) {
        const colorName = colorMap[color];
        if (colorName) {
          try {
            const json = await fetchEdhrecJson(`top/${colorName}.json`);
            const extracted = extractEdhrecSuggestionsFromJson(json, `top/${colorName}`);
            
            for (const sug of extracted) {
              if (!seen.has(sug.name)) {
                suggestions.push(sug);
                seen.add(sug.name);
              }
            }
          } catch {
            // Ignore errors for individual color pages
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not fetch top cards for color identity ${colorIdentity.join('')}:`, error);
  }

  // Return up to limit suggestions
  return suggestions.slice(0, limit);
}

/**
 * Gets top lands for a given color identity from EDHREC
 * 
 * @param colorIdentity - Array of color letters (W, U, B, R, G)
 * @param limit - Maximum number of suggestions to return (default: 50)
 * @returns Array of land card suggestions
 * 
 * Strategy:
 * - Colorless: Use lands/colorless.json
 * - Monocolor: Use lands/mono-{color}.json (e.g., lands/mono-white.json)
 * - Multicolor: Fetch mono pages for each color + generic lands
 * 
 * This is a first-pass heuristic and will be refined over time.
 */
export async function getTopLandsForColorIdentity(
  colorIdentity: string[],
  limit: number = 50
): Promise<EdhrecCardSuggestion[]> {
  const suggestions: EdhrecCardSuggestion[] = [];
  const seen = new Set<string>();

  try {
    const normalized = normalizeColorIdentity(colorIdentity);
    
    if (normalized === '') {
      // Colorless
      try {
        const json = await fetchEdhrecJson('lands/colorless.json');
        const extracted = extractEdhrecSuggestionsFromJson(json, 'lands/colorless');
        
        for (const sug of extracted) {
          if (!seen.has(sug.name)) {
            suggestions.push(sug);
            seen.add(sug.name);
          }
        }
      } catch (error) {
        console.warn('Warning: Could not fetch lands/colorless.json:', error);
      }
    } else {
      // Map color letters to mono-color land pages
      const colorMap: Record<string, string> = {
        'W': 'mono-white',
        'U': 'mono-blue',
        'B': 'mono-black',
        'R': 'mono-red',
        'G': 'mono-green'
      };
      
      // Fetch mono-color land pages for each color in the identity
      for (const color of normalized) {
        const landPage = colorMap[color];
        if (landPage) {
          try {
            const json = await fetchEdhrecJson(`lands/${landPage}.json`);
            const extracted = extractEdhrecSuggestionsFromJson(json, `lands/${landPage}`);
            
            for (const sug of extracted) {
              if (!seen.has(sug.name)) {
                suggestions.push(sug);
                seen.add(sug.name);
              }
            }
          } catch {
            // Ignore errors for individual land pages
          }
        }
      }
      
      // Also fetch generic lands page for utility lands
      try {
        const json = await fetchEdhrecJson('lands/lands.json');
        const extracted = extractEdhrecSuggestionsFromJson(json, 'lands/lands');
        
        for (const sug of extracted) {
          if (!seen.has(sug.name)) {
            suggestions.push(sug);
            seen.add(sug.name);
          }
        }
      } catch {
        // Ignore
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not fetch lands for color identity ${colorIdentity.join('')}:`, error);
  }

  // Sort by rank (lower is better); missing rank sorts last
  suggestions.sort(
    (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
  );

  return suggestions.slice(0, limit);
}

/**
 * Normalize commander name to EDHREC slug (e.g. "Atraxa, Praetors' Voice" -> "atraxa-praetors-voice").
 */
export function commanderNameToSlug(commanderName: string): string {
  return commanderName
    .trim()
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/,/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Gets card suggestions for a specific commander from EDHREC.
 * Uses commanders/{slug}.json when available. Returns [] on 404 or parse failure.
 *
 * @param slug - Commander slug (e.g. "atraxa-praetors-voice"); use commanderNameToSlug(name) to build
 * @param limit - Max suggestions to return (default 80)
 */
export async function getCardsForCommander(
  slug: string,
  limit: number = 80
): Promise<EdhrecCardSuggestion[]> {
  const path = `commanders/${slug}.json`;
  try {
    const json = await fetchEdhrecJson(path);
    const extracted = extractEdhrecSuggestionsFromJson(json, `commanders/${slug}`);
    return extracted.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Discovers available themes/archetypes for a commander from EDHREC.
 * Parses the commander page JSON for theme links (e.g. tokens, voltron, counters).
 *
 * @param slug - Commander slug
 * @returns Array of available themes, or [] if not found
 */
export async function getThemesForCommander(slug: string): Promise<EdhrecTheme[]> {
  const path = `commanders/${slug}.json`;
  try {
    const json = await fetchEdhrecJson(path);
    const themes: EdhrecTheme[] = [];

    const panels = json.panels ?? json.container?.json_dict?.panels ?? [];
    if (Array.isArray(panels)) {
      for (const panel of panels) {
        if (panel.tag === 'themes' && Array.isArray(panel.entries)) {
          for (const entry of panel.entries) {
            if (entry.name && entry.slug) {
              themes.push({
                name: entry.name,
                slug: entry.slug,
                count: entry.count ?? entry.num_decks,
              });
            }
          }
        }
      }
    }

    // Fallback: check for themes in the header/navigation
    const header = json.container?.json_dict?.header ?? json.header;
    if (header?.themes && Array.isArray(header.themes)) {
      for (const t of header.themes) {
        if (t.value && !themes.some(existing => existing.slug === t.value)) {
          themes.push({
            name: t.label ?? t.value,
            slug: t.value,
            count: t.count ?? t.num_decks,
          });
        }
      }
    }

    return themes;
  } catch {
    return [];
  }
}

/**
 * Gets card suggestions for a commander + specific theme from EDHREC.
 * Uses commanders/{slug}/{theme}.json endpoint.
 *
 * @param slug - Commander slug
 * @param theme - Theme slug (e.g., "tokens", "voltron", "+1+1-counters")
 * @param limit - Max suggestions (default 100)
 */
export async function getCardsForCommanderTheme(
  slug: string,
  theme: string,
  limit: number = 100
): Promise<EdhrecCardSuggestion[]> {
  const path = `commanders/${slug}/${theme}.json`;
  try {
    const json = await fetchEdhrecJson(path);
    const extracted = extractEdhrecSuggestionsFromJson(json, `commanders/${slug}/${theme}`);
    return extracted.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Gets lands for a specific color combination using the guild/shard name.
 * E.g., for ["W","U"] → lands/azorius.json
 *
 * Falls back to individual monocolor land pages if no match.
 *
 * @param colorIdentity - Array of color letters
 * @param limit - Max suggestions (default 40)
 */
export async function getLandsForColorCombination(
  colorIdentity: string[],
  limit: number = 40
): Promise<EdhrecCardSuggestion[]> {
  const suggestions: EdhrecCardSuggestion[] = [];
  const seen = new Set<string>();

  const normalized = normalizeColorIdentity(colorIdentity);
  const guildName = COLOR_COMBINATIONS[normalized];

  if (guildName && colorIdentity.length >= 2) {
    try {
      const json = await fetchEdhrecJson(`lands/${guildName}.json`);
      const extracted = extractEdhrecSuggestionsFromJson(json, `lands/${guildName}`);
      for (const sug of extracted) {
        if (!seen.has(sug.name)) {
          suggestions.push(sug);
          seen.add(sug.name);
        }
      }
    } catch {
      // Guild land page not found, fall through to monocolor
    }
  }

  // Supplement with monocolor land pages
  if (suggestions.length < limit) {
    const monoPages = await getTopLandsForColorIdentity(colorIdentity, limit);
    for (const sug of monoPages) {
      if (!seen.has(sug.name)) {
        suggestions.push(sug);
        seen.add(sug.name);
      }
    }
  }

  return suggestions.slice(0, limit);
}

/**
 * Gets EDHREC combo data for a specific commander.
 * Uses combos/{slug}.json endpoint.
 *
 * @param slug - Commander slug
 * @returns Array of combo descriptions, or [] if unavailable
 */
export async function getCombosForCommander(
  slug: string
): Promise<Array<{ cards: string[]; description?: string; colorIdentity?: string[] }>> {
  const path = `combos/${slug}.json`;
  try {
    const json = await fetchEdhrecJson(path);
    const combos: Array<{ cards: string[]; description?: string; colorIdentity?: string[] }> = [];

    const comboLists = json.container?.json_dict?.cardlists ?? json.cardlists ?? [];
    if (Array.isArray(comboLists)) {
      for (const list of comboLists) {
        const cards: string[] = [];
        if (Array.isArray(list.cardviews)) {
          for (const cv of list.cardviews) {
            if (cv.name) cards.push(cv.name);
          }
        }
        if (cards.length >= 2) {
          combos.push({
            cards,
            description: list.header ?? list.description,
            colorIdentity: list.color_identity,
          });
        }
      }
    }

    return combos;
  } catch {
    return [];
  }
}

/**
 * Sorts suggestions by synergy score descending (highest synergy first).
 * Cards without synergy scores are placed after scored cards.
 */
export function sortBySynergy(suggestions: EdhrecCardSuggestion[]): EdhrecCardSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const aScore = a.synergyScore ?? -999;
    const bScore = b.synergyScore ?? -999;
    return bScore - aScore;
  });
}

/**
 * Filters suggestions to exclude high-salt cards (above threshold).
 * Useful for Bracket 3 to avoid "unfun" cards.
 *
 * @param suggestions - Card list to filter
 * @param threshold - Salt score threshold (default 2.0)
 * @returns Filtered list and list of excluded high-salt card names
 */
export function filterHighSalt(
  suggestions: EdhrecCardSuggestion[],
  threshold: number = 2.0
): { filtered: EdhrecCardSuggestion[]; highSaltCards: string[] } {
  const filtered: EdhrecCardSuggestion[] = [];
  const highSaltCards: string[] = [];

  for (const s of suggestions) {
    if (s.saltScore != null && s.saltScore >= threshold) {
      highSaltCards.push(s.name);
    } else {
      filtered.push(s);
    }
  }

  return { filtered, highSaltCards };
}

/**
 * Gets a comprehensive EDHREC profile for a commander: cards, themes, combos, and lands.
 * Combines multiple endpoints for maximum data.
 *
 * @param commanderName - Commander card name
 * @param colorIdentity - Commander's color identity
 * @param options - Optional: theme slug, salt threshold, limits
 */
export async function getFullCommanderProfile(
  commanderName: string,
  colorIdentity: string[],
  options?: {
    theme?: string;
    saltThreshold?: number;
    cardLimit?: number;
    landLimit?: number;
  }
): Promise<{
  cards: EdhrecCardSuggestion[];
  lands: EdhrecCardSuggestion[];
  themes: EdhrecTheme[];
  combos: Array<{ cards: string[]; description?: string }>;
  highSaltCards: string[];
  sourcesUsed: string[];
}> {
  const slug = commanderNameToSlug(commanderName);
  const cardLimit = options?.cardLimit ?? 120;
  const landLimit = options?.landLimit ?? 40;
  const saltThreshold = options?.saltThreshold ?? 2.5;
  const sourcesUsed: string[] = [];

  // Parallel fetch for performance
  const [commanderCards, themes, combos, lands] = await Promise.all([
    options?.theme
      ? getCardsForCommanderTheme(slug, options.theme, cardLimit)
      : getCardsForCommander(slug, cardLimit),
    getThemesForCommander(slug),
    getCombosForCommander(slug),
    getLandsForColorCombination(colorIdentity, landLimit),
  ]);

  sourcesUsed.push(`commanders/${slug}.json`);
  if (options?.theme) {
    sourcesUsed.push(`commanders/${slug}/${options.theme}.json`);
  }
  sourcesUsed.push(`combos/${slug}.json`);
  sourcesUsed.push(`lands/${normalizeColorIdentity(colorIdentity) ? COLOR_COMBINATIONS[normalizeColorIdentity(colorIdentity)] ?? 'mono' : 'colorless'}.json`);

  // Supplement with color-based cards for breadth
  const colorCards = await getTopCardsForColorIdentity(colorIdentity, 80);
  sourcesUsed.push('top/[color].json');

  // Merge and deduplicate, preferring commander-specific data
  const seen = new Set<string>();
  const allCards: EdhrecCardSuggestion[] = [];
  for (const c of commanderCards) {
    if (!seen.has(c.name)) {
      allCards.push(c);
      seen.add(c.name);
    }
  }
  for (const c of colorCards) {
    if (!seen.has(c.name)) {
      allCards.push(c);
      seen.add(c.name);
    }
  }

  // Sort by synergy, then filter salt
  const sorted = sortBySynergy(allCards);
  const { filtered, highSaltCards } = filterHighSalt(sorted, saltThreshold);

  return {
    cards: filtered.slice(0, cardLimit),
    lands,
    themes,
    combos,
    highSaltCards,
    sourcesUsed,
  };
}

/**
 * Clears the EDHREC cache (useful for testing)
 */
export function clearEdhrecCache(): void {
  edhrecCache.clear();
}

