/**
 * MCP tool: optimize_deck — iterative analyze → swap/cut/add → EDHREC autofill → re-analyze.
 */

import type {
  AnalyzeDeckInput,
  BuiltCardEntry,
  DeckAnalysis,
  DeckRecommendationSwap,
  EdhrecContext,
  OptimizeDeckInput,
  OptimizeDeckResult,
  OptimizeDeckChange,
  OptimizeDeckMetrics,
  ParsedCardEntry,
} from '../core/types';
import { parseDeckText } from '../core/deckParser';
import { analyzeDeckBasic } from '../core/analyzer';
import { formatDecklistText } from '../core/deckTextFormat';
import { getCardByName } from '../core/scryfall';
import {
  cardFitsCommanderColorIdentity,
  COMMANDER_MAINBOARD_SIZE,
  enforceMainboardSize,
} from '../core/commanderFormat';
import { resolveCardNameSync } from '../core/cardResolution';
import { loadDeckTemplate } from '../core/templates';
import { loadBracketRules } from '../core/brackets';
import { getFullCommanderProfile, sortBySynergy } from '../core/edhrec';
import {
  analysisHasAutomatableGaps,
  runSingleEdhrecAutofillPass,
  runLandAutofillPass,
} from '../core/edhrecAutofill';
import { isBanned } from '../core/banlist';
import {
  primaryCategoryToRoles,
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  ScryCard,
} from '../core/autoTags';
import { scoreCardForStrategy } from '../core/synergyScorer';
import {
  attachOptimizeConvergence,
  isDeckConverged,
  resolveOptimizeSynergyTarget,
} from './mcpOutputHelpers';
import { validatePreferredStrategySlug } from '../core/strategyProfiles';

const MAX_CUTS_PER_PASS = 2;
const MAX_ADDS_PER_PASS = 3;
const MAX_SWAPS_PER_PASS = 2;

function parsedToBuilt(cards: ParsedCardEntry[]): BuiltCardEntry[] {
  return cards.map((c) => ({
    name: c.name,
    quantity: c.quantity,
    roles: undefined as BuiltCardEntry['roles'],
  }));
}

function sumQty(cards: BuiltCardEntry[]): number {
  return cards.reduce((s, c) => s + c.quantity, 0);
}

function extractMetrics(analysis: DeckAnalysis): OptimizeDeckMetrics {
  const categoriesBelow = analysis.categories.filter((c) => c.status === 'below').length;
  const lintHardIssues =
    analysis.lintReport?.issues.filter((i) => i.severity === 'hard').length ?? 0;
  return {
    synergyScore: analysis.synergyScore,
    categoriesBelow,
    lintHardIssues,
  };
}

function normalizeMainboard(cards: BuiltCardEntry[], colorIdentity: string[]): BuiltCardEntry[] {
  const { cards: sized } = enforceMainboardSize(
    cards,
    COMMANDER_MAINBOARD_SIZE,
    colorIdentity
  );
  return sized;
}

async function analyzeBuilt(
  cards: BuiltCardEntry[],
  input: OptimizeDeckInput,
  commanderName: string,
  colorIdentity: string[]
): Promise<{ analysis: DeckAnalysis; parsed: ParsedCardEntry[] }> {
  const normalized = normalizeMainboard(cards, colorIdentity);
  const deckText = formatDecklistText(normalized);
  const parsedDeck = parseDeckText(deckText);
  const analyzeInput: AnalyzeDeckInput = {
    deckText,
    commanderName,
    templateId: input.templateId ?? 'bracket3',
    bracketId: input.bracketId ?? 'bracket3',
    banlistId: input.banlistId ?? 'commander',
    preferredStrategy: input.preferredStrategy,
    options: {},
  };
  const result = await analyzeDeckBasic(analyzeInput, parsedDeck);
  return { analysis: result.analysis, parsed: parsedDeck.cards };
}

function synergySortKey(
  name: string,
  preferredStrategy?: string,
  commanderName?: string
): number {
  if (!preferredStrategy?.trim()) return 0.5;
  const card = getCardByName(name);
  if (!card) return 0.5;
  const scry: ScryCard = {
    name: card.name,
    oracle_text: card.oracle_text,
    type_line: card.type_line,
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    all_parts: card.all_parts,
    tags: card.tags,
  };
  return scoreCardForStrategy(scry, preferredStrategy, commanderName);
}

