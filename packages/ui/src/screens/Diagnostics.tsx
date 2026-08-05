import { useEffect, useState, type CSSProperties } from "react";
import { getBridge, type DiagnosticCounters } from "../bridge/core.js";
import { Button, InlineNotice } from "../components/index.js";

export function Diagnostics(): JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [counters, setCounters] = useState<DiagnosticCounters>({});
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [resetArmed, setResetArmed] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bridge = getBridge();
        const [isEnabled, current] = await Promise.all([
          bridge.getDiagnosticsEnabled(),
          bridge.readDiagnosticCounters(),
        ]);
        if (cancelled) return;
        setEnabled(isEnabled);
        setCounters(current);
        setPhase("ready");
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Couldn't load diagnostics.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean): Promise<void> => {
    setEnabled(next);
    await getBridge().setDiagnosticsEnabled(next);
    setCounters(await getBridge().readDiagnosticCounters());
  };

  const reset = async (): Promise<void> => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    await getBridge().clearDiagnosticCounters();
    setCounters({});
    setResetArmed(false);
  };

  const exportCounters = (): void => {
    try {
      const payload = JSON.stringify(
        { exportedAt: Date.now(), counters },
        null,
        2
      );
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "midnight-tavern-diagnostics.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setExportStatus("success");
    } catch {
      setExportStatus("error");
    }
  };

  if (phase === "loading") return <div style={center} aria-busy="true">Loading diagnostics…</div>;
  if (phase === "error") return <div style={page}><InlineNotice severity="error" title="Couldn't open diagnostics" detail={error ?? "Unknown error"} /></div>;

  const rows = deriveRows(counters);

  return (
    <div style={page} data-screen="diagnostics">
      <h1 style={title}>Diagnostics</h1>
      <p style={lede}>
        A local, opt-in set of counters — how often a stage falls back, how long stages take, how
        often the world denies an action. Nothing here is uploaded; it lives only in this story's
        local settings and can be cleared at any time.
      </p>

      <label style={toggleRow}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => void toggle(event.target.checked)}
        />
        Collect local counters
      </label>

      {!enabled ? (
        <p style={lede}>
          Diagnostics are opt-in and currently off. Turn them on to start collecting local counters.
        </p>
      ) : rows.length === 0 ? (
        <p style={lede}>No counters have been recorded yet — they accumulate as turns complete.</p>
      ) : (
        <>
          <table style={table}>
            <caption style={caption}>Local diagnostic counters</caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Counter</th>
                <th scope="col" style={{ ...th, textAlign: "right" }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td style={td}>{row.key}</td>
                  <td style={{ ...td, textAlign: "right" }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button variant="system" onClick={exportCounters}>Export</Button>
            <Button variant={resetArmed ? "primary" : "secondary"} onClick={() => void reset()}>
              {resetArmed ? "Confirm reset" : "Reset counters"}
            </Button>
          </div>
          {exportStatus === "success" ? (
            <div style={{ marginTop: 12 }}>
              <InlineNotice severity="success" title="Diagnostics exported" detail="The file was saved through your browser's download location." />
            </div>
          ) : null}
          {exportStatus === "error" ? (
            <div style={{ marginTop: 12 }}>
              <InlineNotice severity="error" title="Export failed" detail="The counters remain intact. Try again." />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

interface DisplayRow {
  key: string;
  value: string;
}

/** Raw counters, plus one derived mean-latency row per stage that recorded a duration sum. */
function deriveRows(counters: DiagnosticCounters): DisplayRow[] {
  const rows: DisplayRow[] = Object.entries(counters)
    .filter(([key]) => !key.startsWith("stage.durationMs."))
    .map(([key, value]) => ({ key, value: String(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const [key, total] of Object.entries(counters)) {
    if (!key.startsWith("stage.durationMs.")) continue;
    const stage = key.slice("stage.durationMs.".length);
    const runs = counters[`stage.runs.${stage}`];
    if (!runs) continue;
    rows.push({ key: `stage.meanDurationMs.${stage}`, value: String(Math.round(total / runs)) });
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

const page: CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "28px 36px 80px" };
const center: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--muted)" };
const title: CSSProperties = { margin: 0, color: "var(--prose)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 32 };
const lede: CSSProperties = { margin: "5px 0 20px", color: "var(--secondary)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 700 };
const toggleRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: "var(--ui-text)", fontSize: 13.5, marginBottom: 18 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 12 };
const caption: CSSProperties = { textAlign: "left", color: "var(--muted)", fontSize: 10.5, letterSpacing: ".08em", marginBottom: 8, textTransform: "uppercase" };
const th: CSSProperties = { textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--hairline)", padding: "6px 8px" };
const td: CSSProperties = { color: "var(--secondary)", borderBottom: "1px solid var(--hairline)", padding: "6px 8px" };

export default Diagnostics;
