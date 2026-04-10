import { describe, expect, it } from "vitest";
import { parseDeckText } from "./deckParser";

describe("parseDeckText", () => {
  it("parses quantity and card name per line", () => {
    const deck = parseDeckText("1 Sol Ring\n2 Island");
    expect(deck.cards).toHaveLength(2);
    expect(deck.cards[0]).toMatchObject({ quantity: 1, name: "Sol Ring" });
    expect(deck.cards[1]).toMatchObject({ quantity: 2, name: "Island" });
  });

  it("ignores blank lines", () => {
    const deck = parseDeckText("1 Forest\n\n1 Mountain");
    expect(deck.cards).toHaveLength(2);
  });

  it("skips lines that do not match the pattern", () => {
    const deck = parseDeckText("not a card line\n1 Plains");
    expect(deck.cards).toHaveLength(1);
    expect(deck.cards[0].name).toBe("Plains");
  });

  it("returns commanderName null (not yet detected)", () => {
    expect(parseDeckText("1 Commander").commanderName).toBeNull();
  });
});
