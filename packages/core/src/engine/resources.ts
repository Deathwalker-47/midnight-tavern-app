/**
 * Resource roles (plan 08 §2) — how the engine finds a story's health, mana and stamina pools.
 *
 * v3 rulebooks declare `role` on every resource. Older rulebooks never did, so roles are inferred
 * deterministically from lethality and conventional names. Inference is deliberately conservative:
 * a pool that counts UP (Solo Leveling's `fatigue`) stays `other` rather than being silently
 * treated as stamina, which would invert a live economy.
 *
 * Pure: reads the frozen schema only.
 */
import {
  CORE_RESOURCE_ROLES,
  type ResourceDef,
  type ResourceRole,
  type StorySchema,
} from "../types/index.js";

const INVERTED_POOLS = /\b(fatigue|strain|stress|exhaustion|corruption|heat|wanted)\b/;
const NAME_RULES: ReadonlyArray<readonly [Exclude<ResourceRole, "other">, RegExp]> = [
  ["health", /\b(hp|health|life|vitality|hit points?)\b/],
  ["mana", /\b(mana|mp|aether|ether|essence|arcana|magic|chakra|qi|ki)\b/],
  ["stamina", /\b(stamina|sp|grit|vigou?r|endurance|energy)\b/],
  ["currency", /\b(coins?|gold|silver|copper|wealth|money|credits?|cash|currency|crowns|marks)\b/],
  ["experience", /\b(xp|exp|experience)\b/],
];

function words(def: ResourceDef): string {
  return `${def.id} ${def.label}`.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ");
}

/** The role a single resource carries in isolation (explicit role, lethality, then name). */
export function inferResourceRole(def: ResourceDef): ResourceRole {
  if (def.role) return def.role;
  if (def.lethal) return "health";
  const text = words(def);
  if (INVERTED_POOLS.test(text)) return "other";
  return NAME_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

/**
 * Role per resource id across a whole rulebook. Explicit roles are taken verbatim; inferred core
 * roles (health/mana/stamina) are assigned at most once each, first resource wins, so a legacy
 * rulebook with both `mana` and `essence` never ends up with two mana pools.
 */
export function resourceRoles(schema: Pick<StorySchema, "resources">): Map<string, ResourceRole> {
  const roles = new Map<string, ResourceRole>();
  const claimed = new Set<ResourceRole>(
    schema.resources.flatMap((def) => (def.role ? [def.role] : []))
  );
  const core = new Set<ResourceRole>(CORE_RESOURCE_ROLES);
  for (const def of schema.resources) {
    if (def.role) {
      roles.set(def.id, def.role);
      continue;
    }
    const inferred = inferResourceRole(def);
    if (core.has(inferred) && claimed.has(inferred)) {
      roles.set(def.id, "other");
      continue;
    }
    claimed.add(inferred);
    roles.set(def.id, inferred);
  }
  return roles;
}

/** The resource id carrying `role`, if the rulebook has one. */
export function resourceIdForRole(
  schema: Pick<StorySchema, "resources">,
  role: ResourceRole
): string | undefined {
  for (const [id, assigned] of resourceRoles(schema)) {
    if (assigned === role) return id;
  }
  return undefined;
}
