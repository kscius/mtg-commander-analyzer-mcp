import { describe, expect, it } from 'vitest';
import type { CardLike } from './scryfallNormalize';
import {
  countPips,
  entersTappedKind,
  getManaValue,
  getOracleText,
  getPrimaryManaCost,
  getPrimaryTypeLine,
  isCommanderLegal,
  isLandCard,
  mvBucket,
  producedManaSymbols,
} from './scryfallNormalize';

function card(partial: Partial<CardLike> & { name: string }): CardLike {
  return partial;
}

describe('getManaValue', () => {
  it('prefers mana_value over cmc', () => {
    expect(getManaValue(card({ name: 'Test', mana_value: 3, cmc: 5 }))).toBe(3);
  });

  it('falls back to cmc when mana_value is absent', () => {
    expect(getManaValue(card({ name: 'Test', cmc: 4 }))).toBe(4);
  });

  it('returns 0 for null, undefined, or missing fields', () => {
    expect(getManaValue(null)).toBe(0);
    expect(getManaValue(undefined)).toBe(0);
    expect(getManaValue(card({ name: 'Free' }))).toBe(0);
  });
});

describe('getPrimaryManaCost', () => {
  it('uses top-level mana_cost when present', () => {
    expect(getPrimaryManaCost(card({ name: 'Bolt', mana_cost: '{R}' }))).toBe('{R}');
  });

  it('uses front face mana_cost for MDFC/split cards', () => {
    expect(
      getPrimaryManaCost(
        card({
          name: 'Bala Ged Recovery',
          card_faces: [{ mana_cost: '{2}{G}' }, { mana_cost: '' }],
        })
      )
    ).toBe('{2}{G}');
  });

  it('returns null when no cost is available', () => {
    expect(getPrimaryManaCost(null)).toBeNull();
    expect(getPrimaryManaCost(card({ name: 'Land' }))).toBeNull();
  });
});

describe('getPrimaryTypeLine', () => {
  it('uses top-level type_line when present', () => {
    expect(getPrimaryTypeLine(card({ name: 'Bolt', type_line: 'Instant' }))).toBe('Instant');
  });

  it('uses front face type_line for double-faced cards', () => {
    expect(
      getPrimaryTypeLine(
        card({
          name: 'Bala Ged Recovery',
          card_faces: [{ type_line: 'Sorcery' }, { type_line: 'Land' }],
        })
      )
    ).toBe('Sorcery');
  });

  it('returns empty string for missing card', () => {
    expect(getPrimaryTypeLine(undefined)).toBe('');
  });
});

describe('getOracleText', () => {
  it('uses top-level oracle_text when present', () => {
    expect(getOracleText(card({ name: 'Bolt', oracle_text: 'Deal 3 damage.' }))).toBe(
      'Deal 3 damage.'
    );
  });

  it('joins card_faces oracle text with separator', () => {
    expect(
      getOracleText(
        card({
          name: 'MDFC',
          card_faces: [{ oracle_text: 'Front ability.' }, { oracle_text: 'Back ability.' }],
        })
      )
    ).toBe('Front ability.\n---\nBack ability.');
  });

  it('returns empty string when no text is available', () => {
    expect(getOracleText(card({ name: 'Blank' }))).toBe('');
    expect(getOracleText(null)).toBe('');
  });
});

describe('mvBucket', () => {
  it('maps mana values to template curve buckets', () => {
    expect(mvBucket(0)).toBe('0_1');
    expect(mvBucket(1)).toBe('0_1');
    expect(mvBucket(2)).toBe('2');
    expect(mvBucket(3)).toBe('3');
    expect(mvBucket(4)).toBe('4');
    expect(mvBucket(5)).toBe('5_plus');
    expect(mvBucket(10)).toBe('5_plus');
  });
});

describe('countPips', () => {
  it('counts single-color pips', () => {
    expect(countPips('{1}{W}{U}')).toEqual({ W: 1, U: 1, B: 0, R: 0, G: 0 });
  });

  it('splits hybrid mana across colors', () => {
    const pips = countPips('{W/U}');
    expect(pips.W).toBeCloseTo(0.5);
    expect(pips.U).toBeCloseTo(0.5);
    expect(pips.B).toBe(0);
  });

  it('ignores generic and colorless symbols', () => {
    expect(countPips('{2}{C}')).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });

  it('returns zeros for null or empty cost', () => {
    expect(countPips(null)).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
    expect(countPips('')).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });
});

