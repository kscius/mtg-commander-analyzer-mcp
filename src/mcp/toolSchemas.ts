/**
 * MCP tool input schemas kept in sync with Zod definitions in src/core/schemas.ts.
 *
 * The MCP SDK expects JSON Schema on ListTools; we maintain property lists here
 * alongside Zod so runtime validation (parse) and client discovery stay aligned.
 * When adding tool fields, update both schemas.ts and the matching entry below.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SAFE_RESOURCE_ID_PATTERN } from '../core/safePath';
import {
  BRACKET3_TEMPLATE_CATEGORY_NAMES,
  CARD_NAME_LIST_MAX_COUNT,
  CARD_NAME_MAX_LENGTH,
  COMMANDER_NAME_MAX_LENGTH,
  DECK_TEXT_MAX_LENGTH,
  FOCUS_CATEGORIES_MAX_COUNT,
  PREFERRED_STRATEGY_SLUGS,
  RESOURCE_ID_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEED_CARDS_MAX_COUNT,
  STYLE_QUESTION_MAX_LENGTH,
  SWAPS_MAX_COUNT,
} from '../core/schemas';

export const PREFERRED_STRATEGY_DOC =
  `EDHREC theme slug (not free text). Examples: ${PREFERRED_STRATEGY_SLUGS.join(', ')}. ` +
  'Use get_synergies for commander-specific slugs; ask the user before building.';

const RESPONSE_MODE_PROP = {
  type: 'string',
  enum: ['brief', 'full'],
  default: 'brief',
  description: 'brief: compact JSON for agents; full: complete payload',
} as const;

const TEMPLATE_CATEGORY_PROP = {
  type: 'string',
  enum: [...BRACKET3_TEMPLATE_CATEGORY_NAMES],
  description: 'Bracket 3 template category (e.g. card_draw, ramp, spot_removal)',
} as const;

/** Shared string bounds — keep in sync with Zod schemas in core/schemas.ts */
const DECK_TEXT_PROP = {
  type: 'string',
  minLength: 1,
  maxLength: DECK_TEXT_MAX_LENGTH,
} as const;

const CARD_NAME_PROP = {
  type: 'string',
  minLength: 1,
  maxLength: CARD_NAME_MAX_LENGTH,
} as const;

const COMMANDER_NAME_PROP = {
  type: 'string',
  minLength: 1,
  maxLength: COMMANDER_NAME_MAX_LENGTH,
} as const;

const CARD_NAME_ARRAY_PROP = {
  type: 'array',
  items: CARD_NAME_PROP,
  maxItems: CARD_NAME_LIST_MAX_COUNT,
} as const;

/** Resource id (templateId, bracketId, preferredStrategy, banlistId) — sync with SafeResourceIdSchema */
const RESOURCE_ID_PROP = {
  type: 'string',
  pattern: SAFE_RESOURCE_ID_PATTERN,
  maxLength: RESOURCE_ID_MAX_LENGTH,
} as const;

const TEMPLATE_ID_PROP = { ...RESOURCE_ID_PROP, default: 'bracket3' } as const;
const BRACKET_ID_PROP = { ...RESOURCE_ID_PROP, default: 'bracket3' } as const;
const BANLIST_ID_PROP = {
  ...RESOURCE_ID_PROP,
  default: 'commander',
  description: 'Internal banlist key (default commander)',
} as const;
const PREFERRED_STRATEGY_PROP = {
  ...RESOURCE_ID_PROP,
  description: PREFERRED_STRATEGY_DOC,
} as const;
const REQUIRED_PREFERRED_STRATEGY_PROP = {
  ...RESOURCE_ID_PROP,
} as const;

