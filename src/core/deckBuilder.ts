/**
 * deckBuilder.ts
 * 
 * Deck builder for Commander format.
 * Generates skeleton decks based on commander color identity and bracket templates.
 */

import {
  BuildDeckInput,
  BuildDeckResult,
  BuiltCardEntry,
  BuiltDeck,
  AnalyzeDeckInput,
  DeckAnalysis,
  EdhrecContext
} from './types';
import { getCardByName, OracleCard } from './scryfall';
import { loadDeckTemplate } from './templates';
import { loadBracketRules } from './brackets';
import { classifyCardRoles } from './roles';
import { autoTags, getDefaultBracket3Options, tagsToTemplateCategories, ScryCard } from './autoTags';
import { validateBracket3, validateTwoCardCombosBeforeT6, loadCombos, Bracket3Policies, CardWithTags } from './bracket3Validation';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import {
  getTopCardsForColorIdentity,
  getTopLandsForColorIdentity,
  getFullCommanderProfile,
  getLandsForColorCombination,
  sortBySynergy,
} from './edhrec';
import { computeCategoryDeficits } from './categoryUtils';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import { isBanned, isBanlistAvailable, getBannedCount } from './banlist';

/**
 * Map MTG color letters to basic land names
 */
const COLOR_TO_BASIC_LAND: Record<string, string> = {
  'W': 'Plains',
  'U': 'Island',
  'B': 'Swamp',
  'R': 'Mountain',
  'G': 'Forest'
};

/**
 * Default land count for Commander decks
 */
const COMMANDER_DECK_SIZE = 99; // Non-commander cards

/**
 * Builds a Commander deck from a commander name
 * 
 * @param input - BuildDeckInput with commander name and options
 * @returns BuildDeckResult with built deck and analysis
 * @throws Error if commander cannot be resolved
 * 
 * This is a first-version skeleton builder that:
 * - Resolves commander from Scryfall
 * - Fills basic lands according to color identity and template
 * - Includes optional seed cards
 * - Analyzes the built deck using the existing analyzer
 * 
 * Future improvements:
 * - Smart card selection based on EDHREC
 * - Role-based card filling
 * - Theme/strategy support
 * - Mana curve optimization
 * 
 * @example
 * ```typescript
 * const result = await buildDeckFromCommander({
 *   commanderName: "Atraxa, Praetors' Voice",
 *   templateId: "bracket3",
 *   seedCards: ["Sol Ring", "Rhystic Study"]
 * });
 * console.log(result.deck.cards.length); // Should be close to 99
 * ```
 */
