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
 * Regression: spot_removal min_instant_speed must count instant-speed cards tagged
 * spot_removal only — not deck-wide counterspells (interaction_coverage metric).
 */
describeDb('buildLintReport category constraints', () => {
  itDb(
    'spot_removal min_instant_speed uses per-category instant count, not global counterspells',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        '1 Counterspell',
        '1 Negate',
        '1 Dispel',
        '1 Mana Leak',
        "1 Dovin's Veto",
        '1 Swan Song',
        '1 Path to Exile',
        '1 Swords to Plowshares',
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
      const spotInstant = issues.find((i) => i.key === 'categories:spot_removal.min_instant_speed');
      expect(spotInstant).toBeDefined();
      expect(spotInstant?.message).toMatch(/instant-speed count 2 \(min 3\)/);
    }
  );

  itDb(
    'ramp min_mv2_or_less flags when low-MV ramp is below template minimum',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        '1 Cultivate',
        "1 Kodama's Reach",
        '1 Skyshroud Claim',
        '1 Explosive Vegetation',
        '1 Harrow',
        "1 Nature's Lore",
        '1 Three Visits',
        '1 Farseek',
        '1 Rampant Growth',
        '1 Sol Ring',
        '1 Arcane Signet',
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
      const rampMv2 = issues.find((i) => i.key === 'categories:ramp.min_mv2_or_less');
      expect(rampMv2).toBeDefined();
      expect(rampMv2?.severity).toBe('soft');
    }
  );

  itDb(
    'protection min_instant_speed uses protection-tagged instants only',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        "1 Teferi's Protection",
        '1 Negate',
        '1 Dispel',
        '1 Dovin\'s Veto',
        '1 Flusterstorm',
        '1 Swan Song',
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
      const protectionInstant = issues.find(
        (i) => i.key === 'categories:protection.min_instant_speed'
      );
      expect(protectionInstant).toBeDefined();
      expect(protectionInstant?.message).toMatch(/instant-speed count 1 \(min 2\)/);
    }
  );
});
