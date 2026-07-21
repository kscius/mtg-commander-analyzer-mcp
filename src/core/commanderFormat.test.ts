import { describe, expect, it } from 'vitest';
import { getCardByName, fitsColorIdentity } from './scryfall';
import {
  findColorIdentityViolations,
  findSingletonViolations,
  findIllegalCards,
  isBasicLandName,
  enforceMainboardSize,
  COMMANDER_MAINBOARD_SIZE,
} from './commanderFormat';
import type { BuiltCardEntry } from './types';

describe('commanderFormat', () => {
  it('flags off-color cards for mono-U commander', () => {
    const island = getCardByName('Island');
    const bolt = getCardByName('Lightning Bolt');
    expect(island).toBeTruthy();
    expect(bolt).toBeTruthy();
    expect(fitsColorIdentity(island!, ['U'])).toBe(true);
    expect(fitsColorIdentity(bolt!, ['U'])).toBe(false);

    const violations = findColorIdentityViolations(
      [{ name: 'Lightning Bolt', quantity: 1, rawLine: '1 Lightning Bolt' }],
      ['U']
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('Lightning Bolt');
  });

  it('exports 99-card mainboard constant', () => {
    expect(COMMANDER_MAINBOARD_SIZE).toBe(99);
  });

  describe('enforceMainboardSize', () => {
    const sumQty = (cards: BuiltCardEntry[]) => cards.reduce((s, c) => s + c.quantity, 0);

    it('trims stacked basic quantity when entry count is under 99 but total quantity exceeds target', () => {
      // Failure mode of builtCards.slice(0, 99): few entries, high basic stacks → oversize mainboard.
      const cards: BuiltCardEntry[] = [
        { name: 'Island', quantity: 40, roles: ['land'] },
        { name: 'Swamp', quantity: 40, roles: ['land'] },
        { name: 'Sol Ring', quantity: 1, roles: ['ramp'] },
        { name: 'Arcane Signet', quantity: 1, roles: ['ramp'] },
        { name: 'Counterspell', quantity: 1, roles: ['interaction'] },
      ];
      expect(cards).toHaveLength(5);
      expect(sumQty(cards)).toBe(83);

      const oversize: BuiltCardEntry[] = [
        ...cards,
        { name: 'Mountain', quantity: 30, roles: ['land'] },
      ];
      expect(oversize).toHaveLength(6);
      expect(sumQty(oversize)).toBe(113);
      // Entry-count slice would keep all 6 rows (6 < 99) and ship 113 cards:
      expect(oversize.slice(0, 99)).toHaveLength(6);
      expect(sumQty(oversize.slice(0, 99))).toBe(113);

      const { cards: sized, trimmed, padded } = enforceMainboardSize(oversize, 99, ['U', 'B', 'R']);
      expect(sumQty(sized)).toBe(99);
      expect(trimmed).toBe(14);
      expect(padded).toBe(0);
      expect(sized.find((c) => c.name === 'Mountain')?.quantity).toBe(16);
    });

    it('trims trailing singleton entries when more than 99 unique cards', () => {
      const cards: BuiltCardEntry[] = Array.from({ length: 105 }, (_, i) => ({
        name: `Card ${i + 1}`,
        quantity: 1,
        roles: ['value'],
      }));
      const { cards: sized, trimmed, padded } = enforceMainboardSize(cards, 99, ['U']);
      expect(sized).toHaveLength(99);
      expect(sumQty(sized)).toBe(99);
      expect(trimmed).toBe(6);
      expect(padded).toBe(0);
      expect(sized[sized.length - 1]?.name).toBe('Card 99');
    });

    it('pads with commander-color basics when under target', () => {
      const cards: BuiltCardEntry[] = [
        { name: 'Sol Ring', quantity: 1, roles: ['ramp'] },
        { name: 'Island', quantity: 5, roles: ['land'] },
      ];
      const { cards: sized, trimmed, padded } = enforceMainboardSize(cards, 10, ['U', 'B']);
      expect(sumQty(sized)).toBe(10);
      expect(trimmed).toBe(0);
      expect(padded).toBe(4);
      expect(sized.find((c) => c.name === 'Island')?.quantity).toBeGreaterThanOrEqual(5);
      const basicNames = sized.filter((c) => isBasicLandName(c.name)).map((c) => c.name);
      expect(basicNames.every((n) => n === 'Island' || n === 'Swamp')).toBe(true);
    });

    it('is a no-op when quantity already equals target', () => {
      const cards: BuiltCardEntry[] = [
        { name: 'Island', quantity: 50, roles: ['land'] },
        { name: 'Swamp', quantity: 49, roles: ['land'] },
      ];
      const { cards: sized, trimmed, padded } = enforceMainboardSize(cards, 99, ['U', 'B']);
      expect(sumQty(sized)).toBe(99);
      expect(trimmed).toBe(0);
      expect(padded).toBe(0);
    });
  });

  it('detects singleton violations except basics', () => {
    expect(isBasicLandName('Island')).toBe(true);
    const v = findSingletonViolations([
      { name: 'Sol Ring', quantity: 2, rawLine: '2 Sol Ring' },
      { name: 'Island', quantity: 3, rawLine: '3 Island' },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].name).toBe('Sol Ring');
  });

  it('flags not_legal commander cards when legality present', () => {
    const card = getCardByName('Chaos Orb');
    if (!card?.legalities?.commander) {
      return;
    }
    const illegal = findIllegalCards([{ name: card.name, quantity: 1, rawLine: '1' }]);
    if (card.legalities.commander === 'not_legal') {
      expect(illegal.length).toBeGreaterThan(0);
    }
  });
});
