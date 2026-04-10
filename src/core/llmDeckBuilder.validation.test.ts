import { describe, expect, it } from 'vitest';
import { validateLlmGeneratedDeck, isBasicLandName } from './llmDeckBuilder';
import { getBannedCards } from './banlist';
import { getCardByName } from './scryfall';

describe('isBasicLandName', () => {
  it('recognizes English basics case-insensitively', () => {
    expect(isBasicLandName('Plains')).toBe(true);
    expect(isBasicLandName('plains')).toBe(true);
    expect(isBasicLandName('Sol Ring')).toBe(false);
  });
});

describe('validateLlmGeneratedDeck', () => {
  it('rejects wrong card count', () => {
    const r = validateLlmGeneratedDeck([], [], new Set());
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('expected 99'))).toBe(true);
  });

  it('rejects duplicate non-basic cards', () => {
    const cards: string[] = [];
    cards.push('Sol Ring', 'Sol Ring');
    for (let i = 2; i < 99; i++) {
      cards.push(`__UniquePlaceholder${i}`);
    }
    const r = validateLlmGeneratedDeck(cards, [], new Set());
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('allows multiple copies of the same basic land name', () => {
    const cards = Array.from({ length: 99 }, () => 'Island');
    const r = validateLlmGeneratedDeck(cards, ['U'], new Set());
    expect(r.errors.filter((e) => e.includes('Duplicate'))).toHaveLength(0);
  });

  it('rejects a banned card', () => {
    const banned = getBannedCards();
    expect(banned.length).toBeGreaterThan(0);
    const bannedLower = new Set(banned.map((c) => c.toLowerCase()));
    const b0 = banned[0];
    const bData = getCardByName(b0);
    const ci = bData?.color_identity ?? ['W', 'U', 'B', 'R', 'G'];
    const cards: string[] = [];
    cards.push(b0);
    for (let i = 1; i < 99; i++) {
      cards.push(`__UniquePlaceholder${i}`);
    }
    const r = validateLlmGeneratedDeck(cards, ci, bannedLower);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Banned'))).toBe(true);
  });
});
