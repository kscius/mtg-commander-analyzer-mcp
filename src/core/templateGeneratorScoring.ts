/**
 * Greedy deck generator constraints from template schema (interaction, combo_rules, packages, hints).
 */

import type { DeckTemplateValidated } from './templateSchema';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  ScryCard,
} from './autoTags';
import { getManaValue, getOracleText, getPrimaryTypeLine } from './scryfallNormalize';
import type { OracleCard } from './scryfall';
import { scoreCardForStrategy } from './synergyScorer';

export interface GeneratorPickState {
  tutorCount: number;
  fastManaCount: number;
  genericStapleCount: number;
  instantInteraction: number;
  cheapInteraction: number;
  packagePicks: Record<string, number>;
}

export function createGeneratorPickState(): GeneratorPickState {
  return {
    tutorCount: 0,
    fastManaCount: 0,
    genericStapleCount: 0,
    instantInteraction: 0,
    cheapInteraction: 0,
    packagePicks: {},
  };
}

export function tagsForOracle(card: OracleCard, tagCache: Map<string, string[]>): string[] {
  const key = card.name.toLowerCase();
  const cached = tagCache.get(key);
  if (cached) return cached;
  const scry: ScryCard = {
    name: card.name,
    oracle_text: getOracleText(card),
    type_line: getPrimaryTypeLine(card),
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    all_parts: card.all_parts,
    card_faces: card.card_faces,
    tags: card.tags,
  };
  const tags = autoTags(scry, getDefaultBracket3Options('bracket3'));
  tagCache.set(key, tags);
  return tags;
}

export function updateGeneratorStateAfterPick(
  state: GeneratorPickState,
  card: OracleCard,
  tags: string[]
): void {
  if (tags.includes('tutor')) state.tutorCount++;
  if (tags.includes('fast_mana')) state.fastManaCount++;
  const text = getOracleText(card).toLowerCase();
  const type = getPrimaryTypeLine(card).toLowerCase();
  const mv = getManaValue(card);
  if (
    type.includes('instant') &&
    (text.includes('destroy') || text.includes('counter') || text.includes('exile'))
  ) {
    state.instantInteraction++;
    if (mv <= 2) state.cheapInteraction++;
  }
}

export function violatesComboRules(
  tags: string[],
  comboRules: DeckTemplateValidated['combo_rules'] | undefined,
  state: GeneratorPickState
): boolean {
  if (!comboRules) return false;
  if (tags.includes('tutor') && state.tutorCount >= (comboRules.max_tutors_total ?? 5)) {
    return true;
  }
  if (tags.includes('fast_mana') && state.fastManaCount >= (comboRules.max_fast_mana ?? 3)) {
    return true;
  }
  return false;
}

export function interactionCoveragePickBonus(
  card: OracleCard,
  template: DeckTemplateValidated,
  state: GeneratorPickState
): number {
  const ic = template.interaction_coverage;
  if (!ic) return 0;
  let bonus = 0;
  const minInst = ic.min_instant_speed_total ?? 8;
  const minCheap = ic.min_cheap_interaction_mv2_or_less ?? 5;
  const text = getOracleText(card).toLowerCase();
  const type = getPrimaryTypeLine(card).toLowerCase();
  const mv = getManaValue(card);
  const isInteraction =
    type.includes('instant') &&
    (text.includes('destroy') || text.includes('counter') || text.includes('exile'));
  if (state.instantInteraction < minInst && isInteraction) bonus += 0.45;
  if (state.cheapInteraction < minCheap && isInteraction && mv <= 2) bonus += 0.35;
  return bonus;
}

export function generatorHintsPickAdjust(
  themeScore: number,
  cardScore: number,
  hints: DeckTemplateValidated['generator_hints'] | undefined,
  state: GeneratorPickState
): number {
  if (!hints) return 0;
  const maxGeneric = hints.max_generic_staples ?? 12;
  const onThemeTarget = hints.on_theme_ratio_target ?? 0.65;
  let adjust = 0;
  if (cardScore >= onThemeTarget * 0.9 || themeScore >= 0.5) {
    adjust += 0.15;
  } else if (state.genericStapleCount >= maxGeneric) {
    adjust -= 1.2;
  } else if (themeScore < 0.25 && (hints.prefer_on_theme_cards ?? true)) {
    adjust -= 0.4;
  }
  return adjust;
}

export function packagePickBonus(
  tags: string[],
  packages: DeckTemplateValidated['packages'] | undefined,
  state: GeneratorPickState
): number {
  if (!packages?.length) return 0;
  let bonus = 0;
  for (const pkg of packages) {
    const current = state.packagePicks[pkg.name] ?? 0;
    if (current >= pkg.max) continue;
    const pkgTags = pkg.tags.map((t) => t.toLowerCase());
    if (pkgTags.some((t) => tags.includes(t) || t === 'payoff' || t === 'enabler')) {
      bonus += 0.25;
    }
    if (pkgTags.includes('auto_from_edhrec') && current < pkg.min) {
      bonus += 0.35;
    }
  }
  return bonus;
}

export function recordPackagePick(
  tags: string[],
  packages: DeckTemplateValidated['packages'] | undefined,
  state: GeneratorPickState
): void {
  if (!packages?.length) return;
  for (const pkg of packages) {
    const pkgTags = pkg.tags.map((t) => t.toLowerCase());
    if (pkgTags.some((t) => tags.includes(t) || t === 'payoff' || t === 'enabler' || t === 'auto_from_edhrec')) {
      state.packagePicks[pkg.name] = (state.packagePicks[pkg.name] ?? 0) + 1;
    }
  }
}

export function combinedCardThemeScore(
  card: OracleCard,
  themeSlug: string | undefined,
  commanderName: string
): number {
  const scry: ScryCard = {
    name: card.name,
    oracle_text: getOracleText(card),
    type_line: getPrimaryTypeLine(card),
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    all_parts: card.all_parts,
    card_faces: card.card_faces,
    tags: card.tags,
  };
  return scoreCardForStrategy(scry, themeSlug ?? '', commanderName);
}
