/**
 * StoryCard — a shelf card for one story in the Library grid: a colored spine, the title
 * (serif display, story register), a one-line premise/summary, and mono meta (chapter count,
 * last-played). Clicking opens the story. The spine color is caller-chosen (e.g. hashed from
 * the story id) and defaults to brass.
 */
import type { CSSProperties } from "react";

export interface StoryCardProps {
  title: string;
  /** Short premise or last-summary line. */
  blurb?: string;
  /** Spine accent color (any CSS color / token var). Default brass. */
  spineColor?: string;
  /** Mono meta line, e.g. "CH 4 · 82 messages". */
  meta?: string;
  onOpen?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function StoryCard(props: StoryCardProps): JSX.Element {
  const { title, blurb, spineColor = "var(--brass)", meta, onOpen, className, style } = props;
  const clickable = Boolean(onOpen);
  return (
    <div
      className={className}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        gap: 12,
        background: "var(--bg2-card)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: 0,
        overflow: "hidden",
        boxShadow: "var(--elevation)",
        cursor: clickable ? "pointer" : "default",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, flex: "0 0 6px", background: spineColor }} />
      <div style={{ padding: "14px 16px 14px 4px", minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, color: "var(--prose)" }}>{title}</div>
        {blurb ? (
          <div style={{ fontFamily: "var(--font-prose)", fontSize: 14, color: "var(--secondary)", lineHeight: 1.5, marginTop: 4 }}>
            {blurb}
          </div>
        ) : null}
        {meta ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginTop: 8, letterSpacing: "0.04em" }}>
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default StoryCard;
