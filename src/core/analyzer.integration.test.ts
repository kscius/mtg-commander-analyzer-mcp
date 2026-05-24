import { describe, expect, it } from 'vitest';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { describeDb, itDb } from '../../test/helpers/db';
import { loadFixtureText, loadMainboardFixture } from '../../test/helpers/fixtures';
import { minimalDeckText } from '../../test/helpers/minimalDeck';

const analyzeTimeoutMs = 60_000;

describeDb('analyzeDeckBasic integration', () => {
  itDb(
    'valid golden deck: 99 cards, banlist pass, no hard format errors',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = loadFixtureText('shadrix-group-slug-golden.txt');
      const parsed = parseDeckText(deckText);
      const mainQty = parsed.cards.reduce((s, c) => s + c.quantity, 0);
      expect(mainQty).toBe(99);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Shadrix Silverquill',
          templateId: 'bracket3',
          bracketId: 'bracket3',
          preferredStrategy: 'group-slug',
        },
        parsed
      );

      expect(result.analysis.totalCards).toBe(99);
      expect(result.analysis.banlistValid).toBe(true);
      expect(result.analysis.bannedCards).toHaveLength(0);
      const hardFormat = result.analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
      expect(hardFormat.some((i) => i.key === 'format:deck_size')).toBe(false);
      expect(hardFormat.some((i) => i.key === 'format:singleton')).toBe(false);
      expect(hardFormat.some((i) => i.key === 'format:color_identity')).toBe(false);
    }
  );

  itDb(
    'flags mainboard smaller than 99',
    { timeout: analyzeTimeoutMs },
    async () => {
      const main = loadMainboardFixture('shadrix-group-slug-golden.txt')
        .split('\n')
        .slice(0, 98)
        .join('\n');
      const parsed = parseDeckText(main);
      const result = await analyzeDeckBasic(
        {
          deckText: main,
          commanderName: 'Shadrix Silverquill',
          templateId: 'bracket3',
        },
        parsed
      );
      expect(result.analysis.totalCards).toBe(98);
      const hard = result.analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
      expect(hard.some((i) => i.key === 'format:deck_size')).toBe(true);
    }
  );

  itDb(
    'flags singleton violations',
    { timeout: analyzeTimeoutMs },
    async () => {
      const base = minimalDeckText(97);
      const deckText = `${base}\n1 Sol Ring\n1 Sol Ring`;
      const parsed = parseDeckText(deckText);
      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Talrand, Sky Summoner',
          templateId: 'bracket3',
        },
        parsed
      );
      const hard = result.analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
      expect(hard.some((i) => i.key === 'format:singleton')).toBe(true);
      expect(result.analysis.notes.some((n) => /Singleton/i.test(n))).toBe(true);
    }
  );

  itDb(
    'flags color identity violations for mono-U commander',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = `${minimalDeckText(98)}\n1 Lightning Bolt`;
      const parsed = parseDeckText(deckText);
      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Talrand, Sky Summoner',
          templateId: 'bracket3',
        },
        parsed
      );
      const hard = result.analysis.lintReport?.issues.filter((i) => i.severity === 'hard') ?? [];
      expect(hard.some((i) => i.key === 'format:color_identity')).toBe(true);
      expect(result.analysis.notes.some((n) => /color identity/i.test(n))).toBe(true);
    }
  );

  itDb(
    'flags banlist violations when banned card is present',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = `${minimalDeckText(98)}\n1 Black Lotus`;
      const parsed = parseDeckText(deckText);
      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Talrand, Sky Summoner',
          templateId: 'bracket3',
        },
        parsed
      );
      expect(result.analysis.banlistValid).toBe(false);
      expect(result.analysis.bannedCards.length).toBeGreaterThan(0);
      expect(result.analysis.bannedCards.some((b) => /black lotus/i.test(b.name))).toBe(true);
    }
  );

  itDb(
    'surfaces bracket warnings for excess game changers',
    { timeout: analyzeTimeoutMs },
    async () => {
      const gameChangers = [
        'Smothering Tithe',
        'Rhystic Study',
        "Teferi's Protection",
        'Cyclonic Rift',
      ];
      const filler = minimalDeckText(99 - gameChangers.length);
      const deckText = [...gameChangers.map((n) => `1 ${n}`), filler].join('\n');
      const parsed = parseDeckText(deckText);
      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Shadrix Silverquill',
          templateId: 'bracket3',
          bracketId: 'bracket3',
        },
        parsed
      );
      expect(result.analysis.bracketWarnings.some((w) => /Game Changer/i.test(w))).toBe(true);
    }
  );
});

describe('analyzeDeckBasic integration (no DB)', () => {
  it('still parses deck size without card resolution', async () => {
    const lines = Array.from({ length: 99 }, (_, i) => `1 Unknown Card ${i}`);
    const deckText = lines.join('\n');
    const parsed = parseDeckText(deckText);
    const result = await analyzeDeckBasic(
      { deckText, templateId: 'bracket3' },
      parsed
    );
    expect(result.analysis.totalCards).toBe(99);
    expect(result.analysis.notes.some((n) => n.includes('not found in database'))).toBe(true);
  });
});
