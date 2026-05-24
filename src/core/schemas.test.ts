import { describe, it, expect } from "vitest";
import {
  AnalyzeDeckInputSchema,
  SearchCardsInputSchema,
  OptimizeDeckInputSchema,
  GetSynergiesInputSchema,
  EvaluateCardSwapInputSchema,
  GetStrategyGuideInputSchema,
  ResolveCardInputSchema,
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

  it("rejects limit above 100", () => {
    expect(() => SearchCardsInputSchema.parse({ limit: 101, query: "x" })).toThrow();
  });

  it("accepts maxMV alone without query or category", () => {
    const parsed = SearchCardsInputSchema.parse({ maxMV: 3 });
    expect(parsed.maxMV).toBe(3);
    expect(parsed.sortBy).toBe("synergyRelevance");
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

describe("GetStrategyGuideInputSchema", () => {
  it("requires commander and strategy slug", () => {
    const parsed = GetStrategyGuideInputSchema.parse({
      commanderName: "Shadrix Silverquill",
      preferredStrategy: "group-slug",
    });
    expect(parsed.preferredStrategy).toBe("group-slug");
  });
});
