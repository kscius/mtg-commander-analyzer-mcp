/**

 * Thematic coherence scoring for Commander decks vs a stated synergy slug.

 */



import { getCardByName } from './scryfall';

import {

  autoTags,

  getDefaultBracket3Options,

  getPrimaryTemplateCategory,

  ScryCard,

} from './autoTags';

import { getStrategyProfile, getStrategyScoringRules, strategyAntisynergyPenalty } from './strategyProfiles';

import { getOracleText, getPrimaryTypeLine } from './scryfallNormalize';

import type { CardSynergyScore, EdhrecCardSuggestion, ParsedCardEntry } from './types';

import { scoreEdhrecSuggestionForTheme } from './edhrecStrategyScoring';



export type SynergyRelevance = 'high' | 'medium' | 'low';



/** Deck-level off-theme threshold (0–1 card score). */

export const OFF_THEME_CARD_THRESHOLD = 0.42;



const STRATEGY_TAG_BOOST: Record<string, string[]> = {

  tokens: ['value_engine', 'win_condition'],

  voltron: ['protection', 'spot_removal'],

  counters: ['value_engine', 'protection'],

  reanimator: ['recursion', 'value_engine'],

  spellslinger: ['card_draw', 'spell_copy'],

  artifacts: ['ramp', 'value_engine'],

  lands: ['ramp', 'value_engine'],

  tribal: ['value_engine', 'protection'],

  superfriends: ['protection', 'card_draw'],

  blink: ['protection', 'value_engine'],

  aristocrats: ['value_engine', 'spot_removal'],

  'group-slug': ['win_condition', 'value_engine'],

};



const OFF_THEME_PENALTY_TAGS = ['mass_land_denial', 'extra_turn', 'game_changer'];



const norm = (s: string): string =>

  s.toLowerCase().replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim();



function applyRoleBoost(tags: string[], text: string, slug: string): number {

  const rules = getStrategyScoringRules(slug);

  const roleBoost = rules?.roleBoost;

  if (!roleBoost) return 0;

  let bonus = 0;

  const t = norm(text);

  if (roleBoost.enabler != null && (tags.includes('ramp') || /create .* token|when .* enters|sacrifice/i.test(t))) {

    bonus += roleBoost.enabler;

  }

  if (roleBoost.payoff != null && (tags.includes('win_condition') || tags.includes('value_engine') || /whenever .* token|when .* dies/i.test(t))) {

    bonus += roleBoost.payoff;

  }

  return bonus;

}



/** Tribal: reward shared creature types with commander type line. */

function tribalTypeLineBonus(typeLine: string, commanderName?: string): number {

  if (!commanderName) return 0;

  const commander = getCardByName(commanderName);

  if (!commander) return 0;

  const cmdType = norm(getPrimaryTypeLine(commander));

  const cardType = norm(typeLine);

  const creatureTypes = [

    'elf',

    'dragon',

    'goblin',

    'zombie',

    'vampire',

    'wizard',

    'warrior',

    'soldier',

    'spirit',

    'angel',

    'demon',

    'merfolk',

    'beast',

    'cat',

    'bird',

    'sliver',

    'dinosaur',

    'human',

    'artifact',

    'elemental',

  ];

  for (const ct of creatureTypes) {

    if (cmdType.includes(ct) && cardType.includes(ct)) return 0.22;

  }

  if (/lord|choose a creature type|creature type you control/i.test(cardType + ' ' + getOracleText(commander))) {

    return 0.08;

  }

  return 0;

}



/**

 * Score a single card 0–1 for a strategy slug.

 */

export function scoreCardForStrategy(

  card: ScryCard,

  slug: string,

  commanderName?: string

): number {

  const rules = getStrategyScoringRules(slug);

  const boostTags = new Set(STRATEGY_TAG_BOOST[slug] ?? ['value_engine']);

  const tagOpts = getDefaultBracket3Options('bracket3');

  const text = norm(getOracleText(card));

  const name = norm(card.name ?? '');

  const typeLine = getPrimaryTypeLine(card);

  const tags = card.tags?.length ? card.tags : autoTags({ ...card, oracle_text: text, type_line: typeLine }, tagOpts);



  let cardScore = 0.2;



  if (tags.some((t) => boostTags.has(t))) cardScore += 0.2;

  const primary = getPrimaryTemplateCategory(tags);

  if (primary && boostTags.has(primary)) cardScore += 0.1;



  cardScore += applyRoleBoost(tags, text, slug);



  if (rules?.oracleBoost) {

    for (const rule of rules.oracleBoost) {

      try {

        if (new RegExp(rule.pattern, 'i').test(text)) cardScore += rule.weight;

      } catch {

        // invalid pattern — skip

      }

    }

  }

  if (rules?.tagBoost) {

    for (const t of rules.tagBoost) {

      if (tags.includes(t)) cardScore += 0.08;

    }

  }

  if (rules?.antiPatterns) {

    for (const ap of rules.antiPatterns) {

      try {

        if (new RegExp(ap.pattern, 'i').test(text)) cardScore -= ap.penalty;

      } catch {

        // skip

      }

    }

  }



  const profile = getStrategyProfile(slug);

  if (profile?.keyPatterns?.length) {

    for (const p of profile.keyPatterns) {

      try {

        if (new RegExp(p, 'i').test(text)) {

          cardScore += 0.18;

          break;

        }

      } catch {

        // skip invalid pattern

      }

    }

  }



  if (slug === 'tribal') {

    cardScore += tribalTypeLineBonus(typeLine, commanderName);

  }



  if (commanderName) {

    const cmd = norm(commanderName);

    const shortName = cmd.split(',')[0];

    if (text.includes(shortName) || name.includes(shortName)) {

      cardScore += 0.05;

    }

    const commanderCard = getCardByName(commanderName);

    const cmdOracle = commanderCard ? getOracleText(commanderCard) : '';

    if (cmdOracle) {

      const cmdWords = norm(cmdOracle)

        .split(/\W+/)

        .filter((w) => w.length > 4);

      const overlap = cmdWords.filter((w) => text.includes(w)).length;

      if (overlap >= 2) cardScore += 0.15;

    }

  }



  cardScore -= strategyAntisynergyPenalty(text, slug);



  if (tags.some((t) => OFF_THEME_PENALTY_TAGS.includes(t)) && slug !== 'group-slug') {

    cardScore -= 0.15;

  }



  return Math.min(1, Math.max(0, cardScore));

}



