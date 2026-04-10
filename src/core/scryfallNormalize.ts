/**
 * scryfallNormalize.ts
 *
 * Normalizers and utilities for Scryfall/oracle card data used by the template
 * and linter: MV, curve buckets, pips, produced mana, ETB tapped, commander legality.
 * Works with OracleCard and card_faces (MDFC, split, etc.).
 */

import type { OracleCard } from './scryfall';

/** Card-like shape: OracleCard or DB card with optional card_faces and mana_value */
export interface CardLike {
  name: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  mana_value?: number;
  oracle_text?: string;
  color_identity?: string[];
  legalities?: Record<string, string>;
  produced_mana?: string[];
  card_faces?: Array<{
    name?: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
  }>;
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof WUBRG)[number];

/** Unified mana value (Scryfall uses mana_value; older dumps use cmc) */
export function getManaValue(card: CardLike | null | undefined): number {
  if (!card) return 0;
  if (typeof (card as { mana_value?: number }).mana_value === 'number') {
    return (card as { mana_value: number }).mana_value;
  }
  if (typeof card.cmc === 'number') return card.cmc;
  return 0;
}

/** Primary mana cost for pip counting (front face if MDFC/split) */
export function getPrimaryManaCost(card: CardLike | null | undefined): string | null {
  if (!card) return null;
  if (card.mana_cost) return card.mana_cost;
  const face0 = card.card_faces?.[0];
  return face0?.mana_cost ?? null;
}

/** Primary type line (front face if double-faced) */
export function getPrimaryTypeLine(card: CardLike | null | undefined): string {
  if (!card) return '';
  if (card.type_line) return card.type_line;
  const face0 = card.card_faces?.[0];
  return face0?.type_line ?? '';
}

/** Full oracle text (combined from faces if applicable) */
export function getOracleText(card: CardLike | null | undefined): string {
  if (!card) return '';
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces?.length) {
    return card.card_faces.map((f) => f.oracle_text ?? '').join('\n---\n');
  }
  return '';
}

/** Curve bucket for template.curve.mv_distribution */
export function mvBucket(mv: number): '0_1' | '2' | '3' | '4' | '5_plus' {
  if (mv <= 1) return '0_1';
  if (mv === 2) return '2';
  if (mv === 3) return '3';
  if (mv === 4) return '4';
  return '5_plus';
}

/** Count colored pips in mana cost (hybrids split across colors) */
export function countPips(manaCost: string | null | undefined): Record<Color, number> {
  const out: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!manaCost) return out as Record<Color, number>;
  const tokens = manaCost.match(/\{[^}]+\}/g) ?? [];
  for (const t of tokens) {
    const sym = t.replace(/[{}]/g, '');
    if (sym.includes('/')) {
      const parts = sym.split('/');
      const present = parts.filter((p) => WUBRG.includes(p as Color)) as Color[];
      if (present.length) {
        const share = 1 / present.length;
        for (const c of present) out[c] += share;
      }
      continue;
    }
    if (WUBRG.includes(sym as Color)) out[sym] += 1;
  }
  return out as Record<Color, number>;
}

export type ManaSymbol = Color | 'C';

/** Symbols of mana this card can produce (for lands/rocks). Uses produced_mana if present, else simple oracle parse. */
export function producedManaSymbols(card: CardLike | null | undefined): ManaSymbol[] {
  if (!card) return [];
  const raw = card.produced_mana;
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((s): s is ManaSymbol => s === 'C' || WUBRG.includes(s as Color)) as ManaSymbol[];
  }
  const text = getOracleText(card).toLowerCase();
  const syms = new Set<ManaSymbol>();
  const matches = text.match(/\{[WUBRGC]\}/g) ?? [];
  for (const m of matches) {
    const s = m.replace(/[{}]/g, '') as ManaSymbol;
    if (s === 'C' || WUBRG.includes(s as Color)) syms.add(s);
  }
  if (/any color|add one mana of any color/i.test(text)) {
    for (const c of card.color_identity ?? []) {
      if (WUBRG.includes(c as Color)) syms.add(c as Color);
    }
  }
  return [...syms];
}

/** Whether the card is a land (by type line) */
export function isLandCard(card: CardLike | null | undefined): boolean {
  return getPrimaryTypeLine(card).toLowerCase().includes('land');
}

/** ETB tapped classification for mana_base.tapped_lands */
export function entersTappedKind(
  card: CardLike | null | undefined
): 'never' | 'always' | 'conditional' | 'unknown' {
  if (!card) return 'unknown';
  const typeLine = getPrimaryTypeLine(card).toLowerCase();
  if (!typeLine.includes('land')) return 'never';
  const text = getOracleText(card).toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('enters the battlefield tapped') || text.includes('enters tapped')) {
    if (
      text.includes('unless') ||
      text.includes('except') ||
      text.includes('as it enters') ||
      text.includes('if you control')
    ) {
      return 'conditional';
    }
    return 'always';
  }
  return 'never';
}

/** Commander format legality */
export function isCommanderLegal(card: CardLike | null | undefined): boolean {
  if (!card?.legalities) return false;
  const c = card.legalities['commander'] ?? card.legalities['edh'];
  return c === 'legal';
}
