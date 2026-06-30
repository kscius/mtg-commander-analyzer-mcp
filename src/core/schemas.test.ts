import { describe, it, expect } from "vitest";
import {
  AnalyzeDeckInputSchema,
  SearchCardsInputSchema,
  OptimizeDeckInputSchema,
  GetSynergiesInputSchema,
  EvaluateCardSwapInputSchema,
  GetStrategyGuideInputSchema,
  ResolveCardInputSchema,
  GetCategoryCandidatesInputSchema,
  ApplyDeckChangesInputSchema,
  GetUserDeckStyleInputSchema,
  BuildCommanderDeckPromptArgsSchema,
  OptimizeDecklistPromptArgsSchema,
  TemplateCategoryNameSchema,
  DECK_TEXT_MAX_LENGTH,
  CARD_NAME_MAX_LENGTH,
  STYLE_QUESTION_MAX_LENGTH,
  SWAPS_MAX_COUNT,
} from "./schemas";

describe("AnalyzeDeckInputSchema", () => {
  it("accepts preferredStrategy and bracketId", () => {
    const parsed = AnalyzeDeckInputSchema.parse({
      deckText: "1 Sol Ring",
      bracketId: "bracket3",
      preferredStrategy: "tokens",
    });
    expect(parsed.preferredStrategy).toBe("tokens");
    expect(parsed.bracketId).toBe("bracket3");
  });

  it("rejects missing deckText", () => {
    expect(() =>
      AnalyzeDeckInputSchema.parse({ bracketId: "bracket3" })
    ).toThrow();
  });
});

describe("SearchCardsInputSchema", () => {
  it("defaults commanderLegal and limit", () => {
    const parsed = SearchCardsInputSchema.parse({ query: "sol ring" });
    expect(parsed.commanderLegal).toBe(true);
    expect(parsed.limit).toBe(20);
  });

  it("rejects empty search (no query, category, type, or colors)", () => {
    expect(() => SearchCardsInputSchema.parse({})).toThrow();
  });

  it("accepts preferredStrategy and commanderName with category filter", () => {
    const parsed = SearchCardsInputSchema.parse({
      category: "ramp",
      preferredStrategy: "tokens",
      commanderName: "Shadrix Silverquill",
    });
    expect(parsed.preferredStrategy).toBe("tokens");
    expect(parsed.commanderName).toContain("Shadrix");
  });

  it("rejects invalid category slugs", () => {
    expect(() =>
      SearchCardsInputSchema.parse({
        category: "card-drawl",
      })
    ).toThrow();
  });

  it("rejects limit above 100", () => {
    expect(() => SearchCardsInputSchema.parse({ limit: 101, query: "x" })).toThrow();
  });

  it("accepts maxMV alone without query or category", () => {
    const parsed = SearchCardsInputSchema.parse({ maxMV: 3 });
    expect(parsed.maxMV).toBe(3);
    expect(parsed.sortBy).toBe("synergyRelevance");
  });

  it("rejects invalid maxMV (negative, NaN, above 20)", () => {
    expect(() => SearchCardsInputSchema.parse({ maxMV: -1 })).toThrow();
    expect(() => SearchCardsInputSchema.parse({ maxMV: Number.NaN })).toThrow();
    expect(() => SearchCardsInputSchema.parse({ maxMV: 21 })).toThrow();
  });

  it("accepts WUBRG colorIdentity and rejects invalid color letters", () => {
    const parsed = SearchCardsInputSchema.parse({
      colorIdentity: ["W", "U", "B"],
    });
    expect(parsed.colorIdentity).toEqual(["W", "U", "B"]);
    expect(() =>
      SearchCardsInputSchema.parse({ colorIdentity: ["X"] })
    ).toThrow();
  });

  it("rejects empty optional commanderName", () => {
    expect(() =>
      SearchCardsInputSchema.parse({ category: "ramp", commanderName: "" })
    ).toThrow();
  });

  it("accepts excludeNames and sortBy", () => {
    const parsed = SearchCardsInputSchema.parse({
      category: "ramp",
      excludeNames: ["Sol Ring"],
      sortBy: "mv",
    });
    expect(parsed.excludeNames).toEqual(["Sol Ring"]);
    expect(parsed.sortBy).toBe("mv");
  });
});

describe("OptimizeDeckInputSchema", () => {
  it("defaults maxIterations and accepts stopWhenScore and preserveCards", () => {
    const parsed = OptimizeDeckInputSchema.parse({
      deckText: "1 Sol Ring",
      commanderName: "Atraxa, Praetors' Voice",
      stopWhenScore: 70,
      preserveCards: ["Sol Ring"],
    });
    expect(parsed.maxIterations).toBe(4);
    expect(parsed.stopWhenScore).toBe(70);
    expect(parsed.preserveCards).toEqual(["Sol Ring"]);
  });

  it("rejects invalid focusCategories entries", () => {
    expect(() =>
      OptimizeDeckInputSchema.parse({
        deckText: "1 Sol Ring",
        commanderName: "Atraxa, Praetors' Voice",
        focusCategories: ["card-drawl"],
      })
    ).toThrow();
  });

  it("accepts valid focusCategories", () => {
    const parsed = OptimizeDeckInputSchema.parse({
      deckText: "1 Sol Ring",
      commanderName: "Atraxa, Praetors' Voice",
      focusCategories: ["card_draw", "ramp"],
    });
    expect(parsed.focusCategories).toEqual(["card_draw", "ramp"]);
  });
});

