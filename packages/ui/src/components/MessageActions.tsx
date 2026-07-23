/**
 * MessageActions — the quiet control cluster on a narrator message (low-level-plan-v2 §6 / design
 * point 6). Latest narrator turn gets the full cluster; earlier messages get rewind-only.
 *
 *   • swipe counter  ‹ n/N ›  — cycles existing variants; the › at the end generates a new one
 *   • ROLL LOCKED    ⚄        — shown when the turn committed a ruling (the die already fell)
 *   • ⋯ menu                  — Delete last exchange · Rewind to here
 *
 * The integrity copy — "Swiping rewrites how it's told — the roll already happened and stands." —
 * is front-and-centre so a failed attack staying failed across swipes reads as integrity, not a
 * bug. Presentational: variant counts, the locked flag, and callbacks come from the caller.
 */
import { useState, type CSSProperties } from "react";

export interface MessageActionsProps {
  /** 1-based index of the active variant. */
  variantIndex: number;
  /** Total variants (counter hidden when 1 and not the latest). */
  variantCount: number;
  /** Whether this is the latest narrator turn (gets swipe + delete; else rewind-only). */
  isLatest: boolean;
  /** Whether this turn committed a ruling (shows the ROLL LOCKED glyph). */
  rollLocked?: boolean;
  onPrevVariant?: () => void;
  /** Next variant, or — at the end — generate a new telling. */
  onNextVariant?: () => void;
  onDeleteLastExchange?: () => void;
  onDeleteFromHere?: () => void;
  onRewindToHere?: () => void;
  onRegenerateWithFeedback?: (feedback: string) => void;
  activeFeedback?: string;
  regenerationState?: "idle" | "generating" | "completed" | "validation-error" | "provider-error";
  /** Disable interactive controls while a swipe/generation is streaming. */
  busy?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function MessageActions(props: MessageActionsProps): JSX.Element {
  const {
    variantIndex,
    variantCount,
    isLatest,
    rollLocked = false,
    onPrevVariant,
    onNextVariant,
    onDeleteFromHere,
    onRewindToHere,
    onRegenerateWithFeedback,
    activeFeedback,
    regenerationState = "idle",
    busy = false,
    className,
    style,
  } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const showCounter = isLatest || variantCount > 1;

  const stepBtn: CSSProperties = {
    color: "var(--secondary)",
    fontSize: 15,
    padding: "0 5px",
    background: "transparent",
    border: 0,
    cursor: busy ? "default" : "pointer",
  };

  return (
    <div className={className} style={{ fontFamily: "var(--font-ui)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {showCounter && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              background: "var(--bg1-panel)",
              border: "1px solid var(--hairline)",
              borderRadius: 7,
              padding: "2px 3px",
            }}
          >
            <button type="button" aria-label="Previous telling" onClick={() => !busy && onPrevVariant?.()} disabled={busy || variantIndex <= 1} style={stepBtn}>
              ‹
            </button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ui-text)", minWidth: 32, textAlign: "center" }}>
              {variantIndex}/{variantCount}
            </span>
            <button
              type="button"
              aria-label={isLatest && variantIndex === variantCount ? "Generate a new telling" : "Next telling"}
              onClick={() => !busy && onNextVariant?.()}
              disabled={busy || (!isLatest && variantIndex >= variantCount)}
              style={stepBtn}
            >
              ›
            </button>
          </div>
        )}

        {rollLocked && (
          <span
            title="This turn committed a ruling — swiping rewrites the prose, never the outcome."
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: ".06em",
              color: "var(--teal)",
              border: "1px solid var(--teal-dim)",
              borderRadius: 4,
              padding: "2px 5px",
            }}
          >
            <span style={{ fontSize: 11 }} aria-hidden="true">
              ⚄
            </span>
            ROLL LOCKED
          </span>
        )}

        {isLatest && onRegenerateWithFeedback ? (
          <button
            type="button"
            aria-expanded={feedbackOpen}
            onClick={() => setFeedbackOpen((open) => !open)}
            disabled={busy}
            style={{ color: "var(--teal)", fontSize: 10.5, background: "transparent", border: 0, cursor: busy ? "default" : "pointer", fontFamily: "var(--font-mono)" }}
          >
            ↻ Feedback
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Message actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            style={{ color: "var(--secondary)", fontSize: 16, background: "transparent", border: 0, cursor: "pointer", padding: "0 4px" }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                marginTop: 4,
                zIndex: 10,
                minWidth: 180,
                background: "var(--bg3-raised)",
                border: "1px solid var(--teal-dim)",
                borderRadius: 9,
                padding: 6,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRewindToHere?.();
                }}
                style={{ display: "block", width: "100%", textAlign: "left", color: "var(--crit-crimson)", fontSize: 12.5, padding: "8px 10px", background: "transparent", border: 0, cursor: "pointer" }}
              >
                ⟲ Rewind to here
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteFromHere?.();
                }}
                style={{ display: "block", width: "100%", textAlign: "left", color: "var(--crit-crimson)", fontSize: 12.5, padding: "8px 10px", background: "transparent", border: 0, cursor: "pointer" }}
              >
                ✕ Delete from this exchange
              </button>
            </div>
          )}
        </div>
      </div>

      {isLatest && rollLocked && (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 5, fontStyle: "italic", fontFamily: "var(--font-prose)" }}>
          Swiping rewrites how it&rsquo;s told — the roll already happened and stands.
        </div>
      )}
      {activeFeedback ? (
        <div style={{ marginTop: 5, color: "var(--muted)", fontSize: 10.5 }}>
          This telling used feedback: <span style={{ color: "var(--secondary)" }}>{activeFeedback}</span>
        </div>
      ) : null}
      {feedbackOpen && onRegenerateWithFeedback ? (
        <div role="dialog" aria-label="Regenerate with feedback" style={{ marginTop: 8, padding: "10px 11px", background: "var(--bg2-card)", border: "1px solid var(--teal-dim)", borderRadius: 8 }}>
          <div style={{ color: "var(--secondary)", fontSize: 11.5, lineHeight: 1.45 }}>
            Change only how the Narrator tells this exchange. The DM Ruling, dice, XP, loot, equipment effects, and hard state remain fixed.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {["Shorter", "More detail", "More tension", "Less flowery", "Different take"].map((preset) => (
              <button key={preset} type="button" onClick={() => setFeedback(preset)} style={{ padding: "4px 7px", color: feedback === preset ? "var(--teal)" : "var(--secondary)", background: feedback === preset ? "var(--teal-tint)" : "transparent", border: "1px solid var(--hairline)", borderRadius: 5, cursor: "pointer", fontSize: 10.5 }}>
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value.slice(0, 300))}
            maxLength={300}
            placeholder="Optional direction for the new telling…"
            aria-label="Narrator regeneration feedback"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 62, marginTop: 8, padding: 8, resize: "vertical", color: "var(--ui-text)", background: "var(--bg0-ground)", border: "1px solid var(--hairline)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: 11.5 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ color: feedback.length === 300 ? "var(--brass)" : "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>{feedback.length}/300</span>
            <span style={{ flex: 1 }} />
            {regenerationState && regenerationState !== "idle" ? <span role="status" style={{ color: regenerationState.includes("error") ? "var(--failure)" : "var(--teal)", fontSize: 10 }}>{regenerationState.replace("-", " ")}</span> : null}
            <button type="button" onClick={() => setFeedbackOpen(false)} style={{ color: "var(--muted)", background: "transparent", border: 0, cursor: "pointer", fontSize: 10.5 }}>Cancel</button>
            <button type="button" disabled={busy || !feedback.trim()} onClick={() => onRegenerateWithFeedback(feedback.trim())} style={{ color: "var(--bg0-ground)", background: "var(--teal)", border: 0, borderRadius: 5, padding: "5px 8px", cursor: busy ? "default" : "pointer", fontSize: 10.5 }}>Generate telling</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MessageActions;
