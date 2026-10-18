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

## Current set (2026-10-18)

The icons in this folder **are committed** and were generated from the vector
source `packages/shell/app-icon.svg` — a placeholder mark (brass crescent, teal
star, on the app's ground colours from `packages/ui/src/theme/tokens.css`). The
earlier set was never committed and was lost when the build machine was
formatted, which is why they now live in git.

To replace the artwork, overwrite `app-icon.svg` (or pass a 1024x1024 PNG) and
re-run from `packages/shell/`:

```
npx tauri icon app-icon.svg
```

then delete the `android/` and `ios/` folders it also emits (no mobile target).
