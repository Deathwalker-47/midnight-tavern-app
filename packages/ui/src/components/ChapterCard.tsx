/**
 * ChapterCard — a chapter timeline node (Overview). A node dot on a rail + the chapter title
 * (serif) + summary (prose). Status: summarized = green solid dot; in-progress = brass pulsing
 * dot; pending = muted hollow dot. Mono chapter index label ("CH n").
 */
import type { CSSProperties } from "react";
import { useReducedMotion } from "./_shared";

export type ChapterStatus = "summarized" | "in-progress" | "pending";

export interface ChapterCardProps {
  index: number;
  title: string;
  summary?: string;
  status?: ChapterStatus;
  /** Message range label, e.g. "msgs 1–20". */
  range?: string;
  onOpen?: () => void;
  /** Marks the chapter whose full summary is open in the Overview reader. */
  selected?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

function statusColor(status: ChapterStatus): string {
  switch (status) {
    case "summarized":
      return "var(--success)";
    case "in-progress":
      return "var(--brass)";
    case "pending":
      return "var(--muted)";
  }
}

export function ChapterCard(props: ChapterCardProps): JSX.Element {
  const { index, title, summary, status = "summarized", range, onOpen, selected = false, animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const color = statusColor(status);
  const pulse = status === "in-progress" && animate && !reduced;
  const clickable = Boolean(onOpen);

  return (
    <div
      className={className}
      data-status={status}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? selected : undefined}
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
      style={{ display: "flex", gap: 12, cursor: clickable ? "pointer" : "default", ...style }}
    >
      {/* Rail + node */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 16px" }}>
        <span
          aria-hidden="true"
          className={pulse ? "mt-pulse" : undefined}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            marginTop: 4,
            background: status === "pending" ? "transparent" : color,
            border: `2px solid ${color}`,
            ...(pulse ? { animationDuration: "1.6s" } : {}),
          }}
        />
        <span style={{ flex: 1, width: 2, background: "var(--hairline)", marginTop: 4 }} />
      </div>
      <div style={{ paddingBottom: 18, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)", letterSpacing: "0.08em" }}>CH {index}</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, color: "var(--prose)" }}>{title}</span>
          {range ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>{range}</span> : null}
        </div>
        {summary ? (
          <div style={{ fontFamily: "var(--font-prose)", fontSize: 14, color: "var(--secondary)", lineHeight: 1.6, marginTop: 4, maxWidth: "60ch" }}>
            {summary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ChapterCard;
