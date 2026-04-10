import { describe, it, expect } from "vitest";
import { AnalyzeDeckInputSchema } from "./schemas";

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
