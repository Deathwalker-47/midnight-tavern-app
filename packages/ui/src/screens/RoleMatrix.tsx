import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { roleConfigurationIssues, useSettingsStore } from "../state/settingsStore.js";
import { useStoriesStore } from "../state/storiesStore.js";
import type { RoleBinding, Samplers } from "../bridge/core.js";
import {
  Button,
  EmptyState,
  InlineNotice,
  RoleMatrixRow,
  SamplerPanel,
  type ModelRole,
  type RoleModelOption,
  type SamplerField,
  type SamplerPreset,
} from "../components/index.js";

const ROLE_DESCRIPTION: Record<ModelRole, string> = {
  narrator: "Writes the prose",
  classifier: "Decides when to roll",
  analyzer: "Reads outcomes to stats",
  summarizer: "Folds chapters to memory",
  bootstrapper: "Forges new worlds (Story AI)",
};

const ROLE_ORDER: ModelRole[] = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"];
const STRUCTURED_ROLES: ReadonlySet<ModelRole> = new Set(["classifier", "analyzer", "bootstrapper"]);

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: "OpenRouter",
  electronhub: "Electron Hub",
  nanogpt: "NanoGPT",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  xai: "xAI",
  groq: "Groq",
  custom: "Custom endpoint",
};

const ROLE_DEFAULT_SAMPLERS: Record<ModelRole, Samplers> = {
  classifier: { temperature: 0, topP: 1, maxTokens: 500 },
  analyzer: { temperature: 0.2, topP: 1, maxTokens: 800 },
  bootstrapper: { temperature: 0.4, topP: 0.95, maxTokens: 8000 },
  summarizer: { temperature: 0.5, topP: 0.95, maxTokens: 1200 },
  narrator: {
    temperature: 0.8,
    topP: 0.95,
    presencePenalty: 0.3,
    frequencyPenalty: 0.3,
    maxTokens: 1200,
  },
};

const ROLE_PRESET: Record<ModelRole, SamplerPreset> = {
  classifier: "Precise",
  analyzer: "Precise",
  bootstrapper: "Precise",
  summarizer: "Balanced",
  narrator: "Creative",
};

const PRESET_BASE: Record<SamplerPreset, Samplers> = {
  Precise: { temperature: 0.2, topP: 1 },
  Balanced: { temperature: 0.5, topP: 0.95 },
  Creative: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3 },
};

function samplerFields(role: ModelRole, samplers: Samplers | undefined): SamplerField[] {
  const values = { ...ROLE_DEFAULT_SAMPLERS[role], ...(samplers ?? {}) };
  return [
    { key: "temperature", label: "Temperature", value: values.temperature ?? 0.7, min: 0, max: 2, step: 0.05 },
    { key: "topP", label: "Top-p", value: values.topP ?? 1, min: 0, max: 1, step: 0.05 },
    { key: "topK", label: "Top-k", value: values.topK ?? 0, min: 0, max: 100, step: 1 },
    { key: "minP", label: "Min-p", value: values.minP ?? 0, min: 0, max: 1, step: 0.01 },
    { key: "frequencyPenalty", label: "Frequency penalty", value: values.frequencyPenalty ?? 0, min: -2, max: 2, step: 0.1 },
    { key: "presencePenalty", label: "Presence penalty", value: values.presencePenalty ?? 0, min: -2, max: 2, step: 0.1 },
    { key: "maxTokens", label: "Max tokens", value: values.maxTokens ?? 1200, min: 100, max: role === "bootstrapper" ? 16000 : 4000, step: 100 },
  ];
}

type RoleMatrixEditorProps = {
  showHeading?: boolean;
  confirmLabel?: string;
  onConfirm?: () => Promise<void> | void;
};

