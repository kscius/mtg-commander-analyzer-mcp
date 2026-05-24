/**
 * MCP Prompts — workflow templates embedding AGENTS.md checklist for LLM agents.
 */

import type { z } from 'zod';
import { GetPromptResultSchema } from '@modelcontextprotocol/sdk/types.js';

export type McpPromptResult = z.infer<typeof GetPromptResultSchema>;

export interface McpPromptDescriptor {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

const BRACKET3_CATEGORY_TABLE = `| Category | Min–max | Role |
|----------|---------|------|
| lands | 35–38 | Mana base |
| ramp | 9–12 | Rocks, dorks, land ramp |
| card_draw | 8–11 | Card advantage |
| card_selection | 3–6 | Scry/filter |
| spot_removal | 4–7 | Single-target |
| artifact_enchantment_hate | 2–5 | Disenchant |
| graveyard_hate | 1–3 | Grave hate |
| board_wipes | 2–4 | Mass removal |
| protection | 3–6 | Save commander |
| value_engines | 3–7 | Repeatable advantage |
| win_conditions | 2–4 | Finishers |
| game_changers | 0–3 | Hard cap |
| extra_turns | 0–3 | Hard cap |`;

const QUALITY_CHECKLIST = `- Exactly **99** mainboard cards (+ 1 commander), singleton except basics
- Every card resolves in cards.db (no invented names)
- Color identity: all cards ⊆ commander colors
- analysis.banlistValid === true
- No hard format:* or Bracket 3 errors in lintReport / bracketWarnings
- No category below minimum unless user accepted tradeoff
- synergyScore ≥ 60 when preferredStrategy is set
- One synergy only — no mixed themes
- qualityGate.readyToShip === true before delivery`;

function buildCommanderDeckPrompt(args: Record<string, string | undefined>): McpPromptResult {
  const commanderName = args.commanderName?.trim();
  const preferredStrategy = args.preferredStrategy?.trim();

  if (!commanderName) {
    throw new Error('build-commander-deck requires argument: commanderName');
  }

  const strategyBlock = preferredStrategy
    ? `Use **preferredStrategy**: \`${preferredStrategy}\` (user-confirmed).`
    : `**Do not assume a strategy.** Call \`get_synergies\` with commanderName="${commanderName}", list options, and ask the user to pick one slug before building.`;

  const text = `# Build Bracket 3 Commander deck

**Commander:** ${commanderName}
${strategyBlock}

## MCP workflow (strict order)

1. \`get_synergies\` → user picks **one** synergy slug (skip if preferredStrategy provided).
2. \`get_strategy_guide\` with commanderName + preferredStrategy (optional but recommended).
3. \`build_deck_from_commander\` with defaults (useTemplateGenerator, useEdhrec, useEdhrecAutofill all true).
4. \`analyze_deck\` on returned decklistText — read summary, qualityGate, remainingGaps.
5. If not converged: \`optimize_deck\` (maxIterations 4), then re-analyze.
6. Fix gaps with \`search_cards\` / \`evaluate_card_swap\`; never invent card names.

## Bracket 3 category targets

${BRACKET3_CATEGORY_TABLE}

## Quality checklist (before delivering decklistText)

${QUALITY_CHECKLIST}

## MCP resources (optional context)

- \`mtg-commander:///template/bracket3\` — full template JSON
- \`mtg-commander:///strategy-guide/{slug}\` — archetype guide markdown
- \`mtg-commander:///agents\` — full agent reference

## Rules

- Bracket 3: ≤3 Game Changers, ≤3 extra turns, no MLD, no 2-card wins before turn 6.
- Banlist: data/Banlist.txt (automatic in tools).
- Deliver **decklistText** from analyze/build output only.`;

  return {
    description: `Build a Bracket 3 deck for ${commanderName}`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

function optimizeDecklistPrompt(args: Record<string, string | undefined>): McpPromptResult {
  const commanderName = args.commanderName?.trim();
  const preferredStrategy = args.preferredStrategy?.trim();
  const deckText = args.deckText?.trim();

  if (!commanderName) {
    throw new Error('optimize-decklist requires argument: commanderName');
  }
  if (!preferredStrategy) {
    throw new Error('optimize-decklist requires argument: preferredStrategy');
  }

  const deckBlock = deckText
    ? `## Decklist to optimize\n\n\`\`\`\n${deckText}\n\`\`\``
    : `## Decklist\n\nUser must paste a 99-card mainboard (one line per card: \`1 Card Name\`). Then call tools with that deckText.`;

  const text = `# Optimize Bracket 3 Commander deck

**Commander:** ${commanderName}
**Synergy (single theme):** ${preferredStrategy}

${deckBlock}

## MCP workflow

1. \`analyze_deck\` with deckText, commanderName, preferredStrategy — capture qualityGate and prioritizedActions.
2. Fix **blocking** issues first: banlist, hard lint, format (99 cards, singleton, color identity).
3. \`optimize_deck\` with maxIterations **4** (same commander + preferredStrategy).
4. Re-\`analyze_deck\` until qualityGate.readyToShip or user accepts polish gaps.
5. Use \`evaluate_card_swap\` for single swaps; \`search_cards\` for replacements (category + colorIdentity filters).

## Category targets (Bracket 3)

${BRACKET3_CATEGORY_TABLE}

## Quality checklist

${QUALITY_CHECKLIST}

## Stop when

- qualityGate.readyToShip === true, **or**
- No category below, banlistValid, no hard lint, synergyScore ≥ 60, Bracket 3 clean.

Deliver final **decklistText** from analyze output.`;

  return {
    description: `Optimize ${commanderName} (${preferredStrategy}) toward Bracket 3 quality gate`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

/** Prompt templates exposed via MCP prompts/list. */
export function listMcpPrompts(): McpPromptDescriptor[] {
  return [
    {
      name: 'build-commander-deck',
      description:
        'Step-by-step Bracket 3 deck build workflow with AGENTS checklist and MCP tool order',
      arguments: [
        {
          name: 'commanderName',
          description: 'Exact Scryfall commander name',
          required: true,
        },
        {
          name: 'preferredStrategy',
          description: 'EDHREC theme slug (tokens, voltron, group-slug, …). Omit to require get_synergies first.',
          required: false,
        },
      ],
    },
    {
      name: 'optimize-decklist',
      description:
        'Analyze → optimize → re-analyze loop for an existing list with quality gate checklist',
      arguments: [
        {
          name: 'commanderName',
          description: 'Exact Scryfall commander name',
          required: true,
        },
        {
          name: 'preferredStrategy',
          description: 'Confirmed EDHREC synergy slug for this deck',
          required: true,
        },
        {
          name: 'deckText',
          description: 'Optional 99-card mainboard text (1 Card Name per line)',
          required: false,
        },
      ],
    },
  ];
}

/** Resolve a prompt by name and arguments (prompts/get). */
export function getMcpPrompt(
  name: string,
  args?: Record<string, string>
): McpPromptResult {
  const normalized = args ?? {};
  switch (name) {
    case 'build-commander-deck':
      return buildCommanderDeckPrompt(normalized);
    case 'optimize-decklist':
      return optimizeDecklistPrompt(normalized);
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
