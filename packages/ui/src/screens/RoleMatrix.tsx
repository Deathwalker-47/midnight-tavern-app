import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { roleConfigurationIssues, useSettingsStore } from "../state/settingsStore.js";
import { useStoriesStore } from "../state/storiesStore.js";
import {
  getBridge,
  type ModelRecommendationConfigView,
  type RoleBinding,
  type Samplers,
} from "../bridge/core.js";
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

const SAMPLER_FIELD_DEFS = [
  { key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05 },
  { key: "topP", label: "Top-p", min: 0, max: 1, step: 0.05 },
  { key: "topK", label: "Top-k", min: 0, max: 100, step: 1 },
  { key: "minP", label: "Min-p", min: 0, max: 1, step: 0.01 },
  { key: "frequencyPenalty", label: "Frequency penalty", min: -2, max: 2, step: 0.1 },
  { key: "presencePenalty", label: "Presence penalty", min: -2, max: 2, step: 0.1 },
  { key: "repetitionPenalty", label: "Repetition penalty", min: 0, max: 2, step: 0.05 },
  { key: "maxTokens", label: "Max tokens", min: 100, max: 16000, step: 100 },
] as const;

function samplerFields(
  provider: RoleBinding["provider"],
  presetDefaults: Samplers,
  recommended: Samplers,
  samplers: Samplers | undefined
): SamplerField[] {
  const values = { ...presetDefaults, ...recommended, ...(samplers ?? {}) };
  return SAMPLER_FIELD_DEFS.flatMap((field): SamplerField[] => {
    const value = values[field.key];
    if (typeof value !== "number") return [];
    return [{
      key: field.key,
      label: field.label,
      value,
      min: field.min,
      max: field.max,
      step: field.step,
      supported: getBridge().providerSupportsSampler(provider, field.key),
    }];
  });
}