function applySwaps(
  cards: BuiltCardEntry[],
  swaps: DeckRecommendationSwap[],
  colorIdentity: string[],
  preserve: Set<string>,
  changes: OptimizeDeckChange[]
): BuiltCardEntry[] {
  const next = cards.map((c) => ({ ...c }));
  const inDeck = new Set(next.map((c) => c.name.toLowerCase()));
  let swapsDone = 0;

  const ordered = [...swaps].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  );

  for (const swap of ordered) {
    if (swapsDone >= MAX_SWAPS_PER_PASS || sumQty(next) > COMMANDER_MAINBOARD_SIZE) {
      break;
    }
    if (!swap.cut || !swap.add || swap.add.startsWith('(')) continue;
    if (preserve.has(swap.cut.toLowerCase())) continue;

    const cutIdx = next.findIndex((c) => c.name.toLowerCase() === swap.cut.toLowerCase());
    if (cutIdx < 0) continue;
    if (inDeck.has(swap.add.toLowerCase())) continue;

    const resolved = resolveCardNameSync(swap.add);
    const card = resolved?.card ?? getCardByName(swap.add);
    if (!card || !cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
    if (isBanned(card.name)) continue;
    if (card.type_line?.toLowerCase().includes('land')) continue;

    const tagOpts = getDefaultBracket3Options('bracket3');
    const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);

    const cutName = next[cutIdx].name;
    next.splice(cutIdx, 1);
    inDeck.delete(cutName.toLowerCase());

    next.push({
      name: card.name,
      quantity: 1,
      roles: primary ? primaryCategoryToRoles(primary) : undefined,
    });
    inDeck.add(card.name.toLowerCase());

    changes.push({
      type: 'swap',
      name: cutName,
      pairedWith: card.name,
      reason: swap.reason,
    });
    swapsDone++;
  }

  return next;
}

function applyCuts(
  cards: BuiltCardEntry[],
  analysis: DeckAnalysis,
  preserve: Set<string>,
  changes: OptimizeDeckChange[],
  input: OptimizeDeckInput
): BuiltCardEntry[] {
  const next = cards.map((c) => ({ ...c }));
  const cutCandidates = (analysis.recommendations?.cuts ?? [])
    .filter((c) => c.name && !c.name.startsWith('(') && !preserve.has(c.name.toLowerCase()))
    .sort((a, b) => {
      const sa = synergySortKey(a.name, input.preferredStrategy, input.commanderName);
      const sb = synergySortKey(b.name, input.preferredStrategy, input.commanderName);
      return sa - sb;
    });

  let cutsDone = 0;
  for (const cut of cutCandidates) {
    if (cutsDone >= MAX_CUTS_PER_PASS) break;
    const idx = next.findIndex((c) => c.name.toLowerCase() === cut.name.toLowerCase());
    if (idx < 0) continue;
    changes.push({
      type: 'cut',
      name: next[idx].name,
      reason: cut.reason ?? 'Recommended cut',
    });
    next.splice(idx, 1);
    cutsDone++;
  }
  return next;
}

function tryApplyAdds(
  cards: BuiltCardEntry[],
  analysis: DeckAnalysis,
  colorIdentity: string[],
  changes: OptimizeDeckChange[]
): BuiltCardEntry[] {
  const next = [...cards];
  const inDeck = new Set(next.map((c) => c.name.toLowerCase()));
  let addsDone = 0;

  for (const add of analysis.recommendations?.adds ?? []) {
    if (addsDone >= MAX_ADDS_PER_PASS || sumQty(next) >= COMMANDER_MAINBOARD_SIZE) break;
    if (!add.name || add.name.startsWith('(')) continue;
    if (inDeck.has(add.name.toLowerCase())) continue;

    const resolved = resolveCardNameSync(add.name);
    const card = resolved?.card ?? getCardByName(add.name);
    if (!card || !cardFitsCommanderColorIdentity(card, colorIdentity)) continue;
    if (isBanned(card.name)) continue;
    if (card.type_line?.toLowerCase().includes('land')) continue;

    const tagOpts = getDefaultBracket3Options('bracket3');
    const tags = card.tags?.length ? card.tags : autoTags(card as ScryCard, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);

    next.push({
      name: card.name,
      quantity: 1,
      roles: primary ? primaryCategoryToRoles(primary) : undefined,
    });
    inDeck.add(card.name.toLowerCase());
    changes.push({ type: 'add', name: card.name, reason: add.reason });
    addsDone++;
  }
  return next;
}

/**
 * Runs optimize_deck: iterative improvement loop with EDHREC autofill when available.
 */
