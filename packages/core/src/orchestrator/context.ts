/**
 * Context assembly (low-level-plan §7.3, D6).
 *
 * Builds the narrator's prompt from prioritized blocks under a token budget (default 8,192,
 * approximated as chars/4). Blocks 1–3 are load-bearing truth and are never dropped: the
 * system frame with the authority clause, this turn's rulings as authoritative facts, and
 * the hard-state snapshot of present characters. Under budget pressure we drop from the
 * bottom (8→4) and truncate raw history before touching anything above it.
 *
 * Rulings are rendered here in the exact `RULING: …` line the plan specifies (§8.1) so the
 * narrator sees decided outcomes, never a chance to re-decide them. Prose never feeds back
 * into the ledger — this module only reads state.
 */
import { z } from "zod";
import type { Store, CharacterRecord } from "../store/index.js";
import type { Ruling, StorySchema, ActionDef, Outcome } from "../types/index.js";
import { buildMemoryBlock } from "../summarizer/index.js";

/** Narrator system frame — instructions + the verbatim authority clause (§8.1). */
export const NARRATOR_SYSTEM = [
  "You are the narrator of an interactive story. Write the next beat in the story's voice;",
  "you may voice multiple NPCs. Advance the scene from the player's action and the decided",
  "mechanical outcomes.",
  "",
  "AUTHORITY: Mechanical outcomes below are already decided and final. You must narrate them",
  "exactly as stated. You may not grant items, skills, or successes beyond them. Anything you",
  "invent has no mechanical effect.",
].join("\n");

/** Default context budget in tokens (setting `contextBudget`). */
export const DEFAULT_CONTEXT_BUDGET = 8192;
/** Lorebook sub-budget in tokens (§7.3 item 7). */
export const LOREBOOK_BUDGET = 800;

/** Approximate token count (chars/4, §7.3). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  crit_success: "CRITICAL SUCCESS",
  success: "SUCCESS",
  failure: "FAILURE",
  crit_failure: "CRITICAL FAILURE",
};

/** Render one ruling as the plan's authoritative `RULING: …` line (§8.1). */
export function renderRuling(
  ruling: Ruling,
  actionsById: Map<string, ActionDef>,
  nameFor: (id: string) => string
): string {
  const actor = nameFor(ruling.actorId);
  const action = actionsById.get(ruling.actionId)?.label ?? ruling.actionId;

  if (!ruling.gate.allowed || !ruling.roll) {
    const reason = ruling.gate.reason ?? "not possible";
    return `RULING: ${actor} attempted ${action} — DENIED (${reason}). Narrate this outcome (the attempt fails to occur).`;
  }

  const r = ruling.roll;
  const parts: string[] = [];
  parts.push(
    `RULING: ${actor} attempted ${action}` +
      (ruling.targetId ? ` on ${nameFor(ruling.targetId)}` : "") +
      ` vs DC ${r.dc} — rolled ${r.d20}+${r.modifier}=${r.total} → ${OUTCOME_LABEL[r.outcome]}.`
  );

  const effects = renderEffects(ruling, nameFor);
  parts.push(`Effects: ${effects.length ? effects.join("; ") : "none"}.`);

  if (ruling.masteryAdvance) {
    parts.push(
      `${actor}'s ${ruling.masteryAdvance.skillId} advanced ${ruling.masteryAdvance.fromRank}→${ruling.masteryAdvance.toRank}.`
    );
  }
  if (ruling.causedDeathOf?.length) {
    parts.push(`Killed: ${ruling.causedDeathOf.map(nameFor).join(", ")}.`);
  }
  parts.push("Narrate this outcome.");
  return parts.join(" ");
}

/** Human-readable effect fragments for a ruling's committed effects. */
function renderEffects(ruling: Ruling, nameFor: (id: string) => string): string[] {
  const e = ruling.effectsApplied;
  if (!e) return [];
  const out: string[] = [];
  for (const [rid, delta] of Object.entries(e.resourceDeltaSelf ?? {})) {
    out.push(`${nameFor(ruling.actorId)} ${rid} ${delta >= 0 ? "+" : ""}${delta}`);
  }
  for (const [rid, delta] of Object.entries(e.resourceDeltaTarget ?? {})) {
    const who = ruling.targetId ? nameFor(ruling.targetId) : "target";
    out.push(`${who} ${rid} ${delta >= 0 ? "+" : ""}${delta}`);
  }
  if (e.grantItem) out.push(`gained ${e.grantItem.qty}× ${e.grantItem.itemId}`);
  if (e.setFlag) out.push(`${e.setFlag.flagId}=${e.setFlag.value}`);
  return out;
}

/** Render a present character's hard-state snapshot (block 3 — never dropped). */
function renderHardSnapshot(record: CharacterRecord, schema: StorySchema): string {
  const hard = record.hard;
  const bits: string[] = [
    `${record.name}${record.isPlayer ? " (player)" : ""}: ${hard.alive ? "alive" : "DEAD"}`,
  ];
  const resByLabel = new Map(schema.resources.map((r) => [r.id, r.label]));
  const res = Object.entries(hard.resources)
    .map(([id, s]) => `${resByLabel.get(id) ?? id} ${s.current}/${s.max}`)
    .join(", ");
  if (res) bits.push(`resources: ${res}`);
  if (hard.skills.length)
    bits.push(`skills: ${hard.skills.map((s) => `${s.skillId}(${s.rank})`).join(", ")}`);
  const inv = hard.inventory.filter((i) => i.qty > 0);
  if (inv.length) bits.push(`inventory: ${inv.map((i) => `${i.itemId}×${i.qty}`).join(", ")}`);
  return bits.join(" | ");
}

