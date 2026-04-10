# Testing

## Unit tests (Vitest)

- **Run once:** `npm test` (alias: `vitest run`)
- **Watch mode:** `npm run test:watch`
- **Config:** `vitest.config.ts` — tests live alongside source as `src/**/*.test.ts`
- **Build:** test files are excluded from `tsc` output via `tsconfig.json` `exclude`

## CI

GitHub Actions workflow `.github/workflows/ci.yml` runs on pushes and pull requests targeting `main` or `master`: `npm ci`, `npm run build`, `npm test` on Node.js 18 and 20.

## Manual integration scripts

Legacy demo scripts (not the Vitest suite):

- `npm run test:local` — `src/testLocal.ts`
- `npm run test:build` — `src/testBuildLocal.ts`
- `npm run test:e2e` — `src/testEndToEnd.ts`

These require a populated `data/cards.db` where applicable.
