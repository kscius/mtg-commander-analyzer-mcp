/**
 * MCP entrypoint — runs with whichever `node` launches this file.
 * Keep that Node ABI aligned with better-sqlite3 (npm rebuild better-sqlite3).
 */
require('ts-node/register/transpile-only');
require('../src/mcp/server');
