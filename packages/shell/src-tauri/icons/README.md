# Icons

This directory holds the platform icon set that `tauri.conf.json > bundle.icon`
references. The icons are **not committed as binaries here** — they are generated
from a single high-resolution source and must exist before a real bundle runs.

## Required files

Tauri expects (per `bundle.icon` in `tauri.conf.json`):

- `32x32.png` — small PNG
- `128x128.png` — standard PNG
- `128x128@2x.png` — retina PNG (256x256 px)
- `icon.icns` — macOS icon bundle (dmg / .app)
- `icon.ico` — Windows icon (msi / nsis / .exe)

Tauri's own tooling also emits a wider PNG set (Windows Store logos, additional
sizes). Keep whatever `tauri icon` produces; the five entries above are the ones
the bundle config points at.

## How to generate

From `packages/shell/`:

```
npx tauri icon path/to/source-icon.png
```

Requirements:

- The source should be a square PNG, at least **1024x1024**, with transparency.
- `tauri icon` writes all outputs into `src-tauri/icons/`.

## Blocked in this environment

No source artwork and no `tauri` CLI run has happened here, so the binary icon
files are absent. A properly-equipped machine must supply the 1024x1024 source
and run `tauri icon` before `tauri build`. Until then the bundle step will fail
on the missing icon paths. See `../../RELEASE.md`.
