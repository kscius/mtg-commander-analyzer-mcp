/**
 * Load and analyze the user's imported Commander decks (data/my_decks).
 * Read-only — used as style reference for mana base and construction patterns.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseDeckText } from './deckParser';
import { getCardByName } from './scryfall';
import { getPrimaryTypeLine } from './scryfallNormalize';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  type ScryCard,
} from './autoTags';
import { classifyLandMixBucket, countsAsTappedLand, type LandMixBucket } from './manabaseLandHeuristics';
import { USER_DECK_INDEX_FILE, USER_DECK_LIBRARY_DIR } from './userDeckPaths';

export interface UserDeckIndexEntry {
  name: string;
  publicId: string;
  format?: string;
  sourceUrl: string;
  txtFile: string;
  jsonFile?: string;
  commanderCount?: number;
  mainboardCount?: number;
  totalCards?: number;
  downloadedAt?: string;
  error?: string;
}

export interface UserDeckIndex {
  downloadedAt?: string;
  deckCount?: number;
  successCount?: number;
  failureCount?: number;
  decks: UserDeckIndexEntry[];
}

export interface UserDeckCardMetrics {
  name: string;
  category: string | null;
  isLand: boolean;
  landBucket?: LandMixBucket;
  tapped?: boolean;
}

export interface UserDeckSnapshot {
  name: string;
  publicId: string;
  sourceUrl: string;
  txtFile: string;
  commanderName: string | null;
  commanderNames: string[];
  colorIdentity: string[];
  colorCount: number;
  mainboardCount: number;
  landCount: number;
  tappedLandCount: number;
  landMix: Record<LandMixBucket, number>;
  categoryCounts: Record<string, number>;
  landNames: string[];
  cards: UserDeckCardMetrics[];
}

export interface LandStapleStat {
  name: string;
  deckCount: number;
  share: number;
}

export interface UserDeckStyleProfile {
  libraryPath: string;
  deckCount: number;
  analyzedAt: string;
  landCount: { avg: number; min: number; max: number; p25: number; p75: number };
  tappedLandCount: { avg: number };
  landMixAverages: Record<LandMixBucket, number>;
  categoryAverages: Record<string, number>;
  topLandStaples: LandStapleStat[];
  topNonLandStaples: LandStapleStat[];
  byColorCount: Record<
    string,
    {
      deckCount: number;
      landCountAvg: number;
      categoryAverages: Record<string, number>;
      topLandStaples: LandStapleStat[];
    }
  >;
  decks: Array<{
    name: string;
    publicId: string;
    commanderName: string | null;
    colorIdentity: string[];
    landCount: number;
    txtFile: string;
  }>;
}

let cachedProfile: UserDeckStyleProfile | null = null;
let cachedIndexMtime = 0;

function projectRoot(): string {
  return path.join(__dirname, '..', '..');
}

function resolveTxtPath(txtFile: string): string {
  if (path.isAbsolute(txtFile)) return txtFile;
  return path.join(projectRoot(), txtFile.replace(/\//g, path.sep));
}

export function loadUserDeckIndex(): UserDeckIndex | null {
  const indexPath = path.join(USER_DECK_LIBRARY_DIR, USER_DECK_INDEX_FILE);
  if (!fs.existsSync(indexPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as UserDeckIndex;
  } catch {
    return null;
  }
}

function isLandCard(name: string): boolean {
  const card = getCardByName(name);
  if (!card) return false;
  return getPrimaryTypeLine(card).toLowerCase().includes('land');
}

function commanderNamesFromTxt(text: string, parsedCommander: string | null): string[] {
  const names: string[] = [];
  if (parsedCommander) names.push(parsedCommander);
  const re = /^\s*commander\s*:\s*(.+)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1].trim();
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
  }
  return names;
}

function colorIdentityForCommanders(commanderNames: string[]): string[] {
  const colors = new Set<string>();
  for (const name of commanderNames) {
    const card = getCardByName(name);
    if (card?.color_identity) {
      for (const c of card.color_identity) colors.add(c);
    }
  }
  return [...colors].sort();
}

export function analyzeUserDeckFromText(
  entry: UserDeckIndexEntry,
  deckText: string
): UserDeckSnapshot | null {
  if (entry.error) return null;

  const parsed = parseDeckText(deckText);
  const commanderNames = commanderNamesFromTxt(deckText, parsed.commanderName ?? null);
  const colorIdentity = colorIdentityForCommanders(commanderNames);

  const landMix: Record<LandMixBucket, number> = {
    basics: 0,
    fetches: 0,
    shock_lands: 0,
    typed_duals: 0,
    mdfc_lands: 0,
    colorless_lands: 0,
    utility_lands: 0,
  };
  const categoryCounts: Record<string, number> = {};
  const landNames: string[] = [];
  const cards: UserDeckCardMetrics[] = [];
  let tappedLandCount = 0;

  for (const line of parsed.cards) {
    const card = getCardByName(line.name);
    const land = card ? getPrimaryTypeLine(card).toLowerCase().includes('land') : isLandCard(line.name);
    let category: string | null = null;
    let landBucket: LandMixBucket | undefined;
    let tapped: boolean | undefined;

    if (card) {
      if (land) {
        landBucket = classifyLandMixBucket(card);
        landMix[landBucket]++;
        landNames.push(card.name);
        if (countsAsTappedLand(card)) tappedLandCount++;
        tapped = countsAsTappedLand(card);
        category = 'lands';
      } else {
        const tags = card.tags?.length
          ? card.tags
          : autoTags(card as ScryCard, getDefaultBracket3Options('bracket3'));
        category = getPrimaryTemplateCategory(tags);
      }
    }

    if (category) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + line.quantity;
    }

    cards.push({
      name: line.name,
      category,
      isLand: land,
      landBucket,
      tapped,
    });
  }

  const mainboardCount = parsed.cards.reduce((s, c) => s + c.quantity, 0);
  const landCount = landNames.length;

  return {
    name: entry.name,
    publicId: entry.publicId,
    sourceUrl: entry.sourceUrl,
    txtFile: entry.txtFile,
    commanderName: commanderNames[0] ?? null,
    commanderNames,
    colorIdentity,
    colorCount: colorIdentity.length,
    mainboardCount,
    landCount,
    tappedLandCount,
    landMix,
    categoryCounts,
    landNames,
    cards,
  };
}

export function loadUserDeckSnapshots(): UserDeckSnapshot[] {
  const index = loadUserDeckIndex();
  if (!index?.decks?.length) return [];

  const snapshots: UserDeckSnapshot[] = [];
  for (const entry of index.decks) {
    if (entry.error || !entry.txtFile) continue;
    const txtPath = resolveTxtPath(entry.txtFile);
    if (!fs.existsSync(txtPath)) continue;
    const text = fs.readFileSync(txtPath, 'utf8');
    const snap = analyzeUserDeckFromText(entry, text);
    if (snap) snapshots.push(snap);
  }
  return snapshots;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function topStaples(
  counts: Map<string, number>,
  deckCount: number,
  limit = 25
): LandStapleStat[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => ({
      name,
      deckCount: n,
      share: deckCount > 0 ? Math.round((n / deckCount) * 1000) / 1000 : 0,
    }));
}

export function buildUserDeckStyleProfile(snapshots: UserDeckSnapshot[]): UserDeckStyleProfile {
  const deckCount = snapshots.length;
  const landCounts = snapshots.map((s) => s.landCount).sort((a, b) => a - b);
  const tappedAvgs =
    deckCount > 0
      ? snapshots.reduce((s, d) => s + d.tappedLandCount, 0) / deckCount
      : 0;

  const landMixTotals: Record<LandMixBucket, number> = {
    basics: 0,
    fetches: 0,
    shock_lands: 0,
    typed_duals: 0,
    mdfc_lands: 0,
    colorless_lands: 0,
    utility_lands: 0,
  };
  const categoryTotals: Record<string, number> = {};
  const landFreq = new Map<string, number>();
  const nonLandFreq = new Map<string, number>();

  const byColorCount: UserDeckStyleProfile['byColorCount'] = {};

  for (const snap of snapshots) {
    for (const bucket of Object.keys(landMixTotals) as LandMixBucket[]) {
      landMixTotals[bucket] += snap.landMix[bucket] ?? 0;
    }
    for (const [cat, n] of Object.entries(snap.categoryCounts)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + n;
    }
    const landSet = new Set<string>();
    for (const ln of snap.landNames) {
      landSet.add(ln);
      if (!landFreq.has(ln)) landFreq.set(ln, 0);
    }
    for (const ln of landSet) landFreq.set(ln, (landFreq.get(ln) ?? 0) + 1);

    for (const c of snap.cards) {
      if (c.isLand) continue;
      nonLandFreq.set(c.name, (nonLandFreq.get(c.name) ?? 0) + 1);
    }

    const ccKey = String(snap.colorCount);
    if (!byColorCount[ccKey]) {
      byColorCount[ccKey] = {
        deckCount: 0,
        landCountAvg: 0,
        categoryAverages: {},
        topLandStaples: [],
      };
    }
    const bucket = byColorCount[ccKey];
    bucket.deckCount++;
    bucket.landCountAvg += snap.landCount;
    for (const [cat, n] of Object.entries(snap.categoryCounts)) {
      bucket.categoryAverages[cat] = (bucket.categoryAverages[cat] ?? 0) + n;
    }
    const localLandFreq = new Map<string, number>();
    for (const ln of snap.landNames) {
      localLandFreq.set(ln, (localLandFreq.get(ln) ?? 0) + 1);
    }
    for (const [name, n] of localLandFreq) {
      const existing = bucket.topLandStaples.find((s) => s.name === name);
      if (existing) existing.deckCount += 1;
      else bucket.topLandStaples.push({ name, deckCount: 1, share: 0 });
    }
  }

  for (const key of Object.keys(byColorCount)) {
    const b = byColorCount[key];
    if (b.deckCount > 0) {
      b.landCountAvg = Math.round((b.landCountAvg / b.deckCount) * 10) / 10;
      for (const cat of Object.keys(b.categoryAverages)) {
        b.categoryAverages[cat] =
          Math.round((b.categoryAverages[cat] / b.deckCount) * 10) / 10;
      }
      b.topLandStaples = b.topLandStaples
        .sort((a, b2) => b2.deckCount - a.deckCount)
        .slice(0, 15)
        .map((s) => ({
          ...s,
          share: Math.round((s.deckCount / b.deckCount) * 1000) / 1000,
        }));
    }
  }

  const landMixAverages = {} as Record<LandMixBucket, number>;
  for (const bucket of Object.keys(landMixTotals) as LandMixBucket[]) {
    landMixAverages[bucket] =
      deckCount > 0 ? Math.round((landMixTotals[bucket] / deckCount) * 10) / 10 : 0;
  }

  const categoryAverages: Record<string, number> = {};
  for (const [cat, total] of Object.entries(categoryTotals)) {
    categoryAverages[cat] =
      deckCount > 0 ? Math.round((total / deckCount) * 10) / 10 : 0;
  }

  return {
    libraryPath: USER_DECK_LIBRARY_DIR,
    deckCount,
    analyzedAt: new Date().toISOString(),
    landCount: {
      avg:
        deckCount > 0
          ? Math.round((landCounts.reduce((a, b) => a + b, 0) / deckCount) * 10) / 10
          : 0,
      min: landCounts[0] ?? 0,
      max: landCounts[landCounts.length - 1] ?? 0,
      p25: percentile(landCounts, 0.25),
      p75: percentile(landCounts, 0.75),
    },
    tappedLandCount: { avg: Math.round(tappedAvgs * 10) / 10 },
    landMixAverages,
    categoryAverages,
    topLandStaples: topStaples(landFreq, deckCount),
    topNonLandStaples: topStaples(nonLandFreq, deckCount, 20),
    byColorCount,
    decks: snapshots.map((s) => ({
      name: s.name,
      publicId: s.publicId,
      commanderName: s.commanderName,
      colorIdentity: s.colorIdentity,
      landCount: s.landCount,
      txtFile: s.txtFile,
    })),
  };
}

export function getUserDeckStyleProfile(forceRefresh = false): UserDeckStyleProfile {
  const indexPath = path.join(USER_DECK_LIBRARY_DIR, USER_DECK_INDEX_FILE);
  const mtime = fs.existsSync(indexPath) ? fs.statSync(indexPath).mtimeMs : 0;
  if (!forceRefresh && cachedProfile && mtime === cachedIndexMtime) {
    return cachedProfile;
  }
  const snapshots = loadUserDeckSnapshots();
  cachedProfile = buildUserDeckStyleProfile(snapshots);
  cachedIndexMtime = mtime;
  return cachedProfile;
}

export interface CommanderStyleHints {
  colorCount: number;
  targetLandCount: number;
  preferredLandNames: string[];
  categoryTargets: Record<string, number>;
  referenceDecks: Array<{ name: string; commanderName: string | null; landCount: number }>;
  notes: string[];
}

/**
 * Derive build hints from user decks with matching color count (and optional commander name match).
 */
