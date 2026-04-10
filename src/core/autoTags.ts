/**
 * autoTags.ts
 *
 * Auto-tagging for Bracket 3: regex/heuristics on oracle text and type line
 * to assign tags that map to deck template categories.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Card-like shape used for tagging (compatible with OracleCard) */
export interface ScryCard {
  id?: string;
  name: string;
  oracle_text?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  legalities?: Record<string, string>;
  keywords?: string[];
  all_parts?: { component?: string; name?: string; id?: string }[];
  tags?: string[];
}

export type AutoTagOptions = {
  massLandDenialNames?: Set<string>;
  lockPieceNames?: Set<string>;
  comboPieceNames?: Set<string>;
  fastManaNames?: Set<string>;
  tutorNames?: Set<string>;
  gameChangerNames?: Set<string>;
  extraTurnNames?: Set<string>;
};

const norm = (s: string): string =>
  s.toLowerCase().replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim();

const hasText = (c: ScryCard, re: RegExp): boolean =>
  re.test(norm(c.oracle_text ?? ''));

const hasType = (c: ScryCard, re: RegExp): boolean =>
  re.test(norm(c.type_line ?? ''));

/**
 * Load bracket3 card lists and return as options for autoTags.
 * Returns empty sets if files are missing.
 */
export function getDefaultBracket3Options(bracketId: string = 'bracket3'): AutoTagOptions {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  const toSet = (arr: string[]): Set<string> => new Set(arr.map(n => n.trim().toLowerCase()));

  let gameChangers: string[] = [];
  let massLandDenial: string[] = [];
  let extraTurns: string[] = [];

  try {
    const gcPath = path.join(dataDir, `${bracketId}-game-changers.json`);
    if (fs.existsSync(gcPath)) {
      gameChangers = JSON.parse(fs.readFileSync(gcPath, 'utf8')) as string[];
    }
  } catch {
    // ignore
  }
  try {
    const mldPath = path.join(dataDir, `${bracketId}-mass-land-denial.json`);
    if (fs.existsSync(mldPath)) {
      massLandDenial = JSON.parse(fs.readFileSync(mldPath, 'utf8')) as string[];
    }
  } catch {
    // ignore
  }
  try {
    const etPath = path.join(dataDir, `${bracketId}-extra-turns.json`);
    if (fs.existsSync(etPath)) {
      extraTurns = JSON.parse(fs.readFileSync(etPath, 'utf8')) as string[];
    }
  } catch {
    // ignore
  }

  return {
    gameChangerNames: toSet(gameChangers),
    massLandDenialNames: toSet(massLandDenial),
    extraTurnNames: toSet(extraTurns),
  };
}

/**
 * Assign tags to a card using regex/heuristics. Overrides from bracket lists
 * (game changers, MLD, extra turns) take precedence.
 */
