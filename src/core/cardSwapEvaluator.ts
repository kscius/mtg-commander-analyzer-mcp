/**
 * Evaluate a single card swap (remove + add) against current deck analysis.
 */

import { parseDeckText } from './deckParser';
import { analyzeDeckBasic } from './analyzer';
import type { AnalyzeDeckInput, CategorySummary, DeckAnalysis } from './types';
import { getCardByName } from './scryfall';
import { resolveCardNameSync } from './cardResolution';

export interface EvaluateCardSwapInput {
  deckText: string;
  commanderName: string;
  cardToRemove: string;
  cardToAdd: string;
  preferredStrategy?: string;
  templateId?: string;
  bracketId?: string;
}

export interface CategoryDelta {
  name: string;
  before: number;
  after: number;
  statusBefore: string;
  statusAfter: string;
}

export interface EvaluateCardSwapResult {
  recommendation: 'proceed' | 'skip';
  reason: string;
  synergyScoreBefore?: number;
  synergyScoreAfter?: number;
  synergyScoreDelta?: number;
  categoryDeltas: CategoryDelta[];
  newWarnings: string[];
  resolvedCards: {
    removed: string;
    added: string;
  };
  removedCardFound: boolean;
  addedCardFound: boolean;
}

/**
 * True when `cardName` appears as a mainboard line (exact or via sync name resolution).
 */
function deckContainsCard(deckText: string, cardName: string): boolean {
  const target = cardName.trim().toLowerCase();
  if (!target) return false;
  const parsed = parseDeckText(deckText);
  return parsed.cards.some((entry) => {
    if (entry.name.toLowerCase() === target) return true;
    const resolved = resolveCardNameSync(entry.name);
    return (resolved?.canonicalName ?? '').toLowerCase() === target;
  });
}

/**
 * Replace the first matching remove line with the add card.
 * Does **not** append the add when the remove name is missing — that would inflate the mainboard.
 */
function applySwap(
  deckText: string,
  removeName: string,
  addName: string
): { deckText: string; replaced: boolean } {
  const lines = deckText.split(/\r?\n/);
  const removeLower = removeName.trim().toLowerCase();
  let replaced = false;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    const m = trimmed.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const name = m[2].trim();
      const nameLower = name.toLowerCase();
      const resolvedLine = resolveCardNameSync(name);
      const matchesRemove =
        nameLower === removeLower ||
        (resolvedLine?.canonicalName ?? '').toLowerCase() === removeLower;
      if (!replaced && matchesRemove) {
        out.push(`1 ${addName.trim()}`);
        replaced = true;
        continue;
      }
    }
    out.push(line);
  }
  return { deckText: out.join('\n'), replaced };
}

function categoryDeltas(before: CategorySummary[], after: CategorySummary[]): CategoryDelta[] {
  const byName = new Map(after.map((c) => [c.name, c]));
  const deltas: CategoryDelta[] = [];
  for (const b of before) {
    const a = byName.get(b.name);
    if (!a) continue;
    if (b.count !== a.count || b.status !== a.status) {
      deltas.push({
        name: b.name,
        before: b.count,
        after: a.count,
        statusBefore: b.status,
        statusAfter: a.status,
      });
    }
  }
  return deltas;
}

function newWarningsOnly(before: DeckAnalysis, after: DeckAnalysis): string[] {
  const prev = new Set(before.bracketWarnings);
  return after.bracketWarnings.filter((w) => !prev.has(w));
}

