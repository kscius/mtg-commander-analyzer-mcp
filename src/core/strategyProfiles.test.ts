import { describe, it, expect } from "vitest";
import {
  strategyCategoryPickBonus,
  strategyAntisynergyPenalty,
  getStrategyProfile,
  clearStrategyDataCache,
} from "./strategyProfiles";

describe("strategyProfiles", () => {
  it("loads tokens profile and scores mass protection", () => {
    clearStrategyDataCache();
    const profile = getStrategyProfile("tokens");
    expect(profile?.preferredCategories?.protection).toBeDefined();
    const bonus = strategyCategoryPickBonus(
      "protection",
      "Creatures you control gain hexproof until end of turn.",
      "tokens"
    );
    expect(bonus).toBeGreaterThan(0);
  });

  it("penalizes antisynergy patterns for tokens", () => {
    clearStrategyDataCache();
    const penalty = strategyAntisynergyPenalty(
      "Sacrifice all creatures.",
      "tokens"
    );
    expect(penalty).toBeGreaterThan(0);
  });

  it("does not penalize self lifegain payoffs for group-slug", () => {
    clearStrategyDataCache();
    const bondPenalty = strategyAntisynergyPenalty(
      "Whenever you gain life, each opponent loses 1 life.",
      "group-slug"
    );
    expect(bondPenalty).toBe(0);
    const symmetricPenalty = strategyAntisynergyPenalty(
      "Each opponent gains 3 life.",
      "group-slug"
    );
    expect(symmetricPenalty).toBeGreaterThan(0);
  });
});
