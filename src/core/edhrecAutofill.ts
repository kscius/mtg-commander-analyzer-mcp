/**
 * Iterative EDHREC-based category autofill for Commander 99-card mainboards.
 * Respects Bracket 3 limits, banlist, color identity, and never exceeds 99 cards.
 */

import type {
  AnalyzeDeckInput,
  BuiltCardEntry,
  DeckAnalysis,
  DeckTemplate,
  EdhrecContext,
  BuildDeckInput,
  EdhrecCardSuggestion,
} from './types';
import type { BracketRules } from './brackets';
import type { OracleCard } from './scryfall';
import { getCardByName } from './scryfall';
import { cardFitsCommanderColorIdentity } from './commanderFormat';
import { resolveCardNameSync } from './cardResolution';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { computeCategoryDeficits } from './categoryUtils';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  primaryCategoryToRoles,
  ScryCard,
} from './autoTags';
import { isBanned } from './banlist';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import { CardWithTags, loadCombos, validateBracket3, validateTwoCardCombosBeforeT6, Bracket3Policies } from './bracket3Validation';
import { formatDecklistText } from './deckTextFormat';
import { scoreEdhrecSuggestionForTheme } from './edhrecStrategyScoring';
import { OFF_THEME_CARD_THRESHOLD, scoreCardForStrategy } from './synergyScorer';
import { getOracleText, getPrimaryTypeLine } from './scryfallNormalize';

export const AUTOFILL_CATEGORY_NAMES = [
  'ramp',
  'card_draw',
  'card_selection',
  'spot_removal',
  'artifact_enchantment_hate',
  'graveyard_hate',
  'board_wipes',
  'protection',
  'value_engines',
  'win_conditions',
] as const;

const COMMANDER_DECK_SIZE = 99;

function sumMainboardQuantities(cards: BuiltCardEntry[]): number {
  return cards.reduce((s, c) => s + c.quantity, 0);
}

function deckTextFromBuilt(cards: BuiltCardEntry[]): string {
  return formatDecklistText(cards);
}

/**
 * True when hard template lint, lands deficit, or a tracked category is below minimum.
 * Soft-only lint does not trigger autofill.
 */
export function analysisHasAutomatableGaps(analysis: DeckAnalysis): boolean {
  const hardLint =
    analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
  if (hardLint.length > 0) {
    return true;
  }
  for (const c of analysis.categories) {
    if (c.name === 'lands' && c.status === 'below') {
      return true;
    }
    if (
      AUTOFILL_CATEGORY_NAMES.includes(
        c.name as (typeof AUTOFILL_CATEGORY_NAMES)[number]
      ) &&
      c.status === 'below'
    ) {
      return true;
    }
  }
  return false;
}

function rankSuggestion(
  suggestion: EdhrecCardSuggestion,
  card: OracleCard,
  themeSlug: string | undefined,
  commanderName: string
): number {
  const edhrec = scoreEdhrecSuggestionForTheme(suggestion, themeSlug);
  const scry: ScryCard = {
    name: card.name,
    oracle_text: getOracleText(card),
    type_line: getPrimaryTypeLine(card),
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    tags: card.tags,
  };
  return edhrec + scoreCardForStrategy(scry, themeSlug ?? '', commanderName) * 0.9;
}

/**
 * When mainboard is full, pick lowest-synergy card from above-max or off-theme slots.
 */
function findSwapCutIndex(
  cards: BuiltCardEntry[],
  analysis: DeckAnalysis,
  themeSlug: string | undefined,
  commanderName: string,
  tagOpts: ReturnType<typeof getDefaultBracket3Options>
): number | null {
  const aboveCats = new Set(
    analysis.categories.filter((c) => c.status === 'above' && c.max != null).map((c) => c.name)
  );
  let worstIdx: number | null = null;
  let worstScore = Infinity;

  for (let i = 0; i < cards.length; i++) {
    const entry = cards[i];
    const card = getCardByName(entry.name);
    if (!card || getPrimaryTypeLine(card).toLowerCase().includes('land')) continue;

    const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);
    const scry: ScryCard = {
      name: card.name,
      oracle_text: getOracleText(card),
      type_line: getPrimaryTypeLine(card),
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      tags: card.tags,
    };
    const score = scoreCardForStrategy(scry, themeSlug ?? '', commanderName);
    const cuttable = (primary && aboveCats.has(primary)) || score < OFF_THEME_CARD_THRESHOLD;
    if (!cuttable) continue;
    if (score < worstScore) {
      worstScore = score;
      worstIdx = i;
    }
  }
  return worstIdx;
}

/**
 * One pass: add cards from EDHREC suggestions to cover category deficits. Stops at 99 mainboard cards.
 */
