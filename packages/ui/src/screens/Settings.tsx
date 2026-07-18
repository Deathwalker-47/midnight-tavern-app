/**
 * Settings — the install-global config screen (Design/handoff/screens/Settings.dc.html).
 *
 * Three wired sections, all driven by `useSettingsStore` (never core directly):
 *   • Providers & keys — a ProviderCard + KeyField per provider id, rendering the FOUR key states
 *     (empty / validating spinner / valid + check + balance / rejected + reason). Typing a key and
 *     hitting "Validate" persists it (`setProviderConfig`) and validates it (`validateKey`), which
 *     flips `keyStates[provider]`.
 *   • Model roles — a RoleMatrixRow per role (narrator/classifier/analyzer/summarizer/bootstrapper)
 *     whose dropdown is fed by `knownModels`; the fit badge reflects the selected model's tier;
 *     changes persist via `setRoleMap`. Narrator samplers double as the "Sampler defaults" section.
 *   • License — paste a key → `validateLicense`; the panel reflects `license` + `trial`
 *     (days remaining), with `clearLicense` once licensed. A ModelStatusChip mirrors connectivity.
 *
 * SECURITY: the key value lives in local component state and is passed to the masking KeyField —
 * it is never rendered in plain text and never logged.
 *
 * State matrix: loading (spinner) · loaded content · load-failure notice (network family) ·
 * per-key states incl. rejected (provider-auth family) · license-invalid notice · narrow layout ·
 * reduced-motion (delegated to the atoms via the token media query).
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { useSettingsStore, type KeyState } from "../state/settingsStore.js";
import type { ProviderId, RoleMap, RoleBinding } from "../bridge/core.js";
import {
  Button,
  Chip,
  EmptyState,
  InlineNotice,
  KeyField,
  ModelStatusChip,
  ProviderCard,
  RoleMatrixRow,
  type KeyFieldState,
  type ModelRole,
  type ModelStatus,
  type RoleModelOption,
} from "../components/index.js";

// ── Display metadata (copy lifted from the prototype) ──────────────────────────────────────────

interface ProviderMeta {
  name: string;
  abbr: string;
  desc: string;
  recommended?: boolean;
  placeholder: string;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  openrouter: { name: "OpenRouter", abbr: "OR", desc: "Aggregator · every major model, one key", recommended: true, placeholder: "sk-or-…" },
  anthropic: { name: "Anthropic", abbr: "AN", desc: "Claude models · direct", placeholder: "sk-ant-…" },
  openai: { name: "OpenAI", abbr: "AI", desc: "GPT models · direct", placeholder: "sk-…" },
  google: { name: "Google", abbr: "GG", desc: "Gemini models · direct", placeholder: "Paste an API key to connect" },
  mistral: { name: "Mistral", abbr: "MI", desc: "Mistral models · direct", placeholder: "Paste an API key to connect" },
  deepseek: { name: "DeepSeek", abbr: "DS", desc: "DeepSeek models · direct", placeholder: "Paste an API key to connect" },
  xai: { name: "xAI", abbr: "xAI", desc: "Grok models · direct", placeholder: "Paste an API key to connect" },
  groq: { name: "Groq", abbr: "GQ", desc: "Fast inference · direct", placeholder: "Paste an API key to connect" },
  custom: { name: "Custom endpoint", abbr: "CU", desc: "Any OpenAI-compatible base URL", placeholder: "https://… base URL, then key" },
};

function providerMeta(id: ProviderId): ProviderMeta {
  return PROVIDER_META[id] ?? { name: id, abbr: id.slice(0, 2).toUpperCase(), desc: "OpenAI-compatible · direct", placeholder: "Paste an API key to connect" };
}

const ROLE_DESCRIPTION: Record<ModelRole, string> = {
  narrator: "Writes the prose",
  classifier: "Decides when to roll",
  analyzer: "Reads outcomes to stats",
  summarizer: "Folds chapters to memory",
  bootstrapper: "Forges new worlds",
};

const ROLE_ORDER: ModelRole[] = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"];

/** The store's KeyState → the KeyField's four-state prop (idle collapses to "empty"). */
function keyFieldState(state: KeyState | undefined): KeyFieldState {
  if (!state || state.state === "idle") return "empty";
  return state.state;
}

/** Encode a role binding's provider+model as a single <select> option value. */
function optionValue(provider: string, model: string): string {
  return `${provider}::${model}`;
}
function decodeOption(value: string): { provider: ProviderId; model: string } {
  const [provider, ...rest] = value.split("::");
  return { provider: provider as ProviderId, model: rest.join("::") };
}

