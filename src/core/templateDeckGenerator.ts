/**
 * templateDeckGenerator.ts
 *
 * Template-driven deck generator for Bracket 3.
 * Fills 99 cards using template (mana_base, categories, curve, combo_rules, generator_hints).
 * EDHREC is primary source; OpenAI used as fallback for underfilled categories.
 */

import { getCardByName, landFitsCommanderManabase, OracleCard } from './scryfall';
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
import {
  allocateBasicsByPips,
  applySeedLandConsumption,
  classifyLandMixBucket,
  computeScaledLandMixTargets,
  countFixingDualLands,
  countTappedAmongLandNames,
  countsAsTappedLand,
  mergeAndSortLandCandidates,
  type LandMixTargets,
} from './manabaseLandHeuristics';
import { getPrimaryTypeLine } from './scryfallNormalize';
import { autoTags, getDefaultBracket3Options, tagsToTemplateCategories, ScryCard } from './autoTags';
import { classifyCardRoles } from './roles';
import { isBanned } from './banlist';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import { loadBracketRules } from './brackets';
import { validateBracket3, validateTwoCardCombosBeforeT6, loadCombos, Bracket3Policies, CardWithTags } from './bracket3Validation';
import { createOpenAIClient, getLLMConfig, isLLMAvailable } from './llmConfig';
import type { BuiltCardEntry, BuiltDeck, CardRole } from './types';

const COMMANDER_DECK_SIZE = 99;
const COLOR_TO_BASIC_LAND: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

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

export interface TemplateGeneratorResult {
  deck: BuiltDeck;
  notes: string[];
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

/**
 * Ask OpenAI for Commander-legal card names in a category and color identity.
 * Returns [] if LLM not available or on error.
 */
async function requestCardNamesForCategory(
  categoryName: string,
  colorIdentity: string[],
  count: number,
  excludeNames: Set<string>
): Promise<string[]> {
  if (!isLLMAvailable() || count <= 0) return [];
  const config = getLLMConfig();
  if (!config.apiKey) return [];
  const colorStr = colorIdentity.length > 0 ? colorIdentity.join('') : 'Colorless';
  const excludeList = [...excludeNames].slice(0, 30).join(', ');
  const prompt = `List exactly ${Math.min(count, 15)} Magic: The Gathering card names for Commander that:
- Fit the category: ${categoryName}
- Are within color identity: ${colorStr} (or colorless)
- Are Commander-legal, singleton-appropriate (no basic lands)
- Are NOT in this list: ${excludeList || 'none'}

Return ONLY a JSON array of card name strings, e.g. ["Sol Ring","Arcane Signet"]. Use exact Scryfall names.`;
  try {
    const openai = createOpenAIClient(config);
    const completion = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return [];
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as string[]).filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  } catch {
    return [];
  }
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
  const targetLandCount = Math.round((landCountMin + landCountMax) / 2);
  const targetNonLandCount = COMMANDER_DECK_SIZE - targetLandCount;
  notes.push(`Target: ${targetLandCount} lands, ${targetNonLandCount} nonlands.`);

  const builtCards: BuiltCardEntry[] = [];
  const cardsInDeck = new Set<string>();

