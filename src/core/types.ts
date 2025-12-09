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
  /** Synergy score with commander (optional) */
  synergyScore?: number;
  /** Category/source (e.g., "top/white", "lands/azorius") */
  category?: string;
}

/**
 * EDHREC integration context for deck building
 */
export interface EdhrecContext {
  /** List of EDHREC sources/URLs used */
  sourcesUsed: string[];
  /** Flat list of card suggestions from EDHREC */
  suggestions: EdhrecCardSuggestion[];
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
