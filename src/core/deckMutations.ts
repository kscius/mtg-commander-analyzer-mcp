/**
 * Apply cut/add swaps to a decklist without manual re-pasting.
 */

import { parseDeckText } from './deckParser';
import { formatDecklistText, isBasicLandName } from './deckTextFormat';
import { resolveCardNameSync } from './cardResolution';
import { getCardByName } from './scryfall';
import { isBanned } from './banlist';
import {
  cardFitsCommanderColorIdentity,
  COMMANDER_MAINBOARD_SIZE,
} from './commanderFormat';
import type { BuiltCardEntry } from './types';

export interface DeckSwapInput {
  remove: string;
  add: string;
}

export interface ApplyDeckSwapsResult {
  decklistText: string;
  applied: Array<{ remove: string; add: string }>;
  skipped: Array<{ remove: string; add: string; reason: string }>;
  errors: string[];
  totalCards: number;
}

function parsedToBuilt(cards: { name: string; quantity: number }[]): BuiltCardEntry[] {
  const map = new Map<string, BuiltCardEntry>();
  for (const p of cards) {
    const key = p.name.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.quantity += p.quantity;
    else map.set(key, { name: p.name, quantity: p.quantity });
  }
  return [...map.values()].filter((c) => c.quantity > 0);
}

/**
 * Apply one-for-one swaps to a mainboard decklist (99 cards expected).
 */
export function applyDeckSwaps(
  deckText: string,
  swaps: DeckSwapInput[],
  options?: { commanderName?: string }
): ApplyDeckSwapsResult {
  const parsed = parseDeckText(deckText);
  const commanderName = options?.commanderName ?? parsed.commanderName ?? undefined;
  const commanderCard = commanderName ? getCardByName(commanderName) : null;
  const colorIdentity = commanderCard?.color_identity ?? [];

  let built = parsedToBuilt(parsed.cards);
  const applied: ApplyDeckSwapsResult['applied'] = [];
  const skipped: ApplyDeckSwapsResult['skipped'] = [];
  const errors: string[] = [];

  for (const swap of swaps) {
    const removeRes = resolveCardNameSync(swap.remove);
    const addRes = resolveCardNameSync(swap.add);
    if (!removeRes) {
      skipped.push({ remove: swap.remove, add: swap.add, reason: `Could not resolve remove: ${swap.remove}` });
      continue;
    }
    if (!addRes) {
      skipped.push({ remove: swap.remove, add: swap.add, reason: `Could not resolve add: ${swap.add}` });
      continue;
    }

    const removeName = removeRes.canonicalName;
    const addName = addRes.canonicalName;

    if (isBanned(addName)) {
      skipped.push({ remove: removeName, add: addName, reason: `${addName} is on the banlist` });
      continue;
    }

    const addCard = getCardByName(addName);
    if (!addCard) {
      skipped.push({ remove: removeName, add: addName, reason: `Add card not found: ${addName}` });
      continue;
    }

    if (commanderCard && !cardFitsCommanderColorIdentity(addCard, colorIdentity)) {
      skipped.push({
        remove: removeName,
        add: addName,
        reason: `${addName} is outside commander color identity`,
      });
      continue;
    }

    const removeIdx = built.findIndex((c) => c.name.toLowerCase() === removeName.toLowerCase());
    if (removeIdx < 0) {
      skipped.push({ remove: removeName, add: addName, reason: `${removeName} not in deck` });
      continue;
    }

    const removeEntry = built[removeIdx];
    if (removeEntry.quantity < 1) {
      skipped.push({ remove: removeName, add: addName, reason: `${removeName} not in deck` });
      continue;
    }

    const addKey = addName.toLowerCase();
    const removeKey = removeName.toLowerCase();
    const isBasicAdd = isBasicLandName(addName);

    if (!isBasicAdd && addKey !== removeKey) {
      const dup = built.find((c) => c.name.toLowerCase() === addKey && c.quantity >= 1);
      if (dup) {
        skipped.push({
          remove: removeName,
          add: addName,
          reason: `${addName} already in deck (singleton)`,
        });
        continue;
      }
    }

    removeEntry.quantity -= 1;
    if (removeEntry.quantity <= 0) {
      built.splice(removeIdx, 1);
    }

    if (isBasicAdd) {
      const landIdx = built.findIndex((c) => c.name.toLowerCase() === addKey);
      if (landIdx >= 0) built[landIdx].quantity += 1;
      else built.push({ name: addName, quantity: 1 });
    } else {
      built.push({ name: addName, quantity: 1 });
    }

    applied.push({ remove: removeName, add: addName });
  }

  const totalCards = built.reduce((s, c) => s + c.quantity, 0);
  if (totalCards !== COMMANDER_MAINBOARD_SIZE) {
    errors.push(
      `Mainboard has ${totalCards} cards after swaps (expected ${COMMANDER_MAINBOARD_SIZE})`
    );
  }

  return {
    decklistText: formatDecklistText(built),
    applied,
    skipped,
    errors,
    totalCards,
  };
}
