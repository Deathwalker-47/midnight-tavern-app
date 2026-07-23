/**
 * Bootstrap cross-validation (low-level-plan §M5.2).
 *
 * Zod guarantees each generated piece is *shaped* correctly; this module enforces the
 * cross-cutting invariants Zod can't express on its own — that every reference resolves,
 * that the catalog is big and balanced enough to be playable, that DCs sit on the 5–25
 * scale, and that a lethal resource exists exactly when the stat mode calls for one.
 *
 * Every function returns human-readable error strings (empty ⇒ valid). Those strings are
 * fed verbatim into the bootstrapper's repair loop, so the model sees precisely what it
 * must fix, and `freeze` refuses to lock a schema that still produces any.
 */
import {
  CATALOG_MIN_ACTIONS,
  CATALOG_MIN_PER_CATEGORY,
  DC_MIN,
  DC_MAX,
  ActionCategorySchema,
  type StorySchema,
  type ActionDef,
  type Condition,
  type ConditionWithReason,
} from "../types/index.js";

/** Every flag value an action can cause (the only way a true flag comes into existence). */
function definedFlagValues(actions: ActionDef[]): Map<string, Set<boolean>> {
  const flags = new Map<string, Set<boolean>>();
  for (const a of actions) {
    for (const outcome of Object.values(a.effects)) {
      if (!outcome.setFlag) continue;
      const values = flags.get(outcome.setFlag.flagId) ?? new Set<boolean>();
      values.add(outcome.setFlag.value);
      flags.set(outcome.setFlag.flagId, values);
    }
  }
  return flags;
}

/** Validate one prerequisite/condition's reference against the tables. */
function checkCondition(
  cond: Condition,
  ctx: {
    skills: Set<string>;
    resources: Set<string>;
    items: Set<string>;
    flags: Map<string, Set<boolean>>;
    attributes: Set<string>;
    runtimeItems: boolean;
  },
  where: string,
  errors: string[],
  label: "prerequisite" | "condition" = "prerequisite"
): void {
  switch (cond.type) {
    case "skill":
      if (!ctx.skills.has(cond.skillId))
        errors.push(`${where}: ${label} references unknown skill "${cond.skillId}".`);
      break;
    case "resource":
      if (!ctx.resources.has(cond.resourceId))
        errors.push(`${where}: ${label} references unknown resource "${cond.resourceId}".`);
      break;
    case "item":
      if (!ctx.items.has(cond.itemId)) {
        errors.push(
          ctx.runtimeItems
            ? `${where}: ${label} references item "${cond.itemId}", but V7 item ids are created on demand and cannot be frozen into story actions; use requiresItemKind for equipment gating.`
            : `${where}: ${label} references unknown item "${cond.itemId}".`
        );
      }
      break;
    case "flag": {
      const values = ctx.flags.get(cond.flagId);
      if (!values) {
        errors.push(
          `${where}: ${label} references dead flag "${cond.flagId}" that no action ever sets.`
        );
      } else if (cond.value && !values.has(true)) {
        errors.push(
          `${where}: ${label} expects flag "${cond.flagId}"=true, but no action can set it true.`
        );
      }
      break;
    }
    case "attribute":
      if (!ctx.attributes.has(cond.attributeId)) {
        errors.push(`${where}: ${label} references unknown attribute "${cond.attributeId}".`);
      }
      break;
  }
}

function checkActionConditions(
  action: ActionDef,
  listName: "advantageWhen" | "disadvantageWhen",
  entries: readonly ConditionWithReason[] | undefined,
  ctx: {
    skills: Set<string>;
    resources: Set<string>;
    items: Set<string>;
    flags: Map<string, Set<boolean>>;
    attributes: Set<string>;
    runtimeItems: boolean;
  },
  errors: string[]
): void {
  if (!entries) return;
  if (entries.length > 2) {
    errors.push(
      `Action "${action.id}" ${listName} has ${entries.length} entries; at most 2 are allowed.`
    );
  }
  for (const [index, entry] of entries.entries()) {
    const where = `Action "${action.id}" ${listName}[${index}]`;
    const reason = entry.reason?.trim() ?? "";
    if (reason.length === 0) {
      errors.push(`${where}: reason must be a non-empty player-facing phrase.`);
    } else if (reason.length > 40) {
      errors.push(`${where}: reason exceeds 40 characters.`);
    }
    checkCondition(entry.condition, ctx, where, errors, "condition");
  }
}

/**
 * Cross-validate an assembled story schema. Returns a flat list of error strings; an empty
 * array means the schema satisfies every §M5.2 invariant and is safe to freeze.
 */
