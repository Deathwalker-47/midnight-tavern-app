/**
 * StoryBlueprint — the full author-facing story-card editor (low-level-plan-v2 §3;
 * Design/handoff-v2/screens/StoryBlueprint.dc.html).
 *
 * Thin screen around the presentational {@link BlueprintForm}: it loads the story's Blueprint via
 * `bridge.getBlueprint(storyId)`, holds it in local state, and persists on Save via
 * `bridge.saveBlueprint(storyId, bp)`. All the grouped fields (identity, opening + alternate
 * greetings, the collapsible narration group with its mechanical-authority boundary copy, metadata)
 * live in the form component; this screen owns loading, dirty-tracking, save, and navigation.
 *
 * CRITICAL BOUNDARY (§3): blueprint fields feed identity/style/premise only. They NEVER author
 * mechanics and NEVER override the framework authority clause — the form surfaces that in copy and
 * the core mapping layer enforces it. Saving here never touches the frozen mechanical schema.
 *
 * State matrix: no-story · loading · error · ready (editing) · saving · saved (toast).
 */
import { useEffect, useState } from "react";
import type { ScreenProps } from "./registry.js";
import { getBridge } from "../bridge/core.js";
import type { Blueprint } from "../bridge/core.js";
import { useRoute } from "../app/router.js";
import { Button, BlueprintForm, EmptyState, InlineNotice, Toast } from "../components/index.js";

type LoadState =
  | { phase: "no-story" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready" };

export function StoryBlueprint(props: ScreenProps): JSX.Element {
  const { params } = useRoute();
  const storyId = props.storyId ?? params.storyId;
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [blueprint, setBlueprint] = useState<Blueprint>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!storyId) {
      setState({ phase: "no-story" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });
    (async () => {
      const bp = await getBridge().getBlueprint(storyId);
      if (cancelled) return;
      setBlueprint(bp ?? {});
      setDirty(false);
      setState({ phase: "ready" });
    })().catch((err: unknown) => {
      if (!cancelled) {
        setState({ phase: "error", message: err instanceof Error ? err.message : "Couldn't load the blueprint." });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  async function onSave(): Promise<void> {
    if (!storyId) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await getBridge().saveBlueprint(storyId, blueprint);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the blueprint.");
    } finally {
      setSaving(false);
    }
  }

  if (state.phase === "no-story") {
    return (
      <div style={{ padding: "26px 34px 60px" }}>
        <EmptyState
          glyph="✎"
          title="No story to author"
          body="Open a story, then edit its blueprint here — identity, opening, narration voice, and metadata. The world's rules and dice stay framework-owned."
        />
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <span
          data-testid="blueprint-loading"
          aria-label="Loading blueprint"
          className="mt-sweep"
          style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--hairline)", borderTopColor: "var(--brass)", animationDuration: "0.8s" }}
        />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ padding: "34px 42px", maxWidth: 760 }}>
        <InlineNotice severity="error" title="Couldn't load the blueprint" detail={state.message} />
      </div>
    );
  }

  return (
    <div style={{ padding: "34px 42px 90px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, color: "var(--prose)", margin: 0 }}>Story blueprint</h1>
          <button
            type="button"
            onClick={() => storyId && useRoute.getState().navigate("play", { storyId })}
            style={{ background: "none", border: "none", color: "var(--secondary)", cursor: "pointer", fontSize: 12.5 }}
          >
            ← Back to story
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 620 }}>
          Author the story's identity and voice. These fields guide the storyteller — the world's rules and dice outcomes stay
          enforced by the app and can't be overridden here.
        </p>

        <BlueprintForm
          value={blueprint}
          onChange={(next) => {
            setBlueprint(next);
            setDirty(true);
            setSaved(false);
          }}
        />

        {saveError ? (
          <div style={{ marginTop: 18 }}>
            <InlineNotice severity="error" title="Couldn't save" detail={saveError} />
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <Button variant="primary" disabled={saving || !dirty} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save blueprint"}
          </Button>
          {dirty ? <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" }}>Unsaved changes</span> : null}
        </div>
      </div>

      {saved ? <Toast severity="info" title="Blueprint saved" onDismiss={() => setSaved(false)} /> : null}
    </div>
  );
}

export default StoryBlueprint;
