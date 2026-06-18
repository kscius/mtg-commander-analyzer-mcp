import { describe, expect, it } from 'vitest';
import { applyDeckSwaps } from './deckMutations';
import { minimalDeckText } from '../../test/helpers/minimalDeck';
import { hasCardsDatabase } from '../../test/helpers/dbAvailability';

describe('applyDeckSwaps', () => {
  it('applies a swap when cards resolve', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Sol Ring', add: 'Fellwar Stone' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );

    expect(result.applied.length).toBe(1);
    expect(result.totalCards).toBe(99);
    expect(result.decklistText).toContain('Fellwar Stone');
    expect(result.decklistText).not.toMatch(/^1 Sol Ring$/m);
  });

  it('skips when add card is already in deck', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Arcane Signet', add: 'Sol Ring' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );
    expect(result.skipped.some((s) => s.reason.includes('already in deck'))).toBe(true);
  });

  it('skips when add card is on the banlist', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Sol Ring', add: 'Mana Crypt' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        remove: 'Sol Ring',
        add: 'Mana Crypt',
        reason: 'Mana Crypt is on the banlist',
      }),
    ]);
    expect(result.decklistText).toContain('Sol Ring');
  });

  it('skips when add card is outside commander color identity', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Sol Ring', add: 'Lightning Bolt' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('outside commander color identity');
  });

  it('skips when remove card cannot be resolved', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Totally Fake Card Name', add: 'Fellwar Stone' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('Could not resolve remove');
  });

  it('skips when remove card is not in the deck', () => {
    if (!hasCardsDatabase()) return;

    const deck = `Commander: Atraxa, Praetors' Voice\n${minimalDeckText(99)}`;
    const result = applyDeckSwaps(
      deck,
      [{ remove: 'Craterhoof Behemoth', add: 'Fellwar Stone' }],
      { commanderName: "Atraxa, Praetors' Voice" }
    );

    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]).toEqual(
      expect.objectContaining({
        remove: 'Craterhoof Behemoth',
        reason: expect.stringContaining('not in deck'),
      })
    );
  });
});
