/**
 * MCP tool: search_cards — query local card database with FTS, filters, and synergy relevance.
 */

import { SearchCardsInputSchema, type SearchCardsInput } from '../core/schemas';
import { searchCardsFiltered, isDatabaseReady, type DatabaseCard } from '../core/cardDatabase';
import { autoTags, getDefaultBracket3Options, ScryCard } from '../core/autoTags';
import { scoreCardSynergyRelevance } from '../core/synergyScorer';
import { edhrecInclusionPercent } from '../core/edhrecStrategyScoring';
import { getCardByName } from '../core/scryfall';
import type { EdhrecCardSuggestion } from '../core/types';

export type SynergyRelevance = 'high' | 'medium' | 'low';

function hasSearchFilter(input: SearchCardsInput): boolean {
  return Boolean(
    input.query?.trim() ||
      (input.colorIdentity?.length ?? 0) > 0 ||
      input.commanderName?.trim() ||
      input.category?.trim() ||
      input.type?.trim() ||
      input.maxMV != null ||
      input.commanderLegal === false
  );
}

function dedupeByOracleId<T extends { oracle_id: string | null; name: string }>(
  rows: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.oracle_id ?? row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export async function runSearchCards(raw: unknown): Promise<{
  cards: Array<{
    name: string;
    type: string;
    mv: number;
    oracleText: string;
    tags: string[];
    edhrecRank: number | null;
    synergyRelevance?: SynergyRelevance;
    edhrecInclusionRate?: number | null;
  }>;
  count: number;
  databaseReady: boolean;
  error?: string;
  warning?: string;
  summary?: string;
  nextSuggestedAction?: string;
}> {
  const input: SearchCardsInput = SearchCardsInputSchema.parse(raw);

  if (!isDatabaseReady()) {
    const dbFix =
      'Run: npm rebuild better-sqlite3 && npm run db:create && npm run db:import. See docs/agent-mcp-troubleshooting.md.';
    if (!hasSearchFilter(input)) {
      return {
        cards: [],
        count: 0,
        databaseReady: false,
        error:
          'Card database is not available. Run npm run db:create && npm run db:import. Provide at least one filter (query, category, colorIdentity, type, or maxMV) when documenting searches.',
        summary: 'Database unavailable — card search cannot run.',
        nextSuggestedAction: dbFix,
      };
    }
    return {
      cards: [],
      count: 0,
      databaseReady: false,
      warning:
        'Card database is not available (npm run db:create && npm run db:import). Cannot return card results.',
      summary: 'Database unavailable — no cards returned.',
      nextSuggestedAction: dbFix,
    };
  }

  if (!hasSearchFilter(input)) {
    return {
      cards: [],
      count: 0,
      databaseReady: true,
      error:
        'At least one filter is required: query, colorIdentity, category, type, maxMV, or commanderLegal=false.',
      summary: 'search_cards requires at least one filter.',
      nextSuggestedAction:
        'Call search_cards with category and colorIdentity from analyze_deck prioritizedActions.suggestedSearch.',
    };
  }

  const limit = input.limit ?? 20;
  let colorIdentity = input.colorIdentity;
  if ((!colorIdentity || colorIdentity.length === 0) && input.commanderName?.trim()) {
    const commander = getCardByName(input.commanderName.trim());
    if (commander?.color_identity?.length) {
      colorIdentity = commander.color_identity;
    }
  }
  const strategy = input.preferredStrategy?.trim().toLowerCase();
  const categoryTag = input.category?.trim().toLowerCase();
  const exclude = new Set(
    (input.excludeNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean)
  );
  const sortBy = input.sortBy ?? 'synergyRelevance';

  const hits = searchCardsFiltered({
    query: input.query,
    colorIdentity,
    category: categoryTag ? undefined : input.category,
    type: input.type,
    maxMV: input.maxMV,
    commanderLegal: input.commanderLegal ?? true,
    limit: categoryTag ? Math.min(limit * 5, 100) : Math.min(limit * 3, 150),
  });

  const tagOpts = getDefaultBracket3Options('bracket3');
  const categoryFiltered = categoryTag
    ? hits.filter((c) => {
        const scry: ScryCard = {
          name: c.name,
          oracle_text: c.oracle_text ?? undefined,
          type_line: c.type_line ?? undefined,
          mana_cost: c.mana_cost ?? undefined,
          cmc: c.cmc ?? undefined,
        };
        const tags =
          c.tags && c.tags.length > 0 ? c.tags : autoTags(scry, tagOpts);
        return tags.some(
          (t) =>
            t.toLowerCase() === categoryTag ||
            t.replace(/_/g, '').toLowerCase() === categoryTag.replace(/_/g, '')
        );
      })
    : hits;

  const withoutExcluded = categoryFiltered.filter(
    (c) => !exclude.has(c.name.toLowerCase())
  );

  type ScoredHit = DatabaseCard & { relevanceScore: number };

  const scored: ScoredHit[] = withoutExcluded.map((c) => {
    const scry: ScryCard = {
      name: c.name,
      oracle_text: c.oracle_text ?? undefined,
      type_line: c.type_line ?? undefined,
      mana_cost: c.mana_cost ?? undefined,
      cmc: c.cmc ?? undefined,
    };
    let relevanceScore = 0;
    if (strategy) {
      const edhrecStub: EdhrecCardSuggestion = {
        name: c.name,
        rank: c.edhrec_rank ?? undefined,
      };
      const { sortScore } = scoreCardSynergyRelevance(
        c.name,
        strategy,
        edhrecStub
      );
      relevanceScore = sortScore;
    } else if (c.edhrec_rank != null) {
      relevanceScore = Math.max(0, 1 - c.edhrec_rank / 5000);
    }
    return { ...c, relevanceScore };
  });

  scored.sort((a, b) => {
    switch (sortBy) {
      case 'mv':
        return (a.cmc ?? 0) - (b.cmc ?? 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'edhrecRank': {
        const ar = a.edhrec_rank ?? 99999;
        const br = b.edhrec_rank ?? 99999;
        return ar - br;
      }
      case 'synergyRelevance':
      default:
        return b.relevanceScore - a.relevanceScore;
    }
  });

  const deduped = dedupeByOracleId(scored);

  const cards = deduped.slice(0, limit).map((c) => {
    const scry: ScryCard = {
      name: c.name,
      oracle_text: c.oracle_text ?? undefined,
      type_line: c.type_line ?? undefined,
      mana_cost: c.mana_cost ?? undefined,
      cmc: c.cmc ?? undefined,
    };
    const tags =
      c.tags && c.tags.length > 0 ? c.tags : autoTags(scry, tagOpts);

    const oracle = getCardByName(c.name);
    const inclusion =
      oracle && 'edhrec_rank' in oracle
        ? edhrecInclusionPercent({ name: c.name, inclusionRate: undefined })
        : null;

    const card: {
      name: string;
      type: string;
      mv: number;
      oracleText: string;
      tags: string[];
      edhrecRank: number | null;
      synergyRelevance?: SynergyRelevance;
      edhrecInclusionRate?: number | null;
    } = {
      name: c.name,
      type: c.type_line ?? '',
      mv: c.cmc ?? 0,
      oracleText: (c.oracle_text ?? '').slice(0, 200),
      tags,
      edhrecRank: c.edhrec_rank,
    };

    if (strategy) {
      const { synergyRelevance } = scoreCardSynergyRelevance(c.name, strategy);
      card.synergyRelevance = synergyRelevance;
    }
    if (c.edhrec_rank != null) {
      card.edhrecInclusionRate = inclusion;
    }

    return card;
  });

  const summary =
    cards.length === 0
      ? `No cards matched (category=${input.category ?? 'any'}, query=${input.query ?? 'none'}).`
      : `Found ${cards.length} card(s)${input.category ? ` for ${input.category}` : ''}.`;

  const nextSuggestedAction =
    cards.length === 0
      ? 'Broaden search_cards filters or try evaluate_card_swap with a known staple.'
      : 'Preview top candidate with evaluate_card_swap, then update deckText and analyze_deck.';

  return {
    cards,
    count: cards.length,
    databaseReady: true,
    summary,
    nextSuggestedAction,
  };
}
