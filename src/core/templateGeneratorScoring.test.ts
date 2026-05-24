import { describe, expect, it } from 'vitest';
import {
  createGeneratorPickState,
  violatesComboRules,
  updateGeneratorStateAfterPick,
} from './templateGeneratorScoring';
import type { OracleCard } from './scryfall';

describe('templateGeneratorScoring', () => {
  it('blocks tutors when combo_rules cap reached', () => {
    const state = createGeneratorPickState();
    state.tutorCount = 5;
    expect(
      violatesComboRules(['tutor', 'ramp'], { max_tutors_total: 5, allow_infinite_combos: true }, state)
    ).toBe(true);
  });

  it('tracks interaction picks in generator state', () => {
    const state = createGeneratorPickState();
    const card = {
      name: 'Swords to Plowshares',
      type_line: 'Instant',
      oracle_text: 'Exile target creature.',
      cmc: 1,
    } as OracleCard;
    updateGeneratorStateAfterPick(state, card, ['spot_removal']);
    expect(state.instantInteraction).toBe(1);
    expect(state.cheapInteraction).toBe(1);
  });
});