export function runSingleEdhrecAutofillPass(
  builtCards: BuiltCardEntry[],
  analysis: DeckAnalysis,
  template: DeckTemplate,
  commanderCard: OracleCard,
  colorIdentity: string[],
  bracketId: string,
  bracketRules: BracketRules | undefined,
  edhrecContext: EdhrecContext
): { newCards: BuiltCardEntry[]; addedCount: number; passNotes: string[] } {
  const passNotes: string[] = [];
  const cards = builtCards.map((c) => ({ ...c, quantity: c.quantity }));

  const deficits = computeCategoryDeficits(analysis, template, [...AUTOFILL_CATEGORY_NAMES]);
  const cardsInDeck = new Set(cards.map((c) => c.name.toLowerCase()));

  let gameChangerCount = cards
    .filter((card) => isGameChanger(card.name, bracketId))
    .reduce((sum, card) => sum + card.quantity, 0);
  const maxGameChangers = bracketRules?.maxGameChangers ?? 3;
  const maxExtraTurns = bracketRules?.maxExtraTurnCards ?? 3;
  let extraTurnCount = cards.filter((c) => isExtraTurnCard(c.name, bracketId)).reduce((s, c) => s + c.quantity, 0);

  const tagOpts = getDefaultBracket3Options('bracket3');
  const autofillCounts: Record<string, number> = {};
  for (const cat of AUTOFILL_CATEGORY_NAMES) {
    autofillCounts[cat] = 0;
  }

  let addedCount = 0;

  const themeSlug = edhrecContext.selectedTheme;
  const commanderName = commanderCard.name;

  for (const categoryName of AUTOFILL_CATEGORY_NAMES) {
    const deficit = deficits.find((d) => d.name === categoryName);
    if (!deficit || deficit.deficit <= 0) {
      continue;
    }

    let remaining = deficit.deficit;
    passNotes.push(`  → ${categoryName}: deficit of ${remaining}`);

    const sortedSuggestions = [...edhrecContext.suggestions].sort((a, b) => {
      const ca = getCardByName(a.name);
      const cb = getCardByName(b.name);
      const sa = ca ? rankSuggestion(a, ca, themeSlug, commanderName) : 0;
      const sb = cb ? rankSuggestion(b, cb, themeSlug, commanderName) : 0;
      return sb - sa;
    });

    for (const suggestion of sortedSuggestions) {
      if (remaining <= 0) break;

      if (cardsInDeck.has(suggestion.name.toLowerCase())) {
        continue;
      }

      const resolved = resolveCardNameSync(suggestion.name);
      const card = resolved?.card ?? getCardByName(suggestion.name);
      if (!card || !cardFitsCommanderColorIdentity(card, colorIdentity)) {
        continue;
      }

      if (isBanned(suggestion.name)) continue;
      if (isGameChanger(suggestion.name, bracketId) && gameChangerCount >= maxGameChangers) continue;
      if (isMassLandDenial(suggestion.name, bracketId)) continue;
      if (isExtraTurnCard(suggestion.name, bracketId) && extraTurnCount >= maxExtraTurns) continue;

      const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, tagOpts);
      const primary = getPrimaryTemplateCategory(tags);
      if (primary !== categoryName) continue;

      const atCap = sumMainboardQuantities(cards) >= COMMANDER_DECK_SIZE;
      if (atCap) {
        const cutIdx = findSwapCutIndex(cards, analysis, themeSlug, commanderName, tagOpts);
        if (cutIdx == null) {
          passNotes.push(`    ⚠️  At ${COMMANDER_DECK_SIZE} cards; no swap cut for ${categoryName}.`);
          break;
        }
        const cutName = cards[cutIdx].name;
        cards.splice(cutIdx, 1);
        cardsInDeck.delete(cutName.toLowerCase());
        if (isGameChanger(cutName, bracketId)) gameChangerCount = Math.max(0, gameChangerCount - 1);
        if (isExtraTurnCard(cutName, bracketId)) extraTurnCount = Math.max(0, extraTurnCount - 1);
        passNotes.push(`    ↔ Swap cut ${cutName} for ${card.name} (${categoryName})`);
      }

      cards.push({
        name: card.name,
        quantity: 1,
        roles: primaryCategoryToRoles(primary),
      });

      cardsInDeck.add(card.name.toLowerCase());
      remaining--;
      autofillCounts[categoryName]++;
      addedCount++;

      if (isGameChanger(card.name, bracketId)) gameChangerCount++;
      if (isExtraTurnCard(card.name, bracketId)) extraTurnCount++;
    }

    if (remaining > 0) {
      passNotes.push(`    ⚠️  Could not fill all ${categoryName} slots (${remaining} remaining)`);
    } else {
      passNotes.push(`    ✓ Filled ${autofillCounts[categoryName]} ${categoryName} slots`);
    }
  }

  const totalAutofilled = Object.values(autofillCounts).reduce((a, b) => a + b, 0);
  if (totalAutofilled > 0) {
    const breakdown = AUTOFILL_CATEGORY_NAMES.filter((c) => (autofillCounts[c] ?? 0) > 0)
      .map((c) => `${c}: ${autofillCounts[c]}`)
      .join(', ');
    passNotes.push(`✓ Pass added ${totalAutofilled} card(s)${breakdown ? ` (${breakdown})` : ''}`);
  }

  return { newCards: cards, addedCount, passNotes };
}

