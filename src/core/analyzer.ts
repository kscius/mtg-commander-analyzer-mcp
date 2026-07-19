/**
 * analyzer.ts
 * 
 * Provides deck analysis for Commander (EDH) format.
 * Uses deck templates, Bracket 3 validation, banlist checks, optional template lint (curve/mana_base),
 * and tag-based categorization (heuristics + optional LLM fallback for untagged cards).
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
  LintSeverity,
  CardSynergyScore,
} from './types';
import { getCardByName, getColorIdentity, type OracleCard } from './scryfall';
import { inferCommanderFromDeckEntries } from './commanderInference';
import { getFullCommanderProfile } from './edhrec';
import type { EdhrecCardSuggestion } from './types';
import {
  COMMANDER_MAINBOARD_SIZE,
  findColorIdentityViolations,
  findSingletonViolations,
  findIllegalCards,
} from './commanderFormat';
import { buildCardSynergyScores, scoreDeckSynergy } from './synergyScorer';
import { buildDeckRecommendations } from './deckRecommendations';
import { mergePrioritizedActions } from './prioritizedActions';
import { formatDecklistText } from './deckTextFormat';
import { getPrimaryTemplateCategory } from './autoTags';
import { normalizeParsedCardNames } from './cardResolution';
import { loadDeckTemplate } from './templates';
import { loadBracketRules, BracketRules } from './brackets';
import { checkDeckForBannedCards, isBanlistAvailable, getBannedCount } from './banlist';
import { autoTags, getDefaultBracket3Options, ScryCard } from './autoTags';
import {
  validateBracket3,
  validateTwoCardCombosBeforeT6,
  loadCombos,
  Bracket3Policies,
  CardWithTags
} from './bracket3Validation';
import type { DeckTemplateValidated } from './templateSchema';
import {
  getManaValue,
  mvBucket,
  entersTappedKind,
  isLandCard,
  type CardLike
} from './scryfallNormalize';
import { isInstant } from './scryfall';
import { buildDeckQualityExtensions } from './deckQualityReport';
import { classifyLandMixBucket, type LandMixBucket } from './manabaseLandHeuristics';

/**
 * Commander deck size rules
 */
const COMMANDER_DECK_SIZE = COMMANDER_MAINBOARD_SIZE;

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

/** Merge Commander format violations into lint report as hard issues. */
function mergeFormatLintIssues(
  lintReport: LintReport | undefined,
  formatIssues: LintIssue[]
): LintReport | undefined {
  if (formatIssues.length === 0) return lintReport;
  const base: LintReport = lintReport ?? { ok: true, issues: [], metrics: {} };
  return {
    ok: false,
    issues: [...formatIssues, ...base.issues],
    metrics: base.metrics,
  };
}

/** Template has full schema (curve, mana_base) for advanced lint */
function isFullTemplate(t: DeckTemplate): t is DeckTemplateValidated {
  return 'curve' in t && 'mana_base' in t && t.curve != null && t.mana_base != null;
}

/** Per-category counts for template constraint checks (primary tag only). */
type CategoryConstraintMetrics = {
  instantSpeedByCategory: Record<string, number>;
  mv2OrLessByCategory: Record<string, number>;
  exileByCategory: Record<string, number>;
};

/**
 * Count instant-speed, low-MV, and exile cards per primary template category.
 * Uses the same tags as categoryCounts (from analyzeDeckBasic deckWithTags).
 */
function countCategoryConstraintMetrics(
  parsedDeck: ParsedDeck,
  deckWithTags: CardWithTags[]
): CategoryConstraintMetrics {
  const tagByName = new Map(deckWithTags.map((c) => [c.name, c.tags]));
  const instantSpeedByCategory: Record<string, number> = {};
  const mv2OrLessByCategory: Record<string, number> = {};
  const exileByCategory: Record<string, number> = {};

  for (const entry of parsedDeck.cards) {
    const card = getCardByName(entry.name);
    if (!card) continue;
    const tags = tagByName.get(entry.name);
    if (!tags) continue;
    const primary = getPrimaryTemplateCategory(tags);
    if (!primary) continue;

    const qty = entry.quantity;
    if (isInstant(card)) {
      instantSpeedByCategory[primary] = (instantSpeedByCategory[primary] ?? 0) + qty;
    }
    const mv = getManaValue(card);
    if (mv <= 2) {
      mv2OrLessByCategory[primary] = (mv2OrLessByCategory[primary] ?? 0) + qty;
    }
    const text = (card.oracle_text ?? '').toLowerCase();
    if (text.includes('exile')) {
      exileByCategory[primary] = (exileByCategory[primary] ?? 0) + qty;
    }
  }

  return { instantSpeedByCategory, mv2OrLessByCategory, exileByCategory };
}

