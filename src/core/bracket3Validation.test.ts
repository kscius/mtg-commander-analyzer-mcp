import { describe, expect, it } from "vitest";
import type { ComboDef } from "./types";
import {
  countByTag,
  validateBracket3,
  validateTwoCardCombosBeforeT6,
} from "./bracket3Validation";

describe("countByTag", () => {
  it("counts occurrences per tag", () => {
    const counts = countByTag([
      { name: "A", tags: ["game_changer"] },
      { name: "B", tags: ["game_changer", "extra_turn"] },
    ]);
    expect(counts.game_changer).toBe(2);
    expect(counts.extra_turn).toBe(1);
  });

  it("handles missing tags", () => {
    expect(countByTag([{ name: "X" }])).toEqual({});
  });
});

describe("validateBracket3", () => {
  it("errors when game changers exceed policy", () => {
    const deck = Array.from({ length: 4 }, (_, i) => ({
      name: `Card ${i}`,
      tags: ["game_changer"],
    }));
    const r = validateBracket3(deck, { max_game_changers: 3 });
    expect(r.errors.some((e) => e.includes("Game Changers"))).toBe(true);
  });

  it("passes when within limits", () => {
    const r = validateBracket3(
      [{ name: "One GC", tags: ["game_changer"] }],
      { max_game_changers: 3 }
    );
    expect(r.errors).toHaveLength(0);
  });
});

describe("validateTwoCardCombosBeforeT6", () => {
  const combo: ComboDef = {
    id: "test-combo",
    pieces: ["Pact of Negation", "Thassa's Oracle"],
    size: 2,
    turnFloor: 1,
  };

  it("returns error when both pieces are in deck and turnFloor < limit", () => {
    const deck = [
      { name: "Pact of Negation" },
      { name: "Thassa's Oracle" },
    ];
    const errors = validateTwoCardCombosBeforeT6(deck, [combo], 6);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("test-combo");
  });

  it("returns empty when combo turnFloor >= limit", () => {
    const highFloor: ComboDef = { ...combo, turnFloor: 6 };
    const deck = [
      { name: "Pact of Negation" },
      { name: "Thassa's Oracle" },
    ];
    expect(validateTwoCardCombosBeforeT6(deck, [highFloor], 6)).toHaveLength(0);
  });
});
