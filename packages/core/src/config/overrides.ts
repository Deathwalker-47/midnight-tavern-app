/**
 * User config overrides (plan 09 §4c) — the human, as their own game master, may edit everything in
 * the universal layer: archetypes, pool entries and item archetypes, numbers included. This does not
 * weaken the authority wall, which forbids *models* writing mechanics; the path here is human → file →
 * validated on load → frozen into a story, with no model anywhere on it (§4c.1).
 *
 * An override file has the shipped file's shape, but every list element is partial and keyed by `id`:
 *   - an element naming a shipped id deep-merges over it (objects merge, arrays and values replace,
 *     `null` deletes a field), so changing one DC means writing one small object;
 *   - `"remove": true` deletes that id;
 *   - a new id adds content, as legitimate as shipped content once it validates (§4c.5).
 *
 * Validation (§4c.7): user files are untrusted input. A schema failure skips that element — an edit
 * falls back to the shipped value, a new id is left out — with an error naming the file, the id and
 * the field; balance-rule findings are warnings, because an unbalanced game may be deliberate.
 * Adversarial numbers the schemas leave open are clamped with a warning (§4c.8). Nothing here throws.
 *
 * Pure and browser-safe: it takes the files' text, not paths.
 */
import { z, type ZodType } from "zod";
import {
  ActionArchetypeSchema,
  PoolEntrySchema,
  PoolSectionSchema,
  SkillArchetypeSchema,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  type Archetype,
  type PoolEntry,
  type PoolSection,
  type UniversalArchetypes,
  type UniversalPool,
} from "./pool.js";
import { poolViolations } from "./poolRules.js";
import { ItemArchetypeSchema, UNIVERSAL_ITEMS, type ItemArchetype, type UniversalItems } from "./items.js";
import { ECONOMY_CONFIG } from "./registry.js";

/** The override files, by key, as the user names them on disk. */
export const CONFIG_FILES = {
  archetypes: "universal-archetypes.json",
  pool: "universal-pool.json",
  items: "universal-items.json",
} as const;
export type ConfigFileKey = keyof typeof CONFIG_FILES;
export type ConfigOverrideTexts = Partial<Record<ConfigFileKey, string>>;

export interface ConfigIssue {
  file: (typeof CONFIG_FILES)[ConfigFileKey];
  severity: "error" | "warning";
  /** The element the issue is about, when there is one. */
  id?: string;
  /** Dotted path of the offending field inside that element. */
  field?: string;
  message: string;
}

export interface ResolvedConfig {
  archetypes: UniversalArchetypes;
  pool: UniversalPool;
  items: UniversalItems;
  issues: ConfigIssue[];
  /** The override texts this was resolved from (none = the shipped defaults). */
  texts: ConfigOverrideTexts;
  /** A stable fingerprint of `texts`; "" for the shipped defaults. */
  hash: string;
}

/** Ceilings for numbers the schemas leave open (§4c.8). */
export const OVERRIDE_CLAMPS = {
  dc: [5, 25] as const,
  cost: 40,
  itemProp: 20,
  restore: ECONOMY_CONFIG.maximumConsumableRestore,
};

export const SHIPPED_CONFIG: ResolvedConfig = Object.freeze({
  archetypes: UNIVERSAL_ARCHETYPES,
  pool: UNIVERSAL_POOL,
  items: UNIVERSAL_ITEMS,
  issues: [],
  texts: {},
  hash: "",
}) as ResolvedConfig;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Objects merge, `null` deletes, everything else replaces. */
function deepMerge(base: Json, patch: Json): Json {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (isObject(value) && isObject(out[key])) out[key] = deepMerge(out[key] as Json, value);
    else out[key] = value;
  }
  return out;
}

