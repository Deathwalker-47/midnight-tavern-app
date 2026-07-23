import { z } from "zod";
import type { CharacterCard } from "./cardTypes.js";

export interface ImportedMechanicsProvenance {
  kind: "card-extension";
  path: string;
  cardSpec: CharacterCard["spec"];
  cardSpecVersion: string;
}

export interface ImportedAttributeMechanic {
  id: string;
  name: string;
  /** Card-authored display abbreviation. It wins over generated abbreviations when present. */
  abbrev?: string;
  score: number;
  description?: string;
  locked: boolean;
  superhuman: boolean;
  provenance: ImportedMechanicsProvenance;
}

export interface ImportedSkillMechanic {
  id: string;
  name: string;
  description?: string;
  rank?: "novice" | "adept" | "expert" | "master";
  provenance: ImportedMechanicsProvenance;
}

export interface ImportedActionMechanic {
  id: string;
  label: string;
  definition?: string;
  governingAttribute?: string;
  requiresSkill?: string;
  provenance: ImportedMechanicsProvenance;
}

export interface ImportedMechanics {
  version: 1;
  /** Always false until the creation review explicitly accepts this typed projection. */
  accepted: false;
  reviewRequired: true;
  attributes: ImportedAttributeMechanic[];
  skills: ImportedSkillMechanic[];
  actions: ImportedActionMechanic[];
  warnings: string[];
}

const AttributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  abbrev: z.string().optional(),
  abbreviation: z.string().optional(),
  shortName: z.string().optional(),
  short_name: z.string().optional(),
  score: z.coerce.number().int().min(0).optional(),
  value: z.coerce.number().int().min(0).optional(),
  defaultScore: z.coerce.number().int().min(0).optional(),
  description: z.string().optional(),
  locked: z.boolean().optional(),
});

const SkillSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  rank: z.enum(["novice", "adept", "expert", "master"]).optional(),
});

const ActionSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  name: z.string().optional(),
  definition: z.string().optional(),
  description: z.string().optional(),
  governingAttribute: z.string().optional(),
  attribute: z.string().optional(),
  requiresSkill: z.string().optional(),
  skill: z.string().optional(),
});

