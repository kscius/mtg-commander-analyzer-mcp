import { describe, expect } from 'vitest';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { describeDb, itDb } from '../../test/helpers/db';

const analyzeTimeoutMs = 60_000;

/** Pad a partial mainboard to 99 singleton lines (Island). */
function padTo99(lines: string[]): string {
  const padded = [...lines];
  while (padded.length < 99) {
    padded.push('1 Island');
  }
  return padded.slice(0, 99).join('\n');
}

/**
 * Regression: analyzer land_mix metrics must use classifyLandMixBucket (shared with deck builder),
 * not the legacy "other" bucket that misclassified utility and colorless lands.
 */
describeDb('buildLintReport land_mix classification', () => {
  itDb(
    'classifies Command Tower as utility_lands and War Room as colorless_lands in metrics',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        '1 Command Tower',
        '1 War Room',
        '1 Reliquary Tower',
        '1 Mystic Sanctuary',
      ]);
      const parsed = parseDeckText(deckText);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Talrand, Sky Summoner',
          templateId: 'bracket3',
        },
        parsed
      );

      const landMix = result.analysis.lintReport?.metrics?.land_mix as Record<string, number>;
      expect(landMix).toBeDefined();
      expect(landMix.utility_lands).toBeGreaterThanOrEqual(1);
      expect(landMix.colorless_lands).toBeGreaterThanOrEqual(1);
      expect(landMix.other).toBeUndefined();
    }
  );

  itDb(
    'flags utility_lands below template minimum when mana base is mostly basics',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        '1 Plains',
        '1 Island',
        '1 Swamp',
        '1 Mountain',
        '1 Forest',
        '1 Command Tower',
      ]);
      const parsed = parseDeckText(deckText);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Talrand, Sky Summoner',
          templateId: 'bracket3',
        },
        parsed
      );

      const issues = result.analysis.lintReport?.issues ?? [];
      const utilityBelow = issues.find((i) => i.key === 'mana_base:land_mix.utility_lands');
      expect(utilityBelow).toBeDefined();
      expect(utilityBelow?.message).toMatch(/utility_lands count \d+ below min 2/);
    }
  );
});
