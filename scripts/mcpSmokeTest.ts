/**
 * MCP stdio smoke test — boots the real MCP server and exercises discovery RPCs,
 * one static resources/read, one prompts/get, plus one DB-backed tools/call to catch
 * handler and SQLite regressions.
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

/** Stable static resource — does not depend on user deck imports. */
const SMOKE_RESOURCE_URI = 'mtg-commander:///banlist';
const SMOKE_PROMPT_NAME = 'build-commander-deck';
const SMOKE_PROMPT_COMMANDER = 'Shadrix Silverquill';

type ResolveCardSmokePayload = {
  resolved?: boolean;
  canonicalName?: string;
  fitsCommanderColors?: boolean;
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

async function smokeTestResourceRead(client: Client): Promise<void> {
  const result = await client.readResource({ uri: SMOKE_RESOURCE_URI });
  const contents = result.contents;
  if (!Array.isArray(contents) || contents.length === 0) {
    throw new Error(`resources/read ${SMOKE_RESOURCE_URI}: empty contents`);
  }
  const first = contents[0];
  if (!first || typeof first !== 'object' || !('text' in first) || typeof first.text !== 'string') {
    throw new Error(`resources/read ${SMOKE_RESOURCE_URI}: expected text content`);
  }
  if (first.text.trim().length === 0) {
    throw new Error(`resources/read ${SMOKE_RESOURCE_URI}: text is empty`);
  }
  if ('uri' in first && first.uri !== SMOKE_RESOURCE_URI) {
    throw new Error(
      `resources/read: expected uri=${SMOKE_RESOURCE_URI}, got ${String(first.uri)}`
    );
  }
}

async function smokeTestPromptGet(client: Client): Promise<void> {
  const result = await client.getPrompt({
    name: SMOKE_PROMPT_NAME,
    arguments: { commanderName: SMOKE_PROMPT_COMMANDER },
  });
  if (!Array.isArray(result.messages) || result.messages.length === 0) {
    throw new Error(`prompts/get ${SMOKE_PROMPT_NAME}: empty messages`);
  }
  const first = result.messages[0];
  const content = first?.content;
  if (!content || typeof content !== 'object' || !('type' in content) || content.type !== 'text') {
    throw new Error(`prompts/get ${SMOKE_PROMPT_NAME}: expected text message content`);
  }
  if (!('text' in content) || typeof content.text !== 'string' || content.text.trim().length === 0) {
    throw new Error(`prompts/get ${SMOKE_PROMPT_NAME}: text is empty`);
  }
  if (!content.text.includes(SMOKE_PROMPT_COMMANDER)) {
    throw new Error(
      `prompts/get ${SMOKE_PROMPT_NAME}: expected commander name "${SMOKE_PROMPT_COMMANDER}" in prompt text`
    );
  }
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

  let connected = false;
  try {
    await client.connect(transport);
    connected = true;

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
    if (!resources.some((resource) => resource.uri === SMOKE_RESOURCE_URI)) {
      throw new Error(`resources/list missing expected URI ${SMOKE_RESOURCE_URI}`);
    }

    const { prompts } = await client.listPrompts();
    if (!prompts?.length) {
      throw new Error('prompts/list returned empty');
    }
    if (!prompts.some((prompt) => prompt.name === SMOKE_PROMPT_NAME)) {
      throw new Error(`prompts/list missing expected prompt ${SMOKE_PROMPT_NAME}`);
    }

    await smokeTestResourceRead(client);
    await smokeTestPromptGet(client);
    await smokeTestDbBackedTools(client);

    console.log(
      `mcpSmokeTest: OK — ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts, ` +
        `resources/read, prompts/get, resolve_card (DB)`
    );
  } finally {
    if (connected) {
      try {
        await client.close();
      } catch (closeError: unknown) {
        const message = closeError instanceof Error ? closeError.message : String(closeError);
        console.error(`mcpSmokeTest: client.close() failed — ${message}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mcpSmokeTest: FAILED — ${message}`);
  process.exit(1);
});