export async function runOptimizeDeck(input: OptimizeDeckInput): Promise<OptimizeDeckResult> {
  const strategyWarnings: string[] = [];
  if (input.preferredStrategy?.trim()) {
    const slugCheck = validatePreferredStrategySlug(input.preferredStrategy);
    if (!slugCheck.ok) {
      const sample = (slugCheck.knownSlugs ?? []).slice(0, 10).join(', ');
      strategyWarnings.push(
        `Unknown preferredStrategy "${input.preferredStrategy}". Known slugs include: ${sample}. Use get_synergies for commander-specific themes.`
      );
    }
  }

  const templateId = input.templateId ?? 'bracket3';
  const bracketId = input.bracketId ?? 'bracket3';
  const maxIterations = Math.min(Math.max(input.maxIterations ?? 4, 1), 12);
  const focusCategories = input.focusCategories?.map((c) => c.trim().toLowerCase());
  const synergyTarget = resolveOptimizeSynergyTarget({
    preferredStrategy: input.preferredStrategy,
    stopWhenScore: input.stopWhenScore,
  });
  const preserve = new Set(
    (input.preserveCards ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
  );

  const commanderCard = getCardByName(input.commanderName);
  if (!commanderCard) {
    throw new Error(`Commander "${input.commanderName}" not found in card database.`);
  }

  const template = loadDeckTemplate(templateId);
  let bracketRules;
  try {
    bracketRules = loadBracketRules(bracketId);
  } catch {
    bracketRules = undefined;
  }

  const initialParsed = parseDeckText(input.deckText);
  const colorIdentity = commanderCard.color_identity ?? [];
  let built = normalizeMainboard(parsedToBuilt(initialParsed.cards), colorIdentity);
  const changes: OptimizeDeckChange[] = [];
  const iterationNotes: string[] = [];

  let firstAnalysis = (await analyzeBuilt(built, input, input.commanderName, colorIdentity)).analysis;
  const metricsBefore = extractMetrics(firstAnalysis);

  let edhrecContext: EdhrecContext | undefined;
  if (input.preferredStrategy) {
    try {
      const profile = await getFullCommanderProfile(
        commanderCard.name,
        commanderCard.color_identity ?? [],
        { theme: input.preferredStrategy, cardLimit: 100, landLimit: 40, saltThreshold: 2.5 }
      );
      edhrecContext = {
        sourcesUsed: profile.sourcesUsed,
        suggestions: sortBySynergy([...profile.cards, ...profile.lands]),
        availableThemes: profile.themes,
        selectedTheme: input.preferredStrategy,
      };
      iterationNotes.push(`EDHREC pool: ${edhrecContext.suggestions.length} suggestions.`);
    } catch {
      iterationNotes.push('EDHREC unavailable; using recommendations and search placeholders only.');
    }
  }

  for (let pass = 1; pass <= maxIterations; pass++) {
    built = normalizeMainboard(built, colorIdentity);
    const { analysis } = await analyzeBuilt(built, input, input.commanderName, colorIdentity);
    const metrics = extractMetrics(analysis);

    const focusedBelow = analysis.categories.filter((c) => {
      if (focusCategories?.length && !focusCategories.includes(c.name)) return false;
      return c.status === 'below';
    }).length;

    iterationNotes.push(
      `Pass ${pass}: synergy ${metrics.synergyScore ?? 'n/a'}, categories below: ${focusedBelow}, lint hard: ${metrics.lintHardIssues}`
    );

    if (
      input.stopWhenScore != null &&
      metrics.synergyScore != null &&
      metrics.synergyScore >= input.stopWhenScore
    ) {
      iterationNotes.push(
        `Pass ${pass}: stopped — synergy ${metrics.synergyScore} >= target ${input.stopWhenScore}.`
      );
      firstAnalysis = analysis;
      break;
    }

    if (
      isDeckConverged(analysis, {
        focusCategories,
        synergyTarget,
      })
    ) {
      iterationNotes.push(`Pass ${pass}: converged — no remaining automatable gaps.`);
      firstAnalysis = analysis;
      break;
    }

    const beforeQty = sumQty(built);
    const swaps = analysis.recommendations?.swaps ?? [];
    built = applySwaps(built, swaps, colorIdentity, preserve, changes);
    built = applyCuts(built, analysis, preserve, changes, input);
    built = tryApplyAdds(built, analysis, colorIdentity, changes);

    if (edhrecContext?.suggestions.length) {
      const landsBelow = analysis.categories.some(
        (c) => c.name === 'lands' && c.status === 'below'
      );
      if (landsBelow) {
        const landPass = runLandAutofillPass(
          built,
          analysis,
          template,
          colorIdentity,
          edhrecContext
        );
        built = landPass.newCards;
        iterationNotes.push(...landPass.passNotes);
      }

      if (analysisHasAutomatableGaps(analysis)) {
        const { newCards, addedCount, passNotes } = runSingleEdhrecAutofillPass(
          built,
          analysis,
          template,
          commanderCard,
          colorIdentity,
          bracketId,
          bracketRules,
          edhrecContext
        );
        built = newCards;
        iterationNotes.push(...passNotes);
        if (addedCount > 0) {
          iterationNotes.push(`EDHREC autofill added ${addedCount} card(s) on pass ${pass}.`);
        }
      }
    }

    built = normalizeMainboard(built, colorIdentity);

    if (sumQty(built) === beforeQty && pass > 1) {
      iterationNotes.push(`Pass ${pass}: no changes applied — stopping.`);
      firstAnalysis = analysis;
      break;
    }

    firstAnalysis = analysis;
  }

  built = normalizeMainboard(built, colorIdentity);
  const finalDeckText = formatDecklistText(built);
  const { analysis: finalAnalysis } = await analyzeBuilt(
    built,
    input,
    input.commanderName,
    colorIdentity
  );
  const metricsAfter = extractMetrics(finalAnalysis);

  return attachOptimizeConvergence(
    {
      input: {
        commanderName: input.commanderName,
        preferredStrategy: input.preferredStrategy,
        templateId,
        bracketId,
        maxIterations,
        focusCategories,
      },
      deckText: finalDeckText,
      decklistText: finalDeckText,
      changes,
      metricsBefore,
      metricsAfter,
      analysis: finalAnalysis,
      iterationNotes: [...strategyWarnings, ...iterationNotes],
    },
    synergyTarget
  );
}