/**
 * Build LintReport from deck and full template (curve, mana_base, interaction_coverage, category constraints).
 */
function buildLintReport(
  parsedDeck: ParsedDeck,
  template: DeckTemplateValidated,
  categoryCounts: Record<string, number>,
  deckWithTags: CardWithTags[]
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
  const landMixCounts: Record<LandMixBucket, number> = {
    basics: 0,
    utility_lands: 0,
    fetches: 0,
    shock_lands: 0,
    typed_duals: 0,
    mdfc_lands: 0,
    colorless_lands: 0,
  };
  let tappedAlways = 0;
  let tappedConditional = 0;
  for (const c of landCards) {
    landMixCounts[classifyLandMixBucket(c as OracleCard)]++;
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
  if (mb.land_mix) {
    const lintBuckets: LandMixBucket[] = [
      'basics',
      'utility_lands',
      'colorless_lands',
      'mdfc_lands',
      'fetches',
      'shock_lands',
      'typed_duals',
    ];
    for (const bucket of lintBuckets) {
      const bounds = mb.land_mix[bucket];
      if (!bounds) continue;
      const count = landMixCounts[bucket];
      if (bounds.min != null && count < bounds.min) {
        issues.push({
          key: `mana_base:land_mix.${bucket}`,
          severity: 'soft',
          message: `${bucket} count ${count} below min ${bounds.min}`,
          sectionSuggest: 'mana_base',
          details: { bucket, count, min: bounds.min, max: bounds.max },
        });
      } else if (bounds.max != null && count > bounds.max) {
        issues.push({
          key: `mana_base:land_mix.${bucket}`,
          severity: 'soft',
          message: `${bucket} count ${count} above max ${bounds.max}`,
          sectionSuggest: 'mana_base',
          details: { bucket, count, min: bounds.min, max: bounds.max },
        });
      }
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

  // --- Category constraints (ramp MV, spot_removal/protection instant-speed, etc.) ---
  const constraintMetrics = countCategoryConstraintMetrics(parsedDeck, deckWithTags);

  for (const cat of template.categories) {
    const constraints = cat.constraints as Record<string, unknown> | undefined;
    if (!constraints) continue;
    const count = categoryCounts[cat.name] ?? 0;
    if (count === 0) continue;

    if (cat.name === 'ramp' && constraints.min_mv2_or_less != null) {
      const minLow = constraints.min_mv2_or_less as number;
      const rampMv2 = constraintMetrics.mv2OrLessByCategory['ramp'] ?? 0;
      metrics.ramp_min_mv2_or_less = rampMv2;
      metrics.ramp_min_mv2_or_less_required = minLow;
      if (rampMv2 < minLow) {
        issues.push({
          key: 'categories:ramp.min_mv2_or_less',
          severity: 'soft',
          message: `Ramp: MV≤2 count ${rampMv2} (min ${minLow})`,
          sectionSuggest: 'interaction',
          details: { count: rampMv2, min: minLow }
        });
      }
    }

    if (cat.name === 'spot_removal') {
      if (constraints.min_instant_speed != null) {
        const minInst = constraints.min_instant_speed as number;
        const spotInstant = constraintMetrics.instantSpeedByCategory['spot_removal'] ?? 0;
        metrics.spot_removal_instant_speed = spotInstant;
        if (spotInstant < minInst) {
          issues.push({
            key: 'categories:spot_removal.min_instant_speed',
            severity: 'soft',
            message: `Spot removal: instant-speed count ${spotInstant} (min ${minInst})`,
            sectionSuggest: 'interaction',
            details: { count: spotInstant, min: minInst }
          });
        }
      }
      if (constraints.min_mv2_or_less != null) {
        const minMv2 = constraints.min_mv2_or_less as number;
        const spotMv2 = constraintMetrics.mv2OrLessByCategory['spot_removal'] ?? 0;
        if (spotMv2 < minMv2) {
          issues.push({
            key: 'categories:spot_removal.min_mv2_or_less',
            severity: 'soft',
            message: `Spot removal: MV≤2 count ${spotMv2} (min ${minMv2})`,
            sectionSuggest: 'interaction',
            details: { count: spotMv2, min: minMv2 }
          });
        }
      }
      if (constraints.min_exile != null) {
        const minExile = constraints.min_exile as number;
        const spotExile = constraintMetrics.exileByCategory['spot_removal'] ?? 0;
        if (spotExile < minExile) {
          issues.push({
            key: 'categories:spot_removal.min_exile',
            severity: 'soft',
            message: `Spot removal: exile effects ${spotExile} (min ${minExile})`,
            sectionSuggest: 'interaction',
            details: { count: spotExile, min: minExile }
          });
        }
      }
    }

    if (cat.name === 'protection' && constraints.min_instant_speed != null) {
      const minInst = constraints.min_instant_speed as number;
      const protectionInstant = constraintMetrics.instantSpeedByCategory['protection'] ?? 0;
      metrics.protection_instant_speed = protectionInstant;
      if (protectionInstant < minInst) {
        issues.push({
          key: 'categories:protection.min_instant_speed',
          severity: 'soft',
          message: `Protection: instant-speed count ${protectionInstant} (min ${minInst})`,
          sectionSuggest: 'interaction',
          details: { count: protectionInstant, min: minInst }
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

  const effectiveTemplateId = input.templateId ?? input.bracketId ?? 'bracket3';

  // Load the deck template (default aligns with project Bracket 3 focus)
  const template: DeckTemplate = loadDeckTemplate(effectiveTemplateId);

  let bracketRules: BracketRules | null = null;
  const bracketKey = input.bracketId ?? effectiveTemplateId;
  try {
    bracketRules = loadBracketRules(bracketKey);
  } catch {
    bracketRules = null;
  }

  const strategyLabel = input.preferredStrategy?.trim();
  if (strategyLabel) {
    notes.push(`Stated synergy/theme: "${strategyLabel}" (EDHREC theme slug).`);
  }

  const normalized = normalizeParsedCardNames(parsedDeck.cards);
  if (normalized.renamed.length > 0) {
    notes.push(`Resolved ${normalized.renamed.length} card name(s) to canonical Scryfall names.`);
    if (normalized.renamed.length <= 5) {
      notes.push(...normalized.renamed.map((r) => `  ${r}`));
    }
  }
  if (normalized.unresolved.length > 0) {
    notes.push(
      `⚠ ${normalized.unresolved.length} card(s) not found in database: ${normalized.unresolved.slice(0, 8).join(', ')}${normalized.unresolved.length > 8 ? '…' : ''}`
    );
  }
  parsedDeck.cards = normalized.entries.map((e) => ({
    rawLine: e.rawLine ?? `${e.quantity} ${e.name}`,
    quantity: e.quantity,
    name: e.name,
  }));

  // Calculate total cards (sum of all quantities)
  const totalCards = parsedDeck.cards.reduce(
    (sum, card) => sum + card.quantity,
    0
  );

  // Calculate unique cards
  const uniqueCards = parsedDeck.cards.length;

  let commanderName =
    input.commanderName?.trim() ||
    parsedDeck.commanderName?.trim() ||
    null;

  if (!commanderName && input.inferCommander !== false) {
    const inferred = inferCommanderFromDeckEntries(
      parsedDeck.cards.map((c) => ({ name: c.name }))
    );
    if (inferred.commanderName) {
      commanderName = inferred.commanderName;
      if (inferred.candidates.length > 1) {
        notes.push(
          `Inferred commander "${inferred.commanderName}" (${inferred.candidates.length} candidates: ${inferred.candidates.slice(0, 5).join(', ')}). Pass commanderName to override.`
        );
      } else {
        notes.push(
          `Inferred commander "${inferred.commanderName}" from deck (commander-eligible legendary).`
        );
      }
    }
  }

  const formatLintIssues: LintIssue[] = [];
  let colorIdentityViolations: string[] = [];

  if (commanderName) {
    const commanderCard = getCardByName(commanderName);
    if (!commanderCard) {
      notes.push(`⚠ Commander "${commanderName}" could not be resolved in card database.`);
    } else {
      const cmdCi = getColorIdentity(commanderCard);
      colorIdentityViolations = findColorIdentityViolations(parsedDeck.cards, cmdCi);
      if (colorIdentityViolations.length > 0) {
        notes.push(`⛔ ${colorIdentityViolations.length} card(s) outside commander color identity (${cmdCi.join('') || 'C'}):`);
        for (const v of colorIdentityViolations.slice(0, 12)) {
          notes.push(`  - ${v}`);
        }
        if (colorIdentityViolations.length > 12) {
          notes.push(`  … and ${colorIdentityViolations.length - 12} more`);
        }
      } else {
        notes.push(`Color identity: all resolved mainboard cards fit commander (${cmdCi.join('') || 'C'}).`);
      }
    }
  } else {
    notes.push(
      'Color identity: pass commanderName or a "Commander:" line in deckText to validate color identity.'
    );
  }

  // Commander deck size validation
  if (totalCards < COMMANDER_DECK_SIZE) {
    notes.push(
      `Deck has fewer than ${COMMANDER_DECK_SIZE} cards (excluding commander). Current: ${totalCards} cards.`
    );
    formatLintIssues.push({
      key: 'format:deck_size',
      severity: 'hard',
      message: `Mainboard has ${totalCards} cards (expected ${COMMANDER_DECK_SIZE})`,
      details: { totalCards, expected: COMMANDER_DECK_SIZE },
    });
  } else if (totalCards > COMMANDER_DECK_SIZE) {
    notes.push(
      `Deck has more than ${COMMANDER_DECK_SIZE} cards (excluding commander). Current: ${totalCards} cards.`
    );
    formatLintIssues.push({
      key: 'format:deck_size',
      severity: 'hard',
      message: `Mainboard has ${totalCards} cards (expected ${COMMANDER_DECK_SIZE})`,
      details: { totalCards, expected: COMMANDER_DECK_SIZE },
    });
  } else {
    notes.push(
      `Deck size is correct: ${totalCards} cards (excluding commander).`
    );
  }

  const singletonViolations = findSingletonViolations(parsedDeck.cards);
  if (singletonViolations.length > 0) {
    notes.push(`⛔ Singleton violations: ${singletonViolations.length} card(s) with quantity > 1.`);
    for (const v of singletonViolations.slice(0, 8)) {
      notes.push(`  - ${v.name} (x${v.quantity})`);
    }
    for (const v of singletonViolations) {
      formatLintIssues.push({
        key: 'format:singleton',
        severity: 'hard',
        message: `${v.name}: quantity ${v.quantity} (max 1 except basic lands)`,
        details: { name: v.name, quantity: v.quantity },
      });
    }
  } else {
    notes.push('Singleton: no duplicate non-basic cards.');
  }

  const illegalCards = findIllegalCards(parsedDeck.cards);
  if (illegalCards.length > 0) {
    notes.push(`⛔ Not Commander-legal: ${illegalCards.length} card(s).`);
    for (const v of illegalCards.slice(0, 8)) {
      notes.push(`  - ${v.name} (${v.reason})`);
    }
    for (const v of illegalCards) {
      formatLintIssues.push({
        key: 'format:legality',
        severity: 'hard',
        message: `${v.name}: ${v.reason}`,
        details: { name: v.name, reason: v.reason },
      });
    }
  }

  for (const v of colorIdentityViolations) {
    formatLintIssues.push({
      key: 'format:color_identity',
      severity: 'hard',
      message: v,
    });
  }

  // Initialize category counts from template
  const categoryCounts: Record<string, number> = {};
  for (const cat of template.categories) {
    categoryCounts[cat.name] = 0;
  }

  const tagBracket = input.bracketId ?? effectiveTemplateId;
  const tagOpts = tagBracket === 'bracket3' ? getDefaultBracket3Options('bracket3') : {};
  const deckWithTags: CardWithTags[] = [];

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
    }

    deckWithTags.push({ name: entry.name, tags });

    // Lands count only toward `lands` (type line). Utility lands may still receive
    // functional tags (card_draw, AE hate, etc.) for synergy/lint, but must not
    // inflate non-land category mins — same rule as templateDeckGenerator.
    // See docs/synergy-scoring-explained.md (category coverage = primary tag) and
    // autoTags ramp comment: lands are counted in "lands" from type_line.
    if (isLandCard(card)) {
      categoryCounts['lands'] = (categoryCounts['lands'] ?? 0) + entry.quantity;
      continue;
    }

    const primary = getPrimaryTemplateCategory(tags);
    if (primary && Object.prototype.hasOwnProperty.call(categoryCounts, primary)) {
      categoryCounts[primary] += entry.quantity;
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
    lintReport = buildLintReport(parsedDeck, template, categoryCounts, deckWithTags);
    if (!lintReport.ok) {
      notes.push(`Template lint: ${lintReport.issues.filter((i) => i.severity === 'hard').length} hard issue(s), ${lintReport.issues.filter((i) => i.severity === 'soft').length} soft.`);
    }
  }
  lintReport = mergeFormatLintIssues(lintReport, formatLintIssues);
  if (formatLintIssues.length > 0) {
    notes.push(`Format validation: ${formatLintIssues.length} hard issue(s) (singleton, legality, color identity, or deck size).`);
  }

  const { synergyScore, offThemeCards } = scoreDeckSynergy(
    parsedDeck.cards,
    strategyLabel,
    commanderName ?? undefined
  );
  if (strategyLabel) {
    notes.push(`Synergy score (${strategyLabel}): ${synergyScore}/100.`);
    if (offThemeCards.length > 0) {
      notes.push(`Possible off-theme cards: ${offThemeCards.join(', ')}`);
    }
  }

  let edhrecPool: EdhrecCardSuggestion[] | undefined;
  if (commanderName && strategyLabel) {
    const commanderCard = getCardByName(commanderName);
    if (commanderCard) {
      try {
        const profile = await getFullCommanderProfile(commanderName, getColorIdentity(commanderCard), {
          theme: strategyLabel,
          cardLimit: 80,
          landLimit: 0,
          saltThreshold: 99,
        });
        edhrecPool = profile.cards;
      } catch {
        notes.push('EDHREC unavailable; add suggestions use search_cards placeholders.');
      }
    }
  }

  const recommendations = buildDeckRecommendations(
    parsedDeck.cards,
    categories,
    input,
    edhrecPool
  );

  const cardSynergyScores = strategyLabel
    ? buildCardSynergyScores(
        parsedDeck.cards,
        strategyLabel,
        commanderName ?? undefined
      )
    : undefined;

  const draftAnalysis: DeckAnalysis = {
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
    lintReport,
    synergyScore: strategyLabel ? synergyScore : undefined,
    recommendations,
    unresolvedCardNames:
      normalized.unresolved.length > 0 ? [...normalized.unresolved] : undefined,
  };

  const quality = buildDeckQualityExtensions(draftAnalysis, strategyLabel);
  const prioritizedActions = mergePrioritizedActions(
    recommendations.prioritizedActions,
    quality.prioritizedActions
  );

  const analysis: DeckAnalysis = {
    ...draftAnalysis,
    cardSynergyScores,
    deckScore: quality.deckScore,
    strengthsAndWeaknesses: quality.strengthsAndWeaknesses,
    prioritizedActions,
    manaBaseQuality: quality.manaBaseQuality,
    curveAnalysis: quality.curveAnalysis,
    qualityReport: { ...quality, prioritizedActions },
  };

  const decklistText = formatDecklistText(
    parsedDeck.cards.map((c) => ({ name: c.name, quantity: c.quantity }))
  );

  // Build the complete AnalyzeDeckResult
  const result: AnalyzeDeckResult = {
    input: {
      templateId: effectiveTemplateId,
      bracketId: input.bracketId,
      preferredStrategy: strategyLabel,
      banlistId: input.banlistId
    },
    analysis,
    parsedDeck,
    decklistText,
    synergyScore: analysis.synergyScore,
    recommendations: analysis.recommendations,
    deckScore: analysis.deckScore,
    qualityReport: analysis.qualityReport,
  };

  return result;
}
