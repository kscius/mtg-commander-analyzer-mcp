/**
 * types.ts
 * 
 * Shared TypeScript interfaces and types for the MTG Commander Deck Analyzer.
 * These types define the contract for the analyze_deck MCP tool and related functionality.
 */

/**
 * Represents a single card entry in a parsed decklist
 */
export interface ParsedCardEntry {
  /** Original line from the decklist */
  rawLine: string;
  /** Number of copies of this card */
  quantity: number;
  /** Card name as it appears in the decklist */
  name: string;
}

/**
 * Represents a complete parsed decklist
 */
export interface ParsedDeck {
  /** Commander card name (null if not detected) */
  commanderName?: string | null;
  /** Array of parsed card entries */
  cards: ParsedCardEntry[];
}

/**
 * Input for the analyze_deck tool
 */
export interface AnalyzeDeckInput {
  /** Raw decklist text to analyze */
  deckText: string;
  /** Optional template ID for deck building strategy */
  templateId?: string;
  /** Optional banlist ID (e.g., "commander", "duel-commander") */
  banlistId?: string;
  /** Optional EDHREC URLs for additional context */
  edhrecUrls?: string[];
  /** Additional options for analysis */
  options?: {
    /** Whether to attempt to infer the commander from the decklist */
    inferCommander?: boolean;
    /** Language of card names (default: "en") */
    language?: string;
    /** Use OpenAI to classify cards with no tags (fallback when heuristics miss) */
    useLLMFallbackForCategories?: boolean;
  };
}

/**
 * Status of a category relative to its recommended range
 */
export type CategoryStatus = "below" | "within" | "above" | "unknown";

/**
 * Summary of a single card category (lands, creatures, etc.)
 */
export interface CategorySummary {
  /** Category name (e.g., "lands", "creatures") */
  name: string;
  /** Current count of cards in this category */
  count: number;
  /** Recommended minimum (optional) */
  min?: number;
  /** Recommended maximum (optional) */
  max?: number;
  /** Status relative to recommended range */
  status: CategoryStatus;
}

/**
 * Information about a banned card found in a deck
 */
export interface BannedCardInfo {
  /** Card name */
  name: string;
  /** Quantity in the deck */
  quantity: number;
}

/**
 * Severity of a lint issue (hard = must fix for template; soft = recommendation)
 */
export type LintSeverity = 'hard' | 'soft';

/**
 * Single lint issue from template-based validation
 */
export interface LintIssue {
  /** Identifier (e.g. "curve:avg_mv", "mana_base:tapped_total") */
  key: string;
  severity: LintSeverity;
  message: string;
  /** Suggested section to regenerate (e.g. "mana_base", "curve") */
  sectionSuggest?: string;
  details?: unknown;
}

/**
 * Lint report: issues and metrics from template validation
 */
export interface LintReport {
  ok: boolean;
  issues: LintIssue[];
  metrics: Record<string, unknown>;
}

/**
 * Complete deck analysis result
 */
export interface DeckAnalysis {
  /** Commander card name (null if not detected) */
  commanderName: string | null;
  /** Total number of cards (sum of all quantities) */
  totalCards: number;
  /** Number of unique card entries */
  uniqueCards: number;
  /** Array of category summaries */
  categories: CategorySummary[];
  /** Analysis notes, warnings, and recommendations */
  notes: string[];
  /** Bracket ID if bracket rules are being applied (optional) */
  bracketId?: string;
  /** Bracket label if bracket rules are being applied (optional) */
  bracketLabel?: string;
  /** Bracket-specific warnings (empty if no bracket or no violations) */
  bracketWarnings: string[];
  /** List of banned cards found in the deck (empty if none) */
  bannedCards: BannedCardInfo[];
  /** Whether the deck passes banlist validation */
  banlistValid: boolean;
  /** Template lint report (curva, land_mix, interaction_coverage, category constraints) when template is full (e.g. bracket3) */
  lintReport?: LintReport;
}

/**
 * Complete result from the analyze_deck tool
 */
export interface AnalyzeDeckResult {
  /** Echo of relevant input parameters */
  input: {
    /** Template ID used (if any) */
    templateId?: string;
    /** Banlist ID used (if any) */
    banlistId?: string;
  };
  /** Deck analysis result */
  analysis: DeckAnalysis;
  /** Parsed deck structure */
  parsedDeck: ParsedDeck;
}

/**
 * Configuration for a single category in a deck template
 */
export interface TemplateCategoryConfig {
  /** Category name (e.g., "lands", "ramp", "target_removal") */
  name: string;
  /** Recommended minimum count */
  min?: number;
  /** Recommended maximum count */
  max?: number;
}

/**
 * Deck template defining category expectations
 */
