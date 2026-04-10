import { describe, expect, it } from 'vitest';
import { formatDecklistText } from './deckTextFormat';
import type { BuiltCardEntry } from './types';

describe('formatDecklistText', () => {
  it('groups basic lands with quantity and keeps singletons as 1 Name', () => {
    const cards: BuiltCardEntry[] = [
      { name: 'Sol Ring', quantity: 1, roles: [] },
      { name: 'Island', quantity: 1, roles: ['land'] },
      { name: 'Island', quantity: 1, roles: ['land'] },
      { name: 'Island', quantity: 1, roles: ['land'] },
      { name: 'Counterspell', quantity: 1, roles: ['protection'] },
    ];
    const text = formatDecklistText(cards);
    expect(text).toBe('1 Sol Ring\n1 Counterspell\n3 Island');
  });

  it('aggregates Snow-Covered basics separately', () => {
    const cards: BuiltCardEntry[] = [
      { name: 'Snow-Covered Island', quantity: 2, roles: ['land'] },
      { name: 'Island', quantity: 1, roles: ['land'] },
    ];
    expect(formatDecklistText(cards)).toBe('1 Island\n2 Snow-Covered Island');
  });
});
