/**
 * EDHREC suggestion scoring aligned with a preferred theme / strategy slug.
 */

import type { EdhrecCardSuggestion } from './types';
import { getStrategyProfile } from './strategyProfiles';

const THEME_SLUG_ALIASES: Record<string, string[]> = {
  counters: ['+1/+1', 'counter', 'counters', 'proliferate'],
  'group-slug': ['group slug', 'group-slug', 'grouphug'],
  superfriends: ['planeswalker', 'superfriends', 'proliferate'],
  spellslinger: ['spellslinger', 'instants', 'sorceries'],
};

/** Map EDHREC theme labels that differ from our strategy slugs. */
export function normalizeThemeSlug(slug?: string): string | undefined {
  if (!slug?.trim()) return undefined;
  const s = slug.trim().toLowerCase();
  if (s === 'proliferate') return 'counters';
  return s;
}

function slugMatchesField(slug: string, field?: string): boolean {
  if (!field) return false;
  const f = field.toLowerCase();
  if (f.includes(slug)) return true;
  const aliases = THEME_SLUG_ALIASES[slug];
  return aliases?.some((a) => f.includes(a)) ?? false;
}

/**
 * Boost EDHREC cards that match the selected theme slug (category, label, inclusion).
 */
export function scoreEdhrecSuggestionForTheme(
  suggestion: EdhrecCardSuggestion,
  themeSlug?: string
): number {
  let boost = suggestion.synergyScore ?? 0;
  if (!themeSlug) return boost;

  const slug = normalizeThemeSlug(themeSlug) ?? themeSlug.toLowerCase();
  const profile = getStrategyProfile(slug);

  if (slugMatchesField(slug, suggestion.category)) boost += 0.55;
  if (slugMatchesField(slug, suggestion.label)) boost += 0.35;

  const inclusion = suggestion.inclusionRate;
  if (inclusion != null) {
    if (inclusion >= 0.25) boost += 0.25;
    else if (inclusion >= 0.1) boost += 0.12;
    else if (inclusion < 0.05) boost -= 0.35;
  }

  if (suggestion.rank != null && suggestion.rank <= 30) boost += 0.2;
  else if (suggestion.rank != null && suggestion.rank <= 80) boost += 0.08;

  if (profile?.keyPatterns?.length && suggestion.name) {
    // Name-only cards get neutral boost; oracle matching happens at pick time
    boost += 0.05;
  }

  return boost;
}

/**
 * Map inclusion rate to 0–100 for search_cards display.
 */
export function edhrecInclusionPercent(suggestion: EdhrecCardSuggestion): number | null {
  if (suggestion.inclusionRate == null) return null;
  return Math.round(suggestion.inclusionRate * 1000) / 10;
}

/** Sort comparator: higher theme score first (for EDHREC pools). */
export function compareEdhrecSuggestionsForTheme(
  a: EdhrecCardSuggestion,
  b: EdhrecCardSuggestion,
  themeSlug?: string
): number {
  return scoreEdhrecSuggestionForTheme(a, themeSlug) - scoreEdhrecSuggestionForTheme(b, themeSlug);
}
