/**
 * schemas.ts
 * 
 * Zod schemas for MCP server tool validation.
 * These mirror the TypeScript interfaces in types.ts but provide runtime validation.
 */

import { z } from "zod";

/** Safe filesystem resource id — blocks path traversal in template/bracket/strategy loaders. */
export const SafeResourceIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    'Invalid resource id: use lowercase letters, digits, and hyphens only'
  );

/** Optional template id with bracket3 default. */
export const TemplateIdSchema = SafeResourceIdSchema.optional().default('bracket3');

/** Optional bracket id with bracket3 default. */
export const BracketIdSchema = SafeResourceIdSchema.optional().default('bracket3');

/** Max decklist text size — DoS guard for parse/analyze/optimize loops. */
export const DECK_TEXT_MAX_LENGTH = 32_768;

/** Max single card or commander name length. */
export const CARD_NAME_MAX_LENGTH = 200;

/** Max commander name length (same as card names). */
export const COMMANDER_NAME_MAX_LENGTH = CARD_NAME_MAX_LENGTH;

/** Max OpenAI style-analysis question length. */
export const STYLE_QUESTION_MAX_LENGTH = 500;

/** Max FTS query length for search_cards. */
export const SEARCH_QUERY_MAX_LENGTH = 200;

/** Max one-for-one swaps per apply_deck_changes call. */
export const SWAPS_MAX_COUNT = 30;

/** Max seed cards on build_deck_from_commander. */
export const SEED_CARDS_MAX_COUNT = 30;

/** Max card names in exclude/preserve lists. */
export const CARD_NAME_LIST_MAX_COUNT = 100;

/** Max focus categories on optimize_deck (all Bracket 3 categories). */
export const FOCUS_CATEGORIES_MAX_COUNT = 13;

/** Bounded decklist text (analyze, optimize, evaluate_card_swap, apply_deck_changes). */
export const DeckTextSchema = z
  .string()
  .min(1)
  .max(DECK_TEXT_MAX_LENGTH)
  .describe('Decklist text, one card per line with quantity');

/** Bounded card name for resolve, swap, and list entries. */
export const CardNameSchema = z.string().min(1).max(CARD_NAME_MAX_LENGTH);

/** Required commander name. */
export const CommanderNameSchema = z.string().min(1).max(COMMANDER_NAME_MAX_LENGTH);

/** MTG color letter (WUBRG). */
export const ColorLetterSchema = z.enum(['W', 'U', 'B', 'R', 'G']);

/** Commander color identity subset filter (max 5 colors). */
export const ColorIdentitySchema = z.array(ColorLetterSchema).max(5);

/** Bounded mana value / CMC filter (0–20 covers all legal Commander cards). */
export const ManaValueSchema = z
  .number()
  .finite()
  .min(0)
  .max(20)
  .describe('Mana value (CMC)');

/** Optional commander name — rejects empty string when provided. */
export const OptionalCommanderNameSchema = z
  .string()
  .min(1)
  .max(COMMANDER_NAME_MAX_LENGTH)
  .optional();

/** EDHREC theme slug — blocks path-like values before EDHREC/FS reads. */
export const PreferredStrategySchema = SafeResourceIdSchema.optional().describe(
  'EDHREC theme slug (e.g. tokens, voltron, group-slug). Use get_synergies for commander-specific slugs.'
);

/** Bounded list of card names (excludeNames, preserveCards). */
export const CardNameListSchema = z
  .array(CardNameSchema)
  .max(CARD_NAME_LIST_MAX_COUNT);

/** Bounded seed cards for deck build. */
export const SeedCardsSchema = CardNameListSchema.max(SEED_CARDS_MAX_COUNT).optional();

/** Single cut/add pair for apply_deck_changes. */
export const SwapItemSchema = z.object({
  remove: CardNameSchema.describe('Card name to remove'),
  add: CardNameSchema.describe('Card name to add'),
});

/** Common EDHREC theme slugs for `preferredStrategy` (confirm with get_synergies per commander). */
export const PREFERRED_STRATEGY_SLUGS = [
  "tokens",
  "voltron",
  "counters",
  "reanimator",
  "spellslinger",
  "lands",
  "tribal",
  "superfriends",
  "blink",
  "aristocrats",
  "group-slug",
  "artifacts",
] as const;

/** Shared MCP output shape for secondary tools (default brief saves tokens). */
export const McpResponseModeSchema = z
  .enum(['brief', 'full'])
  .optional()
  .default('brief')
  .describe('brief: compact JSON; full: pretty-printed complete payload');

/**
 * Bracket 3 template category names from `data/deck-template-bracket3.json` `categories[].name`.
 * Used to validate category params on search_cards, get_category_candidates, optimize_deck.
 */
