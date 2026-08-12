> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision. Plan 13 was **executed** and
> shipped in v0.2.9; its **deferred queue (Plans 21 / 19 / 20 / 18 / 23 / 10B) is cancelled**, not
> deferred. The diagnosis chapters in this folder remain useful reference; their priority ordering
> and work items do not. See [`docs/PLAN-POLICY.md`](../docs/PLAN-POLICY.md).

# Midnight Tavern V5 Implementation Status

**Assessment date:** 2026-07-23  
**Repository:** `C:\Users\anuji\Documents\midnight-tavern-app`  
**Desktop build version:** `0.1.3`

## Executive status

Midnight Tavern is now in **late alpha / internal beta-candidate condition**. The V5 design has been implemented across the core engine, bridge, desktop shell, and UI, and all automated validation and Windows packaging gates pass locally.

The project is not yet production-ready. The remaining work is primarily packaged-app acceptance testing with real model providers, restart/persistence testing, installer signing and updater configuration, security hardening, and cleanup of non-failing test warnings. These are release-validation risks rather than known blockers in the implemented V5 logic.

## V5 product decisions now enforced

### Story modes

The runtime now supports exactly two user-facing story modes:

| Mode | Behavior |
|---|---|
| **No Stats** (`none`) | Pure prose. Only the narrator model is active. There are no attributes, skills, actions, checks, rulings, mastery gains, or mechanical background-model calls. |
| **Full Stats** (`full`) | Attributes, skills, actions, checks, rulings, mastery, ledger effects, and the full configured model-role pipeline are active. |

Legacy `light` stories are not silently reinterpreted. They are loaded as Full Stats with a migration marker and must be confirmed through the story settings before submission can continue.

### Model-role behavior

| Mode | Narrator | Bootstrapper | Mechanics | Classifier | Analyzer | Summarizer |
|---|---:|---:|---:|---:|---:|---:|
| No Stats | Active | Silent | Silent | Silent | Silent | Silent |
| Full Stats | Active | Active during world generation | Active | Active where orchestration requires it | Active where orchestration requires it | Active where orchestration requires it |

No Stats world creation is local and deterministic; it does not call a bootstrap model. Chat validation and bridge routing now require credentials only for roles that are actually active for the selected story mode.

### Attribute integration

Full Stats stories now support first-class attributes beneath skills and actions:

- Attribute scores are clamped to `1..30`.
- A missing attribute score defaults to `10`.
- The standard modifier is `floor((score - 10) / 2)`.
- Checks support raw attribute, skilled, and opposed resolution.
- Gate conditions and ledger effects can reference attributes.
- Rulings preserve the action, attribute, mastery, opposing terms, die result, and final formula.
- Character and dossier screens expose attributes and mastery progress.

The mechanical catalog remains sealed after story creation. Models do not dynamically invent new skills or actions during play. This preserves deterministic saves, checks, rewinds, and auditability without introducing an additional controller-model role.

### Mode switching

- **Full Stats to No Stats:** the mechanical catalog and state are sealed and preserved, while mechanical roles and checks become dormant.
- **No Stats to Full Stats:** the preserved catalog is restored when available; otherwise the application runs Full Stats generation.
- Switching does not delete prose history, persona state, or lore continuity.
- Legacy migration must be acknowledged before story submission.

## User-observation resolution matrix

### Initial setup, providers, model selection, and imports

| Observation | Current status |
|---|---|
| First launch did not trigger provider setup | Implemented first-run redirect to Setup when no provider is configured. |
| Wizard was difficult to reopen | Added a persistent, visible provider-setup banner while configuration remains incomplete. |
| ElectronHub and NanoGPT missing | Added as the second and third providers in the provider list. |
| Custom endpoint mixed URL and key | Custom providers now expose separate endpoint URL and API-key fields. |
| Role model lists were preset instead of provider-backed | Model choices now come from the selected provider, with recommendation and capability metadata retained in the UI. |
| Character-card import did not open a picker | Desktop import now opens a native file selection path and carries the imported character through story creation. |
| Story creation lacked the designed prompt and history fields | The V5 blueprint includes the full configurable narrative-control fields, including prompt, post-history, example dialogue, prose controls, metadata, and opening selection. |

### Later review findings

