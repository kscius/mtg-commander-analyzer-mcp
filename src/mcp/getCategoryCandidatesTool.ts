/**
 * MCP tool: get_category_candidates — ranked cards for a template category gap.
 */

import {
  GetCategoryCandidatesInputSchema,
  type GetCategoryCandidatesInput,
} from '../core/schemas';
import { searchCardsFiltered, isDatabaseReady } from '../core/cardDatabase';
import { autoTags, getDefaultBracket3Options, getPrimaryTemplateCategory, ScryCard } from '../core/autoTags';
import { scoreCardSynergyRelevance } from '../core/synergyScorer';
import { getCardByName } from '../core/scryfall';
import type { EdhrecCardSuggestion } from '../core/types';

export type SynergyRelevance = 'high' | 'medium' | 'low';

function relevanceLabel(score: number): SynergyRelevance {
  if (score >= 0.55) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
}

export async function runGetCategoryCandidates(raw: unknown): Promise<{
  candidates: Array<{
    name: string;
    mv: number;
    primaryCategory: string | null;
    synergyRelevance: SynergyRelevance;
    type: string;
  }>;
  count: number;
  category: string;
  commanderName: string;
  databaseReady: boolean;
  summary?: string;
  nextSuggestedAction?: string;
  error?: string;
}> {
  const input: GetCategoryCandidatesInput = GetCategoryCandidatesInputSchema.parse(raw);
  const category = input.category.trim().toLowerCase();
  const commanderName = input.commanderName.trim();

  if (!isDatabaseReady()) {
    const dbFix =
      'Run: npm rebuild better-sqlite3 && npm run db:create && npm run db:import. See docs/agent-mcp-troubleshooting.md.';
    return {
      candidates: [],
      count: 0,
      category,
      commanderName,
      databaseReady: false,
      error: 'Card database is not available.',
      summary: 'Database unavailable — cannot list category candidates.',
      nextSuggestedAction: dbFix,
    };
  }

  const commander = getCardByName(commanderName);
  if (!commander) {
    return {
      candidates: [],
      count: 0,
      category,
      commanderName,
      databaseReady: true,
      error: `Commander "${commanderName}" not found in cards.db.`,
      summary: 'Unknown commander — use resolve_card to verify the exact name.',
      nextSuggestedAction: 'resolve_card with the commander name, then retry.',
    };
  }

  const colorIdentity = commander.color_identity ?? [];
  const limit = input.limit ?? 15;
  const strategy = input.preferredStrategy?.trim().toLowerCase();
  const exclude = new Set(
    (input.excludeNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
  const tagOpts = getDefaultBracket3Options('bracket3');

  const hits = searchCardsFiltered({
    colorIdentity,
    category,
    commanderLegal: true,
    maxMV: input.maxMV,
    limit: Math.min(limit * 8, 80),
  });

  const filtered = hits.filter((c) => {
    if (exclude.has(c.name.toLowerCase())) return false;
    if ((c.type_line ?? '').toLowerCase().includes('land')) return false;
    const scry: ScryCard = {
      name: c.name,
      oracle_text: c.oracle_text ?? undefined,
      type_line: c.type_line ?? undefined,
      mana_cost: c.mana_cost ?? undefined,
      cmc: c.cmc ?? undefined,
    };
    const tags = c.tags?.length ? c.tags : autoTags(scry, tagOpts);
    const primary = getPrimaryTemplateCategory(tags);
    return primary === category;
  });

  type Scored = (typeof filtered)[0] & { relevanceScore: number; primaryCategory: string | null };

  const scored: Scored[] = filtered.map((c) => {
    const scry: ScryCard = {
      name: c.name,
      oracle_text: c.oracle_text ?? undefined,
      type_line: c.type_line ?? undefined,
      mana_cost: c.mana_cost ?? undefined,
      cmc: c.cmc ?? undefined,
    };
    const tags = c.tags?.length ? c.tags : autoTags(scry, tagOpts);
    const primaryCategory = getPrimaryTemplateCategory(tags);
    let relevanceScore = 0;
    if (strategy) {
      const edhrecStub: EdhrecCardSuggestion = { name: c.name, rank: c.edhrec_rank ?? undefined };
      relevanceScore = scoreCardSynergyRelevance(c.name, strategy, edhrecStub).sortScore;
    } else if (c.edhrec_rank != null) {
      relevanceScore = Math.max(0, 1 - c.edhrec_rank / 5000);
    }
    return { ...c, relevanceScore, primaryCategory };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const seen = new Set<string>();
  const candidates = [];
  for (const c of scored) {
    const key = (c.oracle_id ?? c.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      name: c.name,
      mv: c.cmc ?? 0,
      primaryCategory: c.primaryCategory,
      synergyRelevance: relevanceLabel(c.relevanceScore),
      type: c.type_line ?? '',
    });
    if (candidates.length >= limit) break;
  }

  const summary =
    candidates.length > 0
      ? `${candidates.length} candidate(s) for ${category} in ${commanderName}'s colors.`
      : `No ${category} candidates found — try search_cards with a query or relax maxMV.`;

  const nextSuggestedAction =
    candidates.length > 0
      ? 'Use evaluate_card_swap or apply_deck_changes to add a candidate; then analyze_deck.'
      : 'search_cards with category and commanderName, or optimize_deck for automated fills.';

  return {
    candidates,
    count: candidates.length,
    category,
    commanderName,
    databaseReady: true,
    summary,
    nextSuggestedAction,
  };
}
