/**
 * PremiseInput — the "new story" premise field: a serif textarea (the user is writing fiction)
 * with a label, character counter, and a submit affordance handled by the caller. Controlled
 * component: value + onChange come from the parent. Keyboard-accessible; Cmd/Ctrl+Enter submits.
 */
import type { CSSProperties, KeyboardEvent } from "react";

export interface PremiseInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  rows?: number;
  className?: string;
  style?: CSSProperties;
}

export function PremiseInput(props: PremiseInputProps): JSX.Element {
  const {
    value,
    onChange,
    onSubmit,
    label = "Your premise",
    placeholder = "A gate, cold enough to sting. Beyond the iron, something waits...",
    maxLength = 2000,
    disabled = false,
    rows = 5,
    className,
    style,
  } = props;

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--secondary)" }}
      >
        {label.toUpperCase()}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        rows={rows}
        style={{
          fontFamily: "var(--font-prose)",
          fontSize: 17,
          lineHeight: 1.6,
          color: "var(--prose)",
          background: "var(--bg2-card)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-chip)",
          padding: "12px 14px",
          resize: "vertical",
          outline: "none",
        }}
      />
      <div style={{ alignSelf: "flex-end", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>
        {value.length} / {maxLength}
      </div>
    </div>
  );
}

export default PremiseInput;
