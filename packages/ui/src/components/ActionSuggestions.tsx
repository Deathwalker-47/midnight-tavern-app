import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Button } from "./Button.js";
import { InlineNotice } from "./InlineNotice.js";

export type SuggestionsState = "closed" | "loading" | "ready" | "empty" | "error";
export interface ActionSuggestion {
  id: string;
  kind: "action" | "move" | "dialogue";
  text: string;
  actionsUsed?: number;
}

export function ActionSuggestions(props: {
  state: SuggestionsState; suggestions: ActionSuggestion[]; actionBudget?: number;
  errorDetail?: string;
  onOpen: () => void; onClose: () => void; onRegenerate: () => void; onInsert: (text: string) => void;
}): JSX.Element {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (props.state === "ready") firstRef.current?.focus(); }, [props.state]);
  if (props.state === "closed") {
    return <Button variant="ghost" onClick={props.onOpen} style={{ padding: "7px 10px", whiteSpace: "nowrap" }} aria-haspopup="dialog">✦ Possible moves</Button>;
  }
  return (
    <section role="dialog" aria-label="Possible moves" style={panel}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div>
          <strong style={{ color: "var(--ui-text)", fontSize: 13 }}>Possible moves</strong>
          <div style={{ color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>
            Insert only · edit before sending{props.actionBudget ? ` · up to ${props.actionBudget} actions` : ""}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={props.onClose} aria-label="Close suggestions" style={quietButton}>×</button>
      </header>
      {props.state === "loading" ? <div style={status}>Reading the scene…</div> : null}
      {props.state === "empty" ? <div style={status}>No useful suggestions were returned.<Button variant="ghost" onClick={props.onRegenerate} style={{ marginLeft: 8 }}>Try again</Button></div> : null}
      {props.state === "error" ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <InlineNotice
            severity="warn"
            title="Suggestions are unavailable"
            detail={props.errorDetail ?? "Your draft is untouched. You can keep writing or try again."}
          />
          <Button variant="ghost" onClick={props.onRegenerate} style={{ justifySelf: "start" }}>
            Try suggestions again
          </Button>
        </div>
      ) : null}
      {props.state === "ready" ? (
        <div style={{ display: "grid", gap: 7, marginTop: 11 }}>
          {props.suggestions.slice(0, 6).map((suggestion, index) => (
            <button key={suggestion.id} ref={index === 0 ? firstRef : undefined} type="button" onClick={() => props.onInsert(suggestion.text)} style={suggestionButton}>
              <span style={kindPill}>{suggestion.kind}</span><span style={{ flex: 1 }}>{suggestion.text}</span>
              {suggestion.actionsUsed ? <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>×{suggestion.actionsUsed}</span> : null}
            </button>
          ))}
          <button type="button" onClick={props.onRegenerate} style={{ ...quietButton, justifySelf: "start", color: "var(--teal)", marginTop: 2 }}>↻ Regenerate suggestions</button>
        </div>
      ) : null}
    </section>
  );
}

const panel: CSSProperties = { position: "absolute", left: 0, right: 0, bottom: "calc(100% + 8px)", zIndex: 12, padding: "13px 14px", background: "var(--bg3-raised)", border: "1px solid var(--teal-dim)", borderRadius: "var(--radius-card)", boxShadow: "var(--elevation)" };
const quietButton: CSSProperties = { display: "inline-flex", background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font-ui)" };
const status: CSSProperties = { marginTop: 12, color: "var(--secondary)", fontSize: 12.5, lineHeight: 1.5 };
const suggestionButton: CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 10px", color: "var(--ui-text)", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 7, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 12.5 };
const kindPill: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", minWidth: 52 };
