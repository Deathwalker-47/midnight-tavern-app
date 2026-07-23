/**
 * Card → import mapping (low-level-plan §M9.4).
 *
 * Projects a parsed character card onto the shapes the rest of the app consumes:
 *   • a **premise** string handed to the bootstrapper (name + description + personality +
 *     scenario) — this is the ONLY path from card to mechanics, and it goes through the
 *     bootstrapper, never directly. The card cannot inject items/skills/resources (the wall).
 *   • a **soft identity** seed (description→backstory/appearance, personality→traits),
 *   • **selectable openings** (first_mes + alternate_greetings),
 *   • **lorebook rows** (character_book entries → keyword-triggered LorebookEntry rows).
 *
 * Everything here is pure shaping; persistence (assigning ids, writing rows, running the
 * bootstrapper) is the caller's job. Row ids are left to the caller so this stays testable
 * and free of side effects.
 */
import { CardDataSchema, type CharacterCard } from "./cardTypes.js";
import type { SoftIdentity, Blueprint } from "../types/index.js";
import {
  createBuiltinMacroRegistry,
  evaluateMacros,
  hasResolvableMacros,
  type MacroContext,
  type MacroRegistry,
  type MacroVariableStore,
  type MacroWarning,
} from "../macros/index.js";
import {
  extractImportedMechanics,
  type ImportedMechanics,
} from "./mechanics.js";

/** A lorebook row awaiting a story id + row id (the persistence-free part of LorebookEntry). */
export interface LorebookSeed {
  keys: string[];
  content: string;
  enabled: boolean;
}

/** The persistence-free result of mapping a card. */
export interface MappedCard {
  /**
   * Lossless, JSON-serializable semantic card source. Macro tokens are intentionally
   * preserved here so callers can persist this snapshot and reevaluate it with the
   * current persona/runtime context immediately before prompt assembly.
   */
  sourceCard?: CharacterCard;
  /** Display name (falls back to "Imported Character"). */
  name: string;
  /** Premise text for the bootstrapper — the sole card→mechanics channel. */
  premise: string;
  /** Seed soft identity (traits/appearance/backstory only — no mechanics). */
  identity: SoftIdentity;
  /** Opening scenes the player may pick from (first_mes first, then alternates). */
  openings: string[];
  /** Lorebook rows to persist for the story. */
  lorebook: LorebookSeed[];
  /**
   * Author-facing Story Blueprint (§3), mapped from the card's narrative/style fields. Persisted
   * on the story so the blueprint editor and narrator style slots are populated from the import.
   * Style-only — the card's `system_prompt` lands in `systemPrompt`, never in mechanics.
   */
  blueprint: Blueprint;
  /** Explicit structured mechanics awaiting user review; narrative text is never parsed here. */
  importedMechanics?: ImportedMechanics;
  /** Present only when one or more card fields contained macros. */
  macroDiagnostics?: {
    blocked: boolean;
    warnings: Array<MacroWarning & { field: string; required: boolean }>;
  };
}

export interface MapCardOptions {
  /** Persona/runtime values used to resolve card macros before any text reaches a model. */
  macroContext?: Omit<MacroContext, "char" | "card">;
  /** Optional app/extension registry. Defaults to the complete built-in registry. */
  macroRegistry?: MacroRegistry;
}

