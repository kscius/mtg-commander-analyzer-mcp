import { describe, expect, it } from 'vitest';
import { getCardByName, landFitsCommanderManabase } from './scryfall';

const monoU = ['U'];

describe('landFitsCommanderManabase (mono-U)', () => {
  it('accepts Island and fetchlands that can find Island', () => {
    for (const name of ['Island', 'Polluted Delta', 'Misty Rainforest', 'Flooded Strand', 'Scalding Tarn']) {
      const c = getCardByName(name);
      expect(c, name).toBeTruthy();
      expect(landFitsCommanderManabase(c!, monoU), name).toBe(true);
    }
  });

  it('rejects enemy fetches that cannot find a basic Island', () => {
    for (const name of [
      'Bloodstained Mire',
      'Marsh Flats',
      'Arid Mesa',
      'Verdant Catacombs',
      'Windswept Heath',
      'Wooded Foothills',
    ]) {
      const c = getCardByName(name);
      expect(c, name).toBeTruthy();
      expect(landFitsCommanderManabase(c!, monoU), name).toBe(false);
    }
  });

  it('rejects lands with off-color mana abilities when CI is empty in DB', () => {
    const c = getCardByName('Rocky Tar Pit');
    expect(c).toBeTruthy();
    expect(landFitsCommanderManabase(c!, monoU)).toBe(false);
  });

  it('accepts Prismatic Vista and Evolving Wilds (basic land tutors)', () => {
    for (const name of ['Prismatic Vista', 'Evolving Wilds', 'Terramorphic Expanse']) {
      const c = getCardByName(name);
      expect(c, name).toBeTruthy();
      expect(landFitsCommanderManabase(c!, monoU), name).toBe(true);
    }
  });
});
