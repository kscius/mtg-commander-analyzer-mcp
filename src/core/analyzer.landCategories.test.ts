import { describe, expect, it } from 'vitest';
import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import { autoTags, getPrimaryTemplateCategory, getDefaultBracket3Options } from './autoTags';
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
 * Regression: utility lands must not inflate non-land template categories.
 * Template generator skips lands when counting non-land categories; analyzer
 * previously double-counted (lands + primary tag) except for the ramp special-case.
 */
describe('utility land autoTags (precondition for analyzer regression)', () => {
  const opts = getDefaultBracket3Options('bracket3');

  it('tags War Room / Castle Locthwain as card_draw and Boseiju as AE hate', () => {
    expect(
      getPrimaryTemplateCategory(
        autoTags(
          {
            name: 'War Room',
            type_line: 'Land',
            oracle_text:
              "{T}: Add {C}.\n{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
            cmc: 0,
          },
          opts
        )
      )
    ).toBe('card_draw');

    expect(
      getPrimaryTemplateCategory(
        autoTags(
          {
            name: 'Castle Locthwain',
            type_line: 'Land',
            oracle_text:
              'This land enters tapped unless you control a Swamp.\n{T}: Add {B}.\n{1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand.',
            cmc: 0,
          },
          opts
        )
      )
    ).toBe('card_draw');

    expect(
      getPrimaryTemplateCategory(
        autoTags(
          {
            name: 'Boseiju, Who Endures',
            type_line: 'Legendary Land',
            oracle_text:
              '{T}: Add {G}.\nChannel — {1}{G}, Discard this card: Destroy target artifact, enchantment, or nonbasic land an opponent controls.',
            cmc: 0,
          },
          opts
        )
      )
    ).toBe('artifact_enchantment_hate');
  });
});

describeDb('analyzeDeckBasic land category isolation', () => {
  itDb(
    'does not count utility lands toward card_draw or artifact_enchantment_hate',
    { timeout: analyzeTimeoutMs },
    async () => {
      // Only utility lands that autoTags would otherwise count as functional categories.
      // No non-land draw / AE-hate spells — so those categories must stay at 0.
      const deckText = padTo99([
        '1 War Room',
        '1 Castle Locthwain',
        '1 Boseiju, Who Endures',
        '1 Reliquary Tower',
        '1 Command Tower',
      ]);
      const parsed = parseDeckText(deckText);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Atraxa, Praetors\' Voice',
          templateId: 'bracket3',
        },
        parsed
      );

      const byName = Object.fromEntries(
        result.analysis.categories.map((c) => [c.name, c.count])
      );

      expect(byName.lands).toBe(99);
      expect(byName.card_draw).toBe(0);
      expect(byName.artifact_enchantment_hate).toBe(0);
    }
  );

  itDb(
    'still counts non-land card_draw spells when utility lands are present',
    { timeout: analyzeTimeoutMs },
    async () => {
      const deckText = padTo99([
        '1 War Room',
        '1 Castle Locthwain',
        '1 Boseiju, Who Endures',
        '1 Rhystic Study',
        '1 Phyrexian Arena',
      ]);
      const parsed = parseDeckText(deckText);

      const result = await analyzeDeckBasic(
        {
          deckText,
          commanderName: 'Atraxa, Praetors\' Voice',
          templateId: 'bracket3',
        },
        parsed
      );

      const byName = Object.fromEntries(
        result.analysis.categories.map((c) => [c.name, c.count])
      );

      expect(byName.lands).toBe(97);
      expect(byName.card_draw).toBe(2);
      expect(byName.artifact_enchantment_hate).toBe(0);
    }
  );
});
