/**
 * RoleMatrix — the standalone model-configuration screen (low-level-plan-v2 §1/§5/§8;
 * Design/handoff-v2/screens/RoleMatrix.dc.html).
 *
 * The same five-role editor embedded inside Settings and the Wizard, openable on its own for
 * review. Each of the five roles (Narrator, Classifier, Analyzer, Summarizer, Story AI) picks a
 * provider→model (role-aware dropdown, recommended entries first) and exposes its full sampler
 * panel. Selecting a role opens its SamplerPanel below the grid; presets set a whole profile,
 * "Reset to recommended" clears the manual-override bit.
 *
 * All state flows through the settings store (`roleMap`, `knownModels`, `providerIds`, `setRoleMap`)
 * — never core directly. The screen is presentational glue: it maps the RoleMap to the row/panel
 * props and writes changes back.
 *
 * Guardrail (§8): samplers are ALWAYS per-role — there is no global creativity control. Assigning a
 * recommended model applies its role's default profile unless the role's samplers are dirty.
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { useSettingsStore } from "../state/settingsStore.js";
import type { RoleBinding, Samplers } from "../bridge/core.js";
import {
  EmptyState,
  InlineNotice,
  RoleMatrixRow,
  SamplerPanel,
  type ModelRole,
  type RoleModelOption,
  type SamplerField,
  type SamplerPreset,
} from "../components/index.js";

// Story AI is the user-facing name for the `bootstrapper` role (low-level-plan-v2 role rename).
const ROLE_DESCRIPTION: Record<ModelRole, string> = {
  narrator: "Writes the prose",
  classifier: "Decides when to roll",
  analyzer: "Reads outcomes to stats",
  summarizer: "Folds chapters to memory",
  bootstrapper: "Forges new worlds (Story AI)",
};

const ROLE_ORDER: ModelRole[] = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"];

/** The shipped per-role sampler recommendation (low-level-plan-v2 §8 "Default profiles by role"). */
const ROLE_DEFAULT_SAMPLERS: Record<ModelRole, Samplers> = {
  classifier: { temperature: 0.0, topP: 1.0, maxTokens: 500 },
  analyzer: { temperature: 0.2, topP: 1.0, maxTokens: 800 },
  bootstrapper: { temperature: 0.4, topP: 0.95, maxTokens: 3000 },
  summarizer: { temperature: 0.5, topP: 0.95, maxTokens: 1200 },
  narrator: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3, maxTokens: 1200 },
};

/** Which preset a role's default profile corresponds to, for the SamplerPanel's active-preset pill. */
const ROLE_PRESET: Record<ModelRole, SamplerPreset> = {
  classifier: "Precise",
  analyzer: "Precise",
  bootstrapper: "Precise",
  summarizer: "Balanced",
  narrator: "Creative",
};

const PRESET_BASE: Record<SamplerPreset, Samplers> = {
  Precise: { temperature: 0.2, topP: 1.0 },
  Balanced: { temperature: 0.5, topP: 0.95 },
  Creative: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3 },
};

function optionValue(provider: string, model: string): string {
  return `${provider}::${model}`;
}
function decodeOption(value: string): { provider: string; model: string } {
  const [provider, ...rest] = value.split("::");
  return { provider: provider ?? "", model: rest.join("::") };
}

/** Build the SamplerPanel field list from a binding's samplers, falling back to the role default. */
function samplerFields(role: ModelRole, samplers: Samplers | undefined): SamplerField[] {
  const s = { ...ROLE_DEFAULT_SAMPLERS[role], ...(samplers ?? {}) };
  return [
    { key: "temperature", label: "Temperature", value: s.temperature ?? 0.7, min: 0, max: 2, step: 0.05 },
    { key: "topP", label: "Top-p", value: s.topP ?? 1, min: 0, max: 1, step: 0.05 },
    { key: "topK", label: "Top-k", value: s.topK ?? 0, min: 0, max: 100, step: 1 },
    { key: "minP", label: "Min-p", value: s.minP ?? 0, min: 0, max: 1, step: 0.01 },
    { key: "frequencyPenalty", label: "Frequency penalty", value: s.frequencyPenalty ?? 0, min: -2, max: 2, step: 0.1 },
    { key: "presencePenalty", label: "Presence penalty", value: s.presencePenalty ?? 0, min: -2, max: 2, step: 0.1 },
    { key: "maxTokens", label: "Max tokens", value: s.maxTokens ?? 1200, min: 100, max: 4000, step: 100 },
  ];
}

