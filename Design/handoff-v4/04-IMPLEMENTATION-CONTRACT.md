# 04 · Implementation Contract — v4

Event schemas, lifecycles, and the error taxonomy the UI binds to. These are **contracts the
prototype demonstrates**, not production code. Field names are suggestions; the *shape and
guarantees* are the contract.

---

## §B · Forge progress — event contract
Forge emits ordered phase events. The UI renders phase state from events; it **must not** synthesize
a percentage or a timer-driven fake bar.

```
type ForgePhase =
  'reading_premise' | 'deciding_rules' | 'writing_catalogs' |
  'placing_characters' | 'sealing_rulebook';

interface ForgeEvent {
  phase: ForgePhase;
  status: 'started' | 'progress' | 'completed' | 'failed';
  detail?: string;      // phase-accurate explanation (drives the changing line)
  warning?: string;     // → partial-success treatment
  elapsedMs: number;    // authoritative elapsed, from the operation
  attempt?: number;     // increments on retry
}
```
Rules: exactly one phase `started` and not yet `completed` at a time = the active phase. `detail`
strings originate from the actual phase, never a rotating marketing pool. `failed` carries an
`error` (see §M shape) and pauses on that phase; **Retry step** re-emits from that phase with
`attempt+1`, keeping earlier `completed` phases. Cancel emits `aborted` and discards nothing
already persisted (nothing is persisted to the library until `sealing_rulebook.completed`).
Long-op copy is time-thresholded on `elapsedMs` (30s / 120s / 300s). **AC:** UI shows only discrete
phase states + elapsed; retry resumes; no percentage anywhere.

---

## §D · Active-story lifecycle
```
interface ActiveStory { id; title; lastOpenedAt; path; existsOnDisk: boolean; }
```
- Persist `activeStoryId` in app state (survives navigation) and to disk (survives restart).
- On launch: read `activeStoryId` → if `existsOnDisk` resolve + show restore skeleton; else show
  recovery state (deleted/moved).
- Story tabs (Play/Overview/Characters/Lore/Story Settings) **derive** their subject from
  `activeStoryId`; they never prompt "No story open" while a resolve is in flight.
- Opening another story reassigns `activeStoryId` (previous story’s background gen, if any,
  continues — see §E).
- Window title + breadcrumb + rail bind to the resolved story.
**AC:** navigation to non-story areas and restart preserve the active story; missing story → recovery.

---

## §E · Background generation
```
interface GenOp { storyId; storyTitle; phase: 'classifying'|'resolving'|'narrating'|'analyzing';
                  startedAt; state: 'running'|'succeeded'|'failed'|'cancelled'; }
```
- A submitted turn creates a `GenOp` bound to its `storyId`; it is **independent of the current
  view**. Optimistic player message + Narrator placeholder are persisted immediately so nothing can
  vanish on navigation/crash.
- Global indicator subscribes to all `running` ops (supports multiple stories).
- On `succeeded`/`failed`: toast + the story’s transcript is updated in place; if the user is
  elsewhere, the indicator/toast is the notification.
- Cancel sets `cancelled`; the player message persists with a Regenerate affordance.
- App close with any `running` op → guard dialog; on force-close, op is marked `interrupted` and
  offered for resume on next launch.
**AC:** messages never silently vanish; indicator names story+phase; multi-story supported;
close guarded.

---

## §M · Error taxonomy
```
interface PipelineError {
  role: 'classifier'|'rules'|'narrator'|'analyzer'|'provider'|'network'|'user';
  phase: 'classify'|'resolve'|'narrate'|'analyze'|'auth'|'transport'|'cancel';
  blocking: boolean;          // Analyzer(post-turn) = false
  playerMessageSaved: boolean;// almost always true
  retryStep: 'mechanics'|'ruling'|'narration'|'analyze'|'auth'|'transport'|null;
  providerId?; modelId?; requestId?; message: string; // message = technical detail, not shown raw
}
```
Mapping to copy is in UX §M. Hard rules: the surfaced role/phase MUST equal the failed step —
a `classifier`/`classify` failure is never phrased as a Narrator failure; an `analyzer`/`analyze`
failure is `blocking:false` and never marks the Narrator reply failed. Every error surfaces a
**Copy diagnostics** action serializing the struct (minus secrets). **AC:** role+phase accurate;
Analyzer non-blocking; save-status + retry step + diagnostics always present.

---

## §J · Narrator authority
Single source of truth = global Role Matrix `roles.narrator = { provider, model }`. Story Settings
reads it (read-only summary + "Configure models" link). No per-story Narrator field persists unless
the guarded-override ADR is approved, in which case: `story.narratorOverride?: {provider,model} |
null` with an explicit toggle and a labeled active source. **AC:** at most one editable Narrator
selector exists in the product at a time.

---

## Provisional decision studies — NOT implementation-ready

### §N1 · Dynamic skills & actions — [UNRESOLVED]
| Option | Determinism | Consent | Migration/rewind | Audit | Risk |
|---|---|---|---|---|---|
| Frozen catalog | highest | n/a | trivial | n/a | can’t adapt to emergent play |
| Frozen-broad + hidden/revealable | high | reveal is explicit | checkpoints stable | reveal log | authoring cost of a broad catalog |
| Versioned amendments (controller-proposed) | medium | **required approval per amendment** | needs versioned rulebook + checkpoint pinning | full amendment history | complexity; must never auto-apply |
**Hard constraint:** a controller may *propose* an amendment; it is applied only after explicit user
approval and recorded as a new rulebook version. Rewind pins the rulebook version of the target
checkpoint. Obsolete definitions are tombstoned, never hard-deleted mid-story.
**Provisional UI variants** (mockups only, do not finalize): (1) "Proposed rule change" review card
with diff + Approve/Decline; (2) hidden-skill "revealed" inline note. Marked clearly as pending.

### §N2 · Attributes beneath skills — [UNRESOLVED]
| Option | Schema | Modifier | Card import | Prose/Light | Risk |
|---|---|---|---|---|---|
| No attributes | — | — | ignored | native | least depth |
| Universal fixed list | fixed N attrs | `floor((attr-10)/2)`-style | map common names | hidden | rebalance DCs once |
| Story-generated | per-rulebook attrs | rulebook-defined | best-effort map | hidden | determinism/migration cost |
| Import card’s system | external schema | external | direct | hidden | unbounded variance |
**Dependencies:** ruling attribute-modifier row (G) is shown **only when attributes are enabled**;
DC tables rebalance if attributes are added; prose-only/light never surface attributes.
**Provisional UI variant:** an attribute strip above skills in the dossier — mocked, gated, and
labeled "Pending attribute ADR." Full-Rules attribute screens are **not** completed here.

---

## Acceptance & traceability roll-up
Each directive item’s acceptance criteria live in its section (UX §, 02 §, 03 §). This contract adds
the machine-facing guarantees. A change is "done" only when: its UX copy exists, its state matrix is
implemented on the named screen, its acceptance criteria pass, and — for N1/N2 — it remains flagged
UNRESOLVED with provisional-only UI. See `00-PRODUCT-DECISIONS.md` for the index.