export async function buildDeckFromCommander(
  input: BuildDeckInput
): Promise<BuildDeckResult> {
  const builderNotes: string[] = [];

  // Step 1: Resolve commander
  const commanderCard = getCardByName(input.commanderName);
  if (!commanderCard) {
    throw new Error(
      `Commander "${input.commanderName}" could not be resolved from Scryfall data.\n` +
      `Please check the card name spelling and ensure oracle-cards.json is loaded.`
    );
  }

  // Extract color identity
  const colorIdentity = commanderCard.color_identity || [];
  builderNotes.push(
    `Commander: ${commanderCard.name} (Color Identity: ${colorIdentity.length > 0 ? colorIdentity.join('') : 'Colorless'})`
  );

  // Step 2: Determine template and bracket
  const templateId = input.templateId || 'bracket3';
  const bracketId = input.bracketId || 'bracket3';

  const template = loadDeckTemplate(templateId);
  let bracketRules;
  let bracketLabel: string | undefined;
  
  try {
    bracketRules = loadBracketRules(bracketId);
    bracketLabel = bracketRules.label;
  } catch (error) {
    builderNotes.push(`Warning: Could not load bracket rules for "${bracketId}".`);
  }

  // Step 3: Determine target land count from template
  const landsCategory = template.categories.find(cat => cat.name === 'lands');
  const landsMin = landsCategory?.min ?? 35;
  const landsMax = landsCategory?.max ?? 38;
  const targetLands = Math.round((landsMin + landsMax) / 2);

  builderNotes.push(
    `Template "${templateId}" recommends ${landsMin}-${landsMax} lands. Target: ${targetLands}.`
  );

  // Log banlist status
  if (isBanlistAvailable()) {
    builderNotes.push(`Banlist active: ${getBannedCount()} cards banned (no budget restrictions).`);
  }

  // Step 4: Initialize deck cards array
  const builtCards: BuiltCardEntry[] = [];

  // Step 5: Add seed cards (if provided, excluding banned cards)
  if (input.seedCards && input.seedCards.length > 0) {
    const bannedSeeds: string[] = [];
    const validSeeds: string[] = [];
    
    for (const seedCardName of input.seedCards) {
      if (isBanned(seedCardName)) {
        bannedSeeds.push(seedCardName);
      } else {
        validSeeds.push(seedCardName);
        // Get card and classify roles
        const seedCard = getCardByName(seedCardName);
        const roles = seedCard ? classifyCardRoles(seedCard) : undefined;
        
        builtCards.push({
          name: seedCardName,
          quantity: 1,
          roles
        });
      }
    }
    
    if (validSeeds.length > 0) {
      builderNotes.push(`Including ${validSeeds.length} seed cards.`);
    }
    
    if (bannedSeeds.length > 0) {
      builderNotes.push(`⛔ Excluded ${bannedSeeds.length} banned seed card(s): ${bannedSeeds.join(', ')}`);
    }
  }

  // Step 6: Fill basic lands according to color identity
  const landsToAdd = targetLands;
  
  if (colorIdentity.length === 0) {
    // Colorless commander: use Wastes or a mix of basics
    builderNotes.push(
      `Colorless commander detected. Adding ${landsToAdd} Wastes (or generic basics).`
    );
    builtCards.push({
      name: 'Wastes',
      quantity: landsToAdd,
      roles: ['land']
    });
  } else {
    // Distribute lands evenly among colors in identity
    const basicLandTypes = colorIdentity
      .map(color => COLOR_TO_BASIC_LAND[color])
      .filter(Boolean); // Remove undefined values

    if (basicLandTypes.length === 0) {
      builderNotes.push(
        `Warning: Could not map color identity to basic lands. Defaulting to Wastes.`
      );
      builtCards.push({
        name: 'Wastes',
        quantity: landsToAdd,
        roles: ['land']
      });
    } else {
      const landsPerColor = Math.floor(landsToAdd / basicLandTypes.length);
      const remainder = landsToAdd % basicLandTypes.length;

      builderNotes.push(
        `Distributing ${landsToAdd} basic lands among ${basicLandTypes.length} colors.`
      );

      basicLandTypes.forEach((landName, index) => {
        const quantity = landsPerColor + (index < remainder ? 1 : 0);
        builtCards.push({
          name: landName,
          quantity,
          roles: ['land']
        });
      });
    }
  }

  // Step 7: Check deck size and add notes
  const totalCards = builtCards.reduce((sum, card) => sum + card.quantity, 0);
  
  if (totalCards < COMMANDER_DECK_SIZE) {
    const missing = COMMANDER_DECK_SIZE - totalCards;
    builderNotes.push(
      `⚠️  Skeleton deck: ${totalCards}/${COMMANDER_DECK_SIZE} cards. Missing ${missing} nonland cards.`
    );
    builderNotes.push(
      `This is a basic land shell. Add creatures, ramp, removal, and other nonlands to complete the deck.`
    );
  } else if (totalCards > COMMANDER_DECK_SIZE) {
    const excess = totalCards - COMMANDER_DECK_SIZE;
    builderNotes.push(
      `⚠️  Deck exceeds ${COMMANDER_DECK_SIZE} cards by ${excess}. Manual trimming required.`
    );
  } else {
    builderNotes.push(
      `✓ Deck size: ${totalCards} cards (correct for Commander format, excluding commander).`
    );
  }

  // Step 8: Build BuiltDeck object
  const deck: BuiltDeck = {
    commanderName: commanderCard.name,
    cards: builtCards
  };

  // Step 9: Analyze the built deck using existing analyzer
  // Convert BuiltDeck to deckText format for analysis
  const deckTextLines = builtCards.flatMap(entry =>
    Array(entry.quantity).fill(`1 ${entry.name}`)
  );
  const deckText = deckTextLines.join('\n');

  const analyzeInput: AnalyzeDeckInput = {
    deckText,
    templateId,
    banlistId: input.banlistId,
    options: {
      inferCommander: false
    }
  };

  const parsed = parseDeckText(deckText);
  const analyzeResult = await analyzeDeckBasic(analyzeInput, parsed);

  // Step 9.5: Fetch EDHREC suggestions (comprehensive profile when available)
  let edhrecContext: EdhrecContext | undefined;
  const shouldFetchEdhrec = input.useEdhrec || input.useEdhrecAutofill;

  if (shouldFetchEdhrec) {
    builderNotes.push('Fetching comprehensive EDHREC profile...');

    try {
      const colors = commanderCard.color_identity ?? [];
      const profile = await getFullCommanderProfile(commanderCard.name, colors, {
        theme: input.preferredStrategy,
        saltThreshold: 2.5,
        cardLimit: 100,
        landLimit: 40,
      });

      const allSuggestions = sortBySynergy([...profile.cards, ...profile.lands]);

      edhrecContext = {
        sourcesUsed: profile.sourcesUsed,
        suggestions: allSuggestions,
        availableThemes: profile.themes,
        selectedTheme: input.preferredStrategy,
        avgSynergyScore:
          profile.cards.length > 0
            ? profile.cards.reduce((sum, c) => sum + (c.synergyScore ?? 0), 0) / profile.cards.length
            : undefined,
        highSaltCards: profile.highSaltCards,
      };

      builderNotes.push(
        `✓ EDHREC: ${profile.cards.length} cards, ${profile.lands.length} lands, ` +
        `${profile.themes.length} themes, ${profile.combos.length} combos`
      );
      if (profile.themes.length > 0) {
        builderNotes.push(`  Themes: ${profile.themes.map(t => t.name).join(', ')}`);
      }
      if (profile.highSaltCards.length > 0) {
        builderNotes.push(`  High-salt excluded: ${profile.highSaltCards.length}`);
      }
    } catch (error) {
      // Fallback to basic color-based suggestions
      builderNotes.push(`⚠ Full profile failed, using basic EDHREC...`);
      try {
        const colors = commanderCard.color_identity ?? [];
        const [topCards, topLands] = await Promise.all([
          getTopCardsForColorIdentity(colors, 50),
          getTopLandsForColorIdentity(colors, 50),
        ]);
        edhrecContext = {
          sourcesUsed: ['EDHREC top cards (fallback)', 'EDHREC top lands (fallback)'],
          suggestions: sortBySynergy([...topCards, ...topLands]),
        };
        builderNotes.push(`✓ EDHREC fallback: ${topCards.length + topLands.length} suggestions`);
      } catch {
        builderNotes.push(`⚠ EDHREC unavailable`);
        edhrecContext = undefined;
      }
    }
  }

  // Step 9.6: EDHREC Autofill (if enabled)
  if (input.useEdhrecAutofill && edhrecContext && edhrecContext.suggestions.length > 0) {
    builderNotes.push('---');
    builderNotes.push('EDHREC Autofill enabled. Attempting to fill category deficits...');

    const autofillCategories = [
      'ramp', 'card_draw', 'card_selection', 'spot_removal',
      'artifact_enchantment_hate', 'graveyard_hate', 'board_wipes',
      'protection', 'value_engines', 'win_conditions'
    ];
    const deficits = computeCategoryDeficits(
      analyzeResult.analysis,
      template,
      autofillCategories
    );

    // Track cards already in deck (case-insensitive)
    const cardsInDeck = new Set<string>(
      builtCards.map(card => card.name.toLowerCase())
    );

    // Track Game Changer count (to respect bracket limits)
    let gameChangerCount = builtCards.filter(card =>
      isGameChanger(card.name, bracketId)
    ).reduce((sum, card) => sum + card.quantity, 0);

    const maxGameChangers = bracketRules?.maxGameChangers ?? 3;

    const autofillCounts: Record<string, number> = {};
    for (const cat of autofillCategories) {
      autofillCounts[cat] = 0;
    }

    const tagOpts = getDefaultBracket3Options('bracket3');
    const maxExtraTurns = bracketRules?.maxExtraTurnCards ?? 3;
    let extraTurnCount = builtCards.filter(c => isExtraTurnCard(c.name, bracketId)).reduce((s, c) => s + c.quantity, 0);

    const priorityOrder = autofillCategories;

    for (const categoryName of priorityOrder) {
      const deficit = deficits.find(d => d.name === categoryName);
      if (!deficit || deficit.deficit <= 0) {
        continue; // No deficit for this category
      }

      let remaining = deficit.deficit;
      builderNotes.push(`  → ${categoryName}: deficit of ${remaining}`);

      // Try to fill from EDHREC suggestions
      for (const suggestion of edhrecContext.suggestions) {
        if (remaining <= 0) break;

        // Skip if already in deck
        if (cardsInDeck.has(suggestion.name.toLowerCase())) {
          continue;
        }

        // Get card from Scryfall
        const card = getCardByName(suggestion.name);
        if (!card) {
          continue; // Skip if card not found
        }

        // Check color identity (must be subset of commander's colors)
        const cardColors = card.color_identity || [];
        const isWithinColorIdentity = cardColors.every(c => colorIdentity.includes(c));
        if (!isWithinColorIdentity) {
          continue; // Skip if outside color identity
        }

        // Check banlist first (never include banned cards)
        if (isBanned(suggestion.name)) {
          continue;
        }

        // Check bracket constraints
        // 1. Game Changers limit
        if (isGameChanger(suggestion.name, bracketId)) {
          if (gameChangerCount >= maxGameChangers) {
            continue; // Skip to avoid exceeding Game Changer limit
          }
        }

        // 2. Mass Land Denial (never autofill these)
        if (isMassLandDenial(suggestion.name, bracketId)) {
          continue;
        }

        // 3. Extra Turn cards (only up to limit)
        if (isExtraTurnCard(suggestion.name, bracketId)) {
          if (extraTurnCount >= maxExtraTurns) continue;
        }

        // Match by tags (from DB or autoTags)
        let tags = card.tags && card.tags.length > 0 ? card.tags : autoTags(card as ScryCard, tagOpts);
        const categories = tagsToTemplateCategories(tags);

        if (!categories.includes(categoryName)) {
          continue;
        }

        builtCards.push({
          name: card.name,
          quantity: 1,
          roles: classifyCardRoles(card)
        });

        cardsInDeck.add(card.name.toLowerCase());
        remaining--;
        autofillCounts[categoryName]++;

        if (isGameChanger(card.name, bracketId)) {
          gameChangerCount++;
        }
        if (isExtraTurnCard(card.name, bracketId)) {
          extraTurnCount++;
        }
      }

      if (remaining > 0) {
        builderNotes.push(`    ⚠️  Could not fill all ${categoryName} slots (${remaining} remaining)`);
      } else {
        builderNotes.push(`    ✓ Filled ${autofillCounts[categoryName]} ${categoryName} slots`);
      }
    }

    const totalAutofilled = Object.values(autofillCounts).reduce((a, b) => a + b, 0);
    const breakdown = autofillCategories.filter(c => (autofillCounts[c] ?? 0) > 0).map(c => `${c}: ${autofillCounts[c]}`).join(', ');
    builderNotes.push(
      `✓ EDHREC Autofill complete: added ${totalAutofilled} cards${breakdown ? ` (${breakdown})` : ''}`
    );
    builderNotes.push('---');

    // Re-analyze the deck with autofilled cards
    const updatedDeckTextLines = builtCards.flatMap(entry =>
      Array(entry.quantity).fill(`1 ${entry.name}`)
    );
    const updatedDeckText = updatedDeckTextLines.join('\n');

    const updatedAnalyzeInput: AnalyzeDeckInput = {
      deckText: updatedDeckText,
      templateId,
      banlistId: input.banlistId,
      options: {
        inferCommander: false
      }
    };

    const updatedParsed = parseDeckText(updatedDeckText);
    const updatedAnalyzeResult = await analyzeDeckBasic(updatedAnalyzeInput, updatedParsed);

    // Update deck object and analysis
    deck.cards = builtCards;
    analyzeResult.analysis = updatedAnalyzeResult.analysis;

    // Update deck size notes
    const updatedTotalCards = builtCards.reduce((sum, card) => sum + card.quantity, 0);
    if (updatedTotalCards < COMMANDER_DECK_SIZE) {
      const missing = COMMANDER_DECK_SIZE - updatedTotalCards;
      builderNotes.push(
        `Deck has ${updatedTotalCards}/${COMMANDER_DECK_SIZE} cards. ${missing} more cards needed.`
      );
    } else if (updatedTotalCards > COMMANDER_DECK_SIZE) {
      const excess = updatedTotalCards - COMMANDER_DECK_SIZE;
      builderNotes.push(
        `⚠️  Deck exceeds ${COMMANDER_DECK_SIZE} cards by ${excess}. Manual trimming required.`
      );
    } else {
      builderNotes.push(
        `✓ Deck size: ${updatedTotalCards} cards (correct for Commander format).`
      );
    }

    // Bracket 3 validation (post-autofill)
    const deckForValidation: CardWithTags[] = builtCards.map(c => {
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
      builderNotes.push(...b3.errors.map(e => `  ⛔ ${e}`));
      builderNotes.push(...b3.warnings.map(w => `  ⚠ ${w}`));
      builderNotes.push(...comboErrs.map(e => `  ⛔ ${e}`));
    }
  }

  // Step 10: Build and return BuildDeckResult
  const result: BuildDeckResult = {
    input,
    templateId,
    bracketId,
    bracketLabel,
    deck,
    analysis: analyzeResult.analysis,
    notes: [
      ...builderNotes,
      '---',
      'Deck Builder Info:',
      `- This is a skeleton Bracket 3 deck generated from commander "${commanderCard.name}".`,
      `- Nonland categories are not fully auto-filled yet; manual tuning required.`,
      `- Use EDHREC or other resources to complete the deck with appropriate cards.`,
      '---',
      'Analysis Notes:',
      ...analyzeResult.analysis.notes
    ],
    edhrecContext
  };

  return result;
}