  const addCard = (name: string, roles?: CardRole[]) => {
    if (cardsInDeck.has(name.toLowerCase())) return false;
    const card = getCardByName(name);
    builtCards.push({
      name,
      quantity: 1,
      roles: roles ?? classifyCardRoles(card ?? null),
    });
    cardsInDeck.add(name.toLowerCase());
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
  try {
    const profile = await getFullCommanderProfile(commanderCard.name, colorIdentity, {
      theme: input.preferredTheme,
      saltThreshold: 2.5,
      cardLimit: 150,
      landLimit: 60,
    });
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
    let landsAddedFill = 0;
    if (colorIdentity.length === 0) {
      for (let i = 0; i < landsToAdd; i++) {
        if (addCard('Wastes')) landsAddedFill++;
      }
    } else {
      const mb = template.mana_base;
      const maxTapped = mb.tapped_lands?.max_total ?? 8;
      const minTypedDuals = mb.fetch_policy?.min_typed_duals_total ?? 4;

      let mixRemaining = applySeedLandConsumption(
        computeScaledLandMixTargets(mb, landsToAdd),
        builtCards.map(c => c.name),
        getCardByName
      );

      const basicsPlan = allocateBasicsByPips(commanderCard, colorIdentity, mixRemaining.basics);
      for (const [bName, qty] of basicsPlan) {
        for (let q = 0; q < qty && landsAddedFill < landsToAdd; q++) {
          if (addCard(bName)) landsAddedFill++;
        }
      }
      mixRemaining.basics = 0;

      const supplementLands = await getLandsForColorCombination(colorIdentity, Math.max(landsToAdd - landsAddedFill + 40, 60));
      const commanderLandSet = new Set(profileLands.map(s => s.name.toLowerCase()));
      const mergedLands = mergeAndSortLandCandidates(profileLands, supplementLands, commanderLandSet);

      const landNamesInDeck = (): string[] =>
        builtCards
          .filter(e => {
            const c = getCardByName(e.name);
            return c && getPrimaryTypeLine(c).toLowerCase().includes('land');
          })
          .map(e => e.name);

      const tryAddNonBasic = (sug: EdhrecCardSuggestion, ignoreBucket: boolean): boolean => {
        if (landsAddedFill >= landsToAdd) return false;
        if (isBanned(sug.name)) return false;
        const card = getCardByName(sug.name);
        if (!card?.type_line?.toLowerCase().includes('land')) return false;
        if (!landFitsCommanderManabase(card, colorIdentity)) return false;
        const bucket = classifyLandMixBucket(card);
        const names = landNamesInDeck();
        if (bucket === 'fetches' && countFixingDualLands(names, getCardByName) < minTypedDuals) {
          return false;
        }
        const tappedSoFar = countTappedAmongLandNames(names, getCardByName);
        if (countsAsTappedLand(card) && tappedSoFar >= maxTapped) {
          return false;
        }
        if (!ignoreBucket) {
          const key = bucket as keyof LandMixTargets;
          if (mixRemaining[key] > 0) {
            if (addCard(sug.name)) {
              mixRemaining[key]--;
              landsAddedFill++;
              return true;
            }
            return false;
          }
          if (
            bucket !== 'basics' &&
            mixRemaining.utility_lands > 0 &&
            bucket !== 'fetches'
          ) {
            if (addCard(sug.name)) {
              mixRemaining.utility_lands--;
              landsAddedFill++;
              return true;
            }
          }
          return false;
        }
        if (addCard(sug.name)) {
          landsAddedFill++;
          return true;
        }
        return false;
      };

      for (const sug of mergedLands) {
        if (landsAddedFill >= landsToAdd) break;
        tryAddNonBasic(sug, false);
      }
      for (const sug of mergedLands) {
        if (landsAddedFill >= landsToAdd) break;
        if (cardsInDeck.has(sug.name.toLowerCase())) continue;
        tryAddNonBasic(sug, true);
      }
      const basicNamesLoop = colorIdentity.map(c => COLOR_TO_BASIC_LAND[c]).filter(Boolean) as string[];
      while (landsAddedFill < landsToAdd) {
        let prev = landsAddedFill;
        for (const name of basicNamesLoop) {
          if (landsAddedFill >= landsToAdd) break;
          if (addCard(name)) landsAddedFill++;
        }
        if (landsAddedFill === prev) break;
      }
    }
    notes.push(`Lands: ${targetLandCount} (seeds ${seedLandCount} + filled ${landsToAdd}; mana_base mix + EDHREC).`);
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
  const categoryCounts: Record<string, number> = {};
  for (const cat of nonLandCategories) categoryCounts[cat.name] = 0;
  for (const entry of builtCards) {
    const card = getCardByName(entry.name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    const tags = (card as OracleCard & { tags?: string[] }).tags?.length
      ? (card as OracleCard & { tags: string[] }).tags
      : autoTags(card as ScryCard, tagOpts);
    for (const catName of tagsToTemplateCategories(tags)) {
      if (categoryTargets.has(catName)) categoryCounts[catName] = (categoryCounts[catName] ?? 0) + 1;
    }
  }

  for (const { name } of pool) {
    if (builtCards.reduce((s, c) => s + c.quantity, 0) >= COMMANDER_DECK_SIZE) break;
    if (cardsInDeck.has(name.toLowerCase())) continue;
    if (isBanned(name)) continue;
    if (isMassLandDenial(name, 'bracket3')) continue;
    if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
    if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;

    const card = getCardByName(name);
    if (!card) continue;
    const ci = card.color_identity ?? [];
    if (ci.length && !ci.every((c: string) => colorIdentity.includes(c))) continue;
    if ((card.type_line?.toLowerCase().includes('land') ?? false)) continue;

    const tags = (card as OracleCard & { tags?: string[] }).tags?.length
      ? (card as OracleCard & { tags: string[] }).tags
      : autoTags(card as ScryCard, tagOpts);
    const categories = tagsToTemplateCategories(tags);
    for (const catName of categories) {
      const target = categoryTargets.get(catName);
      if (target == null) continue;
      if (categoryCounts[catName] >= target) continue;
      addCard(name);
      categoryCounts[catName] = (categoryCounts[catName] ?? 0) + 1;
      if (isGameChanger(name, 'bracket3')) gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) extraTurnCount++;
      break;
    }
  }

  let filledNonLand = builtCards.filter(c => {
    const card = getCardByName(c.name);
    return !card?.type_line?.toLowerCase().includes('land');
  }).length;
  if (filledNonLand < targetNonLandCount) {
    for (const { name } of pool) {
      if (filledNonLand >= targetNonLandCount) break;
      if (cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      const card = getCardByName(name);
      if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
      const ci = card.color_identity ?? [];
      if (ci.length && !ci.every((c: string) => colorIdentity.includes(c))) continue;
      if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
      if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;
      addCard(name);
      filledNonLand++;
      if (isGameChanger(name, 'bracket3')) gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) extraTurnCount++;
    }
  }

  if (isLLMAvailable() && builtCards.reduce((s, c) => s + c.quantity, 0) < COMMANDER_DECK_SIZE) {
    const underfilled = nonLandCategories.filter(
      cat => (categoryCounts[cat.name] ?? 0) < (categoryTargets.get(cat.name) ?? 0)
    );
    for (const cat of underfilled.slice(0, 3)) {
      const target = categoryTargets.get(cat.name) ?? 0;
      const current = categoryCounts[cat.name] ?? 0;
      const need = target - current;
      if (need <= 0) continue;
      const names = await requestCardNamesForCategory(
        cat.name,
        colorIdentity,
        need,
        cardsInDeck
      );
      notes.push(`OpenAI fallback: ${cat.name} requested ${names.length} names.`);
      for (const name of names) {
        if (builtCards.reduce((s, c) => s + c.quantity, 0) >= COMMANDER_DECK_SIZE) break;
        if (cardsInDeck.has(name.toLowerCase())) continue;
        if (isBanned(name)) continue;
        if (isMassLandDenial(name, 'bracket3')) continue;
        if (isGameChanger(name, 'bracket3') && gameChangerCount >= maxGameChangers) continue;
        if (isExtraTurnCard(name, 'bracket3') && extraTurnCount >= maxExtraTurns) continue;
        const card = getCardByName(name);
        if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
        const ci = card.color_identity ?? [];
        if (ci.length && !ci.every((c: string) => colorIdentity.includes(c))) continue;
        const tags = (card as OracleCard & { tags?: string[] }).tags?.length
          ? (card as OracleCard & { tags: string[] }).tags
          : autoTags(card as ScryCard, tagOpts);
        const cats = tagsToTemplateCategories(tags);
        if (!cats.includes(cat.name)) continue;
        addCard(name);
        categoryCounts[cat.name] = (categoryCounts[cat.name] ?? 0) + 1;
        if (isGameChanger(name, 'bracket3')) gameChangerCount++;
        if (isExtraTurnCard(name, 'bracket3')) extraTurnCount++;
      }
    }
  }

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
  const b3 = validateBracket3(deckForValidation, policies);
  const combos = loadCombos();
  const comboErrs = validateTwoCardCombosBeforeT6(deckForValidation, combos, 6);
  if (b3.errors.length || b3.warnings.length || comboErrs.length) {
    notes.push('Bracket 3:');
    notes.push(...b3.errors.map(e => `  ⛔ ${e}`));
    notes.push(...b3.warnings.map(w => `  ⚠ ${w}`));
    notes.push(...comboErrs.map(e => `  ⛔ ${e}`));
  }

  const deck: BuiltDeck = {
    commanderName: commanderCard.name,
    cards: builtCards.slice(0, COMMANDER_DECK_SIZE),
  };
  return { deck, notes };
}
