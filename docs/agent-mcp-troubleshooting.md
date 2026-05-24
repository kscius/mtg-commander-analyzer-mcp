# Agent MCP troubleshooting

When an LLM agent cannot build or analyze decks, fix environment issues before guessing card names.

## Symptom → fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Cursor MCP server **errored** | Wrong command, cwd, or Node path | Settings → MCP: command `npm run mcp`, cwd = repo root, Node LTS |
| `search_cards.databaseReady === false` | Missing or broken SQLite | `npm run db:create && npm run db:import` |
| `NODE_MODULE_VERSION` / better-sqlite3 error | Native module built for another Node | `npm rebuild better-sqlite3` (match Node version to install) |
| `Cannot find module '...\\dist\\mcp\\server.js'` (path under user home) | MCP `args` uses relative path but `cwd` not applied | Use absolute path to `dist/mcp/server.js`, or `npm run mcp` with `cwd` = repo root |
| `Commander "X" not found` | Name typo or DB stale | Use exact Scryfall name; `resolve_card`; re-import if needed |
| Empty `search_cards` with `error` | No filter passed | Pass `category`, `query`, `colorIdentity`, `type`, or `maxMV` |
| EDHREC notes in analyze | Network or rate limit | Retry; use `search_cards` + template build without EDHREC adds |
| Build returns `< 99` cards | Bracket remediation or pool gaps | `optimize_deck` or manual `search_cards` by `below` category |

## Verify database

```bash
npm run db:create
npm run db:import
npm rebuild better-sqlite3
npm run build
```

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
