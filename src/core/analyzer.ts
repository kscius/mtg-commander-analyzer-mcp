/**
 * analyzer.ts
 * 
 * Provides deck analysis for Commander (EDH) format.
 * Uses deck templates and card role classification to analyze deck composition.
 * Future: color identity, mana curve, synergy analysis, EDHREC integration.
 */

import {
  ParsedDeck,
  AnalyzeDeckInput,
  AnalyzeDeckResult,
  DeckAnalysis,
  CategorySummary,
  CategoryStatus,
  DeckTemplate,
  BannedCardInfo,
  LintReport,
  LintIssue,
  LintSeverity
} from './types';
import { getCardByName } from './scryfall';
import { loadDeckTemplate } from './templates';
import { loadBracketRules, BracketRules } from './brackets';
import { checkDeckForBannedCards, isBanlistAvailable, getBannedCount } from './banlist';
import { autoTags, getDefaultBracket3Options, tagsToTemplateCategories, ScryCard } from './autoTags';
import {
  validateBracket3,
  validateTwoCardCombosBeforeT6,
  loadCombos,
  Bracket3Policies,
  CardWithTags
} from './bracket3Validation';
import { classifyCardWithLLM, isLLMClassifierAvailable } from './llmCardClassifier';
import type { DeckTemplateValidated } from './templateSchema';
import {
  getManaValue,
  getPrimaryManaCost,
  getPrimaryTypeLine,
  getOracleText,
  mvBucket,
  entersTappedKind,
  isLandCard,
  type CardLike
} from './scryfallNormalize';
import { isInstant } from './scryfall';

/**
 * Commander deck size rules
 */
const COMMANDER_DECK_SIZE = 99; // Excluding commander

/**
 * Calculates the status of a category based on count and min/max bounds
 * 
 * @param count - Current count in the category
 * @param min - Minimum recommended value (optional)
 * @param max - Maximum recommended value (optional)
 * @returns CategoryStatus
 */
function calculateCategoryStatus(
  count: number,
  min?: number,
  max?: number
): CategoryStatus {
  if (min === undefined && max === undefined) {
    return 'unknown';
  }

  if (min !== undefined && max !== undefined) {
    if (count < min) return 'below';
    if (count > max) return 'above';
    return 'within';
  }

  if (min !== undefined) {
    return count < min ? 'below' : 'within';
  }

  if (max !== undefined) {
    return count > max ? 'above' : 'within';
  }

  return 'unknown';
}

/** Template has full schema (curve, mana_base) for advanced lint */
function isFullTemplate(t: DeckTemplate): t is DeckTemplateValidated {
  return 'curve' in t && 'mana_base' in t && t.curve != null && t.mana_base != null;
}

/**
 * Build LintReport from deck and full template (curve, mana_base, interaction_coverage, category constraints).
 */
