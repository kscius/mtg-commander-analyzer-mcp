import { describe, expect, it } from 'vitest';
import {
  analyzeUserDeckFromText,
  buildUserDeckStyleProfile,
  type UserDeckIndexEntry,
} from './userDeckLibrary';

const SAMPLE_ENTRY: UserDeckIndexEntry = {
  name: 'Test Deck',
  publicId: 'test-id',
  sourceUrl: 'https://moxfield.com/decks/test-id',
  txtFile: 'data/my_decks/test.txt',
};

describe('userDeckLibrary', () => {
  it('parses commander line and counts categories from deck text', () => {
    const text = `Commander: Sol Ring
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Island
1 Forest
1 Cultivate
1 Rampant Growth
1 Brainstorm
1 Swords to Plowshares
`;

    const snap = analyzeUserDeckFromText(SAMPLE_ENTRY, text);
    expect(snap).not.toBeNull();
    expect(snap!.commanderName).toBe('Sol Ring');
    expect(snap!.landCount).toBeGreaterThanOrEqual(3);
    expect(snap!.categoryCounts.ramp ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('aggregates land count averages across snapshots', () => {
    const a = analyzeUserDeckFromText(SAMPLE_ENTRY, `Commander: X\n1 Island\n1 Forest\n1 Command Tower\n1 Sol Ring\n`);
    const b = analyzeUserDeckFromText(
      { ...SAMPLE_ENTRY, publicId: 'b' },
      `Commander: Y\n1 Mountain\n1 Swamp\n1 Command Tower\n1 Arcane Signet\n1 Path to Exile\n`
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const profile = buildUserDeckStyleProfile([a!, b!]);
    expect(profile.deckCount).toBe(2);
    expect(profile.landCount.avg).toBeGreaterThan(0);
    expect(profile.topLandStaples.some((s) => s.name === 'Command Tower')).toBe(true);
  });
});