const SECTION: CSSProperties = { marginBottom: 44 };
const H2: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, color: "var(--prose)", margin: "0 0 4px" };
const LEAD: CSSProperties = { fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 560 };

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
    setProviderConfig,
    validateKey,
    setRoleMap,
    validateLicense,
    clearLicense,
  } = useSettingsStore();

  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  // Per-provider draft key text. Kept out of the store so an in-flight key isn't persisted until
  // the user validates. Never rendered in plain text (KeyField masks) and never logged.
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseBusy, setLicenseBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(undefined);
    void load().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't reach the settings store.");
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Seed the drafts from any persisted keys once loaded (so a saved provider shows its stored key).
  useEffect(() => {
    if (!loaded) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of providerIds) {
        if (next[id] === undefined && providerConfigs[id]?.apiKey) next[id] = providerConfigs[id]!.apiKey;
      }
      return next;
    });
  }, [loaded, providerIds, providerConfigs]);

  const modelOptions = useMemo<RoleModelOption[]>(
    () => knownModels.map((m) => ({ value: optionValue(m.provider, m.model), label: m.tier === "advanced" ? `${m.label} · advanced` : m.label })),
    [knownModels]
  );

  /** Connectivity for the ModelStatusChip: valid wins, then validating, then rejected, else idle. */
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
    return knownModels.find((m) => m.model === model)?.label ?? model;
  }, [roleMap, knownModels]);

  if (!loaded && !loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <span
          data-testid="settings-loading"
          aria-label="Loading settings"
          className="mt-sweep"
          style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--hairline)", borderTopColor: "var(--brass)", animationDuration: "0.8s" }}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "34px 42px", maxWidth: 760 }}>
        <InlineNotice
          severity="error"
          title="Couldn't load your settings"
          detail={
            <span>
              {loadError}{" "}
              <button
                type="button"
                onClick={() => {
                  setLoadError(undefined);
                  void load().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Couldn't reach the settings store."));
                }}
                style={{ background: "transparent", border: 0, color: "var(--teal)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}
              >
                Try again
              </button>
            </span>
          }
        />
      </div>
    );
  }

  const licenseValid = license.status === "valid";
  const licenseInvalid = license.status === "invalid";

  async function onValidateKey(id: ProviderId): Promise<void> {
    const value = (drafts[id] ?? "").trim();
    if (!value) return;
    // Persist first, then validate — the store flips keyStates[id] validating → valid/rejected.
    await setProviderConfig(id, { apiKey: value });
    await validateKey(id, value);
  }

  function onChangeRole(role: ModelRole, encoded: string): void {
    if (!roleMap) return;
    const { provider, model } = decodeOption(encoded);
    const nextBinding: RoleBinding = { ...roleMap[role], provider, model };
    const nextMap: RoleMap = { ...roleMap, [role]: nextBinding };
    void setRoleMap(nextMap);
  }

  async function onValidateLicense(): Promise<void> {
    const key = licenseKey.trim();
    if (!key) return;
    setLicenseBusy(true);
    try {
      await validateLicense(key);
    } finally {
      setLicenseBusy(false);
    }
  }

  return (
    <div style={{ padding: "34px 42px 80px" }}>
      <div style={{ maxWidth: 760 }}>
        {/* ── PROVIDERS & KEYS ─────────────────────────────────────────────────────────────── */}
        <section id="providers" style={SECTION}>
          <h2 style={H2}>Providers &amp; keys</h2>
          <p style={LEAD}>
            Your keys are stored on this machine only. Add one or more — roles can draw from different providers.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {providerIds.map((id) => {
              const meta = providerMeta(id);
              const state = keyStates[id];
              const fieldState = keyFieldState(state);
              const balance = state?.state === "valid" ? state.balance : undefined;
              const reason = state?.state === "rejected" ? state.reason : undefined;
              const busy = state?.state === "validating";
              return (
                <ProviderCard key={id} name={meta.name} keyState={fieldState} subtitle={meta.desc}>
                  {meta.recommended ? (
                    <div style={{ marginBottom: 10 }}>
                      <Chip tone="recommended">RECOMMENDED</Chip>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                    <KeyField
                      value={drafts[id] ?? ""}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [id]: v }))}
                      state={fieldState}
                      label={`${meta.abbr} key`}
                      placeholder={meta.placeholder}
                      {...(balance ? { balance: `Key accepted · balance ${balance}` } : {})}
                      {...(reason ? { reason } : {})}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="system"
                      disabled={busy || !(drafts[id] ?? "").trim()}
                      onClick={() => void onValidateKey(id)}
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

        {/* ── MODEL ROLES ──────────────────────────────────────────────────────────────────── */}
        <section id="roles" style={SECTION}>
          <h2 style={H2}>Model roles</h2>
          <p style={LEAD}>Five jobs, five models. Defaults are chosen for cost and quality — change any of them.</p>
          {roleMap ? (
            <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "4px 16px" }}>
              {ROLE_ORDER.map((role) => {
                const binding = roleMap[role];
                const known = knownModels.find((m) => m.provider === binding.provider && m.model === binding.model);
                const fit = known?.tier === "advanced" ? "advanced" : known ? "recommended" : "advanced";
                return (
                  <RoleMatrixRow
                    key={role}
                    role={role}
                    description={ROLE_DESCRIPTION[role]}
                    options={modelOptions}
                    value={optionValue(binding.provider, binding.model)}
                    onChange={(v) => onChangeRole(role, v)}
                    fit={fit}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState glyph="✦" title="No role map yet" body="Add a provider key and the recommended roles fill in." />
          )}
        </section>

        {/* ── SAMPLER DEFAULTS (the narrator binding's samplers) ───────────────────────────── */}
        {roleMap ? <SamplerSection roleMap={roleMap} setRoleMap={setRoleMap} /> : null}

        {/* ── LICENSE ──────────────────────────────────────────────────────────────────────── */}
        <section id="license" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 style={H2}>License</h2>
            <ModelStatusChip
              status={connectivity}
              label={connectivity === "connected" ? `Connected · ${narratorLabel}` : connectivity === "validating" ? "Validating…" : connectivity === "error" ? "Key rejected" : "No key yet"}
            />
          </div>

          <div
            style={{
              background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
              border: "1px solid var(--hairline-soft)",
              borderRadius: "var(--radius-card)",
              padding: "20px 22px",
              marginTop: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                aria-hidden="true"
                style={{ width: 44, height: 44, borderRadius: 10, background: "var(--teal-tint)", border: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brass)", fontSize: 22 }}
              >
                ✦
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {licenseValid ? (
                  <>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)" }}>Licensed</div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--secondary)" }}>
                      {license.status === "valid" && license.cache.label ? license.cache.label : "Every feature unlocked"}
                    </div>
                  </>
                ) : trial ? (
                  <>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)" }}>Free trial</div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--secondary)" }}>
                      {trial.daysRemaining} of 14 days left · every feature unlocked
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)" }}>Unlicensed</div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--secondary)" }}>Enter a license key to unlock new stories.</div>
                  </>
                )}
              </div>
              {licenseValid ? (
                <Button variant="ghost" onClick={() => void clearLicense()}>
                  Remove license
                </Button>
              ) : null}
            </div>

            {!licenseValid ? (
              <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 10 }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--secondary)" }}>LICENSE KEY</span>
                  <input
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="MT-…"
                    spellCheck={false}
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onValidateLicense();
                    }}
                    style={{
                      background: "var(--bg0-ground)",
                      border: `1px solid ${licenseInvalid ? "var(--failure)" : "var(--hairline)"}`,
                      borderRadius: "var(--radius-chip)",
                      padding: "10px 12px",
                      outline: "none",
                      color: "var(--ui-text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                    }}
                  />
                </label>
                <Button variant="primary" disabled={licenseBusy || !licenseKey.trim()} onClick={() => void onValidateLicense()}>
                  {licenseBusy ? "Checking…" : "Enter a license key"}
                </Button>
              </div>
            ) : null}

            {licenseInvalid ? (
              <div style={{ marginTop: 12 }}>
                <InlineNotice severity="error" title="That key was rejected" detail={license.status === "invalid" ? license.reason : undefined} />
              </div>
            ) : null}

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline)", fontFamily: "var(--font-ui)", fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.6 }}>
              When the trial ends you keep reading and playing every story you’ve started. Only{" "}
              <b style={{ color: "var(--ui-text)" }}>creating new stories</b> needs a license.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Sampler defaults ────────────────────────────────────────────────────────────────────────