export const BRACKET3_TEMPLATE_CATEGORY_NAMES = [
  'lands',
  'ramp',
  'card_draw',
  'card_selection',
  'spot_removal',
  'artifact_enchantment_hate',
  'graveyard_hate',
  'board_wipes',
  'protection',
  'value_engines',
  'win_conditions',
  'game_changers',
  'extra_turns',
] as const;

export type TemplateCategoryName = (typeof BRACKET3_TEMPLATE_CATEGORY_NAMES)[number];

export const TemplateCategoryNameSchema = z
  .enum(BRACKET3_TEMPLATE_CATEGORY_NAMES)
  .describe('Bracket 3 template category (see deck-template-bracket3.json)');

/**
 * Schema for analyze_deck tool input
 * 
 * Corresponds to AnalyzeDeckInput interface in types.ts
 */
export const AnalyzeDeckInputSchema = z.object({
  /** Raw decklist text (one card per line with quantity) */
  deckText: DeckTextSchema.describe(
    "Raw decklist text, one card per line with quantity (e.g., '1 Sol Ring', '19 Island'). Basic lands may be grouped as N Plains / N Island. Optional first line: Commander: Card Name"
  ),

  commanderName: OptionalCommanderNameSchema.describe(
    "Commander card name for color identity checks (optional if deckText contains a Commander: line)"
  ),
  
  /** Template ID for deck analysis (optional, defaults to "bracket3") */
  templateId: TemplateIdSchema.describe("Template ID for deck analysis (default: bracket3)"),

  /** Bracket ID for rule enforcement (optional, defaults to "bracket3") */
  bracketId: BracketIdSchema.describe("Bracket ID for rule enforcement (default: bracket3)"),
  
  /** EDHREC theme slug; enables synergyScore and cut/add hints */
  preferredStrategy: PreferredStrategySchema.describe(
    `EDHREC theme slug. Examples: ${PREFERRED_STRATEGY_SLUGS.join(", ")}. Use get_synergies for commander-specific slugs.`
  ),

  /** Analysis options (reserved for future flags) */
  options: z.object({}).optional().describe("Analysis options"),

  /** brief (default) returns agentBrief, qualityGate, and slim analysis; full returns complete JSON */
  responseMode: z.enum(["brief", "full"]).optional().default("brief"),

  /** When true (default), infer commander from legendary commander-capable mainboard card if no Commander: line */
  inferCommander: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'If true and commanderName is omitted, use first commander-eligible legendary card in deckText'
    ),
});

/**
 * Schema for analyze_deck tool output
 * 
 * For now, we treat the result as a generic JSON structure.
 * This can be refined later with more specific zod schemas if needed.
 */
export const AnalyzeDeckResultSchema = z.any().describe("Deck analysis result with categories, warnings, and recommendations");

const MetaOverrideSchema = z.object({
  graveyard_meta_share: z.number().min(0).max(1).optional(),
  fast_combo_density: z.enum(["low", "mid", "high"]).optional(),
  creature_meta_share: z.number().min(0).max(1).optional(),
});

/**
 * Schema for build_deck_from_commander tool input
 * 
 * Corresponds to BuildDeckInput interface in types.ts
 */
export const BuildDeckInputSchema = z.object({
  /** Commander card name to build around */
  commanderName: CommanderNameSchema.describe("Commander card name (e.g., \"Atraxa, Praetors' Voice\")"),
  
  /** Template ID for deck building (optional, defaults to "bracket3") */
  templateId: TemplateIdSchema.describe("Template ID for deck building (default: bracket3)"),

  /** Bracket ID for rule enforcement (optional, defaults to "bracket3") */
  bracketId: BracketIdSchema.describe("Bracket ID for rule enforcement (default: bracket3)"),
  
  /** EDHREC theme slug — boosts generator/autofill card scoring */
  preferredStrategy: PreferredStrategySchema.describe(
    `EDHREC theme slug. Examples: ${PREFERRED_STRATEGY_SLUGS.join(", ")}. Ask the user to pick one synergy before building.`
  ),
  
  /** Optional seed cards to include in the deck */
  seedCards: SeedCardsSchema.describe("Optional seed cards to include (e.g., ['Sol Ring', 'Arcane Signet'])"),
  
  /** Whether to fetch EDHREC suggestions (default: true) */
  useEdhrec: z.boolean().optional().default(true).describe("Whether to fetch EDHREC suggestions for card recommendations. Defaults to true."),
  
  /** Whether to autofill missing categories using EDHREC (default: true) */
  useEdhrecAutofill: z.boolean().optional().default(true).describe("Whether to autofill missing categories (ramp, draw, removal, wipes) using EDHREC suggestions. Defaults to true."),

  /** When true and templateId is bracket3, use template-driven generator (mana_base, categories, EDHREC) for a full 99-card deck */
  useTemplateGenerator: z.boolean().optional().default(true).describe("When true with templateId bracket3, build deck using template-driven generator (mana_base, curve, categories, EDHREC). Defaults to true for bracket3."),

  /** OpenAI enhancement on remaining category gaps (requires OPENAI_API_KEY). Defaults to true. */
  useOpenAIEnhancement: z.boolean().optional().default(true).describe("When true and OPENAI_API_KEY is set, use OpenAI to pick cards from DB candidates for underfilled categories after EDHREC/DB fill. Defaults to true."),

  useUserStyleReference: z.boolean().optional().default(true).describe("When true, use data/my_decks as read-only style reference for land count and mana base staples. Never writes generated decks there."),

  /** When true (default), repeat EDHREC autofill until category deficits clear or no progress (see maxRefinementIterations). */
  refineUntilStable: z.boolean().optional().default(true).describe("Repeat EDHREC category autofill until template gaps are filled or iteration cap is reached. Defaults to true."),

  /** Maximum autofill passes when refineUntilStable is true (default 5). */
  maxRefinementIterations: z.number().int().min(1).max(12).optional().default(5).describe("Max EDHREC autofill passes (1–12). Defaults to 5."),

  responseMode: z.enum(["brief", "full"]).optional().default("brief"),

  metaOverride: MetaOverrideSchema.optional().describe(
    "Optional template.meta tweaks (advanced; usually omit)"
  ),
});

