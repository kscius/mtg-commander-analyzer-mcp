/**
 * Land mix classification and targeting for template-driven deck generation.
 * Aligns with analyzer.ts land_mix heuristics and mana_base from deck templates.
 */

import type { OracleCard } from './scryfall';
import { getCardByName } from './scryfall';
import type { DeckTemplateValidated } from './templateSchema';
import {
  countPips,
  entersTappedKind,
  getOracleText,
  getPrimaryManaCost,
  getPrimaryTypeLine,
  type Color,
} from './scryfallNormalize';
import type { EdhrecCardSuggestion } from './types';

const BASIC_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);

/** Land categories used for template slot filling (mutually exclusive per card). */
export type LandMixBucket =
  | 'basics'
  | 'fetches'
  | 'shock_lands'
  | 'typed_duals'
  | 'mdfc_lands'
  | 'colorless_lands'
  | 'utility_lands';

function midRange(mm: { min: number; max: number } | undefined, fallback: number): number {
  if (!mm) return fallback;
  return Math.round((mm.min + mm.max) / 2);
}

/**
 * Classify a non-basic land into a single mix bucket (same priority order as analyzer buildLintReport).
 */
export function classifyLandMixBucket(card: OracleCard): LandMixBucket {
  const name = card.name;
  const text = getOracleText(card).toLowerCase();
  const typeLine = getPrimaryTypeLine(card).toLowerCase();

  if (BASIC_NAMES.has(name)) return 'basics';

  if (text.includes('fetch') || (text.includes('search your library') && text.includes('land'))) {
    return 'fetches';
  }
  if (text.includes('pay 2 life') && text.includes('untapped')) {
    return 'shock_lands';
  }
  if (text.includes('trinity') || text.includes('tricycle') || name.toLowerCase().includes('tricycle')) {
    return 'typed_duals';
  }
  if (card.card_faces?.length && typeLine.includes('land')) {
    return 'mdfc_lands';
  }
  const id = card.color_identity ?? [];
  const produced = card.produced_mana;
  if (
    id.length === 0 &&
    (!produced || produced.length === 0 || (produced.length === 1 && produced[0] === 'C'))
  ) {
    return 'colorless_lands';
  }
  return 'utility_lands';
}

/** Whether adding this land increases tapped total per Bracket 3 lint (always + conditional). */
export function countsAsTappedLand(card: OracleCard): boolean {
  const k = entersTappedKind(card);
  return k === 'always' || k === 'conditional';
}

export interface LandMixTargets {
  basics: number;
  fetches: number;
  shock_lands: number;
  typed_duals: number;
  mdfc_lands: number;
  colorless_lands: number;
  utility_lands: number;
}

/**
 * Build per-bucket slot targets from template mana_base.land_mix midpoints, scaled to `totalSlots`.
 */
export function computeScaledLandMixTargets(
  manaBase: DeckTemplateValidated['mana_base'],
  totalSlots: number
): LandMixTargets {
  const lm = manaBase.land_mix;
  const raw: LandMixTargets = {
    basics: midRange(lm.basics, 10),
    fetches: midRange(lm.fetches, 3),
    shock_lands: midRange(lm.shock_lands, 3),
    typed_duals:
      midRange(lm.typed_duals, 4) +
      midRange(lm.tricycle_lands, 2) +
      midRange(lm.verge_lands, 1) +
      midRange(lm.surveil_lands, 1) +
      midRange(lm.bond_lands, 0) +
      midRange(lm.pain_lands, 2) +
      midRange(lm.check_lands, 2) +
      midRange(lm.slow_lands, 2) +
      midRange(lm.fast_lands, 2) +
      midRange(lm.filter_lands, 2),
    mdfc_lands: midRange(lm.mdfc_lands, 2),
    colorless_lands: midRange(lm.colorless_lands, 2),
    utility_lands: midRange(lm.utility_lands, 4),
  };

  const keys = Object.keys(raw) as (keyof LandMixTargets)[];
  let sum = keys.reduce((s, k) => s + raw[k], 0);
  if (sum <= 0 || totalSlots <= 0) {
    return {
      basics: Math.max(0, totalSlots),
      fetches: 0,
      shock_lands: 0,
      typed_duals: 0,
      mdfc_lands: 0,
      colorless_lands: 0,
      utility_lands: 0,
    };
  }

  const scaled = { ...raw };
  if (sum !== totalSlots) {
    const factor = totalSlots / sum;
    let rounded: LandMixTargets = { ...scaled };
    keys.forEach((k) => {
      rounded[k] = Math.max(0, Math.round(scaled[k] * factor));
    });
    let diff = totalSlots - keys.reduce((s, k) => s + rounded[k], 0);
    const priority: (keyof LandMixTargets)[] = [
      'basics',
      'utility_lands',
      'fetches',
      'typed_duals',
      'shock_lands',
      'mdfc_lands',
      'colorless_lands',
    ];
    let i = 0;
    while (diff !== 0 && i < 200) {
      const k = priority[i % priority.length];
      if (diff > 0) {
        rounded[k]++;
        diff--;
      } else if (rounded[k] > 0) {
        rounded[k]--;
        diff++;
      }
      i++;
    }
    return rounded;
  }
  return scaled;
}