function samplerSummary(profile: Samplers): string {
  return Object.entries(profile)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ");
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
  const recommendationConfig = useMemo<ModelRecommendationConfigView>(
    () => getBridge().modelRecommendationConfig(),
    []
  );

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
    const applyDefaults = !existing.samplersDirty;
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...existing,
        provider,
        model,
        // A provider chosen in the role editor is intentional and must stay pinned when Primary
        // changes, even when the selected model also happens to be recommended.
        source: "custom",
        ...(applyDefaults
          ? { samplers: getBridge().recommendedSamplerProfile(role, model) }
          : {}),
      },
    });
    void refreshModels(provider);
  }

  function changeModel(role: ModelRole, model: string): void {
    if (!roleMap || !model) return;
    const existing = roleMap[role];
    const applyDefaults = !existing.samplersDirty;
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...existing,
        model,
        // Any explicit model selection is user-owned; only "Reset role" returns app ownership.
        source: "custom",
        ...(applyDefaults
          ? { samplers: getBridge().recommendedSamplerProfile(role, model) }
          : {}),
      },
    });
  }

  function changeSampler(role: ModelRole, key: string, value: number): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const samplers: Samplers = {
      ...getBridge().recommendedSamplerProfile(role, binding.model),
      ...(binding.samplers ?? {}),
      [key]: value,
    };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers, samplersDirty: true } });
  }

  function applyPreset(role: ModelRole, preset: SamplerPreset): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const samplers = { ...recommendationConfig.samplerPresets[preset] };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers, samplersDirty: true } });
  }

  function resetSamplers(role: ModelRole): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...binding,
        samplers: getBridge().recommendedSamplerProfile(role, binding.model),
        samplersDirty: false,
      },
    });
  }

  function resetRole(role: ModelRole): void {
    if (!roleMap) return;
    const recommended = getBridge().defaultAssignmentFor(role);
    void setRoleMap({
      ...roleMap,
      [role]: {
        ...recommended,
        ...(recommended.samplers
          ? { samplers: getBridge().recommendedSamplerProfile(role, recommended.model) }
          : {}),
        samplersDirty: false,
        source: "recommended",
      },
    });
    void refreshModels(recommended.provider);
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
              const recommendedAssignment = getBridge().defaultAssignmentFor(role);
              const recommendedLive = providerModels[recommendedAssignment.provider] ?? [];
              const recommendedState = modelStates[recommendedAssignment.provider];
              const recommendedUnavailable =
                !providerConfigs[recommendedAssignment.provider]?.apiKey ||
                (recommendedState?.state === "ready" &&
                  !recommendedLive.some(
                    (candidate) => candidate.id === recommendedAssignment.model
                  ));
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
              const selected = getBridge()
                .modelsForRole(role, binding.provider)
                .find((candidate) => candidate.id === binding.model);
              const selectedFromLive = ranked.find((candidate) => candidate.id === binding.model);
              const jsonRisk = STRUCTURED_ROLES.has(role) && selected?.supportsJsonMode === false;
              const liveSelected = live.find((candidate) => candidate.id === binding.model);
              const selectedUnavailable =
                modelState?.state === "ready" && live.length > 0 && !liveSelected;
              const selectedCustom = binding.source === "custom" || !selected?.recommendedForRole;
              const recommendationOutdated =
                binding.source === "recommended" && !selected?.recommendedForRole;
              const roleIsRecommended =
                binding.provider === recommendedAssignment.provider &&
                binding.model === recommendedAssignment.model &&
                !binding.samplersDirty;
              const recommendedProfile = getBridge().recommendedSamplerProfile(
                role,
                binding.model
              );
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
                    fit={selected?.recommendedForRole ? "recommended" : "advanced"}
                    modelState={modelState?.state ?? "idle"}
                    onRefreshModels={() => void refreshModels(binding.provider)}
                  />
                  <div style={{ padding: "0 0 8px 32px", color: "var(--muted)", fontFamily: "var(--font-ui)", fontSize: 11.5 }}>
                    {liveSelected?.contextLength
                      ? `Live provider model · ${liveSelected.contextLength.toLocaleString()} token context`
                      : selectedUnavailable
                        ? "Saved model · unavailable in the latest live provider inventory"
                        : selectedFromLive
                          ? "Live provider model · capability tags are curated when known"
                          : "Saved model · live availability has not been verified"}
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
                  {selectedUnavailable ? (
                    <div style={{ padding: "0 0 8px" }} data-testid={`model-unavailable-${role}`}>
                      <InlineNotice
                        severity="warn"
                        title="Saved model unavailable"
                        detail="Choose a live model, refresh the provider inventory, or reset this role to the current recommendation."
                      />
                    </div>
                  ) : recommendationOutdated ? (
                    <div
                      style={{ padding: "0 0 8px" }}
                      data-testid={`recommendation-outdated-${role}`}
                    >
                      <InlineNotice
                        severity="warn"
                        title="Saved recommendation is outdated"
                        detail={`Recommendation config v${recommendationConfig.version} no longer recommends this model for ${role}.`}
                      />
                    </div>
                  ) : null}
                  <div
                    data-testid={`model-fit-state-${role}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "2px 0 8px 32px",
                      color: selectedCustom ? "var(--brass)" : "var(--muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                    }}
                  >
                    <span>
                      {selectedCustom
                        ? `Custom selection · config v${recommendationConfig.version}`
                        : `Recommended selection · config v${recommendationConfig.version}`}
                    </span>
                    {!roleIsRecommended ? (
                      <button
                        type="button"
                        disabled={recommendedUnavailable}
                        title={
                          recommendedUnavailable
                            ? "The recommended provider or model is not currently available."
                            : "Restore the config-supplied model and parameters."
                        }
                        onClick={() => resetRole(role)}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: recommendedUnavailable ? "var(--muted)" : "var(--teal)",
                          cursor: recommendedUnavailable ? "default" : "pointer",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                        }}
                      >
                        Reset role to recommended
                      </button>
                    ) : null}
                  </div>
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
                        fields={samplerFields(
                          binding.provider,
                          recommendationConfig.samplerPresets[
                            recommendationConfig.defaultPresetForRole[role]
                          ],
                          recommendedProfile,
                          binding.samplers
                        )}
                        activePreset={
                          binding.samplersDirty
                            ? undefined
                            : recommendationConfig.defaultPresetForRole[role]
                        }
                        dirty={binding.samplersDirty ?? false}
                        onPreset={(preset) => applyPreset(role, preset)}
                        onFieldChange={(key, value) => changeSampler(role, key, value)}
                        onResetToRecommended={() => resetSamplers(role)}
                      />
                      <div
                        style={{
                          marginTop: 8,
                          color: "var(--muted)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                        }}
                      >
                        Recommended parameters · config v{recommendationConfig.version} ·{" "}
                        {samplerSummary(recommendedProfile)}
                      </div>
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
