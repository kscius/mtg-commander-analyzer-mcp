import { describe, expect, it } from 'vitest';
import { getCardByName, fitsColorIdentity } from './scryfall';
import {
  findColorIdentityViolations,
  findSingletonViolations,
  findIllegalCards,
  isBasicLandName,
  COMMANDER_MAINBOARD_SIZE,
} from './commanderFormat';

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
