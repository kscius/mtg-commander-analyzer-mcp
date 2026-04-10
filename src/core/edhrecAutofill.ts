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
} from './types';
import type { BracketRules } from './brackets';
import type { OracleCard } from './scryfall';
import { getCardByName } from './scryfall';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { computeCategoryDeficits } from './categoryUtils';
import { autoTags, getDefaultBracket3Options, tagsToTemplateCategories, ScryCard } from './autoTags';
import { classifyCardRoles } from './roles';
import { isBanned } from './banlist';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import { CardWithTags, loadCombos, validateBracket3, validateTwoCardCombosBeforeT6, Bracket3Policies } from './bracket3Validation';
import { formatDecklistText } from './deckTextFormat';

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
 * True when template lint lists any issue, or a tracked category is below minimum.
 */
export function analysisHasAutomatableGaps(analysis: DeckAnalysis): boolean {
  if (analysis.lintReport && analysis.lintReport.issues.length > 0) {
    return true;
  }
  for (const c of analysis.categories) {
    if (AUTOFILL_CATEGORY_NAMES.includes(c.name as (typeof AUTOFILL_CATEGORY_NAMES)[number]) && c.status === 'below') {
      return true;
    }
  }
  return false;
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

  for (const categoryName of AUTOFILL_CATEGORY_NAMES) {
    if (sumMainboardQuantities(cards) >= COMMANDER_DECK_SIZE) {
      passNotes.push(`  → Stopped: mainboard at ${COMMANDER_DECK_SIZE} cards.`);
      break;
    }

    const deficit = deficits.find((d) => d.name === categoryName);
    if (!deficit || deficit.deficit <= 0) {
      continue;
    }

    let remaining = deficit.deficit;
    passNotes.push(`  → ${categoryName}: deficit of ${remaining}`);

    for (const suggestion of edhrecContext.suggestions) {
      if (remaining <= 0 || sumMainboardQuantities(cards) >= COMMANDER_DECK_SIZE) {
        break;
      }

      if (cardsInDeck.has(suggestion.name.toLowerCase())) {
        continue;
      }

      const card = getCardByName(suggestion.name);
      if (!card) {
        continue;
      }

      const cardColors = card.color_identity || [];
      const isWithinColorIdentity = cardColors.every((c) => colorIdentity.includes(c));
      if (!isWithinColorIdentity) {
        continue;
      }

      if (isBanned(suggestion.name)) {
        continue;
      }

      if (isGameChanger(suggestion.name, bracketId)) {
        if (gameChangerCount >= maxGameChangers) {
          continue;
        }
      }

      if (isMassLandDenial(suggestion.name, bracketId)) {
        continue;
      }

      if (isExtraTurnCard(suggestion.name, bracketId)) {
        if (extraTurnCount >= maxExtraTurns) {
          continue;
        }
      }

      const tags = card.tags && card.tags.length > 0 ? card.tags : autoTags(card as ScryCard, tagOpts);
      const categories = tagsToTemplateCategories(tags);

      if (!categories.includes(categoryName)) {
        continue;
      }

      cards.push({
        name: card.name,
        quantity: 1,
        roles: classifyCardRoles(card),
      });

      cardsInDeck.add(card.name.toLowerCase());
      remaining--;
      autofillCounts[categoryName]++;
      addedCount++;

      if (isGameChanger(card.name, bracketId)) {
        gameChangerCount++;
      }
      if (isExtraTurnCard(card.name, bracketId)) {
        extraTurnCount++;
      }
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
      options: { inferCommander: false },
    },
    parsed
  );
  return ar.analysis;
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

    const deficits = computeCategoryDeficits(analysis, template, [...AUTOFILL_CATEGORY_NAMES]);
    const totalDeficit = deficits.reduce((s, d) => s + d.deficit, 0);
    if (totalDeficit === 0) {
      iterationNotes.push(`--- EDHREC autofill: pass ${pass} — no category deficits remaining. ---`);
      appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
      return { builtCards: cards, analysis, iterationNotes };
    }

    iterationNotes.push(`--- EDHREC autofill pass ${pass}/${passLimit} ---`);

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

    if (addedCount === 0) {
      const finalAnalysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);
      appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
      return { builtCards: cards, analysis: finalAnalysis, iterationNotes };
    }
  }

  const finalAnalysis = await analyzeBuiltDeck(cards, templateId, input.banlistId);
  appendBracket3BuilderNotes(cards, bracketId, bracketRules, iterationNotes);
  return { builtCards: cards, analysis: finalAnalysis, iterationNotes };
}