/** Shared five-role editor used by Settings, onboarding, and the standalone route. */
export function RoleMatrixEditor({
  showHeading = true,
  confirmLabel,
  onConfirm,
}: RoleMatrixEditorProps): JSX.Element {
  const {
    roleMap,
    providerIds,
    providerConfigs,
    providerModels,
    modelStates,
    loaded,
    load,
    setRoleMap,
    refreshModels,
    modelsForRole,
  } = useSettingsStore();
  const [loadError, setLoadError] = useState<string>();
  const [openRole, setOpenRole] = useState<ModelRole | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string>();

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void load().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't reach the settings store.");
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, load]);

  const providerOptions = useMemo<RoleModelOption[]>(() => {
    const configured = providerIds.filter((id) => Boolean(providerConfigs[id]?.apiKey));
    const ids = configured.length > 0 ? configured : providerIds;
    return ids.map((id) => ({ value: id, label: `${PROVIDER_LABELS[id] ?? id} · provider` }));
  }, [providerIds, providerConfigs]);

  const confirmationIssues = useMemo(
    () => roleConfigurationIssues(roleMap, providerConfigs, providerModels, modelStates),
    [roleMap, providerConfigs, providerModels, modelStates]
  );

  async function confirmSelection(): Promise<void> {
    if (!onConfirm || confirmationIssues.length > 0) return;
    setConfirming(true);
    setConfirmError(undefined);
    try {
      await onConfirm();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Couldn't save the role matrix.");
    } finally {
      setConfirming(false);
    }
  }

  function changeProvider(role: ModelRole, provider: RoleBinding["provider"]): void {
    if (!roleMap) return;
    const existing = roleMap[role];
    const first = modelsForRole(role, provider)[0];
    const model = first?.id ?? existing.model;
    const applyDefaults = first?.tier === "recommended" && !existing.samplersDirty;
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...existing,
        provider,
        model,
        source: first?.tier === "recommended" ? "recommended" : "custom",
        ...(applyDefaults ? { samplers: ROLE_DEFAULT_SAMPLERS[role] } : {}),
      },
    });
    void refreshModels(provider);
  }

  function changeModel(role: ModelRole, model: string): void {
    if (!roleMap || !model) return;
    const existing = roleMap[role];
    const selected = modelsForRole(role, existing.provider).find((candidate) => candidate.id === model);
    const applyDefaults = selected?.tier === "recommended" && !existing.samplersDirty;
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...existing,
        model,
        source: selected?.tier === "recommended" ? "recommended" : "custom",
        ...(applyDefaults ? { samplers: ROLE_DEFAULT_SAMPLERS[role] } : {}),
      },
    });
  }

  function changeSampler(role: ModelRole, key: string, value: number): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const samplers: Samplers = { ...(binding.samplers ?? ROLE_DEFAULT_SAMPLERS[role]), [key]: value };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers, samplersDirty: true } });
  }

  function applyPreset(role: ModelRole, preset: SamplerPreset): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const samplers = { ...ROLE_DEFAULT_SAMPLERS[role], ...PRESET_BASE[preset] };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers, samplersDirty: true } });
  }

  function resetSamplers(role: ModelRole): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    void setRoleMap({
      ...roleMap,
      [role]: { ...binding, samplers: ROLE_DEFAULT_SAMPLERS[role], samplersDirty: false },
    });
  }

  if (!loaded && !loadError) {
    return <div data-testid="rolematrix-loading" aria-label="Loading role matrix" style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>Loading models…</div>;
  }
  if (loadError) {
    return <InlineNotice severity="error" title="Couldn't load the role matrix" detail={loadError} />;
  }

  return (
    <div>
      {showHeading ? (
        <>
          <h1 style={H1}>Role matrix</h1>
          <p style={LEAD}>
            Five jobs, five models. Provider inventories are fetched live; Midnight Tavern adds
            role-fit and structured-output guidance without replacing the provider's list.
          </p>
        </>
      ) : null}

      {roleMap ? (
        <>
          <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "4px 16px" }}>
            {ROLE_ORDER.map((role) => {
              const binding = roleMap[role];
              const live = providerModels[binding.provider] ?? [];
              const ranked = modelsForRole(role, binding.provider);
              const modelState = modelStates[binding.provider];
              const options = ranked.map((model) => {
                const liveModel = live.find((candidate) => candidate.id === model.id);
                const tags = [
                  model.recommendedForRole ? "recommended for this role" : "",
                  model.supportsJsonMode ? "JSON-ready" : "",
                ].filter(Boolean);
                return {
                  value: model.id,
                  label: `${liveModel?.label ?? model.label}${tags.length ? ` · ${tags.join(" · ")}` : ""}`,
                };
              });
              if (!options.some((option) => option.value === binding.model)) {
                options.unshift({ value: binding.model, label: `${binding.model} · saved selection` });
              }
              const selected = ranked.find((candidate) => candidate.id === binding.model);
              const jsonRisk = STRUCTURED_ROLES.has(role) && selected?.supportsJsonMode === false;
              const liveSelected = live.find((candidate) => candidate.id === binding.model);
              return (
                <div key={role}>
                  <RoleMatrixRow
                    role={role}
                    description={ROLE_DESCRIPTION[role]}
                    providerOptions={providerOptions}
                    providerValue={binding.provider}
                    onProviderChange={(provider) => changeProvider(role, provider as RoleBinding["provider"])}
                    options={options}
                    value={binding.model}
                    onChange={(model) => changeModel(role, model)}
                    fit={selected?.tier === "recommended" ? "recommended" : "advanced"}
                    modelState={modelState?.state ?? "idle"}
                    onRefreshModels={() => void refreshModels(binding.provider)}
                  />
                  <div style={{ padding: "0 0 8px 32px", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 11.5 }}>
                    {liveSelected?.contextLength
                      ? `Live provider model · ${liveSelected.contextLength.toLocaleString()} token context`
                      : "Live provider model · capability tags are curated when known"}
                  </div>
                  {modelState?.state === "error" ? (
                    <div style={{ padding: "0 0 8px" }}>
                      <InlineNotice
                        severity="warn"
                        title="Live model list unavailable"
                        detail={modelState.reason}
                      />
                    </div>
                  ) : null}
                  {jsonRisk ? (
                    <div style={{ padding: "0 0 8px" }} data-testid={`json-risk-${role}`}>
                      <InlineNotice
                        severity="warn"
                        title="This model may return invalid structured output"
                        detail="This role must emit strict JSON. You can keep this model, but expect retries or skipped updates."
                      />
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 0 8px" }}>
                    <button
                      type="button"
                      onClick={() => setOpenRole((current) => (current === role ? null : role))}
                      aria-expanded={openRole === role}
                      style={{ background: "transparent", border: 0, color: "var(--teal)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11.5 }}
                    >
                      {openRole === role ? "▾ Hide samplers" : "▸ Samplers"}
                    </button>
                  </div>
                  {openRole === role ? (
                    <div style={{ paddingBottom: 12 }}>
                      <SamplerPanel
                        fields={samplerFields(role, binding.samplers)}
                        activePreset={binding.samplersDirty ? undefined : ROLE_PRESET[role]}
                        dirty={binding.samplersDirty ?? false}
                        onPreset={(preset) => applyPreset(role, preset)}
                        onFieldChange={(key, value) => changeSampler(role, key, value)}
                        onResetToRecommended={() => resetSamplers(role)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {confirmLabel && onConfirm ? (
            <>
              {confirmationIssues.length > 0 ? (
                <div style={{ marginTop: 18 }}>
                  <InlineNotice
                    severity="warn"
                    title="Finish configuring the model roles"
                    detail={`${confirmationIssues.map((issue) => ROLE_DESCRIPTION[issue.role]).join(", ")} still need a configured provider and live model.`}
                  />
                </div>
              ) : null}
              {confirmError ? <div style={{ marginTop: 18 }}><InlineNotice severity="error" title="Couldn't confirm models" detail={confirmError} /></div> : null}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                <Button
                  variant="primary"
                  disabled={confirming || confirmationIssues.length > 0}
                  onClick={() => void confirmSelection()}
                >
                  {confirming ? "Saving…" : confirmLabel}
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <EmptyState glyph="✦" title="No role map yet" body="Connect a provider and the recommended roles fill in." />
      )}
    </div>
  );
}

export function RoleMatrix(_props: ScreenProps): JSX.Element {
  const current = useStoriesStore((state) => state.current);
  return (
    <div style={{ padding: "34px 42px 90px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {current?.schema.statMode === "none" ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice
              severity="info"
              title="Only Narrator is active in the open No Stats story"
              detail="Classifier, analyzer, summarizer, and Story AI assignments are saved globally but receive no requests, retries, or background calls until a Full Stats story is active."
            />
          </div>
        ) : null}
        <RoleMatrixEditor />
      </div>
    </div>
  );
}

const H1: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  fontSize: 30,
  color: "var(--prose)",
  margin: "0 0 4px",
};
const LEAD: CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: 13.5,
  color: "var(--secondary)",
  lineHeight: 1.6,
  margin: "0 0 22px",
  maxWidth: 720,
};

export default RoleMatrix;