// The prototype's "Sampler defaults" section maps onto the narrator binding's samplers ("Applied
// to the Narrator unless a story overrides them"). Sliders write through `setRoleMap`.

interface SliderDef {
  key: "temperature" | "topP" | "maxTokens";
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
  fixed?: number;
  note: string;
}

const SLIDERS: SliderDef[] = [
  { key: "temperature", label: "Temperature", min: 0, max: 1.5, step: 0.05, fallback: 0.8, fixed: 2, note: "Higher = more surprising prose. 0.7–0.9 suits most stories." },
  { key: "topP", label: "Top-p", min: 0, max: 1, step: 0.05, fallback: 1, fixed: 2, note: "Nucleus sampling. Leave near 1 unless prose feels erratic." },
  { key: "maxTokens", label: "Max tokens per turn", min: 300, max: 3000, step: 100, fallback: 1200, note: "Roughly the length of a single narration." },
];

function SamplerSection(props: { roleMap: RoleMap; setRoleMap: (map: RoleMap) => Promise<void> }): JSX.Element {
  const { roleMap, setRoleMap } = props;
  const samplers = roleMap.narrator.samplers ?? {};

  function update(key: SliderDef["key"], value: number): void {
    const nextSamplers = { ...samplers, [key]: value };
    void setRoleMap({ ...roleMap, narrator: { ...roleMap.narrator, samplers: nextSamplers } });
  }

  return (
    <section id="sampler" style={SECTION}>
      <h2 style={H2}>Sampler defaults</h2>
      <p style={LEAD}>Applied to the Narrator unless a story overrides them.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "20px 22px" }}>
        {SLIDERS.map((s) => {
          const raw = samplers[s.key];
          const value = typeof raw === "number" ? raw : s.fallback;
          const display = s.fixed !== undefined ? value.toFixed(s.fixed) : String(value);
          return (
            <div key={s.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--ui-text)" }}>{s.label}</span>
                <span className="mono" style={{ fontSize: 13, color: "var(--teal)" }}>{display}</span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={value}
                aria-label={s.label}
                onChange={(e) => update(s.key, s.key === "maxTokens" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
                style={{ width: "100%" }}
              />
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{s.note}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Settings;
