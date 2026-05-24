import { describe, expect, it } from 'vitest';
import {
  compareEdhrecSuggestionsForTheme,
  scoreEdhrecSuggestionForTheme,
} from './edhrecStrategyScoring';
import type { EdhrecCardSuggestion } from './types';

describe('edhrecStrategyScoring', () => {
  const base: EdhrecCardSuggestion = {
    name: 'Test Card',
    synergyScore: 0.4,
    rank: 10,
    inclusionRate: 0.35,
    category: 'tokens',
    label: 'High Synergy',
  };

  it('boosts theme category and label matches', () => {
    const withTheme = scoreEdhrecSuggestionForTheme(base, 'tokens');
    const without = scoreEdhrecSuggestionForTheme(base);
    expect(withTheme).toBeGreaterThan(without);
  });

  it('penalizes very low inclusion in theme context', () => {
    const low: EdhrecCardSuggestion = {
      ...base,
      inclusionRate: 0.02,
      category: 'other',
      label: '',
    };
    const high: EdhrecCardSuggestion = { ...base, inclusionRate: 0.4 };
    const lowScore = scoreEdhrecSuggestionForTheme(low, 'tokens');
    const highScore = scoreEdhrecSuggestionForTheme(high, 'tokens');
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('prefers lower rank when sorting', () => {
    const a: EdhrecCardSuggestion = { name: 'A', rank: 120, synergyScore: 0.2, category: 'other' };
    const b: EdhrecCardSuggestion = {
      name: 'B',
      rank: 5,
      synergyScore: 0.2,
      category: 'tokens',
      inclusionRate: 0.4,
    };
    expect(compareEdhrecSuggestionsForTheme(b, a, 'tokens')).toBeGreaterThan(0);
  });
});
