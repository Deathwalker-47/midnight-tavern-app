/**
 * ConfirmDialog — a modal confirm/cancel over a scrim. Keyboard-accessible: Escape cancels,
 * focus lands on the dialog, the confirm button is a proper Button. `tone="danger"` styles the
 * confirm action with the failure color for destructive operations. Presentational only — the
 * caller owns open/close state and the actual action.
 */
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  const {
    open,
    title,
    body,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "default",
    onConfirm,
    onCancel,
    className,
    style,
  } = props;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg2-card)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation)",
          padding: "20px 22px",
          maxWidth: 420,
          width: "90%",
          fontFamily: "var(--font-ui)",
          ...style,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, color: "var(--prose)", marginBottom: 8 }}>
          {title}
        </div>
        {body ? <div style={{ fontSize: 14, color: "var(--secondary)", lineHeight: 1.6, marginBottom: 18 }}>{body}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "secondary" : "primary"}
            onClick={onConfirm}
            style={tone === "danger" ? { color: "var(--failure)", borderColor: "color-mix(in srgb, var(--failure) 50%, transparent)" } : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
