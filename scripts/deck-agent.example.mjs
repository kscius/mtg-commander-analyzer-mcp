/**
 * Example: run a Cursor SDK agent with this repo's MCP attached.
 *
 * Prerequisites:
 *   npm install @cursor/sdk
 *   export CURSOR_API_KEY=...
 *   This repo: npm install && db setup (see INSTALLATION.md)
 *
 * Usage:
 *   node scripts/deck-agent.example.mjs "Build a Bracket 3 group-slug deck for Shadrix Silverquill"
 */

import { Agent } from '@cursor/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userPrompt =
  process.argv.slice(2).join(' ') ||
  'Use MCP tools only. Commander: Shadrix Silverquill. Ask me to pick synergy, then build Bracket 3 group-slug deck.';

const systemContext = `
You are a Commander deck builder for mtg-commander-analyzer-mcp.
Follow AGENTS.md: get_synergies → user picks one slug → get_strategy_guide → build_deck_from_commander → analyze_deck → optimize_deck if needed.
Read agentBrief and qualityGate on every tool result. Never invent card names.
`.trim();

async function main() {
  const agent = await Agent.create({
    cwd: repoRoot,
    mcpServers: {
      'mtg-commander-analyzer': {
        type: 'stdio',
        command: 'npm',
        args: ['run', 'mcp'],
        cwd: repoRoot,
      },
    },
  });

  const run = await agent.prompt({
    messages: [
      { role: 'system', content: systemContext },
      { role: 'user', content: userPrompt },
    ],
  });

  for await (const message of run.stream()) {
    if (message.type === 'text') {
      process.stdout.write(message.text);
    }
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
