import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { RoleMatrixEditor } from "./RoleMatrix.js";
import { useSettingsStore, type KeyState } from "../state/settingsStore.js";
import type { ProviderId } from "../bridge/core.js";
import { getBridge } from "../bridge/core.js";
import {
  Button,
  Chip,
  InlineNotice,
  KeyField,
  ModelStatusChip,
  ProviderCard,
  type KeyFieldState,
  type ModelStatus,
} from "../components/index.js";
import {
  diagnosticError,
  diagnosticsDirectory,
  diagnosticsLogger,
  revealDiagnostics,
} from "../observability/logger.js";

type ProviderMeta = {
  name: string;
  abbr: string;
  desc: string;
  placeholder: string;
  recommended?: boolean;
};

const PROVIDER_META: Record<string, ProviderMeta> = {
  openrouter: {
    name: "OpenRouter",
    abbr: "OR",
    desc: "Aggregator · every major model, one key",
    placeholder: "sk-or-…",
    recommended: true,
  },
  electronhub: {
    name: "Electron Hub",
    abbr: "EH",
    desc: "Aggregator · OpenAI-compatible models",
    placeholder: "ek-…",
  },
  nanogpt: {
    name: "NanoGPT",
    abbr: "NG",
    desc: "Aggregator · text and multimodal models",
    placeholder: "Paste a NanoGPT API key",
  },
  openai: { name: "OpenAI", abbr: "AI", desc: "GPT models · direct", placeholder: "sk-…" },
  anthropic: { name: "Anthropic", abbr: "AN", desc: "Claude models · direct", placeholder: "sk-ant-…" },
  google: { name: "Google", abbr: "GG", desc: "Gemini models · direct", placeholder: "Paste an API key to connect" },
  mistral: { name: "Mistral", abbr: "MI", desc: "Mistral models · direct", placeholder: "Paste an API key to connect" },
  deepseek: { name: "DeepSeek", abbr: "DS", desc: "DeepSeek models · direct", placeholder: "Paste an API key to connect" },
  xai: { name: "xAI", abbr: "xAI", desc: "Grok models · direct", placeholder: "Paste an API key to connect" },
  groq: { name: "Groq", abbr: "GQ", desc: "Fast inference · direct", placeholder: "Paste an API key to connect" },
  custom: {
    name: "Custom endpoint",
    abbr: "CU",
    desc: "Any OpenAI-compatible base URL",
    placeholder: "Paste the endpoint API key",
  },
};

function providerMeta(id: ProviderId): ProviderMeta {
  return PROVIDER_META[id] ?? {
    name: id,
    abbr: id.slice(0, 2).toUpperCase(),
    desc: "OpenAI-compatible · direct",
    placeholder: "Paste an API key to connect",
  };
}

function keyFieldState(state: KeyState | undefined): KeyFieldState {
  if (!state || state.state === "idle") return "empty";
  return state.state;
}

