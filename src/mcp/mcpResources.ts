/**
 * MCP Resources — read-only project docs and data for LLM agents.
 */

import * as fs from 'fs';
import * as path from 'path';

/** URI prefix for all resources (path after prefix is the resource key). */
export const MTG_COMMANDER_RESOURCE_PREFIX = 'mtg-commander:///';

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

function projectRoot(): string {
  return path.join(__dirname, '..', '..');
}

function buildUri(relativePath: string): string {
  return `${MTG_COMMANDER_RESOURCE_PREFIX}${relativePath}`;
}

function readProjectFile(relativePath: string): string {
  const full = path.join(projectRoot(), relativePath);
  if (!fs.existsSync(full)) {
    throw new Error(`Resource file not found: ${relativePath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

/** Static + strategy guide resources exposed to MCP clients. */
export function listMcpResources(): McpResourceDescriptor[] {
  const resources: McpResourceDescriptor[] = [
    {
      uri: buildUri('template/bracket3'),
      name: 'Bracket 3 deck template',
      description: 'Category mins/maxes, mana base, curve (data/deck-template-bracket3.json)',
      mimeType: 'application/json',
    },
    {
      uri: buildUri('banlist'),
      name: 'Project banlist',
      description: 'Custom banned cards (data/Banlist.txt)',
      mimeType: 'text/plain',
    },
    {
      uri: buildUri('bracket-rules'),
      name: 'Bracket 3 rules',
      description: 'Game changer / extra turn caps (data/bracket-rules.json)',
      mimeType: 'application/json',
    },
    {
      uri: buildUri('agents'),
      name: 'AGENTS.md',
      description: 'Agent workflow entry point and MCP tool guide',
      mimeType: 'text/markdown',
    },
    {
      uri: buildUri('strategy-guides/index'),
      name: 'Strategy guide index',
      description: 'Slug → file mapping (data/strategy-guides-index.json)',
      mimeType: 'application/json',
    },
    {
      uri: buildUri('strategy-guides/meta'),
      name: 'Strategy guide metadata',
      description: 'Ratios, packages, anti-patterns (data/strategy-guides.json)',
      mimeType: 'application/json',
    },
    {
      uri: buildUri('docs/bracket3-template-for-agents'),
      name: 'Bracket 3 template for agents',
      description: 'Human-readable Bracket 3 construction reference',
      mimeType: 'text/markdown',
    },
  ];

  try {
    const indexPath = path.join(projectRoot(), 'data', 'strategy-guides-index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as Record<
      string,
      { slug: string; title: string }
    >;
    for (const [slug, entry] of Object.entries(index)) {
      resources.push({
        uri: buildUri(`strategy-guide/${slug}`),
        name: `Strategy guide: ${entry.title ?? slug}`,
        description: `Archetype construction guide (${slug})`,
        mimeType: 'text/markdown',
      });
    }
  } catch {
    // index optional at runtime
  }

  return resources;
}

function parseResourceKey(uri: string): string {
  if (!uri.startsWith(MTG_COMMANDER_RESOURCE_PREFIX)) {
    throw new Error(
      `Invalid resource URI (expected ${MTG_COMMANDER_RESOURCE_PREFIX}...): ${uri}`
    );
  }
  const key = uri.slice(MTG_COMMANDER_RESOURCE_PREFIX.length);
  if (!key || key.includes('..')) {
    throw new Error(`Invalid resource path: ${uri}`);
  }
  return key;
}

/** Read resource body by MCP URI. */
export function readMcpResource(uri: string): McpResourceContent {
  const key = parseResourceKey(uri);

  const staticFiles: Record<string, { file: string; mimeType: string }> = {
    'template/bracket3': { file: 'data/deck-template-bracket3.json', mimeType: 'application/json' },
    banlist: { file: 'data/Banlist.txt', mimeType: 'text/plain' },
    'bracket-rules': { file: 'data/bracket-rules.json', mimeType: 'application/json' },
    agents: { file: 'AGENTS.md', mimeType: 'text/markdown' },
    'strategy-guides/index': {
      file: 'data/strategy-guides-index.json',
      mimeType: 'application/json',
    },
    'strategy-guides/meta': { file: 'data/strategy-guides.json', mimeType: 'application/json' },
    'docs/bracket3-template-for-agents': {
      file: 'docs/bracket3-template-for-agents.md',
      mimeType: 'text/markdown',
    },
  };

  const staticEntry = staticFiles[key];
  if (staticEntry) {
    return {
      uri,
      mimeType: staticEntry.mimeType,
      text: readProjectFile(staticEntry.file),
    };
  }

  if (key.startsWith('strategy-guide/')) {
    const slug = key.slice('strategy-guide/'.length);
    if (!slug || slug.includes('/')) {
      throw new Error(`Invalid strategy guide slug in URI: ${uri}`);
    }
    let fileName = `${slug}.md`;
    try {
      const index = JSON.parse(
        readProjectFile('data/strategy-guides-index.json')
      ) as Record<string, { file?: string }>;
      if (index[slug]?.file) fileName = index[slug].file!;
    } catch {
      // fall back to slug.md
    }
    return {
      uri,
      mimeType: 'text/markdown',
      text: readProjectFile(`docs/strategy-guides/${fileName}`),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}
