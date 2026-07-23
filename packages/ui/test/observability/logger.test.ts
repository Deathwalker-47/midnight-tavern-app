import { describe, expect, it } from "vitest";
import { diagnosticError, redactForDiagnostics } from "../../src/observability/logger.js";

describe("diagnostic redaction", () => {
  it("removes credential fields and secret-shaped text recursively", () => {
    const clean = redactForDiagnostics({
      provider: "openrouter",
      apiKey: "sk-or-very-secret-value",
      nested: {
        authorization: "Bearer abc.def.ghi",
        endpoint: "https://example.test/models?api_key=private-value",
      },
    });
    const serialized = JSON.stringify(clean);
    expect(serialized).toContain("openrouter");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("very-secret-value");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("private-value");
  });

  it("keeps an error useful while redacting keys in its message", () => {
    const error = new Error("Provider rejected sk-or-secret-token");
    expect(diagnosticError(error)).toMatchObject({
      name: "Error",
      message: "Provider rejected [REDACTED]",
    });
  });

  it("preserves numeric token metrics while still redacting token credentials", () => {
    expect(redactForDiagnostics({
      maxTokens: 8_000,
      completionTokens: 6_421,
      accessToken: "token-private-value",
    })).toEqual({
      maxTokens: 8_000,
      completionTokens: 6_421,
      accessToken: "[REDACTED]",
    });
  });
});
