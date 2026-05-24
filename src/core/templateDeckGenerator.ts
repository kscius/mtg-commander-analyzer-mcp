/**
 * templateDeckGenerator.ts
 *
 * Template-driven deck generator for Bracket 3.
 * Fills 99 cards using template (mana_base, categories, curve, combo_rules, generator_hints).
 * EDHREC is primary source; local DB search fills underfilled categories (no LLM).
 */

import { getCardByName, OracleCard } from './scryfall';
import { loadDeckTemplate } from './templates';
import { applyMetaAdaptations, type DeckTemplateValidated } from './templateSchema';
import {
  getTopCardsForColorIdentity,
  getCardsForCommander,
  getFullCommanderProfile,
  getLandsForColorCombination,
  sortBySynergy,
  commanderNameToSlug,
} from './edhrec';
import type { EdhrecCardSuggestion } from './types';
import { scoreEdhrecSuggestionForTheme } from './edhrecStrategyScoring';
import {
  listStrategyPackageCardNames,
  strategyAntisynergyPenalty,
  strategyCategoryPickBonus,
} from './strategyProfiles';
import {
  combinedCardThemeScore,
  createGeneratorPickState,
  generatorHintsPickAdjust,
  interactionCoveragePickBonus,
  packagePickBonus,
  recordPackagePick,
  tagsForOracle,
  updateGeneratorStateAfterPick,
  violatesComboRules,
} from './templateGeneratorScoring';
import { computeLandCountFromCurve, fillManaBaseFromTemplate, MANA_BASE_SYSTEMS } from './manaBaseGenerator';
import { getOracleText, mvBucket } from './scryfallNormalize';
import { cardFitsCommanderColorIdentity } from './commanderFormat';
import { resolveCardNameSync } from './cardResolution';
import { COMMANDER_MAINBOARD_SIZE } from './commanderFormat';
import { isDatabaseReady, searchCardsFiltered } from './cardDatabase';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  getTagsForOracleCard,
  primaryCategoryToRoles,
  tagsToTemplateCategories,
  ScryCard,
} from './autoTags';
import { isBanned } from './banlist';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import { loadBracketRules } from './brackets';
import {
  validateBracket3,
  validateTwoCardCombosBeforeT6,
  loadCombos,
  remediateBracket3Violations,
  Bracket3Policies,
  CardWithTags,
} from './bracket3Validation';
import type { BuiltCardEntry, BuiltDeck, CardRole } from './types';

const COMMANDER_DECK_SIZE = COMMANDER_MAINBOARD_SIZE;
export interface TemplateGeneratorInput {
  commanderName: string;
  templateId?: string;
  seedCards?: string[];
  /** EDHREC theme/archetype slug (e.g. "tokens", "voltron") */
  preferredTheme?: string;
  metaOverride?: Partial<{
    graveyard_meta_share: number;
    fast_combo_density: 'low' | 'mid' | 'high';
    creature_meta_share: number;
  }>;
}

export type EdhrecProfileSnapshot = Awaited<ReturnType<typeof getFullCommanderProfile>>;

export interface TemplateGeneratorResult {
  deck: BuiltDeck;
  notes: string[];
  /** EDHREC data already fetched during generation (avoids duplicate API calls). */
  edhrecProfile?: EdhrecProfileSnapshot;
}

function isFullTemplate(t: { mana_base?: unknown; categories?: unknown[] }): t is DeckTemplateValidated {
  return Array.isArray(t.categories) && t.categories.length > 0 && 'mana_base' in t && t.mana_base != null;
}

/**
 * Allocate nonland slot targets per category so that sum = totalSlots and each is in [min, max].
 */
function allocateCategoryTargets(
  categories: Array<{ name: string; min: number; max: number }>,
  totalSlots: number
): Map<string, number> {
  const targets = new Map<string, number>();
  const nonLandCats = categories.filter(c => c.name !== 'lands');
  const sumMin = nonLandCats.reduce((s, c) => s + c.min, 0);
  let remainder = totalSlots - sumMin;
  if (remainder < 0) remainder = 0;
  for (const cat of nonLandCats) {
    const extra = Math.min(remainder, cat.max - cat.min);
    targets.set(cat.name, cat.min + extra);
    remainder -= extra;
  }
  return targets;
}