export function Settings(_props: ScreenProps): JSX.Element {
  const {
    providerConfigs,
    keyStates,
    roleMap,
    knownModels,
    providerIds,
    license,
    trial,
    loaded,
    load,
    validateKey,
    removeProviderConfig,
    setRoleMap,
    validateLicense,
    clearLicense,
  } = useSettingsStore();
  const [loadError, setLoadError] = useState<string>();
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [baseUrls, setBaseUrls] = useState<Partial<Record<ProviderId, string>>>({});
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [diagnosticsPath, setDiagnosticsPath] = useState<string>();
  const [diagnosticsError, setDiagnosticsError] = useState<string>();
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [primaryProvider, setPrimaryProvider] = useState<ProviderId>();
  const [primaryError, setPrimaryError] = useState<string>();
  const [disconnectingProvider, setDisconnectingProvider] = useState<ProviderId>();
  const [replacementProvider, setReplacementProvider] = useState<ProviderId>();
  const [disconnectBusy, setDisconnectBusy] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void load().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't reach settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, load]);

  useEffect(() => {
    if (!loaded) return;
    setDrafts((previous) => {
      const next = { ...previous };
      for (const id of providerIds) {
        if (next[id] === undefined && providerConfigs[id]?.apiKey) next[id] = providerConfigs[id]!.apiKey;
      }
      return next;
    });
    setBaseUrls((previous) => {
      const next = { ...previous };
      for (const id of providerIds) {
        if (next[id] === undefined && providerConfigs[id]?.baseUrl) next[id] = providerConfigs[id]!.baseUrl;
      }
      return next;
    });
  }, [loaded, providerIds, providerConfigs]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const connected = providerIds.filter((id) => Boolean(providerConfigs[id]?.apiKey));
    void getBridge().getPrimaryProvider().then((saved) => {
      if (!cancelled) setPrimaryProvider(saved && connected.includes(saved) ? saved : undefined);
    }).catch(() => {
      if (!cancelled) setPrimaryError("Couldn't read the saved Primary provider.");
    });
    return () => { cancelled = true; };
  }, [loaded, providerIds, providerConfigs]);

  async function makePrimary(id: ProviderId): Promise<void> {
    setPrimaryError(undefined);
    try {
      await getBridge().setPrimaryProvider(id);
      setPrimaryProvider(id);
    } catch (error) {
      setPrimaryError(error instanceof Error ? error.message : "Couldn't change the Primary provider.");
    }
  }

  function requestDisconnect(id: ProviderId): void {
    const replacements = providerIds.filter(
      (candidate) => candidate !== id && Boolean(providerConfigs[candidate]?.apiKey)
    );
    if (primaryProvider === id && replacements.length > 0) {
      setDisconnectingProvider(id);
      setReplacementProvider(replacements[0]);
      return;
    }
    void disconnectProvider(id);
  }

  async function disconnectProvider(id: ProviderId, replacement?: ProviderId): Promise<void> {
    setPrimaryError(undefined);
    setDisconnectBusy(true);
    try {
      if (primaryProvider === id && replacement) {
        await getBridge().setPrimaryProvider(replacement);
        setPrimaryProvider(replacement);
      }
      await removeProviderConfig(id);
      setDrafts((previous) => ({ ...previous, [id]: "" }));
      setBaseUrls((previous) => ({ ...previous, [id]: "" }));
      setDisconnectingProvider(undefined);
      setReplacementProvider(undefined);
      setPrimaryProvider(await getBridge().getPrimaryProvider());
    } catch (error) {
      setPrimaryError(error instanceof Error ? error.message : "Couldn't disconnect the provider.");
    } finally {
      setDisconnectBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void diagnosticsDirectory()
      .then((path) => {
        if (!cancelled) setDiagnosticsPath(path);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDiagnosticsError(error instanceof Error ? error.message : "Couldn't resolve the log folder.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connectivity = useMemo<ModelStatus>(() => {
    const states = providerIds.map((id) => keyStates[id]?.state);
    if (states.includes("valid")) return "connected";
    if (states.includes("validating")) return "validating";
    if (states.includes("rejected")) return "error";
    return "idle";
  }, [providerIds, keyStates]);

  const narratorLabel = useMemo(() => {
    const model = roleMap?.narrator.model;
    if (!model) return "No narrator model";
    return knownModels.find((candidate) => candidate.model === model)?.label ?? model;
  }, [roleMap, knownModels]);

  async function validateProvider(id: ProviderId): Promise<void> {
    const apiKey = (drafts[id] ?? "").trim();
    const baseUrl = id === "custom" ? (baseUrls[id] ?? "").trim() : undefined;
    if (!apiKey || (id === "custom" && !baseUrl)) return;
    await validateKey(id, apiKey, baseUrl);
  }

  async function submitLicense(): Promise<void> {
    if (!licenseKey.trim()) return;
    setLicenseBusy(true);
    try {
      await validateLicense(licenseKey.trim());
    } finally {
      setLicenseBusy(false);
    }
  }

  async function openDiagnostics(): Promise<void> {
    setDiagnosticsBusy(true);
    setDiagnosticsError(undefined);
    try {
      const path = await revealDiagnostics();
      setDiagnosticsPath(path);
      diagnosticsLogger.info("diagnostics.reveal.completed");
    } catch (error) {
      diagnosticsLogger.error("diagnostics.reveal.failed", { error: diagnosticError(error) });
      setDiagnosticsError(error instanceof Error ? error.message : "Couldn't open the log folder.");
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  if (!loaded && !loadError) {
    return <div data-testid="settings-loading" aria-label="Loading settings" style={CENTERED}>Loading settings…</div>;
  }
  if (loadError) {
    return (
      <div style={{ padding: "34px 42px", maxWidth: 760 }}>
        <InlineNotice severity="error" title="Couldn't load your settings" detail={loadError} />
      </div>
    );
  }

  const licenseValid = license.status === "valid";
  const licenseInvalid = license.status === "invalid";

  return (
    <div style={{ padding: "34px 42px 80px" }}>
      <div style={{ maxWidth: 980 }}>
        <section id="providers" style={SECTION}>
          <h2 style={H2}>Providers &amp; keys</h2>
          <p style={LEAD}>Keys stay on this machine. A provider is saved only after its live model endpoint accepts the credentials.</p>
          {primaryError ? <div style={{ marginBottom: 12 }}><InlineNotice severity="error" title="Couldn't change Primary provider" detail={primaryError} /></div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {providerIds.map((id) => {
              const meta = providerMeta(id);
              const state = keyStates[id];
              const configured = Boolean(providerConfigs[id]?.apiKey);
              const fieldState =
                configured && (!state || state.state === "idle") ? "valid" : keyFieldState(state);
              const reason = state?.state === "rejected" ? state.reason : undefined;
              const balance = state?.state === "valid" ? state.balance : undefined;
              const busy = state?.state === "validating";
              return (
                <ProviderCard key={id} name={meta.name} keyState={fieldState} subtitle={meta.desc}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                    {meta.recommended ? <Chip tone="recommended">RECOMMENDED</Chip> : null}
                    {primaryProvider === id ? <Chip tone="keyword">PRIMARY</Chip> : null}
                    {fieldState === "valid" && primaryProvider !== id ? (
                      <button type="button" onClick={() => void makePrimary(id)} style={{ marginLeft: "auto", color: "var(--teal)", background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                        Make primary
                      </button>
                    ) : null}
                    {configured ? (
                      <button
                        type="button"
                        disabled={disconnectBusy}
                        onClick={() => requestDisconnect(id)}
                        style={{
                          marginLeft: primaryProvider === id ? "auto" : 0,
                          color: "var(--muted)",
                          background: "transparent",
                          border: 0,
                          cursor: disconnectBusy ? "default" : "pointer",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                        }}
                      >
                        Disconnect
                      </button>
                    ) : null}
                  </div>
                  {disconnectingProvider === id ? (
                    <div
                      data-testid={`primary-replacement-${id}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 10,
                        padding: "10px 12px",
                        marginBottom: 12,
                        background: "var(--bg2-card)",
                        border: "1px solid var(--brass-dim)",
                        borderRadius: "var(--radius-chip)",
                      }}
                    >
                      <label style={{ ...FIELD_LABEL, flex: 1, marginBottom: 0 }}>
                        Replacement Primary
                        <select
                          aria-label="Replacement Primary provider"
                          value={replacementProvider ?? ""}
                          onChange={(event) =>
                            setReplacementProvider(event.target.value as ProviderId)
                          }
                          style={TEXT_INPUT}
                        >
                          {providerIds
                            .filter(
                              (candidate) =>
                                candidate !== id && Boolean(providerConfigs[candidate]?.apiKey)
                            )
                            .map((candidate) => (
                              <option key={candidate} value={candidate}>
                                {providerMeta(candidate).name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Button
                        variant="system"
                        disabled={disconnectBusy || !replacementProvider}
                        onClick={() =>
                          replacementProvider
                            ? void disconnectProvider(id, replacementProvider)
                            : undefined
                        }
                      >
                        {disconnectBusy ? "Replacing…" : "Replace & disconnect"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={disconnectBusy}
                        onClick={() => {
                          setDisconnectingProvider(undefined);
                          setReplacementProvider(undefined);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                  {id === "custom" ? (
                    <label style={FIELD_LABEL}>
                      Base URL
                      <input
                        aria-label="Custom endpoint base URL"
                        value={baseUrls[id] ?? ""}
                        onChange={(event) => setBaseUrls((previous) => ({ ...previous, [id]: event.target.value }))}
                        placeholder="https://example.com/v1"
                        style={TEXT_INPUT}
                      />
                    </label>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                    <KeyField
                      value={drafts[id] ?? ""}
                      onChange={(value) => setDrafts((previous) => ({ ...previous, [id]: value }))}
                      state={fieldState}
                      label={`${meta.abbr} key`}
                      placeholder={meta.placeholder}
                      {...(balance ? { balance: `Key accepted · balance ${balance}` } : {})}
                      {...(reason ? { reason } : {})}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="system"
                      disabled={busy || !(drafts[id] ?? "").trim() || (id === "custom" && !(baseUrls[id] ?? "").trim())}
                      onClick={() => void validateProvider(id)}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {busy ? "Checking…" : "Validate"}
                    </Button>
                  </div>
                </ProviderCard>
              );
            })}
          </div>
        </section>

        <section id="roles" style={SECTION}>
          <h2 style={H2}>Model roles</h2>
          <p style={LEAD}>Choose a provider first, then a model from its live inventory. Curated fit and safety tags stay attached to known models.</p>
          <RoleMatrixEditor showHeading={false} />
        </section>

        <section id="license" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 style={H2}>License</h2>
            <ModelStatusChip
              status={connectivity}
              label={connectivity === "connected" ? `Connected · ${narratorLabel}` : connectivity === "validating" ? "Validating…" : connectivity === "error" ? "Key rejected" : "No key yet"}
            />
          </div>
          <div style={PANEL}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)", marginBottom: 6 }}>
              {licenseValid ? "Licensed" : "Midnight Tavern license"}
            </div>
            <p style={{ ...LEAD, marginBottom: 14 }}>
              {licenseValid ? "This installation is fully unlocked." : trial ? `Trial · ${trial.daysRemaining} days remaining` : "A 14-day local trial starts with your first story."}
            </p>
            {licenseValid ? (
              <Button variant="ghost" onClick={() => void clearLicense()}>Remove license</Button>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <label style={{ ...FIELD_LABEL, flex: 1 }}>
                  License key
                  <input
                    aria-label="License key"
                    placeholder="MT-…"
                    value={licenseKey}
                    onChange={(event) => setLicenseKey(event.target.value)}
                    style={TEXT_INPUT}
                  />
                </label>
                <Button variant="primary" disabled={licenseBusy || !licenseKey.trim()} onClick={() => void submitLicense()}>
                  {licenseBusy ? "Checking…" : "Validate license key"}
                </Button>
              </div>
            )}
            {licenseInvalid ? (
              <div style={{ marginTop: 12 }}>
                <InlineNotice severity="error" title="That key was rejected" detail={license.reason ?? "Check the key and try again."} />
              </div>
            ) : null}
          </div>
        </section>

        <section id="diagnostics" style={{ marginBottom: 20 }}>
          <h2 style={H2}>Diagnostics</h2>
          <p style={LEAD}>
            Local logs record startup, storage, provider timing, forge phases, and failures. API keys,
            prompts, card contents, and model responses are excluded or redacted. Nothing is uploaded.
          </p>
          <div style={PANEL}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)", marginBottom: 8 }}>
              Application logs
            </div>
            <code style={LOG_PATH}>
              {diagnosticsPath ?? "The log folder is available in the installed desktop app."}
            </code>
            <div style={{ marginTop: 14 }}>
              <Button variant="system" disabled={!diagnosticsPath || diagnosticsBusy} onClick={() => void openDiagnostics()}>
                {diagnosticsBusy ? "Opening…" : "Open logs folder"}
              </Button>
            </div>
            {diagnosticsError ? <div style={{ marginTop: 12 }}><InlineNotice severity="error" title="Couldn't open logs" detail={diagnosticsError} /></div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

const SECTION: CSSProperties = { marginBottom: 44 };
const H2: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, color: "var(--prose)", margin: "0 0 4px" };
const LEAD: CSSProperties = { fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 720 };
const CENTERED: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--muted)" };
const PANEL: CSSProperties = { background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "20px 22px", marginTop: 14 };
const FIELD_LABEL: CSSProperties = { display: "block", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--secondary)", marginBottom: 10 };
const TEXT_INPUT: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "9px 10px", color: "var(--ui-text)", background: "var(--bg3-raised)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)", fontFamily: "var(--font-mono)" };
const LOG_PATH: CSSProperties = { display: "block", color: "var(--secondary)", fontFamily: "var(--font-mono)", fontSize: 11.5, overflowWrap: "anywhere" };

export default Settings;