const H1: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, color: "var(--prose)", margin: "0 0 4px" };
const LEAD: CSSProperties = { fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 620 };

export function RoleMatrix(_props: ScreenProps): JSX.Element {
  const { roleMap, knownModels, providerIds, loaded, load, setRoleMap } = useSettingsStore();
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [openRole, setOpenRole] = useState<ModelRole | null>(null);

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

  // Role-aware options: the model's own provider's models, recommended tier first.
  const modelOptions = useMemo<RoleModelOption[]>(
    () =>
      knownModels.map((m) => ({
        value: optionValue(m.provider, m.model),
        label: m.tier === "advanced" ? `${m.label} · advanced` : m.label,
      })),
    [knownModels]
  );

  function onChangeRole(role: ModelRole, encoded: string): void {
    if (!roleMap) return;
    const { provider, model } = decodeOption(encoded);
    const known = knownModels.find((m) => m.provider === provider && m.model === model);
    // Assigning a recommended model applies its role default profile UNLESS the user has dirtied it.
    const existing = roleMap[role];
    const applyDefaults = known?.tier === "recommended" && !existing.samplersDirty;
    const nextBinding: RoleBinding = {
      ...existing,
      provider: provider as RoleBinding["provider"],
      model,
      source: known?.tier === "recommended" ? "recommended" : "custom",
      ...(applyDefaults ? { samplers: ROLE_DEFAULT_SAMPLERS[role] } : {}),
    };
    void setRoleMap({ ...roleMap, [role]: nextBinding });
  }

  function onFieldChange(role: ModelRole, key: string, value: number): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const nextSamplers: Samplers = { ...(binding.samplers ?? ROLE_DEFAULT_SAMPLERS[role]), [key]: value };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers: nextSamplers, samplersDirty: true } });
  }

  function onPreset(role: ModelRole, preset: SamplerPreset): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    const merged: Samplers = { ...ROLE_DEFAULT_SAMPLERS[role], ...PRESET_BASE[preset] };
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers: merged, samplersDirty: true } });
  }

  function onReset(role: ModelRole): void {
    if (!roleMap) return;
    const binding = roleMap[role];
    void setRoleMap({ ...roleMap, [role]: { ...binding, samplers: ROLE_DEFAULT_SAMPLERS[role], samplersDirty: false } });
  }

  if (!loaded && !loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <span
          data-testid="rolematrix-loading"
          aria-label="Loading role matrix"
          className="mt-sweep"
          style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--hairline)", borderTopColor: "var(--brass)", animationDuration: "0.8s" }}
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "34px 42px", maxWidth: 760 }}>
        <InlineNotice severity="error" title="Couldn't load the role matrix" detail={loadError} />
      </div>
    );
  }

  return (
    <div style={{ padding: "34px 42px 90px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <h1 style={H1}>Role matrix</h1>
        <p style={LEAD}>
          Five jobs, five models. Each role picks its own provider and model — recommended models are badged — and carries its own
          sampler profile. Structured roles run cold; the narrator runs warm.
        </p>

        {roleMap ? (
          <>
            <div style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "4px 16px" }}>
              {ROLE_ORDER.map((role) => {
                const binding = roleMap[role];
                const known = knownModels.find((m) => m.provider === binding.provider && m.model === binding.model);
                const fit = known?.tier === "advanced" ? "advanced" : known ? "recommended" : "advanced";
                return (
                  <div key={role}>
                    <RoleMatrixRow
                      role={role}
                      description={ROLE_DESCRIPTION[role]}
                      options={modelOptions}
                      value={optionValue(binding.provider, binding.model)}
                      onChange={(v) => onChangeRole(role, v)}
                      fit={fit}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 0 8px" }}>
                      <button
                        type="button"
                        onClick={() => setOpenRole((cur) => (cur === role ? null : role))}
                        aria-expanded={openRole === role}
                        style={{ background: "transparent", border: "none", color: "var(--teal)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-mono)" }}
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
                          onPreset={(p) => onPreset(role, p)}
                          onFieldChange={(k, v) => onFieldChange(role, k, v)}
                          onResetToRecommended={() => onReset(role)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {providerIds.length === 0 ? (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
                Add a provider key in Settings to populate the model dropdowns.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState glyph="✦" title="No role map yet" body="Add a provider key and the recommended roles fill in." />
        )}
      </div>
    </div>
  );
}

export default RoleMatrix;
