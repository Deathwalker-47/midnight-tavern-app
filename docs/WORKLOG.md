# WORKLOG — append-only agent journal

Newest first. **Append** entries; never edit past ones. Each entry: date, agent/session, what
landed, why, verification, and any gotcha the next agent needs. Live state is in
[`HANDOFF.md`](HANDOFF.md); this is the history.

---

## 2026-07-28 — Refresh handoff with packaged latency, streaming, and NPC-agency diagnosis

Updated `docs/HANDOFF.md` as the complete sequential-agent baton after the latest v0.2.8 packaged
Jerusalem Man testing. It now preserves all V6/V7 requirements and later clarifications, separates
landed behavior from unverified acceptance risks, records the exact 48.3 s and 112.9 s turn
breakdowns, and documents two confirmed architectural gaps:

- mechanical narration is deliberately buffered until a whole-draft authority audit succeeds, so
  the existing UI/provider stream cannot display incremental prose; and
- NPC intents are only extracted from prior narrator prose for already-persisted present characters,
  leaving prose-only entities unable to act or receive same-turn DM rulings.

The baton names the next coherent change: test-first same-turn NPC agency plus progressively verified
paragraph/beat streaming, with deterministic reactions, bounded planner fallback, stage deadlines,
telemetry, and atomic persistence. No runtime code changed.

**Verification before documentation edit:** `npm run typecheck` clean; core **463 / 37 files** and UI
**136 / 25 files** green (**599 tests** total). The same seven known React `act(...)` warnings remain.

## 2026-07-28 — Fix packaged classifier invalid-output regression

The human's first successful packaged story then failed its first turn with **"Mechanics safely
paused · Invalid response."** The app log proved the Electron Hub classifier returned non-empty JSON
four times (initial + three repairs), but every response failed strict `ClassifiedTurn` validation.
The persisted player message explicitly named two valid Jerusalem Man catalog actions:
`Reload and Clean` and `Press the Ride`.

**Fix.**
- The classifier schema now normalizes harmless OpenAI-compatible JSON-mode variations: `null` or
  empty optional ids become absent, enum strings are trimmed, numeric confidence strings are parsed,
  and missing/null intent arrays or `freeText` take conservative empty defaults.
- The sealed actor/action/skill enums still validate after normalization. Unknown ids remain invalid.
- If all structured repairs still fail, a deterministic fallback can recover multiple actions only
  when the player used an exact, uniquely owned sealed label, id, or alias. Shared phrases and
  unresolved required targets fail closed. This recovered the reported two-action sentence without
  granting the model any new mechanical authority.

**Verification:** typecheck clean; core **458 / 36 files** + UI **133 / 25 files** = **591 tests**
green; production build green; Windows v0.2.6 MSI + NSIS generated. SHA-256: NSIS
`E3B0B867DCCEAE3ABCFA21C4E0D9CADB35BE2014C29DD758D72643B3F866ED6C`; MSI
`715C7C4986BB91DA2C1C80BB73F60619A099A110259D39298487863CA21821E3`.

**Still needs human verification:** retry a turn in v0.2.6. The saved v0.2.5 failed turn remains
narration-only by design; submit a new message after installing.

---

## 2026-07-28 — Fix forge "Failed to fetch" (native provider transport) + persona name + build

Testing the installer, forge failed with **"Couldn't forge story / Failed to fetch."**

**Root cause (transport, not response-handling).** Provider calls used the webview's browser `fetch`
from `tauri://localhost`; provider APIs send no CORS headers for browser origins → blocked. Evidence:
`core.makeRouter` at `sqliteBridge.ts:110` was called with no `fetchImpl`, so it defaulted to global
`fetch` (`router.ts:183`), and the Rust shell registered no HTTP plugin.

**Fix.** Perform provider HTTP natively (Rust/reqwest) via `tauri-plugin-http`, injected into core:
- shell: add `tauri-plugin-http`, register `.plugin(tauri_plugin_http::init())`, add an `http:default`
  scope to `capabilities/default.json` (`https://**` + localhost).
- ui: `@tauri-apps/plugin-http` `fetch` injected into `core.makeRouter({ fetchImpl })` (covers all
  forge/turn/role calls) + the two `makeProvider` sites (key validation, model listing).
- The in-memory/browser-dev bridge keeps global `fetch` (unchanged).

