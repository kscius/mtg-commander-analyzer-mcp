/**
 * MCP entrypoint — runs with whichever `node` launches this file.
 * Keep that Node ABI aligned with better-sqlite3 (npm rebuild better-sqlite3).
 */
// ts-node 10.x breaks under TypeScript 7 (ts.sys undefined). tsx supports TS 7 + moduleResolution bundler.
require('tsx/cjs');
require('../src/mcp/server');