/** Tool definitions — keep in sync with Zod schemas in core/schemas.ts */
export function buildMcpTools(): Tool[] {
  return [
    {
      name: 'analyze_deck',
      description:
        'Analyze a Commander (EDH) decklist using Bracket 3 templates and rules. ' +
        'Validates card counts, categorizes cards by role (ramp, draw, removal, etc.), ' +
        'checks bracket constraints (Game Changers, mass land denial, extra turns), ' +
        'and provides detailed recommendations. Returns summary and nextSuggestedAction.',
      inputSchema: {
        type: 'object',
        properties: {
          deckText: {
            ...DECK_TEXT_PROP,
            description:
              "Raw decklist text, one card per line with quantity (e.g., '1 Sol Ring\\n1 Island')",
          },
          templateId: TEMPLATE_ID_PROP,
          bracketId: BRACKET_ID_PROP,
          commanderName: COMMANDER_NAME_PROP,
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          options: {
            type: 'object',
            description: 'Analysis options (reserved for future flags)',
          },
          responseMode: {
            type: 'string',
            enum: ['brief', 'full'],
            default: 'brief',
            description: 'brief omits heavy analysis fields; full returns complete JSON',
          },
          inferCommander: {
            type: 'boolean',
            default: true,
            description:
              'If true and commanderName is omitted, use first commander-eligible legendary card in deckText',
          },
        },
        required: ['deckText'],
      },
    },
    {
      name: 'build_deck_from_commander',
      description:
        'Build a Commander deck from a commander name (template + EDHREC + optional OpenAI category enhancement from DB candidates). Returns converged, remainingGaps, nextSuggestedAction.',
      inputSchema: {
        type: 'object',
        properties: {
          commanderName: COMMANDER_NAME_PROP,
          templateId: TEMPLATE_ID_PROP,
          bracketId: BRACKET_ID_PROP,
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          seedCards: {
            type: 'array',
            items: CARD_NAME_PROP,
            maxItems: SEED_CARDS_MAX_COUNT,
          },
          useEdhrec: { type: 'boolean', default: true },
          useEdhrecAutofill: { type: 'boolean', default: true },
          useTemplateGenerator: { type: 'boolean', default: true },
      useOpenAIEnhancement: {
            type: 'boolean',
            default: true,
            description:
              'When true and OPENAI_API_KEY is set, use OpenAI to improve category fill from DB candidates (after EDHREC).',
          },
          useUserStyleReference: {
            type: 'boolean',
            default: true,
            description:
              'When true, bias land count and mana base toward read-only imports in data/my_decks (never writes generated decks there).',
          },
          refineUntilStable: { type: 'boolean', default: true },
          maxRefinementIterations: { type: 'number', minimum: 1, maximum: 12, default: 5 },
          responseMode: { type: 'string', enum: ['brief', 'full'], default: 'brief' },
          metaOverride: {
            type: 'object',
            properties: {
              graveyard_meta_share: { type: 'number', minimum: 0, maximum: 1 },
              fast_combo_density: { type: 'string', enum: ['low', 'mid', 'high'] },
              creature_meta_share: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        required: ['commanderName'],
      },
    },
    {
      name: 'get_category_candidates',
      description:
        'Ranked card candidates for one template category gap (color + synergy). Use after analyze_deck prioritizedActions.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          commanderName: COMMANDER_NAME_PROP,
          category: TEMPLATE_CATEGORY_PROP,
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          limit: { type: 'number', minimum: 1, maximum: 30, default: 15 },
          maxMV: { type: 'number', minimum: 0, maximum: 20 },
          excludeNames: CARD_NAME_ARRAY_PROP,
        },
        required: ['commanderName', 'category'],
      },
    },
    {
      name: 'search_cards',
      description:
        'Search the local Scryfall card database (FTS + filters). Dedupes by oracle_id. Never invent card names.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          query: { type: 'string', maxLength: SEARCH_QUERY_MAX_LENGTH },
          colorIdentity: {
            type: 'array',
            items: { type: 'string', enum: ['W', 'U', 'B', 'R', 'G'] },
            maxItems: 5,
          },
          category: TEMPLATE_CATEGORY_PROP,
          type: { type: 'string', maxLength: 100 },
          maxMV: { type: 'number', minimum: 0, maximum: 20, description: 'Maximum mana value (valid filter alone)' },
          commanderLegal: { type: 'boolean', default: true },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          commanderName: COMMANDER_NAME_PROP,
          excludeNames: CARD_NAME_ARRAY_PROP,
          sortBy: {
            type: 'string',
            enum: ['synergyRelevance', 'mv', 'name', 'edhrecRank'],
            default: 'synergyRelevance',
          },
        },
      },
    },
    {
      name: 'optimize_deck',
      description:
        'Iteratively improve a deck: swaps, synergy-ordered cuts, EDHREC/land autofill. Returns converged and remainingGaps.',
      inputSchema: {
        type: 'object',
        properties: {
          deckText: DECK_TEXT_PROP,
          commanderName: COMMANDER_NAME_PROP,
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          templateId: TEMPLATE_ID_PROP,
          bracketId: BRACKET_ID_PROP,
          banlistId: BANLIST_ID_PROP,
          maxIterations: { type: 'number', minimum: 1, maximum: 12, default: 4 },
          focusCategories: {
            type: 'array',
            items: TEMPLATE_CATEGORY_PROP,
            maxItems: FOCUS_CATEGORIES_MAX_COUNT,
          },
          stopWhenScore: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Stop when synergyScore reaches this value (0-100)',
          },
          preserveCards: {
            ...CARD_NAME_ARRAY_PROP,
            description: 'Cards that must not be cut',
          },
          responseMode: { type: 'string', enum: ['brief', 'full'], default: 'brief' },
        },
        required: ['deckText', 'commanderName'],
      },
    },
    {
      name: 'apply_deck_changes',
      description:
        'Apply one-for-one card swaps to a decklist and return validated decklistText (no manual re-paste).',
      inputSchema: {
        type: 'object',
        properties: {
          deckText: DECK_TEXT_PROP,
          commanderName: COMMANDER_NAME_PROP,
          swaps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                remove: CARD_NAME_PROP,
                add: CARD_NAME_PROP,
              },
              required: ['remove', 'add'],
            },
            minItems: 1,
            maxItems: SWAPS_MAX_COUNT,
          },
        },
        required: ['deckText', 'swaps'],
      },
    },
    {
      name: 'resolve_card',
      description:
        'Resolve a card name to the canonical database name and check Commander legality, banlist, and optional commander color fit.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          cardName: CARD_NAME_PROP,
          commanderName: COMMANDER_NAME_PROP,
        },
        required: ['cardName'],
      },
    },
    {
      name: 'get_synergies',
      description: 'List plausible synergies for a commander (EDHREC themes + heuristics).',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          commanderName: COMMANDER_NAME_PROP,
        },
        required: ['commanderName'],
      },
    },
    {
      name: 'evaluate_card_swap',
      description: 'Preview a single card swap before editing a decklist.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          deckText: DECK_TEXT_PROP,
          commanderName: COMMANDER_NAME_PROP,
          cardToRemove: CARD_NAME_PROP,
          cardToAdd: CARD_NAME_PROP,
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          templateId: TEMPLATE_ID_PROP,
          bracketId: BRACKET_ID_PROP,
        },
        required: ['deckText', 'commanderName', 'cardToRemove', 'cardToAdd'],
      },
    },
    {
      name: 'get_strategy_guide',
      description: 'Construction guide for an EDHREC theme slug.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          commanderName: COMMANDER_NAME_PROP,
          preferredStrategy: REQUIRED_PREFERRED_STRATEGY_PROP,
          summaryOnly: {
            type: 'boolean',
            default: false,
            description: 'Omit full guideMarkdown when true',
          },
        },
        required: ['commanderName', 'preferredStrategy'],
      },
    },
    {
      name: 'get_user_deck_style',
      description:
        'Read-only profile of the user\'s imported Moxfield decks (data/my_decks): land counts, mana base staples, category averages. Optional OpenAI narrative when useOpenAI is true.',
      inputSchema: {
        type: 'object',
        properties: {
          responseMode: RESPONSE_MODE_PROP,
          commanderName: {
            ...COMMANDER_NAME_PROP,
            description: 'Optional commander to tailor land target and staple hints',
          },
          preferredStrategy: PREFERRED_STRATEGY_PROP,
          useOpenAI: {
            type: 'boolean',
            default: false,
            description: 'Include OpenAI narrative analysis (requires OPENAI_API_KEY)',
          },
          question: {
            type: 'string',
            maxLength: STYLE_QUESTION_MAX_LENGTH,
            description: 'Custom question for OpenAI (only when useOpenAI is true)',
          },
        },
      },
    },
  ];
}
