/**
 * llmCardClassifier.ts
 *
 * Optional OpenAI fallback to classify a card into Bracket 3 template categories
 * when heuristics (autoTags) did not assign any.
 */

import OpenAI from 'openai';
import { getLLMConfig } from './llmConfig';
import { ScryCard } from './autoTags';

const BRACKET3_CATEGORY_TAGS = [
  'ramp',
  'card_draw',
  'card_selection',
  'spot_removal',
  'artifact_enchantment_hate',
  'graveyard_hate',
  'board_wipe',
  'protection',
  'value_engine',
  'win_condition',
  'game_changer',
  'extra_turn',
];

/**
 * Call OpenAI to classify the card into one or more Bracket 3 category tags.
 * Returns empty array if API is not configured or request fails.
 */
export async function classifyCardWithLLM(card: ScryCard): Promise<string[]> {
  const config = getLLMConfig();
  if (!config.isAvailable || !config.apiKey) {
    return [];
  }

  const text = [card.oracle_text, card.type_line].filter(Boolean).join('\n');
  if (!text.trim()) {
    return [];
  }

  const openai = new OpenAI({ apiKey: config.apiKey });

  const prompt = `You are classifying a Magic: The Gathering card for Commander deck building (Bracket 3).

Card name: ${card.name}
Type: ${card.type_line ?? 'unknown'}
Text: ${(card.oracle_text ?? '').slice(0, 800)}

Choose zero or more categories that apply from this exact list (use the tag names as-is):
${BRACKET3_CATEGORY_TAGS.join(', ')}

Rules:
- Only include categories that clearly apply (ramp = mana acceleration, card_draw = draws cards, spot_removal = destroys/exiles target creature/planeswalker, board_wipe = destroys all creatures, etc.).
- Lands are not classified here.
- Return only a JSON array of strings, e.g. ["ramp","card_draw"] or [].`;

  try {
    const completion = await openai.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 150,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return [];

    const valid = (parsed as string[]).filter((t): t is string =>
      typeof t === 'string' && BRACKET3_CATEGORY_TAGS.includes(t)
    );
    return valid;
  } catch {
    return [];
  }
}

/**
 * Check if LLM classification is available (for fallback).
 */
export function isLLMClassifierAvailable(): boolean {
  return getLLMConfig().isAvailable;
}
