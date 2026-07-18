/**
 * Analyzer prompt contract (low-level-plan §8.3).
 *
 * The analyzer reads the latest player+narrator exchange and the current soft snapshots of
 * present characters, and emits a `SoftStatePatch` — narrative observations only. The
 * prohibition is stated in the strongest terms because this prompt is the *first* line of
 * "the wall"; the `SoftStatePatchSchema.strict()` Zod contract is the second, hard line
 * (a mechanical key can't survive parsing even if the model emits one).
 */
import type { CharacterSoftState } from "../types/index.js";

/** System prompt: what the analyzer may and may not extract. */
export const ANALYZER_SYSTEM = [
  "You are the memory analyzer for a roleplay engine. Read the latest exchange and update",
  "narrative memory as a SoftStatePatch (JSON only).",
  "You may record: personality traits, likes/dislikes, appearance, speech style, mood,",
  "location, goals, relationships (trust/power deltas in small steps), observations, new",
  "locations, and story threads (open or resolved).",
  "STRICT PROHIBITION: Never output skills, items, resources, health, inventory, damage,",
  "levels, or any number that represents a mechanical value — those are tracked elsewhere",
  "and you cannot change them. Only personality, mood, relationships, observations,",
  "locations, and threads.",
  "Use existing characterId values for known characters; you may introduce a new characterId",
  "for a clearly-named character who just appeared (they become a secondary profile).",
  "Prefer a few high-signal ops over many trivial ones. If nothing meaningful changed,",
  "return empty characterOps and worldOps arrays.",
].join("\n");

/** A compact rendering of one character's current soft snapshot for the prompt. */
function renderSnapshot(soft: CharacterSoftState): string {
  const parts = [`- ${soft.name} (${soft.characterId}) [${soft.tier}]`];
  const id = soft.identity;
  if (id.traits.length) parts.push(`    traits: ${id.traits.join(", ")}`);
  if (soft.current.mood) parts.push(`    mood: ${soft.current.mood}`);
  if (soft.current.goal) parts.push(`    goal: ${soft.current.goal}`);
  if (soft.current.location) parts.push(`    location: ${soft.current.location}`);
  if (soft.relationships.length) {
    parts.push(
      `    relationships: ${soft.relationships
        .map((r) => `${r.toCharacterId}(t=${r.trust.toFixed(1)},p=${r.power.toFixed(1)})`)
        .join(", ")}`
    );
  }
  return parts.join("\n");
}

export interface AnalyzerInput {
  playerText: string;
  narratorText: string;
  presentSoft: CharacterSoftState[];
}

/** Build the analyzer user prompt from the latest exchange and present snapshots. */
export function buildAnalyzerUser(input: AnalyzerInput): string {
  const parts = ["CURRENT SOFT SNAPSHOTS OF PRESENT CHARACTERS:"];
  parts.push(input.presentSoft.length ? input.presentSoft.map(renderSnapshot).join("\n") : "(none yet)");
  parts.push("", "LATEST EXCHANGE:", `PLAYER: ${input.playerText}`, `NARRATOR: ${input.narratorText}`);
  parts.push("", "Emit a SoftStatePatch capturing what meaningfully changed.");
  return parts.join("\n");
}
