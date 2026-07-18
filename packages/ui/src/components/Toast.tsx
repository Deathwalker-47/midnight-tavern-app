/**
 * Toast — a transient floating notice (info / warn / error), sharing the InlineNotice tone
 * palette but presented as a dismissible, elevated card. Auto-dismisses after `durationMs`
 * (default 5s) unless 0. Dismiss button is keyboard-accessible.
 */
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { noticeTone } from "./InlineNotice";
import type { NoticeSeverity } from "./InlineNotice";

export interface ToastProps {
  severity?: NoticeSeverity;
  title: string;
  detail?: ReactNode;
  /** Auto-dismiss delay in ms; 0 disables auto-dismiss. Default 5000. */
  durationMs?: number;
  onDismiss?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function Toast(props: ToastProps): JSX.Element {
  const { severity = "info", title, detail, durationMs = 5000, onDismiss, className, style } = props;
  const tone = noticeTone(severity);

  useEffect(() => {
    if (!durationMs || !onDismiss) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onDismiss]);

  return (
    <div
      role={severity === "error" ? "alert" : "status"}
      className={className}
      data-severity={severity}
      style={{
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        minWidth: 260,
        maxWidth: 380,
        background: "var(--bg2-card)",
        border: `1px solid ${tone.border}`,
        borderLeft: `3px solid ${tone.accent}`,
        borderRadius: "var(--radius-card)",
        padding: "12px 14px",
        boxShadow: "var(--elevation)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: tone.accent }}>
        {tone.glyph}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: tone.accent }}>{title}</div>
        {detail ? <div style={{ fontSize: 12.5, color: "var(--secondary)", marginTop: 2 }}>{detail}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export default Toast;