/** get_category_candidates tool input */
export const GetCategoryCandidatesInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  commanderName: CommanderNameSchema.describe("Commander card name for color identity"),
  category: TemplateCategoryNameSchema.describe(
    'Template category to fill (e.g. card_draw, ramp, spot_removal)'
  ),
  preferredStrategy: PreferredStrategySchema.describe(
    `EDHREC theme slug for synergy ranking. Examples: ${PREFERRED_STRATEGY_SLUGS.join(", ")}.`
  ),
  limit: z.number().int().min(1).max(30).optional().default(15),
  maxMV: ManaValueSchema.optional().describe("Maximum mana value"),
  excludeNames: CardNameListSchema.optional().describe(
    "Card names already in the deck to exclude"
  ),
});

export type GetCategoryCandidatesInput = z.infer<typeof GetCategoryCandidatesInputSchema>;

/** get_user_deck_style — read-only user import library + optional OpenAI narrative */
export const GetUserDeckStyleInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  commanderName: OptionalCommanderNameSchema.describe(
    "Optional commander to tailor land-count and staple hints"
  ),
  preferredStrategy: PreferredStrategySchema.describe("EDHREC theme slug for OpenAI context"),
  useOpenAI: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true and OPENAI_API_KEY is set, include narrative style analysis"),
  question: z
    .string()
    .max(STYLE_QUESTION_MAX_LENGTH)
    .optional()
    .describe("Custom question for OpenAI style analysis (requires useOpenAI: true)"),
});

export type GetUserDeckStyleInput = z.infer<typeof GetUserDeckStyleInputSchema>;

/**
 * Schema for build_deck_from_commander tool output
 * 
 * For now, we treat the result as a generic JSON structure.
 * This can be refined later with more specific zod schemas if needed.
 */
export const BuildDeckResultSchema = z.any().describe("Built deck with cards, analysis, EDHREC context, and builder notes");

export const SEARCH_CARDS_SORT_BY = [
  "synergyRelevance",
  "mv",
  "name",
  "edhrecRank",
] as const;

/** search_cards tool input */
export const SearchCardsInputSchema = z
  .object({
    responseMode: McpResponseModeSchema,
    query: z
      .string()
      .max(SEARCH_QUERY_MAX_LENGTH)
      .optional()
      .describe("FTS text search on name, oracle text, type line"),
    colorIdentity: ColorIdentitySchema.optional().describe(
      "Color identity subset filter (W,U,B,R,G)"
    ),
    category: TemplateCategoryNameSchema.optional().describe(
      'Template category tag (ramp, card_draw, spot_removal, etc.)'
    ),
    type: z.string().max(100).optional().describe("Type line substring (Creature, Instant, Land, ...)"),
    maxMV: ManaValueSchema.optional().describe("Maximum mana value (CMC)"),
    commanderLegal: z.boolean().optional().default(true).describe("Only Commander-legal cards (default true)"),
    limit: z.number().int().min(1).max(100).optional().default(20).describe("Max results (default 20)"),
    preferredStrategy: PreferredStrategySchema.describe(
      `EDHREC theme slug for synergyRelevance sorting. Examples: ${PREFERRED_STRATEGY_SLUGS.join(", ")}.`
    ),
    commanderName: OptionalCommanderNameSchema.describe(
      "Commander name to load EDHREC inclusion rates and theme-weighted relevance"
    ),
    excludeNames: CardNameListSchema.optional().describe(
      "Card names to exclude from results (case-insensitive)"
    ),
    sortBy: z
      .enum(SEARCH_CARDS_SORT_BY)
      .optional()
      .default("synergyRelevance")
      .describe("Sort order for results (default synergyRelevance when strategy set)"),
  })
  .superRefine((val, ctx) => {
    const hasQuery = Boolean(val.query?.trim());
    const hasCategory = Boolean(val.category?.trim());
    const hasType = Boolean(val.type?.trim());
    const hasColors = Boolean(val.colorIdentity && val.colorIdentity.length > 0);
    const hasCommander = Boolean(val.commanderName?.trim());
    const hasMaxMv = val.maxMV != null;
    if (!hasQuery && !hasCategory && !hasType && !hasColors && !hasCommander && !hasMaxMv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one of query, category, type, colorIdentity, commanderName, or maxMV is required",
      });
    }
  });

