import { describe, expect, it } from 'vitest';
import {
  getMcpPrompt,
  listMcpPrompts,
} from './mcpPrompts';

describe('mcpPrompts', () => {
  it('lists build and optimize prompts', () => {
    const prompts = listMcpPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['build-commander-deck', 'optimize-decklist']);
  });

  it('build-commander-deck requires commanderName', () => {
    expect(() => getMcpPrompt('build-commander-deck', {})).toThrow(/commanderName/);
  });

  it('build-commander-deck includes workflow and commander', () => {
    const result = getMcpPrompt('build-commander-deck', {
      commanderName: 'Shadrix Silverquill',
      preferredStrategy: 'group-slug',
    });
    expect(result.messages).toHaveLength(1);
    const text = result.messages[0].content.text;
    expect(text).toContain('Shadrix Silverquill');
    expect(text).toContain('group-slug');
    expect(text).toContain('get_synergies');
    expect(text).toContain('qualityGate.readyToShip');
    expect(text).toContain('get_user_deck_style');
    expect(text).toContain('useUserStyleReference');
  });

  it('optimize-decklist requires preferredStrategy', () => {
    expect(() =>
      getMcpPrompt('optimize-decklist', { commanderName: 'X' })
    ).toThrow(/preferredStrategy/);
  });

  it('optimize-decklist embeds deckText when provided', () => {
    const result = getMcpPrompt('optimize-decklist', {
      commanderName: 'Shadrix Silverquill',
      preferredStrategy: 'group-slug',
      deckText: '1 Sol Ring',
    });
    expect(result.messages[0].content.text).toContain('1 Sol Ring');
    expect(result.messages[0].content.text).toContain('optimize_deck');
  });
});