/**
 * Add lands from EDHREC suggestions when the lands category is below template minimum.
 */
export function runLandAutofillPass(
  builtCards: BuiltCardEntry[],
  analysis: DeckAnalysis,
  template: DeckTemplate,
  colorIdentity: string[],
  edhrecContext: EdhrecContext
): { newCards: BuiltCardEntry[]; addedCount: number; passNotes: string[] } {
  const passNotes: string[] = [];
  const cards = builtCards.map((c) => ({ ...c }));
  const landsCat = analysis.categories.find((c) => c.name === 'lands');
  if (!landsCat || landsCat.status !== 'below' || landsCat.min == null) {
    return { newCards: cards, addedCount: 0, passNotes };
  }

  const deficit = (landsCat.min ?? 0) - landsCat.count;
  if (deficit <= 0) {
    return { newCards: cards, addedCount: 0, passNotes };
  }

  const inDeck = new Set(cards.map((c) => c.name.toLowerCase()));
  let addedCount = 0;

  const tagOpts = getDefaultBracket3Options('bracket3');
  const themeSlug = edhrecContext.selectedTheme;
  const commanderName = analysis.commanderName ?? '';

  const sortedLandSuggestions = [...edhrecContext.suggestions]
    .filter((sug) => {
      const card = getCardByName(sug.name);
      return card?.type_line?.toLowerCase().includes('land') ?? false;
    })
    .sort((a, b) => {
      const ca = getCardByName(a.name);
      const cb = getCardByName(b.name);
      const sa = ca ? rankSuggestion(a, ca, themeSlug, commanderName) : 0;
      const sb = cb ? rankSuggestion(b, cb, themeSlug, commanderName) : 0;
      return sb - sa;
    });

  for (const sug of sortedLandSuggestions) {
    if (addedCount >= deficit) {
      break;
    }
    if (inDeck.has(sug.name.toLowerCase())) continue;
    const card = getCardByName(sug.name);
    if (!card?.type_line?.toLowerCase().includes('land')) continue;
    if (!cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
    if (isBanned(card.name)) continue;

    const atCap = sumMainboardQuantities(cards) >= COMMANDER_DECK_SIZE;
    if (atCap) {
      const cutIdx = findSwapCutIndex(cards, analysis, themeSlug, commanderName, tagOpts);
      if (cutIdx == null) {
        passNotes.push(
          `    ⚠️  At ${COMMANDER_DECK_SIZE} cards; no swap cut for lands (${deficit - addedCount} remaining).`
        );
        break;
      }
      const cutName = cards[cutIdx].name;
      cards.splice(cutIdx, 1);
      inDeck.delete(cutName.toLowerCase());
      passNotes.push(`    ↔ Swap cut ${cutName} for land autofill`);
    }

    cards.push({
      name: card.name,
      quantity: 1,
      roles: primaryCategoryToRoles('lands'),
    });
    inDeck.add(card.name.toLowerCase());
    addedCount++;
    passNotes.push(`  → Land autofill: ${card.name}`);
  }

  if (addedCount > 0) {
    passNotes.push(`Land autofill added ${addedCount} land(s) toward ${landsCat.min} minimum.`);
  }

  return { newCards: cards, addedCount, passNotes };
}

function appendBracket3BuilderNotes(
  builtCards: BuiltCardEntry[],
  bracketId: string,
  bracketRules: BracketRules | undefined,
  builderNotes: string[]
): void {
  const tagOpts = getDefaultBracket3Options('bracket3');
  const deckForValidation: CardWithTags[] = builtCards.map((c) => {
    const card = getCardByName(c.name);
    let tags = card?.tags && card.tags.length > 0 ? card.tags : [];
    if (tags.length === 0 && card) {
      tags = autoTags(card as ScryCard, tagOpts);
    }
    return { name: c.name, tags };
  });
  const policies: Bracket3Policies = {
    max_game_changers: bracketRules?.maxGameChangers ?? 3,
    max_extra_turn_cards: bracketRules?.maxExtraTurnCards ?? 3,
    ban_mass_land_denial: !bracketRules?.allowMassLandDestruction,
    ban_extra_turn_chains: true,
    ban_2card_gameenders_before_turn: 6,
  };
  const b3 = validateBracket3(deckForValidation, policies);
  const combos = loadCombos();
  const comboErrs = validateTwoCardCombosBeforeT6(deckForValidation, combos, 6);
  if (b3.errors.length > 0 || b3.warnings.length > 0 || comboErrs.length > 0) {
    builderNotes.push('Bracket 3 validation:');
    builderNotes.push(...b3.errors.map((e) => `  ⛔ ${e}`));
    builderNotes.push(...b3.warnings.map((w) => `  ⚠ ${w}`));
    builderNotes.push(...comboErrs.map((e) => `  ⛔ ${e}`));
  }
}

async function analyzeBuiltDeck(
  cards: BuiltCardEntry[],
  templateId: string,
  banlistId: string | undefined
): Promise<DeckAnalysis> {
  const deckText = deckTextFromBuilt(cards);
  const parsed = parseDeckText(deckText);
  const ar = await analyzeDeckBasic(
    {
      deckText,
      templateId,
      banlistId,
      options: {},
    },
    parsed
  );
  return ar.analysis;
}

/**
 * True when lands or tracked autofill categories are below template minimums.
 * Used by the iterative build refinement loop (mirrors optimize_deck land handling).
 */
export function hasRemainingEdhrecAutofillDeficits(
  analysis: DeckAnalysis,
  template: DeckTemplate
): boolean {
  const landsBelow = analysis.categories.some(
    (c) => c.name === 'lands' && c.status === 'below'
  );
  if (landsBelow) {
    return true;
  }
  const deficits = computeCategoryDeficits(analysis, template, [...AUTOFILL_CATEGORY_NAMES]);
  return deficits.some((d) => d.deficit > 0);
}

/**
 * Repeatedly fills category deficits until none remain, mainboard is full, no progress, or max iterations.
 */
export async function runIterativeEdhrecAutofill(
  input: BuildDeckInput,
  commanderCard: OracleCard,
  template: DeckTemplate,
  bracketRules: BracketRules | undefined,
  bracketId: string,
  templateId: string,
  edhrecContext: EdhrecContext,
  initialCards: BuiltCardEntry[],
  refineUntilStable: boolean,
  maxIterations: number
): Promise<{
  builtCards: BuiltCardEntry[];
  analysis: DeckAnalysis;
  iterationNotes: string[];
}> {
  const colorIdentity = commanderCard.color_identity || [];
  let cards = initialCards.map((c) => ({ ...c }));
  const iterationNotes: string[] = [];

  if (!input.useEdhrecAutofill || !edhrecContext.suggestions.length) {
    const analysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);
    return { builtCards: cards, analysis, iterationNotes };
  }

  const passLimit = refineUntilStable ? Math.max(1, maxIterations) : 1;

  for (let pass = 1; pass <= passLimit; pass++) {
    const analysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);

    if (!hasRemainingEdhrecAutofillDeficits(analysis, template)) {
      iterationNotes.push(`--- EDHREC autofill: pass ${pass} — no category deficits remaining. ---`);
      appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
      return { builtCards: cards, analysis, iterationNotes };
    }

    iterationNotes.push(`--- EDHREC autofill pass ${pass}/${passLimit} ---`);

    const landsBelow = analysis.categories.some(
      (c) => c.name === 'lands' && c.status === 'below'
    );
    const categoryDeficits = computeCategoryDeficits(analysis, template, [...AUTOFILL_CATEGORY_NAMES]);
    const categoryDeficitTotal = categoryDeficits.reduce((s, d) => s + d.deficit, 0);

    let passAdded = 0;

    if (landsBelow) {
      const landPass = runLandAutofillPass(
        cards,
        analysis,
        template,
        colorIdentity,
        edhrecContext
      );
      cards = landPass.newCards;
      iterationNotes.push(...landPass.passNotes);
      passAdded += landPass.addedCount;
    }

    if (categoryDeficitTotal > 0) {
      const { newCards, addedCount, passNotes } = runSingleEdhrecAutofillPass(
        cards,
        analysis,
        template,
        commanderCard,
        colorIdentity,
        bracketId,
        bracketRules,
        edhrecContext
      );
      iterationNotes.push(...passNotes);
      cards = newCards;
      passAdded += addedCount;
    }

    if (passAdded === 0) {
      const finalAnalysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);
      appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
      return { builtCards: cards, analysis: finalAnalysis, iterationNotes };
    }
  }

  const finalAnalysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);
  appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
  return { builtCards: cards, analysis: finalAnalysis, iterationNotes };
}