**Also:** removed the redundant "Your name in the story" field in StoryBlueprint — the player name now
comes from the chosen persona (`selectedPersona.name`, fallback draft value then "You").

**Build gotcha (environment, documented so the next agent doesn't burn a cycle):** the rebuild first
FAILED at cargo's crates.io fetch with schannel `CRYPT_E_NO_REVOCATION_CHECK` — the proxy's TLS
revocation endpoint is unreachable, and it only surfaces when a *new* crate is added (cached crates
hid it before). Fixed with `.cargo/config.toml` → `[http] check-revoke = false` (skips only
revocation; cert chain still verified). With that, both installers built (plugin confirmed in
Cargo.lock). Fresh v0.2.5 hashes: NSIS `b9a8cca0…`, MSI `84364cb4…`.

**Verification:** typecheck clean; core 454 + ui 133 green; Windows MSI+NSIS bundles produced.
**Unverified (needs human):** the live provider call now actually succeeding end-to-end in the
packaged app — that's the test. If it still fails, capture Settings → Open Logs (role + error).

---

## 2026-07-28 — Internal Beta exit: bridge drift guard, restart proof, act() cleanup

Completed the remaining Internal-Beta-exit plan items (1, 3, 4). Final baseline:
**core 454 / 36 files, ui 133 / 25 files = 587 tests**, typecheck clean.

**Item 1 — CoreBridge de-duplication (drift guard).** The in-memory bridge (`bridge/core.ts`)
hand-mirrors core's catalog because it must not value-import core's native runtime into the eager
webview bundle (a deliberate, load-bearing boundary — see the static-type vs dynamic-runtime import
split in that file). Rather than break that boundary, added
`packages/ui/test/bridge/catalogParity.test.ts`, which asserts the in-memory bridge's public catalog
surface is identical to canonical `@midnight-tavern/core`. It **immediately caught real drift**:
`MEMORY_KNOWN_MODELS` listed 8 of core's 14 models and mis-tiered direct GPT-4o. Resynced it to
canonical (source of truth: `core/src/router/model-recommendations.config.json`). Drift now fails CI.

**Item 3 — restart persistence proof.** `packages/core/test/store/persistence.test.ts`: opens a real
file-backed store (`openStore` over better-sqlite3), writes story+message+setting, closes, reopens a
fresh connection to the same file, asserts all restored. Closes the audits' unproven beta gate at the
durability-contract level (the packaged Tauri driver shares the same contract via `openStoreWith`).

**Item 4 — React act() warnings 31 → 7.** Play: guarded the two mount-load effects when the
`debugState` preview prop is set (preview must not do IO). StorySettings tests: flushed the mount
config-load with a trailing `act()`. Residual 7 (5 `RulingBlock` reveal-timer + 1 Play + 1 Overview)
are animation/async-reveal noise in two tests — left for a follow-up, tracked in the plan.

**Caveat for next agent:** the item-1 commit shows large line churn on `core.ts` — that's CRLF vs LF
noise (repo has no `.gitattributes`, `core.autocrlf=false`); content is correct. If you touch this a
lot, consider adding a `.gitattributes` (`* text=auto eol=lf`) in a dedicated normalization commit.

**Next:** Internal-Beta-exit code items are done. Remaining before calling the phase closed: (a) mop
up the last 7 act() warnings if desired, (b) confirm the human's manual packaged-app pass. After
that, the **later** phase is release/sellable (signing, updater, CSP, live-model acceptance).

---

## 2026-07-28 — Internal Beta exit: kickoff + card-import consolidation

**Context:** Full-code review (via codebase-memory graph) + next-phase decision. Chose the
**Internal Beta exit** track (see `Plan/next-phase-internal-beta.md`). Established this agent-handoff
mechanism (`AGENTS.md`, `docs/HANDOFF.md`, this log, the plan checklist).

**Landed — card-import consolidation (plan item 2):**
- Retired the orphaned `CardCreator` screen. It was registered but no nav path reached it, and its
  primary "Use this card" button had no handler. Deleted `packages/ui/src/screens/CardCreator.tsx`
  and its test; removed it from `app/router.ts` (ROUTES), `screens/registry.ts`, and `app/App.tsx`
  (nav `activeOn` + route-label map).
- Enriched the **working** import path — Library's modal (`packages/ui/src/screens/Library.tsx`):
  drag-and-drop drop zone (`data-testid="import-drop-zone"`), character trait chips, and a
  "Sparse card" warning (`data-testid="import-sparse-warning"`) when a card has no openings/lore.
- Tests: `Library.test.tsx` import coverage 1 → 3 (happy-path→Blueprint, drag-drop, sparse-card).

**Gotcha for next agent:** the bridge's `CardImportResult.spec` string **already** contains the
`"Card format …"` prefix (see `sqliteBridge.ts` importCard). Do not add another prefix in the UI.

**Verification:** `npm run typecheck` clean; UI suite 24 files / 126 tests green. (Core unchanged at
453.) Net test delta: −2 (CardCreator) +2 (new import tests) = 126 UI.

**Next:** plan item 1 — de-duplicate the CoreBridge (`core.ts` vs `sqliteBridge.ts`).

---

## 2026-07-28 — Persist in-flight Play operations and rebalance routine rulings

The packaged Jerusalem Man test showed that leaving Play during a long provider call and returning
discarded the visible operation, while routine actions such as prayer and travel were unnecessarily
rolled and could produce repeated failures.

**Navigation fix.** `playStore.load(storyId)` previously minted a new operation generation on every
Play mount. Returning to the same story therefore invalidated the still-running submit/swipe
callbacks and replaced the stream with an incomplete backend snapshot. Same-story loads now reuse
the active global Zustand operation. A deferred-bridge regression test proves the stream survives
route re-entry and the completed authoritative transcript is published without resubmission.

**Low-friction resolution.** `MechanicalIntent` now carries a scene-grounded stakes classification:
`none`, `uncertain`, `danger`, `opposed`, `time_pressure`, or `scarcity`. Routine dialogue, thought,
prayer, maintenance, safe travel, and atmospheric gestures are narration-only unless a concrete
mechanical goal or obstacle exists. Valid unopposed narration-only actions with `stakes=none`
auto-succeed without RNG or XP. Opposition, attacks, deception, non-none stakes, costs, or any
tracked state effect still force deterministic resolution. Gates continue to deny unavailable
skills/items. Automatic outcomes receive their own journal event kind instead of being mislabeled
as denied.

**Narration quality.** The authority auditor now requires an exact prose excerpt and ruling conflict
before rejecting a draft; normal scene progression and natural-language consequences are explicitly
allowed. The last-resort deterministic narrator no longer exposes UUIDs, internal actor IDs, or
debug arithmetic and gives a fuller readable consequence.

**Verification:** typecheck clean; full suite green at **core 460 / UI 135 = 595 tests**; production
Tauri build clean. Unsigned v0.2.7 bundles: NSIS SHA-256
`F4ADCC8C602514A08AA1C7E9D485F490FD286788AC2920ECCE25F8E5ED9312A7`; MSI SHA-256
`4C522431E64159FF03F3E82093E11BEBA76E4F0A76F79D561A47FAB464D295DA`.

---

## 2026-07-28 — Restore narrator prose and bound classifier/auditor latency

Packaged telemetry for the Jerusalem Man story showed the exact failure chain. A mixed prayer plus
sealed-action turn spent four classifier requests before recovering `Press the Ride`, then displayed
the provider failure even though the deterministic DM ruling succeeded. A two-action pistol turn
took 141 seconds: the narrator produced a 4,087-character draft, the authority auditor rejected a
harmless JSON-mode shape as invalid, the app generated a second full draft, audited again, and
finally discarded all prose for a terse deterministic summary.

Classifier structured repair is now capped at one retry before sealed catalog recovery. Provider-only
diagnostics are hidden when that recovery produced valid mechanics, while low-confidence,
unresolved-action, and unresolved-target cases remain visible. The authority-audit schema accepts
unambiguous string booleans and null empty-contradiction lists. An unavailable auditor now fails
closed immediately after the first draft instead of launching a second narrator generation; the
deterministic emergency text includes action, outcome, total, DC, d20, modifier, and narration hint.
True contradictions still follow the existing rewrite-or-safe-fallback authority wall.

**Verification:** focused red/green regressions plus clean typecheck; full suite green at **core 463 /
UI 136 = 599 tests**. Production UI/Tauri build and `cargo check` clean. Unsigned v0.2.8 bundles:
NSIS SHA-256 `F747FDEADD5CE1EC38151445BE6FB74F52DF4A2851BAF579B547C62DB9680AC1`;
MSI SHA-256 `8D3C1C5D863FF9D359CA9B5A1213DFD5CDDA71789B8CC21F00234381CBF774BF`.
