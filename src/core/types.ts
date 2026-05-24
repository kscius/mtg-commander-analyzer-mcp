/**
 * types.ts
 * 
 * Shared TypeScript interfaces and types for the MTG Commander Deck Analyzer.
 * These types define the contract for the analyze_deck MCP tool and related functionality.
 */

import type { BuildQualityReport, SuggestedUpgrade } from './buildQualityReport';

export interface ManaBaseQualitySummary {
  score: number;
  summary: string;
  metrics: {
    landCount?: number;
    tappedAlways?: number;
    tappedConditional?: number;
    landMix?: Record<string, number>;
  };
}

export interface CurveAnalysisSummary {
  score: number;
  summary: string;
  averageMv: number;
  distribution: Record<string, number>;
}

/** Params for search_cards when an action needs a replacement. */
export interface SuggestedCardSearch {
  category?: string;
  query?: string;
  maxMV?: number;
  preferredStrategy?: string;
}

/** Ordered improvement step for agents (unified across recommendations + quality). */
export interface PrioritizedAction {
  priority: number;
  action: 'add' | 'cut' | 'swap' | 'search' | 'fix';
  category?: string;
  detail: string;
  suggestedSearch?: SuggestedCardSearch;
  suggestedCard?: string;
}

/** Per-card thematic score when preferredStrategy is set. */
export interface CardSynergyScore {
  name: string;
  /** 0–100 */
  score: number;
  relevance: 'high' | 'medium' | 'low';
}

export interface DeckQualityReport {
  deckScore: number;
  strengthsAndWeaknesses: { strengths: string[]; weaknesses: string[] };
  prioritizedActions: PrioritizedAction[];
  manaBaseQuality?: ManaBaseQualitySummary;
  curveAnalysis?: CurveAnalysisSummary;
}

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
  /** When true (default), infer commander from deck if no Commander: line */
  inferCommander?: boolean;
  /** Commander name for color identity validation (optional if deckText includes Commander: line) */
  commanderName?: string;
  /** Optional template ID for deck building strategy */
  templateId?: string;
  /** Bracket ID for rule enforcement (e.g. bracket3); used with template when set */
  bracketId?: string;
  /** EDHREC theme slug (e.g. tokens, voltron); enables synergyScore and recommendations when set */
  preferredStrategy?: string;
  /** Internal banlist key (default commander); not exposed on MCP tool schema */
  banlistId?: string;
  /** Additional options for analysis */
  options?: Record<string, never>;
  /** MCP response size: brief (default) omits heavy analysis fields */
  responseMode?: 'brief' | 'full';
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
  /** 0–100 thematic coherence when preferredStrategy is set */
  synergyScore?: number;
  /** Structured cut/add suggestions */
  recommendations?: DeckRecommendations;
  /** Composite 0–100 score (synergy + categories + lint) */
  deckScore?: number;
  /** Brief strengths and weaknesses for agents */
  strengthsAndWeaknesses?: { strengths: string[]; weaknesses: string[] };
  /** Per-card synergy when preferredStrategy is set */
  cardSynergyScores?: CardSynergyScore[];
  /** Top ordered improvement steps (structured) */
  prioritizedActions?: PrioritizedAction[];
  /** Mana base sub-score from lint metrics */
  manaBaseQuality?: ManaBaseQualitySummary;
  /** Curve sub-score from lint metrics */
  curveAnalysis?: CurveAnalysisSummary;
  /** Card names from deckText that did not resolve in cards.db */
  unresolvedCardNames?: string[];
  /** @deprecated Prefer deckScore, prioritizedActions, etc. */
  qualityReport?: DeckQualityReport;
}

/** Compact MCP payload for LLM agents (read before full analysis JSON). */
export interface AgentBrief {
  summary: string;
  commanderName?: string | null;
  decklistText?: string;
  converged?: boolean;
  readyToShip?: boolean;
  synergyScore?: number;
  categoriesBelow?: string[];
  remainingGapCount?: number;
  nextSuggestedAction?: string;
  buildQualityOverall?: 'strong' | 'acceptable' | 'needs_work';
}

export interface DeckRecommendationCut {
  name: string;
  reason: string;
  /** Impact tier for ordering (1 = highest). */
  priority?: number;
  /** Category this cut helps balance. */
  category?: string;
}

export interface DeckRecommendationAdd {
  name: string;
  reason: string;
  category?: string;
  priority?: number;
}

/** Paired cut + add with shared rationale. */
export interface DeckRecommendationSwap {
  cut: string;
  add: string;
  reason: string;
  category?: string;
  priority?: number;
  impact?: 'high' | 'medium' | 'low';
}

/** Thematic 2–3 card package from strategy profile. */
export interface DeckSynergyPackageSuggestion {
  name: string;
  cards: string[];
  reason: string;
  missingCards?: string[];
}

export interface DeckRecommendations {
  cuts: DeckRecommendationCut[];
  adds: DeckRecommendationAdd[];
  swaps?: DeckRecommendationSwap[];
  synergyPackages?: DeckSynergyPackageSuggestion[];
  /** Ordered high-impact actions */
  prioritizedActions?: PrioritizedAction[];
}

/**
 * Complete result from the analyze_deck tool
 */
/** Actionable gap after build/optimize convergence check */
export interface RemainingGap {
  kind: 'category' | 'lint' | 'bracket' | 'banlist' | 'format' | 'synergy';
  detail: string;
  category?: string;
  severity?: 'hard' | 'soft';
}

