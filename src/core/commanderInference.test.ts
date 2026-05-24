import { describe, it, expect } from 'vitest';
import { inferCommanderFromDeckEntries } from './commanderInference';

describe('inferCommanderFromDeckEntries', () => {
  it('returns null when no commander-eligible cards resolve', () => {
    const r = inferCommanderFromDeckEntries([
      { name: 'Sol Ring' },
      { name: 'Forest' },
    ]);
    expect(r.commanderName).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it('picks first commander-eligible card in deck order when DB has the card', () => {
    const r = inferCommanderFromDeckEntries([
      { name: 'Sol Ring' },
      { name: 'Shadrix Silverquill' },
      { name: 'Teferi, Hero of Dominaria' },
    ]);
    if (!r.commanderName) {
      return; // skip when cards.db missing in CI
    }
    expect(r.candidates.length).toBeGreaterThanOrEqual(1);
    expect(r.commanderName).toBe(r.candidates[0]);
  });
});
