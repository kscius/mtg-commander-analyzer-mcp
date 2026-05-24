/**
 * MCP tool: resolve_card — lightweight name resolution + legality checks.
 */

import { ResolveCardInputSchema } from '../core/schemas';
import { resolveCardNameSync } from '../core/cardResolution';
import { getCardByName } from '../core/scryfall';
import { cardFitsCommanderColorIdentity } from '../core/commanderFormat';
import { isBanned } from '../core/banlist';

export async function runResolveCard(raw: unknown): Promise<{
  requestedName: string;
  resolved: boolean;
  summary: string;
  nextSuggestedAction: string;
  canonicalName?: string;
  source?: string;
  commanderLegal?: boolean;
  colorIdentity?: string[];
  fitsCommanderColors?: boolean;
  banned?: boolean;
  typeLine?: string;
  error?: string;
}> {
  const input = ResolveCardInputSchema.parse(raw);
  const requestedName = input.cardName.trim();

  const resolved = resolveCardNameSync(requestedName);
  if (!resolved) {
    return {
      requestedName,
      resolved: false,
      summary: `Could not resolve "${requestedName}".`,
      nextSuggestedAction: `search_cards with query="${requestedName}" or verify spelling in Scryfall.`,
      error: `Card not found in database for "${requestedName}". Use search_cards or verify spelling.`,
    };
  }

  const card = resolved.card;
  const commanderLegal = card.legalities?.commander === 'legal';
  const banned = isBanned(card.name);
  const colorIdentity = card.color_identity ?? [];

  let fitsCommanderColors: boolean | undefined;
  if (input.commanderName) {
    const commander = getCardByName(input.commanderName);
    if (!commander) {
      return {
        requestedName,
        resolved: true,
        summary: `Resolved "${resolved.canonicalName}" but commander "${input.commanderName}" was not found.`,
        nextSuggestedAction: 'Verify commanderName spelling, then call resolve_card again.',
        canonicalName: resolved.canonicalName,
        source: resolved.source,
        commanderLegal,
        colorIdentity,
        banned,
        typeLine: card.type_line,
        error: `Commander "${input.commanderName}" not found in database.`,
      };
    }
    fitsCommanderColors = cardFitsCommanderColorIdentity(
      card,
      commander.color_identity ?? []
    );
  }

  const summaryParts: string[] = [`Resolved as ${resolved.canonicalName}`];
  if (banned) summaryParts.push('BANNED in project banlist');
  if (commanderLegal === false) summaryParts.push('not Commander-legal');
  if (fitsCommanderColors === false) summaryParts.push('outside commander color identity');
  if (fitsCommanderColors === true) summaryParts.push('fits commander colors');

  let nextSuggestedAction = 'Use this canonical name in decklistText or evaluate_card_swap.';
  if (banned || commanderLegal === false) {
    nextSuggestedAction = 'Do not add this card; use search_cards for a legal replacement.';
  } else if (fitsCommanderColors === false) {
    nextSuggestedAction = 'Pick a different card within commander color identity via search_cards.';
  }

  return {
    requestedName,
    resolved: true,
    summary: summaryParts.join('; ') + '.',
    nextSuggestedAction,
    canonicalName: resolved.canonicalName,
    source: resolved.source,
    commanderLegal,
    colorIdentity,
    fitsCommanderColors,
    banned,
    typeLine: card.type_line,
  };
}
