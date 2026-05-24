---
name: mtg-mcp-troubleshoot
description: Diagnose MCP server errors, SQLite/databaseReady failures, and empty search_cards when building Commander decks in this project. Use when search_cards returns databaseReady false, MCP errored, or card resolution fails.
---

# MTG MCP troubleshoot

Use when deck tools fail before any deck logic can run.

## Quick diagnosis

1. Call `search_cards` with minimal filters: `{ "category": "ramp", "limit": 3 }`.
2. Read `databaseReady`, `error`, `summary`, `nextSuggestedAction`.

## If `databaseReady === false`

Run in repo root (via Shell, not user handoff):

```bash
npm rebuild better-sqlite3
npm run db:create
npm run db:import
npm run build
```

Re-test `search_cards`. If still false, check Node version matches the one used for `npm install`.

## If MCP server errored in Cursor

- Confirm MCP config: `npm run mcp`, cwd = project root.
- See `docs/agent-mcp-troubleshooting.md` and `INSTALLATION.md`.

## If commander or card not found

- `resolve_card` with exact Scryfall name.
- Never invent names when DB is down.

## After fix

Resume normal flow from `AGENTS.md`: `get_synergies` → build → `analyze_deck` → check `qualityGate.readyToShip`.
