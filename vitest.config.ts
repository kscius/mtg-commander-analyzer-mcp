import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /** Golden regression runs via `npm run test:golden` (CI + intentional analyzer updates). */
    exclude: ["src/core/goldenDeckRegression.test.ts"],
    passWithNoTests: false,
    /** Deck analyze golden tests may hit JSON fallback + many card lookups */
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
