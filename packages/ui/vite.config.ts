import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The UI resolves `@midnight-tavern/core` to the package's TypeScript source (its package.json
// `main` points at src/index.ts), so Vite transpiles core alongside the UI in dev — no build
// step of core is required to run the app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@midnight-tavern/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
});