function buildLintReport(
  parsedDeck: ParsedDeck,
  template: DeckTemplateValidated,
  categoryCounts: Record<string, number>
): LintReport {
  const issues: LintIssue[] = [];
  const metrics: Record<string, unknown> = {};

  const cards: CardLike[] = [];
  for (const entry of parsedDeck.cards) {
    const card = getCardByName(entry.name);
    if (card) {
      for (let q = 0; q < entry.quantity; q++) {
        cards.push(card as CardLike);
      }
    }
  }

  const landCards = cards.filter((c) => isLandCard(c));
  const nonLandCards = cards.filter((c) => !isLandCard(c));

  // --- Curve ---
  const mvs = nonLandCards.map((c) => getManaValue(c)).filter((mv) => mv >= 0);
  const avgMv = mvs.length ? mvs.reduce((a, b) => a + b, 0) / mvs.length : 0;
  const mvBuckets: Record<string, number> = { '0_1': 0, '2': 0, '3': 0, '4': 0, '5_plus': 0 };
  for (const mv of mvs) {
    const b = mvBucket(mv);
    mvBuckets[b]++;
  }
  metrics.curve_avg_mv = avgMv;
  metrics.curve_mv_distribution = { ...mvBuckets };
  metrics.curve_mv2_or_less = (mvBuckets['0_1'] ?? 0) + (mvBuckets['2'] ?? 0);
  metrics.curve_mv5_plus = mvBuckets['5_plus'] ?? 0;

  const curve = template.curve;
  if (curve.max_avg_mv != null && avgMv > curve.max_avg_mv) {
    issues.push({
      key: 'curve:avg_mv',
      severity: 'soft',
      message: `Average MV ${avgMv.toFixed(2)} exceeds template max ${curve.max_avg_mv}`,
      sectionSuggest: 'curve',
      details: { avgMv, max: curve.max_avg_mv }
    });
  }
  const minEarly = curve.min_early_plays_mv2_or_less ?? 12;
  const earlyCount = (mvBuckets['0_1'] ?? 0) + (mvBuckets['2'] ?? 0);
  if (earlyCount < minEarly) {
    issues.push({
      key: 'curve:min_early_plays_mv2_or_less',
      severity: 'soft',
      message: `Cards with MV ≤2: ${earlyCount} (min ${minEarly})`,
      sectionSuggest: 'curve',
      details: { count: earlyCount, min: minEarly }
    });
  }
  const max5Plus = curve.max_mv5plus_total ?? 10;
  if ((mvBuckets['5_plus'] ?? 0) > max5Plus) {
    issues.push({
      key: 'curve:max_mv5plus_total',
      severity: 'soft',
      message: `Cards with MV 5+: ${mvBuckets['5_plus']} (max ${max5Plus})`,
      sectionSuggest: 'curve',
      details: { count: mvBuckets['5_plus'], max: max5Plus }
    });
  }
  const dist = curve.mv_distribution;
  if (dist) {
    for (const [bucket, range] of Object.entries(dist)) {
      const min = (range as { min?: number }).min;
      const max = (range as { max?: number }).max;
      const count = mvBuckets[bucket] ?? 0;
      if (min != null && count < min) {
        issues.push({
          key: `curve:mv_distribution.${bucket}`,
          severity: 'soft',
          message: `MV bucket ${bucket}: ${count} (min ${min})`,
          sectionSuggest: 'curve',
          details: { bucket, count, min }
        });
      }
      if (max != null && count > max) {
        issues.push({
          key: `curve:mv_distribution.${bucket}`,
          severity: 'soft',
          message: `MV bucket ${bucket}: ${count} (max ${max})`,
          sectionSuggest: 'curve',
          details: { bucket, count, max }
        });
      }
    }
  }

  // --- Mana base / land_mix ---
  metrics.land_count = landCards.length;
  const landMixCounts: Record<string, number> = {
    basics: 0,
    utility_lands: 0,
    fetches: 0,
    shock_lands: 0,
    typed_duals: 0,
    mdfc_lands: 0,
    other: 0
  };
  const basicNames = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
  let tappedAlways = 0;
  let tappedConditional = 0;
  for (const c of landCards) {
    const name = c.name;
    const typeLine = getPrimaryTypeLine(c).toLowerCase();
    const text = getOracleText(c).toLowerCase();
    if (basicNames.has(name)) {
      landMixCounts.basics++;
    } else if (text.includes('fetch') || (text.includes('search your library') && text.includes('land'))) {
      landMixCounts.fetches++;
    } else if (text.includes('pay 2 life') && text.includes('untapped')) {
      landMixCounts.shock_lands++;
    } else if (text.includes('trinity') || text.includes('tricycle') || name.toLowerCase().includes('tricycle')) {
      landMixCounts.typed_duals++;
    } else if (c.card_faces?.length) {
      landMixCounts.mdfc_lands++;
    } else {
      landMixCounts.other++;
    }
    const kind = entersTappedKind(c);
    if (kind === 'always') tappedAlways++;
    else if (kind === 'conditional') tappedConditional++;
  }
  metrics.land_mix = landMixCounts;
  metrics.tapped_lands_always = tappedAlways;
  metrics.tapped_lands_conditional = tappedConditional;

  const mb = template.mana_base;
  if (mb.land_count) {
    const lc = landCards.length;
    if (lc < mb.land_count.min) {
      issues.push({
        key: 'mana_base:land_count',
        severity: 'hard',
        message: `Land count ${lc} below min ${mb.land_count.min}`,
        sectionSuggest: 'mana_base',
        details: { count: lc, min: mb.land_count.min, max: mb.land_count.max }
      });
    } else if (lc > mb.land_count.max) {
      issues.push({
        key: 'mana_base:land_count',
        severity: 'soft',
        message: `Land count ${lc} above max ${mb.land_count.max}`,
        sectionSuggest: 'mana_base',
        details: { count: lc, min: mb.land_count.min, max: mb.land_count.max }
      });
    }
  }
  if (mb.tapped_lands) {
    const maxTotal = mb.tapped_lands.max_total ?? 8;
    const totalTapped = tappedAlways + tappedConditional;
    if (totalTapped > maxTotal) {
      issues.push({
        key: 'mana_base:tapped_lands.max_total',
        severity: 'soft',
        message: `Tapped lands ${totalTapped} exceeds max ${maxTotal}`,
        sectionSuggest: 'mana_base',
        details: { totalTapped, maxTotal }
      });
    }
  }

  // --- Interaction coverage (simplified: count instants and low-MV removal by tags) ---
  let instantSpeedTotal = 0;
  let cheapInteraction = 0;
  for (const entry of parsedDeck.cards) {
    const card = getCardByName(entry.name);
    if (!card) continue;
    const isInst = isInstant(card);
    const mv = getManaValue(card);
    if (isInst && (card.oracle_text?.toLowerCase().includes('destroy') || card.oracle_text?.toLowerCase().includes('counter') || card.oracle_text?.toLowerCase().includes('exile'))) {
      instantSpeedTotal += entry.quantity;
      if (mv <= 2) cheapInteraction += entry.quantity;
    }
  }
  metrics.instant_speed_total = instantSpeedTotal;
  metrics.cheap_interaction_mv2_or_less = cheapInteraction;

  const ic = template.interaction_coverage;
  if (ic) {
    const minInst = ic.min_instant_speed_total ?? 8;
    if (instantSpeedTotal < minInst) {
      issues.push({
        key: 'interaction_coverage:min_instant_speed_total',
        severity: 'soft',
        message: `Instant-speed interaction: ${instantSpeedTotal} (min ${minInst})`,
        sectionSuggest: 'interaction',
        details: { count: instantSpeedTotal, min: minInst }
      });
    }
    const minCheap = ic.min_cheap_interaction_mv2_or_less ?? 5;
    if (cheapInteraction < minCheap) {
      issues.push({
        key: 'interaction_coverage:min_cheap_interaction_mv2_or_less',
        severity: 'soft',
        message: `Cheap interaction (MV≤2): ${cheapInteraction} (min ${minCheap})`,
        sectionSuggest: 'interaction',
        details: { count: cheapInteraction, min: minCheap }
      });
    }
  }

  // --- Category constraints (ramp split, spot_removal min_instant_speed, etc.) ---
  for (const cat of template.categories) {
    const constraints = cat.constraints as Record<string, unknown> | undefined;
    if (!constraints) continue;
    const count = categoryCounts[cat.name] ?? 0;
    if (count === 0) continue;

    if (cat.name === 'ramp' && constraints.min_mv2_or_less != null) {
      // Heuristic: count ramp cards with MV≤2 from deck (we don't have per-card category here, so use global ramp count and note)
      const minLow = constraints.min_mv2_or_less as number;
      metrics.ramp_min_mv2_or_less_required = minLow;
      // Could iterate cards and count ramp-tagged with MV≤2; for now skip detailed check
    }
    if (cat.name === 'spot_removal' && constraints.min_instant_speed != null) {
      const minInst = constraints.min_instant_speed as number;
      if (instantSpeedTotal < minInst) {
        issues.push({
          key: `categories:spot_removal.min_instant_speed`,
          severity: 'soft',
          message: `Spot removal: instant-speed count ${instantSpeedTotal} (min ${minInst})`,
          sectionSuggest: 'interaction',
          details: { count: instantSpeedTotal, min: minInst }
        });
      }
    }
  }

  const ok = issues.filter((i) => i.severity === 'hard').length === 0;
  return { ok, issues, metrics };
}