| # | Observation | Current status |
|---:|---|---|
| 1 | No lorebook JSON import | Added global JSON import with support for common SillyTavern structures, including entry maps, `character_book.entries`, and top-level entry arrays. |
| 2 | Forging provides no reassurance during a long operation | Added visible phased progress, elapsed time, activity copy, and cancellation. |
| 3 | Chat formatting differs from SillyTavern cards | Added safe card-compatible formatting for emphasis, code, and line breaks without rendering untrusted raw HTML. |
| 4 | Question of models adding skills/actions during play | Resolved against dynamic catalog mutation. The catalog is frozen after generation; progression changes mastery, state, and ledger facts instead. |
| 5 | User character always becomes `Traveler` | Story creation now derives identity from the chosen/imported persona. |
| 6 | Story narrator and global narrator diverged | Removed the independent story-level model override. Story settings use the same global narrator entity. |
| 7 | Returning to a story showed `No story open` | The active story is persisted and restored across navigation; overview, character, and settings receive the restored story ID. |
| 8 | Messages could disappear after navigating away | Added operation-generation guards so late asynchronous results cannot overwrite or attach to an obsolete screen/story. |
| 9 | Errors incorrectly blamed the narrator | Error classification now identifies the actual failing model role. |
| 10 | A previous ruling appeared under a new chat | Rulings are correlated to their exchange by message ID rather than inferred from list position. |
| 11 | Ruling appeared below the AI reply | The ruling now renders before the narrator response it governed. |
| 12 | Ruling lacked action detail | Ruling output now describes the action and relevant mechanical terms and formula. |
| 13 | No novice-to-master progression UI | Added mastery progress and rank visibility to character/dossier views. |
| 14 | Rewind deleted the selected exchange too | Rewind now preserves the selected exchange and removes only later exchanges. A distinct destructive `Delete from this exchange` operation removes the selected exchange and everything after it. |
| 15 | No pure-prose opt-out | Story creation now requires choosing No Stats or Full Stats. No Stats disables the mechanical pipeline. |
| 16 | Attributes were absent below skills | Implemented the V5 attribute model throughout schemas, generation, resolution, validation, ledger effects, prompts, and UI. |

## Condition by subsystem

| Area | Condition | Notes |
|---|---|---|
| Core schemas and validation | Good | Exact story modes, attributes, progression, migration, and causal ruling metadata are covered by tests. |
| Turn orchestration | Good | No Stats is narrator-only; Full Stats retains the mechanical pipeline. Rewind and delete semantics are separated. |
| Provider setup and role matrix | Good with live-service validation pending | Provider-backed model discovery and active-role validation are implemented. Real accounts and proxy conditions still need acceptance testing. |
| World creation | Good with live-model validation pending | Mode selection, local No Stats bootstrap, detailed Full Stats blueprint, progress, cancellation, and recovery paths are implemented. |
| Chat and rulings | Good | Safe formatting, ruling order/correlation, error-role attribution, and navigation race protection are implemented. |
| Story continuity | Good | Active-story navigation and persisted selection are implemented. Full close/reopen acceptance is still required in the packaged app. |
| Character, skills, and attributes | Good | Persona identity, attributes, mastery ranks, and progress are visible. No Stats presents an intentional prose-only state. |
| Lore and card import | Good | Both imports have functional parsing and UI entry points; more real-world fixture coverage would still be valuable. |
| Diagnostics | Good | Structured, redacted logs exist across core/UI/desktop layers, with per-session context and an Open Logs action. |
| Windows packaging | Good for local distribution | MSI and NSIS installers build successfully. They are unsigned. |
| macOS packaging | Not verified | No macOS build was produced in this Windows validation pass. |

## Automated verification

All commands below passed in the current worktree:

| Gate | Result |
|---|---|
| Root TypeScript typecheck | Passed |
| Core test suite | **22 files, 339 tests passed** |
| UI test suite | **20 files, 98 tests passed** |
| Total automated tests | **437 passed** |
| UI production build | Passed; 196 modules transformed |
| Windows desktop bundle | Passed; process exited with code 0 |

The tests exercise the new attribute model, resolvers and gates, ledger effects, No Stats narrator-only behavior, migration and mode switching, import parsing, active-story behavior, story settings, causal ruling display, rewind/delete behavior, and related UI paths.

Some React UI tests emit non-failing `act(...)` warnings. They do not fail the suite, but should be cleaned up because warnings can hide future timing regressions.

## Windows build artifacts

### MSI installer

- Path: `C:\Users\anuji\Documents\midnight-tavern-app\packages\shell\src-tauri\target\release\bundle\msi\Midnight Tavern_0.1.3_x64_en-US.msi`
- Size: `7,602,176` bytes
- SHA-256: `3CBF373127DEFABBBD21058C30FCC42F70BA98E5C5BB85FF64D8F12E3917E6D4`

### NSIS installer