describe('producedManaSymbols', () => {
  it('uses produced_mana when present', () => {
    expect(
      producedManaSymbols(
        card({
          name: 'Command Tower',
          produced_mana: ['W', 'U', 'B', 'R', 'G', 'C'],
        })
      )
    ).toEqual(['W', 'U', 'B', 'R', 'G', 'C']);
  });

  it('filters invalid produced_mana entries', () => {
    expect(
      producedManaSymbols(
        card({
          name: 'Bad Land',
          produced_mana: ['W', 'X', 'C'],
        })
      )
    ).toEqual(['W', 'C']);
  });

  it('does not parse mana symbols from lowercased oracle text (use produced_mana in DB)', () => {
    // getOracleText is lowercased before regex; {U} becomes {u} and misses [WUBRGC]
    expect(
      producedManaSymbols(
        card({
          name: 'Island',
          type_line: 'Basic Land — Island',
          oracle_text: '{T}: Add {U}.',
        })
      )
    ).toEqual([]);
  });

  it('adds commander color identity for any-color mana', () => {
    expect(
      producedManaSymbols(
        card({
          name: 'Exotic Orchard',
          type_line: 'Land',
          color_identity: ['W', 'U', 'B'],
          oracle_text: '{T}: Add one mana of any color among lands you control.',
        })
      )
    ).toEqual(expect.arrayContaining(['W', 'U', 'B']));
  });

  it('returns empty array for null card', () => {
    expect(producedManaSymbols(null)).toEqual([]);
  });
});

describe('isLandCard', () => {
  it('detects land in primary type line', () => {
    expect(isLandCard(card({ name: 'Plains', type_line: 'Basic Land — Plains' }))).toBe(true);
    expect(isLandCard(card({ name: 'Bolt', type_line: 'Instant' }))).toBe(false);
  });
});

describe('entersTappedKind', () => {
  it('returns never for non-lands', () => {
    expect(
      entersTappedKind(
        card({
          name: 'Sol Ring',
          type_line: 'Artifact',
          oracle_text: '{T}: Add {C}{C}.',
        })
      )
    ).toBe('never');
  });

  it('returns always for unconditional ETB tapped', () => {
    expect(
      entersTappedKind(
        card({
          name: 'Evolving Wilds',
          type_line: 'Land',
          oracle_text: 'This land enters the battlefield tapped.\n{T}, Sacrifice: Search.',
        })
      )
    ).toBe('always');
  });

  it('returns conditional for unless/except/if you control clauses', () => {
    // Shock-style "if you don't, it enters tapped" is classified as always (no unless keyword)
    expect(
      entersTappedKind(
        card({
          name: 'Steam Vents',
          type_line: 'Land',
          oracle_text:
            'As Steam Vents enters the battlefield, you may pay 2 life. If you don\'t, it enters tapped.',
        })
      )
    ).toBe('always');

    expect(
      entersTappedKind(
        card({
          name: 'Glacial Fortress',
          type_line: 'Land',
          oracle_text:
            'Glacial Fortress enters the battlefield tapped unless you control a Forest or an Island.',
        })
      )
    ).toBe('conditional');
  });

  it('returns never for untapped lands and unknown when oracle text is missing', () => {
    expect(
      entersTappedKind(
        card({
          name: 'Command Tower',
          type_line: 'Land',
          oracle_text: '{T}: Add one mana of any color in your commander\'s color identity.',
        })
      )
    ).toBe('never');

    expect(
      entersTappedKind(
        card({
          name: 'Mystery Land',
          type_line: 'Land',
        })
      )
    ).toBe('unknown');
  });
});

describe('isCommanderLegal', () => {
  it('accepts legal commander or edh legality', () => {
    expect(
      isCommanderLegal(
        card({
          name: 'Sol Ring',
          legalities: { commander: 'legal' },
        })
      )
    ).toBe(true);

    expect(
      isCommanderLegal(
        card({
          name: 'Legacy Card',
          legalities: { edh: 'legal' },
        })
      )
    ).toBe(true);
  });

  it('rejects banned or missing legality', () => {
    expect(
      isCommanderLegal(
        card({
          name: 'Black Lotus',
          legalities: { commander: 'banned' },
        })
      )
    ).toBe(false);

    expect(isCommanderLegal(card({ name: 'Unknown' }))).toBe(false);
    expect(isCommanderLegal(null)).toBe(false);
  });
});
