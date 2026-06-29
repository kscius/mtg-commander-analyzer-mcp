import { describe, expect, it } from 'vitest';
import { appendBuiltCardEntry } from './templateDeckGenerator';
import { getDefaultBracket3Options } from './autoTags';
import { sumLandQuantity, sumNonlandQuantity } from './manabaseLandHeuristics';
import { getCardByName } from './scryfall';
import type { BuiltCardEntry } from './types';

describe('appendBuiltCardEntry', () => {
  const tagOpts = getDefaultBracket3Options('bracket3');

  it('stacks quantity for basic lands instead of rejecting duplicates', () => {
    const builtCards: BuiltCardEntry[] = [];
    const cardsInDeck = new Set<string>();

    expect(appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts)).toBe(true);
    expect(appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts)).toBe(true);
    expect(appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts)).toBe(true);

    expect(builtCards).toHaveLength(1);
    expect(builtCards[0]?.name).toBe('Island');
    expect(builtCards[0]?.quantity).toBe(3);
    expect(cardsInDeck.has('island')).toBe(true);
  });

  it('rejects duplicate non-basic cards', () => {
    const builtCards: BuiltCardEntry[] = [];
    const cardsInDeck = new Set<string>();

    expect(appendBuiltCardEntry(builtCards, cardsInDeck, 'Sol Ring', [], tagOpts)).toBe(true);
    expect(appendBuiltCardEntry(builtCards, cardsInDeck, 'Sol Ring', [], tagOpts)).toBe(false);

    expect(builtCards).toHaveLength(1);
    expect(builtCards[0]?.quantity).toBe(1);
  });

  it('seed land budgeting uses quantity not entry count', () => {
    const builtCards: BuiltCardEntry[] = [];
    const cardsInDeck = new Set<string>();

    appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts);
    appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts);
    appendBuiltCardEntry(builtCards, cardsInDeck, 'Island', ['U'], tagOpts);
    appendBuiltCardEntry(builtCards, cardsInDeck, 'Sol Ring', [], tagOpts);

    expect(builtCards).toHaveLength(2);
    expect(sumLandQuantity(builtCards, getCardByName)).toBe(3);
    expect(sumNonlandQuantity(builtCards, getCardByName)).toBe(1);
  });
});