/**
 * Pip-weighted counts for each basic land name (e.g. Plains count for W).
 */
export function allocateBasicsByPips(
  commander: OracleCard,
  colorIdentity: string[],
  totalBasics: number
): Map<string, number> {
  const out = new Map<string, number>();
  const colorToBasic: Record<string, string> = {
    W: 'Plains',
    U: 'Island',
    B: 'Swamp',
    R: 'Mountain',
    G: 'Forest',
  };
  const basics = colorIdentity.map((c) => colorToBasic[c]).filter(Boolean) as string[];
  if (totalBasics <= 0 || basics.length === 0) return out;

  const cost = getPrimaryManaCost(commander);
  const pips = countPips(cost);
  const weights = colorIdentity.map((c) => {
    const col = c as Color;
    return Math.max(0, pips[col] ?? 0);
  });
  let wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum < 0.01) {
    weights.fill(1);
    wsum = weights.length;
  }

  const exact = colorIdentity.map((_, i) => (totalBasics * weights[i]) / wsum);
  const floors = exact.map((x) => Math.floor(x));
  const assignedSum = floors.reduce((a, b) => a + b, 0);
  let rem = totalBasics - assignedSum;
  const frac = exact.map((x, i) => ({ i, f: x - Math.floor(x) }));
  frac.sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem; k++) {
    floors[frac[k].i]++;
  }

  colorIdentity.forEach((c, i) => {
    const name = colorToBasic[c];
    if (name && floors[i] > 0) out.set(name, (out.get(name) ?? 0) + floors[i]);
  });

  return out;
}

/**
 * Merge commander lands + color lands, dedupe, sort by commander priority, tap status, synergy, rank.
 */
export function mergeAndSortLandCandidates(
  commanderLands: EdhrecCardSuggestion[],
  colorLands: EdhrecCardSuggestion[],
  commanderLandNamesLower: Set<string>
): EdhrecCardSuggestion[] {
  const seen = new Set<string>();
  const merged: EdhrecCardSuggestion[] = [];

  const push = (s: EdhrecCardSuggestion) => {
    const k = s.name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(s);
  };

  for (const s of commanderLands) push(s);
  for (const s of colorLands) push(s);

  const tapRank = (name: string): number => {
    const card = getCardByName(name);
    if (!card) return 3;
    const k = entersTappedKind(card);
    if (k === 'never') return 0;
    if (k === 'conditional') return 1;
    if (k === 'always') return 2;
    return 3;
  };

  return merged.sort((a, b) => {
    const aCmd = commanderLandNamesLower.has(a.name.toLowerCase()) ? 0 : 1;
    const bCmd = commanderLandNamesLower.has(b.name.toLowerCase()) ? 0 : 1;
    if (aCmd !== bCmd) return aCmd - bCmd;

    const ta = tapRank(a.name);
    const tb = tapRank(b.name);
    if (ta !== tb) return ta - tb;

    const sa = a.synergyScore ?? -999;
    const sb = b.synergyScore ?? -999;
    if (sa !== sb) return sb - sa;

    const ra = a.rank ?? 99999;
    const rb = b.rank ?? 99999;
    return ra - rb;
  });
}

/**
 * Dual-like lands for fetch policy (non-fetch mana producers that aren't basics).
 */
export function isDualLikeBucket(bucket: LandMixBucket): boolean {
  return bucket === 'shock_lands' || bucket === 'typed_duals' || bucket === 'mdfc_lands';
}

/** Decrement mix targets based on lands already in the partial deck (seeds). */
export function applySeedLandConsumption(
  targets: LandMixTargets,
  landNames: string[],
  getCard: (name: string) => OracleCard | null
): LandMixTargets {
  const t: LandMixTargets = { ...targets };
  for (const name of landNames) {
    const card = getCard(name);
    if (!card || !getPrimaryTypeLine(card).toLowerCase().includes('land')) continue;
    const b = classifyLandMixBucket(card);
    if (t[b] > 0) t[b]--;
  }
  return t;
}

export function countTappedAmongLandNames(
  landNames: string[],
  getCard: (name: string) => OracleCard | null
): number {
  let n = 0;
  for (const name of landNames) {
    const card = getCard(name);
    if (!card) continue;
    if (countsAsTappedLand(card)) n++;
  }
  return n;
}

/** Shock + typed dual + MDFC count (fetch policy: need fixing duals before fetches). */
export function countFixingDualLands(
  landNames: string[],
  getCard: (name: string) => OracleCard | null
): number {
  let n = 0;
  for (const name of landNames) {
    const card = getCard(name);
    if (!card || !getPrimaryTypeLine(card).toLowerCase().includes('land')) continue;
    const b = classifyLandMixBucket(card);
    if (b === 'shock_lands' || b === 'typed_duals' || b === 'mdfc_lands') n++;
  }
  return n;
}
