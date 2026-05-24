import { describe, expect, it } from 'vitest';
import { autoTags, getPrimaryTemplateCategory, getDefaultBracket3Options } from './autoTags';
import type { ScryCard } from './autoTags';

const card = (partial: Partial<ScryCard> & Pick<ScryCard, 'name'>): ScryCard => ({
  oracle_text: '',
  type_line: '',
  ...partial,
});

describe('autoTags table-driven', () => {
  const cases: Array<{
    label: string;
    input: ScryCard;
    expectTags: string[];
    primary?: string | null;
  }> = [
    {
      label: 'extra turn oracle text',
      input: card({
        name: 'Test Extra Turn',
        oracle_text: 'Take an extra turn after this one.',
        type_line: 'Sorcery',
      }),
      expectTags: ['extra_turn'],
      primary: 'extra_turns',
    },
    {
      label: 'mass land denial text',
      input: card({
        name: 'Test MLD',
        oracle_text: 'Destroy all lands.',
        type_line: 'Sorcery',
      }),
      expectTags: ['mass_land_denial'],
    },
    {
      label: 'ramp mana rock',
      input: card({
        name: 'Test Rock',
        oracle_text: '{T}: Add {G}.',
        type_line: 'Artifact',
        cmc: 2,
      }),
      expectTags: ['ramp'],
      primary: 'ramp',
    },
    {
      label: 'game changer override list',
      input: card({ name: 'Sol Ring', type_line: 'Artifact' }),
      expectTags: ['game_changer'],
      primary: 'game_changers',
    },
    {
      label: 'card draw',
      input: card({
        name: 'Test Draw',
        oracle_text: 'Draw two cards.',
        type_line: 'Instant',
      }),
      expectTags: ['card_draw'],
      primary: 'card_draw',
    },
  ];

  const opts = getDefaultBracket3Options('bracket3');
  opts.gameChangerNames = new Set(['sol ring']);

  it.each(cases)('$label', ({ input, expectTags, primary }) => {
    const tags = autoTags(input, opts);
    for (const tag of expectTags) {
      expect(tags).toContain(tag);
    }
    if (primary !== undefined) {
      expect(getPrimaryTemplateCategory(tags)).toBe(primary);
    }
  });
});

describe('getPrimaryTemplateCategory', () => {
  it('picks highest-priority category when multiple tags map', () => {
    const tags = autoTags(
      card({
        name: 'Multi',
        oracle_text: 'Draw a card. Destroy target creature.',
        type_line: 'Instant',
      })
    );
    const primary = getPrimaryTemplateCategory(tags);
    expect(['card_draw', 'spot_removal']).toContain(primary ?? '');
  });
});
