/**
 * InlineNotice — an in-flow banner in three severities (info / warn / error). Names the thing
 * and (optionally) the fix, per the design-system voice. UI register. The error tone uses a
 * crimson-tinted panel; warn uses the neutral panel with an amber glyph; info uses teal.
 */
import type { CSSProperties, ReactNode } from "react";

export type NoticeSeverity = "info" | "warn" | "error";

export interface InlineNoticeProps {
  severity?: NoticeSeverity;
  title: string;
  /** Optional supporting line (the fix, the detail). */
  detail?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface NoticeTone {
  glyph: string;
  accent: string;
  bg: string;
  border: string;
}

export function noticeTone(severity: NoticeSeverity): NoticeTone {
  switch (severity) {
    case "error":
      return {
        glyph: "✖",
        accent: "var(--failure)",
        bg: "color-mix(in srgb, var(--crit-crimson) 8%, transparent)",
        border: "color-mix(in srgb, var(--crit-crimson) 40%, transparent)",
      };
    case "warn":
      return { glyph: "⚠", accent: "var(--brass)", bg: "var(--bg1-panel)", border: "var(--hairline)" };
    case "info":
      return { glyph: "ℹ", accent: "var(--teal)", bg: "var(--teal-tint)", border: "var(--teal-dim)" };
  }
}

export function InlineNotice(props: InlineNoticeProps): JSX.Element {
  const { severity = "info", title, detail, className, style } = props;
  const tone = noticeTone(severity);
  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={className}
      data-severity={severity}
      style={{
        display: "flex",
        gap: 11,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: "var(--radius-card)",
        padding: "13px 15px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: tone.accent }}>
        {tone.glyph}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: tone.accent }}>{title}</div>
        {detail ? <div style={{ fontSize: 12.5, color: "var(--secondary)", marginTop: 2 }}>{detail}</div> : null}
      </div>
    </div>
  );
}

export default InlineNotice;
