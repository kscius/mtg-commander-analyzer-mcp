/**
 * Post-build OpenAI pass: after template + EDHREC refinement, close remaining category gaps
 * using DB-backed candidate lists (enhancement only — does not replace EDHREC).
 */

import { getCardByName } from './scryfall';
import { isOpenAIAvailable } from './llmConfig';
import { logOpenAI } from './mcpStderrLog';
import { fillUnderfilledCategoriesWithOpenAI, type CategoryFillContext } from './llmCategoryEnhancer';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  primaryCategoryToRoles,
  ScryCard,
} from './autoTags';
import { isBanned } from './banlist';
import { isGameChanger, isExtraTurnCard } from './bracketCards';
import { cardFitsCommanderColorIdentity } from './commanderFormat';
import type { BuiltCardEntry, CardRole, DeckAnalysis } from './types';
import type { DeckTemplateValidated } from './templateSchema';
import { loadDeckTemplate } from './templates';

export function shouldUseOpenAIEnhancement(explicit?: boolean): boolean {
  if (explicit === false) return false;
  return isOpenAIAvailable();
}

/**
 * Re-count categories and run OpenAI fill for any still-below template mins.
 */
export async function enhanceBuiltDeckCategoriesWithOpenAI(options: {
  commanderName: string;
  preferredStrategy?: string;
  colorIdentity: string[];
  builtCards: BuiltCardEntry[];
  analysis: DeckAnalysis;
  templateId?: string;
  useOpenAIEnhancement?: boolean;
  notes: string[];
}): Promise<BuiltCardEntry[]> {
  if (!shouldUseOpenAIEnhancement(options.useOpenAIEnhancement)) {
    if (options.useOpenAIEnhancement === false) {
      logOpenAI('Post-build enhancement skipped: useOpenAIEnhancement=false');
    } else {
      logOpenAI('Post-build enhancement skipped: OPENAI_API_KEY not configured');
    }
    return options.builtCards;
  }

  const below = options.analysis.categories?.filter((c) => c.status === 'below') ?? [];
  if (below.length === 0) {
    logOpenAI('Post-build enhancement skipped: no categories below minimum');
    return options.builtCards;
  }

  logOpenAI(
    `Post-build enhancement started (${below.map((c) => c.name).join(', ')}) commander=${options.commanderName}`
  );

  const template = loadDeckTemplate(options.templateId ?? 'bracket3') as DeckTemplateValidated;
  const nonLandCategories = template.categories.filter((c) => c.name !== 'lands');
  const categoryTargets = new Map<string, number>();
  const categoryCounts: Record<string, number> = {};
  for (const cat of nonLandCategories) {
    categoryTargets.set(cat.name, cat.min);
    categoryCounts[cat.name] = 0;
  }

  const tagOpts = getDefaultBracket3Options();
  const cardsInDeck = new Set<string>();
  const builtCards = options.builtCards.map((c) => ({ ...c }));

  for (const entry of builtCards) {
    cardsInDeck.add(entry.name.toLowerCase());
    const card = getCardByName(entry.name);
    if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
    const tags = autoTags(card as ScryCard, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);
    if (primary) categoryCounts[primary] = (categoryCounts[primary] ?? 0) + 1;
  }

  let gameChangerCount = 0;
  let extraTurnCount = 0;
  const maxGameChangers = template.policies?.max_game_changers ?? 3;
  const maxExtraTurns = template.policies?.max_extra_turn_cards ?? 3;

  for (const entry of builtCards) {
    if (isGameChanger(entry.name, 'bracket3')) gameChangerCount++;
    if (isExtraTurnCard(entry.name, 'bracket3')) extraTurnCount++;
  }

  const addCard = (name: string, roles?: CardRole[]): boolean => {
    const key = name.toLowerCase();
    if (cardsInDeck.has(key)) return false;
    if (isBanned(name)) return false;
    const card = getCardByName(name);
    if (!card) return false;
    if (!cardFitsCommanderColorIdentity(card, options.colorIdentity)) return false;

    const resolvedRoles =
      roles ??
      primaryCategoryToRoles(
        getPrimaryTemplateCategory(
          autoTags(
            {
              name: card.name,
              oracle_text: card.oracle_text,
              type_line: card.type_line,
              mana_cost: card.mana_cost,
              cmc: card.cmc,
            } as ScryCard,
            tagOpts
          )
        )
      );

    builtCards.push({ name, quantity: 1, roles: resolvedRoles });
    cardsInDeck.add(key);
    return true;
  };

  const ctx: CategoryFillContext = {
    builtCards,
    cardsInDeck,
    nonLandCategories,
    categoryTargets,
    categoryCounts,
    colorIdentity: options.colorIdentity,
    commanderName: options.commanderName,
    preferredTheme: options.preferredStrategy,
    tagOpts,
    addCard,
    notes: options.notes,
    counters: { gameChangerCount, extraTurnCount },
    maxGameChangers,
    maxExtraTurns,
  };

  await fillUnderfilledCategoriesWithOpenAI(ctx);
  return builtCards;
}
