/**
 * Player-facing text for the story events plans 08 and 09 added: universal-pool enablement and
 * disablement, and end-of-turn recovery.
 *
 * Pure and browser-safe (no imports): the Mechanical Journal screen re-exports it through the UI
 * bridge and the Markdown/CSV export calls it from `journal.ts`, so the two cannot drift. Until
 * 2026-10-18 only the export had these sentences and the screen showed bare "Pool Enabled" rows.
 */

export interface JournalDetail {
  label: string;
  value: string;
}

export interface JournalEventText {
  summary: string;
  details: JournalDetail[];
}

export interface JournalTextNames {
  /** Display name of the event's actor; defaults to "Character". */
  actor?: string;
  /** Display label of a resource id (e.g. "grit" → "Grit"); defaults to humanizing the id. */
  resource?: (resourceId: string) => string;
}

/** `snake_case` → `Title Case`. */
export function humanizeId(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** A pool entry's display name from its id: the last dotted segment ("uni.combat.melee.strike" → "Strike"). */
export function poolEntryName(entryId: string): string {
  return humanizeId(entryId.split(".").pop() ?? entryId);
}

/** Who enabled a pool entry, in the player's words. */
export function poolSourceLabel(source: unknown): string {
  return source === "analyzer" ? "the story" : source === "forge" ? "the forge" : "you";
}

function capitalized(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Summary and detail lines for a `pool_enabled`, `pool_disabled` or `recovery` event; `undefined`
 * for every other kind.
 */
export function describeCatalogueEvent(
  kind: string,
  payload: Readonly<Record<string, unknown>>,
  names: JournalTextNames = {}
): JournalEventText | undefined {
  const entryId = typeof payload["entryId"] === "string" ? payload["entryId"] : undefined;
  if (kind === "pool_enabled") {
    const name =
      typeof payload["name"] === "string" ? payload["name"] : entryId ? poolEntryName(entryId) : "an entry";
    const type = payload["kind"] === "skill" ? "skill" : "action";
    const by = poolSourceLabel(payload["source"]);
    return {
      summary: `Enabled ${name} (${type}) - by ${by}`,
      details: [
        { label: "Entry", value: name },
        { label: "Type", value: capitalized(type) },
        { label: "Added by", value: capitalized(by) },
        ...(entryId ? [{ label: "Pool id", value: entryId }] : []),
      ],
    };
  }
  if (kind === "pool_disabled") {
    return {
      summary: `Disabled ${entryId ? poolEntryName(entryId) : "an entry"}`,
      details: entryId ? [{ label: "Pool id", value: entryId }] : [],
    };
  }
  if (kind === "recovery") {
    const label = names.resource ?? humanizeId;
    const gains = payload["gains"];
    const lines =
      gains && typeof gains === "object"
        ? Object.entries(gains as Record<string, unknown>)
            .filter((entry): entry is [string, number] => typeof entry[1] === "number")
            .map(([pool, amount]) => ({ label: label(pool), value: `+${amount}` }))
        : [];
    return {
      summary: `${names.actor ?? "Character"} - recovered ${
        lines.map((line) => `${line.label} ${line.value}`).join(", ") || "nothing"
      }`,
      details: lines,
    };
  }
  return undefined;
}