describe("ResolveCardInputSchema", () => {
  it("requires cardName", () => {
    expect(() => ResolveCardInputSchema.parse({})).toThrow();
    const parsed = ResolveCardInputSchema.parse({ cardName: "Sol Ring" });
    expect(parsed.cardName).toBe("Sol Ring");
  });
});

describe("GetSynergiesInputSchema", () => {
  it("requires commanderName", () => {
    expect(() => GetSynergiesInputSchema.parse({})).toThrow();
    const parsed = GetSynergiesInputSchema.parse({ commanderName: "Atraxa, Praetors' Voice" });
    expect(parsed.commanderName).toContain("Atraxa");
  });
});

describe("EvaluateCardSwapInputSchema", () => {
  it("requires swap fields", () => {
    expect(() => EvaluateCardSwapInputSchema.parse({ deckText: "1 Sol Ring" })).toThrow();
    const parsed = EvaluateCardSwapInputSchema.parse({
      deckText: "1 Sol Ring\n1 Command Tower",
      commanderName: "Atraxa, Praetors' Voice",
      cardToRemove: "Sol Ring",
      cardToAdd: "Arcane Signet",
    });
    expect(parsed.cardToRemove).toBe("Sol Ring");
    expect(parsed.templateId).toBe("bracket3");
  });
});

describe("TemplateCategoryNameSchema", () => {
  it("accepts valid bracket3 category names", () => {
    expect(TemplateCategoryNameSchema.parse("card_draw")).toBe("card_draw");
    expect(TemplateCategoryNameSchema.parse("spot_removal")).toBe("spot_removal");
  });

  it("rejects typos and unknown categories", () => {
    expect(() => TemplateCategoryNameSchema.parse("card-drawl")).toThrow();
    expect(() => TemplateCategoryNameSchema.parse("draw")).toThrow();
  });
});

describe("GetCategoryCandidatesInputSchema", () => {
  it("rejects invalid category slugs", () => {
    expect(() =>
      GetCategoryCandidatesInputSchema.parse({
        commanderName: "Atraxa, Praetors' Voice",
        category: "card-drawl",
      })
    ).toThrow();
  });
});

describe("GetStrategyGuideInputSchema", () => {
  it("requires commander and strategy slug", () => {
    const parsed = GetStrategyGuideInputSchema.parse({
      commanderName: "Shadrix Silverquill",
      preferredStrategy: "group-slug",
    });
    expect(parsed.preferredStrategy).toBe("group-slug");
  });
});

describe("MCP input bounds (DoS guards)", () => {
  it("rejects deckText above max length", () => {
    const oversized = "x".repeat(DECK_TEXT_MAX_LENGTH + 1);
    expect(() =>
      AnalyzeDeckInputSchema.parse({ deckText: oversized })
    ).toThrow();
  });

  it("rejects path-like preferredStrategy on analyze_deck", () => {
    expect(() =>
      AnalyzeDeckInputSchema.parse({
        deckText: "1 Sol Ring",
        preferredStrategy: "../../../.env",
      })
    ).toThrow();
  });

  it("rejects swaps above max count", () => {
    const swaps = Array.from({ length: SWAPS_MAX_COUNT + 1 }, (_, i) => ({
      remove: `Card A${i}`,
      add: `Card B${i}`,
    }));
    expect(() =>
      ApplyDeckChangesInputSchema.parse({
        deckText: "1 Sol Ring",
        swaps,
      })
    ).toThrow();
  });

  it("rejects card names above max length on resolve_card", () => {
    expect(() =>
      ResolveCardInputSchema.parse({
        cardName: "x".repeat(CARD_NAME_MAX_LENGTH + 1),
      })
    ).toThrow();
  });

  it("rejects oversized OpenAI question on get_user_deck_style", () => {
    expect(() =>
      GetUserDeckStyleInputSchema.parse({
        useOpenAI: true,
        question: "q".repeat(STYLE_QUESTION_MAX_LENGTH + 1),
      })
    ).toThrow();
  });

  it("accepts swaps at max count", () => {
    const swaps = Array.from({ length: SWAPS_MAX_COUNT }, (_, i) => ({
      remove: `Cut${i}`,
      add: `Add${i}`,
    }));
    const parsed = ApplyDeckChangesInputSchema.parse({
      deckText: "1 Sol Ring",
      swaps,
    });
    expect(parsed.swaps).toHaveLength(SWAPS_MAX_COUNT);
  });
});

describe("MCP prompt argument schemas", () => {
  it("build-commander-deck accepts optional preferredStrategy", () => {
    const parsed = BuildCommanderDeckPromptArgsSchema.parse({
      commanderName: "Shadrix Silverquill",
    });
    expect(parsed.preferredStrategy).toBeUndefined();
  });

  it("optimize-decklist requires preferredStrategy slug", () => {
    expect(() =>
      OptimizeDecklistPromptArgsSchema.parse({
        commanderName: "Shadrix Silverquill",
      })
    ).toThrow();
  });

  it("optimize-decklist rejects oversized deckText", () => {
    expect(() =>
      OptimizeDecklistPromptArgsSchema.parse({
        commanderName: "Shadrix Silverquill",
        preferredStrategy: "group-slug",
        deckText: "x".repeat(DECK_TEXT_MAX_LENGTH + 1),
      })
    ).toThrow();
  });
});