export function getCommanderStyleHints(
  commanderName: string,
  colorIdentity: string[],
  profile?: UserDeckStyleProfile
): CommanderStyleHints {
  const p = profile ?? getUserDeckStyleProfile();
  const colorCount = colorIdentity.length;
  const ccKey = String(colorCount);
  const notes: string[] = [];

  const matching = loadUserDeckSnapshots().filter((s) => {
    if (s.colorCount !== colorCount) return false;
    const cmdMatch = s.commanderNames.some(
      (n) => n.toLowerCase() === commanderName.toLowerCase()
    );
    return cmdMatch || s.colorIdentity.join('') === [...colorIdentity].sort().join('');
  });

  let targetLandCount = p.landCount.avg;
  const colorBucket = p.byColorCount[ccKey];
  if (colorBucket?.deckCount) {
    targetLandCount = colorBucket.landCountAvg;
    notes.push(
      `User style (${colorCount}-color): avg ${colorBucket.landCountAvg} lands across ${colorBucket.deckCount} reference deck(s).`
    );
  } else if (p.deckCount > 0) {
    notes.push(`User style (global): avg ${p.landCount.avg} lands across ${p.deckCount} decks.`);
  }

  const landNameScores = new Map<string, number>();
  const sourceDecks = matching.length > 0 ? matching : loadUserDeckSnapshots();
  for (const snap of sourceDecks) {
    if (snap.colorCount !== colorCount && matching.length > 0) continue;
    for (const ln of snap.landNames) {
      const card = getCardByName(ln);
      if (card && !cardFitsColor(ln, colorIdentity)) continue;
      landNameScores.set(ln, (landNameScores.get(ln) ?? 0) + 1);
    }
  }

  const preferredLandNames = [...landNameScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name]) => name);

  const categoryTargets: Record<string, number> = {};
  if (colorBucket?.deckCount) {
    Object.assign(categoryTargets, colorBucket.categoryAverages);
  } else {
    Object.assign(categoryTargets, p.categoryAverages);
  }

  return {
    colorCount,
    targetLandCount: Math.round(targetLandCount),
    preferredLandNames,
    categoryTargets,
    referenceDecks: (matching.length ? matching : sourceDecks.slice(0, 5)).map((s) => ({
      name: s.name,
      commanderName: s.commanderName,
      landCount: s.landCount,
    })),
    notes,
  };
}

function cardFitsColor(name: string, colorIdentity: string[]): boolean {
  const card = getCardByName(name);
  if (!card) return true;
  const id = card.color_identity ?? [];
  return id.every((c) => colorIdentity.includes(c));
}
