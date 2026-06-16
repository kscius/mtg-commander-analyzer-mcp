# Test suite

## Unit tests

```bash
npm test
```

Vitest discovers `src/**/*.test.ts`. Most unit tests run without network access.

## Integration tests (`cards.db`)

Several integration tests resolve real card names from SQLite:

```bash
npm run db:create
npm run db:import
```

Helpers in `test/helpers/db.ts`:

- `describeDb` / `itDb` — skip the block when `data/cards.db` is missing or empty
- `hasCardsDatabase()` — runtime check
- `CARDS_DB_SETUP_HINT` — message for scripts and CI logs

Without the database, integration tests are skipped (not failed).

## Golden deck regression

Committed expected analyze output for the Shadrix group-slug fixture:

```bash
npm run test:golden    # compare live analyze vs data/golden/*.expected.json
npm run record:golden  # regenerate expected JSON after intentional analyzer changes
```

Requires `data/cards.db`. CI runs `test:golden` in a dedicated job after `db:create` + `db:import`.

Fixture: `test/fixtures/shadrix-group-slug-golden.txt`  
Expected: `data/golden/shadrix-group-slug-analyze.expected.json`

## Benchmark

```bash
npm run benchmark:decks
```

Builds and analyzes a small set of commanders (template-only, offline EDHREC) and prints timing metrics.

**Exit codes:**

- `1` if `data/cards.db` is not ready
- `1` if any commander hits a **hard** failure: build exception, mainboard ≠ 99, banlist invalid, or hard lint issues
- `0` otherwise — including soft quality gaps (`readyToShip: false`, categories below template mins), which are logged as non-blocking warnings

CI runs this as the final step after golden regression.

## Fixtures

- `test/fixtures/shadrix-group-slug-golden.txt` — 99-card mainboard golden list for analyze/build tests
