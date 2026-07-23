/**
 * LorebookLibraryCard — one card on the global lorebook library shelf (low-level-plan-v2 §2). Shows
 * the book name, a source tag (USER / FROM CARD / MIGRATED), its entry count, and "used in N
 * stories". Clicking drills into the entry editor. Presentational: all data + onOpen from caller.
 */
import type { CSSProperties } from "react";

export type LorebookSourceTag = "user" | "imported_card" | "migrated";

export interface LorebookLibraryCardProps {
  name: string;
  source: LorebookSourceTag;
  entryCount: number;
  /** Number of stories this book is attached to. */
  attachmentCount: number;
  /** Story-scoped status shown when browsing the library from an open story. */
  contextLabel?: string;
  onOpen?: () => void;
  className?: string;
  style?: CSSProperties;
}

const SOURCE_LABEL: Record<LorebookSourceTag, string> = {
  user: "USER",
  imported_card: "FROM CARD",
  migrated: "MIGRATED",
};

export function LorebookLibraryCard(props: LorebookLibraryCardProps): JSX.Element {
  const { name, source, entryCount, attachmentCount, contextLabel, onOpen, className, style } = props;
  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      className={className}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: "15px 16px",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, color: "var(--ui-text)" }}>{name}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {contextLabel ? (
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                color: "var(--brass)",
                border: "1px solid var(--brass-dim)",
                borderRadius: 3,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {contextLabel}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--teal)",
              border: "1px solid var(--teal-dim)",
              borderRadius: 3,
              padding: "1px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {SOURCE_LABEL[source]}
          </span>
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)", marginTop: 8 }}>
        {entryCount} {entryCount === 1 ? "entry" : "entries"}
      </div>
      <div style={{ fontSize: 12, color: "var(--secondary)", marginTop: 2 }}>
        used in {attachmentCount} {attachmentCount === 1 ? "story" : "stories"}
      </div>
    </button>
  );
}

export default LorebookLibraryCard;
