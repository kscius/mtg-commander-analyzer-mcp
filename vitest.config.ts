import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
    /** Deck analyze golden tests may hit JSON fallback + many card lookups */
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
