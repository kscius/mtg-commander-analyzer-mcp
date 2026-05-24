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
});