export type SearchCardsInput = z.infer<typeof SearchCardsInputSchema>;

/** get_synergies tool input */
export const GetSynergiesInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  commanderName: CommanderNameSchema.describe("Commander card name"),
});

export type GetSynergiesInput = z.infer<typeof GetSynergiesInputSchema>;

/** optimize_deck tool input */
export const OptimizeDeckInputSchema = z.object({
  deckText: DeckTextSchema.describe('Current mainboard decklist text (one card per line)'),
  commanderName: CommanderNameSchema.describe('Commander card name'),
  preferredStrategy: PreferredStrategySchema.describe(
    `EDHREC theme slug for synergy scoring and EDHREC pool. Examples: ${PREFERRED_STRATEGY_SLUGS.join(', ')}.`
  ),
  templateId: TemplateIdSchema,
  bracketId: BracketIdSchema,
  banlistId: SafeResourceIdSchema.optional().default('commander'),
  maxIterations: z.number().int().min(1).max(12).optional().default(4),
  focusCategories: z
    .array(TemplateCategoryNameSchema)
    .max(FOCUS_CATEGORIES_MAX_COUNT)
    .optional()
    .describe('Optional: only optimize these template categories'),
  stopWhenScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Stop iterating when synergyScore reaches this value (requires preferredStrategy)'),
  preserveCards: CardNameListSchema.optional().describe(
    'Card names that must not be cut during optimization'
  ),
  responseMode: z.enum(['brief', 'full']).optional().default('brief'),
});

/** resolve_card tool input */
export const ResolveCardInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  cardName: CardNameSchema.describe('Card name to resolve against cards.db / Scryfall'),
  commanderName: OptionalCommanderNameSchema.describe(
    'When set, checks Commander legality and color identity vs this commander'
  ),
});

export type ResolveCardInput = z.infer<typeof ResolveCardInputSchema>;
export type OptimizeDeckInput = z.infer<typeof OptimizeDeckInputSchema>;


/** evaluate_card_swap tool input */
export const EvaluateCardSwapInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  deckText: DeckTextSchema.describe('Current decklist text (one card per line)'),
  commanderName: CommanderNameSchema.describe('Commander card name'),
  cardToRemove: CardNameSchema.describe('Card name to remove from the deck'),
  cardToAdd: CardNameSchema.describe('Card name to add to the deck'),
  preferredStrategy: PreferredStrategySchema.describe(
    `EDHREC theme slug for synergy scoring. Examples: ${PREFERRED_STRATEGY_SLUGS.join(', ')}.`
  ),
  templateId: TemplateIdSchema,
  bracketId: BracketIdSchema,
});

export type EvaluateCardSwapInput = z.infer<typeof EvaluateCardSwapInputSchema>;

/** get_strategy_guide tool input */
export const GetStrategyGuideInputSchema = z.object({
  responseMode: McpResponseModeSchema,
  commanderName: CommanderNameSchema.describe('Commander card name (for guide context)'),
  preferredStrategy: SafeResourceIdSchema.describe(
    'EDHREC theme slug (e.g. tokens, voltron, group-slug)'
  ),
  summaryOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe('When true, omit full guideMarkdown (returns keyRatios, packages, antiPatterns only)'),
});

export type GetStrategyGuideInput = z.infer<typeof GetStrategyGuideInputSchema>;

export const ApplyDeckChangesInputSchema = z.object({
  deckText: DeckTextSchema.describe('Current mainboard decklist text'),
  commanderName: OptionalCommanderNameSchema.describe(
    'Commander for color identity checks (optional if deckText has Commander: line)'
  ),
  swaps: z
    .array(SwapItemSchema)
    .min(1)
    .max(SWAPS_MAX_COUNT)
    .describe('One-for-one swaps to apply in order'),
});

export type ApplyDeckChangesInput = z.infer<typeof ApplyDeckChangesInputSchema>;

