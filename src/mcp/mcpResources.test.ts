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
    expect(uris.some((u) => u.includes('strategy-guide/tokens'))).toBe(true);
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
