/**
 * Story Blueprint (low-level-plan-v2 §3).
 *
 * The author-facing story-authoring surface: SillyTavern-equivalent identity/style/premise
 * fields. **Architectural invariant:** blueprint fields feed identity, style, and premise into
 * the pipeline — they NEVER author mechanics, and user-authored prompt text (`systemPrompt`,
 * `postHistoryInstructions`) is always subordinate to the framework's mechanical-authority clause
 * (§8.1). Mechanics come only from the Story AI at bootstrap (D2/D3/D8). This subordination is
 * what keeps the integrity USP intact even when a user writes their own system prompt.
 *
 * This is the INTERNAL model (camelCase). The Chara-Card wire format (snake_case: `first_mes`,
 * `mes_example`, …) lives in `importer/cardTypes.ts`; `blueprintFromCard` bridges the two.
 */
import { z } from "zod";

/**
 * Narrative style settings for a story (POV / tense / length). Distinct from samplers — these
 * shape prose voice, not the model's decoding. Injected into the narrator frame as style hints,
 * always above the authority clause.
 */
export const StoryStyleSettingsSchema = z.object({
  pov: z.enum(["first", "second", "third"]).optional(),
  tense: z.enum(["past", "present"]).optional(),
  proseLength: z.enum(["brief", "medium", "long"]).optional(),
});
export type StoryStyleSettings = z.infer<typeof StoryStyleSettingsSchema>;

/**
 * A Story Blueprint. Every field optional so a blueprint can be as thin as a name; the mapping
 * layer (`blueprintToStyleInputs`) tolerates any subset. `systemPrompt` and
 * `postHistoryInstructions` are the two user-authored prompt slots — style only, never authority.
 */
export const BlueprintSchema = z.object({
  name: z.string().optional(),
  /** Backstory / description → soft identity + context + dossier. */
  description: z.string().optional(),
  /** → soft identity `traits`. */
  personality: z.string().optional(),
  /** → soft identity + dossier + living card. */
  appearance: z.string().optional(),
  /** → soft identity, used as a narrator style hint. */
  speechStyle: z.string().optional(),
  /** Premise seed + world soft overview; seeds bootstrap, sets opening world state. */
  scenario: z.string().optional(),
  /** First narrator message; the user picks among greetings at story start. */
  firstMessage: z.string().optional(),
  alternateGreetings: z.array(z.string()).optional(),
  /** `mes_example` — few-shot style block inserted into the narrator STYLE slot only. */
  exampleDialogue: z.string().optional(),
  /**
   * User `systemPrompt` → `narratorStyleDirective`. Inserted into the narrator STYLE slot,
   * composed WITH — never replacing — the authority clause (§8.1).
   */
  systemPrompt: z.string().optional(),
  /**
   * Persistent narrator reminder (like ST post-history instructions). Injected near the end of
   * the frame — still subordinate to the authority clause, which is composed after it.
   */
  postHistoryInstructions: z.string().optional(),
  /** Narrative style settings (POV/tense/length). */
  styleSettings: StoryStyleSettingsSchema.optional(),
  /** Metadata — library display/filtering only, NEVER sent to models. */
  creatorNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

/**
 * The style-only inputs a blueprint contributes to the narrator system frame. Deliberately a
 * NARROW projection: it exposes exactly the user/style text the prompt composer may place above
 * the authority clause, and nothing that could carry mechanics. `context.ts` consumes only this.
 */
export interface NarratorStyleInputs {
  /** From `systemPrompt` — user's own narrator directive (style only). */
  narratorStyleDirective?: string;
  /** From `exampleDialogue` — few-shot voice sample. */
  exampleDialogue?: string;
  /** From `postHistoryInstructions` — persistent reminder. */
  postHistoryInstructions?: string;
  /** From `styleSettings` — rendered POV/tense/length hint. */
  styleSettings?: StoryStyleSettings;
  /** From `speechStyle` — a short voice hint. */
  speechStyle?: string;
}

/** Project a blueprint down to just the style-only inputs the narrator frame may use. */
export function blueprintToStyleInputs(bp: Blueprint | undefined): NarratorStyleInputs {
  if (!bp) return {};
  const out: NarratorStyleInputs = {};
  if (bp.systemPrompt?.trim()) out.narratorStyleDirective = bp.systemPrompt.trim();
  if (bp.exampleDialogue?.trim()) out.exampleDialogue = bp.exampleDialogue.trim();
  if (bp.postHistoryInstructions?.trim()) out.postHistoryInstructions = bp.postHistoryInstructions.trim();
  if (bp.styleSettings) out.styleSettings = bp.styleSettings;
  if (bp.speechStyle?.trim()) out.speechStyle = bp.speechStyle.trim();
  return out;
}

/** Render style settings as a one-line human hint for the narrator frame, or "" if empty. */
export function renderStyleSettings(s: StoryStyleSettings | undefined): string {
  if (!s) return "";
  const bits: string[] = [];
  if (s.pov) bits.push(`${s.pov}-person POV`);
  if (s.tense) bits.push(`${s.tense} tense`);
  if (s.proseLength) bits.push(`${s.proseLength}-length beats`);
  return bits.join(", ");
}
