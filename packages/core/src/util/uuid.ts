/**
 * Portable UUID generation.
 *
 * WHY NOT `node:crypto`
 * --------------------
 * core runs in two very different hosts: Node (tests, any CLI) AND the Tauri webview, where the UI's
 * real bridge loads core's runtime to talk to the SQLite store. The webview is a browser environment
 * with no `node:` builtins, so `import { randomUUID } from "node:crypto"` both fails the browser
 * build (Vite externalizes `node:crypto` to an empty stub) and would crash at runtime in the packaged
 * app. `globalThis.crypto.randomUUID()` is the Web Crypto standard — present in browsers, the Tauri
 * webview, and Node ≥19 — so it is the one call that works in every host core targets.
 */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}