/** Triggered lorebook entries: keyword match against recent text, newest-first, ≤ budget. */
async function triggeredLorebook(
  store: Store,
  storyId: string,
  haystack: string,
  tokenBudget: number
): Promise<string[]> {
  const hay = haystack.toLowerCase();
  const enabled = await store.lorebook.listEnabled(storyId);
  const entries = enabled.filter((e) =>
    e.keys.some((k) => k.trim() && hay.includes(k.toLowerCase()))
  );

  const out: string[] = [];
  let used = 0;
  // listEnabled returns insertion order; most-recent-first per §7.3.
  for (const e of [...entries].reverse()) {
    const line = `${e.keys[0] ?? "lore"}: ${e.content}`;
    const cost = approxTokens(line);
    if (used + cost > tokenBudget) continue;
    used += cost;
    out.push(line);
  }
  return out;
}

export interface AssembleContextArgs {
  storyId: string;
  schema: StorySchema;
  rulings: Ruling[];
  presentIds: string[];
  playerText: string;
  /** Player persona + protagonist essentials (block 4), pre-rendered by the caller. */
  personaBlock?: string;
}

export interface AssembledContext {
  system: string;
  user: string;
  /** Approximate token total of the assembled user block (diagnostics/tests). */
  approxTokens: number;
  /** True when raw history was truncated or lower blocks were dropped to fit budget. */
  trimmed: boolean;
}

/**
 * Assemble the narrator prompt for one turn. Blocks are built in priority order; when the
 * running total would exceed budget we skip lower-priority blocks (memory, lorebook) and
 * truncate raw history, but never blocks 1–3.
 */
export async function assembleContext(
  store: Store,
  args: AssembleContextArgs
): Promise<AssembledContext> {
  const { storyId, schema, rulings, presentIds, playerText } = args;
  const budget =
    (await store.settings.get("contextBudget", z.number().int().positive())) ??
    DEFAULT_CONTEXT_BUDGET;

  const present = (await Promise.all(presentIds.map((id) => store.characters.get(id)))).filter(
    (r): r is CharacterRecord => r !== undefined
  );
  // Name lookup stays synchronous for the render helpers; back it with the records already fetched.
  const nameById = new Map(present.map((r) => [r.id, r.name]));
  const nameFor = (id: string) => nameById.get(id) ?? id;
  const actionsById = new Map(schema.actions.map((a) => [a.id, a]));

  // Block 2: rulings (never dropped).
  const rulingLines = rulings.map((r) => renderRuling(r, actionsById, nameFor));

  // Block 3: hard-state snapshot of present characters (never dropped).
  const hardLines = present.map((r) => renderHardSnapshot(r, schema));

  // Blocks 5–6: memory (soft slices + arc + chapters).
  const memory = await buildMemoryBlock(store, storyId, presentIds);

  // Block 7: triggered lorebook, matched against player text + recent narration.
  const recent = await store.messages.recent(storyId, 8);
  const haystack = [playerText, ...recent.map((m) => m.content)].join("\n");
  const lore = await triggeredLorebook(store, storyId, haystack, LOREBOOK_BUDGET);

  // Assemble top-down, tracking budget. Blocks 1–3 always included.
  const sections: string[] = [];
  let used = approxTokens(NARRATOR_SYSTEM);
  let trimmed = false;

  const pushAlways = (title: string, body: string) => {
    const block = `## ${title}\n${body}`;
    sections.push(block);
    used += approxTokens(block);
  };
  const pushIfFits = (title: string, body: string): boolean => {
    if (!body.trim()) return false;
    const block = `## ${title}\n${body}`;
    const cost = approxTokens(block);
    if (used + cost > budget) {
      trimmed = true;
      return false;
    }
    sections.push(block);
    used += cost;
    return true;
  };

  // 2, 3: authoritative truth.
  pushAlways("This turn's rulings (authoritative — narrate exactly)", rulingLines.length ? rulingLines.join("\n") : "No mechanical actions this turn.");
  pushAlways("Present characters (hard state)", hardLines.join("\n"));

  // 4: persona / protagonist essentials.
  if (args.personaBlock) pushIfFits("Player & protagonist", args.personaBlock);

  // 5: soft-state slices.
  if (memory.softSlices.length) pushIfFits("Character notes", memory.softSlices.join("\n"));

  // 6: arc doc + chapters since arc.
  const memParts: string[] = [];
  if (memory.arc) memParts.push(`Arc so far:\n${memory.arc}`);
  if (memory.chapters.length) memParts.push(`Recent chapters:\n${memory.chapters.join("\n")}`);
  if (memParts.length) pushIfFits("Story memory", memParts.join("\n\n"));

  // 7: lorebook.
  if (lore.length) pushIfFits("Relevant lore", lore.join("\n"));

  // 8: raw recent history — truncate to whatever budget remains (newest kept).
  const historyLines = recent.map((m) => `${m.role.toUpperCase()}: ${m.content}`);
  const kept: string[] = [];
  for (let i = historyLines.length - 1; i >= 0; i--) {
    const cost = approxTokens(historyLines[i]!) + 1;
    if (used + cost > budget) {
      trimmed = true;
      break;
    }
    kept.unshift(historyLines[i]!);
    used += cost;
  }
  // The player's current message always closes the prompt.
  const playerBlock = `## Player's action (respond to this)\n${playerText}`;
  if (kept.length) sections.push(`## Recent history\n${kept.join("\n")}`);
  sections.push(playerBlock);
  used += approxTokens(playerBlock);

  return {
    system: NARRATOR_SYSTEM,
    user: sections.join("\n\n"),
    approxTokens: used,
    trimmed,
  };
}
