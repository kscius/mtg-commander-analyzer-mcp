/**
 * llmDeckBuilder.ts
 * 
 * LLM-powered deck builder using OpenAI GPT-4.1.
 * Builds complete 99-card Commander decks using AI reasoning.
 */

import OpenAI from 'openai';
import { getLLMConfig, isLLMAvailable } from './llmConfig';
import { getCardByName } from './scryfall';
import { getBannedCards, isBanned } from './banlist';
import {
  getFullCommanderProfile,
  getTopCardsForColorIdentity,
  getTopLandsForColorIdentity,
} from './edhrec';
import {
  BuildDeckInput,
  BuildDeckResult,
  BuiltCardEntry,
  DeckAnalysis,
  EdhrecCardSuggestion,
  EdhrecContext,
} from './types';
import { classifyCardRoles } from './roles';
import { loadDeckTemplate } from './templates';
import { loadBracketRules, type BracketRules } from './brackets';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { runIterativeEdhrecAutofill } from './edhrecAutofill';

/** Maximum OpenAI retry attempts on transient/validation failures */
const MAX_LLM_RETRIES = 2;

/**
 * System prompt for the LLM deck builder
 */
const SYSTEM_PROMPT = `You are an expert Magic: The Gathering Commander deck builder.
Your task is to build a complete 99-card Commander deck (excluding the commander itself) for Bracket 3 rules.

CRITICAL RULES - YOU MUST FOLLOW ALL OF THESE:
1. The deck MUST have EXACTLY 99 cards (the commander is the 100th card)
2. ALL cards must be within the commander's color identity
3. NO banned cards from the provided banlist
4. SINGLETON rule: Only 1 copy of each card (except basic lands)
5. Bracket 3 power level (casual-upgraded, no cEDH)
6. No budget restrictions - use the best cards available

BRACKET 3 POLICY LIMITS (MANDATORY):
- Game Changers: maximum 3 (e.g. Cyclonic Rift, Rhystic Study, Dockside Extortionist - count and stay ≤3)
- Extra turn cards: maximum 3 (e.g. Time Warp, Temporal Manipulation - count and stay ≤3)
- NO mass land destruction/denial (e.g. Armageddon, Winter Orb that locks lands)
- NO two-card infinite combos that win before turn 6 (e.g. Thassa's Oracle + Demonic Consultation, Kiki-Jiki + Zealous Conscripts)

DECK COMPOSITION (Bracket 3 template):
- 35-38 Lands
- 9-12 Ramp
- 8-12 Card draw
- 6-10 Spot removal
- 2-4 Artifact/enchantment hate
- 1-3 Graveyard hate
- 2-4 Board wipes
- 2-5 Protection
- 3-6 Value engines
- 1-3 Win conditions
- Game changers: 0-3 | Extra turns: 0-3 (respect the 3-card cap each)

OUTPUT FORMAT:
Return ONLY a valid JSON object with this exact structure:
{
  "cards": [
    "Card Name 1",
    "Card Name 2",
    ...
  ],
  "strategy": "Brief description of the deck's strategy",
  "keyCards": ["List of 5-10 key synergy cards"],
  "notes": "Any important notes about card choices"
}

The "cards" array must contain EXACTLY 99 card names.
Use exact card names as they appear in Scryfall.`;

/**
 * Format a card suggestion with synergy/salt metadata for the prompt.
 */
function formatSuggestion(s: EdhrecCardSuggestion): string {
  const parts = [s.name];
  if (s.synergyScore != null) parts.push(`syn:${s.synergyScore.toFixed(2)}`);
  if (s.saltScore != null) parts.push(`salt:${s.saltScore.toFixed(1)}`);
  if (s.inclusionRate != null) parts.push(`${(s.inclusionRate * 100).toFixed(0)}%`);
  if (s.label) parts.push(`[${s.label}]`);
  return parts.join(' | ');
}

/**
 * Build an enriched user prompt with EDHREC synergy data, themes, combos, and lands.
 */
