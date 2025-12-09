/**
 * edhrec.ts
 * 
 * EDHREC JSON API client for fetching card suggestions.
 * Provides helpers to get popular cards and lands based on color identity.
 */

import { EdhrecCardSuggestion } from './types';

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
 * Extracts card suggestions from EDHREC JSON response
 * 
 * @param json - Raw EDHREC JSON response
 * @param sourceTag - Category/source identifier (e.g., "top/white")
 * @returns Array of EdhrecCardSuggestion objects
 * 
 * Note: EDHREC JSON structure varies by endpoint. This function attempts to handle
 * common patterns like "cardlists", "cards", etc. It may need refinement as we
 * encounter different endpoint structures.
 */
function extractSuggestionsFromJson(
  json: any,
  sourceTag: string
): EdhrecCardSuggestion[] {
  const suggestions: EdhrecCardSuggestion[] = [];

  // Try to find card list in the JSON structure
  // EDHREC endpoints have a nested structure: container.json_dict.cardlists
  let cardData: any[] = [];

  // Check for the common EDHREC structure: container.json_dict.cardlists
  if (json.container?.json_dict?.cardlists && Array.isArray(json.container.json_dict.cardlists)) {
    for (const cardlist of json.container.json_dict.cardlists) {
      if (cardlist.cardviews && Array.isArray(cardlist.cardviews)) {
        cardData.push(...cardlist.cardviews);
      }
    }
  }
  // Fallback: check for direct cardlists
  else if (json.cardlists && Array.isArray(json.cardlists)) {
    for (const cardlist of json.cardlists) {
      if (cardlist.cardviews && Array.isArray(cardlist.cardviews)) {
        cardData.push(...cardlist.cardviews);
      }
    }
  }
  // Fallback: direct cardviews array
  else if (json.cardviews && Array.isArray(json.cardviews)) {
    cardData = json.cardviews;
  }
  // Fallback: direct cards array
  else if (json.cards && Array.isArray(json.cards)) {
    cardData = json.cards;
  }

  // Extract suggestions from card data
  for (let i = 0; i < cardData.length; i++) {
    const card = cardData[i];
    
    if (!card || !card.name) {
      continue; // Skip invalid entries
    }

    suggestions.push({
      name: card.name,
      url: card.url || undefined,
      rank: card.rank ?? card.inclusion ?? (i + 1), // Prefer rank, then inclusion, then position
      saltScore: card.salt_score || card.salt || undefined,
      synergyScore: card.synergy_score || card.synergy || undefined,
      category: sourceTag
    });
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
      const extracted = extractSuggestionsFromJson(json, 'top/colorless');
      
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
        const extracted = extractSuggestionsFromJson(json, `top/${colorName}`);
        
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
      const multiExtracted = extractSuggestionsFromJson(multiJson, 'top/multicolor');
      
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
            const extracted = extractSuggestionsFromJson(json, `top/${colorName}`);
            
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
        const extracted = extractSuggestionsFromJson(json, 'lands/colorless');
        
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
            const extracted = extractSuggestionsFromJson(json, `lands/${landPage}`);
            
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
        const extracted = extractSuggestionsFromJson(json, 'lands/lands');
        
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

  // Sort by rank/inclusion (lower is better/more popular)
  suggestions.sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) {
      return a.rank - b.rank;
    }
    return 0;
  });

  return suggestions.slice(0, limit);
}

/**
 * Clears the EDHREC cache (useful for testing)
 */
export function clearEdhrecCache(): void {
  edhrecCache.clear();
}

