/**
 * brackets.ts
 * 
 * Bracket rules loader and cache.
 * Brackets define play restrictions and guidelines for Commander format variations.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Bracket rules configuration
 */
export interface BracketRules {
  /** Bracket identifier (e.g., "bracket3") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Maximum number of game-changing cards allowed */
  maxGameChangers: number;
  /** Whether mass land destruction is allowed */
  allowMassLandDestruction: boolean;
  /** Whether infinite two-card combos are allowed before turn six */
  allowInfiniteTwoCardCombosBeforeTurnSix: boolean;
  /** Maximum number of extra turn cards allowed */
  maxExtraTurnCards?: number;
}

/**
 * Structure of the bracket-rules.json file
 */
interface BracketRulesData {
  brackets: Record<string, BracketRules>;
}

/**
 * Cache for loaded bracket rules
 */
let bracketRulesCache: BracketRulesData | null = null;

/**
 * Loads all bracket rules from bracket-rules.json
 * 
 * @returns BracketRulesData with all bracket configurations
 * @throws Error if bracket-rules.json cannot be loaded
 */
function loadBracketRulesData(): BracketRulesData {
  if (bracketRulesCache) {
    return bracketRulesCache;
  }

  try {
    // Resolve path relative to compiled output (dist/core)
    // Path: dist/core -> dist -> project root -> data
    const filePath = path.join(__dirname, '..', '..', 'data', 'bracket-rules.json');

    // Read and parse the bracket rules file
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as BracketRulesData;

    // Validate basic structure
    if (!data.brackets || typeof data.brackets !== 'object') {
      throw new Error('Invalid bracket-rules.json structure: missing "brackets" object');
    }

    // Cache the data
    bracketRulesCache = data;

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load bracket rules: ${error.message}\n` +
        `Make sure data/bracket-rules.json exists and is valid.`
      );
    }
    throw error;
  }
}

/**
 * Loads bracket rules for a specific bracket ID
 * 
 * @param bracketId - Bracket identifier (e.g., "bracket3")
 * @returns BracketRules for the specified bracket
 * @throws Error if bracket ID is not found
 * 
 * @example
 * ```typescript
 * const rules = loadBracketRules("bracket3");
 * console.log(rules.maxGameChangers); // 3
 * console.log(rules.allowMassLandDestruction); // false
 * ```
 */
export function loadBracketRules(bracketId: string): BracketRules {
  const data = loadBracketRulesData();

  if (!data.brackets[bracketId]) {
    throw new Error(
      `Bracket "${bracketId}" not found in bracket-rules.json.\n` +
      `Available brackets: ${Object.keys(data.brackets).join(', ')}`
    );
  }

  return data.brackets[bracketId];
}

/**
 * Clears the bracket rules cache (useful for testing)
 */
export function clearBracketRulesCache(): void {
  bracketRulesCache = null;
}

