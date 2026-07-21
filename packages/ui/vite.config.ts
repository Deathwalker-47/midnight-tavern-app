import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The UI resolves `@midnight-tavern/core` to the package's TypeScript source (its package.json
// `main` points at src/index.ts), so Vite transpiles core alongside the UI in dev — no build
// step of core is required to run the app.
//
// core's store lazily `import()`s `betterSqliteDriver.ts` (Node/tests only). That path is NEVER
// evaluated in the webview — the packaged app uses the Tauri IPC driver (bridge/sqliteDriver.ts).
// But Vite's dependency scanner still *follows* the dynamic import and warns that better-sqlite3's
// `fs`/`path`/`util` were externalized. We mark the native module and those builtins external so the
// scan stops there: the browser/native boundary is explicit, and the warnings disappear.
const NATIVE_EXTERNALS = ["better-sqlite3", "bindings", "node:fs", "node:path", "node:util", "fs", "path", "util"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@midnight-tavern/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ["better-sqlite3", "bindings"],
  },
  build: {
    rollupOptions: {
      external: NATIVE_EXTERNALS,
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
});
