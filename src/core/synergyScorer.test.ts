import { describe, expect, it } from 'vitest';
import { OFF_THEME_CARD_THRESHOLD, scoreCardForStrategy, scoreDeckSynergy } from './synergyScorer';
import { clearStrategyDataCache } from './strategyProfiles';

describe('synergyScorer', () => {
  it('scores token makers highly for tokens strategy', () => {
    clearStrategyDataCache();
    const score = scoreCardForStrategy(
      {
        name: 'Secure the Wastes',
        oracle_text: 'Create X 1/1 white Warrior creature tokens.',
        type_line: 'Instant',
      },
      'tokens'
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it('penalizes anti-synergy patterns for tokens', () => {
    clearStrategyDataCache();
    const score = scoreCardForStrategy(
      {
        name: 'Wrath of God',
        oracle_text: 'Destroy all creatures. They cannot be regenerated.',
        type_line: 'Sorcery',
      },
      'tokens'
    );
    expect(score).toBeLessThan(0.5);
  });

  it('returns neutral score when no strategy set', () => {
    const result = scoreDeckSynergy([{ rawLine: '1 Sol Ring', quantity: 1, name: 'Sol Ring' }]);
    expect(result.synergyScore).toBe(50);
    expect(result.offThemeCards).toHaveLength(0);
  });

  it('uses OFF_THEME_CARD_THRESHOLD for off-theme list', () => {
    clearStrategyDataCache();
    expect(OFF_THEME_CARD_THRESHOLD).toBe(0.42);
    const result = scoreDeckSynergy(
      [{ rawLine: '1 Wrath of God', quantity: 1, name: 'Wrath of God' }],
      'tokens'
    );
    expect(result.offThemeCards).toContain('Wrath of God');
  });

  it('boosts tribal payoffs via oracle rules', () => {
    const score = scoreCardForStrategy(
      {
        name: 'Elvish Archdruid',
        oracle_text: 'Other Elf creatures you control get +1/+1.',
        type_line: 'Creature — Elf Druid',
      },
      'tribal',
      'Marwyn, the Nurtured Heart'
    );
    expect(score).toBeGreaterThan(0.45);
  });
});