function buildUserPrompt(
  commanderName: string,
  colorIdentity: string[],
  suggestions: EdhrecCardSuggestion[],
  lands: EdhrecCardSuggestion[],
  bannedCards: string[],
  seedCards: string[],
  options?: {
    theme?: string;
    combos?: Array<{ cards: string[]; description?: string }>;
    highSaltCards?: string[];
  }
): string {
  const colorStr = colorIdentity.length > 0 ? colorIdentity.join('') : 'Colorless';

  let prompt = `Build a Commander deck for: ${commanderName}\nColor Identity: ${colorStr}\n\n`;

  if (options?.theme) {
    prompt += `SELECTED THEME/ARCHETYPE: ${options.theme}\nPrioritize cards that support this theme.\n\n`;
  }

  if (seedCards.length > 0) {
    prompt += `MUST INCLUDE these cards (if legal):\n${seedCards.map(c => `- ${c}`).join('\n')}\n\n`;
  }

  prompt += `BANNED CARDS (DO NOT USE):\n`;
  prompt += bannedCards.slice(0, 50).map(c => `- ${c}`).join('\n');
  if (bannedCards.length > 50) prompt += `\n... and ${bannedCards.length - 50} more`;
  prompt += '\n\n';

  if (options?.highSaltCards && options.highSaltCards.length > 0) {
    prompt += `HIGH-SALT CARDS (avoid for better play experience):\n`;
    prompt += options.highSaltCards.slice(0, 15).map(c => `- ${c}`).join('\n');
    prompt += '\n\n';
  }

  if (suggestions.length > 0) {
    prompt += `EDHREC POPULAR CARDS (sorted by synergy — name | synergy score | salt | inclusion% | label):\n`;
    prompt += suggestions.slice(0, 90).map(s => `- ${formatSuggestion(s)}`).join('\n');
    prompt += '\n\n';
  }

  if (lands.length > 0) {
    prompt += `EDHREC RECOMMENDED LANDS:\n`;
    prompt += lands.slice(0, 35).map(s => `- ${formatSuggestion(s)}`).join('\n');
    prompt += '\n\n';
  }

  if (options?.combos && options.combos.length > 0) {
    prompt += `KNOWN COMBOS (consider including if they comply with Bracket 3 — no 2-card instant-wins before T6):\n`;
    for (const combo of options.combos.slice(0, 8)) {
      prompt += `- ${combo.cards.join(' + ')}`;
      if (combo.description) prompt += ` — ${combo.description}`;
      prompt += '\n';
    }
    prompt += '\n';
  }

  prompt += `Remember:
- EXACTLY 99 cards total
- All cards must match color identity: ${colorStr}
- No banned cards
- Singleton format (except basic lands)
- Bracket 3: max 3 Game Changers, max 3 extra-turn cards, no MLD, no 2-card combos before T6
- Return valid JSON only`;

  return prompt;
}

/**
 * Parse LLM response to extract card list
 */
function parseLLMResponse(response: string): { 
  cards: string[]; 
  strategy?: string; 
  keyCards?: string[];
  notes?: string;
} {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM response did not contain valid JSON');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(parsed.cards)) {
      throw new Error('Response missing "cards" array');
    }

    return {
      cards: parsed.cards.map((c: unknown) => String(c).trim()),
      strategy: parsed.strategy,
      keyCards: parsed.keyCards,
      notes: parsed.notes,
    };
  } catch (error) {
    throw new Error(`Failed to parse LLM response: ${error}`);
  }
}

/**
 * Validate the built deck
 */
function validateDeck(
  cards: string[],
  colorIdentity: string[],
  bannedCards: Set<string>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check card count
  if (cards.length !== 99) {
    errors.push(`Deck has ${cards.length} cards, expected 99`);
  }

  // Check for duplicates (except basic lands)
  const basicLands = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
  const cardCounts = new Map<string, number>();
  
  for (const card of cards) {
    const count = (cardCounts.get(card.toLowerCase()) || 0) + 1;
    cardCounts.set(card.toLowerCase(), count);
    
    if (count > 1 && !basicLands.has(card)) {
      errors.push(`Duplicate card: ${card}`);
    }
  }

  // Check banned cards
  for (const card of cards) {
    if (bannedCards.has(card.toLowerCase())) {
      errors.push(`Banned card included: ${card}`);
    }
  }

  // Check color identity (basic validation)
  const colorMap: Record<string, string[]> = {
    'W': ['white'],
    'U': ['blue'],
    'B': ['black'],
    'R': ['red'],
    'G': ['green'],
  };

  // We'll do a soft check - just warn if we can't verify a card
  let unverifiedCards = 0;
  for (const cardName of cards) {
    const cardData = getCardByName(cardName);
    if (!cardData) {
      unverifiedCards++;
      continue;
    }

    // Check if card's color identity is within commander's
    const cardColors = cardData.color_identity || [];
    for (const color of cardColors) {
      if (!colorIdentity.includes(color)) {
        errors.push(`Card "${cardName}" has color ${color} outside commander's identity`);
      }
    }
  }

  if (unverifiedCards > 0) {
    warnings.push(`${unverifiedCards} cards could not be verified in database`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Call OpenAI with retry logic for transient failures.
 */
async function callOpenAIWithRetry(
  openai: OpenAI,
  config: ReturnType<typeof getLLMConfig>,
  systemPrompt: string,
  userPrompt: string,
  builderNotes: string[],
  retryContext?: string
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        builderNotes.push(`[LLM] Retry attempt ${attempt}/${MAX_LLM_RETRIES}${retryContext ? ` — ${retryContext}` : ''}`);
      }

      const completion = await openai.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '';
      const usage = completion.usage;
      if (usage) {
        builderNotes.push(
          `✓ LLM response received (${usage.prompt_tokens} in, ${usage.completion_tokens} out)`
        );
      }

      // Quick validation: must be parseable JSON with a cards array
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.cards) || parsed.cards.length < 90) {
        retryContext = `response had ${parsed.cards?.length ?? 0} cards, need 99`;
        lastError = new Error(retryContext);
        continue;
      }

      return content;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);

      // Don't retry on auth or model errors
      if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('model_not_found')) {
        throw error;
      }

      retryContext = msg.slice(0, 100);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Build a complete deck using GPT-4.1 with enriched EDHREC context and retry logic.
 */
