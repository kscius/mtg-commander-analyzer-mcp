/**
 * Structured cut/add/swap recommendations from analysis deficits, EDHREC, and strategy profiles.
 */

import type {
  AnalyzeDeckInput,
  CategorySummary,
  DeckRecommendations,
  DeckRecommendationSwap,
  EdhrecCardSuggestion,
  ParsedCardEntry,
  PrioritizedAction,
} from './types';
import { getCardByName } from './scryfall';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  getSecondaryTemplateCategories,
  ScryCard,
} from './autoTags';
import { getOracleText, getPrimaryTypeLine } from './scryfallNormalize';
import { scoreEdhrecSuggestionForTheme } from './edhrecStrategyScoring';
import { scoreCardForStrategy, scoreDeckSynergy } from './synergyScorer';
import { getStrategyProfile } from './strategyProfiles';

function impactForCategory(cat: CategorySummary): 'high' | 'medium' | 'low' {
  if (cat.min == null) return 'medium';
  const deficit = cat.min - cat.count;
  if (deficit >= 3) return 'high';
  if (deficit >= 1) return 'medium';
  return 'low';
}

function rankEdhrecAdd(
  suggestion: EdhrecCardSuggestion,
  card: ReturnType<typeof getCardByName>,
  categoryName: string,
  themeSlug: string | undefined,
  commanderName?: string
): number {
  if (!card) return -1;
  const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, getDefaultBracket3Options('bracket3'));
  const primary = getPrimaryTemplateCategory(tags);
  if (primary !== categoryName && !tags.includes(categoryName.replace(/s$/, ''))) return -1;
  const scry: ScryCard = {
    name: card.name,
    oracle_text: getOracleText(card),
    type_line: getPrimaryTypeLine(card),
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    tags: card.tags,
  };
  return (
    scoreEdhrecSuggestionForTheme(suggestion, themeSlug) +
    scoreCardForStrategy(scry, themeSlug ?? '', commanderName) * 0.85
  );
}

function pickBestAdd(
  edhrecPool: EdhrecCardSuggestion[],
  categoryName: string,
  inDeck: Set<string>,
  themeSlug: string | undefined,
  commanderName?: string
): string | null {
  let best: { name: string; score: number } | null = null;
  for (const s of edhrecPool) {
    if (inDeck.has(s.name.toLowerCase())) continue;
    const card = getCardByName(s.name);
    if (!card || getPrimaryTypeLine(card).toLowerCase().includes('land')) continue;
    const score = rankEdhrecAdd(s, card, categoryName, themeSlug, commanderName);
    if (score < 0) continue;
    if (!best || score > best.score) best = { name: s.name, score };
  }
  return best?.name ?? null;
}

/**
 * Build cut/add/swap suggestions from category status and optional EDHREC pool.
 */
