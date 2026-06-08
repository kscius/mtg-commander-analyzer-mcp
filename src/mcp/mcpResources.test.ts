import { describe, expect, it } from 'vitest';
import {
  listMcpResources,
  readMcpResource,
  MTG_COMMANDER_RESOURCE_PREFIX,
} from './mcpResources';

describe('mcpResources', () => {
  it('lists core static resources and strategy guides', () => {
    const resources = listMcpResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}template/bracket3`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}banlist`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}agents`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}user-decks/style-profile`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}docs/user-deck-style-reference`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}docs/commander-guides/aloy-discover`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}deck-knowledge/discover-artifact-heuristics`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}docs/bracket3-official-rules`);
    expect(uris).toContain(`${MTG_COMMANDER_RESOURCE_PREFIX}bracket3/policy-reference`);
  });

  it('reads bracket3 official rules markdown', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}docs/bracket3-official-rules`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text).toContain('Fast mana');
    expect(content.text).toContain('moxfield.com/commanderbrackets');
  });

  it('reads Aloy Discover commander guide', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}docs/commander-guides/aloy-discover`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text).toContain('artifact creatures');
    expect(content.text).toContain('Herald\'s Horn');
  });

  it('reads discover artifact heuristics JSON', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}deck-knowledge/discover-artifact-heuristics`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('application/json');
    const parsed = JSON.parse(content.text) as { commander?: string };
    expect(parsed.commander).toContain('Aloy');
  });

  it('reads user deck style reference markdown', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}docs/user-deck-style-reference`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text).toContain('data/my_decks');
  });

  it('reads bracket3 template JSON', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}template/bracket3`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('application/json');
    const parsed = JSON.parse(content.text) as { categories?: unknown[] };
    expect(Array.isArray(parsed.categories)).toBe(true);
  });

  it('reads a strategy guide markdown file', () => {
    const uri = `${MTG_COMMANDER_RESOURCE_PREFIX}strategy-guide/tokens`;
    const content = readMcpResource(uri);
    expect(content.mimeType).toBe('text/markdown');
    expect(content.text.length).toBeGreaterThan(50);
  });

  it('throws for unknown URI', () => {
    expect(() => readMcpResource(`${MTG_COMMANDER_RESOURCE_PREFIX}unknown/thing`)).toThrow(
      /Unknown resource/
    );
  });
});
