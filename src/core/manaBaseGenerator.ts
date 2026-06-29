/**
 * Commander mana base generation — four coordinated systems:
 *
 * 1. **curve_land_count** — land total from template range + average nonland CMC
 * 2. **template_mix** — scaled land_mix bucket targets from deck template
 * 3. **pip_basics** — basic lands split by commander mana pip weights
 * 4. **edhrec_synergy** — non-basic lands from EDHREC commander/color pages with bucket + tap policy
 */

import { getCardByName, landFitsCommanderManabase, type OracleCard } from './scryfall';
import { getPrimaryTypeLine, getManaValue } from './scryfallNormalize';
import type { DeckTemplateValidated } from './templateSchema';
import { scoreEdhrecSuggestionForTheme } from './edhrecStrategyScoring';
import type { EdhrecCardSuggestion } from './types';
import type { BuiltCardEntry } from './types';
import { isBanned } from './banlist';
import {
  allocateBasicsByPips,
  applySeedLandConsumption,
  expandQuantifiedNames,
  classifyLandMixBucket,
  computeScaledLandMixTargets,
  countFixingDualLands,
  countTappedAmongLandNames,
  countsAsTappedLand,
  mergeAndSortLandCandidates,
  type LandMixTargets,
} from './manabaseLandHeuristics';
import { getLandsForColorCombination } from './edhrec';

const COLOR_TO_BASIC_LAND: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export const MANA_BASE_SYSTEMS = [
  'curve_land_count',
  'template_mix',
  'pip_basics',
  'edhrec_synergy',
] as const;

export type ManaBaseSystem = (typeof MANA_BASE_SYSTEMS)[number];

export interface ManaBaseFillContext {
  commanderCard: OracleCard;
  colorIdentity: string[];
  manaBase: DeckTemplateValidated['mana_base'];
  /** Optional template color_model for multi-color land budgeting */
  colorModel?: DeckTemplateValidated['color_model'];
  preferredTheme?: string;
  rampCount?: number;
  landsToAdd: number;
  profileLands: EdhrecCardSuggestion[];
  builtCards: BuiltCardEntry[];
  cardsInDeck: Set<string>;
  addCard: (name: string) => boolean;
  notes: string[];
  /** Lands the user runs often in data/my_decks — boost sort priority (read-only reference). */
  userPreferredLandNames?: string[];
}

/**
 * System 1: Adjust land count using average mana value of known nonlands (clamped to template land_count).
 */
function countRampInDeck(cards: OracleCard[]): number {
  let n = 0;
  for (const c of cards) {
    const text = (c.oracle_text ?? '').toLowerCase();
    const type = (c.type_line ?? '').toLowerCase();
    if (type.includes('land')) continue;
    if (
      text.includes('add {') ||
      text.includes('search your library for') && text.includes('land') ||
      /mana rock|sol ring|arcane signet/i.test(c.name)
    ) {
      n++;
    }
  }
  return n;
}

export function computeLandCountFromCurve(
  nonlandOracleCards: OracleCard[],
  manaBase: DeckTemplateValidated['mana_base'],
  defaultTarget: number,
  options?: {
    rampCount?: number;
    colorModel?: DeckTemplateValidated['color_model'];
    colorCount?: number;
  }
): number {
  const min = manaBase.land_count?.min ?? 35;
  const max = manaBase.land_count?.max ?? 38;
  let target = defaultTarget;

  if (nonlandOracleCards.length > 0) {
    let sum = 0;
    let n = 0;
    for (const c of nonlandOracleCards) {
      const mv = getManaValue(c);
      if (Number.isFinite(mv)) {
        sum += mv;
        n++;
      }
    }
    const avg = n > 0 ? sum / n : 3;
    const extra = Math.round(Math.max(0, avg - 3) * 2);
    target = defaultTarget + extra;
  }

  const ramp = options?.rampCount ?? countRampInDeck(nonlandOracleCards);
  if (ramp >= 12) target -= 2;
  else if (ramp >= 10) target -= 1;

  const colors = options?.colorCount ?? 0;
  if (options?.colorModel && colors >= 4) {
    target += 1;
  } else if (options?.colorModel && colors === 2) {
    const twoColorBase =
      options.colorModel.targets.base_sources_per_color_by_colors?.['2'];
    if (twoColorBase != null && twoColorBase >= 12) {
      target -= 1;
    }
  }

  return Math.min(max, Math.max(min, target));
}

/**
 * Systems 2–4: Fill `landsToAdd` slots using template mix, pip-weighted basics, and EDHREC lands.
 */