/** FNV-1a over the texts in a fixed order — stable, and needs no crypto. "" for no overrides. */
export function configHash(texts: ConfigOverrideTexts): string {
  const keys = (Object.keys(CONFIG_FILES) as ConfigFileKey[]).filter((key) => texts[key] !== undefined);
  if (keys.length === 0) return "";
  let hash = 0x811c9dc5;
  for (const char of keys.map((key) => `${key}\u0000${texts[key]}\u0000`).join("")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Merge one override list over the shipped list by id. `schemaFor` picks the schema per element. */
function mergeList<T extends { id: string }>(
  file: ConfigIssue["file"],
  list: string,
  shipped: readonly T[],
  overrides: unknown,
  schemaFor: (element: Json) => ZodType<T>,
  issues: ConfigIssue[]
): T[] {
  if (overrides === undefined) return [...shipped];
  if (!Array.isArray(overrides)) {
    issues.push({ file, severity: "error", field: list, message: `"${list}" must be a list; it was ignored.` });
    return [...shipped];
  }
  const merged = new Map(shipped.map((element) => [element.id, element]));
  for (const [index, element] of overrides.entries()) {
    if (!isObject(element) || typeof element["id"] !== "string") {
      issues.push({ file, severity: "error", field: `${list}[${index}]`, message: "Every override needs a string \"id\"; it was ignored." });
      continue;
    }
    const { id, remove, ...patch } = element as Json & { id: string; remove?: unknown };
    if (remove === true) {
      if (!merged.delete(id)) issues.push({ file, severity: "warning", id, message: "Nothing with this id to remove." });
      continue;
    }
    const base = merged.get(id);
    const candidate = deepMerge((base ?? {}) as unknown as Json, { ...patch, id });
    const parsed = schemaFor(candidate).safeParse(candidate);
    if (!parsed.success) {
      const outcome = base ? "the shipped version was kept" : "this new entry was left out";
      for (const problem of parsed.error.issues) {
        issues.push({
          file,
          severity: "error",
          id,
          ...(problem.path.length > 0 ? { field: problem.path.join(".") } : {}),
          message: `${problem.message.replace(/\.$/, "")}; ${outcome}.`,
        });
      }
      continue;
    }
    merged.set(id, parsed.data);
  }
  return [...merged.values()];
}

/** Parse one file's text into an object, or report why it could not be used at all. */
function parseFile(file: ConfigIssue["file"], text: string | undefined, issues: ConfigIssue[]): Json | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (isObject(value)) return value;
    issues.push({ file, severity: "error", message: "The file must hold one JSON object; it was ignored." });
  } catch (error) {
    issues.push({ file, severity: "error", message: `Not valid JSON (${(error as Error).message}); the file was ignored.` });
  }
  return undefined;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Clamp an action archetype's open numbers, warning for each change. */
function clampArchetype(archetype: Archetype, issues: ConfigIssue[]): Archetype {
  if (archetype.kind !== "action") return archetype;
  const file = CONFIG_FILES.archetypes;
  const dc = clamp(archetype.dc, ...OVERRIDE_CLAMPS.dc);
  if (dc !== archetype.dc) {
    issues.push({ file, severity: "warning", id: archetype.id, field: "dc", message: `DC ${archetype.dc} was clamped to ${dc}.` });
  }
  const costs = archetype.costs
    ? Object.fromEntries(
        Object.entries(archetype.costs).map(([role, amount]) => {
          const bounded = Math.min(amount!, OVERRIDE_CLAMPS.cost);
          if (bounded !== amount) {
            issues.push({ file, severity: "warning", id: archetype.id, field: `costs.${role}`, message: `Cost ${amount} was clamped to ${bounded}.` });
          }
          return [role, bounded];
        })
      )
    : undefined;
  return ActionArchetypeSchema.parse({ ...archetype, dc, ...(costs ? { costs } : {}) });
}

/** Clamp an item archetype's per-tier numbers, warning for each change. */
function clampItem(item: ItemArchetype, issues: ConfigIssue[]): ItemArchetype {
  const file = CONFIG_FILES.items;
  const bound = (field: string, ladder: Record<string, number>, ceiling: number) =>
    Object.fromEntries(
      Object.entries(ladder).map(([tier, amount]) => {
        if (amount <= ceiling) return [tier, amount];
        issues.push({ file, severity: "warning", id: item.id, field: `${field}.${tier}`, message: `${amount} was clamped to ${ceiling}.` });
        return [tier, ceiling];
      })
    );
  const props = item.props
    ? Object.fromEntries(Object.entries(item.props).map(([name, ladder]) => [name, bound(`props.${name}`, ladder, OVERRIDE_CLAMPS.itemProp)]))
    : undefined;
  const restores = item.restores
    ? Object.fromEntries(
        Object.entries(item.restores).map(([role, ladder]) => [role, bound(`restores.${role}`, ladder!, OVERRIDE_CLAMPS.restore)])
      )
    : undefined;
  return ItemArchetypeSchema.parse({ ...item, ...(props ? { props } : {}), ...(restores ? { restores } : {}) });
}

/**
 * Drop pool entries the engine could not use (unknown archetype or section, a kind mismatch, a skill
 * gate pointing nowhere) as errors, until none remain; report every other balance finding as a warning.
 */
function crossCheck(archetypes: UniversalArchetypes, pool: UniversalPool, issues: ConfigIssue[]): UniversalPool {
  let entries = [...pool.entries];
  const reported = new Set<string>();
  for (;;) {
    const entryIds = new Set(entries.map((entry) => entry.id));
    const violations = poolViolations(archetypes, { ...pool, entries });
    const breaking = violations.filter(
      (violation) => entryIds.has(violation.id) && (violation.rule === "structure" || violation.rule === "gates")
    );
    if (breaking.length === 0) {
      for (const violation of violations) {
        const key = `${violation.id}:${violation.message}`;
        if (reported.has(key)) continue;
        reported.add(key);
        issues.push({
          file: entryIds.has(violation.id) ? CONFIG_FILES.pool : CONFIG_FILES.archetypes,
          severity: "warning",
          id: violation.id,
          message: violation.message,
        });
      }
      return { ...pool, entries };
    }
    const dropped = new Set(breaking.map((violation) => violation.id));
    for (const violation of breaking) {
      issues.push({ file: CONFIG_FILES.pool, severity: "error", id: violation.id, message: `${violation.message} The entry was left out.` });
    }
    entries = entries.filter((entry) => !dropped.has(entry.id));
  }
}

/** Resolve the universal layer from the user's override texts over the shipped defaults. */
export function resolveConfig(texts: ConfigOverrideTexts): ResolvedConfig {
  const hash = configHash(texts);
  if (hash === "") return SHIPPED_CONFIG;
  const issues: ConfigIssue[] = [];

  const archetypeFile = parseFile(CONFIG_FILES.archetypes, texts.archetypes, issues);
  const archetypes: UniversalArchetypes = {
    version: UNIVERSAL_ARCHETYPES.version,
    archetypes: mergeList(
      CONFIG_FILES.archetypes,
      "archetypes",
      UNIVERSAL_ARCHETYPES.archetypes,
      archetypeFile?.["archetypes"],
      (element) => (element["kind"] === "skill" ? SkillArchetypeSchema : ActionArchetypeSchema) as ZodType<Archetype>,
      issues
    ).map(
      (archetype) => clampArchetype(archetype, issues)
    ),
  };

  const poolFile = parseFile(CONFIG_FILES.pool, texts.pool, issues);
  const sections: PoolSection[] = mergeList(
    CONFIG_FILES.pool,
    "sections",
    UNIVERSAL_POOL.sections,
    poolFile?.["sections"],
    () => PoolSectionSchema,
    issues
  );
  const entries: PoolEntry[] = mergeList(
    CONFIG_FILES.pool,
    "entries",
    UNIVERSAL_POOL.entries,
    poolFile?.["entries"],
    () => PoolEntrySchema as unknown as ZodType<PoolEntry>,
    issues
  );
  const pool = crossCheck(archetypes, { version: UNIVERSAL_POOL.version, sections, entries }, issues);

  const itemFile = parseFile(CONFIG_FILES.items, texts.items, issues);
  const items: UniversalItems = {
    version: UNIVERSAL_ITEMS.version,
    archetypes: mergeList(
      CONFIG_FILES.items,
      "archetypes",
      UNIVERSAL_ITEMS.archetypes,
      itemFile?.["archetypes"],
      () => ItemArchetypeSchema,
      issues
    ).map(
      (item) => clampItem(item, issues)
    ),
  };
  if (items.archetypes.length === 0) {
    issues.push({ file: CONFIG_FILES.items, severity: "error", message: "Every item archetype was removed; the shipped ones were kept." });
    items.archetypes = [...UNIVERSAL_ITEMS.archetypes];
  }

  return { archetypes, pool, items, issues, texts: { ...texts }, hash };
}

/** The README written beside the override files on first run (§4c.2). */
export const CONFIG_README = [
  "# Midnight Tavern — rulebook config overrides",
  "",
  "Files here change the universal layer every new story is built from. The shipped defaults are",
  "never edited; your files are merged over them when the app starts.",
  "",
  "- universal-archetypes.json — the mechanics of actions and skills (DCs, costs, cooldowns, effects).",
  "- universal-pool.json — the named actions and skills, and the sections they are browsed in.",
  "- universal-items.json — the shapes loot can take (slots, damage, what potions restore).",
  "",
  "Each file has the shipped file's shape, but list every change by id and include only the fields",
  "you change. For example, to make swaying someone harder (Persuade and every entry built on the same",
  "archetype):",
  "",
  '    { "archetypes": [ { "id": "arch.social.sway", "dc": 15 } ] }',
  "",
  'Add `"remove": true` to an element to delete it, set a field to `null` to clear it, and use a new id',
  "to add your own content. Mistakes never stop the app: a broken element is skipped and Story Settings",
  "lists exactly what was skipped and why. Extreme numbers are clamped.",
  "",
  "Stories keep the config they were created with unless you set one to “follow my edits”. Turns",
  "already played are never recomputed.",
].join("\n");

/** Override texts as stored in a story's config snapshot (untrusted until parsed). */
export const ConfigOverrideTextsSchema = z
  .object({ archetypes: z.string(), pool: z.string(), items: z.string() })
  .partial();
