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
  DeckTemplate
} from './types';
import { getCardByName } from './scryfall';
import { loadDeckTemplate } from './templates';
import { classifyCardRoles } from './roles';
import { loadBracketRules, BracketRules } from './brackets';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';

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
 * const result = analyzeDeckBasic(input, parsed);
 * ```
 */
export function analyzeDeckBasic(
  input: AnalyzeDeckInput,
  parsedDeck: ParsedDeck
): AnalyzeDeckResult {
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

  // Map role names to category names (handle singular/plural differences)
  const roleToCategoryMap: Record<string, string> = {
    'land': 'lands',
    'ramp': 'ramp',
    'target_removal': 'target_removal',
    'board_wipe': 'board_wipes',
    'card_draw': 'card_draw',
    'protection': 'protection',
    'tutor': 'tutor',
    'wincon': 'wincon'
  };

  // Initialize bracket violation counters
  let gameChangerCount = 0;
  let extraTurnCount = 0;
  let hasMassLandDenial = false;
  const bracketId = input.templateId || 'default';

  // Classify and count cards by role, and check bracket violations
  for (const entry of parsedDeck.cards) {
    const card = getCardByName(entry.name);
    const roles = classifyCardRoles(card);

    // Increment counts for each role the card fulfills
    for (const role of roles) {
      // Map role to category name
      const categoryName = roleToCategoryMap[role] || role;
      
      // Check if this category exists in the template
      if (categoryCounts.hasOwnProperty(categoryName)) {
        categoryCounts[categoryName] += entry.quantity;
      }
    }

    // Check bracket-specific violations (if bracket rules are loaded)
    if (bracketRules) {
      if (isGameChanger(entry.name, bracketId)) {
        gameChangerCount += entry.quantity;
      }
      if (isExtraTurnCard(entry.name, bracketId)) {
        extraTurnCount += entry.quantity;
      }
      if (isMassLandDenial(entry.name, bracketId)) {
        hasMassLandDenial = true;
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

  // Generate category-specific notes for key categories
  const keyCategories = ['lands', 'ramp', 'target_removal', 'board_wipes', 'card_draw'];
  
  for (const cat of categories) {
    // Only add notes for key categories that are outside range
    if (keyCategories.includes(cat.name)) {
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

  // Generate bracket-specific warnings
  const bracketWarnings: string[] = [];
  
  if (bracketRules) {
    // Game Changers check
    if (gameChangerCount > bracketRules.maxGameChangers) {
      bracketWarnings.push(
        `This deck uses ${gameChangerCount} Game Changers, but Bracket ${bracketRules.id} allows a maximum of ${bracketRules.maxGameChangers}.`
      );
    } else if (gameChangerCount > 0) {
      bracketWarnings.push(
        `This deck uses ${gameChangerCount} Game Changers (max allowed for Bracket ${bracketRules.id}: ${bracketRules.maxGameChangers}).`
      );
    }

    // Mass land denial check
    if (!bracketRules.allowMassLandDestruction && hasMassLandDenial) {
      bracketWarnings.push(
        `This deck includes mass land destruction or denial effects, which are NOT allowed in Bracket ${bracketRules.id}.`
      );
    }

    // Extra turns check
    if (typeof bracketRules.maxExtraTurnCards === 'number') {
      if (extraTurnCount > bracketRules.maxExtraTurnCards) {
        bracketWarnings.push(
          `This deck uses ${extraTurnCount} extra-turn cards, which may exceed the intended Bracket ${bracketRules.id} limit of ${bracketRules.maxExtraTurnCards}.`
        );
      } else if (extraTurnCount > 0) {
        bracketWarnings.push(
          `This deck uses ${extraTurnCount} extra-turn cards (soft limit for Bracket ${bracketRules.id}: ${bracketRules.maxExtraTurnCards}).`
        );
      }
    } else if (extraTurnCount > 0) {
      bracketWarnings.push(
        `This deck uses ${extraTurnCount} extra-turn cards. Consider whether this matches the intended Bracket ${bracketRules.id} experience.`
      );
    }
  }

  // Build the DeckAnalysis object
  const analysis: DeckAnalysis = {
    commanderName,
    totalCards,
    uniqueCards,
    categories,
    notes,
    // Include bracket information if bracket rules were loaded
    bracketId: bracketRules?.id,
    bracketLabel: bracketRules?.label,
    bracketWarnings
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
