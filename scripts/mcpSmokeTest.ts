/**
 * MCP stdio smoke test — boots the real MCP server and exercises discovery RPCs
 * plus one DB-backed tools/call to catch handler and SQLite regressions.
 *
 * Run: npm run test:mcp-smoke
 * CI: after cards.db setup (requires data/cards.db for tools/call assertions).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpTools } from '../src/mcp/toolSchemas';

const PROJECT_ROOT = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'scripts/run-mcp.cjs');
const CARDS_DB = path.join(PROJECT_ROOT, 'data/cards.db');
const EXPECTED_TOOL_NAMES = buildMcpTools()
  .map((tool) => tool.name)
  .sort();

type ResolveCardSmokePayload = {
  resolved?: boolean;
  canonicalName?: string;
  fitsCommanderColors?: boolean;
  databaseReady?: boolean;
};

function parseToolTextContent(content: unknown): unknown {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('tools/call returned empty content');
  }
  const first = content[0];
  if (!first || typeof first !== 'object' || !('type' in first) || first.type !== 'text') {
    throw new Error('tools/call: expected text content block');
  }
  if (!('text' in first) || typeof first.text !== 'string') {
    throw new Error('tools/call: expected text payload');
  }
  return JSON.parse(first.text) as unknown;
}

async function smokeTestDbBackedTools(client: Client): Promise<void> {
  if (!fs.existsSync(CARDS_DB)) {
    throw new Error(
      `cards.db not found at ${CARDS_DB}. Run bash scripts/ci-setup-db.sh (or db:create + db:import) first.`
    );
  }

  const resolveResult = await client.callTool({
    name: 'resolve_card',
    arguments: {
      cardName: 'Sol Ring',
      commanderName: 'Shadrix Silverquill',
    },
  });

  if (resolveResult.isError) {
    throw new Error(`resolve_card returned isError: ${JSON.stringify(resolveResult.content)}`);
  }

  const parsed = parseToolTextContent(resolveResult.content) as ResolveCardSmokePayload;

  if (parsed.resolved !== true) {
    throw new Error(`resolve_card: expected resolved=true, got ${JSON.stringify(parsed)}`);
  }
  if (parsed.canonicalName !== 'Sol Ring') {
    throw new Error(
      `resolve_card: expected canonicalName="Sol Ring", got ${parsed.canonicalName ?? '(missing)'}`
    );
  }
  if (parsed.fitsCommanderColors !== true) {
    throw new Error('resolve_card: Sol Ring should fit Shadrix Silverquill color identity');
  }
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_ENTRY],
    cwd: PROJECT_ROOT,
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'mcp-smoke-test', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  const { tools } = await client.listTools();
  const toolNames = tools.map((tool: Tool) => tool.name).sort();

  if (toolNames.length !== EXPECTED_TOOL_NAMES.length) {
    throw new Error(
      `Expected ${EXPECTED_TOOL_NAMES.length} tools, got ${toolNames.length}: ${toolNames.join(', ')}`
    );
  }

  for (let i = 0; i < EXPECTED_TOOL_NAMES.length; i++) {
    if (toolNames[i] !== EXPECTED_TOOL_NAMES[i]) {
      throw new Error(
        `Tool name mismatch at index ${i}: expected ${EXPECTED_TOOL_NAMES[i]}, got ${toolNames[i]}`
      );
    }
  }

  const { resources } = await client.listResources();
  if (!resources?.length) {
    throw new Error('resources/list returned empty');
  }

  const { prompts } = await client.listPrompts();
  if (!prompts?.length) {
    throw new Error('prompts/list returned empty');
  }

  await smokeTestDbBackedTools(client);

  console.log(
    `mcpSmokeTest: OK — ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts, resolve_card (DB)`
  );

  await client.close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mcpSmokeTest: FAILED — ${message}`);
  process.exit(1);
});
