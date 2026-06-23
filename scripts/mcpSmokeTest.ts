/**
 * MCP stdio smoke test — boots the real MCP server and exercises discovery RPCs.
 *
 * Run: npm run test:mcp-smoke
 * CI: after cards.db setup (server logs DB readiness; test does not require DB for RPCs).
 */

import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpTools } from '../src/mcp/toolSchemas';

const PROJECT_ROOT = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'scripts/run-mcp.cjs');
const EXPECTED_TOOL_NAMES = buildMcpTools()
  .map((tool) => tool.name)
  .sort();

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

  console.log(
    `mcpSmokeTest: OK — ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`
  );

  await client.close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`mcpSmokeTest: FAILED — ${message}`);
  process.exit(1);
});
