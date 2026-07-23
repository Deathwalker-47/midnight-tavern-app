import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { useRoute } from "../app/router.js";
import { useSettingsStore } from "../state/settingsStore.js";
import type { ProviderId } from "../bridge/core.js";
import { Button, Chip, InlineNotice, KeyField, type KeyFieldState } from "../components/index.js";
import { RoleMatrixEditor } from "./RoleMatrix.js";

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

export function SetupWizard(_props: ScreenProps): JSX.Element {
  const { params, navigate } = useRoute();
  const {
    providerIds,
    providerConfigs,
    keyStates,
    setupState,
    loaded,
    load,
    validateKey,
    confirmRoles,
    dismissSetup,
  } = useSettingsStore();
  const [step, setStep] = useState<1 | 2>(setupState.validatedProviders.length > 0 ? 2 : 1);
  const [provider, setProvider] = useState<ProviderId>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  useEffect(() => {
    const config = providerConfigs[provider];
    setApiKey(config?.apiKey ?? "");
    setBaseUrl(config?.baseUrl ?? "");
  }, [provider, providerConfigs]);

  useEffect(() => {
    if (setupState.validatedProviders.length > 0) setStep(2);
  }, [setupState.validatedProviders.length]);

  const keyState = keyStates[provider];
  const fieldState: KeyFieldState =
    !keyState || keyState.state === "idle" ? "empty" : keyState.state;
  const busy = keyState?.state === "validating";

  async function connect(): Promise<void> {
    const key = apiKey.trim();
    const endpoint = provider === "custom" ? baseUrl.trim() : undefined;
    if (!key || (provider === "custom" && !endpoint)) return;
    setError(undefined);
    const result = await validateKey(provider, key, endpoint);
    if (result.state === "valid") setStep(2);
    else if (result.state === "rejected") setError(result.reason);
  }

  async function finish(): Promise<void> {
    await confirmRoles();
    const target = params.returnTo && params.returnTo !== "setup" ? params.returnTo : "library";
    navigate(target, params.storyId ? { storyId: params.storyId } : {});
  }

  function finishNarratorOnly(): void {
    const target = params.returnTo && params.returnTo !== "setup" ? params.returnTo : "library";
    navigate(target, params.storyId ? { storyId: params.storyId } : {});
  }

  async function skip(): Promise<void> {
    await dismissSetup();
    navigate("library");
  }

  return (
    <div style={SCREEN}>
      <div style={CARD}>
        <div style={KICKER}>FIRST-RUN SETUP · STEP {step} OF 2</div>
        <h1 style={H1}>{step === 1 ? "Connect your storyteller" : "Choose how far to configure"}</h1>
        <p style={LEAD}>
          {step === 1
            ? "Connect one provider. Midnight Tavern verifies it by fetching the model list available to your key."
            : "The Narrator is enough for No Stats stories. Configure the supporting roles now if you want Full Stats mechanics."}
        </p>

        {params.setupReason ? (
          <div style={{ marginBottom: 18 }}>
            <InlineNotice
              severity="warn"
              title="Models are needed for that action"
              detail="Browsing and importing remain available. Connect a provider and confirm the role matrix before creating or playing a story."
            />
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <label style={LABEL}>
              Provider
              <select
                aria-label="Provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value as ProviderId)}
                style={INPUT}
              >
                {providerIds.map((id, index) => (
                  <option key={id} value={id}>
                    {index === 0 ? "Recommended · " : ""}{PROVIDER_LABELS[id] ?? id}
                  </option>
                ))}
              </select>
            </label>
            {provider === "openrouter" ? <div style={{ margin: "-2px 0 14px" }}><Chip tone="recommended">RECOMMENDED FIRST PROVIDER</Chip></div> : null}
            {provider === "custom" ? (
              <label style={LABEL}>
                Base URL
                <input
                  aria-label="Custom endpoint base URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://example.com/v1"
                  style={INPUT}
                />
              </label>
            ) : null}
            <KeyField
              value={apiKey}
              onChange={setApiKey}
              state={fieldState}
              label="API key"
              placeholder="Paste your API key"
              {...(keyState?.state === "rejected" ? { reason: keyState.reason } : {})}
              {...(keyState?.state === "valid" ? { balance: keyState.label ?? "Key accepted" } : {})}
            />
            {error ? <div style={{ marginTop: 12 }}><InlineNotice severity="error" title="Couldn't connect" detail={error} /></div> : null}
            <div style={ACTIONS}>
              <Button variant="ghost" onClick={() => void skip()}>Set up later</Button>
              <Button
                variant="primary"
                disabled={busy || !apiKey.trim() || (provider === "custom" && !baseUrl.trim())}
                onClick={() => void connect()}
              >
                {busy ? "Checking…" : "Connect and load models →"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <InlineNotice
                severity="info"
                title="Narrator connected"
                detail="You can create No Stats stories now. Classifier, analyzer, bootstrapper, and summarizer remain dormant in that mode."
              />
            </div>
            <RoleMatrixEditor showHeading={false} confirmLabel="Confirm models and finish →" onConfirm={finish} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setStep(1)}>← Add another provider</Button>
              <Button variant="secondary" onClick={finishNarratorOnly}>Use Narrator only for now</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SCREEN: CSSProperties = { minHeight: "100%", padding: "42px 34px 80px", boxSizing: "border-box" };
const CARD: CSSProperties = { maxWidth: 980, margin: "0 auto", padding: "30px 34px", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)" };
const KICKER: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", marginBottom: 12 };
const H1: CSSProperties = { color: "var(--prose)", fontFamily: "var(--font-display)", fontSize: 31, fontWeight: 600, margin: "0 0 8px" };
const LEAD: CSSProperties = { maxWidth: 720, color: "var(--secondary)", fontFamily: "var(--font-ui)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" };
const LABEL: CSSProperties = { display: "block", color: "var(--secondary)", fontFamily: "var(--font-ui)", fontSize: 12, marginBottom: 14 };
const INPUT: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 11px", color: "var(--ui-text)", background: "var(--bg3-raised)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)", fontFamily: "var(--font-mono)" };
const ACTIONS: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--hairline)" };

export default SetupWizard;
