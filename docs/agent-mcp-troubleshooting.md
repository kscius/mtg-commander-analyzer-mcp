# Agent MCP troubleshooting

When an LLM agent cannot build or analyze decks, fix environment issues before guessing card names.

## Symptom → fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Cursor MCP server **errored** | Wrong command, cwd, or Node path | Settings → MCP: use `.cursor/mcp.json` (`scripts/run-mcp.cjs`), cwd = repo root |
| Startup log: **Card database: NOT READY** (DB file exists) | `better-sqlite3` ABI mismatch — MCP `node` ≠ rebuild `node` | `npm rebuild better-sqlite3` with the same Node MCP uses; restart MCP |
| `search_cards.databaseReady === false` | Missing or broken SQLite | `npm run db:create` then `npm run db:import` |
| `NODE_MODULE_VERSION` / better-sqlite3 error | Native module built for another Node | Put your nvm Node first on PATH, then `npm rebuild better-sqlite3` |
| `Cannot find module '...\\dist\\mcp\\server.js'` (path under user home) | MCP `args` uses relative path but `cwd` not applied | Use absolute path to `dist/mcp/server.js`, or `npm run mcp` with `cwd` = repo root |
| `Commander "X" not found` | Name typo or DB stale | Use exact Scryfall name; `resolve_card`; re-import if needed |
| Empty `search_cards` with `error` | No filter passed | Pass at least one of `category`, `query`, `colorIdentity`, `type`, `commanderName`, `maxMV`, or `commanderLegal: false` |
| EDHREC notes in analyze | Network or rate limit | Retry; use `search_cards` + template build without EDHREC adds |
| Build returns `< 99` cards | Bracket remediation or pool gaps | `optimize_deck` or manual `search_cards` by `below` category |

## Verify database

```powershell
# Windows + nvm4w: use one Node for rebuild, db scripts, and MCP
$env:Path = "C:\nvm4w\nodejs;" + $env:Path
node -v
npm run db:create
npm run db:import
npm rebuild better-sqlite3
```

Then restart the MCP server in Cursor (Settings → MCP → refresh).

Then call `search_cards` with `{ "category": "ramp", "colorIdentity": ["R","G"], "limit": 5 }` — expect `databaseReady: true` and `count > 0`.

## Verify MCP in Cursor

1. Open MCP panel; server `user-mtg-commander-analyzer` should be **connected**.
2. Run `get_synergies` with a known commander (e.g. `Atraxa, Praetors' Voice`).
3. If errored: check `INSTALLATION.md` and `.cursor/mcp.json` (or global MCP config) for `cwd` and `command`.

## Agent behavior when blocked

- Do **not** invent card names when `databaseReady === false`.
- Read `summary` and `nextSuggestedAction` on every tool response.
- Use **`build_deck_from_commander`** (`useTemplateGenerator: true`) for new decks; no OpenAI MCP tool in this repo.
- Document the blocker to the user with the exact command output.

## Related docs

- `AGENTS.md` — tool flow and response fields
- `INSTALLATION.md` — full setup
- `.cursor/skills/mtg-mcp-troubleshoot/SKILL.md` — skill workflow