export function validateStorySchema(schema: StorySchema): string[] {
  const errors: string[] = [];

  const skillIds = new Set(schema.skills.map((s) => s.id));
  const attributeIds = new Set(schema.attributes.map((attribute) => attribute.id));
  const resourceIds = new Set(schema.resources.map((r) => r.id));
  const itemIds = new Set(schema.items.map((i) => i.id));
  const tierIds = new Set(schema.tiers.map((t) => t.id));
  const flagValues = definedFlagValues(schema.actions);
  const ctx = {
    skills: skillIds,
    resources: resourceIds,
    items: itemIds,
    flags: flagValues,
    attributes: attributeIds,
    runtimeItems: schema.schemaVersion >= 2 && schema.items.length === 0,
  };

  if (schema.statMode === "none") {
    const mechanicalCounts = {
      attributes: schema.attributes.length,
      resources: schema.resources.length,
      skills: schema.skills.length,
      items: schema.items.length,
      tiers: schema.tiers.length,
      actions: schema.actions.length,
      npcTemplates: schema.npcTemplates.length,
    };
    for (const [name, count] of Object.entries(mechanicalCounts)) {
      if (count > 0) errors.push(`No Stats schema must have no ${name}; found ${count}.`);
    }
    if (
      Object.keys(schema.startingState.attributes).length > 0 ||
      Object.keys(schema.startingState.resources).length > 0 ||
      schema.startingState.skills.length > 0 ||
      schema.startingState.inventory.length > 0
    ) {
      errors.push("No Stats starting state must be mechanically empty.");
    }
    return errors;
  }

  if (schema.attributes.length === 0) {
    errors.push('Full Stats schema must define at least one attribute.');
  }

  // --- Catalog size & balance (§2.2) ---
  if (schema.actions.length < CATALOG_MIN_ACTIONS) {
    errors.push(
      `Action catalog has ${schema.actions.length} actions; at least ${CATALOG_MIN_ACTIONS} are required.`
    );
  }
  for (const category of ActionCategorySchema.options) {
    const count = schema.actions.filter((a) => a.category === category).length;
    if (count < CATALOG_MIN_PER_CATEGORY) {
      errors.push(
        `Category "${category}" has ${count} actions; at least ${CATALOG_MIN_PER_CATEGORY} are required.`
      );
    }
  }
  const conditionalActionCount = schema.actions.filter(
    (action) =>
      (action.advantageWhen?.length ?? 0) > 0 ||
      (action.disadvantageWhen?.length ?? 0) > 0
  ).length;
  const maximumConditionalActions = Math.floor(schema.actions.length * 0.33);
  if (conditionalActionCount > maximumConditionalActions) {
    errors.push(
      `Conditional action coverage is ${conditionalActionCount}/${schema.actions.length}; at most ${maximumConditionalActions} actions (33%) may define advantageWhen or disadvantageWhen.`
    );
  }

  // --- Per-action checks: DC scale, references ---
  const exercisedSkills = new Set<string>();
  for (const a of schema.actions) {
    if (a.dc < DC_MIN || a.dc > DC_MAX) {
      errors.push(`Action "${a.id}" has DC ${a.dc}; must be within ${DC_MIN}–${DC_MAX}.`);
    }
    if (a.requiresSkill) {
      if (!skillIds.has(a.requiresSkill)) {
        errors.push(`Action "${a.id}" requires unknown skill "${a.requiresSkill}".`);
      } else {
        exercisedSkills.add(a.requiresSkill);
      }
    }
    if (a.governingAttribute && !attributeIds.has(a.governingAttribute)) {
      errors.push(
        `Action "${a.id}" uses unknown governing attribute "${a.governingAttribute}".`
      );
    }
    checkActionConditions(a, "advantageWhen", a.advantageWhen, ctx, errors);
    checkActionConditions(a, "disadvantageWhen", a.disadvantageWhen, ctx, errors);
    // Effect references: resource deltas, granted items.
    for (const [outcome, eff] of Object.entries(a.effects)) {
      const at = `Action "${a.id}" (${outcome})`;
      for (const rid of Object.keys(eff.resourceDeltaSelf ?? {})) {
        if (!resourceIds.has(rid)) errors.push(`${at}: unknown self resource "${rid}".`);
      }
      for (const rid of Object.keys(eff.resourceDeltaTarget ?? {})) {
        if (!resourceIds.has(rid)) errors.push(`${at}: unknown target resource "${rid}".`);
      }
      for (const attributeId of Object.keys(eff.attributeDeltaSelf ?? {})) {
        if (!attributeIds.has(attributeId)) errors.push(`${at}: unknown self attribute "${attributeId}".`);
      }
      for (const attributeId of Object.keys(eff.attributeDeltaTarget ?? {})) {
        if (!attributeIds.has(attributeId)) errors.push(`${at}: unknown target attribute "${attributeId}".`);
      }
      if (eff.grantItem && !itemIds.has(eff.grantItem.itemId)) {
        errors.push(`${at}: grants unknown item "${eff.grantItem.itemId}".`);
      }
    }
    // Cost references.
    for (const rid of Object.keys(a.costs?.resources ?? {})) {
      if (!resourceIds.has(rid)) errors.push(`Action "${a.id}": cost uses unknown resource "${rid}".`);
    }
    for (const { itemId } of a.costs?.items ?? []) {
      if (!itemIds.has(itemId)) errors.push(`Action "${a.id}": cost uses unknown item "${itemId}".`);
    }
  }

  // --- Every skill must be exercised by at least one action (no dead skills) ---
  for (const s of schema.skills) {
    if (!exercisedSkills.has(s.id)) {
      errors.push(`Skill "${s.id}" is never used by any action's requiresSkill.`);
    }
    if (!tierIds.has(s.tier)) errors.push(`Skill "${s.id}" references unknown tier "${s.tier}".`);
    for (const cond of s.prerequisites) {
      checkCondition(cond, ctx, `Skill "${s.id}"`, errors);
    }
    // Unlock-path references (§M5.2).
    for (const path of s.unlockPaths) {
      if (path.method === "manual" && !itemIds.has(path.itemId)) {
        errors.push(`Skill "${s.id}": manual unlock references unknown item "${path.itemId}".`);
      }
      if (path.method === "trial" && !flagValues.has(path.flagId)) {
        errors.push(
          `Skill "${s.id}": trial unlock references flag "${path.flagId}" that no action ever sets.`
        );
      }
      if (path.method === "trainer") {
        for (const rid of Object.keys(path.cost.resources ?? {})) {
          if (!resourceIds.has(rid))
            errors.push(`Skill "${s.id}": trainer cost uses unknown resource "${rid}".`);
        }
        for (const { itemId } of path.cost.items ?? []) {
          if (!itemIds.has(itemId))
            errors.push(`Skill "${s.id}": trainer cost uses unknown item "${itemId}".`);
        }
      }
    }
  }

  // --- Item references ---
  for (const it of schema.items) {
    if (!tierIds.has(it.tier)) errors.push(`Item "${it.id}" references unknown tier "${it.tier}".`);
    if (it.requiresSkill && !skillIds.has(it.requiresSkill)) {
      errors.push(`Item "${it.id}" requires unknown skill "${it.requiresSkill}".`);
    }
  }

  // --- Lethal-resource rule (§M2.4 / §M5.2) ---
  const lethalCount = schema.resources.filter((r) => r.lethal).length;
  if (lethalCount !== 1) {
    errors.push(
      `Exactly one resource must be marked lethal when statMode is "${schema.statMode}"; found ${lethalCount}.`
    );
  }

  // --- Starting state references ---
  for (const attributeId of Object.keys(schema.startingState.attributes)) {
    if (!attributeIds.has(attributeId)) {
      errors.push(`Starting state sets unknown attribute "${attributeId}".`);
    }
  }
  for (const rid of Object.keys(schema.startingState.resources)) {
    if (!resourceIds.has(rid)) errors.push(`Starting state sets unknown resource "${rid}".`);
  }
  for (const { skillId } of schema.startingState.skills) {
    if (!skillIds.has(skillId)) errors.push(`Starting state grants unknown skill "${skillId}".`);
  }
  for (const { itemId } of schema.startingState.inventory) {
    if (!itemIds.has(itemId)) errors.push(`Starting state grants unknown item "${itemId}".`);
  }

  // --- NPC template references ---
  for (const t of schema.npcTemplates) {
    for (const attributeId of Object.keys(t.attributes)) {
      if (!attributeIds.has(attributeId)) {
        errors.push(`NPC template "${t.templateId}" uses unknown attribute "${attributeId}".`);
      }
    }
    for (const rid of Object.keys(t.resources)) {
      if (!resourceIds.has(rid))
        errors.push(`NPC template "${t.templateId}" uses unknown resource "${rid}".`);
    }
    for (const { skillId } of t.skills) {
      if (!skillIds.has(skillId))
        errors.push(`NPC template "${t.templateId}" grants unknown skill "${skillId}".`);
    }
    for (const { itemId } of t.inventory) {
      if (!itemIds.has(itemId))
        errors.push(`NPC template "${t.templateId}" grants unknown item "${itemId}".`);
    }
  }

  return errors;
}