- Path: `C:\Users\anuji\Documents\midnight-tavern-app\packages\shell\src-tauri\target\release\bundle\nsis\Midnight Tavern_0.1.3_x64-setup.exe`
- Size: `4,580,233` bytes
- SHA-256: `F8D50693535EAFD95105039AA9306CE28642D00EE19FED4EEDD5B6F1C25E4196`

### Unbundled release executable

- Path: `C:\Users\anuji\Documents\midnight-tavern-app\packages\shell\src-tauri\target\release\midnight-tavern.exe`

The desktop implementation is Tauri, despite the earlier informal reference to an Electron build. The generated artifacts above are the repository's native Windows desktop installers.

## Logging and future diagnosis

The application now has a persistent diagnostic path rather than relying on transient toasts:

- Structured events include component, operation, story/session context, severity, duration, and failure data.
- Sensitive values such as API keys and authorization headers are redacted.
- Core, UI, provider/bridge, and Tauri shell events feed the diagnostic trail.
- Settings exposes an Open Logs action for field reports.
- Model-role failures report the actual role and retain validation/retry context.
- Forge operations expose cancellation and cannot remain visually stuck forever without an actionable state.

For future bug reports, capture the application logs immediately after reproducing the issue, together with the provider, model, story mode, and approximate time. Secrets should remain redacted by the logging layer.

## Known gaps and release risks

1. **No live-provider acceptance was run in this pass.** OpenRouter, ElectronHub, NanoGPT, and custom endpoints need tests with real credentials and the user's proxy in the packaged application.
2. **No full manual packaged-app journey was completed.** The highest-value remaining test is install, first launch, provider setup, create/play, close, reopen, resume, rewind/delete, and log collection.
3. **Installers are unsigned.** Windows may display reputation or publisher warnings. Code signing is required before public release.
4. **Self-updater signing is not release-configured.** The repository contains placeholder updater material without a private signing key. Updater artifact generation is disabled for this local build so packaging can complete safely; production update endpoints and keys still need configuration.
5. **Security hardening remains.** The desktop content security policy and credential storage should receive a focused release review before public distribution.
6. **React test warnings remain.** Non-failing asynchronous `act(...)` warnings should be removed to keep the suite sensitive to real races.
7. **macOS is unverified.** Platform-specific packaging, file dialogs, paths, and signing/notarization need a separate macOS pass.
8. **Weak-model structured output remains an empirical risk.** Schema repair and retry handling are substantially stronger, but Full Stats forging must be exercised across representative models and complex prompts.
9. **The worktree contains a broad set of design and implementation changes.** It should receive a focused diff review and be committed in coherent changesets before release branching.

Dynamic mid-story creation of new skills/actions is intentionally not listed as missing work. V5 resolves that question by keeping the generated catalog stable and using mastery progression and state/ledger changes for development during play.

## Recommended packaged-app acceptance sequence

1. Install the NSIS or MSI artifact on a clean or disposable Windows profile.
2. Confirm first launch opens provider setup when no provider exists, and that the persistent setup banner can reopen it.
3. Validate OpenRouter, ElectronHub, NanoGPT, and a custom OpenAI-compatible endpoint, including fetched model lists and recommendations.
4. Create a No Stats story and verify the logs show narrator calls only.
5. Create a Full Stats story and verify forging progress, attributes, skills/actions, opening selection, and mastery UI.
6. Import representative PNG/JSON character cards and multiple SillyTavern lorebook JSON variants.
7. Send messages, navigate away during a response, return, and verify no exchange is lost or attached to the wrong story.
8. Confirm rulings appear above and are attached to the exact narrator reply they governed.
9. Test rewind and delete separately and verify their different boundaries.
10. Close the app, reopen it, and verify the last active story and its overview, character, settings, transcript, lore, and persona context are restored.
11. Reproduce at least one intentional provider error and confirm Open Logs contains a redacted, role-specific diagnostic trail.

## Release-readiness assessment

| Milestone | Status |
|---|---|
| Automated development gates | **Pass** |
| Local Windows installer generation | **Pass** |
| Internal alpha distribution | **Ready, with unsigned-installer warning** |
| Internal beta | **Pending packaged manual smoke and live-provider matrix** |
| Public production release | **Not ready: signing, updater, security, cross-platform, and acceptance work remain** |

## Assessment boundary

This report describes the current local worktree and artifacts produced on 2026-07-23. It is based on code, V5 design/handoff material, automated tests, production compilation, and Windows packaging. It does not claim successful live provider communication, manual GUI completion of every journey, Windows reputation/signing readiness, or macOS readiness.
