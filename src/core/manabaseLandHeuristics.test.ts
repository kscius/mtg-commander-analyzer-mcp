import { describe, expect, it } from 'vitest';
import type { OracleCard } from './scryfall';
import { loadDeckTemplate } from './templates';
import {
  allocateBasicsByPips,
  applySeedLandConsumption,
  classifyLandMixBucket,
  computeScaledLandMixTargets,
  countsAsTappedLand,
  expandQuantifiedNames,
  isDualLikeBucket,
  sumLandQuantity,
  sumNonlandQuantity,
  type LandMixBucket,
} from './manabaseLandHeuristics';

/** Minimal OracleCard stub for pure land-mix heuristics (no cards.db required). */
function landCard(partial: Partial<OracleCard> & { name: string }): OracleCard {
  return {
    type_line: 'Land',
    oracle_text: '',
    color_identity: [],
    ...partial,
  } as OracleCard;
}

describe('classifyLandMixBucket', () => {
  it('classifies basics, fetches, shocks, typed duals, MDFCs, colorless, and utility lands', () => {
    expect(classifyLandMixBucket(landCard({ name: 'Plains' }))).toBe('basics');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'Polluted Delta',
          oracle_text: 'Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.',
        })
      )
    ).toBe('fetches');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'Steam Vents',
          oracle_text:
            'As Steam Vents enters the battlefield, you may pay 2 life. If you don\'t, it enters tapped. Otherwise it enters untapped.\n{T}: Add {U} or {R}.',
          color_identity: ['U', 'R'],
        })
      )
    ).toBe('shock_lands');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'Triome',
          oracle_text: 'This is a tricycle land.',
        })
      )
    ).toBe('typed_duals');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'Bala Ged Sanctuary',
          type_line: 'Land',
          card_faces: [
            { name: 'Bala Ged Recovery', type_line: 'Sorcery', oracle_text: 'Return target card from graveyard.' },
            { name: 'Bala Ged Sanctuary', type_line: 'Land', oracle_text: '{T}: Add {G}.' },
          ],
        })
      )
    ).toBe('mdfc_lands');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'War Room',
          color_identity: [],
          produced_mana: ['C'],
        })
      )
    ).toBe('colorless_lands');
    expect(
      classifyLandMixBucket(
        landCard({
          name: 'Command Tower',
          color_identity: [],
          produced_mana: ['W', 'U', 'B', 'R', 'G'],
        })
      )
    ).toBe('utility_lands');
  });
});

describe('countsAsTappedLand', () => {
  it('flags always- and conditional-tap lands', () => {
    expect(
      countsAsTappedLand(
        landCard({ oracle_text: 'This land enters the battlefield tapped.\n{T}: Add {G}.' })
      )
    ).toBe(true);
    expect(
      countsAsTappedLand(
        landCard({
          oracle_text:
            'This land enters the battlefield tapped unless you control two or more other lands.\n{T}: Add {U}.',
        })
      )
    ).toBe(true);
    expect(
      countsAsTappedLand(landCard({ oracle_text: '{T}: Add {W} or {U}.' }))
    ).toBe(false);
  });
});

