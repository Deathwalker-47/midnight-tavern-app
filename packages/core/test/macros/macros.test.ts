import { describe, expect, it } from "vitest";
import {
  createBuiltinMacroRegistry,
  evaluateMacros,
  hasResolvableMacros,
} from "../../src/macros/index.js";

describe("SillyTavern-compatible macro engine", () => {
  it("pins user to the persona and char to the card character", () => {
    const result = evaluateMacros("{{user}} meets {{char}}.", {
      user: { name: "Ari", description: "A curious archivist." },
      char: { name: "Mara" },
    });
    expect(result.output).toBe("Ari meets Mara.");
    expect(result.blocked).toBe(false);
  });

  it("supports nested arguments, scoped values, variables, and conditional branches", () => {
    const result = evaluateMacros(
      [
        "{{setvar greeting}}Hello, {{user}}!{{/setvar}}",
        "{{.enabled = true}}",
        "{{if .enabled}}{{getvar::greeting}}{{else}}hidden{{/if}}",
      ].join(""),
      { user: "Ari", char: "Mara" }
    );
    expect(result.output).toBe("Hello, Ari!");
    expect(result.variables.local.greeting).toBe("Hello, Ari!");
    expect(result.blocked).toBe(false);
  });

  it("supports variable shorthand comparisons, fallbacks, and mutations", () => {
    const result = evaluateMacros(
      "{{.score = 9}}{{.score += 3}}{{.score >= 10}}/{{.missing || Guest}}/{{.score++}}",
      { variables: { local: {}, global: {} } }
    );
    expect(result.output).toBe("true/Guest/13");
    expect(result.variables.local.score).toBe(13);
  });

  it("converts legacy markers and removes comments", () => {
    const result = evaluateMacros(
      "<USER> / <BOT>{{// inline}}{{ // }}secret{{ /// }}",
      { user: "Player", char: "Guide" }
    );
    expect(result.output).toBe("Player / Guide");
  });

  it("preserves unknown and malformed raw macro tokens verbatim", () => {
    const unknown = evaluateMacros("Before {{extensionOnly::x}} after", {});
    expect(unknown.output).toBe("Before {{extensionOnly::x}} after");
    expect(unknown.blocked).toBe(true);
    expect(unknown.warnings[0]?.code).toBe("unknown-macro");

    const malformed = evaluateMacros("Before {{user", { user: "Ari" });
    expect(malformed.output).toBe("Before {{user");
    expect(malformed.blocked).toBe(true);
    expect(malformed.warnings[0]?.code).toBe("malformed-macro");
  });

  it("preserves an unknown scoped macro including its body and closing tag", () => {
    const source = "{{extensionOnly::x}}Keep {{char}} literal{{/extensionOnly}}";
    const result = evaluateMacros(source, { char: "Mara" });
    expect(result.output).toBe(source);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "unknown-macro", source: "{{extensionOnly::x}}" }),
    ]);
  });

  it("preserves explicitly escaped literal braces", () => {
    const result = evaluateMacros("\\{\\{literal\\}\\} {{char}}", { char: "Mara" });
    expect(result.output).toBe("{{literal}} Mara");
    expect(result.blocked).toBe(false);
    expect(hasResolvableMacros("\\{\\{literal\\}\\}")).toBe(false);
  });

  it("provides stable pick and bounded roll behavior", () => {
    const first = evaluateMacros("{{pick::red::green::blue}}", { stableSeed: "chat-1" });
    const second = evaluateMacros("{{pick::red::green::blue}}", { stableSeed: "chat-1" });
    expect(second.output).toBe(first.output);

    const unsafe = evaluateMacros("{{roll::101d20}}", {});
    expect(unsafe.blocked).toBe(true);
    expect(unsafe.warnings[0]?.code).toBe("unsafe-roll");
  });

  it("registers every documented card/runtime macro family", () => {
    const names = new Set(createBuiltinMacroRegistry().names().map((name) => name.toLowerCase()));
    const required = [
      "user", "char", "group", "groupNotMuted", "charIfNotGroup", "notChar",
      "description", "personality", "scenario", "persona", "charPrompt",
      "charInstruction", "charDepthPrompt", "charCreatorNotes", "charVersion",
      "mesExamples", "mesExamplesRaw", "charFirstMessage", "original",
      "lastMessage", "lastMessageId", "lastUserMessage", "lastCharMessage",
      "firstIncludedMessageId", "firstDisplayedMessageId", "lastSwipeId",
      "currentSwipeId", "allChatRange", "summary", "time", "date", "weekday",
      "isotime", "isodate", "datetimeformat", "idleDuration", "timeDiff",
      "getvar", "setvar", "addvar", "incvar", "decvar", "hasvar", "deletevar",
      "getglobalvar", "setglobalvar", "addglobalvar", "incglobalvar",
      "decglobalvar", "hasglobalvar", "deleteglobalvar", "random", "pick", "roll",
      "maxPrompt", "maxContextTokens", "maxResponseTokens", "model", "isMobile",
      "lastGenerationType", "hasExtension", "systemPrompt", "defaultSystemPrompt",
      "authorsNote", "charAuthorsNote", "defaultAuthorsNote", "newline", "space",
      "noop", "trim", "reverse", "input", "banned", "outlet", "if",
    ];
    for (const name of required) expect(names.has(name.toLowerCase()), name).toBe(true);
  });
});