/** Seed cards from data/strategy-profiles.json synergyPackages when a theme slug is set. */
function applyStrategyProfilePackages(
  preferredTheme: string | undefined,
  colorIdentity: string[],
  addCard: (name: string, roles?: CardRole[]) => boolean,
  cardsInDeck: Set<string>,
  notes: string[],
  counters: { gameChangerCount: number; extraTurnCount: number },
  maxGameChangers: number,
  maxExtraTurns: number
): void {
  const packageNames = listStrategyPackageCardNames(preferredTheme, 3);
  if (!packageNames.length) return;

  let added = 0;
  for (const name of packageNames) {
    if (cardsInDeck.has(name.toLowerCase())) continue;
    if (isBanned(name)) continue;
    if (isMassLandDenial(name, 'bracket3')) continue;
    if (isGameChanger(name, 'bracket3') && counters.gameChangerCount >= maxGameChangers) continue;
    if (isExtraTurnCard(name, 'bracket3') && counters.extraTurnCount >= maxExtraTurns) continue;

    const card = getCardByName(name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
    if (strategyAntisynergyPenalty(getOracleText(card), preferredTheme) >= 0.3) continue;

    if (addCard(name)) {
      added++;
      if (isGameChanger(name, 'bracket3')) counters.gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) counters.extraTurnCount++;
    }
  }

  if (added > 0) {
    notes.push(`Strategy profile packages (${preferredTheme}): +${added} thematic cards.`);
  }
}

function fillUnderfilledCategoriesFromDatabase(
  builtCards: BuiltCardEntry[],
  cardsInDeck: Set<string>,
  nonLandCategories: Array<{ name: string; min: number; max: number }>,
  categoryTargets: Map<string, number>,
  categoryCounts: Record<string, number>,
  colorIdentity: string[],
  tagOpts: ReturnType<typeof getDefaultBracket3Options>,
  addCard: (name: string, roles?: CardRole[]) => boolean,
  notes: string[],
  counters: { gameChangerCount: number; extraTurnCount: number },
  maxGameChangers: number,
  maxExtraTurns: number
): void {
  if (!isDatabaseReady()) return;

  const underfilled = nonLandCategories.filter(
    (cat) => (categoryCounts[cat.name] ?? 0) < (categoryTargets.get(cat.name) ?? 0)
  );

  for (const cat of underfilled) {
    const need = (categoryTargets.get(cat.name) ?? 0) - (categoryCounts[cat.name] ?? 0);
    if (need <= 0) continue;

    const hits = searchCardsFiltered({
      colorIdentity,
      category: cat.name,
      commanderLegal: true,
      limit: Math.min(need * 10, 80),
    });

    let added = 0;
    for (const row of hits) {
      if (added >= need) break;
      if (builtCards.reduce((s, c) => s + c.quantity, 0) >= COMMANDER_DECK_SIZE) break;

      const name = row.name;
      if (cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      if (isMassLandDenial(name, 'bracket3')) continue;
      if (isGameChanger(name, 'bracket3') && counters.gameChangerCount >= maxGameChangers) continue;
      if (isExtraTurnCard(name, 'bracket3') && counters.extraTurnCount >= maxExtraTurns) continue;

      const card = getCardByName(name);
      if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
      if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;

      const tags =
        row.tags && row.tags.length > 0
          ? row.tags
          : autoTags(
              {
                name: card.name,
                oracle_text: card.oracle_text,
                type_line: card.type_line,
                mana_cost: card.mana_cost,
                cmc: card.cmc,
              } as ScryCard,
              tagOpts
            );
      const primary = getPrimaryTemplateCategory(tags);
      if (primary !== cat.name) continue;
      if (!addCard(name)) continue;

      categoryCounts[cat.name] = (categoryCounts[cat.name] ?? 0) + 1;
      if (isGameChanger(name, 'bracket3')) counters.gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) counters.extraTurnCount++;
      added++;
    }

    if (added > 0) {
      notes.push(`Database fill: ${cat.name} +${added} (use search_cards for remaining gaps).`);
    }
  }
}