interface Candidate {
  path: string;
  value: Record<string, unknown>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function atPath(root: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = root;
  for (const part of path) {
    if (!record(value)) return undefined;
    value = value[part];
  }
  return value;
}

function candidates(card: CharacterCard): Candidate[] {
  const data = card.data as Record<string, unknown>;
  const paths = [
    ["extensions", "midnight_tavern", "mechanics"],
    ["extensions", "midnightTavern", "mechanics"],
    ["extensions", "midnight-tavern", "mechanics"],
    ["extensions", "rpg", "mechanics"],
    ["mechanics"],
  ];
  const nested = paths.flatMap((parts) => {
    const value = atPath(data, parts);
    return record(value) ? [{ path: `data.${parts.join(".")}`, value }] : [];
  });
  const rootFields = ["attributes", "skills", "actions"] as const;
  const rootMechanics = Object.fromEntries(
    rootFields.flatMap((field) => {
      const value = data[field];
      return Array.isArray(value) || record(value) ? [[field, value]] : [];
    })
  );
  if (Object.keys(rootMechanics).length > 0) {
    nested.push({ path: "data", value: rootMechanics });
  }
  const extensions = record(data.extensions) ? data.extensions : undefined;
  for (const [name, value] of Object.entries(extensions ?? {})) {
    if (
      record(value) &&
      ["attributes", "skills", "actions"].some(
        (field) => Array.isArray(value[field]) || record(value[field])
      )
    ) {
      nested.push({ path: `data.extensions.${name}`, value });
    }
  }
  return nested;
}

function identifier(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function provenance(card: CharacterCard, path: string): ImportedMechanicsProvenance {
  return {
    kind: "card-extension",
    path,
    cardSpec: card.spec,
    cardSpecVersion: card.specVersion,
  };
}

function entries(value: unknown): Array<{ key?: string; value: unknown }> {
  if (Array.isArray(value)) return value.map((entry) => ({ value: entry }));
  if (record(value)) return Object.entries(value).map(([key, entry]) => ({ key, value: entry }));
  return [];
}

function parseAttributes(
  card: CharacterCard,
  candidate: Candidate,
  warnings: string[]
): ImportedAttributeMechanic[] {
  return entries(candidate.value.attributes).flatMap((entry, index) => {
    const shorthand = typeof entry.value === "number" || typeof entry.value === "string"
      ? { name: entry.key, score: entry.value }
      : entry.value;
    const parsed = AttributeSchema.safeParse(shorthand);
    if (!parsed.success) {
      warnings.push(`${candidate.path}.attributes[${index}] was ignored because it is not a typed attribute.`);
      return [];
    }
    const name = parsed.data.name?.trim() || entry.key?.trim() || parsed.data.id?.trim() || "";
    const id = identifier(parsed.data.id?.trim() || name);
    const score = parsed.data.score ?? parsed.data.value ?? parsed.data.defaultScore;
    const abbrev = (
      parsed.data.abbrev ??
      parsed.data.abbreviation ??
      parsed.data.shortName ??
      parsed.data.short_name
    )?.trim();
    if (!name || !id || score === undefined) {
      warnings.push(`${candidate.path}.attributes[${index}] requires a name/id and numeric score.`);
      return [];
    }
    return [{
      id,
      name,
      ...(abbrev ? { abbrev } : {}),
      score,
      ...(parsed.data.description?.trim() ? { description: parsed.data.description.trim() } : {}),
      locked: parsed.data.locked === true || score === 0,
      superhuman: score > 20,
      provenance: provenance(card, `${candidate.path}.attributes[${index}]`),
    }];
  });
}

function parseSkills(
  card: CharacterCard,
  candidate: Candidate,
  warnings: string[]
): ImportedSkillMechanic[] {
  return entries(candidate.value.skills).flatMap((entry, index) => {
    const shorthand = typeof entry.value === "string"
      ? { name: entry.value }
      : entry.value;
    const parsed = SkillSchema.safeParse(shorthand);
    if (!parsed.success) {
      warnings.push(`${candidate.path}.skills[${index}] was ignored because it is not a typed skill.`);
      return [];
    }
    const name = parsed.data.name?.trim() || entry.key?.trim() || parsed.data.id?.trim() || "";
    const id = identifier(parsed.data.id?.trim() || name);
    if (!name || !id) {
      warnings.push(`${candidate.path}.skills[${index}] requires a name or id.`);
      return [];
    }
    return [{
      id,
      name,
      ...(parsed.data.description?.trim() ? { description: parsed.data.description.trim() } : {}),
      ...(parsed.data.rank ? { rank: parsed.data.rank } : {}),
      provenance: provenance(card, `${candidate.path}.skills[${index}]`),
    }];
  });
}

function parseActions(
  card: CharacterCard,
  candidate: Candidate,
  warnings: string[]
): ImportedActionMechanic[] {
  return entries(candidate.value.actions).flatMap((entry, index) => {
    const parsed = ActionSchema.safeParse(entry.value);
    if (!parsed.success) {
      warnings.push(`${candidate.path}.actions[${index}] was ignored because it is not a typed action.`);
      return [];
    }
    const label = parsed.data.label?.trim() || parsed.data.name?.trim() || entry.key?.trim() || "";
    const id = identifier(parsed.data.id?.trim() || label);
    if (!label || !id) {
      warnings.push(`${candidate.path}.actions[${index}] requires a label/name or id.`);
      return [];
    }
    return [{
      id,
      label,
      ...((parsed.data.definition ?? parsed.data.description)?.trim()
        ? { definition: (parsed.data.definition ?? parsed.data.description)!.trim() }
        : {}),
      ...((parsed.data.governingAttribute ?? parsed.data.attribute)?.trim()
        ? { governingAttribute: identifier((parsed.data.governingAttribute ?? parsed.data.attribute)!.trim()) }
        : {}),
      ...((parsed.data.requiresSkill ?? parsed.data.skill)?.trim()
        ? { requiresSkill: identifier((parsed.data.requiresSkill ?? parsed.data.skill)!.trim()) }
        : {}),
      provenance: provenance(card, `${candidate.path}.actions[${index}]`),
    }];
  });
}

function dedupe<T extends { id: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

/**
 * Extract only explicitly structured mechanics from known card extension containers.
 *
 * Free-form descriptions, prompts, examples, and creator notes are never parsed for numbers,
 * so narrative instructions cannot write hard state. The returned projection remains
 * unaccepted until story creation presents and approves it.
 */
export function extractImportedMechanics(card: CharacterCard): ImportedMechanics | undefined {
  const found = candidates(card);
  if (found.length === 0) return undefined;
  const warnings: string[] = [];
  const attributes = dedupe(found.flatMap((candidate) => parseAttributes(card, candidate, warnings)));
  const skills = dedupe(found.flatMap((candidate) => parseSkills(card, candidate, warnings)));
  const actions = dedupe(found.flatMap((candidate) => parseActions(card, candidate, warnings)));
  for (const candidate of found) {
    if ("items" in candidate.value || "equipment" in candidate.value) {
      warnings.push(
        `${candidate.path} contained items/equipment. They were ignored because loot is generated on demand during play.`
      );
    }
  }
  return {
    version: 1,
    accepted: false,
    reviewRequired: true,
    attributes,
    skills,
    actions,
    warnings,
  };
}
