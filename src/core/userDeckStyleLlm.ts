/**
 * OpenAI analysis of the user's imported deck library — narrative style preferences.
 * Only runs when OPENAI_API_KEY is configured and explicitly requested.
 */

import {
  buildChatCompletionTokenLimit,
  createOpenAIClient,
  getOpenAIConfig,
  isOpenAIAvailable,
  resolveModelForRole,
} from './llmConfig';
import { logOpenAI } from './mcpStderrLog';
import {
  getCommanderStyleHints,
  getUserDeckStyleProfile,
  type UserDeckStyleProfile,
} from './userDeckLibrary';

const ANALYSIS_TEMPERATURE = 0.4;

export interface UserDeckStyleLlmInput {
  commanderName?: string;
  colorIdentity?: string[];
  preferredStrategy?: string;
  question?: string;
}

export interface UserDeckStyleLlmResult {
  openAiUsed: boolean;
  summary: string;
  narrative?: string;
  manaBaseNotes?: string[];
  constructionNotes?: string[];
  referenceDeckNames?: string[];
  error?: string;
}

function buildStatsPayload(
  profile: UserDeckStyleProfile,
  commanderName?: string,
  colorIdentity?: string[],
  preferredStrategy?: string
): Record<string, unknown> {
  const hints =
    commanderName && colorIdentity
      ? getCommanderStyleHints(commanderName, colorIdentity, profile)
      : null;

  return {
    deckCount: profile.deckCount,
    landCount: profile.landCount,
    tappedLandCount: profile.tappedLandCount,
    landMixAverages: profile.landMixAverages,
    categoryAverages: profile.categoryAverages,
    topLandStaples: profile.topLandStaples.slice(0, 20),
    topNonLandStaples: profile.topNonLandStaples.slice(0, 15),
    commanderContext: hints
      ? {
          commanderName,
          colorIdentity,
          preferredStrategy,
          targetLandCount: hints.targetLandCount,
          preferredLandNames: hints.preferredLandNames.slice(0, 20),
          referenceDecks: hints.referenceDecks,
        }
      : undefined,
  };
}

export async function analyzeUserDeckPreferencesWithOpenAI(
  input: UserDeckStyleLlmInput
): Promise<UserDeckStyleLlmResult> {
  const profile = getUserDeckStyleProfile();
  if (profile.deckCount === 0) {
    return {
      openAiUsed: false,
      summary: 'No user decks found in data/my_decks. Import Moxfield decks first.',
    };
  }

  if (!isOpenAIAvailable()) {
    return {
      openAiUsed: false,
      summary: `User library: ${profile.deckCount} decks. Avg lands ${profile.landCount.avg}. Set OPENAI_API_KEY for narrative style analysis.`,
      referenceDeckNames: profile.decks.slice(0, 8).map((d) => d.name),
    };
  }

  const config = getOpenAIConfig();
  const openai = createOpenAIClient(config);
  const model = resolveModelForRole('default', config);

  const question =
    input.question?.trim() ||
    (input.commanderName
      ? `How should I build the mana base and shell for ${input.commanderName} to match this player's existing decks?`
      : "Summarize this player's Commander deck-building preferences, especially mana base and ramp/draw balance.");

  const stats = buildStatsPayload(
    profile,
    input.commanderName,
    input.colorIdentity,
    input.preferredStrategy
  );

  const prompt = `You analyze Magic: The Gathering Commander deck-building preferences from aggregated statistics of a player's real decks (imported from Moxfield).

Player deck statistics (JSON):
${JSON.stringify(stats, null, 2)}

User question: ${question}

Respond with ONLY valid JSON:
{
  "summary": "one sentence",
  "narrative": "2-4 paragraphs describing mana base habits, land types, ramp/draw/removal balance, tapped land tolerance",
  "manaBaseNotes": ["bullet", "..."],
  "constructionNotes": ["bullet", "..."],
  "referenceDeckNames": ["deck names from stats that best match the question"]
}

Rules:
- Base conclusions ONLY on the statistics provided — do not invent cards not in topLandStaples/topNonLandStaples unless describing general patterns
- Focus on mana base: land count, fetches/shocks/duals/basics mix, utility lands, tapped land tolerance
- Bracket 3 context; singleton Commander
- If commanderContext is present, tailor advice to that commander's colors`;

  try {
    logOpenAI(`User style analysis → model=${model}, decks=${profile.deckCount}`);
    const completion = await openai.chat.completions.create({
      model,
      temperature: ANALYSIS_TEMPERATURE,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      ...buildChatCompletionTokenLimit(model, Math.min(config.maxTokens, 2048)),
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return {
        openAiUsed: true,
        summary: 'OpenAI returned empty response.',
        error: 'empty_response',
      };
    }

    const parsed = JSON.parse(raw) as {
      summary?: string;
      narrative?: string;
      manaBaseNotes?: string[];
      constructionNotes?: string[];
      referenceDeckNames?: string[];
    };

    return {
      openAiUsed: true,
      summary: parsed.summary ?? 'Style analysis complete.',
      narrative: parsed.narrative,
      manaBaseNotes: parsed.manaBaseNotes,
      constructionNotes: parsed.constructionNotes,
      referenceDeckNames: parsed.referenceDeckNames,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logOpenAI(`User style analysis failed: ${msg}`);
    return {
      openAiUsed: true,
      summary: 'OpenAI style analysis failed.',
      error: msg,
    };
  }
}
