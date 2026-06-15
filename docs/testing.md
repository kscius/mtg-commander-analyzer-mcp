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
2. `bash scripts/ci-setup-db.sh` — downloads Scryfall oracle bulk data and builds `data/cards.db` **once**
3. `npm run build` — strict TypeScript
4. `npm test` — unit + integration tests (golden excluded)
5. `npm run test:golden` — analyze regression against `data/golden/shadrix-group-slug-analyze.expected.json`
6. `npm run benchmark:decks` — template-only builds for three commanders; **fails on hard invariant violations** (wrong card count, banlist, hard lint, thrown errors). Soft gaps (`readyToShip`, category mins) log as warnings only.

**Node.js:** CI uses **20.x** only. Vitest 3 + Vite ESM config fails on Node 18 in CI (`ERR_REQUIRE_ESM`). Local development on Node 18 may work for some scripts but is not CI-guaranteed.

**Not in CI:** `npm run test:e2e` (EDHREC network), `npm run brackets:check-official` (Playwright + live HTTP). Run these manually before bracket-policy or EDHREC changes.

## Manual integration scripts

Legacy demo scripts (not the Vitest suite):

- `npm run test:local` — `src/testLocal.ts`
- `npm run test:build` — `src/testBuildLocal.ts`
- `npm run test:e2e` — `src/testEndToEnd.ts`

These require a populated `data/cards.db` where applicable.
