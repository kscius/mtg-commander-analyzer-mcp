import { describe, expect, it } from 'vitest';
import { computeLandCountFromCurve } from './manaBaseGenerator';
import type { OracleCard } from './scryfall';
import type { DeckTemplateValidated } from './templateSchema';

function card(name: string, cmc: number, extras: Partial<OracleCard> = {}): OracleCard {
  return {
    name,
    cmc,
    mana_cost: `{${cmc}}`,
    type_line: 'Creature',
    oracle_text: '',
    color_identity: ['G'],
    ...extras,
  } as OracleCard;
}

const manaBase: DeckTemplateValidated['mana_base'] = {
  land_count: { min: 35, max: 38 },
  land_mix: {},
  tapped_lands: { max: 8 },
  fetch_policy: { min_typed_duals_before_fetches: 6 },
};

describe('computeLandCountFromCurve', () => {
  it('clamps land count to template min/max', () => {
    const highCurve = Array.from({ length: 20 }, (_, i) => card(`Big ${i}`, 7));
    expect(computeLandCountFromCurve(highCurve, manaBase, 36)).toBe(38);

    const lowCurve = Array.from({ length: 20 }, (_, i) => card(`Small ${i}`, 1));
    expect(
      computeLandCountFromCurve(lowCurve, manaBase, 37, { rampCount: 12 })
    ).toBe(35);
  });

  it('raises land count when average nonland MV is above three', () => {
    const mid = Array.from({ length: 10 }, (_, i) => card(`Mid ${i}`, 3));
    const heavy = Array.from({ length: 10 }, (_, i) => card(`Heavy ${i}`, 5));

    const midCount = computeLandCountFromCurve(mid, manaBase, 36);
    const heavyCount = computeLandCountFromCurve(heavy, manaBase, 36);

    expect(heavyCount).toBeGreaterThan(midCount);
  });

  it('reduces land count when rampCount is high', () => {
    const nonlands = Array.from({ length: 10 }, (_, i) => card(`Spell ${i}`, 3));

    const baseline = computeLandCountFromCurve(nonlands, manaBase, 37, { rampCount: 8 });
    const withRamp = computeLandCountFromCurve(nonlands, manaBase, 37, { rampCount: 12 });

    expect(withRamp).toBeLessThan(baseline);
    expect(baseline - withRamp).toBe(2);
  });

  it('adds one land for four-or-more-color decks when color_model is set', () => {
    const nonlands = [card('Flex', 3)];
    const colorModel = {
      targets: { base_sources_per_color_by_colors: { '2': 10 } },
    } as DeckTemplateValidated['color_model'];

    const twoColor = computeLandCountFromCurve(nonlands, manaBase, 36, {
      colorModel,
      colorCount: 2,
    });
    const fourColor = computeLandCountFromCurve(nonlands, manaBase, 36, {
      colorModel,
      colorCount: 4,
    });

    expect(fourColor).toBe(twoColor + 1);
  });
});
