import { describe, expect, it } from 'vitest';
import {
  checkDeckForBannedCards,
  filterBannedCards,
  getBannedCards,
  getBannedCount,
  isBanned,
  isBanlistAvailable,
  reloadBanlist,
} from './banlist';

describe('banlist', () => {
  it('loads the project banlist from data/Banlist.txt', () => {
    expect(isBanlistAvailable()).toBe(true);
    expect(getBannedCount()).toBeGreaterThan(0);
  });

  it('matches card names case-insensitively with surrounding whitespace', () => {
    expect(isBanned('  black lotus  ')).toBe(true);
    expect(isBanned('BLACK LOTUS')).toBe(true);
    expect(isBanned('Sol Ring')).toBe(false);
  });

  it('filterBannedCards returns only banned names from a mixed list', () => {
    const banned = filterBannedCards(['Sol Ring', 'Mana Crypt', 'Island', 'Dockside Extortionist']);
    expect(banned).toContain('Mana Crypt');
    expect(banned).toContain('Dockside Extortionist');
    expect(banned).not.toContain('Sol Ring');
    expect(banned).not.toContain('Island');
  });

  it('checkDeckForBannedCards preserves quantity for banned entries', () => {
    const hits = checkDeckForBannedCards([
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Mana Crypt', quantity: 1 },
    ]);
    expect(hits).toEqual([{ name: 'Mana Crypt', quantity: 1 }]);
  });

  it('reloadBanlist refreshes cache without changing membership', () => {
    const before = getBannedCards().slice().sort();
    reloadBanlist();
    const after = getBannedCards().slice().sort();
    expect(after).toEqual(before);
    expect(isBanned('Mana Crypt')).toBe(true);
  });
});
