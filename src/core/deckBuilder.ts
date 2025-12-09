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
import { classifyCardRoles, cardRolesToCategories } from './roles';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { getTopCardsForColorIdentity, getTopLandsForColorIdentity } from './edhrec';
import { computeCategoryDeficits } from './categoryUtils';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';

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

  // Step 4: Initialize deck cards array
  const builtCards: BuiltCardEntry[] = [];

  // Step 5: Add seed cards (if provided)
  if (input.seedCards && input.seedCards.length > 0) {
    builderNotes.push(`Including ${input.seedCards.length} seed cards.`);
    
    for (const seedCardName of input.seedCards) {
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
  const analyzeResult = analyzeDeckBasic(analyzeInput, parsed);

  // Step 9.5: Fetch EDHREC suggestions if requested
  let edhrecContext: EdhrecContext | undefined;
  const shouldFetchEdhrec = input.useEdhrec || input.useEdhrecAutofill;

  if (shouldFetchEdhrec) {
    builderNotes.push('Fetching EDHREC suggestions...');
    
    try {
      const colors = commanderCard.color_identity ?? [];
      const [topCards, topLands] = await Promise.all([
        getTopCardsForColorIdentity(colors, 50),
        getTopLandsForColorIdentity(colors, 50)
      ]);

      const sourcesUsed: string[] = [];
      
      // Build list of sources used based on color identity
      if (colors.length === 0) {
        sourcesUsed.push('top/colorless.json', 'lands/colorless.json');
      } else if (colors.length === 1) {
        const colorMap: Record<string, string> = {
          'W': 'white', 'U': 'blue', 'B': 'black', 'R': 'red', 'G': 'green'
        };
        const colorName = colorMap[colors[0]];
        if (colorName) {
          sourcesUsed.push(`top/${colorName}.json`);
        }
        sourcesUsed.push('lands/mono-' + (colorName || 'colorless') + '.json');
      } else {
        sourcesUsed.push('top/multicolor.json');
        for (const color of colors) {
          const colorMap: Record<string, string> = {
            'W': 'white', 'U': 'blue', 'B': 'black', 'R': 'red', 'G': 'green'
          };
          const colorName = colorMap[color];
          if (colorName) {
            sourcesUsed.push(`top/${colorName}.json`);
          }
        }
        sourcesUsed.push('lands/[color-combination].json');
      }

      edhrecContext = {
        sourcesUsed,
        suggestions: [...topCards, ...topLands]
      };

      builderNotes.push(
        `✓ EDHREC: Fetched ${topCards.length} top cards and ${topLands.length} lands (${edhrecContext.suggestions.length} total suggestions).`
      );
    } catch (error) {
      builderNotes.push(
        `⚠️  EDHREC: Could not fetch suggestions. ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      // Continue without EDHREC data
      edhrecContext = undefined;
    }
  }

  // Step 9.6: EDHREC Autofill (if enabled)
  if (input.useEdhrecAutofill && edhrecContext && edhrecContext.suggestions.length > 0) {
    builderNotes.push('---');
    builderNotes.push('EDHREC Autofill enabled. Attempting to fill category deficits...');

    // Compute current category deficits
    const deficits = computeCategoryDeficits(
      analyzeResult.analysis,
      template,
      ['ramp', 'card_draw', 'target_removal', 'board_wipes']
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

    // Track autofilled cards per category
    const autofillCounts: Record<string, number> = {
      ramp: 0,
      card_draw: 0,
      target_removal: 0,
      board_wipes: 0
    };

    // Process deficits in priority order: ramp, draw, removal, wipes
    const priorityOrder = ['ramp', 'card_draw', 'target_removal', 'board_wipes'];

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

        // 3. Extra Turn cards (avoid autofilling these)
        if (isExtraTurnCard(suggestion.name, bracketId)) {
          continue;
        }

        // Classify card roles
        const roles = classifyCardRoles(card);
        const categories = cardRolesToCategories(roles);

        // Check if this card matches the needed category
        if (categories.includes(categoryName)) {
          // Add card to deck
          builtCards.push({
            name: card.name,
            quantity: 1,
            roles
          });

          cardsInDeck.add(card.name.toLowerCase());
          remaining--;
          autofillCounts[categoryName]++;

          // Update Game Changer count if applicable
          if (isGameChanger(card.name, bracketId)) {
            gameChangerCount++;
          }
        }
      }

      if (remaining > 0) {
        builderNotes.push(`    ⚠️  Could not fill all ${categoryName} slots (${remaining} remaining)`);
      } else {
        builderNotes.push(`    ✓ Filled ${autofillCounts[categoryName]} ${categoryName} slots`);
      }
    }

    // Summary of autofill
    const totalAutofilled = Object.values(autofillCounts).reduce((a, b) => a + b, 0);
    builderNotes.push(
      `✓ EDHREC Autofill complete: added ${totalAutofilled} cards ` +
      `(${autofillCounts.ramp} ramp, ${autofillCounts.card_draw} draw, ` +
      `${autofillCounts.target_removal} removal, ${autofillCounts.board_wipes} wipes)`
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
    const updatedAnalyzeResult = analyzeDeckBasic(updatedAnalyzeInput, updatedParsed);

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

