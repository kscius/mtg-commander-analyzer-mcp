import { describe, expect, it } from "vitest";
import type { ComboDef } from "./types";
import {
  countByTag,
  validateBracket3,
  validateTwoCardCombosBeforeT6,
  remediateBracket3Violations,
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
    expect(r.errors.some((e) => /Game Changer/i.test(e))).toBe(true);
    expect(r.violations.some((v) => v.policy === 'max_game_changers')).toBe(true);
  });

  it("passes when within limits", () => {
    const r = validateBracket3(
      [{ name: "One GC", tags: ["game_changer"] }],
      { max_game_changers: 3 }
    );
    expect(r.errors).toHaveLength(0);
  });

  it("errors when extra turn cards exceed policy", () => {
    const deck = Array.from({ length: 4 }, (_, i) => ({
      name: `Extra Turn ${i}`,
      tags: ["extra_turn"],
    }));
    const r = validateBracket3(deck, { max_extra_turn_cards: 3 });
    expect(r.errors.some((e) => /extra-turn card/i.test(e))).toBe(true);
  });

  it("errors when mass land denial is present", () => {
    const r = validateBracket3(
      [{ name: "Armageddon", tags: ["mass_land_denial"] }],
      { ban_mass_land_denial: true }
    );
    expect(r.errors.some((e) => /Mass land denial/i.test(e))).toBe(true);
  });

  it("warns on possible extra-turn chaining when copy/recursion density is high", () => {
    const deck = [
      { name: "Time Warp", tags: ["extra_turn"] },
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `Copy ${i}`,
        tags: ["spell_copy"],
      })),
    ];
    const r = validateBracket3(deck, {
      max_extra_turn_cards: 3,
      ban_extra_turn_chains: true,
    });
    expect(r.warnings.some((w) => /extra-turn chain/i.test(w))).toBe(true);
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
    expect(errors[0]).toContain("Banned 2-card combo");
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

describe("remediateBracket3Violations", () => {
  it("removes excess game changers", () => {
    const deck = Array.from({ length: 4 }, (_, i) => ({
      name: `GC ${i}`,
      tags: ["game_changer"],
    }));
    const { deck: fixed, removed } = remediateBracket3Violations(deck, {
      max_game_changers: 3,
    });
    expect(fixed.filter((c) => c.tags?.includes("game_changer"))).toHaveLength(3);
    expect(removed).toHaveLength(1);
  });
});
