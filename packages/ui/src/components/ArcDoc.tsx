/**
 * ArcDoc — the long-form Arc Document reader (Overview). Renders a titled arc with any subset of
 * the summarizer's sections (plot summary, character development, threads, etc.) as headed prose
 * blocks and lists. Story register throughout (serif prose, display headings); mono only for the
 * arc index label. Fully driven by props so it can render whatever the summarizer produced.
 */
import type { CSSProperties, ReactNode } from "react";

/** A rendered section: either a prose paragraph or a bulleted list. */
export interface ArcDocSection {
  heading: string;
  /** Prose block. */
  body?: string;
  /** Bulleted items (used instead of / in addition to `body`). */
  items?: string[];
}

export interface ArcDocProps {
  title: string;
  index?: number;
  /** Chapter range covered, e.g. "Chapters 1–15". */
  range?: string;
  sections: ArcDocSection[];
  /** Optional footer slot (e.g. a "Summarize now" action). */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function Section(props: { section: ArcDocSection }): JSX.Element {
  const { heading, body, items } = props.section;
  return (
    <section style={{ marginBottom: 24 }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 20,
          color: "var(--prose)",
          margin: "0 0 8px",
          borderBottom: "1px solid var(--hairline)",
          paddingBottom: 6,
        }}
      >
        {heading}
      </h3>
      {body ? (
        <p style={{ fontFamily: "var(--font-prose)", fontSize: 17, lineHeight: 1.75, color: "var(--prose)", maxWidth: "66ch", margin: "0 0 8px" }}>
          {body}
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontFamily: "var(--font-prose)", fontSize: 15.5, lineHeight: 1.6, color: "var(--secondary)" }}>
              {it}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ArcDoc(props: ArcDocProps): JSX.Element {
  const { title, index, range, sections, footer, className, style } = props;
  return (
    <article
      className={className}
      style={{
        background: "var(--bg1-panel)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: "28px 32px",
        ...style,
      }}
    >
      <header style={{ marginBottom: 24 }}>
        {index !== undefined || range ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--teal)", marginBottom: 4 }}>
            {index !== undefined ? `ARC ${index}` : ""}
            {index !== undefined && range ? " · " : ""}
            {range ?? ""}
          </div>
        ) : null}
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 32, color: "var(--prose)", margin: 0 }}>{title}</h2>
      </header>
      {sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
      {footer ? <div style={{ marginTop: 8 }}>{footer}</div> : null}
    </article>
  );
}

export default ArcDoc;
