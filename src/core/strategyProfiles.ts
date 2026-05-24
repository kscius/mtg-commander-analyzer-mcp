/**
 * Load strategy profiles and scoring rules from data/*.json
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StrategySynergyPackage {
  name: string;
  cards: string[];
}

export interface StrategyCategoryPreference {
  prefer?: string;
  min?: number;
  notes?: string;
  examples?: string[];
}

export interface StrategyProfile {
  displayName?: string;
  keyPatterns?: string[];
  preferredCategories?: Record<string, StrategyCategoryPreference>;
  synergyPackages?: StrategySynergyPackage[];
  antisynergyPatterns?: string[];
}

export interface OracleBoostRule {
  pattern: string;
  weight: number;
}

export interface AntiPatternRule {
  pattern: string;
  penalty: number;
}

export interface StrategyScoringRules {
  oracleBoost?: OracleBoostRule[];
  tagBoost?: string[];
  roleBoost?: Record<string, number>;
  antiPatterns?: AntiPatternRule[];
}

const dataDir = path.join(__dirname, '..', '..', 'data');

let profilesCache: Record<string, StrategyProfile> | null = null;
let scoringRulesCache: Record<string, StrategyScoringRules> | null = null;

const normText = (s: string): string =>
  s.toLowerCase().replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim();

/** Clear cached JSON (for tests). */
export function clearStrategyDataCache(): void {
  profilesCache = null;
  scoringRulesCache = null;
}

function textMatchesPatterns(text: string, patterns: string[]): boolean {
  const t = normText(text);
  for (const p of patterns) {
    try {
      if (new RegExp(p, 'i').test(t)) return true;
    } catch {
      // skip invalid pattern
    }
  }
  return false;
}

function readJson<T>(fileName: string): T | null {
  const p = path.join(dataDir, fileName);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function loadStrategyProfiles(): Record<string, StrategyProfile> {
  if (profilesCache) return profilesCache;
  const loaded = readJson<Record<string, StrategyProfile>>('strategy-profiles.json');
  if (loaded) profilesCache = loaded;
  return profilesCache ?? {};
}

export function loadStrategyScoringRules(): Record<string, StrategyScoringRules> {
  if (scoringRulesCache) return scoringRulesCache;
  const loaded = readJson<Record<string, StrategyScoringRules>>('strategy-scoring-rules.json');
  if (loaded) scoringRulesCache = loaded;
  return scoringRulesCache ?? {};
}

export function getStrategyProfile(slug?: string): StrategyProfile | undefined {
  if (!slug?.trim()) return undefined;
  return loadStrategyProfiles()[slug.trim().toLowerCase()];
}

export function getStrategyScoringRules(slug?: string): StrategyScoringRules | undefined {
  if (!slug?.trim()) return undefined;
  return loadStrategyScoringRules()[slug.trim().toLowerCase()];
}

export function getStrategyGuidesIndex(): Record<
  string,
  { file: string; slug: string; title: string }
> {
  return readJson('strategy-guides-index.json') ?? {};
}

/** Union of slugs from strategy guides, profiles, and index (for validation hints). */
export function listKnownStrategySlugs(): string[] {
  const slugs = new Set<string>();
  for (const k of Object.keys(loadStrategyProfiles())) slugs.add(k);
  for (const k of Object.keys(getStrategyGuidesIndex())) slugs.add(k);
  const guidesMeta = readJson<Record<string, unknown>>('strategy-guides.json');
  if (guidesMeta) {
    for (const k of Object.keys(guidesMeta)) slugs.add(k);
  }
  return [...slugs].sort();
}

export function validatePreferredStrategySlug(slug?: string): {
  ok: boolean;
  normalized?: string;
  knownSlugs?: string[];
} {
  if (!slug?.trim()) return { ok: true };
  const normalized = slug.trim().toLowerCase();
  const known = listKnownStrategySlugs();
  if (known.includes(normalized)) return { ok: true, normalized };
  return { ok: false, normalized, knownSlugs: known };
}

/**
 * Bonus when picking cards for a template category under a strategy profile.
 */
export function strategyCategoryPickBonus(
  category: string,
  oracleText: string | undefined,
  slug?: string
): number {
  const profile = getStrategyProfile(slug);
  if (!profile) return 0;
  let bonus = 0;
  const pref = profile.preferredCategories?.[category];
  if (pref?.prefer && oracleText) {
    const t = normText(oracleText);
    const p = pref.prefer.toLowerCase();
    if (p.includes('mass') && /(hexproof|indestructible|can't be destroyed|protection from)/i.test(t)) {
      bonus += 0.25;
    }
    if (p.includes('creature') && /create .* token|token creature/i.test(t)) {
      bonus += 0.2;
    }
    if (p.includes('instant') && /instant/i.test(t)) bonus += 0.15;
    if (p.includes('one-sided') && /(except|you control|your creatures)/i.test(t)) bonus += 0.15;
  }
  if (profile.keyPatterns?.length && oracleText && textMatchesPatterns(oracleText, profile.keyPatterns)) {
    bonus += 0.2;
  }
  return bonus;
}

/**
 * Penalty for oracle text that conflicts with strategy antisynergy patterns.
 */
/**
 * Card names from strategy profile synergyPackages (for early deck seeding).
 */
export function listStrategyPackageCardNames(slug?: string, maxPackages = 3): string[] {
  const profile = getStrategyProfile(slug);
  if (!profile?.synergyPackages?.length) return [];
  const names: string[] = [];
  for (const pkg of profile.synergyPackages.slice(0, maxPackages)) {
    for (const name of pkg.cards) {
      if (name.trim()) names.push(name.trim());
    }
  }
  return names;
}

export function strategyAntisynergyPenalty(oracleText: string | undefined, slug?: string): number {
  if (!oracleText?.trim() || !slug) return 0;
  const t = normText(oracleText);
  const s = slug.trim().toLowerCase();
  // Group slug: incremental damage/drain is on-theme even if text also mentions life totals.
  if (
    s === 'group-slug' &&
    /each (opponent|player) loses|each opponent .* damage|loses .* life/i.test(t)
  ) {
    return 0;
  }
  const profile = getStrategyProfile(slug);
  if (profile?.antisynergyPatterns?.length && textMatchesPatterns(oracleText, profile.antisynergyPatterns)) {
    return 0.35;
  }
  const rules = getStrategyScoringRules(slug);
  if (rules?.antiPatterns) {
    for (const ap of rules.antiPatterns) {
      try {
        if (new RegExp(ap.pattern, 'i').test(normText(oracleText))) return ap.penalty;
      } catch {
        // skip
      }
    }
  }
  return 0;
}