/**

 * Score 0–100 how well mainboard cards align with preferredStrategy (heuristic + rules).

 */

export function scoreDeckSynergy(

  cards: ParsedCardEntry[],

  preferredStrategy?: string,

  commanderName?: string

): { synergyScore: number; offThemeCards: string[] } {

  if (!preferredStrategy?.trim()) {

    return { synergyScore: 50, offThemeCards: [] };

  }



  const slug = preferredStrategy.trim().toLowerCase();

  const tagOpts = getDefaultBracket3Options('bracket3');



  let scored = 0;

  let total = 0;

  const offTheme: string[] = [];



  for (const entry of cards) {

    const card = getCardByName(entry.name);

    if (!card) continue;

    if (card.type_line?.toLowerCase().includes('land')) continue;



    total += entry.quantity;

    const scry: ScryCard = {

      name: card.name,

      oracle_text: card.oracle_text,

      type_line: card.type_line,

      mana_cost: card.mana_cost,

      cmc: card.cmc,

      all_parts: card.all_parts,

      tags: card.tags,

    };

    const cardScore = scoreCardForStrategy(scry, slug, commanderName);

    if (cardScore < OFF_THEME_CARD_THRESHOLD) offTheme.push(entry.name);

    scored += cardScore * entry.quantity;

  }



  const synergyScore = total > 0 ? Math.round((scored / total) * 100) : 0;

  return { synergyScore, offThemeCards: [...new Set(offTheme)].slice(0, 12) };

}



function relevanceFromNumeric(score: number): SynergyRelevance {

  if (score >= 0.75) return 'high';

  if (score >= OFF_THEME_CARD_THRESHOLD) return 'medium';

  return 'low';

}



/**

 * Score a single card vs preferredStrategy for search_cards sorting.

 */

export function scoreCardSynergyRelevance(

  cardName: string,

  preferredStrategy?: string,

  edhrec?: EdhrecCardSuggestion | null

): { synergyRelevance: SynergyRelevance; sortScore: number } {

  if (!preferredStrategy?.trim()) {

    return { synergyRelevance: 'medium', sortScore: 0 };

  }



  if (edhrec) {

    const themeScore = scoreEdhrecSuggestionForTheme(edhrec, preferredStrategy);

    const base = edhrec.synergyScore ?? 0;

    const sortScore = themeScore + base * 0.25 + (edhrec.inclusionRate ?? 0) * 0.15;

    return { synergyRelevance: relevanceFromNumeric(sortScore), sortScore };

  }



  const card = getCardByName(cardName);

  if (!card || card.type_line?.toLowerCase().includes('land')) {

    return { synergyRelevance: 'low', sortScore: 0.2 };

  }



  const scry: ScryCard = {

    name: card.name,

    oracle_text: card.oracle_text,

    type_line: card.type_line,

    mana_cost: card.mana_cost,

    cmc: card.cmc,

    all_parts: card.all_parts,

    tags: card.tags,

  };

  const sortScore = scoreCardForStrategy(scry, preferredStrategy.trim().toLowerCase());

  return { synergyRelevance: relevanceFromNumeric(sortScore), sortScore };

}

/**
 * Per-card synergy breakdown for analyze_deck (nonlands, capped list).
 */
export function buildCardSynergyScores(
  cards: ParsedCardEntry[],
  preferredStrategy?: string,
  commanderName?: string,
  limit = 30
): CardSynergyScore[] {
  if (!preferredStrategy?.trim()) return [];

  const slug = preferredStrategy.trim().toLowerCase();
  const tagOpts = getDefaultBracket3Options('bracket3');
  const scored: CardSynergyScore[] = [];

  for (const entry of cards) {
    const card = getCardByName(entry.name);
    if (!card || card.type_line?.toLowerCase().includes('land')) continue;

    const scry: ScryCard = {
      name: card.name,
      oracle_text: card.oracle_text,
      type_line: card.type_line,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      all_parts: card.all_parts,
      tags: card.tags?.length ? card.tags : autoTags(card, tagOpts),
    };
    const raw = scoreCardForStrategy(scry, slug, commanderName);
    scored.push({
      name: entry.name,
      score: Math.round(raw * 100),
      relevance: relevanceFromNumeric(raw),
    });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit);
}


