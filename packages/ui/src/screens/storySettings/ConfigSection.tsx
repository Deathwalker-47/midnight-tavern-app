/**
 * ConfigSection — the user's rulebook config overrides as they reach this story (plan 09 §4c.6,
 * §4c.7, §4c.10, §4c.11): what the app loaded and what it skipped (by file, id and field, errors before
 * warnings), the folder, per-file "restore defaults", and whether this story stays locked to the
 * config it was created with or follows the user's edits.
 *
 * Switching to "follow" asks first: mechanics may then change between sessions and a rewound turn may
 * resolve differently. Turns already played never change either way.
 */
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { getBridge } from "../../bridge/core";
import type { ConfigOverrideStatus, StoryRecord } from "../../bridge/core";
import { Button, ConfirmDialog, InlineNotice } from "../../components";

const FILE_KEYS = {
  "universal-archetypes.json": "archetypes",
  "universal-pool.json": "pool",
  "universal-items.json": "items",
} as const;

export function ConfigSection(props: { story: StoryRecord; onModeChanged: () => void }): JSX.Element {
  const { story, onModeChanged } = props;
  const [status, setStatus] = useState<ConfigOverrideStatus>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmingFollow, setConfirmingFollow] = useState(false);
  const following = story.configSnapshot?.["rulebookConfig"] === "follow";

  const run = useCallback(async (work: () => Promise<ConfigOverrideStatus | void>) => {
    setBusy(true);
    setFailure(undefined);
    try {
      const next = await work();
      if (next) setStatus(next);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(() => getBridge().configOverrideStatus());
  }, [run]);

  const setMode = (mode: "locked" | "follow") =>
    run(async () => {
      await getBridge().setRulebookConfigMode(story.id, mode);
      onModeChanged();
    });

  const issues = [...(status?.issues ?? [])].sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1
  );

  return (
    <div data-testid="config-section">
      <div style={styles.note}>
        The actions, skills and items every story is built from — numbers included — can be edited in files
        on disk. New stories are created from your edits; this story uses them only if it follows them.
      </div>
      {failure ? <InlineNotice severity="error" title="That didn’t work." detail={failure} style={styles.notice} /> : null}
      {status && !status.supported ? (
        <InlineNotice severity="info" title="Config files are available in the desktop app." style={styles.notice} />
      ) : null}
      {status?.error ? <InlineNotice severity="error" title={status.error} style={styles.notice} /> : null}

      {status?.supported ? (
        <>
          <div style={styles.row}>
            <Button variant="system" disabled={busy} onClick={() => void run(() => getBridge().openConfigFolder())}>
              Open config folder
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => getBridge().reloadConfigOverrides())}>
              Reload files
            </Button>
            {status.folder ? <span className="mono" style={styles.path}>{status.folder}</span> : null}
          </div>
          {status.overridden.length === 0 ? (
            <div style={styles.note}>No override files — every story is using the shipped defaults.</div>
          ) : (
            <ul style={styles.list}>
              {status.overridden.map((file) => (
                <li key={file} style={styles.fileRow}>
                  <span className="mono" style={styles.file}>{file}</span>
                  <span style={styles.applied}>applied</span>
                  {file in FILE_KEYS ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Restore defaults for ${file}`}
                      onClick={() => void run(() => getBridge().restoreConfigDefaults(FILE_KEYS[file as keyof typeof FILE_KEYS]))}
                    >
                      Restore defaults
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {issues.length > 0 ? (
            <ul style={styles.list} data-testid="config-issues">
              {issues.map((issue, index) => (
                <li key={`${issue.file}:${issue.id ?? ""}:${issue.field ?? ""}:${index}`} style={styles.issue}>
                  <span className="mono" style={issue.severity === "error" ? styles.error : styles.warning}>
                    {issue.severity === "error" ? "SKIPPED" : "WARNING"}
                  </span>
                  <span className="mono" style={styles.where}>
                    {[issue.file, issue.id, issue.field].filter(Boolean).join(" · ")}
                  </span>
                  <span style={styles.message}>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <div style={styles.modes} role="radiogroup" aria-label="Rulebook config for this story">
        <label style={styles.mode}>
          <input type="radio" name="rulebook-config" checked={!following} disabled={busy} onChange={() => void setMode("locked")} />
          <span>
            <strong style={styles.modeTitle}>Locked to creation</strong>
            <span style={styles.modeNote}>The rules stay as they were when this story was made.</span>
          </span>
        </label>
        <label style={styles.mode}>
          <input type="radio" name="rulebook-config" checked={following} disabled={busy} onChange={() => setConfirmingFollow(true)} />
          <span>
            <strong style={styles.modeTitle}>Follow my edits</strong>
            <span style={styles.modeNote}>Future turns use whatever your config files say now.</span>
          </span>
        </label>
      </div>
      <ConfirmDialog
        open={confirmingFollow}
        title="Let this story follow your config edits?"
        body="From now on its mechanics can change between sessions whenever you edit the config files, and a turn you rewind may resolve differently when replayed. Turns already played are never recomputed. You can lock it again at any time."
        confirmLabel="Follow my edits"
        cancelLabel="Keep it locked"
        onConfirm={() => {
          setConfirmingFollow(false);
          void setMode("follow");
        }}
        onCancel={() => setConfirmingFollow(false)}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  note: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 12 },
  notice: { marginBottom: 12 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 },
  path: { fontSize: 11, color: "var(--muted)", wordBreak: "break-all" },
  list: { listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  fileRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "8px 12px",
  },
  file: { fontSize: 12, color: "var(--ui-text)" },
  applied: { fontSize: 11.5, color: "var(--teal)", marginRight: "auto" },
  issue: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 10px",
    alignItems: "baseline",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "8px 12px",
  },
  error: { fontSize: 10, color: "var(--failure)", letterSpacing: "0.06em" },
  warning: { fontSize: 10, color: "var(--brass)", letterSpacing: "0.06em" },
  where: { fontSize: 11, color: "var(--muted)" },
  message: { flexBasis: "100%", fontSize: 12.5, color: "var(--secondary)" },
  modes: { display: "flex", flexWrap: "wrap", gap: 10 },
  mode: {
    flex: "1 1 240px",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "11px 13px",
    cursor: "pointer",
  },
  modeTitle: { display: "block", fontSize: 13.5, color: "var(--ui-text)", fontWeight: 600 },
  modeNote: { display: "block", fontSize: 12, color: "var(--secondary)", marginTop: 2 },
};
