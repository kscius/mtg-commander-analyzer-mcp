/**
 * buildDeckFromCommanderTool.ts
 *
 * MCP tool wrapper for the deck builder.
 * When templateId is bracket3 and useTemplateGenerator is true, uses the
 * template-driven generator (mana_base, categories, EDHREC + OpenAI fallback).
 * Otherwise uses the legacy skeleton + EDHREC autofill builder.
 */

import { BuildDeckInput, BuildDeckResult } from '../core/types';
import { buildDeckFromCommander } from '../core/deckBuilder';
import { generateDeckFromTemplate } from '../core/templateDeckGenerator';
import { parseDeckText } from '../core/deckParser';
import { analyzeDeckBasic } from '../core/analyzer';
import { loadBracketRules } from '../core/brackets';

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
    const deckText = gen.deck.cards
      .flatMap((c) => Array(c.quantity).fill(`1 ${c.name}`))
      .join('\n');
    const parsed = parseDeckText(deckText);
    const analysisResult = await analyzeDeckBasic(
      {
        deckText,
        templateId,
        banlistId: input.banlistId,
        options: { inferCommander: false },
      },
      parsed
    );
    let bracketLabel: string | undefined;
    try {
      bracketLabel = loadBracketRules(bracketId).label;
    } catch {
      // ignore
    }
    return {
      input: { ...input, templateId, bracketId },
      templateId,
      bracketId,
      bracketLabel,
      deck: gen.deck,
      analysis: analysisResult.analysis,
      notes: gen.notes,
      edhrecContext: undefined,
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
