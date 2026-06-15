import { defineConfig } from "vitest/config";

/** Dedicated config so golden regression is not affected by default test exclude. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/core/goldenDeckRegression.test.ts"],
    passWithNoTests: false,
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
