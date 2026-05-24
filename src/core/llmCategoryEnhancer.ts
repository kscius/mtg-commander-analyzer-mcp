/**
 * OpenAI enhancement for template deck generation: pick real card names from DB candidates
 * when EDHREC + heuristic DB fill still leave category deficits.
 */

import { createOpenAIClient, getOpenAIConfig, isOpenAIAvailable, resolveModelForRole } from './llmConfig';
import { getCardByName, OracleCard } from './scryfall';
import { isDatabaseReady, searchCardsFiltered } from './cardDatabase';
import {
  autoTags,
  getDefaultBracket3Options,
  getPrimaryTemplateCategory,
  ScryCard,
} from './autoTags';
import { cardFitsCommanderColorIdentity } from './commanderFormat';
import { isBanned } from './banlist';
import { isGameChanger, isMassLandDenial, isExtraTurnCard } from './bracketCards';
import type { BuiltCardEntry, CardRole } from './types';
import { COMMANDER_MAINBOARD_SIZE } from './commanderFormat';

const FAST_TEMPERATURE = 0.2;

/**
 * Ask OpenAI to choose up to `count` names from a fixed candidate list (no free-form generation).
 */
export async function pickCardNamesFromCandidates(options: {
  categoryName: string;
  commanderName: string;
  preferredTheme?: string;
  colorIdentity: string[];
  candidateNames: string[];
  count: number;
  modelRole?: 'fast' | 'default';
}): Promise<string[]> {
  if (!isOpenAIAvailable() || options.count <= 0 || options.candidateNames.length === 0) {
    return [];
  }

  const uniqueCandidates = [...new Set(options.candidateNames.map((n) => n.trim()).filter(Boolean))];
  if (uniqueCandidates.length === 0) return [];

  const config = getOpenAIConfig();
  const openai = createOpenAIClient(config);
  const model = resolveModelForRole(options.modelRole === 'fast' ? 'fast' : 'default', config);
  const colorStr =
    options.colorIdentity.length > 0 ? options.colorIdentity.join('') : 'Colorless';
  const themeLine = options.preferredTheme
    ? `Deck theme (EDHREC slug): ${options.preferredTheme}. Prefer on-theme picks.\n`
    : '';

  const cappedCandidates = uniqueCandidates.slice(0, 60);
  const pickCount = Math.min(options.count, cappedCandidates.length, 12);

  const prompt = `You are helping fill a Magic: The Gathering Commander (Bracket 3) decklist.

Commander: ${options.commanderName}
Color identity: ${colorStr}
Category to fill: ${options.categoryName}
${themeLine}
Choose exactly ${pickCount} card names from this list ONLY (use exact spelling):
${JSON.stringify(cappedCandidates)}

Rules:
- Return ONLY a JSON array of strings, e.g. ["Card A","Card B"]
- Every name MUST appear in the candidate list above
- No basic lands
- Pick cards that best fit the category and theme`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: FAST_TEMPERATURE,
      max_tokens: Math.min(400, config.maxTokens),
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(content) as unknown;
    const namesRaw = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { cards?: unknown }).cards)
        ? (parsed as { cards: unknown[] }).cards
        : null;

    if (!namesRaw) return [];

    const allowed = new Set(cappedCandidates.map((n) => n.toLowerCase()));
    const picked: string[] = [];
    for (const item of namesRaw) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!allowed.has(trimmed.toLowerCase())) continue;
      if (picked.some((p) => p.toLowerCase() === trimmed.toLowerCase())) continue;
      picked.push(trimmed);
      if (picked.length >= pickCount) break;
    }
    return picked;
  } catch {
    return [];
  }
}

export interface CategoryFillContext {
  builtCards: BuiltCardEntry[];
  cardsInDeck: Set<string>;
  nonLandCategories: Array<{ name: string; min: number; max: number }>;
  categoryTargets: Map<string, number>;
  categoryCounts: Record<string, number>;
  colorIdentity: string[];
  commanderName: string;
  preferredTheme?: string;
  tagOpts: ReturnType<typeof getDefaultBracket3Options>;
  addCard: (name: string, roles?: CardRole[]) => boolean;
  notes: string[];
  counters: { gameChangerCount: number; extraTurnCount: number };
  maxGameChangers: number;
  maxExtraTurns: number;
}