describe('computeScaledLandMixTargets', () => {
  const bracket3 = loadDeckTemplate('bracket3');
  const manaBase = bracket3.mana_base!;

  it('scales bracket3 land_mix midpoints to totalSlots with exact sum', () => {
    const targets = computeScaledLandMixTargets(manaBase, 36);
    const sum = Object.values(targets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(36);
    expect(targets.basics).toBeGreaterThan(0);
  });

  it('returns all basics when totalSlots is positive but raw sum is zero', () => {
    const emptyMix = {
      ...manaBase,
      land_mix: {
        basics: { min: 0, max: 0 },
        fetches: { min: 0, max: 0 },
        shock_lands: { min: 0, max: 0 },
        typed_duals: { min: 0, max: 0 },
        tricycle_lands: { min: 0, max: 0 },
        verge_lands: { min: 0, max: 0 },
        surveil_lands: { min: 0, max: 0 },
        bond_lands: { min: 0, max: 0 },
        pain_lands: { min: 0, max: 0 },
        check_lands: { min: 0, max: 0 },
        slow_lands: { min: 0, max: 0 },
        fast_lands: { min: 0, max: 0 },
        filter_lands: { min: 0, max: 0 },
        mdfc_lands: { min: 0, max: 0 },
        colorless_lands: { min: 0, max: 0 },
        utility_lands: { min: 0, max: 0 },
      },
    };
    const targets = computeScaledLandMixTargets(emptyMix, 12);
    expect(targets).toEqual({
      basics: 12,
      fetches: 0,
      shock_lands: 0,
      typed_duals: 0,
      mdfc_lands: 0,
      colorless_lands: 0,
      utility_lands: 0,
    });
  });

  it('returns zeroed buckets when totalSlots is zero', () => {
    const targets = computeScaledLandMixTargets(manaBase, 0);
    expect(Object.values(targets).every((n) => n === 0)).toBe(true);
  });
});

describe('allocateBasicsByPips', () => {
  const commander = {
    name: 'Azorius Test',
    mana_cost: '{2}{W}{U}{U}',
    type_line: 'Legendary Creature',
    oracle_text: '',
  } as OracleCard;

  it('weights basics toward heavier pip colors', () => {
    const plan = allocateBasicsByPips(commander, ['W', 'U'], 10);
    expect(plan.get('Island')).toBeGreaterThan(plan.get('Plains') ?? 0);
    expect([...plan.values()].reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('splits evenly when commander has no colored pips', () => {
    const colorless = { name: 'Kozilek', mana_cost: '{10}', type_line: 'Legendary Creature' } as OracleCard;
    const plan = allocateBasicsByPips(colorless, ['W', 'U'], 6);
    expect(plan.get('Plains')).toBe(3);
    expect(plan.get('Island')).toBe(3);
  });

  it('returns empty map when totalBasics is zero or color identity is empty', () => {
    expect(allocateBasicsByPips(commander, ['W', 'U'], 0).size).toBe(0);
    expect(allocateBasicsByPips(commander, [], 10).size).toBe(0);
  });
});

describe('isDualLikeBucket', () => {
  it('treats shock, typed dual, and MDFC buckets as dual-like', () => {
    const dualLike: LandMixBucket[] = ['shock_lands', 'typed_duals', 'mdfc_lands'];
    for (const bucket of dualLike) {
      expect(isDualLikeBucket(bucket)).toBe(true);
    }
    expect(isDualLikeBucket('fetches')).toBe(false);
    expect(isDualLikeBucket('utility_lands')).toBe(false);
  });
});

describe('expandQuantifiedNames', () => {
  it('repeats each name by entry quantity', () => {
    expect(
      expandQuantifiedNames([
        { name: 'Island', quantity: 3 },
        { name: 'Sol Ring', quantity: 1 },
      ])
    ).toEqual(['Island', 'Island', 'Island', 'Sol Ring']);
  });
});

describe('sumLandQuantity / sumNonlandQuantity', () => {
  const getCard = (name: string): OracleCard | null => {
    if (name === 'Island' || name === 'Command Tower') {
      return landCard({ name });
    }
    if (name === 'Sol Ring') {
      return { name, type_line: 'Artifact', oracle_text: '', color_identity: [] } as OracleCard;
    }
    return null;
  };

  it('counts stacked basic land quantity toward land total', () => {
    const built = [
      { name: 'Island', quantity: 5 },
      { name: 'Sol Ring', quantity: 1 },
    ];
    expect(sumLandQuantity(built, getCard)).toBe(5);
    expect(sumNonlandQuantity(built, getCard)).toBe(1);
  });
});

describe('applySeedLandConsumption', () => {
  it('decrements the matching bucket for seeded non-basic lands', () => {
    const targets = {
      basics: 8,
      fetches: 2,
      shock_lands: 2,
      typed_duals: 4,
      mdfc_lands: 1,
      colorless_lands: 1,
      utility_lands: 3,
    };
    const getCard = (name: string): OracleCard | null => {
      if (name === 'Command Tower') {
        return landCard({
          name,
          color_identity: [],
          produced_mana: ['W', 'U', 'B', 'R', 'G'],
        });
      }
      if (name === 'Steam Vents') {
        return landCard({
          name,
          color_identity: ['U', 'R'],
          oracle_text:
            'As Steam Vents enters the battlefield, you may pay 2 life. If you don\'t, it enters tapped. Otherwise it enters untapped.\n{T}: Add {U} or {R}.',
        });
      }
      return null;
    };

    const after = applySeedLandConsumption(
      targets,
      [
        { name: 'Command Tower', quantity: 1 },
        { name: 'Steam Vents', quantity: 1 },
        { name: 'Sol Ring', quantity: 1 },
      ],
      getCard
    );
    expect(after.utility_lands).toBe(2);
    expect(after.shock_lands).toBe(1);
    expect(after.basics).toBe(8);
  });

  it('decrements basics bucket once per stacked basic copy', () => {
    const targets = {
      basics: 8,
      fetches: 0,
      shock_lands: 0,
      typed_duals: 0,
      mdfc_lands: 0,
      colorless_lands: 0,
      utility_lands: 0,
    };
    const getCard = (name: string): OracleCard | null =>
      name === 'Island' ? landCard({ name }) : null;

    const after = applySeedLandConsumption(targets, [{ name: 'Island', quantity: 3 }], getCard);
    expect(after.basics).toBe(5);
  });
});
