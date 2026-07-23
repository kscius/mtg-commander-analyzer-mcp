# Testing

For how analyze/build flows fit together, see [deck-pipeline.md](./deck-pipeline.md).

## Unit tests (Vitest)

- **Run once:** `npm test` (alias: `vitest run`) — all `src/**/*.test.ts` except golden regression
- **Watch mode:** `npm run test:watch`
- **Golden regression:** `npm run test:golden` — committed Shadrix analyze snapshot (`data/golden/*.expected.json`; uses `vitest.golden.config.ts`)
- **Config:** `vitest.config.ts` — golden is excluded from default `npm test` so CI runs it once in a dedicated step
- **Build:** test files are excluded from `tsc` output via `tsconfig.json` `exclude`

## CI

GitHub Actions workflow `.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` or `master`:

1. `npm ci`
2. `npm audit --audit-level=high` — fail on high/critical advisories in the lockfile
3. `bash scripts/ci-setup-db.sh` — downloads Scryfall oracle bulk data and builds `data/cards.db` **once**
4. `npm run build` — strict TypeScript
5. `npm run test:mcp-smoke` — boots the real stdio MCP server via `scripts/run-mcp.cjs` and asserts `tools/list` (tool count from `buildMcpTools()`), `resources/list` + `resources/read` (`mtg-commander:///banlist`), `prompts/list` + `prompts/get` (`build-commander-deck`), and one DB-backed `tools/call` (`resolve_card` for Sol Ring + Shadrix Silverquill). Closes the client in `finally` so failed asserts do not leave orphan MCP child processes.
6. `npm test` — unit + integration tests (golden excluded)
7. `npm run test:golden` — analyze regression against `data/golden/shadrix-group-slug-analyze.expected.json`
8. `npm run benchmark:decks` — template-only builds for three commanders; **fails on hard invariant violations** (wrong card count, banlist, hard lint, thrown errors). Soft gaps (`readyToShip`, category mins) log as warnings only.

PR runs use workflow `concurrency` with `cancel-in-progress` so superseded commits do not burn runners; push-to-main runs are not cancelled. The `ci` job has `timeout-minutes: 30`.

**Node.js:** CI uses **20.x** only. Vitest 3 + Vite ESM config fails on Node 18 in CI (`ERR_REQUIRE_ESM`). Local development on Node 18 may work for some scripts but is not CI-guaranteed.

**Scheduled (separate workflow):** `.github/workflows/brackets-check.yml` runs monthly (`cron`) and on `workflow_dispatch` with `npm run brackets:check-official:quick` (Wizards HTTPS hard checks; skips Moxfield Playwright). Full `npm run brackets:check-official` (includes Moxfield) remains manual.

**Not in PR CI:** `npm run test:e2e` (EDHREC network), `npm run brackets:check-official` (Playwright + live HTTP). Run the full brackets check manually when Moxfield soft-check needs review.

**Dependabot:** `.github/dependabot.yml` opens weekly PRs for `npm` and `github-actions` ecosystems.

## Repo scripts (tooling)

| Command | Script | Needs `cards.db`? | Network | In CI? |
|---------|--------|-------------------|---------|--------|
| `npm run test:mcp-smoke` | `scripts/mcpSmokeTest.ts` | yes (`resolve_card`) | no | yes |
| `npm run record:golden` | `scripts/recordGoldenAnalyze.ts` | yes | no | no |
| `npm run benchmark:decks` | `scripts/benchmarkDecks.ts` | yes | no (offline EDHREC) | yes |
| `npm run decks:download-moxfield` | `scripts/downloadMoxfieldDecks.ts` | no | yes (Moxfield) | no |
| `npm run decks:user-style-profile` | `scripts/printUserDeckStyleProfile.ts` | no | no | no |
| `npm run brackets:check-official` | `scripts/checkBracketOfficialSources.ts` | no | yes | no (manual / full) |
| `npm run brackets:check-official:quick` | same (`--skip-moxfield`) | no | yes | monthly schedule |
| `bash scripts/ci-setup-db.sh` | downloads oracle bulk + `db:create`/`db:import` | creates DB | yes (Scryfall) | yes |

`ci-setup-db.sh` and `./setup.sh` / `setup.ps1` parse Scryfall bulk-data JSON with a real JSON parser (not `grep`/`cut`) and reject truncated `oracle-cards.json` downloads before import (or before reporting setup complete).

## Manual integration scripts

Legacy demo scripts (not the Vitest suite):

- `npm run test:local` — `src/testLocal.ts`
- `npm run test:build` — `src/testBuildLocal.ts`
- `npm run test:e2e` — `src/testEndToEnd.ts`

These require a populated `data/cards.db` where applicable.
