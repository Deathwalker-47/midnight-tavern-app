/**
 * React entry point. Imports the design tokens exactly once (every component below inherits
 * the CSS variables and the two-register helper classes from here), then mounts the shell.
 *
 * BRIDGE SELECTION (audit finding #1 — the release blocker).
 * ---------------------------------------------------------
 * The packaged desktop app MUST persist to SQLite. We detect the Tauri runtime (its `__TAURI__`
 * global / `isTauri()`) and initialize the SQLite bridge BEFORE mounting React, so the very first
 * render already talks to the real store. In `vite dev` / jsdom there is no Tauri runtime, so we
 * fall back to the in-memory bridge (design/dev only).
 *
 * If SQLite init fails inside Tauri we do NOT silently fall back to memory — that's exactly the bug
 * the audit flagged (data that looks saved but evaporates on restart). Instead we render an
 * actionable failure screen so the user knows persistence is broken.
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "./theme/tokens.css";
import { App } from "./app/App.js";
import { initBridge } from "./bridge/core.js";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element in index.html");
const root: Root = createRoot(container);

/**
 * True when running inside the Tauri desktop shell. Tauri v2 injects `__TAURI_INTERNALS__` (and the
 * older `__TAURI__`) onto `window`; either presence is a reliable, synchronous runtime signal that
 * IPC (`invoke`) is available — which the SQLite driver requires.
 */
function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

/** Minimal, dependency-free failure screen shown when SQLite init throws inside the desktop shell. */
function renderStartupFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  root.render(
    <StrictMode>
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          color: "var(--color-ink, #e8e6e1)",
          background: "var(--color-bg, #14100c)",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Couldn’t open your library</h1>
        <p style={{ maxWidth: "42ch", opacity: 0.8, margin: 0 }}>
          Midnight Tavern couldn’t open its local database, so your stories can’t be loaded or saved.
          Your data is safe on disk — this is a startup problem, not data loss.
        </p>
        <pre
          style={{
            maxWidth: "60ch",
            whiteSpace: "pre-wrap",
            fontSize: "0.8rem",
            opacity: 0.6,
            margin: 0,
          }}
        >
          {message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            borderRadius: "8px",
            border: "1px solid var(--color-line, #3a332a)",
            background: "transparent",
            color: "inherit",
          }}
        >
          Try again
        </button>
      </div>
    </StrictMode>
  );
}

function renderApp(): void {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

async function bootstrap(): Promise<void> {
  if (isTauriRuntime()) {
    // Desktop: real persistence is mandatory. Failure surfaces, never silently degrades to memory.
    try {
      await initBridge({ backend: "sqlite" });
    } catch (err) {
      console.error("[startup] SQLite bridge init failed:", err);
      renderStartupFailure(err);
      return;
    }
  } else {
    // Browser dev / tests: in-memory backend so the app boots without a native runtime.
    await initBridge({ backend: "memory" });
  }
  renderApp();
}

void bootstrap();