export function buildDeckRecommendations(
  cards: ParsedCardEntry[],
  categories: CategorySummary[],
  input: AnalyzeDeckInput,
  edhrecPool?: EdhrecCardSuggestion[]
): DeckRecommendations {
  const cuts: DeckRecommendations['cuts'] = [];
  const adds: DeckRecommendations['adds'] = [];
  const swaps: DeckRecommendationSwap[] = [];
  const prioritizedActions: PrioritizedAction[] = [];
  let priorityCounter = 1;

  const themeSlug = input.preferredStrategy;
  const commanderName = input.commanderName;

  // Collect off-theme cuts for swap pairing first; emit into prioritizedActions
  // only after category gap closers so brief-mode agents fix `below` slots first
  // (docs/synergy-scoring-explained.md — "Fix legality and categories first").
  const offThemePrioritized: PrioritizedAction[] = [];
  const { offThemeCards } = scoreDeckSynergy(cards, themeSlug, commanderName);
  for (const name of offThemeCards.slice(0, 5)) {
    const reason = `Low thematic fit for "${themeSlug}" — frees a slot for on-theme cards.`;
    cuts.push({ name, reason, priority: priorityCounter++, category: 'synergy' });
    offThemePrioritized.push({
      priority: priorityCounter - 1,
      action: 'cut',
      category: 'synergy',
      detail: reason,
      suggestedCard: name,
    });
  }

  const tagOpts = getDefaultBracket3Options('bracket3');
  const inDeck = new Set(cards.map((c) => c.name.toLowerCase()));
  const usedSwapCuts = new Set<string>();

  const belowCats = categories.filter((c) => c.status === 'below' && c.min != null);
  belowCats.sort((a, b) => b.min! - b.count - (a.min! - a.count));

  for (const cat of belowCats) {
    const need = (cat.min ?? 0) - cat.count;
    if (need <= 0) continue;
    const impact = impactForCategory(cat);

    const addCandidate =
      edhrecPool?.length ?
        pickBestAdd(edhrecPool, cat.name, inDeck, themeSlug, commanderName)
      : null;

    const cutForSwap = cuts.find(
      (c) =>
        (c.category === 'synergy' || c.category === cat.name) &&
        !usedSwapCuts.has(c.name.toLowerCase())
    );
    if (cutForSwap && addCandidate) {
      usedSwapCuts.add(cutForSwap.name.toLowerCase());
      const reason = `Swap improves ${cat.name} (${cat.count}/${cat.min} min) while staying on-theme for ${themeSlug ?? 'deck'}.`;
      swaps.push({
        cut: cutForSwap.name,
        add: addCandidate,
        reason,
        category: cat.name,
        priority: priorityCounter++,
        impact,
      });
      prioritizedActions.push({
        priority: priorityCounter - 1,
        action: 'swap',
        category: cat.name,
        detail: reason,
        suggestedCard: addCandidate,
      });
      inDeck.add(addCandidate.toLowerCase());
      continue;
    }

    if (addCandidate) {
      adds.push({
        name: addCandidate,
        reason: `On-theme EDHREC pick for ${cat.name}; deck is ${cat.count}/${cat.min} (need +${need}).`,
        category: cat.name,
        priority: priorityCounter++,
      });
      prioritizedActions.push({
        priority: priorityCounter - 1,
        action: 'add',
        category: cat.name,
        detail: `Add ${addCandidate} to reach ${cat.name} minimum.`,
        suggestedCard: addCandidate,
        suggestedSearch: { category: cat.name, preferredStrategy: themeSlug },
      });
    } else {
      adds.push({
        name: '(use search_cards)',
        reason: `Category "${cat.name}" below minimum (${cat.count}/${cat.min}).`,
        category: cat.name,
        priority: priorityCounter++,
      });
      prioritizedActions.push({
        priority: priorityCounter - 1,
        action: 'search',
        category: cat.name,
        detail: `Need ${need} more ${cat.name} card(s).`,
        suggestedSearch: { category: cat.name, preferredStrategy: themeSlug },
      });
    }
  }

  if (categories.some((c) => c.status === 'above' && c.max != null)) {
    for (const entry of cards) {
      const card = getCardByName(entry.name);
      if (!card || getPrimaryTypeLine(card).toLowerCase().includes('land')) continue;
      const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, tagOpts);
      const primary = getPrimaryTemplateCategory(tags);
      if (!primary) continue;
      const cat = categories.find((c) => c.name === primary);
      if (cat?.status === 'above' && cat.max != null) {
        const reason = `"${primary}" above max (${cat.count}/${cat.max}) — trim for balance.`;
        if (!cuts.some((c) => c.name === entry.name)) {
          cuts.push({ name: entry.name, reason, priority: priorityCounter++, category: primary });
          prioritizedActions.push({
            priority: priorityCounter - 1,
            action: 'cut',
            category: primary,
            detail: reason,
            suggestedCard: entry.name,
          });
        }
      }
    }
  }

  // Off-theme cuts after category closers; skip cuts already paired into a swap.
  for (const cutAction of offThemePrioritized) {
    const name = cutAction.suggestedCard?.toLowerCase();
    if (name && usedSwapCuts.has(name)) continue;
    prioritizedActions.push({
      ...cutAction,
      priority: priorityCounter++,
    });
  }

  const synergyPackages: DeckRecommendations['synergyPackages'] = [];
  const profile = getStrategyProfile(themeSlug);
  if (profile?.synergyPackages?.length) {
    for (const pkg of profile.synergyPackages.slice(0, 3)) {
      const missing = pkg.cards.filter((n: string) => !inDeck.has(n.toLowerCase()));
      if (missing.length === 0) continue;
      synergyPackages.push({
        name: pkg.name,
        cards: pkg.cards,
        reason: `Strategy package; missing: ${missing.join(', ')}`,
        missingCards: missing,
      });
      if (missing.length <= 2) {
        prioritizedActions.push({
          priority: priorityCounter++,
          action: 'add',
          detail: `Package "${pkg.name}": add ${missing.join(' + ')}`,
          suggestedSearch: { preferredStrategy: themeSlug },
        });
      }
    }
  }

  const cappedActions = prioritizedActions.slice(0, 8).map((a, i) => ({
    ...a,
    priority: i + 1,
  }));

  return {
    cuts: cuts.slice(0, 10),
    adds: adds.slice(0, 12),
    swaps: swaps.slice(0, 8),
    synergyPackages,
    prioritizedActions: cappedActions,
  };
}

/** Expose secondary tags for synergy scoring paths. */
export function getCardRoleTags(card: ScryCard, tagOpts = getDefaultBracket3Options('bracket3')): {
  primary: string | null;
  secondary: string[];
  allTags: string[];
} {
  const allTags = card.tags?.length ? card.tags : autoTags(card, tagOpts);
  const primary = getPrimaryTemplateCategory(allTags);
  const secondary = getSecondaryTemplateCategories(allTags, primary);
  return { primary, secondary, allTags };
}