function decideRecommendation(
  deltas: CategoryDelta[],
  synergyDelta: number | undefined,
  newWarns: string[],
  removedFound: boolean,
  addedFound: boolean
): { recommendation: 'proceed' | 'skip'; reason: string } {
  if (!removedFound) {
    return { recommendation: 'skip', reason: 'Card to remove was not found in the decklist.' };
  }
  if (!addedFound) {
    return { recommendation: 'skip', reason: 'Card to add was not found in the card database.' };
  }
  if (newWarns.length > 0) {
    return {
      recommendation: 'skip',
      reason: `Swap introduces new Bracket warnings: ${newWarns.join('; ')}`,
    };
  }

  const improved = deltas.filter(
    (d) =>
      (d.statusBefore === 'below' && d.statusAfter !== 'below') ||
      (d.statusBefore === 'above' && d.statusAfter !== 'above')
  );
  const worsened = deltas.filter(
    (d) =>
      (d.statusBefore !== 'below' && d.statusAfter === 'below') ||
      (d.statusBefore !== 'above' && d.statusAfter === 'above')
  );

  if (worsened.length > 0 && improved.length === 0) {
    return {
      recommendation: 'skip',
      reason: `Categories worsen: ${worsened.map((d) => d.name).join(', ')}`,
    };
  }

  if (synergyDelta != null && synergyDelta < -5) {
    return {
      recommendation: 'skip',
      reason: `Synergy score drops by ${Math.abs(synergyDelta)} points.`,
    };
  }

  if (improved.length > 0 || (synergyDelta != null && synergyDelta >= 2)) {
    const parts: string[] = [];
    if (improved.length) parts.push(`Improves: ${improved.map((d) => d.name).join(', ')}`);
    if (synergyDelta != null && synergyDelta > 0) parts.push(`Synergy +${synergyDelta}`);
    return { recommendation: 'proceed', reason: parts.join('. ') || 'Neutral or positive swap.' };
  }

  if (deltas.length === 0 && (synergyDelta == null || Math.abs(synergyDelta) <= 1)) {
    return { recommendation: 'skip', reason: 'Minimal impact; consider a higher-leverage swap.' };
  }

  return { recommendation: 'proceed', reason: 'Category or synergy metrics improve or stay stable.' };
}

export async function evaluateCardSwap(input: EvaluateCardSwapInput): Promise<EvaluateCardSwapResult> {
  const resolvedRemove = resolveCardNameSync(input.cardToRemove);
  const resolvedAdd = resolveCardNameSync(input.cardToAdd);
  const removeCanonical = resolvedRemove?.canonicalName ?? input.cardToRemove.trim();
  const addCanonical = resolvedAdd?.canonicalName ?? input.cardToAdd.trim();
  // Membership is decklist presence — not "name exists in cards.db".
  const removedFound = deckContainsCard(input.deckText, removeCanonical);
  const addedFound = !!getCardByName(addCanonical) || !!resolvedAdd;

  const baseInput: AnalyzeDeckInput = {
    deckText: input.deckText,
    commanderName: input.commanderName,
    templateId: input.templateId ?? 'bracket3',
    bracketId: input.bracketId ?? 'bracket3',
    preferredStrategy: input.preferredStrategy,
  };

  const parsedBefore = parseDeckText(input.deckText);
  const beforeResult = await analyzeDeckBasic(baseInput, parsedBefore);
  const { deckText: swappedText, replaced } = applySwap(
    input.deckText,
    removeCanonical,
    addCanonical
  );
  // Keep flags consistent if line matching and membership diverge (e.g. punctuation variants).
  const removeInDeck = removedFound && replaced;
  const parsedAfter = parseDeckText(swappedText);
  const afterResult = await analyzeDeckBasic({ ...baseInput, deckText: swappedText }, parsedAfter);

  const deltas = categoryDeltas(beforeResult.analysis.categories, afterResult.analysis.categories);
  const synergyBefore = beforeResult.analysis.synergyScore;
  const synergyAfter = afterResult.analysis.synergyScore;
  const synergyDelta =
    synergyBefore != null && synergyAfter != null ? synergyAfter - synergyBefore : undefined;
  const newWarns = newWarningsOnly(beforeResult.analysis, afterResult.analysis);
  const { recommendation, reason } = decideRecommendation(
    deltas,
    synergyDelta,
    newWarns,
    removeInDeck,
    addedFound
  );

  return {
    recommendation,
    reason,
    synergyScoreBefore: synergyBefore,
    synergyScoreAfter: synergyAfter,
    synergyScoreDelta: synergyDelta,
    categoryDeltas: deltas,
    newWarnings: newWarns,
    resolvedCards: { removed: removeCanonical, added: addCanonical },
    removedCardFound: removeInDeck,
    addedCardFound: addedFound,
  };
}