/**
 * Performs deck analysis using template-based categorization
 * 
 * @param input - AnalyzeDeckInput with deck text and options
 * @param parsedDeck - ParsedDeck object from deckParser
 * @returns AnalyzeDeckResult with complete analysis
 * 
 * Analysis process:
 * 1. Load deck template to get category definitions
 * 2. Classify each card by role using Scryfall data
 * 3. Count cards in each template category
 * 4. Generate category summaries with status
 * 5. Add notes for categories outside recommended ranges
 * 
 * @example
 * ```typescript
 * const input: AnalyzeDeckInput = { 
 *   deckText: "1 Sol Ring\n35 Island",
 *   templateId: "default"
 * };
 * const parsed = parseDeckText(input.deckText);
 * const result = await analyzeDeckBasic(input, parsed);
 * ```
 */
export async function analyzeDeckBasic(
  input: AnalyzeDeckInput,
  parsedDeck: ParsedDeck
): Promise<AnalyzeDeckResult> {
  const notes: string[] = [];

  // Load the deck template
  const template: DeckTemplate = loadDeckTemplate(input.templateId);

  // Try to load bracket rules if template ID matches a bracket
  let bracketRules: BracketRules | null = null;
  if (input.templateId) {
    try {
      bracketRules = loadBracketRules(input.templateId);
    } catch {
      // Template ID is not a bracket, ignore
      bracketRules = null;
    }
  }

  // Calculate total cards (sum of all quantities)
  const totalCards = parsedDeck.cards.reduce(
    (sum, card) => sum + card.quantity,
    0
  );

  // Calculate unique cards
  const uniqueCards = parsedDeck.cards.length;

  // Commander name (not detected yet)
  const commanderName = parsedDeck.commanderName || null;

  // Commander deck size validation
  if (totalCards < COMMANDER_DECK_SIZE) {
    notes.push(
      `Deck has fewer than ${COMMANDER_DECK_SIZE} cards (excluding commander). Current: ${totalCards} cards.`
    );
  } else if (totalCards > COMMANDER_DECK_SIZE) {
    notes.push(
      `Deck has more than ${COMMANDER_DECK_SIZE} cards (excluding commander). Current: ${totalCards} cards.`
    );
  } else {
    notes.push(
      `Deck size is correct: ${totalCards} cards (excluding commander).`
    );
  }

  // Initialize category counts from template
  const categoryCounts: Record<string, number> = {};
  for (const cat of template.categories) {
    categoryCounts[cat.name] = 0;
  }

  const bracketId = input.templateId || 'default';
  const tagOpts = bracketId === 'bracket3' ? getDefaultBracket3Options('bracket3') : {};
  const deckWithTags: CardWithTags[] = [];

  const useLLMFallback = input.options?.useLLMFallbackForCategories === true && isLLMClassifierAvailable();

  for (const entry of parsedDeck.cards) {
    const card = getCardByName(entry.name);
    let tags: string[] = (card?.tags && card.tags.length > 0) ? card.tags : [];

    if (tags.length === 0 && card) {
      const scryCard: ScryCard = {
        name: card.name,
        oracle_text: card.oracle_text,
        type_line: card.type_line,
        mana_cost: card.mana_cost,
        cmc: card.cmc,
        all_parts: card.all_parts,
      };
      tags = autoTags(scryCard, tagOpts);
      if (tags.length === 0 && useLLMFallback) {
        const llmTags = await classifyCardWithLLM(scryCard);
        if (llmTags.length > 0) tags = llmTags;
      }
    }

    deckWithTags.push({ name: entry.name, tags });

    // Lands from type_line (not from tags)
    const isLand = card?.type_line?.toLowerCase().includes('land');
    if (isLand) {
      categoryCounts['lands'] = (categoryCounts['lands'] ?? 0) + entry.quantity;
    }

    // Count by template categories from tags (skip "ramp" for lands — they're not ramp in template sense)
    const categoriesFromTags = tagsToTemplateCategories(tags);
    for (const catName of categoriesFromTags) {
      if (catName === 'ramp' && isLand) continue;
      if (Object.prototype.hasOwnProperty.call(categoryCounts, catName)) {
        categoryCounts[catName] += entry.quantity;
      }
    }
  }

  // Build category summaries from template
  const categories: CategorySummary[] = template.categories.map(cat => {
    const count = categoryCounts[cat.name] ?? 0;
    const status = calculateCategoryStatus(count, cat.min, cat.max);

    return {
      name: cat.name,
      count,
      min: cat.min,
      max: cat.max,
      status
    };
  });

  // Generate category-specific notes for categories outside range
  const keyCategories = template.categories.map(c => c.name);
  for (const cat of categories) {
    if (keyCategories.includes(cat.name) && cat.min !== undefined && cat.max !== undefined) {
      if (cat.status === 'below') {
        notes.push(
          `Category '${cat.name}' is below recommended range: ${cat.count} (recommended ${cat.min}-${cat.max}).`
        );
      } else if (cat.status === 'above') {
        notes.push(
          `Category '${cat.name}' is above recommended range: ${cat.count} (recommended ${cat.min}-${cat.max}).`
        );
      }
    }
  }

  // Bracket 3 validation (policies from template or bracket rules)
  const bracketWarnings: string[] = [];
  const policies: Bracket3Policies = {
    max_game_changers: (template.policies as Record<string, unknown>)?.max_game_changers as number ?? bracketRules?.maxGameChangers ?? 3,
    max_extra_turn_cards: (template.policies as Record<string, unknown>)?.max_extra_turn_cards as number ?? bracketRules?.maxExtraTurnCards ?? 3,
    ban_mass_land_denial: (template.policies as Record<string, unknown>)?.ban_mass_land_denial as boolean ?? !bracketRules?.allowMassLandDestruction,
    ban_extra_turn_chains: (template.policies as Record<string, unknown>)?.ban_extra_turn_chains as boolean ?? true,
    ban_2card_gameenders_before_turn: (template.policies as Record<string, unknown>)?.ban_2card_gameenders_before_turn as number ?? 6,
  };

  const b3Result = validateBracket3(deckWithTags, policies);
  bracketWarnings.push(...b3Result.errors);
  bracketWarnings.push(...b3Result.warnings);

  const turnFloorLimit = policies.ban_2card_gameenders_before_turn ?? 6;
  const combos = loadCombos();
  const comboErrors = validateTwoCardCombosBeforeT6(deckWithTags, combos, turnFloorLimit);
  bracketWarnings.push(...comboErrors);

  // Check for banned cards
  let bannedCards: BannedCardInfo[] = [];
  let banlistValid = true;

  if (isBanlistAvailable()) {
    const cardsToCheck = parsedDeck.cards.map(c => ({ name: c.name, quantity: c.quantity }));
    bannedCards = checkDeckForBannedCards(cardsToCheck);
    banlistValid = bannedCards.length === 0;

    if (bannedCards.length > 0) {
      notes.push(`⛔ BANLIST VIOLATION: Deck contains ${bannedCards.length} banned card(s).`);
      for (const banned of bannedCards) {
        notes.push(`  - ${banned.name}${banned.quantity > 1 ? ` (x${banned.quantity})` : ''}`);
      }
    } else {
      notes.push(`✓ Banlist check passed (${getBannedCount()} cards in banlist).`);
    }
  }

  // Build LintReport when template has full schema (bracket3)
  let lintReport: LintReport | undefined;
  if (isFullTemplate(template)) {
    lintReport = buildLintReport(parsedDeck, template, categoryCounts);
    if (!lintReport.ok) {
      notes.push(`Template lint: ${lintReport.issues.filter((i) => i.severity === 'hard').length} hard issue(s), ${lintReport.issues.filter((i) => i.severity === 'soft').length} soft.`);
    }
  }

  // Build the DeckAnalysis object
  const analysis: DeckAnalysis = {
    commanderName,
    totalCards,
    uniqueCards,
    categories,
    notes,
    bracketId: bracketRules?.id,
    bracketLabel: bracketRules?.label,
    bracketWarnings,
    bannedCards,
    banlistValid,
    lintReport
  };

  // Build the complete AnalyzeDeckResult
  const result: AnalyzeDeckResult = {
    input: {
      templateId: input.templateId,
      banlistId: input.banlistId
    },
    analysis,
    parsedDeck
  };

  return result;
}
