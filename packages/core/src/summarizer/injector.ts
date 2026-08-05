/**
 * Memory injector (low-level-plan §M8.4, §7.3 items 5–6).
 *
 * Turns persisted memory into the condensed text blocks the context assembler places (and,
 * under budget pressure, drops) as priority items 5 and 6: the latest arc document
 * condensed, the chapter summaries recorded since that arc, and soft-state slices for the
 * characters present this turn. Pure reads + string shaping — no model calls, no writes; the
 * assembler owns budgeting and decides how much of each block to keep.
 */
import type { Store } from "../store/index.js";
import type { ArcDoc, CharacterSoftState } from "../types/index.js";

/** Render one arc doc into a compact multi-line block (empty sections omitted). */
export function condenseArcDoc(doc: ArcDoc): string {
  const lines: string[] = [`Plot: ${doc.plotSummary}`];
  const section = (label: string, items: string[]) => {
    if (items.length) lines.push(`${label}: ${items.join("; ")}`);
  };
  section("Character development", doc.characterDevelopment);
  section("Relationships", doc.relationshipDynamics);
  section("Secrets", doc.secretsRevealed);
  section("Promises/oaths", doc.promisesAndOaths);
  section("Antagonists", doc.antagonists);
  section("World lore", doc.worldLore);
  section("Unresolved", doc.unresolvedThreads);
  section("Stakes", doc.stakes);
  section("Key items", doc.keyItems);
  section("Skills/powers", doc.skillsAndPowers);
  section("Limitations", doc.limitations);
  section("Timeline", doc.timeline);
  return lines.join("\n");
}

/** A raw id with no resolvable name humanizes to its last `:`-separated segment. */
function humanizeUnresolvedId(id: string): string {
  return id.split(":").at(-1) ?? id;
}

/** Condense one soft profile into a single line for present-character context. */
export function condenseSoftSlice(
  soft: CharacterSoftState,
  nameOf: (id: string) => string | undefined = () => undefined
): string {
  const bits: string[] = [];
  if (soft.identity.traits.length) bits.push(`traits: ${soft.identity.traits.slice(0, 6).join(", ")}`);
  if (soft.current.mood) bits.push(`mood: ${soft.current.mood}`);
  if (soft.current.goal) bits.push(`goal: ${soft.current.goal}`);
  if (soft.current.location) bits.push(`at: ${soft.current.location}`);
  // Top relationships by |trust|, most significant first.
  const rels = [...soft.relationships]
    .sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust))
    .slice(0, 3)
    .map((r) => {
      const label = nameOf(r.toCharacterId) ?? humanizeUnresolvedId(r.toCharacterId);
      return `${label}(trust ${r.trust.toFixed(1)}${r.feeling ? `, ${r.feeling}` : ""})`;
    });
  if (rels.length) bits.push(`relationships: ${rels.join(", ")}`);
  // Most recent observations, newest first — the narrator's only view into the analyzer's
  // capped narrative log (types/softState.ts OBSERVATION_CAP), which was previously write-only.
  const obs = soft.observations.slice(-3).reverse().map((o) => o.text);
  if (obs.length) bits.push(`recent: ${obs.join("; ")}`);
  return `${soft.name} [${soft.tier}] — ${bits.length ? bits.join(" | ") : "no notable observations"}`;
}

export interface MemoryBlock {
  /** Condensed latest arc document, or undefined if the story has no arc yet. */
  arc?: string;
  /** Chapter summaries recorded since the latest arc (oldest→newest). */
  chapters: string[];
  /** One condensed line per present character with a soft profile. */
  softSlices: string[];
  /** World-level narrative overview, or undefined if the analyzer hasn't set one yet. */
  worldOverview?: string;
  /** Open story threads not yet resolved, rendered as "title: note". */
  unresolvedThreads: string[];
}

/**
 * Build the memory block for a story given the ids of characters present this turn. The
 * assembler renders and budgets these; here we only gather and condense.
 */
export async function buildMemoryBlock(
  store: Store,
  storyId: string,
  presentIds: string[],
  nameOf: (id: string) => string | undefined = () => undefined
): Promise<MemoryBlock> {
  const latestArc = await store.arcs.latest(storyId);

  // Chapters after the latest arc's coverage (all chapters when there's no arc yet).
  const sinceIdx = latestArc ? latestArc.chapterTo + 1 : 0;
  const chapters = (await store.chapters
    .listByStory(storyId))
    .filter((c) => c.idx >= sinceIdx)
    .sort((a, b) => a.idx - b.idx)
    .map((c) => `[${c.idx}] ${c.title}: ${c.summary}`);

  const softSlices: string[] = [];
  for (const id of presentIds) {
    const soft = (await store.characters.get(id))?.soft;
    if (soft) softSlices.push(condenseSoftSlice(soft, nameOf));
  }

  const worldSoft = await store.worldSoft.get(storyId);
  const worldOverview = worldSoft?.overview || undefined;
  const unresolvedThreads = (worldSoft?.unresolvedThreads ?? [])
    .filter((t) => !t.resolved)
    .map((t) => `${t.title}${t.note ? `: ${t.note}` : ""}`);

  return {
    ...(latestArc ? { arc: condenseArcDoc(latestArc.doc) } : {}),
    chapters,
    softSlices,
    worldOverview,
    unresolvedThreads,
  };
}
