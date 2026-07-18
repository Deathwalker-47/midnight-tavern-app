/**
 * EmptyState — an invitational blank slate (design-system voice: empty states invite rather
 * than apologize). Optional glyph, a serif title (story voice), a plain body line, and an
 * optional action slot for a Button.
 */
import type { CSSProperties, ReactNode } from "react";

export interface EmptyStateProps {
  /** Large decorative glyph above the title. */
  glyph?: ReactNode;
  title: string;
  body?: ReactNode;
  /** Action area, typically a <Button>. */
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function EmptyState(props: EmptyStateProps): JSX.Element {
  const { glyph, title, body, action, className, style } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
        padding: "48px 24px",
        color: "var(--secondary)",
        ...style,
      }}
    >
      {glyph ? (
        <div aria-hidden="true" style={{ fontSize: 40, color: "var(--muted)" }}>
          {glyph}
        </div>
      ) : null}
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, color: "var(--prose)" }}>
        {title}
      </div>
      {body ? <div style={{ fontSize: 14, maxWidth: "44ch", lineHeight: 1.6 }}>{body}</div> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