export async function buildDeckWithLLM(
  input: BuildDeckInput
): Promise<BuildDeckResult> {
  const config = getLLMConfig();

  if (!config.isAvailable) {
    throw new Error(
      'OpenAI API key not configured. Set OPENAI_API_KEY in .env file. ' +
      'See .env.example for template.'
    );
  }

  const builderNotes: string[] = [];
  builderNotes.push(`[LLM] Using ${config.model} for deck building`);

  // Step 1: Resolve commander
  const commanderCard = getCardByName(input.commanderName);
  if (!commanderCard) {
    throw new Error(
      `Commander "${input.commanderName}" could not be resolved from database.`
    );
  }

  const colorIdentity = commanderCard.color_identity || [];
  builderNotes.push(
    `Commander: ${commanderCard.name} (Color Identity: ${colorIdentity.length > 0 ? colorIdentity.join('') : 'Colorless'})`
  );

  // Step 2: Get comprehensive EDHREC profile
  let enrichedSuggestions: EdhrecCardSuggestion[] = [];
  let enrichedLands: EdhrecCardSuggestion[] = [];
  let edhrecContext: EdhrecContext | undefined;
  let combos: Array<{ cards: string[]; description?: string }> = [];
  let highSaltCards: string[] = [];

  if (input.useEdhrec !== false) {
    builderNotes.push('Fetching comprehensive EDHREC profile...');

    try {
      const profile = await getFullCommanderProfile(
        commanderCard.name,
        colorIdentity,
        {
          theme: input.preferredStrategy,
          saltThreshold: 2.5,
          cardLimit: 120,
          landLimit: 40,
        }
      );

      enrichedSuggestions = profile.cards;
      enrichedLands = profile.lands;
      combos = profile.combos;
      highSaltCards = profile.highSaltCards;

      edhrecContext = {
        sourcesUsed: profile.sourcesUsed,
        suggestions: [...profile.cards, ...profile.lands],
        availableThemes: profile.themes,
        selectedTheme: input.preferredStrategy,
        avgSynergyScore:
          profile.cards.length > 0
            ? profile.cards.reduce((sum, c) => sum + (c.synergyScore ?? 0), 0) / profile.cards.length
            : undefined,
        highSaltCards: profile.highSaltCards,
      };

      builderNotes.push(
        `✓ EDHREC: ${enrichedSuggestions.length} cards, ${enrichedLands.length} lands, ` +
        `${profile.themes.length} themes, ${combos.length} combos`
      );
      if (profile.themes.length > 0) {
        builderNotes.push(
          `  Themes available: ${profile.themes.map(t => t.name).join(', ')}`
        );
      }
      if (highSaltCards.length > 0) {
        builderNotes.push(
          `  High-salt cards filtered: ${highSaltCards.length}`
        );
      }
    } catch (error) {
      builderNotes.push(`⚠ Full EDHREC fetch failed, falling back to basic suggestions`);

      // Fallback to basic color-based suggestions
      try {
        const topCards = await getTopCardsForColorIdentity(colorIdentity);
        const topLands = await getTopLandsForColorIdentity(colorIdentity);
        enrichedSuggestions = topCards;
        enrichedLands = topLands;
        edhrecContext = {
          sourcesUsed: ['EDHREC top cards (fallback)', 'EDHREC top lands (fallback)'],
          suggestions: [...topCards, ...topLands],
        };
        builderNotes.push(`✓ EDHREC fallback: ${topCards.length + topLands.length} suggestions`);
      } catch {
        builderNotes.push(`⚠ EDHREC fallback also failed`);
      }
    }
  }

  // Step 3: Get banned cards
  const bannedCards = getBannedCards();
  const bannedSet = new Set(bannedCards.map(c => c.toLowerCase()));
  builderNotes.push(`Banlist: ${bannedCards.length} cards banned`);

  // Step 4: Filter seed cards
  const validSeedCards: string[] = [];
  if (input.seedCards && input.seedCards.length > 0) {
    for (const seed of input.seedCards) {
      if (isBanned(seed)) {
        builderNotes.push(`⛔ Seed card "${seed}" is banned, excluding`);
      } else {
        validSeedCards.push(seed);
      }
    }
    if (validSeedCards.length > 0) {
      builderNotes.push(`Including ${validSeedCards.length} seed cards`);
    }
  }

  // Step 5: Build enriched prompt and call OpenAI with retry
  builderNotes.push(`Calling ${config.model}...`);

  const openai = new OpenAI({ apiKey: config.apiKey! });

  const userPrompt = buildUserPrompt(
    commanderCard.name,
    colorIdentity,
    enrichedSuggestions,
    enrichedLands,
    bannedCards,
    validSeedCards,
    {
      theme: input.preferredStrategy,
      combos,
      highSaltCards,
    }
  );

  const llmResponse = await callOpenAIWithRetry(
    openai,
    config,
    SYSTEM_PROMPT,
    userPrompt,
    builderNotes
  );

  // Step 6: Parse response
  let parsedResponse;
  try {
    parsedResponse = parseLLMResponse(llmResponse);
  } catch (error) {
    throw new Error(`Failed to parse LLM response: ${error}`);
  }

  if (parsedResponse.strategy) {
    builderNotes.push(`Strategy: ${parsedResponse.strategy}`);
  }

  // Step 7: Validate deck
  const validation = validateDeck(parsedResponse.cards, colorIdentity, bannedSet);

  if (!validation.valid) {
    builderNotes.push(`⚠ Validation errors:`);
    for (const error of validation.errors) {
      builderNotes.push(`  - ${error}`);
    }
  }

  for (const warning of validation.warnings) {
    builderNotes.push(`⚠ ${warning}`);
  }

  // Step 8: Build result
  let builtCards: BuiltCardEntry[] = parsedResponse.cards.map((name) => {
    const cardData = getCardByName(name);
    const roles = cardData ? classifyCardRoles(cardData) : undefined;
    return { name, quantity: 1, roles };
  });

  // Step 9: Analyze and optionally refine with iterative EDHREC autofill
  const templateId = input.templateId || 'bracket3';
  const bracketId = input.bracketId || 'bracket3';
  const template = loadDeckTemplate(templateId);

  let bracketRules: BracketRules | undefined;
  let bracketLabel: string | undefined;
  try {
    const br = loadBracketRules(bracketId);
    bracketRules = br;
    bracketLabel = br.label;
  } catch {
    bracketRules = undefined;
  }

  let finalAnalysis: DeckAnalysis;

  if (input.useEdhrecAutofill !== false && edhrecContext && edhrecContext.suggestions.length > 0) {
    const maxIt = input.maxRefinementIterations ?? 5;
    const refineOn = input.refineUntilStable !== false;
    builderNotes.push(
      `[LLM] Post-build EDHREC refinement (${refineOn ? `up to ${maxIt} passes` : 'single pass'}).`
    );
    const refined = await runIterativeEdhrecAutofill(
      input,
      commanderCard,
      template,
      bracketRules,
      bracketId,
      templateId,
      edhrecContext,
      builtCards,
      refineOn,
      maxIt
    );
    builtCards = refined.builtCards;
    finalAnalysis = refined.analysis;
    builderNotes.push(...refined.iterationNotes);
  } else {
    const deckText = builtCards.map((c) => `1 ${c.name}`).join('\n');
    const parsedDeck = parseDeckText(deckText);
    const analysisResult = await analyzeDeckBasic(
      {
        deckText,
        templateId,
        bracketId,
        preferredStrategy: input.preferredStrategy,
        banlistId: input.banlistId,
        options: { inferCommander: false },
      },
      parsedDeck
    );
    finalAnalysis = analysisResult.analysis;
  }

  if (finalAnalysis.bracketWarnings.length > 0) {
    builderNotes.push('---');
    builderNotes.push('Bracket 3 validation:');
    for (const w of finalAnalysis.bracketWarnings) {
      builderNotes.push(`  ${w}`);
    }
  }

  return {
    input: {
      ...input,
      templateId,
      bracketId,
    },
    templateId,
    bracketId,
    bracketLabel,
    deck: {
      commanderName: commanderCard.name,
      cards: builtCards,
    },
    analysis: finalAnalysis,
    notes: builderNotes,
    edhrecContext,
  };
}

/**
 * Check if LLM deck building is available
 */
export { isLLMAvailable };

