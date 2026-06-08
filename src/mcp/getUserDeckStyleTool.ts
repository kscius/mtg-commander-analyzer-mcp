/**
 * MCP tool: deterministic user deck style profile + optional OpenAI narrative.
 */

import { getCardByName } from '../core/scryfall';
import {
  getCommanderStyleHints,
  getUserDeckStyleProfile,
  loadUserDeckIndex,
} from '../core/userDeckLibrary';
import { isOpenAIAvailable } from '../core/llmConfig';
import { analyzeUserDeckPreferencesWithOpenAI } from '../core/userDeckStyleLlm';

export interface GetUserDeckStyleInput {
  commanderName?: string;
  preferredStrategy?: string;
  useOpenAI?: boolean;
  question?: string;
  responseMode?: 'brief' | 'full';
}

export async function runGetUserDeckStyle(input: GetUserDeckStyleInput) {
  const profile = getUserDeckStyleProfile();
  const index = loadUserDeckIndex();

  let commanderHints = undefined;
  let colorIdentity: string[] | undefined;

  if (input.commanderName) {
    const cmd = getCardByName(input.commanderName);
    colorIdentity = cmd?.color_identity ?? [];
    commanderHints = getCommanderStyleHints(input.commanderName, colorIdentity, profile);
  }

  const brief = input.responseMode !== 'full';
  const base = {
    summary:
      profile.deckCount > 0
        ? `User library: ${profile.deckCount} decks. Avg ${profile.landCount.avg} lands (range ${profile.landCount.min}-${profile.landCount.max}).`
        : 'No decks in data/my_decks. Run npm run decks:download-moxfield first.',
    deckCount: profile.deckCount,
    libraryReadOnly: true,
    openAiAvailable: isOpenAIAvailable(),
    profile: brief
      ? {
          landCount: profile.landCount,
          tappedLandCount: profile.tappedLandCount,
          landMixAverages: profile.landMixAverages,
          categoryAverages: profile.categoryAverages,
          topLandStaples: profile.topLandStaples.slice(0, 12),
        }
      : profile,
    commanderHints,
    indexUpdatedAt: index?.downloadedAt,
    nextSuggestedAction:
      profile.deckCount > 0
        ? input.useOpenAI && isOpenAIAvailable()
          ? 'Style profile loaded; OpenAI narrative included below.'
          : 'Use build_deck_from_commander with useUserStyleReference:true to bias mana base toward these patterns.'
        : 'Import decks to data/my_decks (npm run decks:download-moxfield).',
  };

  if (input.useOpenAI) {
    const llm = await analyzeUserDeckPreferencesWithOpenAI({
      commanderName: input.commanderName,
      colorIdentity,
      preferredStrategy: input.preferredStrategy,
      question: input.question,
    });
    return { ...base, openAiAnalysis: llm };
  }

  return base;
}