export function autoTags(card: ScryCard, opt: AutoTagOptions = {}): string[] {
  const tags = new Set<string>();
  const text = norm(card.oracle_text ?? '');
  const type = norm(card.type_line ?? '');
  const name = card.name.trim().toLowerCase();

  // 0) Overrides from bracket lists
  if (opt.massLandDenialNames?.has(name)) tags.add('mass_land_denial');
  if (opt.lockPieceNames?.has(name)) tags.add('lock_piece');
  if (opt.comboPieceNames?.has(name)) tags.add('combo_piece');
  if (opt.fastManaNames?.has(name)) tags.add('fast_mana');
  if (opt.tutorNames?.has(name)) tags.add('tutor');
  if (opt.gameChangerNames?.has(name)) tags.add('game_changer');
  if (opt.extraTurnNames?.has(name)) tags.add('extra_turn');

  // 1) Extra turns (text)
  if (/(?:take an extra turn|extra turn after this one)/i.test(text)) {
    tags.add('extra_turn');
  }

  // 2) Ramp (nonland only: lands are counted in "lands" category from type_line)
  if (!/land/i.test(type)) {
    if (/(?:add \{[wubrgc]\})/i.test(text) || /search your library for (?:a|two|up to .*?) (?:basic )?land/i.test(text)) {
      tags.add('ramp');
    }
    if (/create (?:a|two|three|any number of) treasure/i.test(text)) tags.add('ramp');
  }

  if ((card.cmc ?? 99) <= 1 && /(?:add \{[wubrgc]\}\{[wubrgc]\}|add \{c\}\{c\})/i.test(text)) {
    tags.add('fast_mana');
  }

  // 3) Draw / selection
  if (/\bdraw (?:a|two|three|four|five|x) card/i.test(text)) tags.add('card_draw');
  if (/(?:scry|surveil|look at the top|exile the top .*? you may play)/i.test(text)) {
    tags.add('card_selection');
  }

  // 4) Spot removal / AE hate / wipes
  if (/(?:destroy|exile) target (?:creature|planeswalker)/i.test(text)) {
    tags.add('spot_removal');
  }
  if (/(?:destroy|exile) target (?:artifact|enchantment)/i.test(text)) {
    tags.add('artifact_enchantment_hate');
  }
  if (
    /(?:destroy|exile) all (?:creatures|artifacts|enchantments|planeswalkers)/i.test(text) ||
    (/each creature/i.test(text) && /(?:dies|is destroyed|is exiled)/i.test(text)) ||
    /all creatures get -\d+\/-\d+/i.test(text)
  ) {
    tags.add('board_wipe');
  }

  // 5) Graveyard hate
  if (
    /(?:exile (?:all|target) (?:cards?|card) from (?:a|target) graveyard|cards in graveyards can't)/i.test(text) ||
    /if a card would be put into a graveyard, exile it instead/i.test(text)
  ) {
    tags.add('graveyard_hate');
  }

  // 6) Protection
  if (
    /(?:hexproof|indestructible|protection from)/i.test(text) ||
    /(?:counter target spell|spells you control can't be countered)/i.test(text) ||
    /prevent all damage/i.test(text)
  ) {
    tags.add('protection');
  }

  // 7) Recursion (for no-chaining warning)
  if (
    /(?:return target .*? card from your graveyard to your hand|return .*? from your graveyard to the battlefield|you may cast .*? from your graveyard)/i.test(text)
  ) {
    tags.add('recursion');
  }

  // 8) Tutor
  if (
    /search your library for (?:a|an|up to|two|three)/i.test(text) &&
    !/search your library for (?:a|an) basic land/i.test(text)
  ) {
    tags.add('tutor');
  }

  // 9) Value engines
  if (
    /(?:at the beginning of (?:your|each) upkeep|once each turn|whenever .*? you may draw|whenever .*? create)/i.test(text)
  ) {
    tags.add('value_engine');
  }

  // 10) Combo piece from all_parts
  if (card.all_parts?.some(p => p.component === 'combo_piece')) {
    tags.add('combo_piece');
  }

  // 11) Mass land denial
  if (
    /(?:destroy|exile) all lands/i.test(text) ||
    /each player sacrifices .* lands/i.test(text)
  ) {
    tags.add('mass_land_denial');
  }

  // 12) Spell copy (for no-chaining warning)
  if (/copy target (?:instant|sorcery|spell)/i.test(text)) {
    tags.add('spell_copy');
  }

  // 13) Win condition
  if (/(?:you win the game|opponents lose the game)/i.test(text)) {
    tags.add('win_condition');
  }

  return [...tags];
}

/** Map tag names to deck template category names (template uses plurals for some) */
const TAG_TO_TEMPLATE_CATEGORY: Record<string, string> = {
  land: 'lands',
  lands: 'lands',
  ramp: 'ramp',
  card_draw: 'card_draw',
  card_selection: 'card_selection',
  spot_removal: 'spot_removal',
  artifact_enchantment_hate: 'artifact_enchantment_hate',
  graveyard_hate: 'graveyard_hate',
  board_wipe: 'board_wipes',
  board_wipes: 'board_wipes',
  protection: 'protection',
  value_engine: 'value_engines',
  value_engines: 'value_engines',
  win_condition: 'win_conditions',
  win_conditions: 'win_conditions',
  game_changer: 'game_changers',
  game_changers: 'game_changers',
  extra_turn: 'extra_turns',
  extra_turns: 'extra_turns',
  mass_land_denial: 'game_changers', // policy category; counted separately for validation
};

/**
 * Map a list of tags to template category names (for counting).
 * Each tag maps to at most one category; duplicates are collapsed.
 * Note: mass_land_denial has no template category (policy-only).
 */
export function tagsToTemplateCategories(tags: string[]): string[] {
  const categories = new Set<string>();
  for (const tag of tags) {
    const cat = TAG_TO_TEMPLATE_CATEGORY[tag];
    if (cat) categories.add(cat);
  }
  return [...categories];
}