/**
 * After EDHREC + DB fill, use OpenAI to pick remaining cards from SQLite candidates per category.
 */
export async function fillUnderfilledCategoriesWithOpenAI(ctx: CategoryFillContext): Promise<void> {
  if (!isOpenAIAvailable() || !isDatabaseReady()) return;

  const underfilled = ctx.nonLandCategories.filter(
    (cat) => (ctx.categoryCounts[cat.name] ?? 0) < (ctx.categoryTargets.get(cat.name) ?? 0)
  );
  if (underfilled.length === 0) return;

  for (const cat of underfilled) {
    const need =
      (ctx.categoryTargets.get(cat.name) ?? 0) - (ctx.categoryCounts[cat.name] ?? 0);
    if (need <= 0) continue;
    if (ctx.builtCards.reduce((s, c) => s + c.quantity, 0) >= COMMANDER_MAINBOARD_SIZE) break;

    const hits = searchCardsFiltered({
      colorIdentity: ctx.colorIdentity,
      category: cat.name,
      commanderLegal: true,
      limit: Math.min(need * 12, 80),
    });

    const candidates: string[] = [];
    for (const row of hits) {
      const name = row.name;
      if (ctx.cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      const card = getCardByName(name);
      if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
      if (!cardFitsCommanderColorIdentity(card, ctx.colorIdentity)) continue;
      candidates.push(name);
    }

    if (candidates.length === 0) continue;

    const picked = await pickCardNamesFromCandidates({
      categoryName: cat.name,
      commanderName: ctx.commanderName,
      preferredTheme: ctx.preferredTheme,
      colorIdentity: ctx.colorIdentity,
      candidateNames: candidates,
      count: need,
      modelRole: 'fast',
    });

    if (picked.length === 0) continue;

    let added = 0;
    for (const name of picked) {
      if (added >= need) break;
      if (ctx.builtCards.reduce((s, c) => s + c.quantity, 0) >= COMMANDER_MAINBOARD_SIZE) break;
      if (ctx.cardsInDeck.has(name.toLowerCase())) continue;
      if (isBanned(name)) continue;
      if (isMassLandDenial(name, 'bracket3')) continue;
      if (isGameChanger(name, 'bracket3') && ctx.counters.gameChangerCount >= ctx.maxGameChangers) {
        continue;
      }
      if (isExtraTurnCard(name, 'bracket3') && ctx.counters.extraTurnCount >= ctx.maxExtraTurns) {
        continue;
      }

      const card = getCardByName(name);
      if (!card || (card.type_line?.toLowerCase().includes('land') ?? false)) continue;
      if (!cardFitsCommanderColorIdentity(card, ctx.colorIdentity)) continue;

      const tags =
        (card as OracleCard & { tags?: string[] }).tags?.length
          ? (card as OracleCard & { tags: string[] }).tags
          : autoTags(
              {
                name: card.name,
                oracle_text: card.oracle_text,
                type_line: card.type_line,
                mana_cost: card.mana_cost,
                cmc: card.cmc,
              } as ScryCard,
              ctx.tagOpts
            );
      if (getPrimaryTemplateCategory(tags) !== cat.name) continue;
      if (!ctx.addCard(name)) continue;

      ctx.categoryCounts[cat.name] = (ctx.categoryCounts[cat.name] ?? 0) + 1;
      if (isGameChanger(name, 'bracket3')) ctx.counters.gameChangerCount++;
      if (isExtraTurnCard(name, 'bracket3')) ctx.counters.extraTurnCount++;
      added++;
    }

    if (added > 0) {
      ctx.notes.push(`OpenAI enhancement: ${cat.name} +${added} (picked from DB candidates).`);
    }
  }
}
