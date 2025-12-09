/**
 * schemas.ts
 * 
 * Zod schemas for MCP server tool validation.
 * These mirror the TypeScript interfaces in types.ts but provide runtime validation.
 */

import { z } from "zod";

/**
 * Schema for analyze_deck tool input
 * 
 * Corresponds to AnalyzeDeckInput interface in types.ts
 */
export const AnalyzeDeckInputSchema = z.object({
  /** Raw decklist text (one card per line with quantity) */
  deckText: z.string().describe("Raw decklist text, one card per line with quantity (e.g., '1 Sol Ring')"),
  
  /** Template ID for deck analysis (optional, defaults to "bracket3") */
  templateId: z.string().optional().describe("Template ID for deck analysis (e.g., 'bracket3')"),
  
  /** Banlist ID (optional, reserved for future use) */
  banlistId: z.string().optional().describe("Banlist ID (e.g., 'commander')"),
  
  /** EDHREC URLs (optional, reserved for future use) */
  edhrecUrls: z.array(z.string()).optional().describe("EDHREC URLs for additional context"),
  
  /** Bracket ID for rule enforcement (optional, defaults to "bracket3") */
  bracketId: z.string().optional().describe("Bracket ID for rule enforcement (e.g., 'bracket3')"),
  
  /** Analysis options */
  options: z.object({
    /** Whether to infer commander from decklist (default: true) */
    inferCommander: z.boolean().optional().describe("Whether to infer commander from decklist"),
    
    /** Language for card names (optional, reserved for future use) */
    language: z.string().optional().describe("Language for card names (e.g., 'en')")
  }).optional().describe("Analysis options")
});

/**
 * Schema for analyze_deck tool output
 * 
 * For now, we treat the result as a generic JSON structure.
 * This can be refined later with more specific zod schemas if needed.
 */
export const AnalyzeDeckResultSchema = z.any().describe("Deck analysis result with categories, warnings, and recommendations");

/**
 * Schema for build_deck_from_commander tool input
 * 
 * Corresponds to BuildDeckInput interface in types.ts
 */
export const BuildDeckInputSchema = z.object({
  /** Commander card name to build around */
  commanderName: z.string().describe("Commander card name (e.g., \"Atraxa, Praetors' Voice\")"),
  
  /** Template ID for deck building (optional, defaults to "bracket3") */
  templateId: z.string().optional().describe("Template ID for deck building (e.g., 'bracket3')"),
  
  /** Banlist ID (optional, reserved for future use) */
  banlistId: z.string().optional().describe("Banlist ID (e.g., 'commander')"),
  
  /** Bracket ID for rule enforcement (optional, defaults to "bracket3") */
  bracketId: z.string().optional().describe("Bracket ID for rule enforcement (e.g., 'bracket3')"),
  
  /** Preferred strategy/theme (optional, reserved for future use) */
  preferredStrategy: z.string().optional().describe("Preferred strategy or theme (e.g., 'tokens', 'voltron')"),
  
  /** Optional seed cards to include in the deck */
  seedCards: z.array(z.string()).optional().describe("Optional seed cards to include (e.g., ['Sol Ring', 'Arcane Signet'])"),
  
  /** Whether to fetch EDHREC suggestions (default: false) */
  useEdhrec: z.boolean().optional().describe("Whether to fetch EDHREC suggestions for card recommendations"),
  
  /** Whether to autofill missing categories using EDHREC (default: false) */
  useEdhrecAutofill: z.boolean().optional().describe("Whether to autofill missing categories (ramp, draw, removal, wipes) using EDHREC suggestions")
});

/**
 * Schema for build_deck_from_commander tool output
 * 
 * For now, we treat the result as a generic JSON structure.
 * This can be refined later with more specific zod schemas if needed.
 */
export const BuildDeckResultSchema = z.any().describe("Built deck with cards, analysis, EDHREC context, and builder notes");

