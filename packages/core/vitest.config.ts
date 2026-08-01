import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Native SQLite plus Node's process pool intermittently exits with EPIPE on Windows when
    // many files run concurrently. A single worker is slower but makes the primary safety gate
    // deterministic and still completes comfortably within the development timeout.
    minWorkers: 1,
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The engine is the product's guarantee: hold it to 100% branch coverage.
      include: ["src/engine/**/*.ts"],
      thresholds: {
        "src/engine/**/*.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
