import { DeckAnalysis, DeckTemplate, TemplateCategoryConfig } from "./types";

/**
 * Represents a category deficit (difference between current count and minimum required)
 */
export interface CategoryDeficit {
  /** Category name (e.g., "ramp") */
  name: string;
  /** Current count of cards in this category */
  current: number;
  /** Recommended minimum count (from template) */
  min?: number;
  /** Recommended maximum count (from template) */
  max?: number;
  /** Deficit: max(0, (min ?? 0) - current) */
  deficit: number;
}

/**
 * Computes category deficits by comparing current deck analysis against template recommendations
 * 
 * @param analysis - Current deck analysis with category counts
 * @param template - Deck template with category recommendations
 * @param categoryNames - List of category names to check for deficits
 * @returns Array of CategoryDeficit objects showing how many cards are needed per category
 * 
 * @example
 * ```ts
 * const deficits = computeCategoryDeficits(
 *   analysis,
 *   template,
 *   ["ramp", "card_draw", "target_removal", "board_wipes"]
 * );
 * // Returns deficits for each category, e.g.:
 * // [
 * //   { name: "ramp", current: 2, min: 8, deficit: 6 },
 * //   { name: "card_draw", current: 1, min: 8, deficit: 7 }
 * // ]
 * ```
 */
export function computeCategoryDeficits(
  analysis: DeckAnalysis,
  template: DeckTemplate,
  categoryNames: string[]
): CategoryDeficit[] {
  const deficits: CategoryDeficit[] = [];

  for (const categoryName of categoryNames) {
    // Find current count from analysis
    const categorySummary = analysis.categories.find(c => c.name === categoryName);
    const currentCount = categorySummary?.count ?? 0;

    // Find template config for this category
    const templateConfig = template.categories.find(c => c.name === categoryName);
    const min = templateConfig?.min;
    const max = templateConfig?.max;

    // Compute deficit: how many cards short of minimum?
    const deficit = Math.max(0, (min ?? 0) - currentCount);

    deficits.push({
      name: categoryName,
      current: currentCount,
      min,
      max,
      deficit
    });
  }

  return deficits;
}