/** Split a personality blob into discrete traits (comma/newline separated, deduped). */
function toTraits(personality: string): string[] {
  const seen = new Set<string>();
  const traits: string[] = [];
  for (const raw of personality.split(/[,\n;]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    traits.push(t);
  }
  return traits;
}

/** Assemble the bootstrapper premise from the card's narrative fields. */
function buildPremise(d: CharacterCard["data"]): string {
  const parts: string[] = [];
  if (d.name) parts.push(`Character: ${d.name}`);
  if (d.description) parts.push(`Description: ${d.description}`);
  if (d.personality) parts.push(`Personality: ${d.personality}`);
  if (d.scenario) parts.push(`Scenario: ${d.scenario}`);
  return parts.join("\n\n");
}

/**
 * Map the card's narrative/style fields to an internal Blueprint (§3). Only style/identity/premise
 * fields cross over — `system_prompt` becomes the user style directive, `mes_example` the few-shot
 * voice block. Nothing here can carry mechanics. Empty strings are dropped so the blueprint stays
 * sparse (every field optional).
 */
function buildBlueprint(d: CharacterCard["data"]): Blueprint {
  const bp: Blueprint = {};
  const set = (v: string | undefined, k: keyof Blueprint) => {
    const t = v?.trim();
    if (t) (bp as Record<string, unknown>)[k] = t;
  };
  set(d.name, "name");
  set(d.description, "description");
  set(d.personality, "personality");
  set(d.scenario, "scenario");
  set(d.first_mes, "firstMessage");
  set(d.mes_example, "exampleDialogue");
  set(d.system_prompt, "systemPrompt");
  set(d.creator_notes, "creatorNotes");
  const greetings = d.alternate_greetings.map((s) => s.trim()).filter(Boolean);
  if (greetings.length) bp.alternateGreetings = greetings;
  if (d.tags.length) bp.tags = d.tags;
  return bp;
}

/**
 * Map a parsed card to the app's import shapes. `first_mes` becomes the primary opening;
 * `alternate_greetings` follow. Disabled/empty character-book entries are dropped.
 */
export function mapCardToImport(card: CharacterCard): MappedCard {
  return mapCardToImportWithOptions(card);
}

/**
 * Resolve a card into import shapes, including safe macro expansion and typed mechanics.
 *
 * `{{user}}` is supplied only from `options.macroContext.user`; `{{char}}` is pinned to
 * the card name. Unknown and malformed tokens are preserved verbatim. Evaluation failures
 * block creation only in required fields; optional fields retain a visible warning.
 */
export function mapCardToImportWithOptions(
  card: CharacterCard,
  options: MapCardOptions = {}
): MappedCard {
  const source = card.data;
  const registry = options.macroRegistry ?? createBuiltinMacroRegistry();
  let variables: MacroVariableStore = {
    local: { ...(options.macroContext?.variables?.local ?? {}) },
    global: { ...(options.macroContext?.variables?.global ?? {}) },
  };
  const macroWarnings: Array<MacroWarning & { field: string; required: boolean }> = [];
  let sawMacros = false;

  const firstMessages = [source.first_mes, ...source.alternate_greetings];
  const depthPrompt = typeof source.depth_prompt === "string"
    ? source.depth_prompt
    : source.depth_prompt?.prompt;
  const baseContext: MacroContext = {
    ...(options.macroContext ?? {}),
    char: { name: source.name.trim() || "Imported Character" },
    card: {
      description: source.description,
      personality: source.personality,
      scenario: source.scenario,
      prompt: source.system_prompt,
      instruction: source.post_history_instructions,
      depthPrompt,
      creatorNotes: source.creator_notes,
      version: source.character_version ?? card.specVersion,
      examples: source.mes_example,
      examplesRaw: source.mes_example,
      firstMessages,
    },
    variables,
  };

  const resolve = (
    value: string | undefined,
    field: string,
    required = false
  ): string => {
    if (!value || !hasResolvableMacros(value)) return value ?? "";
    sawMacros = true;
    const evaluation = evaluateMacros(value, { ...baseContext, variables }, registry);
    variables = evaluation.variables;
    macroWarnings.push(
      ...evaluation.warnings.map((warning) => ({
        ...warning,
        field,
        required,
        severity: required ? warning.severity : "warning" as const,
      }))
    );
    return evaluation.output;
  };

  const d: CharacterCard["data"] = {
    ...source,
    name: resolve(source.name, "name", true),
    description: resolve(source.description, "description"),
    personality: resolve(source.personality, "personality"),
    scenario: resolve(source.scenario, "scenario"),
    first_mes: resolve(source.first_mes, "first_mes"),
    mes_example: resolve(source.mes_example, "mes_example"),
    ...(source.creator_notes === undefined
      ? {}
      : { creator_notes: resolve(source.creator_notes, "creator_notes") }),
    ...(source.system_prompt === undefined
      ? {}
      : { system_prompt: resolve(source.system_prompt, "system_prompt") }),
    ...(source.post_history_instructions === undefined
      ? {}
      : {
          post_history_instructions: resolve(
            source.post_history_instructions,
            "post_history_instructions"
          ),
        }),
    ...(depthPrompt === undefined
      ? {}
      : { depth_prompt: resolve(depthPrompt, "depth_prompt") }),
    alternate_greetings: source.alternate_greetings.map((greeting, index) =>
      resolve(greeting, `alternate_greetings[${index}]`)
    ),
    character_book: source.character_book
      ? {
          ...source.character_book,
          entries: source.character_book.entries.map((entry, index) => ({
            ...entry,
            keys: entry.keys.map((key, keyIndex) =>
              resolve(key, `character_book.entries[${index}].keys[${keyIndex}]`)
            ),
            content: resolve(entry.content, `character_book.entries[${index}].content`),
          })),
        }
      : undefined,
  };

  const identity: SoftIdentity = {
    traits: toTraits(d.personality),
    likes: [],
    dislikes: [],
    ...(d.description ? { appearance: d.description, backstory: d.description } : {}),
  };

  const openings = [d.first_mes, ...d.alternate_greetings]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const lorebook: LorebookSeed[] = (d.character_book?.entries ?? [])
    .filter((e) => e.enabled && e.content.trim().length > 0 && e.keys.length > 0)
    .map((e) => ({
      keys: e.keys.map((k) => k.trim()).filter(Boolean),
      content: e.content.trim(),
      enabled: true,
    }))
    .filter((e) => e.keys.length > 0);
  const extractedMechanics = extractImportedMechanics(card);
  const importedMechanics = extractedMechanics
    ? {
        ...extractedMechanics,
        attributes: extractedMechanics.attributes.map((attribute, index) => ({
          ...attribute,
          name: resolve(
            attribute.name,
            `importedMechanics.attributes[${index}].name`,
            true
          ),
          ...(attribute.abbrev
            ? {
                abbrev: resolve(
                  attribute.abbrev,
                  `importedMechanics.attributes[${index}].abbrev`
                ),
              }
            : {}),
          ...(attribute.description
            ? {
                description: resolve(
                  attribute.description,
                  `importedMechanics.attributes[${index}].description`
                ),
              }
            : {}),
        })),
        skills: extractedMechanics.skills.map((skill, index) => ({
          ...skill,
          name: resolve(skill.name, `importedMechanics.skills[${index}].name`, true),
          ...(skill.description
            ? {
                description: resolve(
                  skill.description,
                  `importedMechanics.skills[${index}].description`
                ),
              }
            : {}),
        })),
        actions: extractedMechanics.actions.map((action, index) => ({
          ...action,
          label: resolve(
            action.label,
            `importedMechanics.actions[${index}].label`,
            true
          ),
          ...(action.definition
            ? {
                definition: resolve(
                  action.definition,
                  `importedMechanics.actions[${index}].definition`
                ),
              }
            : {}),
        })),
      }
    : undefined;

  return {
    sourceCard: {
      spec: card.spec,
      specVersion: card.specVersion,
      data: CardDataSchema.parse(source),
    },
    name: d.name.trim() || "Imported Character",
    premise: buildPremise(d),
    identity,
    openings,
    lorebook,
    blueprint: {
      ...buildBlueprint(d),
      ...(d.post_history_instructions?.trim()
        ? { postHistoryInstructions: d.post_history_instructions.trim() }
        : {}),
    },
    ...(importedMechanics ? { importedMechanics } : {}),
    ...(sawMacros
      ? {
          macroDiagnostics: {
            blocked: macroWarnings.some(
              (warning) => warning.required && warning.severity === "error"
            ),
            warnings: macroWarnings,
          },
        }
      : {}),
  };
}
