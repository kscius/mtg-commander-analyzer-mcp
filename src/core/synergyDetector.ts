/**
 * Detect plausible Commander synergies from commander card text and EDHREC themes.
 */

import { getCardByName, getColorIdentity } from './scryfall';
import { getFullCommanderProfile } from './edhrec';
import type { EdhrecTheme } from './types';

export interface SynergyOption {
  slug: string;
  name: string;
  description: string;
  cardCount?: number;
  exampleCards: string[];
  source: 'edhrec' | 'heuristic';
}

export interface CommanderSynergyInfo {
  name: string;
  colorIdentity: string[];
  abilities: string;
}

const HEURISTIC_SYNERGIES: Array<{
  slug: string;
  name: string;
  description: string;
  patterns: RegExp[];
}> = [
  { slug: 'tokens', name: 'Tokens', description: 'Create and sacrifice token armies; anthems and payoff creatures.', patterns: [/create .* token/i, /token creature/i, /populate/i] },
  { slug: 'voltron', name: 'Voltron', description: 'Buff the commander with equipment and auras; combat wins.', patterns: [/equipped creature/i, /enchant creature/i, /commander damage/i] },
  { slug: 'counters', name: '+1/+1 Counters', description: 'Proliferate and grow creatures with +1/+1 counters.', patterns: [/\+1\/\+1 counter/i, /proliferate/i, /double .* counters/i] },
  { slug: 'reanimator', name: 'Reanimator', description: 'Fill the graveyard and reanimate large threats.', patterns: [/return .* from your graveyard/i, /reanimate/i, /from your graveyard to the battlefield/i] },
  { slug: 'spellslinger', name: 'Spellslinger', description: 'Cast many instants and sorceries; spell payoff creatures.', patterns: [/instant or sorcery/i, /magecraft/i, /storm/i, /copy .* spell/i] },
  { slug: 'artifacts', name: 'Artifacts', description: 'Artifact synergies, sacrifice, and cost reduction.', patterns: [/artifact/i] },
  { slug: 'lands', name: 'Lands Matter', description: 'Play extra lands, landfall, and land-based value.', patterns: [/landfall/i, /play an additional land/i, /land .* enters/i] },
  { slug: 'tribal', name: 'Tribal', description: 'Creature type matters; lords and shared typing.', patterns: [/other .* you control get/i, /creature type/i] },
  { slug: 'superfriends', name: 'Superfriends', description: 'Planeswalkers and proliferate to ultimate quickly.', patterns: [/planeswalker/i, /loyalty counter/i] },
  { slug: 'blink', name: 'Blink', description: 'Flicker creatures for ETB value and protection.', patterns: [/exile .* return .* to the battlefield/i, /flicker/i, /blink/i] },
  { slug: 'aristocrats', name: 'Aristocrats', description: 'Sacrifice creatures for value and drain opponents.', patterns: [/sacrifice .* creature/i, /whenever .* dies/i, /drain/i] },
  { slug: 'group-slug', name: 'Group Slug', description: 'Damage all players; incremental punishment.', patterns: [/each opponent loses/i, /each player loses/i, /each opponent .* damage/i] },
];

function detectHeuristicSynergies(commander: { oracle_text?: string; type_line?: string }): SynergyOption[] {
  const text = `${commander.type_line ?? ''} ${commander.oracle_text ?? ''}`;
  const out: SynergyOption[] = [];
  for (const h of HEURISTIC_SYNERGIES) {
    if (h.patterns.some((re) => re.test(text))) {
      out.push({
        slug: h.slug,
        name: h.name,
        description: h.description,
        exampleCards: [],
        source: 'heuristic',
      });
    }
  }
  return out;
}

function themeToSynergy(theme: EdhrecTheme, exampleCards: string[]): SynergyOption {
  return {
    slug: theme.slug,
    name: theme.name,
    description: `EDHREC theme "${theme.name}" (${theme.count ?? '?'} decks).`,
    cardCount: theme.count,
    exampleCards: exampleCards.slice(0, 5),
    source: 'edhrec',
  };
}

/**
 * List synergies for a commander (EDHREC themes + keyword heuristics).
 */
export async function detectSynergiesForCommander(commanderName: string): Promise<{
  commander: CommanderSynergyInfo;
  synergies: SynergyOption[];
  recommendedStrategy?: string;
}> {
  const card = getCardByName(commanderName.trim());
  if (!card) {
    throw new Error(`Commander "${commanderName}" not found in card database.`);
  }

  const colorIdentity = getColorIdentity(card);
  const commander: CommanderSynergyInfo = {
    name: card.name,
    colorIdentity,
    abilities: [card.type_line, card.oracle_text].filter(Boolean).join(' — '),
  };

  const bySlug = new Map<string, SynergyOption>();

  for (const h of detectHeuristicSynergies(card)) {
    bySlug.set(h.slug, h);
  }

  try {
    const profile = await getFullCommanderProfile(card.name, colorIdentity, {
      cardLimit: 40,
      landLimit: 0,
      saltThreshold: 99,
    });
    for (const theme of profile.themes) {
      const examples = profile.cards
        .filter((c) => c.category?.includes(theme.slug) || c.label?.toLowerCase().includes(theme.slug))
        .map((c) => c.name)
        .slice(0, 5);
      bySlug.set(theme.slug, themeToSynergy(theme, examples.length ? examples : profile.cards.slice(0, 3).map((c) => c.name)));
    }
  } catch {
    // EDHREC unavailable — heuristics only
  }

  const synergies = [...bySlug.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'edhrec' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const recommendedStrategy =
    synergies.find((s) => s.source === 'edhrec')?.slug ?? synergies[0]?.slug;

  return { commander, synergies, recommendedStrategy };
}