export async function fillManaBaseFromTemplate(ctx: ManaBaseFillContext): Promise<number> {
  const {
    commanderCard,
    colorIdentity,
    manaBase,
    landsToAdd,
    profileLands,
    builtCards,
    cardsInDeck,
    addCard,
    notes,
  } = ctx;

  if (landsToAdd <= 0) return 0;

  let landsAddedFill = 0;

  if (colorIdentity.length === 0) {
    for (let i = 0; i < landsToAdd; i++) {
      if (addCard('Wastes')) landsAddedFill++;
    }
    notes.push('Mana base: colorless — Wastes only.');
    return landsAddedFill;
  }

  const maxTapped = manaBase.tapped_lands?.max_total ?? 8;
  const minTypedDuals = manaBase.fetch_policy?.min_typed_duals_total ?? 4;

  const seededLandEntries = builtCards.filter((e) => {
    const c = getCardByName(e.name);
    return c && getPrimaryTypeLine(c).toLowerCase().includes('land');
  });
  let mixRemaining = applySeedLandConsumption(
    computeScaledLandMixTargets(manaBase, landsToAdd),
    seededLandEntries,
    getCardByName
  );

  const basicsPlan = allocateBasicsByPips(commanderCard, colorIdentity, mixRemaining.basics);
  for (const [bName, qty] of basicsPlan) {
    for (let q = 0; q < qty && landsAddedFill < landsToAdd; q++) {
      if (addCard(bName)) landsAddedFill++;
    }
  }
  mixRemaining.basics = 0;
  let basicsAdded = 0;
  for (const qty of basicsPlan.values()) basicsAdded += qty;
  notes.push(`Mana base pip_basics: ${basicsAdded} basics by commander pips.`);

  const supplementLands = await getLandsForColorCombination(
    colorIdentity,
    Math.max(landsToAdd - landsAddedFill + 40, 60)
  );
  const commanderLandSet = new Set(profileLands.map((s) => s.name.toLowerCase()));
  const userLandSet = ctx.userPreferredLandNames?.length
    ? new Set(ctx.userPreferredLandNames.map((n) => n.toLowerCase()))
    : undefined;
  const mergedLands = mergeAndSortLandCandidates(
    profileLands,
    supplementLands,
    commanderLandSet,
    ctx.preferredTheme,
    userLandSet
  );

  const landNamesInDeck = (): string[] =>
    expandQuantifiedNames(
      builtCards.filter((e) => {
        const c = getCardByName(e.name);
        return c && getPrimaryTypeLine(c).toLowerCase().includes('land');
      })
    );

  const tryAddNonBasic = (sug: EdhrecCardSuggestion, ignoreBucket: boolean): boolean => {
    if (landsAddedFill >= landsToAdd) return false;
    if (isBanned(sug.name)) return false;
    const card = getCardByName(sug.name);
    if (!card?.type_line?.toLowerCase().includes('land')) return false;
    if (!landFitsCommanderManabase(card, colorIdentity)) return false;
    const bucket = classifyLandMixBucket(card);
    const names = landNamesInDeck();
    if (bucket === 'fetches' && countFixingDualLands(names, getCardByName) < minTypedDuals) {
      return false;
    }
    const tappedSoFar = countTappedAmongLandNames(names, getCardByName);
    if (countsAsTappedLand(card) && tappedSoFar >= maxTapped) {
      return false;
    }
    if (!ignoreBucket) {
      const key = bucket as keyof LandMixTargets;
      if (mixRemaining[key] > 0) {
        if (addCard(sug.name)) {
          mixRemaining[key]--;
          landsAddedFill++;
          return true;
        }
        return false;
      }
      if (bucket !== 'basics' && mixRemaining.utility_lands > 0 && bucket !== 'fetches') {
        if (addCard(sug.name)) {
          mixRemaining.utility_lands--;
          landsAddedFill++;
          return true;
        }
      }
      return false;
    }
    if (addCard(sug.name)) {
      landsAddedFill++;
      return true;
    }
    return false;
  };

  for (const sug of mergedLands) {
    if (landsAddedFill >= landsToAdd) break;
    tryAddNonBasic(sug, false);
  }
  for (const sug of mergedLands) {
    if (landsAddedFill >= landsToAdd) break;
    if (cardsInDeck.has(sug.name.toLowerCase())) continue;
    tryAddNonBasic(sug, true);
  }

  const basicNamesLoop = colorIdentity.map((c) => COLOR_TO_BASIC_LAND[c]).filter(Boolean) as string[];
  while (landsAddedFill < landsToAdd) {
    const prev = landsAddedFill;
    for (const name of basicNamesLoop) {
      if (landsAddedFill >= landsToAdd) break;
      if (addCard(name)) landsAddedFill++;
    }
    if (landsAddedFill === prev) break;
  }

  notes.push(
    `Mana base template_mix + edhrec_synergy: ${landsAddedFill}/${landsToAdd} lands (tapped cap ${maxTapped}, min duals ${minTypedDuals}).`
  );
  return landsAddedFill;
}
