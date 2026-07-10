import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBracketCardListsCache,
  isExtraTurnCard,
  isGameChanger,
  isMassLandDenial,
} from './bracketCards';

describe('bracketCards', () => {
  afterEach(() => {
    clearBracketCardListsCache();
  });

  describe('isGameChanger', () => {
    it('returns true for known Bracket 3 game changers (case-insensitive)', () => {
      expect(isGameChanger('Drannith Magistrate', 'bracket3')).toBe(true);
      expect(isGameChanger('  demonic tutor  ', 'bracket3')).toBe(true);
      expect(isGameChanger('ENLIGHTENED TUTOR', 'bracket3')).toBe(true);
    });

    it('returns false for staples that are not game changers', () => {
      expect(isGameChanger('Sol Ring', 'bracket3')).toBe(false);
      expect(isGameChanger('Arcane Signet', 'bracket3')).toBe(false);
      expect(isGameChanger('Command Tower', 'bracket3')).toBe(false);
    });

    it('returns false when bracket lists cannot be loaded', () => {
      expect(isGameChanger('Drannith Magistrate', 'bracket99-missing')).toBe(false);
    });
  });

  describe('isMassLandDenial', () => {
    it('returns true for known MLD cards', () => {
      expect(isMassLandDenial('Armageddon', 'bracket3')).toBe(true);
      expect(isMassLandDenial('ravages of war', 'bracket3')).toBe(true);
      expect(isMassLandDenial('Obliterate', 'bracket3')).toBe(true);
    });

    it('returns false for non-MLD interaction', () => {
      expect(isMassLandDenial('Swords to Plowshares', 'bracket3')).toBe(false);
      expect(isMassLandDenial('Cyclonic Rift', 'bracket3')).toBe(false);
    });
  });

  describe('isExtraTurnCard', () => {
    it('returns true for known extra-turn cards', () => {
      expect(isExtraTurnCard('Time Warp', 'bracket3')).toBe(true);
      expect(isExtraTurnCard('nexus of fate', 'bracket3')).toBe(true);
      expect(isExtraTurnCard('Expropriate', 'bracket3')).toBe(true);
    });

    it('returns false for non-extra-turn cards', () => {
      expect(isExtraTurnCard('Sol Ring', 'bracket3')).toBe(false);
      expect(isExtraTurnCard('Demonic Tutor', 'bracket3')).toBe(false);
    });
  });

  it('caches lists across calls until clearBracketCardListsCache', () => {
    expect(isGameChanger('Humility', 'bracket3')).toBe(true);
    expect(isMassLandDenial('Jokulhaups', 'bracket3')).toBe(true);
    clearBracketCardListsCache();
    expect(isExtraTurnCard('Temporal Manipulation', 'bracket3')).toBe(true);
  });
});