type MvBucket = '0_1' | '2' | '3' | '4' | '5_plus';

function countNonlandMvBuckets(builtCards: BuiltCardEntry[]): Record<MvBucket, number> {
  const counts: Record<MvBucket, number> = { '0_1': 0, '2': 0, '3': 0, '4': 0, '5_plus': 0 };
  for (const entry of builtCards) {
    const card = getCardByName(entry.name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    const bucket = mvBucket(card.cmc ?? 0);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

function curveFillBonus(
  cmc: number,
  curve: DeckTemplateValidated['curve'] | undefined,
  mvCounts: Record<MvBucket, number>
): number {
  if (!curve?.mv_distribution) return 0;
  const bucket = mvBucket(cmc);
  const dist = curve.mv_distribution[bucket];
  if (!dist) return 0;
  const current = mvCounts[bucket] ?? 0;
  if (current < dist.min) return 0.6;
  if (current > dist.max) return -0.8;
  return 0;
}

/**
 * Weighted category fit: primary category deficit counts double secondary deficits.
 */
function categoryFitScore(
  mappedCategories: string[],
  primary: string | null,
  categoryTargets: Map<string, number>,
  categoryCounts: Record<string, number>
): number {
  let score = 0;
  for (const cat of mappedCategories) {
    const target = categoryTargets.get(cat);
    if (target == null) continue;
    const current = categoryCounts[cat] ?? 0;
    if (current < target) {
      const weight = cat === primary ? 2.5 : 1;
      score += (target - current) * weight;
    }
  }
  return score;
}

export async function generateDeckFromTemplate(input: TemplateGeneratorInput): Promise<TemplateGeneratorResult> {
  const notes: string[] = [];
  const templateId = input.templateId ?? 'bracket3';

  const commanderCard = getCardByName(input.commanderName);
  if (!commanderCard) {
    throw new Error(
      `Commander "${input.commanderName}" could not be resolved. Check spelling and Scryfall data.`
    );
  }

  const colorIdentity = commanderCard.color_identity ?? [];
  notes.push(`Commander: ${commanderCard.name} (${colorIdentity.length ? colorIdentity.join('') : 'Colorless'})`);

  let template = loadDeckTemplate(templateId) as DeckTemplateValidated;
  if (input.metaOverride && Object.keys(input.metaOverride).length > 0) {
    template = applyMetaAdaptations(template, input.metaOverride);
    notes.push('Applied meta overrides to template.');
  }

  if (!isFullTemplate(template)) {
    throw new Error(`Template "${templateId}" does not have full schema (mana_base, categories). Use bracket3.`);
  }

  const landCountMin = template.mana_base?.land_count?.min ?? template.categories.find(c => c.name === 'lands')?.min ?? 35;
  const landCountMax = template.mana_base?.land_count?.max ?? template.categories.find(c => c.name === 'lands')?.max ?? 38;
  const defaultLandCount = Math.round((landCountMin + landCountMax) / 2);
  const seedNonlandOracle = (input.seedCards ?? [])
    .map((n) => resolveCardNameSync(n)?.card ?? getCardByName(n))
    .filter((c): c is OracleCard => !!c && !(c.type_line?.toLowerCase().includes('land') ?? false));
  const rampInSeeds = seedNonlandOracle.filter((c) => {
    const t = (c.oracle_text ?? '').toLowerCase();
    return t.includes('add {') || (t.includes('search your library') && t.includes('land'));
  }).length;
  const targetLandCount = computeLandCountFromCurve(seedNonlandOracle, template.mana_base, defaultLandCount, {
    rampCount: rampInSeeds,
    colorModel: template.color_model,
    colorCount: colorIdentity.length,
  });
  const targetNonLandCount = COMMANDER_DECK_SIZE - targetLandCount;
  notes.push(`Target: ${targetLandCount} lands, ${targetNonLandCount} nonlands (systems: ${MANA_BASE_SYSTEMS.join(', ')}).`);

  let builtCards: BuiltCardEntry[] = [];
  const cardsInDeck = new Set<string>();

  const addCard = (name: string, roles?: CardRole[]) => {
    const resolved = resolveCardNameSync(name);
    const canonical = resolved?.canonicalName ?? name;
    if (cardsInDeck.has(canonical.toLowerCase())) return false;
    const card = resolved?.card ?? getCardByName(canonical);
    if (card && !cardFitsCommanderColorIdentity(card, colorIdentity)) return false;
    builtCards.push({
      name: canonical,
      quantity: 1,
      roles:
        roles ??
        (card
          ? primaryCategoryToRoles(
              getPrimaryTemplateCategory(
                card.tags?.length
                  ? card.tags
                  : autoTags(card as ScryCard, getDefaultBracket3Options('bracket3'))
              )
            )
          : undefined),
    });
    cardsInDeck.add(canonical.toLowerCase());
    return true;
  };

  if (input.seedCards?.length) {
    const bannedSeeds: string[] = [];
    for (const name of input.seedCards) {
      if (isBanned(name)) bannedSeeds.push(name);
      else addCard(name);
    }
    if (bannedSeeds.length) notes.push(`Excluded banned seeds: ${bannedSeeds.join(', ')}`);
    notes.push(`Seeds: ${builtCards.length} cards.`);
  }

  const seedLandCount = builtCards.filter(c => {
    const card = getCardByName(c.name);
    return card && (card.type_line?.toLowerCase().includes('land') ?? false);
  }).length;
  const seedNonLandCount = builtCards.length - seedLandCount;
  const landsToAdd = Math.max(0, targetLandCount - seedLandCount);
  const nonLandSlotsLeft = targetNonLandCount - seedNonLandCount;

  /** EDHREC profile (cards + lands); fetched early for mana base + main pool. */
  let profileCards: EdhrecCardSuggestion[] = [];
  let profileLands: EdhrecCardSuggestion[] = [];
  let edhrecProfileSnapshot: EdhrecProfileSnapshot | undefined;
  try {
    const profile = await getFullCommanderProfile(commanderCard.name, colorIdentity, {
      theme: input.preferredTheme,
      saltThreshold: 2.5,
      cardLimit: 150,
      landLimit: 60,
    });
    edhrecProfileSnapshot = profile;
    profileCards = profile.cards;
    profileLands = profile.lands;
    if (profile.themes.length > 0) {
      notes.push(`EDHREC themes: ${profile.themes.map(t => t.name).join(', ')}`);
    }
    if (profile.highSaltCards.length > 0) {
      notes.push(`High-salt excluded: ${profile.highSaltCards.length} cards`);
    }
    if (input.preferredTheme) {
      notes.push(`Using theme: ${input.preferredTheme}`);
    }
  } catch {
    const slug = commanderNameToSlug(commanderCard.name);
    const [byCommander, byColor] = await Promise.all([
      getCardsForCommander(slug, 120),
      getTopCardsForColorIdentity(colorIdentity, 150),
    ]);
    const seenP = new Set<string>();
    for (const s of byCommander) {
      if (!seenP.has(s.name.toLowerCase())) {
        seenP.add(s.name.toLowerCase());
        profileCards.push(s);
      }
    }
    for (const s of byColor) {
      if (!seenP.has(s.name.toLowerCase())) {
        seenP.add(s.name.toLowerCase());
        profileCards.push(s);
      }
    }
    profileLands = await getLandsForColorCombination(colorIdentity, 80);
    notes.push('EDHREC: used fallback (basic commander + color pool) for profile');
  }

  if (landsToAdd > 0) {
    await fillManaBaseFromTemplate({
      commanderCard,
      colorIdentity,
      manaBase: template.mana_base,
      colorModel: template.color_model,
      preferredTheme: input.preferredTheme,
      rampCount: rampInSeeds,
      landsToAdd,
      profileLands,
      builtCards,
      cardsInDeck,
      addCard,
      notes,
    });
    notes.push(`Lands: ${targetLandCount} (seeds ${seedLandCount} + filled ${landsToAdd}).`);
  }

  const nonLandCategories = template.categories.filter(c => c.name !== 'lands');
  const categoryTargets = allocateCategoryTargets(
    nonLandCategories.map(c => ({ name: c.name, min: c.min, max: c.max })),
    nonLandSlotsLeft
  );

  let bracketRules: { maxGameChangers?: number; maxExtraTurnCards?: number } | null = null;
  try {
    bracketRules = loadBracketRules('bracket3');
  } catch {
    // ignore
  }
  const maxGameChangers = bracketRules?.maxGameChangers ?? 3;
  const maxExtraTurns = bracketRules?.maxExtraTurnCards ?? 3;
  let gameChangerCount = builtCards.filter(c => isGameChanger(c.name, 'bracket3')).reduce((s, c) => s + c.quantity, 0);
  let extraTurnCount = builtCards.filter(c => isExtraTurnCard(c.name, 'bracket3')).reduce((s, c) => s + c.quantity, 0);

  const packageCounters = { gameChangerCount, extraTurnCount };
  applyStrategyProfilePackages(
    input.preferredTheme,
    colorIdentity,
    addCard,
    cardsInDeck,
    notes,
    packageCounters,
    maxGameChangers,
    maxExtraTurns
  );
  gameChangerCount = packageCounters.gameChangerCount;
  extraTurnCount = packageCounters.extraTurnCount;

  const poolSuggestions: EdhrecCardSuggestion[] = profileCards;

  // Sort by synergy for better card selection
  const sorted = sortBySynergy(poolSuggestions);
  const seen = new Set<string>();
  const pool: Array<{ name: string; rank: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!seen.has(s.name.toLowerCase())) {
      seen.add(s.name.toLowerCase());
      pool.push({ name: s.name, rank: i });
    }
  }
  notes.push(`EDHREC pool: ${pool.length} candidates (synergy-sorted).`);

  const tagOpts = getDefaultBracket3Options('bracket3');
  const tagCache = new Map<string, string[]>();

  const categoryCounts: Record<string, number> = {};
  for (const cat of nonLandCategories) categoryCounts[cat.name] = 0;
  for (const entry of builtCards) {
    const card = getCardByName(entry.name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    const tags = (card as OracleCard & { tags?: string[] }).tags?.length
      ? (card as OracleCard & { tags: string[] }).tags
      : autoTags(card as ScryCard, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);
    if (primary && categoryTargets.has(primary)) {
      categoryCounts[primary] = (categoryCounts[primary] ?? 0) + 1;
    }
  }

  const poolSorted = [...pool].sort((a, b) => {
    const sa = poolSuggestions.find((s) => s.name.toLowerCase() === a.name.toLowerCase());
    const sb = poolSuggestions.find((s) => s.name.toLowerCase() === b.name.toLowerCase());
    return scoreEdhrecSuggestionForTheme(sb ?? { name: b.name }, input.preferredTheme) -
      scoreEdhrecSuggestionForTheme(sa ?? { name: a.name }, input.preferredTheme);
  });

  let mvCounts = countNonlandMvBuckets(builtCards);
  const curveSpec = isFullTemplate(template) ? template.curve : undefined;
  const pickState = createGeneratorPickState();
  for (const entry of builtCards) {
    const card = getCardByName(entry.name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    const tags = tagsForOracle(card, tagCache);
    updateGeneratorStateAfterPick(pickState, card, tags);
    recordPackagePick(tags, template.packages, pickState);
    const themeScore = combinedCardThemeScore(card, input.preferredTheme, commanderCard.name);
    if (themeScore < 0.45 && (pickState.genericStapleCount < (template.generator_hints?.max_generic_staples ?? 12))) {
      pickState.genericStapleCount++;
    }
  }

  while (builtCards.reduce((s, c) => s + c.quantity, 0) < COMMANDER_DECK_SIZE) {
    let best: { name: string; primary: string; score: number } | null = null;

    for (const { name } of poolSorted) {
      if (cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      if (isMassLandDenial(name, 'bracket3')) continue;
      if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
      if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;

      const card = getCardByName(name);
      if (!card) continue;
      if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
      if ((card.type_line?.toLowerCase().includes('land') ?? false)) continue;

      let tags = tagsForOracle(card, tagCache);
      if (violatesComboRules(tags, template.combo_rules, pickState)) continue;

      const mapped = tagsToTemplateCategories(tags);
      const primary = getPrimaryTemplateCategory(tags);
      const helps = mapped.some((cat) => {
        const target = categoryTargets.get(cat);
        return target != null && (categoryCounts[cat] ?? 0) < target;
      });
      if (!helps || !primary) continue;

      const suggestion = poolSuggestions.find((s) => s.name.toLowerCase() === name.toLowerCase());
      const edhrecTheme = scoreEdhrecSuggestionForTheme(suggestion ?? { name }, input.preferredTheme);
      const cardTheme = combinedCardThemeScore(card, input.preferredTheme, commanderCard.name);
      const strategyBonus =
        strategyCategoryPickBonus(primary, getOracleText(card), input.preferredTheme) -
        strategyAntisynergyPenalty(getOracleText(card), input.preferredTheme);
      const score =
        edhrecTheme +
        cardTheme * 0.85 +
        categoryFitScore(mapped, primary, categoryTargets, categoryCounts) +
        curveFillBonus(card.cmc ?? 0, curveSpec, mvCounts) +
        strategyBonus +
        interactionCoveragePickBonus(card, template, pickState) +
        packagePickBonus(tags, template.packages, pickState) +
        generatorHintsPickAdjust(edhrecTheme, cardTheme, template.generator_hints, pickState);

      if (!best || score > best.score) {
        best = { name, primary, score };
      }
    }

    if (!best) break;

    addCard(best.name);
    categoryCounts[best.primary] = (categoryCounts[best.primary] ?? 0) + 1;
    if (isGameChanger(best.name, 'bracket3')) gameChangerCount++;
    if (isExtraTurnCard(best.name, 'bracket3')) extraTurnCount++;
    const added = getCardByName(best.name);
    if (added && !(added.type_line?.toLowerCase().includes('land') ?? false)) {
      const addedTags = tagsForOracle(added, tagCache);
      updateGeneratorStateAfterPick(pickState, added, addedTags);
      recordPackagePick(addedTags, template.packages, pickState);
      const ts = combinedCardThemeScore(added, input.preferredTheme, commanderCard.name);
      if (ts < 0.45) pickState.genericStapleCount++;
      mvCounts = countNonlandMvBuckets(builtCards);
    }
  }

  let filledNonLand = builtCards.filter(c => {
    const card = getCardByName(c.name);
    return !card?.type_line?.toLowerCase().includes('land');
  }).length;
  if (filledNonLand < targetNonLandCount) {
    for (const { name } of poolSorted) {
      if (filledNonLand >= targetNonLandCount) break;
      if (cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      const card = getCardByName(name);
      if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
      if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
      if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
      if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;
      const relaxTags = tagsForOracle(card, tagCache);
      if (violatesComboRules(relaxTags, template.combo_rules, pickState)) continue;
      const suggestion = poolSuggestions.find((s) => s.name.toLowerCase() === name.toLowerCase());
      const relaxScore =
        scoreEdhrecSuggestionForTheme(suggestion ?? { name }, input.preferredTheme) +
        combinedCardThemeScore(card, input.preferredTheme, commanderCard.name) * 0.7;
      if (relaxScore < 0.15 && (template.generator_hints?.prefer_on_theme_cards ?? true)) continue;
      addCard(name);
      filledNonLand++;
      if (isGameChanger(name, 'bracket3')) gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) extraTurnCount++;
    }
  }

  const bracketCounters = { gameChangerCount, extraTurnCount };
  fillUnderfilledCategoriesFromDatabase(
    builtCards,
    cardsInDeck,
    nonLandCategories,
    categoryTargets,
    categoryCounts,
    colorIdentity,
    tagOpts,
    addCard,
    notes,
    bracketCounters,
    maxGameChangers,
    maxExtraTurns
  );
  gameChangerCount = bracketCounters.gameChangerCount;
  extraTurnCount = bracketCounters.extraTurnCount;

  const total = builtCards.reduce((s, c) => s + c.quantity, 0);
  if (total < COMMANDER_DECK_SIZE) {
    notes.push(`Deck has ${total}/${COMMANDER_DECK_SIZE} cards; ${COMMANDER_DECK_SIZE - total} short.`);
  } else if (total > COMMANDER_DECK_SIZE) {
    notes.push(`Deck has ${total} cards; trim to 99.`);
  } else {
    notes.push(`Deck complete: 99 cards.`);
  }

  const deckForValidation: CardWithTags[] = builtCards.map(c => {
    const card = getCardByName(c.name);
    const tags = (card as OracleCard & { tags?: string[] })?.tags?.length
      ? (card as OracleCard & { tags: string[] }).tags
      : card
        ? autoTags(card as ScryCard, tagOpts)
        : [];
    return { name: c.name, tags };
  });
  const policies: Bracket3Policies = {
    max_game_changers: maxGameChangers,
    max_extra_turn_cards: maxExtraTurns,
    ban_mass_land_denial: true,
    ban_extra_turn_chains: true,
    ban_2card_gameenders_before_turn: 6,
  };
  let b3 = validateBracket3(deckForValidation, policies);
  const combos = loadCombos();
  let comboErrs = validateTwoCardCombosBeforeT6(deckForValidation, combos, 6);

  if (b3.errors.length || comboErrs.length) {
    const remediated = remediateBracket3Violations(deckForValidation, policies);
    if (remediated.removed.length > 0) {
      notes.push(...remediated.notes.map((n) => `Bracket 3 auto-fix: ${n}`));
      const removedSet = new Set(remediated.removed.map((n) => n.toLowerCase()));
      builtCards = builtCards.filter((c) => !removedSet.has(c.name.toLowerCase()));
      for (const name of remediated.removed) {
        cardsInDeck.delete(name.toLowerCase());
      }
      deckForValidation.length = 0;
      deckForValidation.push(...remediated.deck);

      let filledAfterRemediation = builtCards.reduce((s, c) => s + c.quantity, 0);
      if (filledAfterRemediation < COMMANDER_DECK_SIZE) {
        bracketCounters.gameChangerCount = gameChangerCount;
        bracketCounters.extraTurnCount = extraTurnCount;
        notes.push(
          `Refilling ${COMMANDER_DECK_SIZE - filledAfterRemediation} slot(s) after Bracket 3 remediation.`
        );
        for (const { name } of poolSorted) {
          if (filledAfterRemediation >= COMMANDER_DECK_SIZE) break;
          if (cardsInDeck.has(name.toLowerCase())) continue;
          if (isBanned(name)) continue;
          if (isMassLandDenial(name, 'bracket3')) continue;
          if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
          if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;
          const card = getCardByName(name);
          if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
          if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
          if (!addCard(name)) continue;
          filledAfterRemediation++;
          if (isGameChanger(name, 'bracket3')) gameChangerCount++;
          if (isExtraTurnCard(name, 'bracket3')) extraTurnCount++;
        }
        fillUnderfilledCategoriesFromDatabase(
          builtCards,
          cardsInDeck,
          nonLandCategories,
          categoryTargets,
          categoryCounts,
          colorIdentity,
          tagOpts,
          addCard,
          notes,
          bracketCounters,
          maxGameChangers,
          maxExtraTurns
        );
        gameChangerCount = bracketCounters.gameChangerCount;
        extraTurnCount = bracketCounters.extraTurnCount;

        deckForValidation.length = 0;
        for (const c of builtCards) {
          const card = getCardByName(c.name);
          const tags = (card as OracleCard & { tags?: string[] })?.tags?.length
            ? (card as OracleCard & { tags: string[] }).tags
            : card
              ? autoTags(card as ScryCard, tagOpts)
              : [];
          deckForValidation.push({ name: c.name, tags });
        }
      }

      b3 = validateBracket3(deckForValidation, policies);
      comboErrs = validateTwoCardCombosBeforeT6(deckForValidation, combos, 6);
    }
  }

  if (b3.errors.length || b3.warnings.length || comboErrs.length) {
    notes.push('Bracket 3:');
    notes.push(...b3.errors.map((e) => `  ⛔ ${e}`));
    notes.push(...b3.warnings.map((w) => `  ⚠ ${w}`));
    notes.push(...comboErrs.map((e) => `  ⛔ ${e}`));
  }

  const deck: BuiltDeck = {
    commanderName: commanderCard.name,
    cards: builtCards.slice(0, COMMANDER_DECK_SIZE),
  };
  return { deck, notes, edhrecProfile: edhrecProfileSnapshot };
}