/** Agent-facing pass/fail gate for deck delivery */
export interface QualityGate {
  /** True when no blocking gaps and convergence checks pass */
  readyToShip: boolean;
  /** True when hard issues and automatable category gaps are resolved */
  converged: boolean;
  /** Must fix before delivery */
  blocking: RemainingGap[];
  /** Optional polish (soft lint, minor synergy) */
  polish: RemainingGap[];
}

export interface AnalyzeDeckResult {
  /** Echo of relevant input parameters */
  input: {
    /** Template ID used (if any) */
    templateId?: string;
    /** Bracket ID used for rules (if any) */
    bracketId?: string;
    /** Stated synergy/theme (if any) */
    preferredStrategy?: string;
    /** Banlist ID used (if any) */
    banlistId?: string;
  };
  /** Deck analysis result */
  analysis: DeckAnalysis;
  /** Parsed deck structure */
  parsedDeck: ParsedDeck;
  /** Copy-paste decklist (mainboard lines) */
  decklistText?: string;
  /** Top-level synergy score (mirrors analysis.synergyScore) */
  synergyScore?: number;
  /** Structured recommendations (mirrors analysis.recommendations) */
  recommendations?: DeckRecommendations;
  /** Composite quality metrics */
  qualityReport?: DeckQualityReport;
  /** Top-level composite score (mirrors analysis.deckScore) */
  deckScore?: number;
  /** Short executive summary for agents */
  summary?: string;
  /** Suggested next MCP tool step */
  nextSuggestedAction?: string;
  /** Same convergence flag as build/optimize when synergy target is met */
  converged?: boolean;
  /** Structured gaps blocking or polishing the deck */
  remainingGaps?: RemainingGap[];
  /** Pass/fail gate for LLM delivery decisions */
  qualityGate?: QualityGate;
  /** Token-efficient summary for LLM agents */
  agentBrief?: AgentBrief;
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
  /** Internal banlist key (default commander); not exposed on MCP tool schema */
  banlistId?: string;
  /** Bracket ID to apply rules from (default: "bracket3") */
  bracketId?: string;
  /** EDHREC theme slug (e.g. tokens, voltron, blink) — boosts EDHREC pool and fill scoring */
  preferredStrategy?: string;
  /** Optional list of additional cards to include in the 99 */
  seedCards?: string[];
  /** Whether to fetch EDHREC suggestions (default: true) */
  useEdhrec?: boolean;
  /** Whether to autofill missing categories using EDHREC suggestions (default: true) */
  useEdhrecAutofill?: boolean;
  /** When true and templateId is bracket3, use template-driven generator (mana_base, categories, EDHREC) instead of skeleton + autofill */
  useTemplateGenerator?: boolean;
  /**
   * When true (default), run EDHREC category autofill in multiple passes until deficits clear or progress stops.
   * Set false for a single autofill pass only (faster, may leave template gaps).
   */
  refineUntilStable?: boolean;
  /** Max autofill passes when refineUntilStable is true (default 5). */
  maxRefinementIterations?: number;
  /** Optional template.meta overrides for the generator (advanced). */
  metaOverride?: Partial<{
    graveyard_meta_share: number;
    fast_combo_density: 'low' | 'mid' | 'high';
    creature_meta_share: number;
  }>;
  /** MCP response size: brief (default) omits heavy analysis fields */
  responseMode?: 'brief' | 'full';
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
  /** Auto-evaluation of build quality (category gaps, bracket, synergy). */
  buildQualityReport?: BuildQualityReport;
  /** Top upgrade suggestions for iterative improvement. */
  suggestedUpgrades?: SuggestedUpgrade[];
  /** Copy-paste mainboard lines */
  decklistText?: string;
  /** True when template/bracket/synergy targets are met */
  converged?: boolean;
  /** Outstanding issues after build */
  remainingGaps?: RemainingGap[];
  /** Suggested next MCP tool step */
  nextSuggestedAction?: string;
  /** Token-efficient summary for LLM agents */
  agentBrief?: AgentBrief;
  /** Short executive summary */
  summary?: string;
  /** Pass/fail gate for LLM delivery (same semantics as analyze_deck) */
  qualityGate?: QualityGate;
}

/** optimize_deck tool input */
export interface OptimizeDeckInput {
  deckText: string;
  commanderName: string;
  preferredStrategy?: string;
  templateId?: string;
  bracketId?: string;
  banlistId?: string;
  maxIterations?: number;
  focusCategories?: string[];
  /** Stop when synergyScore reaches this threshold */
  stopWhenScore?: number;
  /** Card names that must not be cut */
  preserveCards?: string[];
  /** MCP response size: brief (default) omits heavy analysis fields */
  responseMode?: 'brief' | 'full';
}

export interface OptimizeDeckMetrics {
  synergyScore?: number;
  categoriesBelow: number;
  lintHardIssues: number;
}

export interface OptimizeDeckChange {
  type: 'cut' | 'add' | 'swap';
  name: string;
  reason: string;
  /** For swap: card added */
  pairedWith?: string;
}

export interface OptimizeDeckResult {
  input: {
    commanderName: string;
    preferredStrategy?: string;
    templateId?: string;
    bracketId?: string;
    maxIterations?: number;
    focusCategories?: string[];
  };
  deckText: string;
  decklistText: string;
  changes: OptimizeDeckChange[];
  metricsBefore: OptimizeDeckMetrics;
  metricsAfter: OptimizeDeckMetrics;
  analysis: DeckAnalysis;
  iterationNotes: string[];
  converged?: boolean;
  remainingGaps?: RemainingGap[];
  nextSuggestedAction?: string;
  /** Token-efficient summary for LLM agents */
  agentBrief?: AgentBrief;
  summary?: string;
  /** Pass/fail gate for LLM delivery */
  qualityGate?: QualityGate;
}
