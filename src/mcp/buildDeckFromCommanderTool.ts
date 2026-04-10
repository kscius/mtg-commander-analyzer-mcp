/**
 * buildDeckFromCommanderTool.ts
 *
 * MCP tool wrapper for the deck builder.
 * When templateId is bracket3 and useTemplateGenerator is true, uses the
 * template-driven generator (mana_base, categories, EDHREC + OpenAI fallback).
 * Otherwise uses the legacy skeleton + EDHREC autofill builder.
 */

import { BuildDeckInput, BuildDeckResult, DeckAnalysis, EdhrecContext } from '../core/types';
import { buildDeckFromCommander } from '../core/deckBuilder';
import { generateDeckFromTemplate } from '../core/templateDeckGenerator';
import { parseDeckText } from '../core/deckParser';
import { analyzeDeckBasic } from '../core/analyzer';
import { loadBracketRules, type BracketRules } from '../core/brackets';
import { getCardByName } from '../core/scryfall';
import { loadDeckTemplate } from '../core/templates';
import { getFullCommanderProfile, getTopCardsForColorIdentity, getTopLandsForColorIdentity, sortBySynergy } from '../core/edhrec';
import { runIterativeEdhrecAutofill } from '../core/edhrecAutofill';

/**
 * Runs the build_deck_from_commander tool.
 *
 * With templateId "bracket3" and useTemplateGenerator true: builds a full 99-card
 * deck using the template (mana_base, curve, categories, combo_rules, generator_hints),
 * EDHREC as primary source and OpenAI as fallback for underfilled categories.
 *
 * Otherwise: uses skeleton + basic lands + optional EDHREC autofill.
 */
export async function runBuildDeckFromCommander(
  input: BuildDeckInput
): Promise<BuildDeckResult> {
  const templateId = input.templateId ?? 'bracket3';
  const bracketId = input.bracketId ?? 'bracket3';
  const useTemplateGenerator = input.useTemplateGenerator === true && templateId === 'bracket3';

  if (useTemplateGenerator) {
    const gen = await generateDeckFromTemplate({
      commanderName: input.commanderName,
      templateId,
      seedCards: input.seedCards,
      metaOverride: undefined,
    });

    const inputMerged: BuildDeckInput = {
      templateId: 'bracket3',
      bracketId: 'bracket3',
      banlistId: 'commander',
      useEdhrec: true,
      useEdhrecAutofill: true,
      ...input,
    };

    const commanderCard = getCardByName(inputMerged.commanderName);
    if (!commanderCard) {
      throw new Error(
        `Commander "${inputMerged.commanderName}" could not be resolved from the card database.`
      );
    }

    const template = loadDeckTemplate(templateId);
    let bracketRules: BracketRules | undefined;
    try {
      bracketRules = loadBracketRules(bracketId);
    } catch {
      bracketRules = undefined;
    }

    let edhrecContext: EdhrecContext | undefined;
    const builderNotes = [...gen.notes];

    if (inputMerged.useEdhrec || inputMerged.useEdhrecAutofill) {
      try {
        const colors = commanderCard.color_identity ?? [];
        const profile = await getFullCommanderProfile(commanderCard.name, colors, {
          theme: inputMerged.preferredStrategy,
          saltThreshold: 2.5,
          cardLimit: 100,
          landLimit: 40,
        });
        const allSuggestions = sortBySynergy([...profile.cards, ...profile.lands]);
        edhrecContext = {
          sourcesUsed: profile.sourcesUsed,
          suggestions: allSuggestions,
          availableThemes: profile.themes,
          selectedTheme: inputMerged.preferredStrategy,
          avgSynergyScore:
            profile.cards.length > 0
              ? profile.cards.reduce((sum, c) => sum + (c.synergyScore ?? 0), 0) / profile.cards.length
              : undefined,
          highSaltCards: profile.highSaltCards,
        };
        builderNotes.push(
          `✓ EDHREC profile: ${profile.cards.length} cards, ${profile.lands.length} lands (for refinement).`
        );
      } catch {
        builderNotes.push('⚠ Full EDHREC profile failed; trying basic color suggestions for refinement.');
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
        } catch {
          edhrecContext = undefined;
        }
      }
    }

    const deckTextFromGen = gen.deck.cards
      .flatMap((c) => Array(c.quantity).fill(`1 ${c.name}`))
      .join('\n');
    const parsedFromGen = parseDeckText(deckTextFromGen);

    let deck = gen.deck;
    let analysis: DeckAnalysis;

    if (inputMerged.useEdhrecAutofill && edhrecContext && edhrecContext.suggestions.length > 0) {
      const maxIt = inputMerged.maxRefinementIterations ?? 5;
      const refineOn = inputMerged.refineUntilStable !== false;
      builderNotes.push(
        `Template deck: iterative EDHREC category refinement (${refineOn ? `up to ${maxIt} passes` : 'single pass'}).`
      );
      const refined = await runIterativeEdhrecAutofill(
        inputMerged,
        commanderCard,
        template,
        bracketRules,
        bracketId,
        templateId,
        edhrecContext,
        gen.deck.cards,
        refineOn,
        maxIt
      );
      deck = { commanderName: gen.deck.commanderName, cards: refined.builtCards };
      analysis = refined.analysis;
      builderNotes.push(...refined.iterationNotes);
    } else {
      analysis = (
        await analyzeDeckBasic(
          {
            deckText: deckTextFromGen,
            templateId,
            banlistId: inputMerged.banlistId,
            options: { inferCommander: false },
          },
          parsedFromGen
        )
      ).analysis;
    }

    let bracketLabel: string | undefined;
    try {
      bracketLabel = loadBracketRules(bracketId).label;
    } catch {
      // ignore
    }

    return {
      input: { ...inputMerged, templateId, bracketId },
      templateId,
      bracketId,
      bracketLabel,
      deck,
      analysis,
      notes: builderNotes,
      edhrecContext,
    };
  }

  const inputWithDefaults: BuildDeckInput = {
    templateId: 'bracket3',
    bracketId: 'bracket3',
    banlistId: 'commander',
    useEdhrec: true,
    useEdhrecAutofill: true,
    ...input,
  };
  return buildDeckFromCommander(inputWithDefaults);
}