export interface DeckTemplate {
  /** Template ID (e.g., "default", "aggro", "control") */
  id: string;
  /** Human-readable label */
  label?: string;
  /** Array of category configurations */
  categories: TemplateCategoryConfig[];
  /** Optional Bracket 3 policies (max_game_changers, ban_mass_land_denial, etc.) */
  policies?: Record<string, unknown>;
}

/**
 * Definition of a known combo for Bracket 3 validation (no 2-card game-enders before T6).
 */
export interface ComboDef {
  id: string;
  name?: string;
  /** Card names (exact) that form the combo */
  pieces: string[];
  /** Number of pieces (e.g. 2 for two-card combo) */
  size: number;
  /** Minimum turn at which this combo is allowed (e.g. 6 = no before turn 6) */
  turnFloor: number;
  kind?: 'infinite' | 'lock' | 'game_end';
}

/**
 * Card role classification for deck analysis
 */
export type CardRole =
  | "land"
  | "ramp"
  | "target_removal"
  | "board_wipe"
  | "card_draw"
  | "protection"
  | "tutor"
  | "wincon"
  | "other";

/**
 * EDHREC card suggestion from JSON endpoints
 */
export interface EdhrecCardSuggestion {
  /** Card name */
  name: string;
  /** EDHREC URL for the card (optional) */
  url?: string;
  /** Rank/position in the list (optional) */
  rank?: number;
  /** Salt score (measure of "unfun" cards, optional) */
  saltScore?: number;
  /** Synergy score with commander (optional, -1.0 to 1.0) */
  synergyScore?: number;
  /** Category/source (e.g., "top/white", "lands/azorius") */
  category?: string;
  /** Percentage of EDHREC decks that include this card */
  inclusionRate?: number;
  /** Number of decks this card appears in */
  numDecks?: number;
  /** Card label from EDHREC (e.g. "New", "High Synergy") */
  label?: string;
}

/**
 * EDHREC theme/archetype available for a commander
 */
export interface EdhrecTheme {
  /** Theme name (e.g., "Tokens", "+1/+1 Counters", "Voltron") */
  name: string;
  /** URL slug (e.g., "tokens", "counters", "voltron") */
  slug: string;
  /** Number of decks using this theme */
  count?: number;
}

/**
 * EDHREC integration context for deck building
 */
export interface EdhrecContext {
  /** List of EDHREC sources/URLs used */
  sourcesUsed: string[];
  /** Flat list of card suggestions from EDHREC */
  suggestions: EdhrecCardSuggestion[];
  /** Themes/archetypes available for this commander */
  availableThemes?: EdhrecTheme[];
  /** Theme that was used for building (if any) */
  selectedTheme?: string;
  /** Average synergy score of included cards */
  avgSynergyScore?: number;
  /** Cards flagged as high-salt (saltScore >= threshold) */
  highSaltCards?: string[];
}

/**
 * Input for the build_deck_from_commander tool
 */
export interface BuildDeckInput {
  /** Commander card name to build around */
  commanderName: string;
  /** Template ID to use for deck building (default: "bracket3") */
  templateId?: string;
  /** Banlist ID (reserved for future use) */
  banlistId?: string;
  /** Bracket ID to apply rules from (default: "bracket3") */
  bracketId?: string;
  /** Preferred strategy/theme (reserved for future use) */
  preferredStrategy?: string;
  /** Optional list of additional cards to include in the 99 */
  seedCards?: string[];
  /** Whether to fetch EDHREC suggestions (default: false) */
  useEdhrec?: boolean;
  /** Whether to autofill missing categories using EDHREC suggestions (default: false) */
  useEdhrecAutofill?: boolean;
  /** When true and templateId is bracket3, use template-driven generator (mana_base, categories, EDHREC + OpenAI fallback) instead of skeleton + autofill */
  useTemplateGenerator?: boolean;
}

/**
 * Represents a single card entry in a built deck
 */
export interface BuiltCardEntry {
  /** Card name */
  name: string;
  /** Number of copies (should be 1 for Commander singleton) */
  quantity: number;
  /** Optional: inferred roles for this card */
  roles?: CardRole[];
}

/**
 * Represents a complete built deck
 */
export interface BuiltDeck {
  /** Commander card name */
  commanderName: string;
  /** Array of 99 non-commander cards */
  cards: BuiltCardEntry[];
}

/**
 * Complete result from the build_deck_from_commander tool
 */
export interface BuildDeckResult {
  /** Echo of input parameters */
  input: BuildDeckInput;
  /** Template ID used */
  templateId: string;
  /** Bracket ID used */
  bracketId: string;
  /** Bracket label (if available) */
  bracketLabel?: string;
  /** Built deck structure */
  deck: BuiltDeck;
  /** Analysis of the built deck */
  analysis: DeckAnalysis;
  /** Builder-specific notes, warnings, and assumptions */
  notes: string[];
  /** EDHREC integration context (if useEdhrec was true) */
  edhrecContext?: EdhrecContext;
}
